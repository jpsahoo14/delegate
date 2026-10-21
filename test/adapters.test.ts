import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TeamsSource } from '../src/adapters/source-teams.ts'
import type { McpClient } from '../src/adapters/mcp-client.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-lock-'))
const { withTickLock } = await import('../src/store/state.ts')

test('R-ING-06 paging back to the cursor returns every newer message, oldest first', async () => {
	const all = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), createdDateTime: '', from: { id: 'x', displayName: 'X' }, body: { contentType: 'text', content: `m${i + 1}` } })).reverse()
	const fake = { call: async (_: string, a: { nextLink?: string }) => {
		const start = a.nextLink ? Number(a.nextLink) : 0
		return { messages: all.slice(start, start + 20), nextLink: start + 20 < all.length ? String(start + 20) : undefined }
	}, close: async () => {} } as unknown as McpClient
	const src = new TeamsSource({ command: [], selfChatId: 'self' }, fake)
	const r = await src.newMessages('c', '1')
	assert.equal(r.msgs.length, 99); assert.equal(r.msgs[0].id, '2'); assert.equal(r.newest, '100'); assert.equal(r.truncated, false)
})

test('tick lock lets only one tick in at a time', async () => {
	const inner = await withTickLock(async () => withTickLock(async () => 'second'))
	assert.equal(inner, 'locked')
	assert.equal(await withTickLock(async () => 'again'), 'again')
})

test('R-PKG-07 a config saved by Windows tools with a byte-order mark still loads', async () => {
	const { writeFileSync } = await import('node:fs')
	const { readJson } = await import('../src/store/fs.ts')
	const f = join(mkdtempSync(join(tmpdir(), 'bom-')), 'config.json')
	writeFileSync(f, '\uFEFF{"schema":1}')
	assert.deepEqual(readJson(f, null), { schema: 1 })
})

test('child agent runs never inherit the parent agent session', async () => {
	const { cleanEnv } = await import('../src/adapters/agent.ts')
	const { useSite } = await import('../src/core/site.ts')
	useSite({ processNames: ['corpcli'] })
	const env = cleanEnv({ PATH: '/bin', COPILOT_HOME: '/h', COPILOT_AGENT_SESSION_ID: 's1', CORPCLI_SESSION_ID: 's2', CLAUDECODE: '1', COPILOT_CLI: '1' })
	assert.deepEqual(env, { PATH: '/bin', COPILOT_HOME: '/h' })
	useSite(undefined)
})

test('review P1-6 a lock left by a dead process is taken over at once', async () => {
	const { writeFileSync } = await import('node:fs')
	const { join } = await import('node:path')
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'tick.lock'), `999999 ${Date.now()} x`)
	assert.equal(await withTickLock(async () => 'ran'), 'ran')
})

test('after a restart, a tick lock whose process ID is in use again is taken over', async () => {
	const { writeFileSync } = await import('node:fs')
	const { join } = await import('node:path')
	// Power was lost mid-tick; after the restart this test's own (live) process ID stands in for an unrelated program.
	const boot = Date.now() - 1000
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'tick.lock'), `${process.pid} ${boot - 5000} x`)
	assert.equal(await withTickLock(async () => 'ran', boot), 'ran')
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'tick.lock'), `${process.pid} ${Date.now()} x`)
	assert.equal(await withTickLock(async () => 'ran', boot), 'locked', 'a live tick since the restart still holds it')
})

test('R-ING-11 R-SEC-08 R-POL-12 Teams messages carry attachments; members say if a chat has guests; presence carries the out-of-office text', async () => {
	const calls: { tool: string; args: Record<string, unknown> }[] = []
	const fake = { call: async (tool: string, args: Record<string, unknown>) => {
		calls.push({ tool, args })
		if (tool === 'ListChatMessages') return { messages: [{ id: '2', createdDateTime: '', from: { id: 'x', displayName: 'X' }, body: { contentType: 'html', content: 'see <attachment id="a"></attachment>' }, attachments: [{ name: 'spec.docx', contentType: 'reference', contentUrl: 'https://s/spec.docx' }, { contentType: 'messageReference' }] }] }
		if (tool === 'ListChannelMembers') return { members: [{ roles: ['owner'], userId: 'me', displayName: 'Robin Lee' }] }
		if (tool === 'ListChatMembers') return { members: [{ roles: ['owner'], userId: 'me' }, { roles: ['guest'], userId: 'x', displayName: 'Kim Ito' }] }
		return { availability: 'Away', outOfOfficeSettings: { isOutOfOffice: true, message: '<p>Out until Oct 24.</p>' } }
	}, close: async () => {} } as unknown as McpClient
	const src = new TeamsSource({ command: [], selfChatId: 'self' }, fake)
	const r = await src.newMessages('c', '1')
	assert.deepEqual(r.msgs[0].attachments, [{ name: 'spec.docx', type: 'reference', url: 'https://s/spec.docx' }])
	assert.equal(calls[0].args.include, 'attachments')
	assert.deepEqual(await src.members('c'), { guests: true, ids: ['me', 'x'], names: { x: 'Kim Ito' } }, 'and who is in it, by name, for need to know')
	assert.deepEqual(await src.members('ch|team1|chan1|root1'), { guests: false, ids: ['me'], names: { me: 'Robin Lee' } }, 'a channel thread asks the channel')
	assert.deepEqual(calls.at(-1)?.args, { teamId: 'team1', channelId: 'chan1' })
	assert.deepEqual(await src.presence(), { availability: 'Away', oof: 'Out until Oct 24.' })
})

test('history search asks Teams with the owner filter and a day cut-off, then drops anything at or after the exact cut-off', async () => {
	const { TeamsHistory } = await import('../src/adapters/history.ts')
	let kql = ''
	const hit = (at: string, who: string) => ({ summary: `<b>said</b>  at ${at}`, resource: { createdDateTime: at, webLink: `https://teams.microsoft.com/l/message/19%3ax/1?context=%7B%7D`, from: { emailAddress: { name: who } } } })
	const fake = { call: async (_: string, a: { queryString: string }) => { kql = a.queryString; return { rawResponse: JSON.stringify({ value: [{ hitsContainers: [{ hits: [hit('2026-10-07T13:00:00Z', 'Robin Park'), hit('2026-10-07T13:41:00Z', 'Robin Park'), hit('2026-10-06T09:00:00Z', 'Ana')] }] }] }) } }, close: async () => {} } as unknown as McpClient
	const h = new TeamsHistory({ owner: { id: 'me', name: 'Robin Park' }, source: { command: [] } } as never, fake)
	const r = await h.search('shared "mailbox" AND owner', { mine: true, before: '2026-10-07T13:41:00Z' })
	assert.equal(kql, 'from:"Robin Park" AND shared mailbox owner AND sent<=2026-10-07')
	assert.deepEqual(r.map(x => [x.at, x.mine, x.text, x.link]), [['2026-10-07T13:00:00Z', true, 'said at 2026-10-07T13:00:00Z', 'https://teams.microsoft.com/l/message/19%3ax/1'], ['2026-10-06T09:00:00Z', false, 'said at 2026-10-06T09:00:00Z', 'https://teams.microsoft.com/l/message/19%3ax/1']])
})

test('Q2 channel threads: found from the owner\'s posts and mentions, a reply resolves to its thread, the thread reads like a chat, and replies go to the thread', async () => {
	const { threadId } = await import('../src/adapters/channels.ts')
	const { emptyThreadCache } = await import('../src/adapters/channels.ts')
	const calls: [string, Record<string, unknown>][] = []
	const msg = (id: string, who: string, body: string, at: string) => ({ id, createdDateTime: at, from: { id: who, displayName: who }, body: { contentType: 'text', content: body } })
	const hit = (id: string, who: string, at: string) => ({ resource: { id, createdDateTime: at, chatId: '19:ch@thread.tacv2', channelIdentity: { teamId: 'T', channelId: '19:ch@thread.tacv2' }, from: { emailAddress: { name: who } } } })
	const now = new Date().toISOString().slice(0, 10)
	const fake = { call: async (tool: string, a: Record<string, unknown>) => {
		calls.push([tool, a])
		if (tool === 'SearchTeamMessagesQueryParameters') return { rawResponse: JSON.stringify({ value: [{ hitsContainers: [{ hits: String(a.queryString).startsWith('from:') ? [hit('100', 'Robin Park', `${now}T01:00:00Z`), hit('205', 'Robin Park', `${now}T02:00:00Z`)] : [hit('300', 'Ana', `${now}T03:00:00Z`)] }] }] }) }
		if (tool === 'ListChannelMessageReplies') {
			if (a.messageId === '100') return { replies: [msg('101', 'Ravi', 'Looks good', `${now}T01:30:00Z`)] }
			if (a.messageId === '200') return { replies: [msg('205', 'Robin Park', 'I can take it', `${now}T02:00:00Z`)] }
			throw new Error('404 not a thread start')
		}
		if (tool === 'ListChannelMessages') return { messages: [msg('200', 'Pete', 'Who owns the rollout?', `${now}T00:30:00Z`), msg('100', 'Robin Park', 'Can someone review PR 7?', `${now}T01:00:00Z`)] }
		if (tool === 'GetChannel') return { displayName: 'Pull Request Reviews' }
		if (tool === 'ReplyToChannelMessage') return { id: '999' }
		return {}
	}, close: async () => {} } as unknown as McpClient
	const src = new TeamsSource({ command: [], selfChatId: 'self' }, fake, 'Robin Park')
	const { list, cache } = await src.channelThreads(emptyThreadCache(), new Date(Date.now() - 7 * 86_400_000).toISOString())
	assert.deepEqual(list.map(t => [t.id, t.name, t.mine]).sort(), [[threadId('T', '19:ch@thread.tacv2', '100'), 'Pull Request Reviews (thread)', true], [threadId('T', '19:ch@thread.tacv2', '200'), 'Pull Request Reviews (thread)', false]])
	assert.equal(cache.roots['19:ch@thread.tacv2/300'], '', 'a hit in no recent thread is skipped')
	const before = calls.filter(c => c[0] === 'SearchTeamMessagesQueryParameters').length
	await src.channelThreads(cache, new Date().toISOString())
	assert.equal(calls.filter(c => c[0] === 'SearchTeamMessagesQueryParameters').length, before, 'search runs at most every 30 minutes')
	const t = threadId('T', '19:ch@thread.tacv2', '100')
	const r = await src.newMessages(t, '100')
	assert.deepEqual(r.msgs.map(m => [m.id, m.from?.name, m.body]), [['101', 'Ravi', 'Looks good']])
	assert.deepEqual(await src.send(t, 'Thanks!'), { msgId: '999' })
	assert.deepEqual(calls.at(-1), ['ReplyToChannelMessage', { teamId: 'T', channelId: '19:ch@thread.tacv2', messageId: '100', content: 'Thanks!', contentType: 'html' }])
	await assert.rejects(() => src.deleteMessage(t, '999'), /cannot change channel messages/)
})

test('Q2 channel links parse; a named channel is scanned for threads the owner started, posted in, or was mentioned in', async () => {
	const { parseChannelLink, emptyThreadCache, threadId } = await import('../src/adapters/channels.ts')
	assert.deepEqual(parseChannelLink('https://teams.microsoft.com/l/channel/19%3Aabc%40thread.tacv2/Pull%20Request%20Reviews?groupId=T1&tenantId=x'), { teamId: 'T1', channelId: '19:abc@thread.tacv2', name: 'Pull Request Reviews' })
	assert.deepEqual(parseChannelLink('https://teams.microsoft.com/l/message/19:f51@thread.skype/1792140548932?tenantId=x&groupId=T2&parentMessageId=1792140548932&channelName=Pull%20Request%20Reviews'), { teamId: 'T2', channelId: '19:f51@thread.skype', name: 'Pull Request Reviews' })
	assert.equal(parseChannelLink('https://teams.microsoft.com/l/message/19:abc@thread.v2/1'), undefined)
	const now = new Date().toISOString()
	const m = (id: string, who: string, body: string) => ({ id, createdDateTime: now, lastModifiedDateTime: now, from: { id: who, displayName: who }, body: { contentType: 'html', content: body } })
	const fake = { call: async (tool: string, a: Record<string, unknown>) => {
		if (tool === 'SearchTeamMessagesQueryParameters') return { rawResponse: '{"value":[{"hitsContainers":[{"hits":[]}]}]}' }
		if (tool === 'ListChannelMessages') return { messages: [m('1', 'Robin Park', 'Can someone review PR 7?'), m('2', 'Pete', '<at id="0">Robin</at> can you look?'), m('3', 'Ana', 'Release notes are out'), m('4', 'Sam', 'Standup moved')] }
		if (tool === 'ListChannelMessageReplies') return { replies: a.messageId === '3' ? [m('31', 'Robin Park', 'Thanks Ana')] : [] }
		return {}
	}, close: async () => {} } as unknown as McpClient
	const src = new TeamsSource({ command: [], selfChatId: 'self' }, fake, 'Robin Park')
	const { list } = await src.channelThreads(emptyThreadCache(), new Date(Date.now() - 86_400_000).toISOString(), [{ teamId: 'T', channelId: '19:c@thread.tacv2', name: 'Eng' }])
	assert.deepEqual(list.map(t => [t.id, t.mine]).sort(), [[threadId('T', '19:c@thread.tacv2', '1'), true], [threadId('T', '19:c@thread.tacv2', '2'), false], [threadId('T', '19:c@thread.tacv2', '3'), false]])
})

test('adapters: the source kind picks the adapter; demo has no history; an unknown kind names the known ones', async () => {
	const { kindOf, sourceFor, historyFor } = await import('../src/adapters/registry.ts')
	assert.deepEqual([kindOf({ command: ['corpcli', 'mcp', 'teams'], selfChatId: 's' }), kindOf({ command: ['demo'], selfChatId: 's' }), kindOf({ kind: 'slack', command: ['x'], selfChatId: 's' })], ['teams', 'demo', 'slack'])
	assert.equal(sourceFor({ command: ['demo'], selfChatId: 'self' }, 'You', '/tmp/x').selfChatId, 'self')
	assert.equal(historyFor({ source: { command: ['demo'], selfChatId: 'self' } } as never), undefined)
	assert.throws(() => sourceFor({ kind: 'slack', command: ['x'], selfChatId: 's' }, '', '/tmp'), /No adapter for source "slack"\. Known: teams, demo\./)
})

test('review p2-7 R13 R14: a fresh reply on an older thread start is found; a thread longer than the read cap reports a gap', async () => {
	const { emptyThreadCache, threadId } = await import('../src/adapters/channels.ts')
	const now = new Date().toISOString(), old = new Date(Date.now() - 20 * 86_400_000).toISOString()
	const m = (id: string, who: string, body: string, at = now) => ({ id, createdDateTime: at, lastModifiedDateTime: at, from: { id: who, displayName: who }, body: { contentType: 'html', content: body } })
	const long = Array.from({ length: 1100 }, (_, i) => m(String(1000 + i), 'Ana', `reply ${i}`))
	const fake = { call: async (tool: string, a: Record<string, unknown>) => {
		if (tool === 'SearchTeamMessagesQueryParameters') return { rawResponse: '{"value":[{"hitsContainers":[{"hits":[]}]}]}' }
		if (tool === 'ListChannelMessages') return { messages: [m('5', 'Pete', 'Old design thread', old), m('9', 'Ana', 'Long one', old)] }
		if (tool === 'ListChannelMessageReplies') {
			if (a.messageId === '5') return { replies: [m('51', 'Pete', '<at id="0">Robin</at> any update?')] }
			const from = Number(a.nextLink ?? 0)
			return { replies: long.slice(from, from + 50), nextLink: from + 50 < long.length ? String(from + 50) : undefined }
		}
		return {}
	}, close: async () => {} } as unknown as McpClient
	const src = new TeamsSource({ command: [], selfChatId: 'self' }, fake, 'Robin Park')
	const { list } = await src.channelThreads(emptyThreadCache(), new Date(Date.now() - 86_400_000).toISOString(), [{ teamId: 'T', channelId: '19:c@thread.tacv2', name: 'Eng' }])
	assert.deepEqual(list.map(t => t.id), [threadId('T', '19:c@thread.tacv2', '5')], 'the start is 20 days old; the mention is today')
	const r = await src.newMessages(threadId('T', '19:c@thread.tacv2', '9'), '1')
	assert.equal(r.truncated, true, 'more replies than one read takes are reported, not hidden')
})

test('docs: a shared Word document is found by name and read in full, newest version first; a miss says so', async () => {
	const { deflateRawSync } = await import('node:zlib')
	const { SharePointDocs, docxText } = await import('../src/adapters/docs.ts')
	const zip = (files: Record<string, string>) => {
		const locals: Buffer[] = [], central: Buffer[] = []
		let offset = 0
		for (const [name, body] of Object.entries(files)) {
			const data = deflateRawSync(Buffer.from(body)), n = Buffer.from(name)
			const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(data.length, 18); h.writeUInt16LE(n.length, 26)
			const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
			locals.push(h, n, data); central.push(c, n); offset += 30 + n.length + data.length
		}
		const cd = Buffer.concat(central), e = Buffer.alloc(22)
		e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(offset, 16)
		return Buffer.concat([...locals, cd, e])
	}
	const docx = zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Free Text &amp; Rooms</w:t></w:r></w:p><w:p><w:r><w:t>1.</w:t><w:tab/><w:t>Reuse the field</w:t></w:r></w:p></w:body></w:document>' })
	assert.equal(docxText(docx), 'Free Text & Rooms\n1.\tReuse the field')
	const calls: string[] = []
	const fake = {
		call: async (tool: string, a: Record<string, unknown>) => { calls.push(`${tool}:${a.searchQuery}`); return a.searchQuery === 'spec' ? { value: [
			{ id: 'old', name: 'spec.docx', lastModifiedDateTime: '2026-10-13T00:00:00Z', parentReference: { driveId: 'D' } },
			{ id: 'new', name: 'spec.docx', lastModifiedDateTime: '2026-10-15T00:00:00Z', lastModifiedBy: { user: { displayName: 'Dana' } }, parentReference: { driveId: 'D' } },
			{ id: 'pdf', name: 'spec.pdf', lastModifiedDateTime: '2026-10-16T00:00:00Z', parentReference: { driveId: 'D' } }] } : { value: [] } },
		texts: async (_: string, a: Record<string, unknown>) => (a.fileId === 'new' ? [docx.toString('base64'), 'note'] : ['']),
		close: async () => {},
	} as unknown as McpClient
	const d = new SharePointDocs([], fake)
	assert.deepEqual(await d.read('spec.docx'), { name: 'spec.docx', modified: '2026-10-15T00:00:00Z', by: 'Dana', text: 'Free Text & Rooms\n1.\tReuse the field' })
	assert.equal(await d.read('nothing'), 'No Word document matches "nothing". Try the exact file name.')
})

test('images: a pasted image keeps its link in the text; only Teams-hosted images open, through your image tool server', async () => {
	const { htmlToText } = await import('../src/core/intake.ts')
	const { HostedImages, hostedPath } = await import('../src/adapters/media.ts')
	const link = 'https://graph.microsoft.com/v1.0/chats/19:a@thread.v2/messages/17/hostedContents/aWQ9eA==/$value'
	assert.equal(htmlToText(`<p>broken <img src="${link}" alt="image"> and <img src="https://evil.example/x.png" alt="x"></p>`), `broken [image: image ${link}] and [image: x]`)
	assert.equal(hostedPath(link), '/chats/19:a@thread.v2/messages/17/hostedContents/aWQ9eA==/$value')
	for (const bad of ['https://graph.microsoft.com/v1.0/me/drive/root/content', 'https://evil.example/v1.0/chats/a/hostedContents/b/$value', `${link}?x=1`]) assert.equal(hostedPath(bad), undefined, bad)
	const paths: string[] = []
	const fake = { call: async (_: string, a: Record<string, unknown>) => { paths.push(String(a.path)); return { base64Content: 'iVBORw0K', contentType: 'image/png', statusCode: 200 } }, close: async () => {} } as unknown as McpClient
	const m = new HostedImages([], 'fetch_blob', fake)
	assert.deepEqual(await m.read(link), { data: 'iVBORw0K', type: 'image/png' })
	assert.equal(await m.read('https://graph.microsoft.com/v1.0/me/drive/root/content'), 'Only images pasted into a Teams message can be opened.')
	assert.deepEqual(paths, ['/chats/19:a@thread.v2/messages/17/hostedContents/aWQ9eA==/$value'], 'a link outside a message never reaches your image tool server')
})

test('B3 history lists every conversation the owner wrote in, week by week and page by page, with each channel\'s team', async () => {
	const { TeamsHistory } = await import('../src/adapters/history.ts')
	const calls: { q: string; from: number }[] = []
	const hit = (chatId: string, at: string, team?: string) => ({ resource: { chatId, createdDateTime: at, ...(team ? { channelIdentity: { teamId: team, channelId: chatId } } : {}) } })
	const fake = { call: async (_: string, a: Record<string, unknown>) => {
		const q = String(a.queryString), from = Number(a.from)
		calls.push({ q, from })
		const first = q.includes('sent>=2026-10-13')
		const hits = first ? (from === 0 ? [hit('19:a@thread.v2', '2026-10-15T10:00:00Z'), hit('19:a@thread.v2', '2026-10-16T10:00:00Z')] : [hit('19:c@thread.tacv2', '2026-10-14T10:00:00Z', 'T1')]) : q.includes('sent>=2026-10-06') ? [hit('19:b@unq.gbl.spaces', '2026-10-08T10:00:00Z')] : []
		return { rawResponse: JSON.stringify({ value: [{ hitsContainers: [{ hits, moreResultsAvailable: first && from === 0 }] }] }) }
	}, close: async () => {} } as unknown as McpClient
	const h = new TeamsHistory({ owner: { id: 'o', name: 'Robin Park' }, source: { command: [], selfChatId: 's' } } as never, fake)
	const cs = await h.conversations('2026-10-05', new Date('2026-10-19T12:00:00Z'))
	assert.deepEqual(cs, [
		{ id: '19:a@thread.v2', mine: 2, lastAt: '2026-10-16T10:00:00Z' },
		{ id: '19:c@thread.tacv2', team: 'T1', mine: 1, lastAt: '2026-10-14T10:00:00Z' },
		{ id: '19:b@unq.gbl.spaces', mine: 1, lastAt: '2026-10-08T10:00:00Z' },
	])
	assert.deepEqual(calls.map(c => [c.q, c.from]), [
		['from:"Robin Park" AND sent>=2026-10-13 AND sent<=2026-10-19', 0], ['from:"Robin Park" AND sent>=2026-10-13 AND sent<=2026-10-19', 25],
		['from:"Robin Park" AND sent>=2026-10-06 AND sent<=2026-10-12', 0],
		['from:"Robin Park" AND sent>=2026-10-05 AND sent<=2026-10-05', 0],
	])
})
test('after a restart, a tick lock whose process ID is in use again is taken over', async () => {
	const { writeFileSync } = await import('node:fs')
	const { join } = await import('node:path')
	// Power was lost mid-tick; after the restart this test's own (live) process ID stands in for an unrelated program.
	const boot = Date.now() - 1000
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'tick.lock'), `${process.pid} ${boot - 5000} x`)
	assert.equal(await withTickLock(async () => 'ran', boot), 'ran')
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'tick.lock'), `${process.pid} ${Date.now()} x`)
	assert.equal(await withTickLock(async () => 'ran', boot), 'locked', 'a live tick since the restart still holds it')
})

test('dogfood: a group-chat reply quotes the message it answers and tags the person written as @Name; a 1:1 send is unchanged', async () => {
	const sent: Record<string, unknown>[] = []
	const fake = { call: async (_: string, a: Record<string, unknown>) => { sent.push(a); return { id: '9' } }, close: async () => {} } as unknown as McpClient
	const src = new TeamsSource({ command: [], selfChatId: 'self' }, fake, 'Robin Park')
	await src.send('19:g@thread.v2', '@Mira rechecked the latest revision; two comments left.', { replyTo: { name: 'Mira Shah', text: 'Need one more review for this PR: Pull Request 4200001 <Block> owner edits' }, mentions: [{ id: 'aad-1', name: 'Mira Shah' }, { id: 'aad-2', name: 'Dana Lee' }] })
	assert.equal(sent[0].content, '<blockquote><b>Mira Shah</b>: Need one more review for this PR: Pull Request 4200001 &lt;Block&gt; owner edits</blockquote>@Mira rechecked the latest revision; two comments left.')
	assert.deepEqual(JSON.parse(String(sent[0].mentions)), [{ displayName: 'Mira', id: 'aad-1', type: 'user' }], 'only people written as @Name are tagged')
	await src.send('19:g@thread.v2', '@Christian can you check?', { mentions: [{ id: 'aad-3', name: 'Chris Wu' }, { id: 'aad-4', name: 'Christian Munden' }] })
	assert.deepEqual(JSON.parse(String(sent[1].mentions)), [{ displayName: 'Christian', id: 'aad-4', type: 'user' }], 'review 10-20: @Christian does not tag Chris')
	sent.splice(1)
	await src.send('19:x_y@unq.gbl.spaces', 'Sure.')
	assert.deepEqual([sent[1].content, 'mentions' in sent[1]], ['Sure.', false])
})

const CLAUDE = { flavor: 'claude' as const, command: ['claude'], tools: ['view', 'glob', 'grep', 'teams-ListChatMessages'] }
const WORKER = { sessionId: '550e8400-e29b-41d4-a716-446655440000', prompt: 'p', cwd: '/w', mcpConfigPath: '/w/mcp-1.json', extraTools: ['delegate_worker-submit_report'], dirs: ['/k'] }
const flag = (argv: string[], name: string) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined

test('bug 10-20 claude tools: a Claude worker can use only the listed tools and the worker MCP config, never the owner\'s own servers', async () => {
	const { buildArgs } = await import('../src/adapters/agent.ts')
	const argv = buildArgs(CLAUDE, WORKER, () => false)
	assert.ok(argv.includes('--strict-mcp-config'), 'other MCP configs are ignored')
	assert.equal(flag(argv, '--mcp-config'), '/w/mcp-1.json')
	assert.equal(flag(argv, '--tools'), 'Read,Glob,Grep', 'only the listed built-in tools exist')
	assert.equal(flag(argv, '--allowedTools'), 'Read,Glob,Grep,mcp__teams__ListChatMessages,mcp__delegate_worker__submit_report')
	assert.equal(flag(argv, '--permission-mode'), 'dontAsk', 'any tool not listed is denied, whatever the owner\'s own mode')
	assert.ok(!argv.includes('--dangerously-skip-permissions'))
	assert.equal(flag(argv, '--add-dir'), '/k')
	assert.throws(() => buildArgs({ ...CLAUDE, tools: ['shell'] }, WORKER, () => false), /shell/, 'a tool with no known Claude name stops the run instead of being dropped or passed through')
})

test('bug 10-20 claude resume: a Claude worker resumes a session that exists and starts a new one under its ID', async () => {
	const { buildArgs } = await import('../src/adapters/agent.ts')
	const fresh = buildArgs(CLAUDE, WORKER, () => false)
	assert.equal(flag(fresh, '--session-id'), WORKER.sessionId); assert.ok(!fresh.includes('--resume'))
	const again = buildArgs(CLAUDE, WORKER, id => id === WORKER.sessionId)
	assert.equal(flag(again, '--resume'), WORKER.sessionId); assert.ok(!again.includes('--session-id'))
})

test('bug 10-20 claude resume: a session exists when Claude keeps its transcript under any project folder', async () => {
	const { mkdirSync, writeFileSync } = await import('node:fs')
	const { claudeSessionExists } = await import('../src/adapters/agent.ts')
	const home = mkdtempSync(join(tmpdir(), 'claude-home-'))
	mkdirSync(join(home, 'projects', '-w'), { recursive: true })
	writeFileSync(join(home, 'projects', '-w', `${WORKER.sessionId}.jsonl`), '{}\n')
	assert.equal(claudeSessionExists(WORKER.sessionId, home), true)
	assert.equal(claudeSessionExists('11111111-1111-1111-1111-111111111111', home), false)
	assert.equal(claudeSessionExists(WORKER.sessionId, join(home, 'missing')), false)
})

test('the Copilot worker arguments are unchanged by the Claude fix', async () => {
	const { buildArgs } = await import('../src/adapters/agent.ts')
	assert.deepEqual(buildArgs({ flavor: 'copilot', command: ['copilot'], tools: ['view'] }, WORKER), ['-p', 'p', '--session-id', WORKER.sessionId, '--allow-all-tools', '--no-ask-user',
		'--additional-mcp-config', '@/w/mcp-1.json', '--add-dir', '/k', '--available-tools', 'view', 'delegate_worker-submit_report', 'task_complete', '--output-format', 'json'])
})

test('bug 10-20 spawn: a reply run whose AI CLI does not exist ends with an error instead of crashing the tick', async () => {
	const { runAgent } = await import('../src/adapters/agent.ts')
	const cwd = mkdtempSync(join(tmpdir(), 'spawn-'))
	const res = await runAgent({ flavor: 'copilot', command: ['delegate-no-such-cli-10-20'], tools: [] }, { ...WORKER, cwd, dirs: [] }, 5_000)
	assert.notEqual(res.exitCode, 0)
	assert.match(res.error ?? '', /ENOENT|not found|delegate-no-such-cli-10-20/)
})

test('bug 10-20 spawn: a reply run that times out is stopped with every process it started', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
	const { readFileSync } = await import('node:fs')
	const { runAgent } = await import('../src/adapters/agent.ts')
	const cwd = mkdtempSync(join(tmpdir(), 'tree-'))
	const pidFile = join(cwd, 'child.pid')
	const script = `sleep 30 >/dev/null 2>&1 & echo $! > '${pidFile}'; wait`
	const res = await runAgent({ flavor: 'copilot', command: ['sh', '-c', script], tools: [] }, { ...WORKER, cwd, dirs: [] }, 1500)
	const child = Number(readFileSync(pidFile, 'utf8'))
	const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
	// Under a loaded suite the stopped child can take a moment to be reaped.
	for (let i = 0; i < 40 && alive(child); i++) await new Promise(r => setTimeout(r, 50))
	try {
		assert.notEqual(res.exitCode, 0)
		assert.match(res.error ?? '', /timed out/)
		assert.equal(alive(child), false, 'the run\'s own child is stopped too')
	} finally { if (alive(child)) process.kill(child, 'SIGKILL') }
})
