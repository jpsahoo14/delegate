// N1b (dev-spec/new-experience.md §0): the runner stamps where each item stands and when it really changed, /seen keeps a mark
// per item, and the new page says New and Back to you from them. The made-up people are Robin (the owner), Kim, Rita, and Dev.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-n1blocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { item } = await import('./fixture.ts')
const { stampPlaces } = await import('../src/runner/place.ts')
import type { Workflow } from '../src/core/types.ts'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
type S = InstanceType<typeof Store>

function setup(): S {
	const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-n1broot-')), machine: 'mac' })
	store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 2 } as never)
	store.saveChats({ startedAt: ago(600), seen: {}, readAt: ago(1), goodAt: ago(1) })
	return store
}
const work = (over: Partial<NonNullable<Workflow['work']>>) => ({ goal: 'Ship the fix', doneWhen: 'merged', steps: [], links: [], ...over })
const get = (s: S, code: string) => s.byCode(code)!
const edit = (s: S, code: string, over: Partial<Workflow>, touch = false) => s.save({ ...get(s, code), ...over }, touch)

test('N1b place: the first stamp after an upgrade places every item since it was made and marks nothing new', () => {
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300), draft: { text: 'Yes.', commitment: false, sources: [] } })
	item(s, 'A2', 'Rita Vale', 'Release sync', { createdAt: ago(200), state: 'open', status: 'In progress', work: work({ next: { who: 'them', what: 'Rita sends the logs' } }) })
	const before = get(s, 'A1').updatedAt
	assert.equal(stampPlaces(s, Date.now()), 2)
	assert.deepEqual([get(s, 'A1').place?.section, get(s, 'A1').place?.rule, get(s, 'A1').place?.since], ['move', 'needs-you', get(s, 'A1').createdAt])
	assert.deepEqual([get(s, 'A2').place?.section, get(s, 'A2').place?.since], ['waiting', get(s, 'A2').createdAt])
	assert.equal(get(s, 'A1').changedAt, undefined, 'an item from before the upgrade is not new')
	assert.equal(get(s, 'A1').updatedAt, before, 'stamping never touches updatedAt, which the queue orders by')
	assert.equal(stampPlaces(s, Date.now()), 0, 'nothing changed: nothing is saved')
})

test('N1b place: an item made after the last stamp is new from when it was made', () => {
	const s = setup()
	stampPlaces(s, Date.now() - 60_000)
	item(s, 'A3', 'Dev Moss', 'Team chat', { createdAt: ago(0.5) })
	stampPlaces(s, Date.now())
	assert.equal(get(s, 'A3').changedAt, get(s, 'A3').createdAt)
})

test('N1b place: a move stamps since and changedAt; a new rule in the same section stamps neither (review P1-1)', () => {
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300), state: 'open', status: 'In progress', work: work({ next: { who: 'them', what: 'Kim answers' } }) })
	s.saveJob({ schema: 1, id: 'j1', key: 'k', goal: 'Review PR 2204', session: { agent: 'copilot', id: 's' }, state: 'running', purpose: 'work', parents: [], asks: [], createdAt: ago(5), updatedAt: ago(5) } as never)
	stampPlaces(s, Date.now() - 120_000)
	const t1 = Date.now() - 60_000
	edit(s, 'A1', { work: { ...get(s, 'A1').work!, next: { who: 'you', what: 'Try the form on staging' } } })
	stampPlaces(s, t1)
	assert.deepEqual([get(s, 'A1').place?.section, get(s, 'A1').place?.rule, get(s, 'A1').place?.since, get(s, 'A1').changedAt], ['move', 'your-step', new Date(t1).toISOString(), new Date(t1).toISOString()], 'into Your move: a move')
	const t2 = Date.now()
	edit(s, 'A1', { state: 'needs_human', draft: undefined })
	stampPlaces(s, t2)
	assert.deepEqual([get(s, 'A1').place?.rule, get(s, 'A1').place?.since, get(s, 'A1').changedAt], ['needs-you', new Date(t1).toISOString(), new Date(t1).toISOString()], 'still Your move: not a move, so since stays when it entered')
})

test('N1b changedAt: a new turn, a new draft by Delegate, and a news step change it; an edit by the owner, a plain step, and a build check do not', () => {
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300), draft: { text: 'Yes.', commitment: false, sources: [] } })
	item(s, 'A2', 'Rita Vale', 'Release sync', { createdAt: ago(300), state: 'open', status: 'In progress', work: work({ next: { who: 'them', what: 'Rita sends the logs' } }) })
	stampPlaces(s, Date.now() - 600_000)
	const at = (n: number) => new Date(Date.now() - n * 60_000).toISOString()
	// A build check saves every home, touching updatedAt (runner/probe.ts): not a change.
	edit(s, 'A1', {}, true); edit(s, 'A2', {}, true)
	stampPlaces(s, Date.now() - 500_000)
	assert.deepEqual([get(s, 'A1').changedAt, get(s, 'A2').changedAt], [undefined, undefined], 'a save is not a change')
	edit(s, 'A1', { draft: { text: 'Yes, final.', commitment: false, sources: [], byOwner: true } })
	edit(s, 'A2', { work: { ...get(s, 'A2').work!, steps: [{ at: at(8), what: 'You asked Rita for the logs' }] } })
	stampPlaces(s, Date.now() - 480_000)
	assert.deepEqual([get(s, 'A1').changedAt, get(s, 'A2').changedAt], [undefined, undefined], "the owner's own edit and step are not news to the owner")
	edit(s, 'A1', { lastMsgId: 'm-2', msgIds: ['m-A1', 'm-2'] })
	const t7 = at(7); stampPlaces(s, Date.parse(t7))
	assert.equal(get(s, 'A1').changedAt, t7, 'a new turn')
	edit(s, 'A1', { draft: { text: 'Yes, the plan is final.', commitment: false, sources: [] } })
	const t6 = at(6); stampPlaces(s, Date.parse(t6))
	assert.equal(get(s, 'A1').changedAt, t6, 'a new draft')
	edit(s, 'A2', { work: { ...get(s, 'A2').work!, steps: [...get(s, 'A2').work!.steps, { at: at(5), what: 'Build 991 succeeded', news: true }] } })
	const t5 = at(5); stampPlaces(s, Date.parse(t5))
	assert.equal(get(s, 'A2').changedAt, t5, 'a news step')
})

test('N1b changedAt: a watch moving does not touch its Changed mark, which only a new check result sets', () => {
	const s = setup()
	s.saveJob({ schema: 1, id: 'jw', key: 'k', goal: 'Watch PR 9000', session: { agent: 'copilot', id: 's' }, state: 'done', every: 60, purpose: 'work', parents: [], asks: [], createdAt: ago(5), updatedAt: ago(5) } as never)
	const was = ago(100)
	item(s, 'A9', 'Robin Park', 'Watching', { createdAt: ago(300), kind: 'tracker', state: 'waiting_on_task', job: 'jw', changedAt: was, ackAt: ago(50) })
	stampPlaces(s, Date.now() - 60_000)
	assert.equal(get(s, 'A9').place?.section, 'waiting')
	s.saveJob({ ...s.job('jw')!, state: 'failed', every: undefined })
	stampPlaces(s, Date.now())
	assert.deepEqual([get(s, 'A9').place?.section, get(s, 'A9').changedAt], ['move', was], 'classic and Now keep "Changed" off: nothing new was checked')
})

test('N1b changedAt: on work with a watch, a real change is New, never "Changed", which is a watch\'s new result only', async () => {
	const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
	const s = setup()
	s.saveJob({ schema: 1, id: 'jw', key: 'k', goal: 'Watch build 991', session: { agent: 'copilot', id: 's' }, state: 'done', every: 60, purpose: 'work', parents: [], asks: [], createdAt: ago(5), updatedAt: ago(5) } as never)
	item(s, 'A5', 'Dev Moss', 'Team chat', { createdAt: ago(300), state: 'waiting_on_task', job: 'jw', changedAt: ago(1), work: work({ watch: 'jw', next: { who: 'me', what: 'Delegate checks the build' } }) })
	const r = rowsOf(snapshot(s), place(snapshot(s))).find(r => r.act === 'A5')!
	assert.equal(r.kind, 'watch')
	assert.deepEqual(r.chips.filter(c => c.kind === 'changed'), [])
})

test('N1b seen: /seen keeps a mark per item for codes that exist, forward-only, and drops it 7 days after the item is done', async () => {
	const { serveInbox } = await import('../src/web/server.ts')
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300) })
	item(s, 'A2', 'Rita Vale', 'Release sync', { createdAt: ago(9 * 1440), state: 'done', updatedAt: ago(8 * 1440) })
	item(s, 'A3', 'Dev Moss', 'Team chat', { createdAt: ago(3 * 1440), state: 'done', updatedAt: ago(2 * 1440) })
	s.saveWaiting([{ code: 'W1', chat: { id: 'c', name: 'Launch' }, msgId: '1', at: ago(60), to: ['Kim Lane'], text: 'Can you send the slides?', state: 'waiting' }])
	const { url, server } = await serveInbox(() => s)
	const post = (body: unknown) => fetch(url.replace('/?', '/seen?'), { method: 'POST', body: JSON.stringify(body) })
	try {
		const shown = ago(1)
		assert.equal((await post({ filters: ['item:A1', 'item:a3', 'item:W1', 'item:A99', 'item:', 'item:A1;x', 'catchup'], at: shown })).status, 200)
		assert.deepEqual(s.seen(), { 'item:A1': shown, 'item:A3': shown, 'item:W1': shown, catchup: shown }, 'only codes that exist, in capitals')
		// Review P2-7: the prefix is lower case only; "ITEM:A1" would be kept as a key nothing reads or prunes.
		await post({ filters: ['ITEM:A1', 'Item:A3'], at: shown })
		assert.deepEqual(Object.keys(s.seen()).sort(), ['catchup', 'item:A1', 'item:A3', 'item:W1'])
		await post({ filters: ['item:A1'], at: ago(10) })
		assert.equal(s.seen()['item:A1'], shown, 'forward-only, like the filter marks')
		// 200 rows' marks in one post fit.
		assert.equal((await post({ filters: Array.from({ length: 200 }, (_, i) => `item:A${i + 1}`), at: shown })).status, 200)
		// A done item's mark goes 7 days after it closed; an old file's stale key goes on the next post.
		const f = join(s.root, 'state', 'seen', 'mac.json')
		const { readFileSync, writeFileSync } = await import('node:fs')
		writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), 'item:A2': ago(8 * 1440) }))
		await post({ filters: ['item:A1'], at: shown })
		assert.deepEqual(Object.keys(s.seen()).sort(), ['catchup', 'item:A1', 'item:A3', 'item:W1'])
	} finally { (server.closeAllConnections?.(), server.close()) }
})

test('N1b rows: each row carries when its thread last really changed, when it came back to you, and when it was made', async () => {
	const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
	const s = setup()
	stampPlaces(s, Date.now() - 3_600_000)
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300), state: 'open', status: 'In progress', work: work({ next: { who: 'them', what: 'Kim answers' } }) })
	item(s, 'A2', 'Dev Moss', 'Dev Moss', { createdAt: ago(200), state: 'open', status: 'Part of A1', partOf: 'w-A1' })
	item(s, 'A3', 'Rita Vale', 'Release sync', { createdAt: ago(20), draft: { text: 'Yes.', commitment: false, sources: [] } })
	s.save({ ...get(s, 'A1'), work: { ...get(s, 'A1').work!, parts: ['w-A2'] } }, false)
	stampPlaces(s, Date.now() - 1_800_000)
	// Kim's step comes back to the owner; later Dev's part has news.
	edit(s, 'A1', { work: { ...get(s, 'A1').work!, next: { who: 'you', what: 'Try the form on staging' } } })
	const back = Date.now() - 600_000; stampPlaces(s, back)
	edit(s, 'A2', { lastMsgId: 'm-2', msgIds: ['m-A2', 'm-2'] })
	const news = Date.now() - 60_000; stampPlaces(s, news)
	const rows = rowsOf(snapshot(s), place(snapshot(s)))
	const r1 = rows.find(r => r.code === 'A1')!, r3 = rows.find(r => r.code === 'A3')!
	assert.deepEqual(r1.fresh, { born: get(s, 'A1').createdAt, changed: new Date(news).toISOString(), back: new Date(back).toISOString() }, 'a part\'s news is the thread\'s')
	assert.deepEqual(r3.fresh, { born: get(s, 'A3').createdAt, changed: get(s, 'A3').createdAt }, 'made in Your move: new, never back')
	// Between cycles the stamp can be behind: a row no longer in Your move is never Back to you.
	edit(s, 'A1', { work: { ...get(s, 'A1').work!, next: { who: 'them', what: 'Kim answers' } } })
	const r1b = rowsOf(snapshot(s), place(snapshot(s))).find(r => r.code === 'A1')!
	assert.deepEqual([r1b.section, r1b.fresh?.back], ['waiting', undefined])
})

test('N1b marks: New is a change after the later of the item and filter marks; Back to you needs an item the owner saw before', async () => {
	const { freshOf, rowMark, isNew, newCount, seenIn, itemSeen } = await import('../src/web/app/model/derive.ts')
	const t = (h: number) => `2026-10-21T${String(h).padStart(2, '0')}:00:00.000Z`
	const v = { since: t(8), seen: { 'item:A1': t(10), catchup: t(11) } } as never
	const row = (code: string, section: string, fresh?: object) => ({ code, act: code, section, fresh }) as never
	assert.equal(rowMark(v, row('A1', 'move')), t(10), 'the item mark, later than the visit')
	assert.equal(rowMark(v, row('A2', 'move')), t(8), 'no item mark: the start of this visit')
	assert.equal(rowMark(v, row('A2', 'catchup')), t(11), "a Catch up row: Catch up's mark")
	assert.equal(rowMark({ since: t(8), seen: { 'item:A5': t(12) } } as never, { code: 'A1', act: 'A5', section: 'move' } as never), t(12), "a part's own mark, when the part places its home's row")
	assert.equal(freshOf(row('A1', 'move', { born: t(1), changed: t(9) }), t(10)), undefined, 'changed before the owner looked')
	assert.equal(freshOf(row('A1', 'move', { born: t(1), changed: t(12) }), t(10)), 'new')
	assert.equal(freshOf(row('A1', 'move', { born: t(1), changed: t(12), back: t(12) }), t(10)), 'back', 'Back to you says more than New')
	assert.equal(freshOf(row('A1', 'move', { born: t(11), changed: t(12), back: t(12) }), t(10)), 'new', 'never seen before: New, not Back')
	assert.equal(freshOf(row('A1', 'move', { born: t(1), back: t(9) }), t(10)), undefined, 'back before the owner looked')
	assert.equal(freshOf(row('A1', 'move'), ''), undefined, 'no data, no marker')
	assert.equal(freshOf({ ...row('A8', 'waiting', { born: t(1), changed: t(12) }) as object, chips: [{ kind: 'changed', text: 'Changed' }] } as never, t(10)), undefined, 'a watch says Changed, not New too')
	// Done: a row the owner already saw on Now is not new in Done either, in both experiences.
	const done = { code: 'A1', kind: 'reply', at: t(9), by: 'by rule R1', who: { name: 'Kim' } } as never
	assert.equal(isNew(done, () => t(8)), true)
	assert.equal(isNew(done, () => t(8), itemSeen(v)), false)
	assert.equal(newCount({ ...(v as object), done: [done] } as never), 0)
	assert.equal(isNew(done, seenIn({ ...(v as object), seen: {} } as never), itemSeen({ seen: {} } as never)), true)
})

test('N1b find: a person, a chat, a PR or work-item number, or words in an ask, goal, or gist, across Now and Done', async () => {
	const { find, teamsMessage } = await import('../src/web/app/model/find.ts')
	const { whoOf } = await import('../src/web/app/model/format.ts')
	const nrow = (code: string, o: object) => ({ code, act: code, section: 'move', rule: 'needs-you', kind: 'reply', headline: '', facts: { at: '' }, chips: [], ...o })
	const v = {
		next: {
			move: [
				nrow('A1', { headline: 'Send reply to Kim', who: whoOf('Kim Lane'), facts: { who: 'Kim Lane', where: 'Spec review', at: '', quote: { by: 'Kim Lane', verb: 'asked', text: 'Is the plan for PR 2204 final?' } }, teams: 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000001' }),
				nrow('A2', { headline: 'Try the sign-up form on staging', facts: { who: 'Pete Hale', at: '', notes: [{ label: 'Goal', text: 'Test sign-up on the new form' }] } }),
			],
			working: [], waiting: [nrow('A3', { section: 'waiting', headline: 'Rita Vale: a fix for incident 4512345', facts: { who: 'Rita Vale', at: '' } })],
			catchup: { count: 1, worth: 0, rows: [nrow('A4', { section: 'catchup', headline: 'Dev posted the config PR', facts: { who: 'Dev Moss', at: '' }, gist: 'Launch date stays Oct 24' })] },
		},
		done: [
			{ code: 'A9', kind: 'reply', who: whoOf('Kim Lane'), sentence: 'Replied to Kim Lane in Launch', ask: 'Can you share work item 99120?', said: 'Shared it.', by: 'by you', at: '' },
			{ code: 'A4', kind: 'catchup', who: whoOf('Dev Moss'), sentence: 'Dev posted the config PR', gist: 'Launch date stays Oct 24', by: 'Dev · Design notes', at: '' },
		],
	} as never
	const codes = (q: string) => { const f = find(v, q); return [f.now.map(r => r.act), f.done.map(r => r.code)] }
	assert.deepEqual(codes('kim'), [['A1'], ['A9']], 'a person, on Now and in Done')
	assert.deepEqual(codes('Spec review'), [['A1'], []], 'a chat')
	assert.deepEqual(codes('2204'), [['A1'], []], 'a PR number in an ask')
	assert.deepEqual(codes('PR 2204'), [['A1'], []])
	assert.deepEqual(codes('220'), [[], []], 'a number matches whole, never part of another')
	assert.deepEqual(codes('#4512345'), [['A3'], []], 'an incident number, with its #')
	assert.deepEqual(codes('99120'), [[], ['A9']], 'a work item, in Done')
	assert.deepEqual(codes('https://dev.example.com/acme/_workitems/edit/99120'), [[], ['A9']], 'a link to it: its number')
	assert.deepEqual(codes('sign-up form'), [['A2'], []], 'words in a goal')
	assert.deepEqual(codes('oct 24'), [['A4'], []], 'words in a gist; once, on Now, though Done has it too')
	assert.deepEqual(codes('a2'), [['A2'], []], 'a code')
	assert.deepEqual(codes('plan zebra'), [[], []], 'every word must match')
	assert.deepEqual(codes('  '), [[], []])
	// A pasted Teams link: the item it already is, or none, and then the page offers to make it one.
	assert.deepEqual(teamsMessage('https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000001?context=x'), { chat: '19:spec@thread.v2', msg: '1700000000001' })
	assert.equal(teamsMessage('https://dev.example.com/pr/1'), undefined)
	const known = find(v, 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000001')
	assert.deepEqual([known.now.map(r => r.act), known.link], [['A1'], { href: 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000001', item: 'A1' }])
	assert.equal(find(v, 'https://teams.microsoft.com/l/message/19%3Aother%40thread.v2/1700000000001').link?.item, undefined, 'the same message id in another chat is another message')
	// Review P2-6: a link to any of an item's messages, not only its last, is that item, on Now and in Done.
	const many = { ...(v as object), next: { ...(v as { next: object }).next, move: [nrow('A1', { headline: 'Send reply to Kim', facts: { at: '' }, teams: 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000009', msgs: ['19:spec@thread.v2|1700000000001', '19:spec@thread.v2|1700000000009'] })] }, done: [{ code: 'A9', kind: 'reply', who: whoOf('Kim Lane'), sentence: 'Replied to Kim Lane', by: 'by you', at: '', msgs: ['19:launch@thread.v2|1700000000077'] }] } as never
	assert.deepEqual(find(many, 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000001').link, { href: 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000001', item: 'A1' }, "its first ask")
	assert.equal(find(many, 'https://teams.microsoft.com/l/message/19%3Alaunch%40thread.v2/1700000000077').link?.item, 'A9', 'a closed one in Done')
	assert.equal(find(many, 'https://teams.microsoft.com/l/message/19%3Alaunch%40thread.v2/1700000000001').link?.item, undefined, 'the same id in another chat')
	const other = find(v, 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000002')
	assert.deepEqual([other.now, other.done, other.link], [[], [], { href: 'https://teams.microsoft.com/l/message/19%3Aspec%40thread.v2/1700000000002' }])
})

test('N1b since: replies (by rule), reviews, FYIs since the owner looked, and handled this week; each part opens its filter', async () => {
	const { sinceOf } = await import('../src/web/app/model/derive.ts')
	const { whoOf } = await import('../src/web/app/model/format.ts')
	const t = (h: number) => `2026-10-21T${String(h).padStart(2, '0')}:00:00.000Z`
	const d = (code: string, kind: string, name: string, at: string, o: object = {}) => ({ code, kind, who: whoOf(name), sentence: '', by: 'by you', at, ...o })
	const v = {
		now: t(12), since: t(8), handled: 11,
		done: [
			d('A1', 'reply', 'Kim Lane', t(9), { by: 'by rule R1' }), d('A2', 'reply', 'Kim Lane', t(10)), d('A3', 'reply', 'Rita Vale', t(11), { by: 'by rule R2' }),
			d('A4', 'reply', 'Dev Moss', t(11), { by: 'by you in Teams', inTeams: true }), d('A5', 'reply', 'Pete Hale', t(7)),
			d('A6', 'review', 'Dev Moss', t(9)), d('A7', 'catchup', 'Sam Wren', t(9)), d('A8', 'catchup', 'Sam Wren', t(10)), d('A9', 'change', 'Dev Moss', t(9)),
		],
	}
	const s = sinceOf({ ...v, next: { handled: 11 } } as never)
	assert.equal(s.at, t(8))
	assert.deepEqual(s.parts, [
		{ text: 'replied to 2 (2 by rule)', href: '#done/replies' }, { text: '1 review', href: '#done/reviews' },
		{ text: '2 FYIs', href: '#done/catchup' }, { text: '11 handled', href: '#numbers' },
	], "people Delegate replied to, not the owner's own replies in Teams nor before the look")
	assert.deepEqual(sinceOf({ ...v, done: [], next: { handled: 0 } } as never).parts, [], 'nothing since: no parts')
	// Review P2-5: both numbers count people. Three rule replies to Kim read "replied to 1 (1 by rule)", not "(3 by rule)".
	const kim = ['A1', 'A2', 'A3'].map((c, i) => d(c, 'reply', 'Kim Lane', t(9 + i), { by: 'by rule R1' }))
	assert.equal(sinceOf({ ...v, done: kim, next: { handled: 0 } } as never).parts[0].text, 'replied to 1 (1 by rule)')
	assert.deepEqual(sinceOf({ ...v, done: [d('A1', 'reply', 'Kim Lane', t(9))], next: { handled: 1 } } as never).parts.map(p => p.text), ['replied to 1', '1 handled'], 'no "(0 by rule)"')
	assert.equal(sinceOf({ now: t(12), done: [], next: { handled: 3 } } as never).at, '2026-10-20T12:00:00.000Z', 'a first visit: the last day')
})

test('N1b handled: the Since line counts handled this week as the Numbers tab does, and counts again only when a log changes', async () => {
	const { handledThisWeek } = await import('../src/store/numbers.ts')
	const { numbersOf } = await import('../src/store/numbers.ts')
	const { appendFileSync, mkdirSync } = await import('node:fs')
	const s = setup()
	const now = new Date(), day = now.toISOString().slice(0, 10), log = join(s.root, 'state', 'log', `${day}-mac.jsonl`)
	mkdirSync(join(s.root, 'state', 'log'), { recursive: true })
	const line = (o: object) => appendFileSync(log, JSON.stringify(o) + '\n')
	const at = (min: number) => new Date(now.getTime() - min * 60_000).toISOString()
	for (const c of ['A1', 'A2', 'A3']) { item(s, c, 'Kim Lane', 'Spec review', { createdAt: at(30), state: 'done' }); line({ at: at(10), event: 'sent', code: c, approvedBy: 'rule:R1', text: 'Yes.' }) }
	line({ at: at(9), event: 'tick' })
	const first = handledThisWeek(s, s.workflows(), now)
	assert.equal(first, numbersOf(s, 'this', now).handled.n)
	assert.ok(first >= 1, 'something to count')
	// Counted once: with nothing changed, the log is not read again.
	const read = s.logOf.bind(s); let reads = 0
	s.logOf = (f: string) => { reads++; return read(f) }
	assert.equal(handledThisWeek(s, s.workflows(), now), first)
	assert.equal(reads, 0)
	// Only the log changes (the items stay as they were): its new line counts at once.
	line({ at: at(1), event: 'sent', code: 'A4', approvedBy: 'rule:R1', text: 'Done.' })
	assert.equal(handledThisWeek(s, s.workflows(), now), first + 1, 'a new log line counts at once')
	assert.ok(reads > 0)
})

// Review P1-1, end to end through the runner's stamp, with no place seeded by hand: a row that never left Your move is never
// Back to you, whatever rule keeps it there; one that comes back from Waiting is.
test('N1b back: a new rule inside Your move is not Back to you; a row back from Waiting is (stamped by the runner)', async () => {
	const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
	const { freshOf } = await import('../src/web/app/model/derive.ts')
	const s = setup()
	stampPlaces(s, Date.now() - 7_200_000)
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(100), state: 'open', status: 'In progress', work: work({ next: { who: 'you', what: 'Try the form on staging' } }) })
	item(s, 'A2', 'Rita Vale', 'Release sync', { createdAt: ago(100), state: 'open', status: 'In progress', work: work({ next: { who: 'them', what: 'Rita sends the logs' } }) })
	stampPlaces(s, Date.now() - 5_400_000)
	const mark = ago(30)
	// Delegate drafts a reply on the work whose next step was already the owner's: your-step becomes needs-you.
	edit(s, 'A1', { state: 'needs_human' })
	edit(s, 'A2', { work: { ...get(s, 'A2').work!, next: { who: 'you', what: 'Check the logs Rita sent' } } })
	stampPlaces(s, Date.now() - 60_000)
	const rows = rowsOf(snapshot(s), place(snapshot(s)))
	const r1 = rows.find(r => r.code === 'A1')!, r2 = rows.find(r => r.code === 'A2')!
	assert.deepEqual([r1.section, get(s, 'A1').place?.rule], ['move', 'needs-you'])
	assert.notEqual(freshOf(r1, mark), 'back', 'it never left Your move')
	assert.equal(freshOf(r2, mark), 'back', 'it came back from Waiting')
})

// Review P1-3: Delegate's own scheduling (a stop, a resume, the daily limit, run slots) moves rows between Working and
// Waiting; that is not news in the thread. Only a move into Your move is.
test('N1b changedAt: a stop, a resume, and the daily limit move rows between Working and Waiting and change nothing', () => {
	const s = setup()
	stampPlaces(s, Date.now() - 600_000)
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(9), state: 'running', lastAsk: 'Is the plan final?' })
	stampPlaces(s, Date.now() - 480_000)
	const was = get(s, 'A1').changedAt
	assert.equal(get(s, 'A1').place?.section, 'working')
	s.saveControl({ ...s.control(), stopped: true }); stampPlaces(s, Date.now() - 360_000)
	assert.deepEqual([get(s, 'A1').place?.section, get(s, 'A1').changedAt], ['waiting', was], 'stopped: it waits, and nothing changed')
	s.saveControl({ ...s.control(), stopped: false }); stampPlaces(s, Date.now() - 240_000)
	assert.deepEqual([get(s, 'A1').place?.section, get(s, 'A1').changedAt], ['working', was], 'resumed')
	s.saveConfig({ ...s.config(), dailyRuns: 5 } as never)
	for (let i = 0; i < 5; i++) s.addRun()
	stampPlaces(s, Date.now() - 120_000)
	assert.deepEqual([get(s, 'A1').place?.section, get(s, 'A1').changedAt], ['waiting', was], 'the daily limit: it waits, and nothing changed')
	// The draft lands: into Your move, which is news.
	edit(s, 'A1', { state: 'needs_human', draft: { text: 'Yes, it is final.', commitment: false, sources: [] } })
	const t = Date.now(); stampPlaces(s, t)
	assert.equal(get(s, 'A1').changedAt, new Date(t).toISOString())
})

// Review P2-2: done items are not rewritten every cycle, only once, when they close; placedAt is written once.
test('N1b place: a done item is stamped once, when it closes; one closed before the upgrade is never rewritten; placedAt is written once', () => {
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(900), state: 'done', status: 'Sent' })
	item(s, 'A2', 'Rita Vale', 'Release sync', { createdAt: ago(300), draft: { text: 'Yes.', commitment: false, sources: [] } })
	const first = Date.now() - 600_000
	stampPlaces(s, first)
	assert.equal(get(s, 'A1').place, undefined, 'closed before the upgrade: left alone')
	const placed = s.probeMark().placedAt
	assert.equal(placed, new Date(first).toISOString())
	edit(s, 'A2', { state: 'done', status: 'Sent' })
	stampPlaces(s, Date.now() - 300_000)
	assert.equal(get(s, 'A2').place?.section, 'done', 'its close is stamped once')
	const saved = get(s, 'A2')
	assert.equal(stampPlaces(s, Date.now()), 0, 'and never again')
	assert.deepEqual(get(s, 'A2'), saved)
	assert.equal(s.probeMark().placedAt, placed, 'placedAt stays the first stamp')
	// A closed item from before the upgrade that gets a new ask is news.
	edit(s, 'A1', { state: 'running', lastMsgId: 'm-2', msgIds: ['m-A1', 'm-2'] })
	const t = Date.now(); stampPlaces(s, t)
	assert.deepEqual([get(s, 'A1').place?.section, get(s, 'A1').changedAt], ['working', new Date(t).toISOString()])
})

// Review P2-3: the MCP server writes items too; a stamp never undoes a write made after its snapshot.
test('N1b place: a stamp re-reads the item and sets only place and changedAt, so a write after its snapshot stays', async () => {
	const next = await import('../src/web/next.ts')
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300), draft: { text: 'Yes.', commitment: false, sources: [] } })
	const real = s.workflows.bind(s)
	let once = false
	// The other process writes between the snapshot and the save.
	s.workflows = () => { const all = real(); if (!once) { once = true; s.save({ ...real().find(w => w.code === 'A1')!, watchedAs: 'A9' }, false) } return all }
	stampPlaces(s, Date.now())
	assert.deepEqual([get(s, 'A1').watchedAs, get(s, 'A1').place?.section], ['A9', 'move'])
	void next
})

// Review P1-2: a watch's news is "Changed", and Got it settles it; it never turns into New.
test('N1b watch: a Changed watch is not New, and after Got it it is neither Changed nor New', async () => {
	const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
	const { freshOf } = await import('../src/web/app/model/derive.ts')
	const s = setup()
	s.saveJob({ schema: 1, id: 'jw', key: 'k', goal: 'Watch PR 9000', session: { agent: 'copilot', id: 's' }, state: 'done', every: 60, nextAt: new Date(Date.now() + 3_600_000).toISOString(), purpose: 'work', parents: [], asks: [], createdAt: ago(300), updatedAt: ago(5) } as never)
	item(s, 'A9', 'Robin Park', 'Watching', { createdAt: ago(300), kind: 'tracker', state: 'waiting_on_task', job: 'jw', lastAsk: 'Watch PR 9000 until merged', changedAt: ago(5), ackAt: ago(60) })
	const row = () => rowsOf(snapshot(s), place(snapshot(s))).find(r => r.code === 'A9')!
	const mark = ago(30)
	assert.deepEqual([row().chips.map(c => c.kind), freshOf(row(), mark)], [['changed'], undefined])
	edit(s, 'A9', { ackAt: ago(1) })
	assert.deepEqual([row().chips.map(c => c.kind), freshOf(row(), mark)], [[], undefined], 'Got it settles it')
})

// Review P2-4: the Since line's count reads only this week and last (the zone's edge), however long the history; a change to an
// older log does not make it count again.
test('N1b handled: only this week and last are read, and an older log changes nothing', async () => {
	const { handledThisWeek, numbersOf } = await import('../src/store/numbers.ts')
	const { appendFileSync, mkdirSync, writeFileSync } = await import('node:fs')
	const s = setup()
	const now = new Date(), dir = join(s.root, 'state', 'log')
	mkdirSync(dir, { recursive: true })
	const dayAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
	const file = (n: number) => join(dir, `${dayAgo(n).toISOString().slice(0, 10)}-mac.jsonl`)
	for (let n = 0; n < 300; n += 1) writeFileSync(file(n), JSON.stringify({ at: new Date(dayAgo(n).getTime() - 60_000).toISOString(), event: 'sent', code: `A${1000 + n}`, approvedBy: 'rule:R1', text: 'Yes.' }) + '\n')
	const read: string[] = [], logOf = s.logOf.bind(s)
	s.logOf = (f: string) => { read.push(f); return logOf(f) }
	const n = handledThisWeek(s, [], now)
	assert.equal(n, numbersOf(s, 'this', now).handled.n, 'the same count as the Numbers tab')
	read.length = 0; s.logOf = (f: string) => { read.push(f); return logOf(f) }
	appendFileSync(file(200), JSON.stringify({ at: dayAgo(200).toISOString(), event: 'tick' }) + '\n')
	assert.equal(handledThisWeek(s, [], now), n)
	assert.deepEqual(read, [], 'an old log changed: not counted again')
	appendFileSync(file(0), JSON.stringify({ at: now.toISOString(), event: 'tick' }) + '\n')
	handledThisWeek(s, [], now)
	assert.ok(read.length > 0 && read.length <= 14, `only this week and last are read (${read.length} files)`)
})

// Review P2-6: rows say every message their items hold, so Find knows a link to any of them, on Now and in Done.
test('N1b rows: a row carries every message of its thread, a part\'s too, and a Done row its item\'s', async () => {
	const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
	const { view } = await import('../src/web/view.ts')
	const s = setup()
	item(s, 'A1', 'Kim Lane', 'Spec review', { createdAt: ago(300), state: 'open', status: 'In progress', msgIds: ['m1', 'm2'], work: work({ next: { who: 'them', what: 'Kim answers' }, parts: ['w-A2'] }) })
	item(s, 'A2', 'Dev Moss', 'Dev Moss', { createdAt: ago(200), state: 'open', status: 'Part of A1', partOf: 'w-A1', msgIds: ['m7'] })
	item(s, 'A3', 'Rita Vale', 'Launch', { createdAt: ago(100), state: 'done', status: 'Sent', intent: 'question', msgIds: ['m8', 'm9'], sent: { msgId: 's1', at: ago(50), text: 'Yes.' }, updatedAt: ago(50) })
	const r1 = rowsOf(snapshot(s), place(snapshot(s))).find(r => r.code === 'A1')!
	assert.deepEqual(r1.msgs?.slice().sort(), ['19:DevMoss@thread.v2|m7', '19:Specreview@thread.v2|m1', '19:Specreview@thread.v2|m2'])
	assert.deepEqual(view(s, ago(600)).done.find(r => r.code === 'A3')?.msgs, ['19:Launch@thread.v2|m8', '19:Launch@thread.v2|m9'])
})

// Review round 2, P2-B: a channel thread's item lives under "ch|<team>|<channel>|<root>", but a pasted link names the channel.
// Its messages are keyed by the channel, on Now and in Done, so a link to the root post or an earlier reply finds the item.
test('N1b rows: a channel thread keys its messages by the channel, so Find knows a link to its root post', async () => {
	const { snapshot, place, rowsOf } = await import('../src/web/next.ts')
	const { view } = await import('../src/web/view.ts')
	const { find } = await import('../src/web/app/model/find.ts')
	const s = setup()
	const chat = { id: 'ch|team-1|19:launch@thread.tacv2|1700000000100', name: 'Launch dev', test: false, group: true }
	item(s, 'A1', 'Kim Lane', 'Launch dev', { createdAt: ago(300), chat, msgIds: ['1700000000100', '1700000000105'], lastMsgId: '1700000000105', draft: { text: 'Yes.', commitment: false, sources: [] } })
	item(s, 'A2', 'Rita Vale', 'Launch dev', { createdAt: ago(200), state: 'done', status: 'Sent', intent: 'question', chat: { ...chat, id: 'ch|team-1|19:launch@thread.tacv2|1700000000200' }, msgIds: ['1700000000200', '1700000000205'], lastMsgId: '1700000000205', sent: { msgId: 's1', at: ago(50), text: 'Done.' }, updatedAt: ago(50) })
	const rows = rowsOf(snapshot(s), place(snapshot(s))), v = { next: { move: rows.filter(r => r.section === 'move'), working: [], waiting: [], catchup: { count: 0, worth: 0, rows: [] } }, done: view(s, ago(600)).done } as never
	assert.deepEqual(rows.find(r => r.code === 'A1')!.msgs, ['19:launch@thread.tacv2|1700000000100', '19:launch@thread.tacv2|1700000000105'])
	const root = 'https://teams.microsoft.com/l/message/19%3Alaunch%40thread.tacv2/1700000000100?groupId=team-1&parentMessageId=1700000000100'
	assert.equal(find(v, root).link?.item, 'A1', "the thread's root post")
	assert.equal(find(v, 'https://teams.microsoft.com/l/message/19%3Alaunch%40thread.tacv2/1700000000200?groupId=team-1&parentMessageId=1700000000200').link?.item, 'A2', 'a closed thread, in Done, by its root post (not its last message)')
})
