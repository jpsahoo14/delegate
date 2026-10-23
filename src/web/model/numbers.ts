// The Numbers tab's words, links, and lists, from /numbers (R-NEX-11, design-spec/north-star-tab.md). Pure: views draw it, tests read it.
// Rules kept here, whatever the server sent: below 10 a share is a count ("3 of 4"), never a percentage; the arrow needs 10 on
// both sides; week one says so instead of a trend; no hours saved and no money, ever; the only time shown is asker wait.
import type { NumbersPage, WindowKey } from './types.ts'

export const SMALL = 10
export const WINDOWS: WindowKey[] = ['this', 'last', '4w', 'all']
export const WINDOW_LABEL: Record<WindowKey, string> = { this: 'This week', last: 'Last week', '4w': 'Last 4 weeks', all: 'Since you started' }
const WHEN: Record<WindowKey, string> = { this: 'this week', last: 'last week', '4w': 'in the last 4 weeks', all: 'since you started' }
// The span a trend compares with: as long as the window, just before it.
const PRIOR: Partial<Record<WindowKey, string>> = { this: 'last week', last: 'the week before', '4w': 'the 4 weeks before' }
export const FIRST_WEEK = 'Your first week. Trends start next week.'

// The one table of how each number is counted. "How is this counted?" under a number shows its line.
export type RuleKey = 'handled' | 'bars' | 'check' | 'replies' | 'missed' | 'wait' | 'corrections' | 'unknown' | 'promises'
export const RULES = (name: string): Record<RuleKey, string> => ({
	handled: `An ask counts once, in the week it first closed with at most one approval of unedited work: a reply sent exactly as ${name} drafted it (your ok, a picked option, or a rule), proposed changes applied with none removed, or a job's "Nothing needed". It leaves the count if, within 7 days, the reply is undone or marked wrong, incomplete, or unneeded, you say it needed you, or a missed message turns out to be part of it.`,
	bars: 'One bar per week, Monday to Sunday, counted as Handled for you. A hatched bar had days when no machine was reading your chats, so a quiet week is not mistaken for a good one. Weeks before you started are dotted.',
	check: 'An item stays in its 7-day check for 7 days after it counted. A correction in that time takes it out, so past weeks can still go down.',
	replies: `Replies that went out exactly as ${name} drafted them, out of every reply to an ask ${name} found: sent as drafted, edited before sending, or typed by you in Teams (each item once). Holding replies are left out.`,
	missed: `Asks you had to point at with "missed", or move from Catch up to Needs me, out of every ask: items made (not watches, and not messages that needed no reply) and the messages you pointed at. Each counts once.`,
	wait: 'From when the ask was sent to the first reply in that thread, yours or a draft you sent, for asks that needed you. The middle value (median), the shortest, and the longest. Measured from message times; nothing is estimated.',
	corrections: 'Items you corrected (undone, or marked wrong, incomplete, or unneeded), each once, per 100 replies sent in the last 4 weeks. Holding replies, which say the answer is coming, are not counted as sent. Keep it under 2.',
	unknown: 'A reply sent before sends recorded whether they were edited, whose words were cleared after 30 days, cannot be checked. It counts as neither drafted nor edited.',
	promises: 'Your dated promises closed or updated by their date, out of those due. It starts once work records its due dates.',
})

// A count out of a total. The percentage shows only from 10 up, even if the server sent one.
export const share = (n: number, of: number, pct?: number) => (of >= SMALL && pct !== undefined ? `${n} of ${of} (${pct}%)` : `${n} of ${of}`)
export const brief = (n: number, of: number, pct?: number) => (of >= SMALL && pct !== undefined ? `${pct}%` : `${n} of ${of}`)
// Asker wait is the only time on the tab, measured from timestamps.
export const dur = (min: number) => (min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const md = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
const dmd = (day: string) => `${DAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${md(day)}`
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// A number on the tab. key opens the rows it counted (#numbers/<key>); a number with nothing behind it has none.
export type Link = { text: string; key?: string }
const L = (text: string, key: string, n: number): Link => (n > 0 ? { text, key } : { text })
export type Card = { rule: RuleKey; title: string; main: Link; meter?: { n: number; of: number }; lines: Link[][]; four: Link }
// days: Monday to Sunday, true where no machine was reading.
export type Bar = { week: string; label: string; n: number; height: number; gaps: string[]; days: boolean[]; before: boolean; now: boolean; alt: string; key?: string }
export type NumbersModel = {
	window: { key: WindowKey; label: string }
	handled: { main: Link; trend?: { text: string; dir?: 'up' | 'down' | 'same' }; kinds: Link[]; check?: Link; all?: Link }
	bars: Bar[]; gapNote?: string
	cards: Card[]
	unknown?: Link
	corrections: Link[]
	promises: string
	summary: string
}

// What each number opens: its rows, in groups when the number adds up kinds.
export type List = { title: string; groups: { title?: string; codes: string[]; keys?: string[] }[] }
export function listsOf(d: NumbersPage): Record<string, List> {
	const w = WHEN[d.window.key], h = d.handled, r = d.now.replies, m = d.now.missed, f = d.four
	const one = (title: string, codes: string[]): List => ({ title, groups: [{ codes }] })
	const replies = (x: typeof r): List['groups'] => [{ title: 'As drafted', codes: x.drafted }, { title: 'Edited before sending', codes: x.edited }, { title: 'You typed in Teams', codes: x.teams }]
	const missed = (x: typeof m): List['groups'] => [{ title: 'You pointed at', codes: x.pointed }, { title: 'Moved to Needs me', codes: x.mine }]
	const lists: Record<string, List> = {
		handled: one(`Handled for you ${w}`, h.codes),
		reply: one(`Replies as drafted, handled ${w}`, h.reply),
		changes: one(`Applied as proposed, handled ${w}`, h.changes),
		nothing: one(`"Nothing needed", handled ${w}`, h.nothing),
		check: one('Still in their 7-day check', h.provisional),
		...Object.fromEntries(d.bars.map(b => [`week:${b.week}`, one(`Handled in the week of ${md(b.week)}`, b.codes)])),
		replies: { title: `Replies to asks ${w}`, groups: replies(r) },
		drafted: one(`Replies as drafted ${w}`, r.drafted),
		edited: one(`Replies edited before sending ${w}`, r.edited),
		teams: one(`Replies you typed in Teams ${w}`, r.teams),
		unknown: one(`Sends that can no longer be checked, ${w}`, r.unknown),
		'four-replies': { title: 'Replies to asks in the last 4 weeks', groups: replies(f.replies) },
		missed: { title: `Missed ${w}`, groups: missed(m) },
		pointed: one(`Messages you pointed at ${w}`, m.pointed),
		mine: one(`Moved to Needs me ${w}`, m.mine),
		asks: one(`Every ask ${w}`, m.asks),
		'four-missed': { title: 'Missed in the last 4 weeks', groups: missed(f.missed) },
		wait: one(`Timed replies ${w}, shortest wait first`, d.now.wait.codes),
		'four-wait': one('Timed replies in the last 4 weeks, shortest wait first', f.wait.codes),
		corrections: one('Corrected in the last 4 weeks', d.corrections.codes),
		sends: one('Sent in the last 4 weeks', d.corrections.sent),
	}
	for (const [key, groups] of Object.entries(d.sendKeys ?? {})) {
		if (lists[key]) lists[key].groups.forEach((group, index) => { group.keys = groups[index] })
	}
	return lists
}

function trendOf(d: NumbersPage): NumbersModel['handled']['trend'] {
	const h = d.handled, prior = PRIOR[d.window.key]
	if (d.firstWeek) return { text: FIRST_WEEK }
	if (!prior || h.before === undefined) return undefined
	// Nothing to compare with when the span before was wholly before the first read.
	const span = d.window.key === 'this' ? d.bars.slice(6, 7) : d.window.key === 'last' ? d.bars.slice(5, 6) : d.bars.slice(0, 4)
	if (span.length && span.every(b => b.before)) return undefined
	// The arrow only when both spans have 10 or more.
	if (h.arrow && h.n >= SMALL && h.before >= SMALL) {
		if (h.n > h.before) return { text: `▲ ${h.n - h.before} more than ${prior} (${h.before})`, dir: 'up' }
		if (h.n < h.before) return { text: `▼ ${h.before - h.n} fewer than ${prior} (${h.before})`, dir: 'down' }
		return { text: `The same as ${prior} (${h.before})`, dir: 'same' }
	}
	return { text: `${prior[0].toUpperCase()}${prior.slice(1)}: ${h.before}` }
}

function barsOf(d: NumbersPage): Bar[] {
	const top = Math.max(1, ...d.bars.map(b => b.n))
	return d.bars.map((b, i) => {
		const now = i === d.bars.length - 1
		const alt = [`Week of ${md(b.week)}: ${b.before ? 'before you started' : `${s(b.n, 'handled', 'handled')}${now ? ' so far' : ''}`}`, ...(b.gaps.length ? [`no machine was reading on ${b.gaps.map(dmd).join(', ')}`] : [])].join('; ')
		return { week: b.week, label: md(b.week), n: b.n, height: b.before ? 0 : Math.round((b.n / top) * 100), gaps: b.gaps, days: Array.from({ length: 7 }, (_, k) => b.gaps.includes(addDays(b.week, k))), before: b.before, now, alt, ...(b.n > 0 ? { key: `week:${b.week}` } : {}) }
	})
}

export function numbersModel(d: NumbersPage, name: string): NumbersModel {
	const w = WHEN[d.window.key], h = d.handled, r = d.now.replies, m = d.now.missed, t = d.now.wait, f = d.four, c = d.corrections
	const gaps = d.bars.flatMap(b => b.gaps)
	const repliesCard: Card = {
		rule: 'replies', title: 'Replies as drafted',
		main: r.of ? L(`${share(r.n, r.of, r.pct)} ${w}`, 'replies', r.of) : { text: `No replies to asks ${w}` },
		// A share bar only from 10: below that it would be a percentage in pictures.
		...(r.of >= SMALL ? { meter: { n: r.n, of: r.of } } : {}),
		lines: [[L(`${r.drafted.length} as drafted`, 'drafted', r.drafted.length), L(`${r.edited.length} edited`, 'edited', r.edited.length)], [L(`${r.teams.length} you typed in Teams`, 'teams', r.teams.length)]],
		four: L(`4 weeks: ${f.replies.of ? brief(f.replies.n, f.replies.of, f.replies.pct) : 'none yet'}`, 'four-replies', f.replies.of),
	}
	const missedCard: Card = {
		rule: 'missed', title: 'Missed',
		main: m.of ? L(`${share(m.n, m.of, m.pct)} asks`, 'missed', m.n) : { text: `No asks ${w}` },
		lines: [[L(`you pointed at ${m.pointed.length}`, 'pointed', m.pointed.length)], [L(`moved ${m.mine.length} to Needs me`, 'mine', m.mine.length)], [L(s(m.of, 'ask', 'asks') + ' in all', 'asks', m.of)]],
		four: L(`4 weeks: ${f.missed.of ? brief(f.missed.n, f.missed.of, f.missed.pct) : 'none yet'}`, 'four-missed', f.missed.n),
	}
	const waitCard: Card = {
		rule: 'wait', title: 'Asker wait',
		main: t.median !== undefined ? L(`median ${dur(t.median)}`, 'wait', t.n) : { text: 'No timed replies yet' },
		lines: [[{ text: 'from ask to first reply' }], ...(t.median !== undefined ? [[{ text: `range ${dur(t.min!)} to ${dur(t.max!)}` }], [L(s(t.n, 'timed reply', 'timed replies'), 'wait', t.n)]] : [])],
		four: L(`4 weeks: ${f.wait.median !== undefined ? dur(f.wait.median) : 'none timed yet'}`, 'four-wait', f.wait.n),
	}
	const per = c.per100 !== undefined && c.sends >= SMALL
	const model: NumbersModel = {
		window: { key: d.window.key, label: d.window.label },
		handled: {
			main: L(`${s(h.n, 'ask', 'asks')} ${w}`, 'handled', h.n),
			trend: trendOf(d),
			kinds: [L(s(h.reply.length, 'reply as drafted', 'replies as drafted'), 'reply', h.reply.length), L(`${h.changes.length} applied as proposed`, 'changes', h.changes.length), L(`${h.nothing.length} "nothing needed"`, 'nothing', h.nothing.length)],
			...(h.provisional.length ? { check: L(`${h.provisional.length} still in ${h.provisional.length === 1 ? 'its' : 'their'} 7-day check`, 'check', h.provisional.length) } : {}),
			...(h.n ? { all: L(`See all ${h.n}`, 'handled', h.n) } : {}),
		},
		bars: barsOf(d),
		...(gaps.length ? { gapNote: `Hatched: no machine was reading on ${gaps.map(md).join(', ')}` } : {}),
		cards: [repliesCard, missedCard, waitCard],
		...(r.unknown.length ? { unknown: L(`${s(r.unknown.length, 'send is', 'sends are')} too old to check, so ${r.unknown.length === 1 ? 'it is' : 'they are'} left out`, 'unknown', r.unknown.length) } : {}),
		corrections: per
			? [L(`${c.per100} per 100 sends`, 'corrections', c.n), { text: ' over 4 weeks (' }, L(`${c.n} of ${c.sends}`, 'sends', c.sends), { text: '; keep it under 2)' }]
			: [L(s(c.n, 'correction', 'corrections'), 'corrections', c.n), { text: ' in ' }, L(s(c.sends, 'send', 'sends'), 'sends', c.sends), { text: ' over 4 weeks (keep it under 2 per 100)' }],
		promises: 'Promises kept on time: starts once work records its due dates.',
		summary: '',
	}
	model.summary = summaryOf(d, model, name)
	return model
}

// "Copy a summary": numbers only. No names, no message text, no item codes; nothing leaves unless the owner pastes it.
export function summaryOf(d: NumbersPage, m: NumbersModel, name: string): string {
	const h = d.handled, r = d.now.replies, x = d.now.missed, t = d.now.wait, f = d.four
	return [
		`${name} numbers · ${d.window.label}`,
		`Handled for you: ${h.n}${m.handled.trend ? ` · ${m.handled.trend.text}` : ''}`,
		`  ${m.handled.kinds.map(k => k.text).join(' · ')}${m.handled.check ? ` · ${m.handled.check.text}` : ''}`,
		`  Last 8 weeks: ${d.bars.map(b => (b.before ? '-' : String(b.n))).join(', ')}`,
		`Replies as drafted: ${r.of ? share(r.n, r.of, r.pct) : 'none yet'} · 4 weeks: ${f.replies.of ? brief(f.replies.n, f.replies.of, f.replies.pct) : 'none yet'}`,
		...(r.unknown.length ? [`  ${r.unknown.length} left out as too old to check`] : []),
		`Missed: ${x.of ? `${share(x.n, x.of, x.pct)} asks` : 'no asks'} · 4 weeks: ${f.missed.of ? brief(f.missed.n, f.missed.of, f.missed.pct) : 'none yet'}`,
		`Asker wait: ${t.median !== undefined ? `median ${dur(t.median)}, ${dur(t.min!)} to ${dur(t.max!)}` : 'none timed yet'} · 4 weeks: ${f.wait.median !== undefined ? dur(f.wait.median) : 'none timed yet'}`,
		`Corrections: ${m.corrections.map(l => l.text).join('')}`,
	].join('\n')
}
