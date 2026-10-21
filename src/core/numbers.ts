import { dayIn } from './schedule.ts'
import { NAME } from '../brand.ts'

// The Numbers tab (R-NEX-11, design-spec/north-star-tab.md): is Delegate handling more of the owner's asks, correctly, without missing any?
// Pure counting over Delegate's own log. Nothing is estimated, and no time saved is ever shown.

// One counted line: codes, chat ids, and times only. No message text and no names, so a week's file holds nothing private.
export type Ev = {
	at: string; event: 'tick' | 'sent' | 'closed' | 'made' | 'applied' | 'undo' | 'marked' | 'notfyi' | 'correction' | 'missed'
	// asDrafted on a send: true, false, or absent when the line can no longer prove which (an old line after the 30-day redaction).
	// target: the message id of the send a correction is about.
	// changesOff: changes left out before a send (removed by the owner, or dropped as no longer needed).
	code?: string; asDrafted?: boolean; holding?: true; changesOff?: number; askAt?: string; replyAt?: string; closedBy?: string; items?: string[]; kept?: number; removed?: number; left?: number; kind?: string; chat?: string; msgId?: string; target?: string
}
export type Item = { code: string; kind?: string; chat: { id: string }; msgIds: string[] }
export type WindowKey = 'this' | 'last' | '4w' | 'all'
export const WINDOWS: WindowKey[] = ['this', 'last', '4w', 'all']

const DAY = 86_400_000
const SMALL = 10
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
// Weeks run Monday to Sunday; a week is named by its Monday.
export const weekOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7))
export const isFriday = (day: string) => weekday(day) === 5

// A reply went out as Delegate drafted it: by a rule, or the owner's ok on a draft they did not change.
// From 10-21 a send says so itself (v: 2, edited). Before, an edit then ok was logged unchanged: true and only the kept draft told it apart;
// the 30-day redaction clears the draft and the words, so such a line proves nothing and counts as neither (undefined).
function drafted(e: Record<string, unknown>): boolean | undefined {
	if (str(e.approvedBy)?.startsWith('rule:')) return true
	if (e.v === 2) return e.unchanged === true && e.edited === false
	if (e.unchanged !== true) return false
	if (typeof e.draft === 'string') return e.draft === e.text
	return typeof e.text === 'string' ? true : undefined
}

// Why an item closed. Logs from before closedBy was kept are read from the status; a PR that moved on its own is not a job's finding.
const legacyClose = (status: string, prMoved: boolean) => /^You replied yourself/.test(status) ? 'replied' : /^Skipped by you/.test(status) ? 'skipped' : /^Nothing needed:/.test(status) && !prMoved ? 'job' : undefined

// The log lines the numbers count, cut down to codes and times. Reads become the first and last of each UTC hour:
// whatever the owner's zone, a day that had a read keeps one, so a week's lines do not depend on a zone.
export function slim(raw: Record<string, unknown>[]): Ev[] {
	const moved = new Set(raw.filter(e => e.event === 'pr-moved').map(e => str(e.code)))
	const hours = new Map<string, [string, string]>(), out: Ev[] = []
	for (const e of raw) {
		const at = str(e.at), code = str(e.code)
		if (!at || Number.isNaN(Date.parse(at))) continue
		const opt = (k: 'askAt' | 'replyAt') => (str(e[k]) ? { [k]: str(e[k]) } : {})
		switch (e.event) {
			case 'tick': { const h = hours.get(at.slice(0, 13)); if (!h) hours.set(at.slice(0, 13), [at, at]); else if (at < h[0]) h[0] = at; else if (at > h[1]) h[1] = at; break }
			// Replies to asks only: a reminder an automation sent is not a reply.
			case 'sent': if (code && /^(owner$|rule:)/.test(str(e.approvedBy) ?? '')) {
				const d = drafted(e)
				out.push({ at, event: 'sent', code, ...(d === undefined ? {} : { asDrafted: d }), ...(e.holding === true ? { holding: true } : {}), ...(num(e.changesOff) ? { changesOff: num(e.changesOff) } : {}), ...(str(e.msgId) ? { msgId: str(e.msgId) } : {}), ...opt('askAt') })
			} break
			case 'state': {
				if (code && e.from === 'new') out.push({ at, event: 'made', code })
				const by = str(e.closedBy) ?? legacyClose(str(e.status) ?? '', moved.has(code))
				if (code && e.to === 'done') out.push({ at, event: 'closed', code, ...(by ? { closedBy: by } : {}), ...opt('askAt'), ...opt('replyAt') })
				break
			}
			// Changes applied before item codes and counts were logged cannot be tied to an item, so they are left out.
			case 'job-executed': if (Array.isArray(e.items)) out.push({ at, event: 'applied', items: e.items.filter((c): c is string => typeof c === 'string'), kept: num(e.kept), removed: num(e.removed), left: num(e.left) }); break
			// A correction names the send it is about: undo by its message, a mark or a posted correction by sentId (from 10-21).
			case 'marked': case 'undo': case 'correction': { const target = str(e.event === 'undo' ? e.msgId : e.sentId); if (code) out.push({ at, event: e.event, code, ...(e.event === 'marked' ? { kind: str(e.kind) } : {}), ...(target ? { target } : {}) }); break }
			case 'notfyi': if (code) out.push({ at, event: 'notfyi', code }); break
			case 'missed': if (str(e.chat)) out.push({ at, event: 'missed', chat: str(e.chat), msgId: str(e.msgId) }); break
		}
	}
	return [...out, ...[...hours.values()].flatMap(([a, b]) => (a === b ? [a] : [a, b]).map(at => ({ at, event: 'tick' as const })))]
}

// When the ask a reply answers was sent: the item's first message since the owner last spoke in the thread.
export function askAtOf(thread: { id: string; at: string; byOwner: boolean }[], ids: string[]): string | undefined {
	const last = thread.findLastIndex(m => m.byOwner)
	return thread.slice(last + 1).find(m => !m.byOwner && ids.includes(m.id))?.at
}

type Span = { from: string; to: string }
type Close = { code: string; at: string; how: 'reply' | 'changes' | 'nothing'; msgId?: string }
export type Bar = { week: string; n: number; codes: string[]; gaps: string[]; before: boolean }
// unknown: sends an old line can no longer prove either way; they are in neither drafted nor of.
export type Replies = { drafted: string[]; edited: string[]; teams: string[]; unknown: string[]; n: number; of: number; pct?: number }
export type Missed = { pointed: string[]; mine: string[]; n: number; of: number; pct?: number }
export type Wait = { n: number; median?: number; min?: number; max?: number; codes: string[] }
export type Inputs = { replies: Replies; missed: Missed; wait: Wait }
export type Numbers = {
	window: { key: WindowKey; from: string; to: string; label: string }
	firstWeek: boolean
	handled: { n: number; codes: string[]; reply: string[]; changes: string[]; nothing: string[]; provisional: string[]; before?: number; arrow?: 'up' | 'down' | 'same' }
	bars: Bar[]
	// The chosen window, and the last 4 weeks beside it.
	now: Inputs; four: Inputs
	corrections: { n: number; sends: number; per100?: number; codes: string[] }
}

const CORRECTS = new Set(['undo', 'marked', 'notfyi', 'correction'])
const pct = (n: number, of: number) => (of >= SMALL ? { pct: Math.round((n / of) * 100) } : {})
const uniq = <T>(xs: T[]) => [...new Set(xs)]
const push = <T>(m: Map<string, T[]>, k: string, v: T) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]) }

// Each item counts once, in the week of its first close as handled: a reply as drafted (not a holding reply, and with no change left out
// before it), changes applied with none removed or dropped, or a job's "Nothing needed". It leaves the count if, within 7 days, the reply it closed with is corrected (undone, marked,
// or corrected), the owner says it needed them, or a missed message turns out to be part of it. Corrections are indexed once, by item.
function handledAll(evs: Ev[], items: Item[]): Close[] {
	const sends = new Map<string, Ev[]>(), fixes = new Map<string, Ev[]>(), spoiled = new Set<string>()
	for (const e of evs) {
		if (e.event === 'sent') push(sends, e.code!, e)
		if (CORRECTS.has(e.event)) push(fixes, e.code!, e)
		if (e.event === 'applied' && (e.removed ?? 0) > 0) for (const c of e.items ?? []) spoiled.add(c)
	}
	for (const l of sends.values()) l.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
	// The item a missed message belongs to: only one whose own messages include it.
	const byMsg = new Map<string, string[]>(), missedOf = new Map<string, string[]>()
	for (const w of items) for (const m of w.msgIds) push(byMsg, `${w.chat.id}|${m}`, w.code)
	for (const e of evs) if (e.event === 'missed') for (const c of byMsg.get(`${e.chat}|${e.msgId}`) ?? []) push(missedOf, c, e.at)
	const first = new Map<string, Close>()
	const put = (code: string, at: string, how: Close['how'], msgId?: string) => { const c = first.get(code); if (!spoiled.has(code) && (!c || Date.parse(at) < Date.parse(c.at))) first.set(code, { code, at, how, ...(msgId ? { msgId } : {}) }) }
	for (const e of evs) {
		if (e.event === 'sent' && e.asDrafted === true && !e.holding && !e.changesOff) put(e.code!, e.at, 'reply', e.msgId)
		// The reply that went out with the changes is the one a correction would be about.
		if (e.event === 'applied' && e.left === 0 && e.removed === 0) for (const c of e.items ?? []) put(c, e.at, 'changes', sends.get(c)?.find(x => Date.parse(x.at) >= Date.parse(e.at))?.msgId)
		if (e.event === 'closed' && e.closedBy === 'job') put(e.code!, e.at, 'nothing')
	}
	// A correction from before corrections named their send is about the item's latest send before it.
	const about = (k: Ev) => k.target ?? sends.get(k.code!)?.filter(x => Date.parse(x.at) <= Date.parse(k.at)).at(-1)?.msgId
	const corrected = (c: Close) => {
		const from = Date.parse(c.at), within = (at: string) => { const t = Date.parse(at); return t >= from && t <= from + 7 * DAY }
		return (fixes.get(c.code) ?? []).some(k => within(k.at) && (k.event === 'notfyi' || (c.msgId !== undefined && about(k) === c.msgId))) || (missedOf.get(c.code) ?? []).some(within)
	}
	return [...first.values()].filter(c => !corrected(c)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

const median = (xs: number[]) => xs.length % 2 ? xs[(xs.length - 1) / 2] : Math.round((xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2)

function inputs(evs: Ev[], items: Item[], inSpan: (e: Ev) => boolean, notAsks: Set<string>): Inputs {
	const here = evs.filter(inSpan)
	// A holding reply says the answer is coming: it ends the asker's wait, but it is not a reply as drafted.
	const answered = here.filter(e => e.event === 'sent'), sends = answered.filter(e => !e.holding)
	// A Teams reply counts once per item: a catch-up after a gap can close, reopen, and close one item many times in seconds.
	const teams = here.filter(e => e.event === 'closed' && e.closedBy === 'replied').filter((e, i, all) => all.findIndex(x => x.code === e.code) === i)
	const drafted = sends.filter(e => e.asDrafted === true).map(e => e.code!), edited = sends.filter(e => e.asDrafted === false).map(e => e.code!)
	const replies = { drafted, edited, teams: teams.map(e => e.code!), unknown: sends.filter(e => e.asDrafted === undefined).map(e => e.code!), n: drafted.length, of: drafted.length + edited.length + teams.length }
	// A message the owner pointed at is the item made from it, or the link when none was.
	const itemOf = (e: Ev) => items.find(w => w.chat.id === e.chat && !!e.msgId && w.msgIds.includes(e.msgId))?.code ?? `missed:${e.msgId ?? e.at}`
	const pointed = uniq(here.filter(e => e.event === 'missed').map(itemOf)), mine = uniq(here.filter(e => e.event === 'notfyi').map(e => e.code!))
	const watch = new Set(items.filter(w => w.kind === 'tracker').map(w => w.code))
	// Asks: items made, but not watches, nor items closed with no reply needed and never answered; plus every message the owner had to point at.
	const asks = new Set([...here.filter(e => e.event === 'made' && !watch.has(e.code!) && !notAsks.has(e.code!)).map(e => e.code!), ...pointed, ...mine])
	const missed = { pointed, mine, n: pointed.length + mine.length, of: asks.size }
	const waits = [
		...answered.filter(e => e.askAt).map(e => ({ code: e.code!, min: (Date.parse(e.at) - Date.parse(e.askAt!)) / 60_000 })),
		...teams.filter(e => e.askAt && e.replyAt).map(e => ({ code: e.code!, min: (Date.parse(e.replyAt!) - Date.parse(e.askAt!)) / 60_000 })),
	].filter(w => w.min >= 0).sort((a, b) => a.min - b.min)
	const mins = waits.map(w => Math.round(w.min))
	const wait = { n: waits.length, codes: waits.map(w => w.code), ...(mins.length ? { median: median(mins), min: mins[0], max: mins.at(-1)! } : {}) }
	return { replies: { ...replies, ...pct(replies.n, replies.of) }, missed: { ...missed, ...pct(missed.n, missed.of) }, wait }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const md = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8))}`
const dmd = (day: string) => `${DAYS[weekday(day)]} ${md(day)}`
const LABEL: Record<WindowKey, string> = { this: 'This week', last: 'Last week', '4w': 'Last 4 weeks', all: 'Since you started' }

export function numbers(raw: Ev[], items: Item[], now: Date, tz?: string, key: WindowKey = 'this'): Numbers {
	// The same line on two machines, or a synced copy of a file, counts once; nothing after now counts yet.
	const seen = new Set<string>(), key_ = (e: Ev) => `${e.event}|${e.at}|${e.code ?? ''}|${e.msgId ?? ''}|${e.chat ?? ''}|${e.items?.join(',') ?? ''}`
	const evs = raw.filter(e => { const k = key_(e); return Date.parse(e.at) <= now.getTime() && !seen.has(k) && !!seen.add(k) })
	// Every zone's offset is a multiple of 15 minutes, so a moment's local day is the same for its whole UTC quarter-hour.
	const days = new Map<string, string>(), dayOf = (at: string) => { const q = `${at.slice(0, 14)}${Math.floor(Number(at.slice(14, 16)) / 15)}`; return days.get(q) ?? days.set(q, dayIn(at, tz)).get(q)! }
	const today = dayIn(now, tz), week = weekOf(today)
	const reads = new Set(evs.filter(e => e.event === 'tick').map(e => dayOf(e.at)))
	const first = [...reads].sort()[0] ?? evs.map(e => dayOf(e.at)).sort()[0] ?? today
	const spans: Record<WindowKey, Span> = { this: { from: week, to: today }, last: { from: addDays(week, -7), to: addDays(week, -1) }, '4w': { from: addDays(week, -21), to: today }, all: { from: weekOf(first), to: today } }
	const span = spans[key]
	const within = (s: Span) => (e: Ev | Close) => { const d = dayOf(e.at); return d >= s.from && d <= s.to }
	const all = handledAll(evs, items)
	// Not an ask: an item that only ever closed with no reply needed, and was never answered.
	const asked = new Set(evs.filter(e => e.event === 'sent' || (e.event === 'closed' && e.closedBy !== 'nothing')).map(e => e.code!))
	const notAsks = new Set(evs.filter(e => e.event === 'closed' && e.closedBy === 'nothing' && !asked.has(e.code!)).map(e => e.code!))
	const counted = all.filter(within(span))
	const of = (how: Close['how']) => counted.filter(c => c.how === how).map(c => c.code)
	// The span before, as long as this one: the week before, or the 4 weeks before.
	const prior: Span | undefined = key === 'this' ? spans.last : key === 'last' ? { from: addDays(week, -14), to: addDays(week, -8) } : key === '4w' ? { from: addDays(week, -49), to: addDays(week, -22) } : undefined
	const before = prior ? all.filter(within(prior)).length : undefined
	const arrow = before !== undefined && before >= SMALL && counted.length >= SMALL ? (counted.length > before ? 'up' : counted.length < before ? 'down' : 'same') : undefined
	// A day no machine read is a gap; today, and days before the first read, are not.
	const bars = Array.from({ length: 8 }, (_, i) => addDays(week, (i - 7) * 7)).map(w => {
		const ws = { from: w, to: addDays(w, 6) }, codes = all.filter(within(ws)).map(c => c.code)
		const gaps = Array.from({ length: 7 }, (_, d) => addDays(w, d)).filter(d => d >= first && d < today && !reads.has(d))
		return { week: w, n: codes.length, codes, gaps, before: ws.to < first }
	})
	const four = within(spans['4w'])
	const sends = evs.filter(e => e.event === 'sent' && four(e)).length
	const fixes = uniq(evs.filter(e => (e.event === 'marked' || e.event === 'undo') && four(e)).map(e => e.code!))
	return {
		window: { key, ...span, label: `${LABEL[key]} (${dmd(span.from)} to ${span.to === today ? 'today' : dmd(span.to)})` },
		firstWeek: weekOf(first) === week,
		handled: { n: counted.length, codes: counted.map(c => c.code), reply: of('reply'), changes: of('changes'), nothing: of('nothing'), provisional: counted.filter(c => now.getTime() - Date.parse(c.at) < 7 * DAY).map(c => c.code), ...(before !== undefined ? { before } : {}), ...(arrow ? { arrow } : {}) },
		bars,
		now: inputs(evs, items, within(span), notAsks), four: inputs(evs, items, four, notAsks),
		corrections: { n: fixes.length, sends, codes: fixes, ...(sends >= SMALL ? { per100: Math.round((fixes.length / sends) * 1000) / 10 } : {}) },
	}
}

const ratio = (r: { n: number; of: number; pct?: number }, when: string) => `${r.n} of ${r.of} ${when}${r.pct !== undefined ? ` (${r.pct}%)` : ''}`
const short = (r: { n: number; of: number; pct?: number }) => (r.pct !== undefined ? `${r.pct}%` : `${r.n} of ${r.of}`)
// Asker wait is the only time shown, measured from timestamps.
export const dur = (min: number) => (min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`)
const BLOCKS = '▁▂▃▄▅▆▇█'
const WHEN: Record<WindowKey, string> = { this: 'this week', last: 'last week', '4w': 'in 4 weeks', all: 'since you started' }

// The tab as text, for "delegate numbers".
export function numbersText(n: Numbers): string {
	const h = n.handled, when = WHEN[n.window.key], top = Math.max(1, ...n.bars.map(b => b.n))
	const trend = n.firstWeek ? 'Your first week. Trends start next week.'
		: h.arrow === 'up' ? `▲ ${h.n - h.before!} more than ${n.window.key === 'this' ? 'last week' : 'before'} (${h.before})`
		: h.arrow === 'down' ? `▼ ${h.before! - h.n} fewer than ${n.window.key === 'this' ? 'last week' : 'before'} (${h.before})`
		: h.before !== undefined ? `${n.window.key === 'this' ? 'last week' : 'before'}: ${h.before}` : ''
	const gaps = n.bars.flatMap(b => b.gaps)
	const bars = n.bars.map(b => (b.before ? '·' : b.gaps.length ? '▒' : BLOCKS[Math.round((b.n / top) * (BLOCKS.length - 1))])).join(' ')
	const r = n.now.replies, m = n.now.missed, w = n.now.wait, c = n.corrections
	return [
		`Numbers · ${n.window.label}`,
		`Counted from ${NAME}'s own log on all your machines. Nothing is estimated.`,
		'',
		'HANDLED FOR YOU',
		`${h.n} ask${h.n === 1 ? '' : 's'} ${when}${trend ? ` · ${trend}` : ''}`,
		`${bars}  the last 8 weeks (${n.bars.map(b => b.n).join(', ')})${gaps.length ? `  ▒ = no machine was reading: ${gaps.map(md).join(', ')}` : ''}`,
		`${h.reply.length} repl${h.reply.length === 1 ? 'y' : 'ies'} as drafted · ${h.changes.length} applied as proposed · ${h.nothing.length} "nothing needed"`,
		...(h.provisional.length ? [`${h.provisional.length} of the ${h.n} ${h.provisional.length === 1 ? 'is' : 'are'} still in ${h.provisional.length === 1 ? 'its' : 'their'} 7-day check.`] : []),
		...(h.n ? [`See all ${h.n}: ${h.codes.join(', ')}`] : []),
		'',
		'REPLIES AS DRAFTED',
		`${ratio(r, when)} · ${r.drafted.length} as drafted · ${r.edited.length} edited · ${r.teams.length} you typed in Teams · 4 weeks: ${short(n.four.replies)}`,
		...(r.unknown.length ? [`${r.unknown.length} sent before 10-21 can no longer be checked, so ${r.unknown.length === 1 ? 'it is' : 'they are'} left out.`] : []),
		'MISSED',
		`${m.n} of ${m.of} asks${m.pct !== undefined ? ` (${m.pct}%)` : ''} · you pointed at ${m.pointed.length} · moved ${m.mine.length} to Needs me · 4 weeks: ${short(n.four.missed)}`,
		'ASKER WAIT',
		w.median !== undefined ? `median ${dur(w.median)} · from ${dur(w.min!)} to ${dur(w.max!)}, from ask to first reply (${w.n} replies)${n.four.wait.median !== undefined ? ` · 4 weeks: ${dur(n.four.wait.median)}` : ''}` : 'No timed replies yet.',
		'',
		`Corrections: ${c.per100 !== undefined ? `${c.per100} per 100 sends over 4 weeks (${c.n} of ${c.sends}; keep it under 2)` : `${c.n} of ${c.sends} sends over 4 weeks (keep it under 2 per 100)`}${c.codes.length ? ` · ${c.codes.join(', ')}` : ''}`,
		'Promises kept on time: starts once work records its due dates.',
	].join('\n')
}

// Friday's daily summary adds this one line; it never shows a time (north-star-tab.md, "On the phone").
export function weekLine(n: Numbers): string | undefined {
	const r = n.now.replies, m = n.now.missed
	if (!n.handled.n && !r.of && !m.n) return undefined
	return `This week: ${n.handled.n} handled for you · ${r.n} of ${r.of} replies as drafted · ${m.n} missed.`
}
