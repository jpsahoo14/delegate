import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseVerbs } from '../src/core/verbs.ts'
import { classify, htmlToText } from '../src/core/intake.ts'
import { GATES, sendGate } from '../src/core/gate.ts'
import { renderList, renderNudge } from '../src/core/render.ts'
import type { Workflow } from '../src/core/types.ts'
import { mdToHtml } from '../src/core/format.ts'

const owner = { ownerId: 'me', ownerName: 'Robin Park', test: false, group: false, sentIds: new Set<string>() }
const raw = (id: string, fromId: string | null, body: string, html = false) => ({ id, at: '2026-10-17T10:00:00Z', from: fromId ? { id: fromId, name: fromId } : null, html, body })

test('R-HIL-15 verbs: single, multiple, ranges, and answers with commas', () => {
	assert.deepEqual(parseVerbs('ok A7'), [{ code: 'A7', verb: 'ok', text: undefined }])
	assert.deepEqual(parseVerbs('ok A7, skip A8, A9: tell him Monday, or Tuesday'), [
		{ code: 'A7', verb: 'ok', text: undefined },
		{ code: 'A8', verb: 'skip', text: undefined },
		{ code: 'A9', verb: 'answer', text: 'tell him Monday, or Tuesday' },
	])
	assert.deepEqual(parseVerbs('ok K2-K4')?.map(p => p.code), ['K2', 'K3', 'K4'])
	assert.deepEqual(parseVerbs('edit a1: I can do Oct 24, ok with me'), [{ code: 'A1', verb: 'edit', text: 'I can do Oct 24, ok with me' }])
	assert.deepEqual(parseVerbs('ok'), [{ verb: 'ok' }])
})

test('review react-spec P0-1: once a command takes text, every comma after it is the owner\'s words, never another command', () => {
	assert.deepEqual(parseVerbs('send A7: Yes, ok'), [{ code: 'A7', verb: 'send', text: 'Yes, ok' }])
	assert.deepEqual(parseVerbs('A3: Use this: fine, ok A9'), [{ code: 'A3', verb: 'answer', text: 'Use this: fine, ok A9' }])
	assert.deepEqual(parseVerbs('A1: sure, ok'), [{ code: 'A1', verb: 'answer', text: 'sure, ok' }])
	assert.deepEqual(parseVerbs('ok A1, skip A2, A3: hi, ok A4'), [
		{ code: 'A1', verb: 'ok', text: undefined },
		{ code: 'A2', verb: 'skip', text: undefined },
		{ code: 'A3', verb: 'answer', text: 'hi, ok A4' },
	], 'commands before the first text still batch')
})

test('R-HIL-15 verbs: personal notes are not commands', () => {
	for (const s of ['buy milk', 'a1 sauce recipe', 'okay then', 'edit A1:', 'A1', '']) assert.equal(parseVerbs(s), null, s)
})

test('R-ING-03 R-ING-09 intake skips our own sends and marked messages', () => {
	assert.equal(classify(raw('1', 'x', 'hi'), { ...owner, sentIds: new Set(['1']) }).kind, 'skip')
	assert.equal(classify(raw('2', 'x', 'Done. (sent by Ravi\'s assistant)'), owner).kind, 'skip')
	assert.equal(classify(raw('3', 'me', 'Assistant · 2 need you'), owner).kind, 'skip')
	assert.equal(classify(raw('4', 'me', 'my own reply'), owner).kind, 'owner')
})

test('R-ING-10 [as Name] works only in test chats', () => {
	const t = classify(raw('5', 'me', '[as Ravi] status?'), { ...owner, test: true })
	assert.deepEqual(t, { kind: 'ask', from: { id: 'test:ravi', name: 'Ravi' }, text: 'status?' })
	assert.equal(classify(raw('6', 'me', '[as Ravi] status?'), owner).kind, 'owner')
})

test('R-ING-08 group messages are asks only when they mention the owner', () => {
	const g = { ...owner, group: true }
	assert.equal(classify(raw('7', 'x', 'lunch?'), g).kind, 'context')
	assert.equal(classify(raw('8', 'x', 'Robin, can you review?'), g).kind, 'ask')
	assert.equal(classify(raw('9', 'x', '<p><at id="0">Robin Park</at> ping</p>', true), g).kind, 'ask')
	assert.equal(htmlToText('<p>a &amp; b</p><p>c</p>'), 'a & b\nc')
})

const wf = (over: Partial<Workflow> = {}): Workflow => ({
	schema: 1, id: 'W', code: 'A1', kind: 'reply', state: 'needs_human', key: { type: 'thread', id: 'c' },
	chat: { id: 'c', name: 'Test', test: true }, asker: { id: 'r', name: 'Ravi' }, session: { agent: 'copilot', id: 's' },
	lastMsgId: '10', pending: [], msgIds: ['10'], status: 'Asks for a date', newCount: 0, createdAt: '2026-10-17T09:00:00Z', updatedAt: '2026-10-17T09:30:00Z',
	draft: { text: 'Oct 24', commitment: true, sources: [] }, lastAsk: 'When?', question: 'Which date?', ...over,
})
const ctx = { paused: false, ownerApproved: true, draftOnly: true, newestThreadMsgId: '10', alreadyReplied: false }

test('R-POL-02 R-WF-13 R-STO-06 send gate', () => {
	assert.deepEqual(sendGate(wf(), 'Oct 24', ctx), { send: true })
	assert.equal(sendGate(wf(), 'Oct 24', { ...ctx, ownerApproved: false }).send, false)
	assert.deepEqual(sendGate(wf(), 'x', { ...ctx, newestThreadMsgId: '11' }), { send: false, reason: 'New messages since the draft', rerun: true })
	assert.equal(sendGate(wf(), 'x', { ...ctx, alreadyReplied: true }).send, false)
	assert.equal(sendGate(wf(), 'x', { ...ctx, paused: true }).send, false)
})

test('R-HIL-12 list shows needs-you in full and others in one line', () => {
	const out = renderList([wf(), wf({ id: 'D', code: 'A2', state: 'done', status: 'Sent: "ok"', intent: 'status_next_step' })], new Date('2026-10-17T11:00:00Z'))
	assert.equal(out.split('\n')[0], '1 need you · 1 done · 0 running')
	assert.match(out, /\*\*A1\*\* · Ravi · Test · 2h\n> When\?\nNeeds you: Which date\?\nDraft: "Oct 24"/)
	assert.match(out, /- \*\*A2\*\* · Ravi · Test · 2h · Sent: "ok"/)
	assert.match(renderNudge([wf()]), /^Assistant · 1 need you\nA1 Ravi: When\?\n   Draft: "Oct 24"\nReply here, for example "ok A1"/)
})

test('gate copies match in SKILL.md, every contract, and core/gate.ts', async () => {
	const { gatesFor } = await import('../src/core/gate.ts')
	const { readdirSync } = await import('node:fs')
	const dir = join(import.meta.dirname, '..', 'skills', 'delegate')
	const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8')
	for (const g of gatesFor('reply')) assert.ok(skill.includes(`- [${g.id}] ${g.line}`), `SKILL.md: ${g.id} missing or changed`)
	for (const f of readdirSync(join(dir, 'workflows'))) {
		const text = readFileSync(join(dir, 'workflows', f), 'utf8'), kind = f.replace('.md', '')
		for (const g of gatesFor(kind)) assert.ok(text.includes(`- [${g.id}] ${g.line}`), `${f}: ${g.id} missing or changed`)
		assert.equal((text.match(/^- \[[a-z-]+\] /gm) ?? []).length, gatesFor(kind).length, `${f}: no extra gates`)
	}
})

test('R-ANS-06 replies render links, bold, code, and line breaks as Teams HTML', () => {
	assert.equal(mdToHtml('See [MT PR](https://x.y/1) & **now**\n`a<b`'), 'See <a href="https://x.y/1">MT PR</a> &amp; <b>now</b><br><code>a&lt;b</code>')
})

test('R-ANS-02 confidence is computed from evidence, never stated', async () => {
	const { confidence } = await import('../src/core/policy.ts')
	const card = { ref: 'k', tier: 'card' as const, origin: 'extracted' as const }, live = { ref: 'l', tier: 'live' as const, origin: 'extracted' as const }
	assert.equal(confidence([card, live]), 'high'); assert.equal(confidence([card]), 'medium'); assert.equal(confidence([live]), 'low'); assert.equal(confidence([]), 'low')
	assert.equal(confidence([{ ...card, origin: 'inferred' }, { ...live, origin: 'inferred' }]), 'medium')
})

test('R-RUL-04 rules match by account ID only, and group rules never allow a send', async () => {
	const { decide } = await import('../src/core/policy.ts')
	const ctx = { autoSend: true, autoSendsThisHour: 0, maxPerHour: 3 }
	const w = wf({ intent: 'status_next_step', draft: { text: 'x', commitment: false, sources: [{ ref: 'k', tier: 'card', origin: 'extracted' }] } })
	assert.equal(decide(w, [{ id: 'a', text: '', who: { accounts: [{ id: 'r', name: 'Ravi' }] }, when: {}, then: 'send' }], ctx).action, 'send')
	assert.equal(decide({ ...w, asker: { id: 'x', name: 'Ravi' } }, [{ id: 'a', text: '', who: { accounts: [{ id: 'r', name: 'Ravi' }] }, when: {}, then: 'send' }], ctx).action, 'draft')
	assert.equal(decide(w, [{ id: 'g', text: '', who: { group: 'team' }, when: {}, then: 'send' }], ctx).action, 'draft')
	assert.equal(decide(w, [{ id: 'm', text: '', who: { accounts: [{ id: 'r', name: 'R' }] }, when: { minConfidence: 'high' }, then: 'send' }], ctx).action, 'draft')
	const direct = [{ id: 'd', text: '', who: { accounts: [{ id: 'r', name: 'Ravi' }] }, when: { chat: 'direct' }, then: 'send' as const }]
	assert.deepEqual([decide({ ...w, chat: { id: '19:r_me@unq.gbl.spaces', name: 'Ravi', test: false, group: false } }, direct, ctx).action, decide({ ...w, chat: { id: '19:g@thread.v2', name: 'Team', test: false, group: true } }, direct, ctx).action], ['send', 'draft'], '"direct" covers any 1:1 with the person, never a group')
})

test('R-HIL-19 quiet hours wrap past midnight', async () => {
	const { inQuietHours } = await import('../src/core/policy.ts')
	const at = (h: number, m = 0) => { const d = new Date(2026, 9, 17, h, m); return d }
	assert.equal(inQuietHours(at(23)), true); assert.equal(inQuietHours(at(7, 59)), true); assert.equal(inQuietHours(at(8)), false); assert.equal(inQuietHours(at(13)), false)
})

test('B22 the drafter sees the owner\'s corrections for the same person first, then their recent edits; skips for others and this item\'s own are left out', async () => {
	const { corrections } = await import('../src/store/feedback.ts')
	const now = Date.parse('2026-10-20T12:00:00Z'), at = (h: number) => new Date(now - h * 3_600_000).toISOString()
	const ravi = { id: 'r', name: 'Ravi' }, kim = { id: 'k', name: 'Kim' }
	const ls = [
		{ kind: 'correction' as const, event: 'sent', code: 'A1', at: at(1), what: '', detail: { asker: kim, intent: 'status_next_step', draft: 'Hi Kim! Great question. It ships Friday.', sent: 'Ships Friday.' } },
		{ kind: 'correction' as const, event: 'marked', code: 'A2', at: at(5), what: '', detail: { asker: ravi, intent: 'status_next_step', sent: 'Ring 1 starts Thursday.', kind: 'incomplete', note: 'say it needs a clean week first' } },
		{ kind: 'correction' as const, event: 'skipped', code: 'A3', at: at(2), what: '', detail: { asker: kim, intent: 'other', draft: 'Thanks!', ask: 'thanks' } },
		{ kind: 'correction' as const, event: 'sent', code: 'A9', at: at(1), what: '', detail: { asker: ravi, draft: 'x', sent: 'y' } },
		{ kind: 'correction' as const, event: 'sent', code: 'A4', at: at(24 * 40), what: '', detail: { asker: ravi, draft: 'old', sent: 'older' } },
		{ kind: 'error' as const, event: 'worker', code: 'A5', at: at(1), what: 'no report' },
	]
	assert.deepEqual(corrections(ls, { code: 'A9', asker: ravi, intent: 'status_next_step' }, now), [
		'For Ravi: you sent "Ring 1 starts Thursday." and the owner marked it incomplete: "say it needs a clean week first"',
		'For someone else: the owner cut a 7-word draft to 2 words and dropped the greeting.',
	])
	assert.deepEqual(corrections(ls, { code: 'A7', asker: { id: 'z' } }, now), [
		'For someone else: the owner cut a 7-word draft to 2 words and dropped the greeting.',
		'For someone else: the owner changed a 1-word draft to 1 words.',
	])
})

test('B21 a Teams message link gives its chat and message; a channel link gives its thread', async () => {
	const { parseMessageLink } = await import('../src/adapters/channels.ts')
	assert.deepEqual(parseMessageLink('https://teams.microsoft.com/l/message/19:meeting_NjM0@thread.v2/1792405146070?context=%7B%22contextType%22%3A%22chat%22%7D'), { chatId: '19:meeting_NjM0@thread.v2', msgId: '1792405146070' })
	assert.deepEqual(parseMessageLink('https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1792?groupId=team-1&parentMessageId=1700&teamName=T&channelName=C'), { chatId: 'ch|team-1|19:abc@thread.tacv2|1700', msgId: '1792' })
	assert.deepEqual(parseMessageLink('https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1700?groupId=team-1&parentMessageId=1700'), { chatId: 'ch|team-1|19:abc@thread.tacv2|1700', msgId: '1700' })
	assert.equal(parseMessageLink('https://example.com/not/a/teams/link'), undefined)
	assert.equal(parseMessageLink('not a url'), undefined)
})

test('R-WRK-10 typed links route to work only when exactly one work names them', async () => {
	const { linksIn, homeNamed } = await import('../src/runner/work.ts')
	assert.deepEqual(linksIn('Deploy Pull Request 1234567 after CI build 52000001; see incident 31000000000001 and bug 5867407. Call me at 98765.'), ['pr:1234567', 'build:52000001', 'incident:31000000000001', 'workItem:5867407'])
	const w = (code: string, links: string[]) => ({ id: code, code, chat: { id: code }, work: { goal: code, doneWhen: '', steps: [], links } }) as never
	assert.equal((homeNamed([w('A1', ['pr:org/repo/1234567']), w('A2', ['incident:1'])], 'is PR 1234567 out?') as { code: string } | undefined)?.code, 'A1')
	assert.equal(homeNamed([w('A1', ['pr:1234567']), w('A2', ['pr:1234567'])], 'is PR 1234567 out?'), undefined, 'two works name it: none is chosen')
	assert.equal(homeNamed([w('A1', ['pr:1234567'])], 'call 1234567'), undefined, 'a bare number is not a link')
})

test('R-WRK-12 a part updates and adds plan steps and never drops the home\'s; the home replaces its list', async () => {
	const { mergePlan } = await import('../src/runner/work.ts')
	const old = [{ id: 'p1', what: 'Get a test ring', who: 'you' as const }, { id: 'p2', what: 'Test checkout flows', who: 'you' as const }, { id: 'p3', what: 'Report results', who: 'you' as const }]
	const part = mergePlan(old, [{ id: 'p1', what: 'Get a test ring', who: 'you', done: true }, { what: 'Inspect the failed build', who: 'me', in: 'a2' }], 'T', true)
	assert.deepEqual(part.map(p => [p.id, p.what, p.done ?? '', p.in ?? '']), [['p1', 'Get a test ring', 'T', ''], ['p2', 'Test checkout flows', '', ''], ['p3', 'Report results', '', ''], ['p4', 'Inspect the failed build', '', 'A2']])
	assert.deepEqual(mergePlan(old, [{ id: 'p3', what: 'Report results', who: 'you' }], 'T').map(p => p.id), ['p3'])
})

test('dogfood 10-20: an answer from someone the owner asked counts for a week, if nobody else joined in', async () => {
	const { continuesOwner, nextTurn } = await import('../src/core/intake.ts')
	const day = (n: number) => new Date(Date.parse('2026-10-17T15:19:00Z') + n * 86_400_000).toISOString()
	const t = nextTurn(undefined, { owner: true, at: day(0), text: '[image]', to: ['tian'] })
	const tian = { id: 'tian', name: 'Tian Li' }, christian = { id: 'chris', name: 'Christian Munden' }
	assert.deepEqual([continuesOwner(t, tian, day(2.5)), continuesOwner(t, tian, day(8)), continuesOwner(t, christian, day(2.5))], [true, false, false])
	const after = nextTurn(t, { owner: false, from: tian, at: day(2.5) })
	assert.equal(continuesOwner(after, tian, day(2.6)), true, 'their next message too')
	assert.equal(continuesOwner(nextTurn(t, { owner: false, from: christian, at: day(1) }), tian, day(2.5)), false, 'someone else joined in first')
})


test('review 10-21c P2-2: a change counts as made only when it is the same call, not another change on the same PR', async () => {
	const { sameChange } = await import('../src/core/effects.ts')
	const note = (content: string) => ({ system: 'ado', action: 'comment', target: 'PR 4200001', summary: content, call: { tool: 'ado-comment', args: { pullRequestId: 4200001, content } } })
	const vote = (v: string) => ({ system: 'ado', action: 'approve', target: 'PR 4200001', summary: v, call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: 4200001, vote: v } } })
	assert.deepEqual([
		sameChange(note('Null check'), { ...note('Null check'), done: { at: 'x', ref: 't1' } }),
		sameChange(note('Null check'), note('Please add a test')),
		sameChange(vote('Approved'), vote('ApprovedWithSuggestions')),
		sameChange({ system: 'ado', action: 'comment', target: 'PR 1', summary: 's', payload: { a: 1 } }, { system: 'ado', action: 'comment', target: 'PR 1', summary: 's2', payload: { a: 1 } }),
		sameChange({ ...vote('Approved'), head: 'h1' }, { ...vote('Approved'), head: 'h2' }),
		sameChange({ ...note('Null check'), head: 'h1' }, { ...note('Null check'), head: 'h2' }),
	], [true, false, false, true, false, true], 'a vote at a new head is a new vote (10-21d P2-2); a comment is the same comment at any head (10-21e P1-3)')
})
