// The Numbers tab's page model (R-NEX-11, design-spec/north-star-tab.md): the small-sample rule, the arrow, week one, one table
// of rule texts, every number opening its rows, and a summary with numbers only. Pure, without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIRST_WEEK, RULES, brief, dur, listsOf, numbersModel, share, type Link, type NumbersModel } from '../src/web/app/model/numbers.ts'
import { tabsOf } from '../src/web/app/model/derive.ts'
import { newRoute } from '../src/web/app/model/ui.ts'
import type { NumbersPage, View } from '../src/web/app/model/types.ts'

type Ins = NumbersPage['now']
const ins = (o: { replies?: Partial<Ins['replies']>; missed?: Partial<Ins['missed']>; wait?: Partial<Ins['wait']> } = {}): Ins => ({
	replies: { drafted: [], edited: [], teams: [], unknown: [], n: 0, of: 0, ...o.replies },
	missed: { pointed: [], mine: [], asks: [], n: 0, of: 0, ...o.missed },
	wait: { n: 0, codes: [], ...o.wait },
})
const WEEKS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']
const codes = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `A${from + i}`)
function page(o: Partial<NumbersPage> & { h?: Partial<NumbersPage['handled']> } = {}): NumbersPage {
	const { h, ...rest } = o
	return {
		window: { key: 'this', from: '2026-10-19', to: '2026-10-21', label: 'This week (Mon Oct 19 to today)' }, firstWeek: false,
		handled: { n: 0, codes: [], reply: [], changes: [], nothing: [], provisional: [], ...h },
		bars: WEEKS.map((week, i) => ({ week, n: i, codes: codes(i, i * 10), gaps: [], before: i === 0 })),
		now: ins(), four: ins(), corrections: { n: 0, sends: 0, codes: [], sent: [] }, rows: {}, missed: {}, ...rest,
	}
}
const links = (m: NumbersModel): Link[] => [m.handled.main, ...m.handled.kinds, m.handled.check, m.handled.all, ...m.bars.map(b => ({ text: b.label, key: b.key })), ...m.cards.flatMap(c => [c.main, ...c.lines.flat(), c.four]), m.unknown, ...m.corrections].filter((l): l is Link => !!l)
const text = (m: NumbersModel) => links(m).map(l => l.text).join(' | ') + ' | ' + (m.handled.trend?.text ?? '') + ' | ' + m.summary

test('R-NEX-11 page model: below 10 a share is a count ("3 of 4"), never a percentage, whatever the server sent', () => {
	assert.equal(share(3, 4, 75), '3 of 4')
	assert.equal(share(9, 9, 100), '9 of 9')
	assert.equal(share(6, 10, 60), '6 of 10 (60%)')
	assert.equal(brief(3, 4, 75), '3 of 4')
	assert.equal(brief(6, 10, 60), '60%')
	assert.equal(share(6, 10), '6 of 10', 'no percentage the server did not give')
	// An older server that sent a percentage for 7 replies and 8 sends: the page still shows counts.
	const m = numbersModel(page({
		now: ins({ replies: { drafted: codes(4), edited: codes(3, 5), n: 4, of: 7, pct: 57 }, missed: { pointed: ['A1'], asks: codes(8), n: 1, of: 8, pct: 13 } }),
		four: ins({ replies: { drafted: codes(5), n: 5, of: 9, pct: 56 }, missed: { n: 1, of: 9, pct: 11 } }),
		corrections: { n: 1, sends: 8, per100: 12.5, codes: ['A2'], sent: codes(8) },
	}), 'Delegate')
	assert.doesNotMatch(text(m), /%/)
	assert.equal(m.cards[0].main.text, '4 of 7 this week')
	assert.equal(m.cards[0].meter, undefined, 'review P2-3: no share bar below 10, which would be a percentage in pictures')
	assert.equal(m.cards[1].main.text, '1 of 8 asks')
	assert.equal(m.cards[0].four.text, '4 weeks: 5 of 9')
	assert.deepEqual(m.corrections.map(l => l.text).join(''), '1 correction in 8 sends over 4 weeks (keep it under 2 per 100)')
	// From 10 up, the percentage shows.
	const big = numbersModel(page({ now: ins({ replies: { drafted: codes(6), edited: codes(4, 7), n: 6, of: 10, pct: 60 } }), corrections: { n: 1, sends: 34, per100: 2.9, codes: ['A2'], sent: codes(34) } }), 'Delegate')
	assert.equal(big.cards[0].main.text, '6 of 10 (60%) this week')
	assert.deepEqual(big.cards[0].meter, { n: 6, of: 10 })
	assert.equal(big.corrections.map(l => l.text).join(''), '2.9 per 100 sends over 4 weeks (1 of 34; keep it under 2)')
})

test('R-NEX-11 page model: the arrow shows only when both weeks have 10 or more; otherwise last week\'s count', () => {
	const trend = (n: number, before: number, arrow?: 'up' | 'down' | 'same', key: NumbersPage['window']['key'] = 'this') => numbersModel(page({ window: { key, from: '', to: '', label: '' }, h: { n, codes: codes(n), before, ...(arrow ? { arrow } : {}) } }), 'D').handled.trend
	assert.deepEqual(trend(12, 10, 'up'), { text: '▲ 2 more than last week (10)', dir: 'up' })
	assert.deepEqual(trend(10, 14, 'down'), { text: '▼ 4 fewer than last week (14)', dir: 'down' })
	assert.deepEqual(trend(11, 11, 'same'), { text: 'The same as last week (11)', dir: 'same' })
	assert.deepEqual(trend(11, 9, 'up'), { text: 'Last week: 9' }, 'last week had 9: no arrow, even if the server sent one')
	assert.deepEqual(trend(9, 12, 'down'), { text: 'Last week: 12' }, 'this week has 9')
	assert.deepEqual(trend(4, 12), { text: 'Last week: 12' })
	assert.deepEqual(trend(36, 16, 'up', '4w'), { text: '▲ 20 more than the 4 weeks before (16)', dir: 'up' })
	assert.deepEqual(trend(12, 9, undefined, 'last'), { text: 'The week before: 9' })
	assert.equal(numbersModel(page({ window: { key: 'all', from: '', to: '', label: '' }, h: { n: 50, codes: codes(50) } }), 'D').handled.trend, undefined, 'since you started has nothing to compare with')
	// Dry run 10-21: the span before was before the first read, so "The week before: 0" said nothing true.
	const early = (key: 'this' | 'last' | '4w', before: number[]) => { const d = page({ window: { key, from: '', to: '', label: '' }, h: { n: 9, codes: codes(9), before: 0 } }); d.bars = d.bars.map((b, i) => ({ ...b, before: before.includes(i) })); return numbersModel(d, 'D').handled.trend }
	assert.equal(early('last', [0, 1, 2, 3, 4, 5]), undefined)
	assert.deepEqual(early('last', [0, 1, 2, 3, 4]), { text: 'The week before: 0' }, 'a started week with nothing handled is a real 0')
	assert.equal(early('this', [0, 1, 2, 3, 4, 5, 6]), undefined)
	assert.deepEqual(early('this', [0, 1, 2, 3, 4, 5]), { text: 'Last week: 0' })
	assert.equal(early('4w', [0, 1, 2, 3]), undefined)
	assert.deepEqual(early('4w', [0, 1, 2]), { text: 'The 4 weeks before: 0' })
})

test('R-NEX-11 page model: in week one the tab says "Your first week. Trends start next week." instead of a trend', () => {
	const m = numbersModel(page({ firstWeek: true, h: { n: 12, codes: codes(12), before: 11, arrow: 'up' } }), 'D')
	assert.deepEqual(m.handled.trend, { text: FIRST_WEEK })
	assert.equal(FIRST_WEEK, 'Your first week. Trends start next week.')
	assert.match(m.summary, /Your first week\. Trends start next week\./)
	assert.notDeepEqual(numbersModel(page({ h: { n: 12, codes: codes(12), before: 11, arrow: 'up' } }), 'D').handled.trend, { text: FIRST_WEEK })
})

test('R-NEX-11 page model: every number opens exactly the rows it counted, and a number with nothing behind it opens nothing', () => {
	const d = page({
		h: { n: 4, codes: ['A1', 'A2', 'A3', 'A4'], reply: ['A1', 'A3'], changes: ['A2'], nothing: ['A4'], provisional: ['A3', 'A4'] },
		now: ins({ replies: { drafted: ['A1', 'A3'], edited: ['A5'], teams: ['A6', 'A7'], unknown: ['A8'], n: 2, of: 5 }, missed: { pointed: ['A9', 'missed:m1'], mine: ['A10'], asks: ['A1', 'A9', 'missed:m1', 'A10'], n: 3, of: 4 }, wait: { n: 2, median: 12, min: 4, max: 20, codes: ['A1', 'A6'] } }),
		four: ins({ replies: { drafted: ['A1'], n: 1, of: 1 }, missed: { pointed: ['A9'], n: 1, of: 3 }, wait: { n: 1, median: 12, min: 12, max: 12, codes: ['A1'] } }),
		corrections: { n: 1, sends: 3, codes: ['A11'], sent: ['A1', 'A3', 'A11'] },
	})
	const m = numbersModel(d, 'D'), lists = listsOf(d), all = (k: string) => lists[k].groups.flatMap(g => g.codes)
	for (const l of links(m)) if (l.key) assert.ok(lists[l.key], `${l.text} opens ${l.key}`)
	assert.deepEqual(all('handled'), d.handled.codes)
	assert.deepEqual([all('reply'), all('changes'), all('nothing'), all('check')], [['A1', 'A3'], ['A2'], ['A4'], ['A3', 'A4']])
	assert.deepEqual(lists.replies.groups.map(g => [g.title, g.codes]), [['As drafted', ['A1', 'A3']], ['Edited before sending', ['A5']], ['You typed in Teams', ['A6', 'A7']]], 'the 5 replies divided by, in their kinds')
	assert.equal(all('replies').length, d.now.replies.of)
	assert.deepEqual(lists.missed.groups.map(g => g.codes), [['A9', 'missed:m1'], ['A10']])
	assert.equal(all('missed').length, d.now.missed.n)
	assert.equal(all('asks').length, d.now.missed.of)
	assert.deepEqual([all('unknown'), all('wait'), all('corrections'), all('sends'), all('four-wait')], [['A8'], ['A1', 'A6'], ['A11'], ['A1', 'A3', 'A11'], ['A1']])
	assert.deepEqual(all(`week:${WEEKS[3]}`), d.bars[3].codes)
	assert.equal(m.cards[0].main.key, 'replies')
	assert.equal(m.unknown?.key, 'unknown')
	// Nothing behind a number: plain text, not a link.
	const quiet = numbersModel(page(), 'D')
	assert.deepEqual([quiet.handled.main, quiet.handled.all, quiet.handled.check, quiet.bars[0].key, quiet.unknown], [{ text: '0 asks this week' }, undefined, undefined, undefined, undefined])
	assert.deepEqual(quiet.handled.kinds.map(k => k.key), [undefined, undefined, undefined])
	assert.equal(quiet.cards[0].main.text, 'No replies to asks this week')
	assert.equal(quiet.cards[2].main.text, 'No timed replies yet')
	assert.equal(quiet.cards[1].main.text, 'No asks this week', 'not "0 of 0 asks" (dry run 10-21)')
	assert.match(quiet.summary, /Missed: no asks ·/)
})

test('R-NEX-11 page model: Handled for you reads as designed: kinds, the 7-day check, and See all', () => {
	const m = numbersModel(page({ h: { n: 11, codes: codes(11), reply: codes(6), changes: codes(3, 7), nothing: codes(2, 10), provisional: codes(5) } }), 'D')
	assert.equal(m.handled.main.text, '11 asks this week')
	assert.deepEqual(m.handled.kinds.map(k => k.text), ['6 replies as drafted', '3 applied as proposed', '2 "nothing needed"'])
	assert.equal(m.handled.check?.text, '5 still in their 7-day check')
	assert.equal(m.handled.all?.text, 'See all 11')
	const one = numbersModel(page({ h: { n: 1, codes: ['A1'], reply: ['A1'], provisional: ['A1'] } }), 'D')
	assert.deepEqual([one.handled.main.text, one.handled.kinds[0].text, one.handled.check?.text], ['1 ask this week', '1 reply as drafted', '1 still in its 7-day check'])
})

test('R-NEX-11 page model: the 8 bars carry text alternatives, mark the days nothing was read, and dot the weeks before the start', () => {
	const d = page()
	d.bars[5] = { week: '2026-10-05', n: 9, codes: codes(9), gaps: ['2026-10-10', '2026-10-11'], before: false }
	const m = numbersModel(d, 'D')
	assert.equal(m.bars.length, 8)
	assert.equal(m.bars[5].alt, 'Week of Oct 5: 9 handled; no machine was reading on Sat Oct 10, Sun Oct 11')
	assert.deepEqual(m.bars[5].days, [false, false, false, false, false, true, true])
	assert.equal(m.bars[5].height, 100)
	assert.equal(m.bars[0].alt, 'Week of Aug 31: before you started')
	assert.deepEqual([m.bars[0].before, m.bars[0].height, m.bars[0].key], [true, 0, undefined])
	assert.equal(m.bars[7].alt, 'Week of Oct 19: 7 handled so far')
	assert.equal(m.bars[7].now, true)
	assert.equal(m.gapNote, 'Hatched: no machine was reading on Oct 10, Oct 11')
	assert.equal(numbersModel(page(), 'D').gapNote, undefined)
})

test('R-NEX-11 page model: one table of rule texts gives every number its "How is this counted?" line', () => {
	const rules = RULES('Delegate')
	assert.deepEqual(Object.keys(rules).sort(), ['bars', 'check', 'corrections', 'handled', 'missed', 'promises', 'replies', 'unknown', 'wait'])
	for (const [k, v] of Object.entries(rules)) assert.ok(v.length > 60, k)
	assert.deepEqual(numbersModel(page(), 'D').cards.map(c => c.rule), ['replies', 'missed', 'wait'])
	assert.match(rules.handled, /within 7 days/)
	assert.match(RULES('Robin\'s helper').replies, /Robin's helper/, 'the brand name comes from the page')
})

test('R-NEX-11 page model: sends too old to check are counted apart and said; promises start later', () => {
	const m = numbersModel(page({ now: ins({ replies: { drafted: ['A1'], unknown: ['A2', 'A3'], n: 1, of: 1 } }) }), 'D')
	assert.deepEqual(m.unknown, { text: '2 sends are too old to check, so they are left out', key: 'unknown' })
	assert.match(m.summary, /2 left out as too old to check/)
	assert.equal(numbersModel(page({ now: ins({ replies: { unknown: ['A2'] } }) }), 'D').unknown?.text, '1 send is too old to check, so it is left out')
	assert.equal(m.promises, 'Promises kept on time: starts once work records its due dates.')
})

test('R-NEX-11 page model: Copy a summary has numbers only: no names, no message text, no item codes, no hours saved, no money', () => {
	const row = (code: string, name: string) => ({ code, kind: 'reply' as const, who: { name, initials: 'KL', hue: 1 }, sentence: `Replied to ${name} in Acme launch`, ask: 'Is the Globex build green?', said: 'Yes, build 512 is green.', by: 'by you', at: '2026-10-20T10:00:00.000Z' })
	const d = page({
		h: { n: 12, codes: codes(12), reply: codes(12), provisional: codes(3), before: 10, arrow: 'up' },
		now: ins({ replies: { drafted: codes(12), edited: ['A20'], n: 12, of: 13, pct: 92 }, missed: { pointed: ['missed:m1'], asks: codes(30), n: 1, of: 30, pct: 3 }, wait: { n: 12, median: 38, min: 4, max: 540, codes: codes(12) } }),
		four: ins({ replies: { drafted: codes(30), n: 30, of: 40, pct: 75 }, wait: { n: 30, median: 52, min: 2, max: 600, codes: codes(30) } }),
		corrections: { n: 1, sends: 100, per100: 1, codes: ['A3'], sent: codes(100) },
		rows: Object.fromEntries(codes(12).map(c => [c, row(c, 'Kim Lane')])), missed: { 'missed:m1': { at: '2026-10-20T10:00:00.000Z', teams: 'https://teams.microsoft.com/l/message/19%3Aacme/1' } },
	})
	const s = numbersModel(d, 'Delegate').summary
	assert.equal(s, [
		'Delegate numbers · This week (Mon Oct 19 to today)',
		'Handled for you: 12 · ▲ 2 more than last week (10)',
		'  12 replies as drafted · 0 applied as proposed · 0 "nothing needed" · 3 still in their 7-day check',
		'  Last 8 weeks: -, 1, 2, 3, 4, 5, 6, 7',
		'Replies as drafted: 12 of 13 (92%) · 4 weeks: 75%',
		'Missed: 1 of 30 (3%) asks · 4 weeks: none yet',
		'Asker wait: median 38 min, 4 min to 9 h · 4 weeks: 52 min',
		'Corrections: 1 per 100 sends over 4 weeks (1 of 100; keep it under 2)',
	].join('\n'))
	assert.doesNotMatch(s, /Kim|Lane|Acme|Globex|build 512|teams\.microsoft|\bA\d+\b|missed:/)
	assert.doesNotMatch(text(numbersModel(d, 'Delegate')), /saved|\$|€|£|money|hours? (saved|a week)/i)
	assert.deepEqual([dur(38), dur(540), dur(4000)], ['38 min', '9 h', '3 d'], 'asker wait is the only time, from timestamps')
})

test('R-NEX-11 the Numbers tab: last before Settings in classic, no count, not in the snapshot; its address stays in the new experience', () => {
	const v = { knowledge: [{}], settings: {}, done: [], seen: {} } as unknown as View
	assert.deepEqual(tabsOf(v, false, true).map(t => t[0]), ['home', 'focus', 'done', 'ongoing', 'knowledge', 'numbers', 'settings'])
	assert.deepEqual(tabsOf(v, false, true).find(t => t[0] === 'numbers'), ['numbers', 'Numbers'], 'no count badge')
	assert.equal(tabsOf(v, true, true).some(t => t[0] === 'numbers'), false, 'the snapshot cannot ask for numbers')
	assert.equal(tabsOf(v, false, false).some(t => t[0] === 'numbers'), false, 'nor a page without the call')
	assert.equal(tabsOf(v, false).some(t => t[0] === 'numbers'), false)
	assert.deepEqual([newRoute('numbers'), newRoute('numbers/handled'), newRoute('numbers/week:2026-10-12')], ['numbers', 'numbers/handled', 'numbers/week:2026-10-12'])
})

// Review P2-5: drawing must not change page state. A Numbers list draws Done's rows, so a row read for drawing creates nothing.
test('R-NEX-11 drawing a Numbers list or a Done row writes no page state', async () => {
	const { S } = await import('../src/web/app/state/store.ts')
	const { row } = await import('../src/web/app/view/classic/tabs/done.ts')
	const { rowState } = await import('../src/web/app/view/classic/parts.ts')
	const who = { name: 'Kim Lane', initials: 'KL', hue: 1 }
	const before = Object.keys(S.ui).length
	String(row({ code: 'A60', kind: 'closed', who, sentence: 'Kim Lane: Nothing needed', by: '', at: '2026-10-20T10:00:00.000Z' }))
	String(row({ code: 'A61', kind: 'reply', who, sentence: 'Replied to Kim Lane', ask: 'Is it green?', said: 'Yes.', by: 'by you', at: '2026-10-20T10:00:00.000Z' }))
	String(rowState('row:A62'))
	assert.equal(Object.keys(S.ui).length, before)
	S.ui['row:A63'] = { ...S.ui['row:A63'], status: 'pending' } as never
	assert.match(String(rowState('row:A63')), /Working…/, 'a row being acted on still shows it')
})
