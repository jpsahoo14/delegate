import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askAtOf, numbers, numbersText, slim, weekLine, weekOf, type Ev, type Item } from '../src/core/numbers.ts'
import { listsOf } from '../src/web/app/model/numbers.ts'
import { dayIn } from '../src/core/schedule.ts'

// Numbers tab (R-NEX-11, design-spec/north-star-tab.md). A fixed clock: Wednesday 2026-10-21 12:00 UTC, the owner in UTC.
const NOW = new Date('2026-10-21T12:00:00Z')
const TZ = 'UTC'
const at = (day: string, hm = '10:00') => `${day}T${hm}:00.000Z`
const ticks = (...days: string[]) => days.map(d => ({ at: at(d, '09:00'), event: 'tick' }))
const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21']
const LAST = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
const items: Item[] = [
	// Another item in A4's chat, listed first: a missed link finds its item by message, not by chat.
	{ code: 'A0', chat: { id: 'c4' }, msgIds: ['m0'] },
	{ code: 'A1', chat: { id: 'c1' }, msgIds: ['m1'] }, { code: 'A2', chat: { id: 'c2' }, msgIds: ['m2'] }, { code: 'A3', chat: { id: 'c3' }, msgIds: ['m3'] },
	{ code: 'A4', chat: { id: 'c4' }, msgIds: ['m4'] }, { code: 'A5', chat: { id: 'c5' }, msgIds: ['m5'] }, { code: 'A6', chat: { id: 'c6' }, msgIds: ['m6'] },
	{ code: 'A7', kind: 'tracker', chat: { id: 'c7' }, msgIds: ['m7'] },
]
const sent = (code: string, when: string, over: Record<string, unknown> = {}) => ({ at: when, event: 'sent', code, msgId: `${code}@${when}`, approvedBy: 'owner', unchanged: true, text: 'Done.', ...over })
const closed = (code: string, when: string, over: Record<string, unknown>) => ({ at: when, event: 'state', code, from: 'needs_human', to: 'done', ...over })
const run = (raw: Record<string, unknown>[], key: Parameters<typeof numbers>[4] = 'this', now = NOW) => numbers(slim(raw), items, now, TZ, key)

test('R-NEX-11 numbers: the owner\'s days and weeks run Monday to Sunday in their zone, not the machine\'s', () => {
	assert.equal(weekOf('2026-10-21'), '2026-10-19')
	assert.equal(weekOf('2026-10-19'), '2026-10-19', 'Monday starts its week')
	assert.equal(weekOf('2026-10-18'), '2026-10-12', 'Sunday ends the week before')
	// 23:30 UTC on Sunday is already Monday in Tokyo, and still Sunday in New York.
	assert.equal(dayIn('2026-10-18T23:30:00Z', 'Asia/Tokyo'), '2026-10-19')
	assert.equal(dayIn('2026-10-18T23:30:00Z', 'America/New_York'), '2026-10-18')
	assert.equal(dayIn('2026-10-18T23:30:00Z', 'Not/AZone').length, 10, 'an unknown zone falls back to this machine\'s')
	const sunday = run([...ticks(...LAST, ...WEEK), sent('A1', '2026-10-18T23:30:00Z')], 'this', NOW)
	assert.equal(sunday.handled.n, 0, 'in UTC the send was last week')
	assert.equal(numbers(slim([...ticks(...LAST, ...WEEK), sent('A1', '2026-10-18T23:30:00Z')]), items, NOW, 'Asia/Tokyo', 'this').handled.n, 1, 'in Tokyo it was this week')
	// India is 5:30 ahead: 18:20 and 18:40 UTC on Sunday fall on two days there.
	assert.deepEqual(numbers(slim([...ticks(...LAST, ...WEEK), sent('A1', '2026-10-18T18:20:00Z'), sent('A2', '2026-10-18T18:40:00Z')]), items, NOW, 'Asia/Kolkata', 'this').handled.codes, ['A2'])
})

test('R-NEX-11 handled for you: one case per kind; edited, removed, partial, reminders, and FYIs never count', () => {
	const n = run([
		...ticks(...LAST, ...WEEK),
		sent('A1', at('2026-10-19')),
		sent('A2', at('2026-10-19'), { approvedBy: 'rule:r1', unchanged: false }),
		{ at: at('2026-10-20', '09:00'), event: 'job-executed', items: ['A3'], kept: 2, removed: 0, left: 0, done: 2 },
		sent('A3', at('2026-10-20', '09:01')),
		closed('A4', at('2026-10-20'), { closedBy: 'job', status: 'Nothing needed: merged' }),
		// Not handled: an edit before the ok, a change the owner removed, a change that failed, a message that needed nothing, a reminder, a Teams reply.
		sent('A5', at('2026-10-20'), { draft: 'Draft words', text: 'My words' }),
		{ at: at('2026-10-20', '11:00'), event: 'job-executed', items: ['A6'], kept: 1, removed: 1, left: 0 },
		sent('A6', at('2026-10-20', '11:01')),
		{ at: at('2026-10-20', '12:00'), event: 'job-executed', items: ['A7'], kept: 1, removed: 0, left: 1 },
		closed('A8', at('2026-10-20'), { closedBy: 'nothing', status: 'No reply needed' }),
		sent('R1', at('2026-10-20'), { approvedBy: 'automation:R1', unchanged: undefined }),
		closed('A9', at('2026-10-20'), { closedBy: 'replied', status: 'You replied yourself' }),
	])
	assert.deepEqual(n.handled.codes, ['A1', 'A2', 'A3', 'A4'])
	assert.deepEqual([n.handled.reply, n.handled.changes, n.handled.nothing], [['A1', 'A2'], ['A3'], ['A4']], 'changes applied, then the reply: counted once, as changes')
	assert.equal(n.handled.n, 4)
})

test('R-NEX-11 handled for you: logs from before the new fields count where they can, and are left out where they cannot', () => {
	const n = run([
		...ticks(...WEEK),
		// Old: no closedBy on the close. The status says how it closed; a PR that moved on its own is not a job's finding.
		closed('A1', at('2026-10-19'), { status: 'Nothing needed: PR 7 was already merged' }),
		closed('A2', at('2026-10-19'), { status: 'Nothing needed: PR 8 was completed' }),
		{ at: at('2026-10-19'), event: 'pr-moved', code: 'A2', reason: 'PR 8 was completed' },
		closed('A3', at('2026-10-19'), { status: 'You replied yourself' }),
		// Old: changes applied with no item codes or counts cannot be told apart, so they are left out; the reply after them still counts.
		{ at: at('2026-10-20', '09:00'), event: 'job-executed', done: 1, left: 0 },
		sent('A4', at('2026-10-20', '09:01')),
		// Old: an edit then ok logged unchanged: true, but kept the draft it changed.
		sent('A5', at('2026-10-20'), { draft: 'Draft', text: 'Mine' }),
	])
	assert.deepEqual(n.handled.codes, ['A1', 'A4'])
	assert.deepEqual(n.handled.changes, [])
	assert.deepEqual(n.now.replies.teams, ['A3'], 'the old Teams-reply close is read from its status')
	assert.deepEqual(n.now.replies.edited, ['A5'])
})

test('R-NEX-11 handled for you: a correction within 7 days takes the item out, also from a past week; later ones and other items do not', () => {
	const raw = [
		...ticks(...LAST, ...WEEK),
		// A mark from before marks named their send: it is about the item's latest send before it.
		sent('A1', at('2026-10-12')), { at: at('2026-10-18'), event: 'marked', code: 'A1', kind: 'wrong' },
		sent('A2', at('2026-10-12')), { at: at('2026-10-19', '09:00'), event: 'undo', code: 'A2', msgId: `A2@${at('2026-10-12')}` },
		sent('A3', at('2026-10-12')), { at: at('2026-10-13'), event: 'notfyi', code: 'A3' },
		// A missed message that became part of A4 (joined into it).
		sent('A4', at('2026-10-12')), { at: at('2026-10-14'), event: 'missed', chat: 'c4', msgId: 'm4' },
		sent('A5', at('2026-10-12')), { at: at('2026-10-13'), event: 'correction', code: 'A5', sentId: `A5@${at('2026-10-12')}` },
		// 7 days and 1 hour later: too late to take it out.
		sent('A6', at('2026-10-12')), { at: at('2026-10-19', '11:00'), event: 'marked', code: 'A6', kind: 'incomplete' },
		// A correction of an edited reply, before the reply as drafted that fixed it: the fix counts.
		sent('A7', at('2026-10-13', '09:00'), { draft: 'D', text: 'E' }), { at: at('2026-10-13', '09:30'), event: 'marked', code: 'A7', kind: 'wrong' }, sent('A7', at('2026-10-13')),
		// A missed message in A0's chat that is not one of A0's, and one in another chat.
		sent('A0', at('2026-10-12')), { at: at('2026-10-13'), event: 'missed', chat: 'c4', msgId: 'x9' }, { at: at('2026-10-13'), event: 'missed', chat: 'c9', msgId: 'x8' },
	]
	const last = run(raw, 'last')
	assert.deepEqual(last.handled.codes, ['A6', 'A0', 'A7'], 'A1, A2, A3, A4, and A5 were corrected within 7 days')
	assert.deepEqual(run(raw, 'this', new Date('2026-10-13T00:00:00Z')).handled.codes, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A0'], 'before the corrections came, they counted')
})

test('R-NEX-11 handled for you: a correction takes out only the reply it is about; one on a later turn leaves the earlier ask counted', () => {
	const raw = [
		...ticks(...LAST, ...WEEK),
		// A1 answered on Monday, asked again and answered on Wednesday; Thursday's mark is about Wednesday's reply.
		sent('A1', at('2026-10-12')), sent('A1', at('2026-10-14')), { at: at('2026-10-15'), event: 'marked', code: 'A1', kind: 'wrong' },
		sent('A2', at('2026-10-12')), sent('A2', at('2026-10-14')), { at: at('2026-10-15'), event: 'undo', code: 'A2', msgId: `A2@${at('2026-10-14')}` },
		sent('A3', at('2026-10-12')), sent('A3', at('2026-10-14')), { at: at('2026-10-15'), event: 'marked', code: 'A3', kind: 'wrong', sentId: `A3@${at('2026-10-12')}` },
		// Changes, then the reply that went with them: a mark on that reply takes the item out.
		{ at: at('2026-10-12', '09:00'), event: 'job-executed', items: ['A5'], kept: 1, removed: 0, left: 0 }, sent('A5', at('2026-10-12', '09:01')),
		{ at: at('2026-10-13'), event: 'marked', code: 'A5', kind: 'incomplete', sentId: `A5@${at('2026-10-12', '09:01')}` },
		// A "Nothing needed" close has no send: only a "needs me" on it takes it out.
		{ at: at('2026-10-12'), event: 'state', code: 'A6', from: 'running', to: 'done', closedBy: 'job' }, { at: at('2026-10-13'), event: 'undo', code: 'A6', msgId: 'other' }, { at: at('2026-10-13'), event: 'marked', code: 'A6', kind: 'wrong' },
		{ at: at('2026-10-12'), event: 'state', code: 'A4', from: 'running', to: 'done', closedBy: 'job' }, { at: at('2026-10-13'), event: 'notfyi', code: 'A4' },
		// An undo names its message; an old mark is about the latest send before it, not a later one.
		sent('A7', at('2026-10-12')), sent('A7', at('2026-10-14')), { at: at('2026-10-15'), event: 'undo', code: 'A7', msgId: `A7@${at('2026-10-12')}` },
		sent('A8', at('2026-10-12')), { at: at('2026-10-13'), event: 'marked', code: 'A8', kind: 'wrong' }, sent('A8', at('2026-10-14')),
	]
	assert.deepEqual(run(raw, 'last').handled.codes, ['A1', 'A2', 'A6'])
})

test('R-NEX-11 a send that cannot be proven as drafted counts as neither: old lines after the 30-day redaction', () => {
	const gone = { text: undefined, draft: undefined }
	const n = run([
		...ticks(...WEEK),
		sent('A1', at('2026-10-19')),
		sent('A2', at('2026-10-19'), { draft: 'D', text: 'E' }),
		// Before 10-21 an edit then ok was logged unchanged: true; once the words are cleared, nothing shows which it was.
		sent('A3', at('2026-10-19'), gone),
		sent('A4', at('2026-10-19'), { ...gone, approvedBy: 'rule:r1', unchanged: false }),
		// From 10-21 the line says whether it was edited, and that survives the redaction.
		sent('A5', at('2026-10-19'), { ...gone, v: 2, edited: false }),
		sent('A6', at('2026-10-19'), { ...gone, v: 2, edited: true, unchanged: false }),
		sent('A7', at('2026-10-19'), { ...gone, unchanged: false }),
		sent('A8', at('2026-10-19'), { v: 2, edited: true }),
		// Sent with "send" rather than ok: not the owner's ok on the draft as shown.
		sent('A9', at('2026-10-19'), { v: 2, edited: false, unchanged: false }),
	])
	assert.deepEqual(n.now.replies, { drafted: ['A1', 'A4', 'A5'], edited: ['A2', 'A6', 'A7', 'A8', 'A9'], teams: [], unknown: ['A3'], n: 3, of: 8 })
	assert.deepEqual(n.handled.codes, ['A1', 'A4', 'A5'])
	assert.match(numbersText(n), /1 sent before 10-21 can no longer be checked/)
})

test('R-NEX-11 a holding reply is not handled and not a reply as drafted, but it ends the asker\'s wait', () => {
	const n = run([...ticks(...WEEK), sent('A1', at('2026-10-19', '10:30'), { holding: true, askAt: at('2026-10-19', '10:00') }), sent('A2', at('2026-10-19'))])
	assert.deepEqual([n.handled.codes, n.now.replies.drafted, n.now.replies.of, n.now.wait.codes], [['A2'], ['A2'], 1, ['A1']])
})

test('R-NEX-11 handled for you: an item counts once, in the week of its first close, and closes in the last 7 days are provisional', () => {
	const raw = [
		...ticks(...LAST, ...WEEK),
		sent('A1', at('2026-10-13')), sent('A1', at('2026-10-20')),
		sent('A2', at('2026-10-13'), { draft: 'Draft', text: 'Mine' }), sent('A2', at('2026-10-20')),
		sent('A3', at('2026-10-15')), sent('A4', at('2026-10-14', '11:00')),
	]
	assert.deepEqual(run(raw, 'last').handled.codes, ['A1', 'A4', 'A3'])
	assert.deepEqual(run(raw, 'this').handled.codes, ['A2'], 'an edited first reply does not stop a later one as drafted')
	assert.deepEqual(run(raw, '4w').handled.codes, ['A1', 'A4', 'A3', 'A2'])
	assert.deepEqual(run(raw, 'last').handled.provisional, ['A3'], 'A1 closed 8 days ago, A4 7 days and 1 hour ago; A3 6 days ago')
})

test('R-NEX-11 two machines: one item is counted once, and the same line copied twice counts once', () => {
	const mac = [...ticks('2026-10-19'), sent('A1', at('2026-10-19')), closed('A2', at('2026-10-19'), { closedBy: 'replied', askAt: at('2026-10-19', '09:00'), replyAt: at('2026-10-19', '09:30') })]
	const win = [...ticks('2026-10-20'), sent('A1', at('2026-10-20')), closed('A2', at('2026-10-19'), { closedBy: 'replied', askAt: at('2026-10-19', '09:00'), replyAt: at('2026-10-19', '09:30') }), { at: at('2026-10-20'), event: 'job-executed', items: ['A1'], kept: 1, removed: 0, left: 0 }]
	const n = numbers([...slim(mac), ...slim(win)], items, NOW, TZ, 'this')
	assert.deepEqual(n.handled.codes, ['A1'])
	assert.deepEqual(n.handled.reply, ['A1'], 'the first close decides how it counts')
	assert.deepEqual(n.now.replies.teams, ['A2'], 'the same close on both machines (a synced copy) counts once')
	assert.equal(n.now.wait.n, 1)
	assert.deepEqual(n.bars.at(-1)!.gaps, [], 'a day read by either machine is not a gap')
})

test('R-NEX-11 replies as drafted: sends as drafted over every reply, including the ones typed in Teams', () => {
	const n = run([
		...ticks(...WEEK),
		sent('A1', at('2026-10-19')), sent('A2', at('2026-10-19'), { approvedBy: 'rule:r1', unchanged: false }),
		sent('A3', at('2026-10-19'), { unchanged: false, verb: 'send' }), sent('A4', at('2026-10-19'), { draft: 'D', text: 'E' }),
		closed('A5', at('2026-10-20'), { closedBy: 'replied' }), closed('A6', at('2026-10-20'), { closedBy: 'skipped' }),
		// Replayed after a gap, an item can close, reopen, and close again within seconds: one item the owner answered in Teams.
		closed('A5', at('2026-10-20', '10:01'), { closedBy: 'replied' }),
		sent('R1', at('2026-10-20'), { approvedBy: 'automation:R1' }),
	])
	assert.deepEqual(n.now.replies, { drafted: ['A1', 'A2'], edited: ['A3', 'A4'], teams: ['A5'], unknown: [], n: 2, of: 5 })
})

test('R-NEX-11 small sample: below 10 a ratio is a count; from 10 it has a percentage, and an arrow needs 10 in both weeks', () => {
	const many = (n: number, day: string, from = 0) => Array.from({ length: n }, (_, i) => sent(`A${from + i + 1}`, at(day, `10:${String(i).padStart(2, '0')}`)))
	const r9 = run([...ticks(...LAST, ...WEEK), ...many(9, '2026-10-19'), closed('A99', at('2026-10-19'), { closedBy: 'replied' })])
	assert.equal(r9.now.replies.of, 10)
	assert.equal(r9.now.replies.pct, 90)
	const r8 = run([...ticks(...LAST, ...WEEK), ...many(8, '2026-10-19'), closed('A99', at('2026-10-19'), { closedBy: 'replied' })])
	assert.equal(r8.now.replies.pct, undefined, '8 of 9 stays a count')
	assert.match(numbersText(r8), /8 of 9 this week\b(?! \()/)
	assert.match(numbersText(r9), /9 of 10 this week \(90%\)/)
	const up = run([...ticks(...LAST, ...WEEK), ...many(10, '2026-10-13'), ...many(12, '2026-10-20', 20)])
	assert.equal(up.handled.before, 10); assert.equal(up.handled.arrow, 'up')
	assert.match(numbersText(up), /▲ 2 more than last week \(10\)/)
	const few = run([...ticks(...LAST, ...WEEK), ...many(9, '2026-10-13'), ...many(12, '2026-10-20', 20)])
	assert.equal(few.handled.arrow, undefined, 'last week had 9')
	assert.doesNotMatch(numbersText(few), /[▲▼]/)
	assert.equal(run([...ticks(...LAST, ...WEEK), ...many(12, '2026-10-13'), ...many(10, '2026-10-20', 20)]).handled.arrow, 'down')
	assert.equal(run([...ticks(...LAST, ...WEEK), ...many(10, '2026-10-13'), ...many(10, '2026-10-20', 20)]).handled.arrow, 'same')
	assert.equal(run([...ticks(...LAST, ...WEEK), ...many(12, '2026-10-13'), ...many(9, '2026-10-20', 20)]).handled.arrow, undefined, 'this week has 9')
})

test('R-NEX-11 missed: messages the owner pointed at and Catch up lines moved to Needs me, over every ask counted once', () => {
	const n = run([
		...ticks(...WEEK),
		...['A1', 'A2', 'A3', 'A4', 'A7'].map(c => ({ at: at('2026-10-19'), event: 'state', code: c, from: 'new', to: 'running' })),
		{ at: at('2026-10-12'), event: 'state', code: 'A6', from: 'new', to: 'running' }, closed('A5', at('2026-10-19'), { from: 'running', closedBy: 'nothing' }),
		{ at: at('2026-10-20'), event: 'notfyi', code: 'A6' },
		// Closed with no reply needed and never answered: not an ask. A2 too, until the owner said it needed them.
		closed('A3', at('2026-10-19', '11:00'), { from: 'running', closedBy: 'nothing' }), closed('A2', at('2026-10-19', '11:00'), { from: 'running', closedBy: 'nothing' }),
		closed('A1', at('2026-10-19', '11:00'), { from: 'running', closedBy: 'nothing' }), sent('A1', at('2026-10-19', '10:30')),
		{ at: at('2026-10-20'), event: 'missed', chat: 'c4', msgId: 'm4' },
		{ at: at('2026-10-20'), event: 'missed', chat: 'c8', msgId: 'gone' }, { at: at('2026-10-20'), event: 'missed', chat: 'c8', msgId: 'gone2' },
		// Closed with no reply needed, then reopened and answered in Teams: an ask.
		{ at: at('2026-10-19'), event: 'state', code: 'A0', from: 'new', to: 'running' }, closed('A0', at('2026-10-19', '11:00'), { from: 'running', closedBy: 'nothing' }), closed('A0', at('2026-10-20', '11:00'), { from: 'running', closedBy: 'replied' }),
		{ at: at('2026-10-20'), event: 'notfyi', code: 'A2' },
	])
	assert.deepEqual(n.now.missed.pointed, ['A4', 'missed:gone', 'missed:gone2'], 'a missed message is its item, or the link when no item was made; two at the same moment are two')
	assert.deepEqual(n.now.missed.mine, ['A6', 'A2'])
	assert.equal(n.now.missed.n, 5)
	assert.equal(n.now.missed.of, 7, 'A0 A1 A2 A4, A6 made last week, and the two links: a watch, a close, and A3 (no reply needed) are not asks; A2 and A4 count once')
	assert.deepEqual([...n.now.missed.asks].sort(), ['A0', 'A1', 'A2', 'A4', 'A6', 'missed:gone', 'missed:gone2'], 'the page opens exactly the asks it divided by')
})

test('R-NEX-11 asker wait: median, shortest, and longest from the ask to the first reply, from sends and Teams replies alike', () => {
	const n = run([
		...ticks(...WEEK),
		sent('A1', at('2026-10-19', '10:04'), { askAt: at('2026-10-19', '10:00') }),
		sent('A2', at('2026-10-19', '11:00'), { askAt: at('2026-10-19', '10:00') }),
		closed('A3', at('2026-10-20', '12:00'), { closedBy: 'replied', askAt: at('2026-10-20', '10:00'), replyAt: at('2026-10-20', '10:20') }),
		sent('A4', at('2026-10-20', '19:00'), { askAt: at('2026-10-20', '10:00') }),
		// No ask time (an old log), or a clock that ran backwards: left out.
		sent('A5', at('2026-10-20')), sent('A6', at('2026-10-20', '09:00'), { askAt: at('2026-10-20', '10:00') }),
	])
	assert.deepEqual(n.now.wait, { n: 4, median: 40, min: 4, max: 540, codes: ['A1', 'A3', 'A2', 'A4'] })
	assert.match(numbersText(n), /median 40 min · from 4 min to 9 h/)
	assert.equal(run([...ticks(...WEEK), sent('A1', at('2026-10-19', '10:04'), { askAt: at('2026-10-19', '10:00') }), sent('A2', at('2026-10-19', '11:00'), { askAt: at('2026-10-19', '10:00') }), sent('A4', at('2026-10-20', '19:00'), { askAt: at('2026-10-20', '10:00') })]).now.wait.median, 60, 'odd: the middle one')
})

test('R-NEX-11 asker wait: the ask is the first message of the turn, from the item, after the owner last spoke', () => {
	const m = (id: string, hm: string, byOwner = false) => ({ id, at: at('2026-10-20', hm), byOwner })
	assert.equal(askAtOf([m('a', '09:00'), m('o', '09:10', true), m('x', '09:20'), m('b', '09:30'), m('c', '09:40')], ['a', 'b', 'c']), at('2026-10-20', '09:30'))
	assert.equal(askAtOf([m('a', '09:00'), m('b', '09:30')], ['a', 'b']), at('2026-10-20', '09:00'))
	assert.equal(askAtOf([m('a', '09:00'), m('o', '09:10', true)], ['a']), undefined, 'already answered')
	assert.equal(askAtOf([], ['a']), undefined)
})

test('R-NEX-11 corrections per 100 sends over 4 weeks, each item once', () => {
	const sends = Array.from({ length: 50 }, (_, i) => sent(`A${i + 1}`, at(i < 25 ? '2026-10-05' : '2026-10-20', `10:${String(i % 60).padStart(2, '0')}`)))
	const n = run([
		...ticks(...WEEK), ...sends, sent('A0', at('2026-09-20')),
		{ at: at('2026-10-20'), event: 'marked', code: 'A1', kind: 'unneeded' }, { at: at('2026-10-20'), event: 'undo', code: 'A1' },
		{ at: at('2026-10-20'), event: 'marked', code: 'A2', kind: 'wrong' },
		{ at: at('2026-09-20'), event: 'marked', code: 'A0', kind: 'wrong' },
	])
	assert.deepEqual(n.corrections, { codes: ['A1', 'A2'], n: 2, sends: 50, per100: 4, sent: sends.map(e => e.code) })
	assert.match(numbersText(n), /Corrections: 4 per 100 sends over 4 weeks \(2 of 50; keep it under 2\)/)
	assert.match(numbersText(run([...ticks(...WEEK), sent('A1', at('2026-10-20')), { at: at('2026-10-20'), event: 'undo', code: 'A1' }])), /Corrections: 1 of 1 sends over 4 weeks/)
})

test('R-NEX-11 8 weekly bars: days no machine read are gaps, today and days before the first read are not', () => {
	const n = run([...ticks('2026-10-07', '2026-10-08', '2026-10-12', '2026-10-13', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'), sent('A1', at('2026-10-13'))])
	assert.equal(n.bars.length, 8)
	assert.deepEqual(n.bars.map(b => b.week), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'])
	assert.deepEqual(n.bars.map(b => b.before), [true, true, true, true, true, false, false, false])
	assert.deepEqual(n.bars[5].gaps, ['2026-10-09', '2026-10-10', '2026-10-11'], 'from the first read on')
	assert.deepEqual(n.bars[6].gaps, ['2026-10-14', '2026-10-15'])
	assert.deepEqual(n.bars[7].gaps, ['2026-10-20'], 'Tuesday had no read; Wednesday is today')
	assert.deepEqual(n.bars.map(b => b.n), [0, 0, 0, 0, 0, 0, 1, 0])
	assert.match(numbersText(n), /▒ = no machine was reading: Oct 9, Oct 10, Oct 11, Oct 14, Oct 15, Oct 20/)
	assert.equal(n.firstWeek, false)
	const first = run([...ticks('2026-10-20'), sent('A1', at('2026-10-20'))])
	assert.equal(first.firstWeek, true)
	assert.match(numbersText(first), /Your first week\. Trends start next week\./)
	assert.deepEqual(first.bars.at(-1)!.gaps, [], 'Monday came before the first read')
})

test('R-NEX-11 windows: this week to now, last week Monday to Sunday, 4 weeks, and since you started', () => {
	const raw = [...ticks('2026-09-10', ...LAST, ...WEEK), sent('A1', at('2026-09-10')), sent('A2', at('2026-09-28')), sent('A3', at('2026-10-18', '23:59')), sent('A4', at('2026-10-19', '00:00'))]
	assert.deepEqual([run(raw, 'this').handled.codes, run(raw, 'last').handled.codes, run(raw, '4w').handled.codes, run(raw, 'all').handled.codes], [['A4'], ['A3'], ['A2', 'A3', 'A4'], ['A1', 'A2', 'A3', 'A4']])
	assert.deepEqual([run(raw, 'this').window, run(raw, 'last').window], [{ key: 'this', from: '2026-10-19', to: '2026-10-21', label: 'This week (Mon Oct 19 to today)' }, { key: 'last', from: '2026-10-12', to: '2026-10-18', label: 'Last week (Mon Oct 12 to Sun Oct 18)' }])
	assert.equal(run(raw, '4w').window.from, '2026-09-28')
	assert.equal(run(raw, 'all').window.from, '2026-09-07')
	assert.equal(run(raw, '4w').handled.before, 1, 'the 4 weeks before')
})

test('R-NEX-11 the log kept for counting holds codes and times only: no message text, no names, and the first and last read of each hour', () => {
	const s = slim([
		...ticks('2026-10-20', '2026-10-20'), { at: at('2026-10-20', '09:20'), event: 'tick' }, { at: at('2026-10-20', '09:40'), event: 'tick' }, { at: at('2026-10-20', '11:00'), event: 'tick' },
		sent('A1', at('2026-10-20'), { text: 'Secret plan', asker: { id: 'kim', name: 'Kim' }, draft: 'Secret', ask: 'Plan?' }),
		{ at: at('2026-10-20'), event: 'marked', code: 'A1', kind: 'wrong', note: 'Kim was wrong', sent: 'Secret plan' },
		{ at: at('2026-10-20'), event: 'missed', chat: 'c1', msgId: 'm1', text: 'Secret', from: { name: 'Kim' } },
		{ at: at('2026-10-20'), event: 'worker', code: 'A1', summary: 'Secret' }, { event: 'sent', code: 'A2' },
	])
	assert.doesNotMatch(JSON.stringify(s), /Secret|Kim|Plan/)
	assert.deepEqual(s.map(e => e.event), ['sent', 'marked', 'missed', 'tick', 'tick', 'tick'], 'the first and last read of each UTC hour, so a day in any zone keeps its reads')
	assert.deepEqual(s.filter(e => e.event === 'tick').map(e => e.at), [at('2026-10-20', '09:00'), at('2026-10-20', '09:40'), at('2026-10-20', '11:00')])
})

test('R-NEX-11 the Friday line: handled, replies as drafted, and missed, never a time', () => {
	const n = run([...ticks(...WEEK), sent('A1', at('2026-10-19'), { askAt: at('2026-10-19', '01:00') }), sent('A2', at('2026-10-19'), { draft: 'a', text: 'b' }), closed('A3', at('2026-10-20'), { closedBy: 'replied' }), { at: at('2026-10-20'), event: 'notfyi', code: 'A5' }])
	assert.equal(weekLine(n), 'This week: 1 handled for you · 1 of 3 replies as drafted · 1 missed.')
	assert.doesNotMatch(weekLine(n)!, /\d+ ?(h|min|hours?|minutes?)\b/)
	assert.equal(weekLine(run(ticks(...WEEK))), undefined, 'a week with nothing in it adds no line')
})

test('R-NEX-11 every number carries the codes it counted', () => {
	const n = run([...ticks(...WEEK), sent('A1', at('2026-10-19'), { askAt: at('2026-10-19', '09:00') }), sent('A2', at('2026-10-19'), { draft: 'a', text: 'b' }), { at: at('2026-10-20'), event: 'notfyi', code: 'A5' }])
	assert.deepEqual(n.handled.codes, ['A1'])
	assert.deepEqual([n.now.replies.drafted, n.now.replies.edited, n.now.missed.mine, n.now.wait.codes, n.corrections.codes], [['A1'], ['A2'], ['A5'], ['A1'], []])
	assert.match(numbersText(n), /See all 1: A1/)
})

test('R-NEX-11 months of log count in well under a second: corrections and missed messages are looked up, not scanned for every close', () => {
	const t0 = Date.parse('2026-07-01T00:00:00Z'), iso = (ms: number) => new Date(ms).toISOString()
	const raw = Array.from({ length: 20_000 }, (_, i) => [sent(`A${i}`, iso(t0 + i * 300_000)), { at: iso(t0 + i * 300_000 + 1000), event: 'marked', code: `A${i + 1}`, kind: 'wrong' }, { at: iso(t0 + i * 300_000), event: 'tick' }]).flat()
	const ev = slim(raw), start = performance.now()
	for (const key of ['this', 'all'] as const) numbers(ev, items, NOW, TZ, key)
	// Linear: about 0.5 s here and up to ~6 s on a loaded CI runner (10-21). Scanning every event per close took minutes at this size.
	assert.ok(performance.now() - start < 20_000, `took ${Math.round(performance.now() - start)} ms`)
})

// Review P1-2: "1 of 24 sends" opened a list of 12, because an item that sent twice was listed once. And holding replies say the
// answer is coming: they are not replies sent, so "per 100 replies sent" leaves them out.
test('R-NEX-11 corrections: the sends list is every send counted, an item that sent twice twice, and holding replies are not sends', () => {
	const n = run([
		...ticks(...WEEK),
		// A1 answered, then followed up: two replies sent. A2 sent a holding reply, then the real one. A3 sent once.
		sent('A1', at('2026-10-19', '10:00')), sent('A1', at('2026-10-20', '10:00')),
		sent('A2', at('2026-10-19', '11:00'), { holding: true }), sent('A2', at('2026-10-19', '15:00')),
		sent('A3', at('2026-10-20', '11:00')),
		{ at: at('2026-10-20', '12:00'), event: 'marked', code: 'A3', kind: 'wrong' },
	])
	assert.equal(n.corrections.sends, 4, 'A1 twice, A2 once (not its holding reply), A3 once')
	assert.deepEqual([...n.corrections.sent].sort(), ['A1', 'A1', 'A2', 'A3'])
	const d = { ...n, rows: {}, missed: {} }
	assert.equal(listsOf(d).sends.groups.flatMap(g => g.codes).length, n.corrections.sends, 'the list a count opens is as long as the count')
	assert.match(numbersText(n), /Corrections: 1 of 4 sends over 4 weeks/)
	// Ten items with a holding reply each, then the real one: 10 sends, not 20.
	const many = run([...ticks(...WEEK), ...Array.from({ length: 10 }, (_, i) => [sent(`B${i}`, at('2026-10-20', `0${i}:00`), { holding: true }), sent(`B${i}`, at('2026-10-20', `1${i}:00`))]).flat(), { at: at('2026-10-20', '21:00'), event: 'marked', code: 'B1', kind: 'wrong' }])
	assert.deepEqual([many.corrections.sends, many.corrections.per100], [10, 10])
})
