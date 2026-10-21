import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-wlocal-'))
const { Store } = await import('../src/store/state.ts')
const { serveInbox, writeSnapshot } = await import('../src/web/server.ts')
process.env.DELEGATE_NO_KICK = '1'

const now = new Date().toISOString()
function setup() {
	const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-wroot-')), machine: 'mac' })
	store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 1, nudgeEveryMin: 30 })
	store.save({ schema: 1, id: 'w1', code: 'A1', kind: 'reply', state: 'needs_human', key: { type: 'thread', id: 'c' }, chat: { id: '19:c@thread.v2', name: 'Test Meeting', test: true }, asker: { id: 'v', name: 'Vikram' }, session: { agent: 'copilot', id: 's' }, lastMsgId: '42', pending: [], msgIds: ['42'], lastAsk: 'Review PR 1?', status: 'Ready: 1 finding', draft: { text: 'Left <1> comment.', commitment: false, sources: [{ ref: 'https://dev.azure.com/x/pullrequest/1', tier: 'live', origin: 'extracted' }] }, effects: [{ system: 'ado', action: 'comment', target: 'PR 1', summary: 'Null check', call: { tool: 'ado-comment', args: { pullRequestId: 1, content: 'Null check' } } }], job: 'j', newCount: 0, createdAt: now, updatedAt: now })
	return store
}

test('R-HIL-09 the page carries the view as escaped data, under a strict CSP, and draws itself from app.js', async () => {
	const store = setup()
	const { url, server } = await serveInbox(() => store)
	try {
		const r = await fetch(url)
		assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
		const html = await r.text()
		assert.match(html, /window\.DELEGATE=\{"mode":"page","view":\{/)
		assert.match(html, /"draft":\{"text":"Left \\u003c1> comment\."/, 'the draft travels as data, and "<" cannot close the script')
		assert.match(html, /<body><div id="app" data-mode="page"><\/div><script>/, 'no server-drawn cards: the client draws them')
		assert.match(html, /window\.DELEGATE_IO=\{/)
	} finally { server.close() }
})

test('R-HIL-09 the page server needs its token, and an action carries the owner\'s words with the revision the card showed', async () => {
	const store = setup()
	const { url, server } = await serveInbox(() => store)
	try {
		const base = url.split('?')[0]
		assert.equal((await fetch(base)).status, 403)
		assert.equal((await fetch(url.replace('/?', '/data?').replace(/t=\w+/, 't=wrong'))).status, 403)
		const v = await (await fetch(url.replace('/?', '/data?'))).json()
		const seenAt = v.needs[0].rev
		const r = await (await fetch(url.replace('/?', '/act?'), { method: 'POST', body: JSON.stringify({ command: 'ok A1', seenAt }) })).json()
		assert.match(r.text, /A1 \(Vikram: "Review PR 1\?"\) will comment on PR 1, then send the draft/)
		const [a] = store.answers().map(x => x.answer)
		assert.deepEqual([a.code, a.verb, a.seenAt, r.ids], ['A1', 'ok', seenAt, [a.id]])
		const o = await (await fetch(url.replace('/?', `/result?ids=${a.id}&code=A1&`))).json()
		assert.deepEqual([o.applied, o.card.code, 'html' in o], [false, 'A1', false])
	} finally { server.close() }
})

test('R-HIL-09 the synced snapshot is read-only, carries the view for the words to type, and is rewritten only on change', () => {
	const store = setup()
	assert.equal(writeSnapshot(store), true)
	assert.equal(writeSnapshot(store), false)
	const html = readFileSync(join(store.root, 'inbox.html'), 'utf8')
	assert.match(html, /window\.DELEGATE=\{"mode":"snapshot"/)
	assert.match(html, /window\.DELEGATE_IO=null;/)
	assert.doesNotMatch(html, /fetch\('\/act/)
	store.save({ ...store.byCode('A1')!, draft: { ...store.byCode('A1')!.draft!, text: 'Changed.' } })
	assert.equal(writeSnapshot(store), true)
})

test('design: each data shape maps to its card type, and the view never shows paths or raw citations', async () => {
	const { view, cardType } = await import('../src/web/view.ts')
	const store = setup()
	const base = store.workflows()[0]
	const shape = (over: Record<string, unknown>) => cardType({ ...base, effects: [], job: undefined, ...over })
	assert.equal(shape({}), 'reply')
	assert.equal(shape({ question: 'Which date?', draft: undefined }), 'question')
	assert.equal(shape({ choices: { prompt: 'A or B?', options: [{ label: 'A' }, { label: 'B' }] } }), 'choice')
	assert.equal(shape({ meeting: { subject: 'API', start: '2026-10-19T15:00:00Z', minutes: 30, attendees: [] }, choices: { prompt: 'x', options: [] } }), 'meeting')
	assert.equal(cardType(base), 'review')
	store.save({ ...base, draft: { ...base.draft!, sources: [{ ref: 'card:banner-fix/decisions#k3', tier: 'card', origin: 'extracted' }, { ref: '/Users/me/notes/secret.md', tier: 'private', origin: 'extracted', label: 'Confidential' }, { ref: 'https://dev.azure.com/x/pullrequest/1', tier: 'live', origin: 'extracted' }] } })
	const v = view(store, undefined)
	assert.deepEqual(v.needs[0].why.sources, [
		{ kind: 'Knowledge', label: 'Your knowledge: banner fix', stale: undefined },
		{ kind: 'Private', label: 'Confidential', locked: true, stale: undefined },
		{ kind: 'In the chat', label: 'dev.azure.com/x/pullrequest/1', href: 'https://dev.azure.com/x/pullrequest/1', stale: undefined },
	])
	assert.doesNotMatch(JSON.stringify(v), /\/Users\/me|card:banner-fix|"id":"w1"/)
	assert.deepEqual([v.needs[0].who.initials, v.needs[0].changes.map(c => c.n)], ['V', [1]])
})

test('B30 Why shows each cited fact in its own words with a link to where it was said, what Delegate searched, and why it held a send', async () => {
	const { view } = await import('../src/web/view.ts')
	const { knowledgeOf, remember } = await import('../src/runner/proposals.ts')
	const store = setup()
	const k = knowledgeOf(store, store.config())
	remember(store, k, 'Owner', { topic: 'Banner fix', type: 'decision', text: 'Ring 3 after one clean week.', link: 'https://teams.microsoft.com/l/message/b/9', audience: 'team' })
	remember(store, k, 'Owner', { topic: 'Budget', type: 'fact', text: 'The Q3 budget is 40k.' })
	const ref = (q: string) => { const h = k.search(q)[0]; return `card:${h.topic}/${h.card}#${h.id}` }
	const base = store.workflows()[0]
	store.save({ ...base, looked: [{ q: 'banner ring', n: 3 }, { tool: 'knowledge', q: 'budget', n: 1 }, { tool: 'read', q: 'banner fix', n: 1 }, { tool: 'read', q: 'plan.docx', n: 0 }], shareHold: 'This draws on a chat Pete and Kim are not in, so it waits for your ok.', draft: { ...base.draft!, sources: [{ ref: ref('ring clean'), tier: 'card', origin: 'extracted' }, { ref: ref('budget 40k'), tier: 'card', origin: 'extracted' }] } })
	const c = view(store, undefined).needs[0]
	assert.deepEqual(c.why.sources, [
		{ kind: 'Knowledge', label: 'Ring 3 after one clean week.', href: 'https://teams.microsoft.com/l/message/b/9', stale: undefined },
		{ kind: 'Private', label: 'The Q3 budget is 40k.', href: undefined, stale: undefined, locked: true },
	])
	assert.deepEqual(c.why.searched, ['Teams: "banner ring" (3 hits)', 'Your knowledge: "budget" (1 hit)', 'Read banner fix', 'Read plan.docx (not found)'])
	const { renderMore } = await import('../src/core/render.ts')
	assert.match(renderMore(store.workflows()[0], [], new Date()), /\nLooked up:\n- Teams: "banner ring" \(3 hits\)\n- Your knowledge: "budget" \(1 hit\)\n- Read banner fix\n- Read plan\.docx \(not found\)\n/, 'the AI chat shows the same')
	assert.deepEqual(c.context?.[0], { label: 'Need to know', text: 'This draws on a chat Pete and Kim are not in, so it waits for your ok.', tone: 'warn' })
})

test('design: home tiles count only what happened since the owner last looked, and hide zeros', async () => {
	const { view } = await import('../src/web/view.ts')
	const store = setup()
	const since = new Date(Date.now() - 3600_000).toISOString(), old = new Date(Date.now() - 7200_000).toISOString(), recent = new Date().toISOString()
	const done = (id: string, code: string, name: string, at: string, byRule?: string, effects: unknown[] = []) => store.save({ ...store.workflows()[0], id, code, state: 'done', intent: 'status_next_step', asker: { id: name, name }, sent: { msgId: id, at, byRule }, effects, job: undefined } as never)
	done('d1', 'A2', 'Priya', recent, 'r1')
	done('d2', 'A3', 'Ravi', recent)
	done('d3', 'A4', 'Ravi', recent, undefined, [{ system: 'ado', action: 'create_task', target: 'Banner', summary: 'Task: fix banner', done: { at: recent } }])
	done('d4', 'A5', 'Old', old)
	for (const w of store.workflows().filter(w => w.id !== 'w1')) store.save({ ...w, updatedAt: w.id === 'd4' ? old : recent }, false)
	const v = view(store, since)
	assert.deepEqual(v.tiles.map(t => [t.key, t.count, t.label, t.sub]), [
		['needs', 1, 'needs you', undefined],
		['replies', 2, 'Replied to 2 people', '2 by you, 1 by your rules'],
		['tasks', 1, 'Created 1 task', undefined],
	])
	assert.deepEqual(v.done.filter(r => r.kind === 'reply').map(r => [r.who.name, r.fresh]), [['Priya', true], ['Ravi', true], ['Ravi', true], ['Old', false]].sort((x, y) => Number(y[1]) - Number(x[1])), 'Done keeps the older reply, marked as not new; the tiles above left it out')
	store.save({ ...store.workflows().find(w => w.id === 'd4')!, updatedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(), sent: { msgId: 'd4', at: new Date(Date.now() - 8 * 86_400_000).toISOString() } }, false)
	assert.ok(!view(store, since).done.some(r => r.who.name === 'Old'), 'older than a week is gone from Done')
	assert.deepEqual(v.done.filter(r => r.kind === 'change').map(r => r.sentence), ['Task: fix banner'])
})

test('design: a reload within 30 minutes keeps "since you were away"; a later visit starts from the last look', () => {
	const store = setup()
	const t0 = new Date('2026-10-18T09:00:00Z')
	mkdirSync(join(store.root, 'state', 'viewed'), { recursive: true })
	writeFileSync(join(store.root, 'state', 'viewed', 'mac.json'), JSON.stringify({ at: '2026-10-17T18:10:00Z' }))
	assert.equal(store.visitSince(t0), '2026-10-17T18:10:00Z')
	writeFileSync(join(store.root, 'state', 'viewed', 'mac.json'), JSON.stringify({ at: '2026-10-18T09:00:00Z' }))
	assert.equal(store.visitSince(new Date('2026-10-18T09:10:00Z')), '2026-10-17T18:10:00Z', 'reload keeps the visit')
	writeFileSync(join(store.root, 'state', 'viewed', 'mac.json'), JSON.stringify({ at: '2026-10-18T09:10:00Z' }))
	assert.equal(store.visitSince(new Date('2026-10-18T12:00:00Z')), '2026-10-18T09:10:00Z', 'a new visit after a break')
})

test('design: reloading a first-ever visit keeps the whole history, not "since a moment ago"', () => {
	const store = setup()
	assert.equal(store.visitSince(new Date('2026-10-18T09:00:00Z')), undefined)
	assert.equal(store.visitSince(new Date('2026-10-18T09:00:05Z')), undefined)
})

test('B13 settings save to the shared config only when valid; profile goes to profile.md; rules and tools say where they change', async () => {
	const { saveSetting, settingsView } = await import('../src/web/settings.ts')
	const store = setup()
	assert.deepEqual(await saveSetting(store, 'aliases', 'JP, R, Robbie'), { ok: true, text: 'Saved names people call you. It applies from the next cycle, on every machine.' })
	assert.deepEqual(store.config().aliases, ['JP', 'Robbie'], 'one-letter names would match too much')
	assert.equal((await saveSetting(store, 'quietHours', '0')).text, 'Give a whole number from 1 to 336.')
	assert.equal((await saveSetting(store, 'summaryAt', '25:00')).ok, false)
	assert.equal((await saveSetting(store, 'summaryAt', 'off')).ok, true)
	assert.equal((await saveSetting(store, 'autoUpdate', 'main')).ok, true); assert.equal(store.config().autoUpdate, 'main')
	assert.equal((await saveSetting(store, 'autoUpdate', 'off')).ok, true); assert.equal(store.config().autoUpdate, false)
	assert.equal(settingsView(store).rows.find(r => r.key === 'updateEvery')?.value, '1440', 'once a day unless changed')
	assert.equal((await saveSetting(store, 'updateEvery', '60')).ok, true); assert.equal(store.config().updateEveryMin, 60)
	assert.equal((await saveSetting(store, 'updateEvery', '5')).ok, false, 'only the listed choices')
	assert.equal((await saveSetting(store, 'updateEvery', '1440')).ok, true); assert.equal(store.config().updateEveryMin, undefined, 'the default is not written')
	assert.equal((await saveSetting(store, 'knowledge', 'no-such-folder')).text, 'Not found on this machine: no-such-folder')
	assert.equal((await saveSetting(store, 'profile', 'I build the Events experience and write short replies.')).ok, true)
	assert.equal(readFileSync(join(store.root, 'profile.md'), 'utf8'), 'I build the Events experience and write short replies.\n')
	assert.equal((await saveSetting(store, 'agent', 'x')).ok, false, 'only the listed settings')
	const v = settingsView(store)
	assert.deepEqual(v.rows.find(r => r.key === 'autoUpdate')?.value, 'off')
	assert.deepEqual(v.fixed.map(f => f.label), ['Tools drafts may read', 'Changes it may propose (each after your ok)', 'Reads your chats from'])
	store.saveConfig({ ...store.config(), agent: { ...store.config().agent, effectTools: ['ado-repo_pull_request_thread_write', 'ado-repo_pull_request_write:vote', 'x-other'] } })
	assert.equal(settingsView(store).fixed[1].value, 'PR comment; PR vote; x-other', 'next action: Settings shows the allowed actions, by what they do')
})

test('dogfood 10-20 Advanced settings: each is checked before it is saved, and lands where the runner reads it', async () => {
	const { saveSetting, settingsView } = await import('../src/web/settings.ts')
	const store = setup()
	const adv = settingsView(store).rows.filter(r => r.advanced).map(r => [r.key, r.value])
	assert.deepEqual(adv, [['pollIdle', '15'], ['maxParallel', '1'], ['retentionDays', '30'], ['model', ''], ['showDetails', 'false']], 'only the technical rows sit under More')
	const by = (sec: string) => settingsView(store).rows.filter(r => r.section === sec).map(r => r.key)
	assert.deepEqual(['learned', 'you', 'replies', 'timing', 'system'].map(by), [['noticeHabits', 'reviewLearning'], ['profile', 'aliases', 'knowledge', 'repos', 'deployTo', 'signature', 'signApproved'], ['delayMin', 'undoMin', 'maxAutoPerChatHour'], ['summaryAt', 'quietHours', 'quiet', 'tz', 'followUpHours'], ['dailyRuns', 'autoUpdate', 'updateEvery', 'pollIdle', 'maxParallel', 'retentionDays', 'model', 'showDetails']], 'grouped by what the owner is doing')
	assert.deepEqual(await Promise.all(['delayMin:121', 'quiet:8-9', 'model:gpt 5; rm', 'retentionDays:3', 'maxParallel:0', 'tz:Mars/Olympus'].map(async x => { const [k] = x.split(':'); return (await saveSetting(store, k, x.slice(k.length + 1))).ok })), [false, false, false, false, false, false])
	for (const [k, v] of [['tz', 'Asia/Kolkata'], ['delayMin', '5'], ['undoMin', '20'], ['quiet', '21:30-07:00'], ['pollIdle', '5'], ['model', 'claude-sonnet-5'], ['retentionDays', '60']]) assert.equal((await saveSetting(store, k, v)).ok, true, k)
	const c = store.config()
	assert.deepEqual([c.policy?.delayMin, c.policy?.undoMin, c.policy?.maxAutoPerChatHour, c.policy?.marker, c.quiet, c.poll?.idleMin, c.poll?.fastMin, c.agent.model, c.retentionDays], [5, 20, 3, "(sent by {first}'s assistant)", { from: '21:30', to: '07:00' }, 5, 1, 'claude-sonnet-5', 60])
	await saveSetting(store, 'model', '')
	assert.equal(store.config().agent.model, undefined, 'empty goes back to the CLI default')
	assert.equal(store.config().tz, 'Asia/Kolkata', 'Bet 1: the owner time zone is a setting')
})

test('dogfood 10-20 Show details: cards carry what decided them and Settings shows the runner, only when it is on', async () => {
	const { view } = await import('../src/web/view.ts')
	const { saveSetting } = await import('../src/web/settings.ts')
	const store = setup()
	const w = store.workflows()[0]
	store.save({ ...w, decision: { action: 'draft', ruleId: 'r1', reason: 'It commits you to something', confidence: 'high' } })
	assert.equal(view(store, undefined).needs[0].debug, undefined)
	assert.equal(view(store, undefined).details, undefined)
	await saveSetting(store, 'showDetails', 'true')
	const v = view(store, undefined)
	assert.deepEqual(v.needs[0].debug?.slice(0, 3), [`A1 · w1 · ${w.kind} · needs_human`, `Intent: ${w.intent ?? 'none yet'}`, 'Decision: draft by rule r1, high confidence: It commits you to something'])
	assert.match(v.details!.runner, /^No machine has checked yet\. This machine: mac\.$/)
	assert.ok(v.details!.log.some(l => /setting/.test(l)), 'the log shows the setting just saved')
})

test('Done v2 seen: a filter is seen up to the data the page showed, never later than now, never backwards, and only for known filters', async () => {
	const store = setup()
	const { url, server } = await serveInbox(() => store)
	const post = (body: unknown) => fetch(url.replace('/?', '/seen?'), { method: 'POST', body: JSON.stringify(body) })
	try {
		const shown = new Date(Date.now() - 60_000).toISOString()
		assert.equal((await post({ filters: ['catchup', 'replies', 'nope'], at: shown })).status, 200)
		assert.deepEqual(store.seen(), { catchup: shown, replies: shown })
		await post({ filters: ['catchup'], at: new Date(Date.now() - 600_000).toISOString() })
		assert.equal(store.seen().catchup, shown, 'an older page does not bring rows back')
		await post({ filters: ['replies'], at: '2999-01-01T00:00:00.000Z' })
		assert.ok(Date.parse(store.seen().replies) <= Date.now(), 'a clock ahead cannot hide rows still to come')
	} finally { server.close() }
})

test('Bet 1 reading state: ok within 20 minutes of the last good read, late within an hour, off after, never before the first', async () => {
	const { readingOf } = await import('../src/web/view.ts')
	const store = setup(), t = Date.parse('2026-10-20T10:00:00Z')
	writeFileSync(join(store.root, 'state', 'runner.json'), JSON.stringify({ machine: 'windows-box', at: '2026-10-20T09:59:00Z' }))
	assert.deepEqual(readingOf(store, t), { state: 'never', machine: 'windows-box' })
	const at = (min: number) => { store.saveChats({ ...store.chats(), readAt: new Date(t - min * 60_000).toISOString() }); return readingOf(store, t).state }
	assert.deepEqual([at(5), at(19), at(21), at(59), at(61)], ['ok', 'ok', 'late', 'late', 'off'])
	assert.equal(readingOf(store, t).at, '2026-10-20T08:59:00.000Z', 'the last good read, not the lease')
	store.saveChats({ ...store.chats(), goodAt: new Date(t - 2 * 60_000).toISOString() })
	assert.equal(readingOf(store, t).state, 'ok', 'chats are read while an older gap is still being searched')
})
