// The new experience, N1a (R-NEX-01, 02, 04, 09, 13, 14): the rows the new page draws, their markers and actions, the
// switch's storage, and that each row kind's action is an existing command the runner accepts on a fixture of its kind.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-n1local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { seedNext, item, stub, pauseNext } = await import('./fixture.ts')
const { nextView, rowsOf, place, snapshot, INLINE_MAX, COMMANDS, every, gerund } = await import('../src/web/next.ts')
const { actResult } = await import('../src/mcp/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { propose: proposeAutomation } = await import('../src/runner/automations.ts')
const { pickUi, newRoute, hashUi } = await import('../src/web/app/model/ui.ts')
import type { NextRow, NextView } from '../src/web/next.ts'

const fresh = (machine = 'mac') => new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-n1root-')), machine })
const all = (v: NextView) => [...v.move, ...v.working, ...v.waiting, ...v.catchup.rows]
const byAct = (v: NextView, act: string) => all(v).find(r => r.act === act)!
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }

test('N1a rows: each kind on its fixture has its section, a verb-first headline, and its one existing command', () => {
	const v = nextView(seedNext(fresh()))
	const got = (act: string) => { const r = byAct(v, act); return [r.section, r.kind, r.primary?.label ?? '', r.primary?.command ?? ''] }
	assert.deepEqual(Object.fromEntries(['A1', 'A2', 'A3', 'A5', 'A6', 'A20', 'A21', 'A22', 'A23', 'A34', 'A35', 'A37', 'A24', 'A36', 'A7', 'A29', 'R1', 'A25', 'A28', 'A26', 'A27', 'W2', 'A30'].map(c => [c, got(c)])), {
		A1: ['move', 'reply', 'Open', ''], A2: ['move', 'question', 'Open', ''], A3: ['move', 'choice', 'Open', ''], A5: ['move', 'meeting', 'Open', ''], A6: ['move', 'review', 'Open', ''],
		A20: ['move', 'reply', 'Send', 'ok A20'], A21: ['move', 'holding', 'Send holding reply', 'ok A21'], A22: ['move', 'stopped', 'Try again', 'A22: try again'],
		A23: ['move', 'your-step', 'Tell Delegate', 'A23: {text}'], A34: ['move', 'check-date', 'Draft a nudge', 'A34: nudge them'], A35: ['move', 'reply', 'Send', 'ok A35'], A37: ['move', 'track', 'Track', 'ok A37'],
		A24: ['working', 'working', '', ''], A36: ['working', 'scheduled', 'Hold', 'later A36'], A7: ['working', 'working', '', ''],
		A29: ['waiting', 'watch', 'Got it', 'ok A29'], R1: ['waiting', 'reminder', 'Pause', 'pause R1'], A25: ['waiting', 'waiting-delegate', '', ''],
		A28: ['waiting', 'waiting-person', 'Draft a nudge', 'A28: nudge them'], A26: ['waiting', 'nobody', 'Do it now', 'A26: do the next step now'],
		A27: ['waiting', 'waiting-others', 'Draft a nudge', 'A27: nudge them'], W2: ['waiting', 'waiting-person', 'Draft a nudge', 'ok W2'], A30: ['catchup', 'catchup', 'Needs me', 'mine A30'],
	})
	assert.deepEqual(['A20', 'A21', 'A22', 'A23', 'A34', 'A3', 'A4', 'A6', 'A36', 'A29', 'R1', 'A26', 'A27', 'W2', 'A30'].map(c => byAct(v, c).headline), [
		'Send reply to Kim: "Yes, the plan is final. Launch stays on Oct 24."',
		'Send Rita a holding reply: "Still checking PR 2201. I will get back to you by noon."',
		"Couldn't finish reviewing PR 2204 for Dev: try again, or do it yourself",
		'Try the new sign-up form on staging',
		'No news on "Error logs from Lin": nudge, wait, or close?',
		'Pick for Ana: Which flag for the rollout?',
		'Pick for Sam: what goes in the demo?',
		'Approve 2 comments, then reply to Vikram',
		'Sends to Alex (rule R3): "Yes, build 512 is green."',
		'PR 2203, until it merges',
		'Reminding Arun: "Please update the API design doc."',
		"Dev's spec review",
		'The vendor: A fix for incident 123',
		'You asked Dev: "Can you share the launch numbers before Friday?"',
		"Kim shared the draft plan for Thursday's review",
	])
	// The PM's stop words: Stop for what Delegate repeats, Close for work and asks, Skip for proposals.
	const more = (c: string) => (byAct(v, c).more ?? []).map(m => `${m.label}=${m.command}`)
	assert.deepEqual(['A30', 'A22', 'A23', 'A34', 'A29', 'R1', 'W2', 'A26', 'A27', 'A37'].map(more), [
		['Watch=watch A30'], ['Close=close A22'], [], ['Wait 3 days=wait A34: 3d', 'Close=close A34'], ['Extend 7 days=extend A29', 'Stop=skip A29'],
		['Stop reminding=skip R1'], ['Close=skip W2'], ['Close=close A26'], ['Close=close A27'], ['Skip=skip A37'],
	])
	// Every row's button sends what the command table says for its kind; a row that opens has no command of its own.
	for (const r of all(v)) {
		const allowed = COMMANDS[r.kind].split(' | ').map(x => x.replace(/ \(.*\)$/, ''))
		const cmd = r.primary?.command, want = !r.primary ? '' : !cmd ? 'card' : cmd.replace(r.act, /^W/.test(r.act) ? '<W code>' : '<code>')
		assert.ok(allowed.includes(want), `${r.act} (${r.kind}) sends "${want}", the table says ${COMMANDS[r.kind]}`)
	}
	assert.equal(byAct(v, 'A30').gist, 'Two options; the launch date stays Oct 24. Nothing asked of you.')
	assert.equal(byAct(v, 'A5').warn, 'Conflict: You have "1:1 with Ana" at 3:00 to 3:30 PM.', 'the meeting row shows its clash')
})

test('N1a rows: facts say who, where, and one time with its verb, from timestamps, never "2h"', () => {
	const store = seedNext(fresh()), v = nextView(store)
	const a20 = byAct(v, 'A20')
	assert.deepEqual([a20.facts.who, a20.facts.where, a20.facts.verb, a20.facts.at], ['Kim Lane', 'Spec review', 'asked', store.byCode('A20')!.createdAt])
	assert.equal(byAct(v, 'A28').facts.where, undefined, 'a 1:1 does not repeat the person as the chat')
	assert.equal(byAct(v, 'A36').facts.where, undefined)
	for (const r of all(v)) {
		assert.ok(!Number.isNaN(Date.parse(r.facts.at)) && /^\d{4}-\d\d-\d\dT/.test(r.facts.at), `${r.act}: at is a timestamp`)
		// Times the page says come as timestamps; only people's own words (a headline, a quote, a gist) may hold a clock time.
		assert.doesNotMatch(JSON.stringify([r.next?.what, r.facts.verb, r.facts.notes?.map(n => n.label), r.when, r.facts.until].map(x => typeof x === 'string' ? x.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/, '') : x)), /\b\d+\s?(m|h|min|mins|hours?) ago\b|\b\d\d?:\d\d\b/, `${r.act}: no time as text in the data`)
	}
	assert.equal(byAct(v, 'A5').when, store.byCode('A5')!.meeting!.start, 'a meeting carries its start as a timestamp')
	assert.deepEqual([byAct(v, 'R1').facts.verb, byAct(v, 'A29').facts.verb], [undefined, undefined], 'no unlabelled second time on a reminder or a watch')
	assert.equal(byAct(v, 'A29').facts.until, store.job('j-a29')!.endsAt, 'a watch says until when')
})

// PM review P0-2: quotation marks only for words someone wrote, with who wrote them; anything else unquoted after a label.
test('N1a attribution: each row kind quotes only written words, says whose, and labels everything else', () => {
	const store = seedNext(fresh()), v = nextView(store), r = (c: string) => byAct(v, c)
	const words = (c: string) => [r(c).facts.quote ? `${r(c).facts.quote!.by} ${r(c).facts.quote!.verb}: ${r(c).facts.quote!.text}` : '', ...(r(c).facts.notes ?? []).map(n => `${n.label}: ${n.text}`)]
	assert.deepEqual(Object.fromEntries(['A20', 'A21', 'A2', 'A3', 'A5', 'A6', 'A22', 'A23', 'A34', 'A37', 'A35', 'A24', 'A7', 'A36', 'A29', 'R1', 'A25', 'A28', 'A26', 'A27', 'W2', 'A30'].map(c => [`${c} ${r(c).kind}`, words(c)])), {
		'A20 reply': ['Kim Lane asked: Is the draft plan final?'],
		'A21 holding': ['Rita Vale asked: Can you recheck PR 2201?'],
		'A2 question': ['Ravi Kumar asked: When will the banner fix ship? Customers keep asking support.'],
		'A3 choice': ['Ana Costa asked: Should we use flag A or B for the rollout?'],
		'A5 meeting': ['Arun Mehta asked: Shall we meet at 3 pm today to discuss the API changes?'],
		'A6 review': ['Vikram Nair asked: Can you review PR 1234 when you get a chance?'],
		'A22 stopped': ['Dev Moss asked: Can you review PR 2204?', 'Why: a tool is missing (diff-tool)'],
		'A23 your-step': ['', 'Goal: Test sign-up on the new form'],
		'A34 check-date': ['', 'Waiting on: Lin Brook'],
		'A37 track': ["You said: I'd be the POC for the test plan", 'Done when: the test plan is shared with the team'],
		'A35 reply': ['Rita Vale asked: Can someone share the release notes?'],
		'A24 working': ['Dev Moss asked: Please review PR 1301'],
		'A7 working': [''],
		'A36 scheduled': ['Alex Fern asked: Is the build green?'],
		'A29 watch': ['', 'Last check: 1 of 2 approvals, build green'],
		'R1 reminder': [''],
		'A25 waiting-delegate': ['Alex Fern asked: Recheck PR 2202 please'],
		'A28 waiting-person': ['', 'Waiting for: Which deck Sam means: the Q3 review or the roadmap'],
		'A26 nobody': ['', 'Step: Review the spec and send comments'],
		'A27 waiting-others': [''],
		'W2 waiting-person': [''],
		'A30 catchup': [''],
	})
	assert.equal(r('A29').facts.notes![0].at, store.job('j-a29')!.result!.at, "the watch's last check is the job's result, with the time the check gave it, not the job's last save")
	// Nothing a row shows comes from the item's status line.
	for (const x of all(v)) {
		const w = store.byCode(x.act)
		if (w?.status && w.status.length > 12) assert.ok(!JSON.stringify(x).includes(w.status), `${x.act} shows its status line "${w.status}"`)
	}
})

test('N1a rows: Next says who and what, with times as timestamps, and is dropped when the headline says it', () => {
	const store = seedNext(fresh()), v = nextView(store), r = (c: string) => byAct(v, c)
	assert.deepEqual(['A6', 'A24', 'A29', 'A26', 'A36', 'R1', 'A25'].map(c => r(c).next), [
		{ owner: { kind: 'delegate' }, what: 'after your ok, Delegate posts them and replies' },
		{ owner: { kind: 'delegate' }, what: 'back to you when done' },
		{ owner: { kind: 'delegate' }, what: 'checks every hour' },
		{ owner: { kind: 'nobody' } },
		{ owner: { kind: 'delegate' }, what: 'sends it at {at}', at: store.byCode('A36')!.sendAt },
		{ owner: { kind: 'delegate' }, what: 'reminds Arun {at}', at: store.automation('R1')!.next },
		{ owner: { kind: 'delegate' }, what: 'tries again {at} (1 of 3)', at: store.job('j-a25')!.retry!.at },
	])
	assert.equal(r('A27').next, undefined, 'the headline already names who it waits on')
	assert.equal(r('W2').next, undefined)
	assert.deepEqual(['every hour', 'every 2 hours', 'every day', 'every 30 min'], [60, 120, 1440, 30].map(m => every(m)))
	assert.deepEqual(['reviewing PR 2204', 'rechecking the build', 'running the tests', 'investigating build 512'], ['Review PR 2204', 'Recheck the build', 'Run the tests', 'Investigate build 512'].map(gerund))
})

test('N1a rows: Send is on the row only when the whole draft is', () => {
	const store = fresh()
	store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] } } as never)
	const mid = 'x'.repeat(120), long = 'y'.repeat(INLINE_MAX + 1)
	item(store, 'A1', 'Kim', 'Kim', { draft: { text: 'Short.', commitment: false, sources: [] } })
	item(store, 'A2', 'Kim', 'Kim', { draft: { text: mid, commitment: false, sources: [] } })
	item(store, 'A3', 'Kim', 'Kim', { draft: { text: long, commitment: false, sources: [] } })
	// Changes to make before the reply are not on the row, so a short reply with changes still opens.
	item(store, 'A4', 'Kim', 'Kim', { draft: { text: 'Sent the invite.', commitment: false, sources: [] }, effects: [{ system: 'calendar', action: 'create_event', target: 'Your calendar', summary: 'Invite: sync' }] })
	const v = nextView(store), r = (c: string) => byAct(v, c)
	assert.deepEqual([r('A4').kind, r('A4').primary], ['reply', { label: 'Open' }])
	assert.deepEqual([r('A1').headline, r('A1').draft, r('A1').primary], ['Send reply to Kim: "Short."', undefined, { label: 'Send', command: 'ok A1' }])
	assert.deepEqual([r('A2').headline, r('A2').draft, r('A2').primary], ['Send reply to Kim', mid, { label: 'Send', command: 'ok A2' }])
	assert.deepEqual([r('A3').draft, r('A3').primary], [undefined, { label: 'Open' }], 'a draft longer than the row opens the card')
	assert.ok(r('A3').headline.endsWith('…"'))
})

// Review P1 and P2-2: what the card makes the owner look at before ok is not on the row, so such a draft opens the card.
test('N1a rows: a short draft with a need-to-know hold, a commitment, a warning, a gap, a private or labelled source, or a blank opens the card', () => {
	const store = fresh()
	store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] } } as never)
	const draft = (over: Record<string, unknown> = {}) => ({ text: 'Ships Oct 24.', commitment: false, sources: [], ...over })
	const cases: [string, Record<string, unknown>][] = [
		['A1', { draft: draft() }],
		['A2', { draft: draft(), shareHold: 'Draws on the 1:1 with Lin; Kim is not in it.' }],
		['A3', { draft: draft({ commitment: true }) }],
		['A4', { draft: draft(), context: [{ label: 'Conflict', text: 'You have a 1:1 at 3.', tone: 'warn' }] }],
		['A5', { draft: draft(), gaps: ['error.png (image)'] }],
		['A6', { draft: draft({ sources: [{ ref: '/notes/lin.md', tier: 'private', origin: 'extracted' }] }) }],
		['A7', { draft: draft({ sources: [{ ref: 'https://teams.microsoft.com/l/message/x/1', tier: 'live', origin: 'extracted', label: 'Lin, Oct 10' }] }) }],
		['A8', { draft: draft({ text: 'Ships on ____.' }) }],
		['A9', { draft: draft(), context: [{ label: 'Last status', text: 'Merged Oct 16.', tone: 'info' }] }],
		['A10', { draft: draft({ sources: [{ ref: 'card:banner/decisions#k1', tier: 'card', origin: 'extracted' }] }) }],
	]
	for (const [code, over] of cases) item(store, code, 'Kim', 'Kim', over as never)
	const v = nextView(store), p = (c: string) => byAct(v, c).primary
	assert.deepEqual(cases.map(([c]) => [c, p(c)?.command ?? p(c)?.label]), [
		['A1', 'ok A1'], ['A2', 'Open'], ['A3', 'Open'], ['A4', 'Open'], ['A5', 'Open'], ['A6', 'Open'], ['A7', 'Open'], ['A8', 'Open'],
		['A9', 'ok A9'], ['A10', 'ok A10'],
	], 'an info fact and an unlabelled knowledge source still fit on the row')
	assert.equal(byAct(v, 'A8').draft, undefined)
})

// PM verification of N1a, P2s: since when it waits, "+1 chat" only for a part in another chat, Worth a look, and the
// try count only in Next.
test('N1a rows: "Waiting on: <who> since <day>", "+1 chat" for a part elsewhere, Worth a look, and the try count only in Next', () => {
	const store = seedNext(fresh()), v = nextView(store), r = (c: string) => byAct(v, c)
	const a34 = r('A34'), since = store.byCode('A34')!.work!.waitingOn!.since
	assert.deepEqual([a34.facts.verb, a34.facts.also, a34.facts.notes], [undefined, undefined, [{ label: 'Waiting on', text: 'Lin Brook', since }]], 'no "last news", no "+1 linked" for the folded ask')
	assert.equal(r('A23').facts.also, 1, 'a part in another chat')
	// A part in the same chat is not another chat.
	item(store, 'A39', 'Pete Hale', 'Widget sync', { createdAt: new Date().toISOString(), state: 'open', status: 'Part', partOf: 'w-A23', chat: store.byCode('A23')!.chat })
	store.save({ ...store.byCode('A23')!, work: { ...store.byCode('A23')!.work!, parts: ['w-A38', 'w-A39'] } }, false)
	assert.equal(byAct(nextView(store), 'A23').facts.also, 1)
	// A scheduled send outside Working (no machine reading) promises no time.
	store.saveChats({ ...store.chats(), goodAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), readAt: new Date(Date.now() - 3 * 3_600_000).toISOString() })
	const off = byAct(nextView(store), 'A36')
	assert.deepEqual([off.section, off.kind, off.next], ['waiting', 'scheduled', undefined])
	assert.deepEqual(r('A30').chips.map(c => c.text), ['Worth a look'])
	assert.deepEqual(r('A31').chips, [])
	assert.deepEqual([r('A25').chips.map(c => c.text), r('A25').next?.what], [['Retrying'], 'tries again {at} (1 of 3)'])
})

test('N1a markers: From before setup, Retrying, Guests in chat, Changed, To the room; no Holding chip, and no New or Back to you yet', () => {
	const store = seedNext(fresh()), v = nextView(store)
	const chips = (c: string) => byAct(v, c).chips.map(x => x.text)
	assert.deepEqual([chips('A20'), chips('A21'), chips('A25'), chips('A29'), chips('A35')], [['From before setup', 'Guests in chat'], [], ['Retrying'], ['Changed'], ['To the room']])
	assert.match(byAct(v, 'A21').headline, /holding reply/, 'the headline says it is a holding reply')
	const kinds = new Set(all(v).flatMap(r => r.chips.map(c => c.kind)))
	assert.ok(!kinds.has('new' as never) && !kinds.has('back' as never))
	// A retry left on a job that has failed is not retrying any more.
	const j = store.job('j-a22')!
	store.saveJob({ ...j, retry: { at: new Date(Date.now() + 60_000).toISOString(), n: 2, firstAt: j.createdAt, last: { kind: 'tool', why: 'x', tried: [] }, tried: [] } })
	assert.deepEqual(byAct(nextView(store), 'A22').chips, [], 'no Retrying on a stopped item')
	// A watch is a watch even before its job exists.
	item(store, 'A60', 'Robin Park', 'Watching', { kind: 'tracker', state: 'open', lastAsk: 'Watch build 513 until green', status: 'Not checked yet' })
	assert.deepEqual([byAct(nextView(store), 'A60').kind, byAct(nextView(store), 'A60').headline], ['watch', 'build 513, until green'])
	store.save({ ...store.byCode('A29')!, ackAt: new Date().toISOString() }, false)
	assert.deepEqual([byAct(nextView(store), 'A29').chips, byAct(nextView(store), 'A29').primary], [[], undefined], 'Got it clears Changed; the watch keeps Stop watching')
})

test('N1a sections: every open thread once, Catch up shows 3 of its count, and Working says when Delegate is off', () => {
	const store = seedNext(fresh()), v = nextView(store)
	assert.deepEqual([v.move.length, v.working.length, v.waiting.length, v.catchup.count, v.catchup.rows.length], [13, 3, 8, 4, 3])
	const codes = [...v.move, ...v.working, ...v.waiting].map(r => r.code)
	assert.equal(new Set(codes).size, codes.length, 'no thread twice')
	const open = place(snapshot(store)).filter(p => p.section !== 'done' && p.section !== 'catchup').flatMap(p => p.subjects)
	assert.deepEqual(new Set(open), new Set(rowsOf(snapshot(store), place(snapshot(store))).filter(r => r.section !== 'catchup').flatMap(r => place(snapshot(store)).find(p => p.code === r.code)!.subjects)))
	assert.deepEqual(v.minute, { facts: 1, suggestions: 0 })
	assert.equal(v.off, undefined)
	// Your move: the oldest ask first.
	assert.deepEqual(v.move.map(r => r.facts.at), [...v.move.map(r => r.facts.at)].sort())
	assert.equal(v.catchup.rows[0].act, 'A30', 'worth knowing first')
	assert.deepEqual([v.catchup.worth, v.paused], [1, undefined])
	// Paused: drafts go on, so the queued draft stays in Working; a rule send is held for the owner, never promised
	// for after resume (PM verification of N1a).
	pauseNext(store)
	const p = nextView(store)
	assert.deepEqual([p.off, p.paused], [{ text: 'Paused: drafts go on, nothing is sent' }, true])
	assert.deepEqual(p.working.map(r => r.act).sort(), ['A24', 'A7'])
	const a36 = p.move.find(r => r.act === 'A36')!
	assert.deepEqual([a36.kind, a36.headline, a36.chips.map(c => c.text), a36.next, a36.primary], ['reply', 'Send reply to Alex: "Yes, build 512 is green."', ['Held: you paused'], undefined, { label: 'Send', command: 'ok A36' }])
	assert.doesNotMatch(JSON.stringify(p), /[Ss]ends?[^"]{0,40}when you resume/, 'nothing promises a send after resume')
	// Paused while no machine reads: nothing is Working, the header says Delegate is off, and Send still waits (round 3, P1).
	store.saveChats({ ...store.chats(), goodAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), readAt: new Date(Date.now() - 2 * 3_600_000).toISOString() })
	const po = nextView(store)
	assert.deepEqual([po.working.map(r => r.act), po.off?.text, po.paused], [['A24'], 'Delegate is off', true])
	assert.equal(po.move.find(r => r.act === 'A36')?.next, undefined)
	assert.equal(po.waiting.find(r => r.act === 'A7')?.next?.what, 'starts when a machine reads your chats again')
	store.saveChats({ ...store.chats(), goodAt: new Date().toISOString(), readAt: new Date().toISOString() })
	store.saveControl({ paused: false, stopped: false })
	store.saveConfig({ ...store.config(), paused: true } as never)
	assert.deepEqual([nextView(store).paused, nextView(store).off?.text], [true, 'Paused: drafts go on, nothing is sent'], 'a pause in the config counts')
	store.saveConfig({ ...store.config(), paused: undefined } as never)
	store.saveChats({ ...store.chats(), goodAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), readAt: new Date(Date.now() - 3 * 3_600_000).toISOString() })
	const off = nextView(store)
	assert.equal(off.off?.text, 'Delegate is off')
	assert.ok(off.off?.since && !Number.isNaN(Date.parse(off.off.since)))
	assert.deepEqual(off.working.map(r => r.act), ['A24'], 'only the run already going stays in Working when nothing reads')
})

// R-NEX-04: each row kind's action, sent as the page sends it, is accepted and applied by the runner on a fixture of its kind.
test('N1a commands: every row kind\'s action is an existing command the runner applies on its fixture', async () => {
	const REFUSED = /not ready|has no draft|already done|not in Catch up|can't find|no such|still working|takes ok|not open work|changed after you looked|I did not understand/i
	const cases: [kind: NextRow['kind'], act: string, command: string, check: (s: InstanceType<typeof Store>) => unknown][] = [
		['reply', 'A20', 'ok A20', s => s.byCode('A20')!.state === 'done' && !!s.byCode('A20')!.sent],
		['holding', 'A21', 'ok A21', s => !!s.byCode('A21')!.sent],
		['question', 'A2', 'A2: Oct 24 works', s => s.byCode('A2')!.state === 'running'],
		['choice', 'A3', 'pick A3 1', s => s.byCode('A3')!.draft?.preview],
		['meeting', 'A5', 'pick A5 3', s => s.byCode('A5')!.draft?.preview],
		['check-date', 'A34', 'A34: nudge them', s => s.byCode('A34')!.state === 'running'],
		['track', 'A37', 'ok A37', s => s.byCode('A37')!.state === 'open' && !s.byCode('A37')!.work!.proposed],
		['your-step', 'A23', 'A23: tested both, both work', s => s.byCode('A23')!.state === 'running'],
		['stopped', 'A22', 'A22: try again', s => s.byCode('A22')!.state === 'running'],
		['scheduled', 'A36', 'later A36', s => s.byCode('A36')!.state === 'needs_human'],
		['watch', 'A29', 'ok A29', s => !!s.byCode('A29')!.ackAt],
		['reminder', 'R1', 'pause R1', s => s.automation('R1')!.state === 'paused'],
		['waiting-person', 'A28', 'A28: nudge them', s => s.byCode('A28')!.state === 'running'],
		['waiting-person', 'W2', 'ok W2', s => !!s.waiting().find(w => w.code === 'W2')!.item],
		['waiting-others', 'A27', 'A27: nudge them', s => s.byCode('A27')!.state === 'running'],
		['nobody', 'A26', 'A26: do the next step now', s => s.byCode('A26')!.state === 'running'],
		['catchup', 'A30', 'mine A30', s => s.byCode('A30')!.state === 'running'],
		['catchup', 'A31', 'watch A31', s => s.workflows().some(w => w.kind === 'tracker' && w.watchFrom === 'catchup')],
		['reminder-new', 'R2', 'ok R2', s => s.automation('R2')!.state === 'active'],
	]
	for (const [kind, act, command, check] of cases) {
		const store = seedNext(fresh())
		proposeAutomation(store, { to: 'Arun Mehta', text: 'Please share the notes.', every: 'day', at: '16:00' })
		const v = nextView(store), r = byAct(v, act)
		assert.ok(r, `${act} has a row: ${all(v).map(x => x.act).join(' ')}`)
		assert.equal(r.kind, kind, `${act} is a ${kind} row`)
		// The row's own command, or for rows that open the card, the card's command for that kind.
		if (r.primary?.command && !r.primary.command.includes('{text}') && kind !== 'catchup') assert.equal(r.primary.command, command)
		const said = actResult(store, command, r.rev, 'page')
		assert.ok(said.accepted, `${command}: accepted (${said.text})`)
		await applyAnswers(store, stub, store.config(), procs as never)
		const out = said.ids.map(id => store.outcome(id) ?? '').join(' ')
		assert.doesNotMatch(out, REFUSED, `${command}: applied, not refused (${out})`)
		assert.ok(check(store), `${command}: did what the row says (${out})`)
	}
})

// The secondary actions are existing commands too: Close, Extend 7 days, Stop, Stop reminding (PM review: three stop words).
test('N1a commands: the secondary actions are existing commands the runner applies', async () => {
	const cases: [string, (s: InstanceType<typeof Store>) => unknown][] = [
		['close A22', s => s.byCode('A22')!.state === 'done'],
		['close A26', s => s.byCode('A26')!.state === 'done'],
		['extend A29', s => Date.parse(s.job('j-a29')!.endsAt!) > Date.now() + 6 * 86_400_000],
		['skip A29', s => s.byCode('A29')!.state === 'done'],
		['skip R1', s => s.automation('R1')!.state === 'ended'],
		['skip W2', s => s.waiting().find(w => w.code === 'W2')!.state === 'dismissed'],
	]
	for (const [command, check] of cases) {
		const store = seedNext(fresh())
		const said = actResult(store, command, undefined, 'page')
		assert.ok(said.accepted, `${command}: ${said.text}`)
		await applyAnswers(store, stub, store.config(), procs as never)
		assert.ok(check(store), `${command}: ${said.ids.map(id => store.outcome(id)).join(' ')}`)
	}
})

test('N1a switch: per machine in state/ui, a bad file is classic, flipping logs a ui event, and seen marks stay shared', () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-n1ui-'))
	const mac = new Store({ root, machine: 'mac' }), pc = new Store({ root, machine: 'pc' })
	assert.deepEqual(mac.ui(), { ui: 'classic' }, 'off by default')
	const t = mac.saveUi('new')
	assert.deepEqual([mac.ui().ui, pc.ui().ui, typeof t.tried, typeof t.at], ['new', 'classic', 'string', 'string'], 'one machine on new, the other on classic')
	mac.saveUi('classic')
	assert.equal(mac.ui().tried, t.tried, 'first tried is kept after switching back')
	assert.deepEqual(mac.logs().filter(e => e.event === 'ui').map(e => [e.from, e.to]), [['classic', 'new'], ['new', 'classic']])
	mac.saveSeen(['catchup'])
	assert.ok(pc.seen().catchup, 'seen marks still merge across machines')
	mkdirSync(join(root, 'state', 'ui'), { recursive: true })
	writeFileSync(join(root, 'state', 'ui', 'pc.json'), '{ not json')
	assert.deepEqual(pc.ui(), { ui: 'classic' }, 'a corrupt file is classic, no error')
	writeFileSync(join(root, 'state', 'ui', 'pc.json'), JSON.stringify({ ui: 'shiny' }))
	assert.deepEqual(pc.ui(), { ui: 'classic' }, 'an unknown value is classic')
})

test('N1a data: classic never builds the new rows; the new page gets them when it asks; POST /ui saves this machine', async () => {
	const store = seedNext(fresh(), 'classic')
	const { url, server } = await serveInbox(() => store)
	try {
		const u = new URL(url), base = `${u.origin}`, t = u.searchParams.get('t')
		const classic = await (await fetch(`${base}/data?t=${t}`)).json()
		assert.equal(classic.next, undefined, 'a classic poll does not pay for Now')
		assert.equal(classic.ui.ui, 'classic')
		const asked = await (await fetch(`${base}/data?t=${t}&ui=new`)).json()
		assert.equal(asked.next.move.length, 13)
		assert.equal((await fetch(`${base}/ui?t=${t}`, { method: 'POST', body: JSON.stringify({ ui: 'sideways' }) })).status, 422)
		const r = await (await fetch(`${base}/ui?t=${t}`, { method: 'POST', body: JSON.stringify({ ui: 'new' }) })).json()
		assert.equal(r.ui.ui, 'new')
		assert.equal(store.ui().ui, 'new')
		const page = await (await fetch(url)).text()
		assert.match(page, /"next":\{"move":\[/, 'the page opened on a new machine carries Now at first paint')
		await fetch(`${base}/ui?t=${t}`, { method: 'POST', body: JSON.stringify({ noted: true }) })
		assert.deepEqual([store.ui().ui, store.ui().noted], ['new', true], 'closing the note keeps the choice')
		assert.equal(store.answers().length, 0, 'the switch sends no command')
	} finally { server.close() }
})

test('N1a page model: the address wins, then the newer of the server file and the cache; classic links open in Now', () => {
	const at = (m: number) => new Date(Date.UTC(2026, 9, 20, 10, m)).toISOString()
	assert.equal(pickUi({ ui: { ui: 'classic' } }, '#ui=new'), 'new')
	assert.equal(pickUi({ ui: { ui: 'new', at: at(1) } }, '#done&ui=classic'), 'classic')
	assert.equal(pickUi({ ui: { ui: 'new', at: at(5) } }, '', { ui: 'classic', at: at(1) }), 'new', 'the server file is newer')
	assert.equal(pickUi({ ui: { ui: 'classic', at: at(1) } }, '', { ui: 'new', at: at(5) }), 'new', 'a panel drawn from an older view follows the newer cache')
	assert.equal(pickUi(undefined, '', undefined), 'classic', 'off by default')
	assert.equal(pickUi({ ui: { ui: 'new' } }, '#ui=new', undefined, true), 'classic', 'the snapshot is always classic')
	assert.equal(hashUi('#focus/A7'), undefined)
	assert.deepEqual(['home', 'focus', 'focus/A7', 'ongoing', 'ongoing/running', 'ongoing/automations', 'done/replies', 'settings/system', 'knowledge', 'nowhere'].map(newRoute),
		['now', 'now', 'now/A7', 'now/waiting', 'now/working', 'now/waiting', 'done/replies', 'settings/system', 'knowledge', 'now'])
})
