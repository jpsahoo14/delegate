import { dayIn } from './schedule.ts'
import { NAME } from '../brand.ts'

// The Numbers tab (R-NEX-11, design-spec/north-star-tab.md): is Delegate handling more of the owner's asks, correctly, without missing any?
// Pure counting over Delegate's own log. Nothing is estimated, and no time saved is ever shown.

// One counted line: codes, chat ids, and times only. No message text and no names, so a week's file holds nothing private.
export type Ev = {
	at: string; event: 'tick' | 'sent' | 'closed' | 'made' | 'applied' | 'undo' | 'marked' | 'notfyi' | 'correction' | 'missed' | 'run' | 'version'
	// asDrafted on a send: true, false, or absent when the line can no longer prove which (an old line after the 30-day redaction).
	// target: the message id of the send a correction is about.
	// changesOff: changes left out before a send (removed by the owner, or dropped as no longer needed).
	code?: string; asDrafted?: boolean; holding?: true; changesOff?: number; askAt?: string; askMsgId?: string; replyAt?: string; closedBy?: string; items?: string[]; kept?: number; removed?: number; left?: number; kind?: string; chat?: string; msgId?: string; target?: string
	// COST-USAGE: an AI run (run), and the first line a machine wrote with a release (version: v and machine).
	run?: Run; v?: string; machine?: string
}
export type Item = { code: string; kind?: string; chat: { id: string }; msgIds: string[] }
// custom (D-COST PE §9): any span of whole local days, from <= to <= today, given with the key; WINDOWS are the fixed ones.
export type WindowKey = 'this' | 'last' | '4w' | 'all' | 'custom'
export const WINDOWS: WindowKey[] = ['this', 'last', '4w', 'all']
export type Span = { from: string; to: string }
const DATE = /^\d{4}-\d{2}-\d{2}$/
// A custom range is real local dates, inclusive, from on or before to, and to no later than today.
export const validRange = (from: string | undefined, to: string | undefined, today: string): from is string =>
	!!from && !!to && DATE.test(from) && DATE.test(to) && addDaysOk(from) && addDaysOk(to) && from <= to && to <= today
const addDaysOk = (day: string) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
export const daysIn = (s: Span) => Math.round((Date.parse(`${s.to}T00:00:00Z`) - Date.parse(`${s.from}T00:00:00Z`)) / 86_400_000) + 1

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
	const hours = new Map<string, [string, string]>(), out: Ev[] = [], versions = new Map<string, Ev>()
	for (const e of raw) {
		const at = str(e.at), code = str(e.code)
		if (!at || Number.isNaN(Date.parse(at))) continue
		// COST-USAGE: every run the log names a kind for, and each machine's first line of each release (coverageSince).
		if (str(e.runKind)) out.push({ at, event: 'run', run: runOf(e) })
		const v = str(e.v), m = str(e.machine), had = v && m ? versions.get(`${m}|${v}`) : undefined
		if (v && m && (!had || at < had.at)) versions.set(`${m}|${v}`, { at, event: 'version', v, machine: m })
		const opt = (k: 'askAt' | 'replyAt') => (str(e[k]) ? { [k]: str(e[k]) } : {})
		switch (e.event) {
			case 'tick': { const h = hours.get(at.slice(0, 13)); if (!h) hours.set(at.slice(0, 13), [at, at]); else if (at < h[0]) h[0] = at; else if (at > h[1]) h[1] = at; break }
			// Replies to asks only: a reminder an automation sent is not a reply.
			case 'sent': if (code && /^(owner$|rule:)/.test(str(e.approvedBy) ?? '')) {
				const d = drafted(e)
				out.push({ at, event: 'sent', code, ...(d === undefined ? {} : { asDrafted: d }), ...(e.holding === true ? { holding: true } : {}), ...(num(e.changesOff) ? { changesOff: num(e.changesOff) } : {}), ...(str(e.msgId) ? { msgId: str(e.msgId) } : {}), ...(str(e.askMsgId) ? { askMsgId: str(e.askMsgId) } : {}), ...opt('askAt') })
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
	return [...out, ...versions.values(), ...[...hours.values()].flatMap(([a, b]) => (a === b ? [a] : [a, b]).map(at => ({ at, event: 'tick' as const })))]
}

// When the ask a reply answers was sent: the item's first message since the owner last spoke in the thread.
export function askAtOf(thread: { id: string; at: string; byOwner: boolean; ownerReply?: { answered?: boolean } }[], ids: string[]): string | undefined {
	const last = thread.findLastIndex(m => m.byOwner && (m.ownerReply ? m.ownerReply.answered === true : true))
	return thread.slice(last + 1).find(m => !m.byOwner && ids.includes(m.id))?.at
}

type Close = { code: string; at: string; how: 'reply' | 'changes' | 'nothing'; msgId?: string }
export type Bar = { week: string; n: number; codes: string[]; gaps: string[]; before: boolean }
// unknown: sends an old line can no longer prove either way; they are in neither drafted nor of.
export type Replies = { drafted: string[]; edited: string[]; teams: string[]; unknown: string[]; n: number; of: number; pct?: number }
// asks: the codes of every ask counted in of, so the page can open them.
export type Missed = { pointed: string[]; mine: string[]; asks: string[]; n: number; of: number; pct?: number }
export type Wait = { n: number; median?: number; min?: number; max?: number; codes: string[] }
export type Inputs = { replies: Replies; missed: Missed; wait: Wait }
export type Numbers = {
	window: { key: WindowKey; from: string; to: string; label: string }
	firstWeek: boolean
	handled: { n: number; codes: string[]; reply: string[]; changes: string[]; nothing: string[]; provisional: string[]; before?: number; arrow?: 'up' | 'down' | 'same' }
	bars: Bar[]
	// The chosen window, and the last 4 weeks beside it.
	now: Inputs; four: Inputs
	corrections: { n: number; sends: number; per100?: number; codes: string[]; sent: string[] }
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
	const missed = { pointed, mine, asks: [...asks], n: pointed.length + mine.length, of: asks.size }
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
const LABEL: Record<WindowKey, string> = { this: 'This week', last: 'Last week', '4w': 'Last 4 weeks', all: 'Since you started', custom: 'Custom range' }

// custom: the span of a custom window (PE §9); every section counts within it, with no comparison span, as with all.
export function numbers(raw: Ev[], items: Item[], now: Date, tz?: string, key: WindowKey = 'this', custom?: Span): Numbers {
	// The same line on two machines, or a synced copy of a file, counts once; nothing after now counts yet.
	const seen = new Set<string>(), key_ = (e: Ev) => `${e.event}|${e.at}|${e.code ?? ''}|${e.msgId ?? ''}|${e.chat ?? ''}|${e.items?.join(',') ?? ''}`
	const evs = raw.filter(e => { const k = key_(e); return Date.parse(e.at) <= now.getTime() && !seen.has(k) && !!seen.add(k) })
	// Every zone's offset is a multiple of 15 minutes, so a moment's local day is the same for its whole UTC quarter-hour.
	const days = new Map<string, string>(), dayOf = (at: string) => { const q = `${at.slice(0, 14)}${Math.floor(Number(at.slice(14, 16)) / 15)}`; return days.get(q) ?? days.set(q, dayIn(at, tz)).get(q)! }
	const today = dayIn(now, tz), week = weekOf(today)
	const reads = new Set(evs.filter(e => e.event === 'tick').map(e => dayOf(e.at)))
	const first = [...reads].sort()[0] ?? evs.map(e => dayOf(e.at)).sort()[0] ?? today
	const spans: Record<WindowKey, Span> = { this: { from: week, to: today }, last: { from: addDays(week, -7), to: addDays(week, -1) }, '4w': { from: addDays(week, -21), to: today }, all: { from: weekOf(first), to: today }, custom: custom ?? { from: today, to: today } }
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
	// Every reply sent counts, an item that sent twice twice, so the list a count opens is as long as the count. A holding reply
	// says the answer is coming: it is not a reply sent.
	const sent = evs.filter(e => e.event === 'sent' && !e.holding && four(e)).map(e => e.code!), sends = sent.length
	const fixes = uniq(evs.filter(e => (e.event === 'marked' || e.event === 'undo') && four(e)).map(e => e.code!))
	return {
		window: { key, ...span, label: `${LABEL[key]} (${dmd(span.from)} to ${span.to === today ? 'today' : dmd(span.to)})` },
		firstWeek: weekOf(first) === week,
		handled: { n: counted.length, codes: counted.map(c => c.code), reply: of('reply'), changes: of('changes'), nothing: of('nothing'), provisional: counted.filter(c => now.getTime() - Date.parse(c.at) < 7 * DAY).map(c => c.code), ...(before !== undefined ? { before } : {}), ...(arrow ? { arrow } : {}) },
		bars,
		now: inputs(evs, items, within(span), notAsks), four: inputs(evs, items, four, notAsks),
		corrections: { n: fixes.length, sends, codes: fixes, sent, ...(sends >= SMALL ? { per100: Math.round((fixes.length / sends) * 1000) / 10 } : {}) },
	}
}

const ratio = (r: { n: number; of: number; pct?: number }, when: string) => `${r.n} of ${r.of} ${when}${r.pct !== undefined ? ` (${r.pct}%)` : ''}`
const short = (r: { n: number; of: number; pct?: number }) => (r.pct !== undefined ? `${r.pct}%` : `${r.n} of ${r.of}`)
// Asker wait is the only time shown, measured from timestamps.
export const dur = (min: number) => (min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`)
const BLOCKS = '▁▂▃▄▅▆▇█'
const WHEN: Record<WindowKey, string> = { this: 'this week', last: 'last week', '4w': 'in 4 weeks', all: 'since you started', custom: 'in this range' }

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

// COST-USAGE (pm-usage-cost.md: PM FINAL, Designer AU1-AU5, PE 11:28:00Z and 12:23:15Z). What Delegate's AI runs used, counted from the
// same log lines on all machines. Metadata only: a run's kind, models, counts and times, and the item or job it served; no prompt or
// message text. reported: the run said what it used (any usage field). A run that didn't is counted (Y), but its cells stay unknown, never 0.
// D-COST (PE engineer-d-cost §6, §7.6, §8.2, §11; HOST-COST-4's declared RunUse): cached input, credits per run and per model (integer
// nano-credits, counted only from complete or own-key records), the key's kind, re-runs, and backfilled earlier use. Every one is
// presence-gated: absent stays unknown, never 0.
export type CreditsStatus = 'complete' | 'partial' | 'none' | 'byok'
export type RunModel = { id: string; name?: string; calls?: number; tokensIn?: number; tokensOut?: number; tokensCacheRead?: number; creditsNano?: number; creditsStatus?: CreditsStatus }
// HOST-COST-4 §11 (1): a run's token split by category (input, cache_read, cache_write, output), present only when every record parsed.
export type TokenDetail = { input: number; cacheRead: number; cacheWrite: number; output: number }
export type Run = { kind: string; reported: boolean; models: RunModel[]; runId?: string; modelCalls?: number; tokensIn?: number; tokensOut?: number; toolCalls?: number; ms?: number; workflowId?: string; job?: string; machine?: string
	tokensCacheRead?: number; creditsNano?: number; creditsStatus?: CreditsStatus; keyKind?: string; rerun?: true; backfill?: true; tokenDetail?: TokenDetail }
// GitHub's published list rate for one AI credit (docs.github.com "Models and pricing for GitHub Copilot", checked 2026-10-26; PE §7.6).
// The ≈ $ figure is an estimate at this rate, never his bill.
export const AI_CREDIT_LIST_USD = 0.01
const USED = ['models', 'modelCalls', 'modelMs', 'tokensIn', 'tokensOut', 'toolCalls', 'toolMs', 'startMs']
const STATUSES: CreditsStatus[] = ['complete', 'partial', 'none', 'byok']
const status = (v: unknown) => (STATUSES as unknown[]).includes(v) ? v as CreditsStatus : undefined
const nano = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined)
// A re-run: a run whose session was chosen again for a retry, a catalog refresh, a requeue or a relay, or that ended to retry (§6(b)).
const RERUN = ['retry', 'catalog', 'requeue', 'relay']
function runOf(e: Record<string, unknown>): Run {
	const models = (Array.isArray(e.models) ? e.models : []).flatMap((m: unknown) => {
		const o = m && typeof m === 'object' ? m as Record<string, unknown> : {}
		if (typeof o.id !== 'string') return []
		const counts = Object.fromEntries((['calls', 'tokensIn', 'tokensOut', 'tokensCacheRead'] as const).flatMap(k => (num(o[k]) !== undefined ? [[k, num(o[k])]] : [])))
		return [{ id: o.id, ...(typeof o.name === 'string' ? { name: o.name } : {}), ...counts, ...((n => (n !== undefined ? { creditsNano: n } : {}))(nano(o.creditsNano))), ...((st => (st ? { creditsStatus: st } : {}))(status(o.creditsStatus))) }]
	})
	const pick = (...ks: ('runId' | 'workflowId' | 'job' | 'machine')[]) => Object.fromEntries(ks.flatMap(k => (str(e[k]) ? [[k, str(e[k])]] : [])))
	const count = (...ks: ('modelCalls' | 'tokensIn' | 'tokensOut' | 'toolCalls' | 'ms' | 'tokensCacheRead')[]) => Object.fromEntries(ks.flatMap(k => (num(e[k]) !== undefined ? [[k, num(e[k])]] : [])))
	const session = e.session && typeof e.session === 'object' ? e.session as Record<string, unknown> : {}, key = e.key && typeof e.key === 'object' ? e.key as Record<string, unknown> : {}
	const td = e.tokenDetail && typeof e.tokenDetail === 'object' ? e.tokenDetail as Record<string, unknown> : {}
	const detail = (['input', 'cacheRead', 'cacheWrite', 'output'] as const).every(k => num(td[k]) !== undefined) ? { tokenDetail: { input: num(td.input)!, cacheRead: num(td.cacheRead)!, cacheWrite: num(td.cacheWrite)!, output: num(td.output)! } } : {}
	return { kind: str(e.runKind)!, reported: USED.some(k => (k === 'models' ? models.length > 0 : num(e[k]) !== undefined)) || 'tokenDetail' in detail, models, ...pick('runId', 'workflowId', 'job', 'machine'), ...count('modelCalls', 'tokensIn', 'tokensOut', 'toolCalls', 'ms', 'tokensCacheRead'),
		...((n => (n !== undefined ? { creditsNano: n } : {}))(nano(e.creditsNano))), ...((st => (st ? { creditsStatus: st } : {}))(status(e.creditsStatus))),
		...(str(key.kind) ? { keyKind: str(key.kind) } : {}), ...(RERUN.includes(str(session.why) ?? '') || e.outcome === 'retry' ? { rerun: true as const } : {}), ...(e.backfill === true ? { backfill: true as const } : {}), ...detail }
}

// D-COST (PM amended B, PE §7.4 kind mapping): five rows. Replies: reply/draft/ask/owner-reply runs; Reviews: PR review runs (a review
// run, or a job run on a PR key); Background jobs: other jobs, reminder checks, promise checks; Rule reading: rule compiles; Other: the rest.
export const USAGE_KINDS: { label: string; kinds: string[] }[] = [
	{ label: 'Replies', kinds: ['draft', 'ask', 'owner-reply'] }, { label: 'Reviews', kinds: ['review'] }, { label: 'Background jobs', kinds: ['job', 'reminder', 'promise'] },
	{ label: 'Rule reading', kinds: ['rule'] }, { label: 'Other', kinds: [] },
]
export const rowOf = (r: Pick<Run, 'kind' | 'keyKind'>) => r.kind === 'job' && r.keyKind === 'pr' ? 1 : (i => (i < 0 ? USAGE_KINDS.length - 1 : i))(USAGE_KINDS.findIndex(row => row.kinds.includes(r.kind)))

// credits: the runs whose figure is known (complete, or own key at 0) sum their nano-credits; byok counts own-key runs; a run without a
// figure is only in runs - credits.runs (the coverage line), never 0. reruns counts runs §6(b) calls re-runs. split: the category sums of
// the runs that reported a token split, and how many did (absent when none did); the bars stack it only when every reporting run did.
export type Use = { runs: number; reported: number; modelCalls?: number; tokensIn?: number; tokensOut?: number; toolCalls?: number; ms?: number; tokensCacheRead?: number
	reruns: number; credits: { runs: number; nano: number; byok: number }; split?: TokenDetail & { runs: number } }
const FIELDS = ['modelCalls', 'tokensIn', 'tokensOut', 'toolCalls', 'ms', 'tokensCacheRead'] as const
// Each field sums the runs that measured it; one no run measured stays unknown. Nothing ran: every field is a measured 0.
export function useOf(runs: Run[]): Use {
	const known = runs.filter(r => r.creditsStatus === 'byok' || r.creditsStatus === 'complete' && r.creditsNano !== undefined)
	const use: Use = { runs: runs.length, reported: runs.filter(r => r.reported).length, reruns: runs.filter(r => r.rerun).length,
		credits: { runs: known.length, nano: known.reduce((sum, r) => sum + (r.creditsStatus === 'byok' ? 0 : r.creditsNano ?? 0), 0), byok: known.filter(r => r.creditsStatus === 'byok').length } }
	for (const f of FIELDS) { const vs = runs.map(r => r[f]).filter((v): v is number => v !== undefined); if (vs.length || !runs.length) use[f] = vs.reduce((a, b) => a + b, 0) }
	const split = runs.flatMap(r => (r.tokenDetail ? [r.tokenDetail] : []))
	if (split.length) use.split = { runs: split.length, ...Object.fromEntries((['input', 'cacheRead', 'cacheWrite', 'output'] as const).map(k => [k, split.reduce((a, d) => a + d[k], 0)])) as TokenDetail }
	return use
}

export type TimedRun = Run & { at: string }
const runKey = (run: Run, at: string) => run.runId ?? `${run.machine ?? ''}|${at}|${run.kind}`
const ATTRIBUTION = ['kind', 'runId', 'workflowId', 'job', 'machine', 'keyKind'] as const
const MEASURED = ['modelCalls', 'tokensIn', 'tokensOut', 'toolCalls', 'ms', 'tokensCacheRead', 'creditsNano', 'creditsStatus', 'tokenDetail'] as const
// CR COST4a B2: two lines of one run (a synced copy, or HOST's later backfill supplement with the same runId and backfill: true) are one
// run, never two. The original line (the one that isn't a backfill, else the earlier) keeps its time and what it served; the other adds
// what it measured (credits, cache, models, the split) and its backfill mark. Nothing is summed.
function sameRun(a: TimedRun, b: TimedRun): TimedRun {
	const [o, s] = (b.backfill && !a.backfill) || (!!a.backfill === !!b.backfill && a.at <= b.at) ? [a, b] : [b, a]
	const pick = (r: TimedRun, keys: readonly (keyof Run)[]) => Object.fromEntries(keys.flatMap(k => (r[k] !== undefined ? [[k, r[k]]] : [])))
	return { ...o, ...pick(s, MEASURED), ...pick(s, ATTRIBUTION), ...pick(o, ATTRIBUTION), at: o.at, models: s.models.length ? s.models : o.models, reported: o.reported || s.reported,
		...(o.rerun || s.rerun ? { rerun: true as const } : {}), ...(o.backfill || s.backfill ? { backfill: true as const } : {}) } as TimedRun
}
function mergedRuns(evs: Ev[]): Map<string, TimedRun> {
	const out = new Map<string, TimedRun>()
	for (const e of evs) if (e.event === 'run' && e.run) { const k = runKey(e.run, e.at), had = out.get(k), r = { ...e.run, at: e.at }; out.set(k, had ? sameRun(had, r) : r) }
	return out
}
// A run counts once, whatever machine's file or synced copy holds its line, with its same-run supplements merged in.
export const usageRuns = (evs: Ev[]): TimedRun[] => [...mergedRuns(evs).values()]

const atLeast = (v: string, min = [0, 2, 47]) => {
	const r = v.split('+')[0].split('.').map(Number)
	for (let i = 0; i < min.length; i++) if ((r[i] ?? 0) !== min[i]) return (r[i] ?? 0) > min[i]
	return true
}
// PE 12:23:15Z: counting is complete from the LATEST, across the machines that ran something, of each one's first line from 0.2.47 on.
// Undefined while one of them has no such line (its runs come from an older version). Derived, never stored.
export function coverageSince(evs: Ev[], ran: TimedRun[]): string | undefined {
	const first = new Map<string, string>()
	for (const e of evs) if (e.event === 'version' && e.v && e.machine && atLeast(e.v)) { const f = first.get(e.machine); if (!f || e.at < f) first.set(e.machine, e.at) }
	const machines = [...new Set(ran.map(r => r.machine).filter((m): m is string => !!m))]
	const ats = machines.length ? machines.map(m => first.get(m)) : [...first.values()].sort().slice(0, 1)
	return ats.length && ats.every(Boolean) ? (ats as string[]).sort().at(-1) : undefined
}

export type UsageKindRow = { label: string; kinds: string[]; use: Use; counted: boolean }
export type UsageModelRow = { label: string; use: Use }
// span: a custom window's week clipped to the range (PE §9), when it is.
export type UsageBar = { week: string; use?: Use; since?: string; span?: Span }
export type UsageDay = { day: string; use?: Use; since?: string }
// One window of the AI USE section (PE 12:29:36Z FINAL launch-window rule; PM CLOSE 12:35Z). after: the window ends after coverageSince;
// totals, models and X of Y are over [max(start, coverageSince), end] only, and clipped says since is inside it. before: it ends
// earlier, or a machine in it runs an older release: no totals, and every breakdown cell is not counted. missing: the PM's rows
// whose runs didn't report usage, for the coverage hover. A bar has no use for a week wholly before since; since's own week is clipped.
// today: the runs of today's local day (D-COST UR1 Today line); earliest: the first backfilled earlier run counted (PE §7.7), when any.
// days: the last 14 local days to today (UR1.3 By day), counted like the weeks: none before counting was complete, its own day from then.
// options: what the filters offer, from the window's runs before any filter (URΔ4): its models, and its machines.
export type UsageOptions = { models: { id: string; label: string }[]; machines: string[] }
export type UsageWindow = { state: 'before' | 'after'; since?: string; clipped: boolean; kinds: UsageKindRow[]; models: UsageModelRow[]; total: Use; missing: string[]; bars: UsageBar[]; days: UsageDay[]; today?: Use; earliest?: string; options: UsageOptions }
// URΔ4 (PE §9: filters apply within the span, and the sums still match): one model, one of the five kinds (by its label), one machine.
export type UsageFilter = { model?: string; kind?: string; machine?: string }

// CR COST4a B1 (PM FINAL: an incomplete run's credits are not reported): a model's credits follow its run's. A partial or unreported run's
// models stay unreported, so the model rows sum to the Total. CR COST4a B3: within a complete (or own-key) run, an own-key model keeps
// its own-key status (0, "own key · no credits"), and a paid model counts its figure.
function modelCredits(r: Run, m: RunModel): Pick<Run, 'creditsStatus' | 'creditsNano'> {
	if (r.creditsStatus !== 'complete' && r.creditsStatus !== 'byok') return r.creditsStatus ? { creditsStatus: r.creditsStatus } : {}
	const status = m.creditsStatus === 'byok' ? 'byok' : r.creditsStatus
	return { creditsStatus: status, ...(status === 'complete' && m.creditsNano !== undefined ? { creditsNano: m.creditsNano } : {}) }
}
// A model entry that carries its own numbers (HOST-COST-4, §11 (2)): each record belongs to one model, never split. An older run lists
// only its models (most-used first): it counts whole for its first.
const perModel = (r: TimedRun): TimedRun[] => r.models.some(m => m.tokensIn !== undefined || m.creditsStatus !== undefined || m.calls !== undefined)
	? r.models.map(m => ({ kind: r.kind, at: r.at, reported: true, models: [m], ...(m.calls !== undefined ? { modelCalls: m.calls } : {}), ...(m.tokensIn !== undefined ? { tokensIn: m.tokensIn } : {}), ...(m.tokensOut !== undefined ? { tokensOut: m.tokensOut } : {}),
		...(m.tokensCacheRead !== undefined ? { tokensCacheRead: m.tokensCacheRead } : {}), ...modelCredits(r, m), ...(r.rerun ? { rerun: true as const } : {}) }))
	: r.models[0] ? [{ ...r, models: [r.models[0]] }] : []

// A run's part for one model (§11 (2)): a one-model run is wholly that model's; a run whose models carry their own numbers keeps only
// that entry's (calls, tokens, credits; its tool calls, time and token split belong to no single model, so they are unknown); an older run
// counts whole for its first model, as in the by-model table. Undefined when the run used no such model.
function modelPart(r: Run, id: string): Run | undefined {
	const own = r.models.some(m => m.tokensIn !== undefined || m.creditsStatus !== undefined || m.calls !== undefined)
	if (!own) return r.models[0]?.id === id ? r : undefined
	const m = r.models.find(m => m.id === id)
	if (!m) return undefined
	if (r.models.length === 1) return r
	const { modelCalls: _c, tokensIn: _i, tokensOut: _o, tokensCacheRead: _r, creditsNano: _n, creditsStatus: _s, toolCalls: _t, ms: _m, tokenDetail: _d, ...rest } = r
	return { ...rest, models: [m], reported: true, ...(m.calls !== undefined ? { modelCalls: m.calls } : {}), ...(m.tokensIn !== undefined ? { tokensIn: m.tokensIn } : {}), ...(m.tokensOut !== undefined ? { tokensOut: m.tokensOut } : {}),
		...(m.tokensCacheRead !== undefined ? { tokensCacheRead: m.tokensCacheRead } : {}), ...modelCredits(r, m) }
}
// The log with only the runs a filter keeps, each line carrying its whole merged run (cut to its model's part) and its own machine, so a
// copy on another machine still holds the window back; every other line, such as the release lines, is kept.
function filtered(evs: Ev[], f: UsageFilter): Ev[] {
	const kind = f.kind === undefined ? undefined : USAGE_KINDS.findIndex(k => k.label === f.kind), runs = mergedRuns(evs)
	return evs.flatMap(e => {
		if (e.event !== 'run' || !e.run) return [e]
		const { at: _at, ...whole } = runs.get(runKey(e.run, e.at))!
		if (f.machine !== undefined && whole.machine !== f.machine) return []
		if (kind !== undefined && rowOf(whole) !== kind) return []
		const run = f.model === undefined ? whole : modelPart(whole, f.model)
		return run ? [{ ...e, run: { ...run, ...(e.run.machine ? { machine: e.run.machine } : {}) } }] : []
	})
}

function breakdown(runs: TimedRun[], before: boolean) {
	const kinds = USAGE_KINDS.map((row, i) => ({ ...row, use: useOf(runs.filter(r => rowOf(r) === i)), counted: !before }))
	// Per model: each model entry's own numbers (a run that reported no model is only in the Total).
	const byModel = new Map<string, { label: string; runs: TimedRun[] }>()
	for (const r of runs.flatMap(perModel)) { const m = r.models[0]; const had = byModel.get(m.id) ?? { label: m.name ?? m.id, runs: [] }; if (m.name) had.label = m.name; had.runs.push(r); byModel.set(m.id, had) }
	const models = before ? [] : [...byModel.values()].map(m => ({ label: m.label, use: useOf(m.runs) })).sort((a, b) => b.use.runs - a.use.runs || a.label.localeCompare(b.label))
	const missing = kinds.filter(k => k.use.reported < k.use.runs).map(k => k.label)
	return { kinds, models, total: useOf(runs), missing }
}

// custom (PE §9): the bars clip to the span, and By day is there only for a span of 31 days or less (its days, not the last 14).
export function usageWindow(source: Ev[], span: Span, weeks: string[], tz?: string, today?: string, filter?: UsageFilter, custom = false): UsageWindow {
	const day = (at: string) => dayIn(at, tz)
	const inDays = (from: string, to: string) => (r: TimedRun) => { const d = day(r.at); return d >= from && d <= to }
	const offered = usageRuns(source).filter(inDays(span.from, span.to)), labels = new Map<string, string>()
	for (const r of offered.flatMap(perModel)) { const m = r.models[0]; if (m.name || !labels.has(m.id)) labels.set(m.id, m.name ?? m.id) }
	const options = { models: [...labels].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)), machines: [...new Set(offered.flatMap(r => (r.machine ? [r.machine] : [])))].sort() }
	const evs = filter && (filter.model !== undefined || filter.kind !== undefined || filter.machine !== undefined) ? filtered(source, filter) : source
	const all = usageRuns(evs)
	// The machines that ran something are read from every run line, before the dedupe: a run two machines both logged keeps only one copy,
	// and the other machine must still hold the window back until its own first 0.2.47 line (7-case proof, case 6b).
	const lines = (from: string, to: string) => evs.flatMap(e => (e.event === 'run' && e.run && day(e.at) >= from && day(e.at) <= to ? [{ ...e.run, at: e.at }] : []))
	// D-COST §7.7: earlier use read back from the AI tool's saved sessions counts from its first run; before it nothing is available.
	const earliest = all.filter(r => r.backfill).map(r => r.at).sort()[0]
	const here = all.filter(inDays(span.from, span.to)), found = coverageSince(evs, lines(span.from, span.to))
	const since = found && earliest && earliest < found ? earliest : found
	const after = since !== undefined && day(since) <= span.to
	const clipped = after && day(since!) >= span.from
	const counted = after ? here.filter(r => r.at >= since!) : here
	// The bars: one week each; a week wholly before counting was complete has no value, and the week it became complete counts from then.
	const weekSpan = (w: string): Span => ({ from: custom && span.from > w ? span.from : w, to: custom && span.to < addDays(w, 6) ? span.to : addDays(w, 6) })
	const barFrom = weekSpan(weeks[0]).from, barTo = weekSpan(weeks.at(-1)!).to
	const barRuns = all.filter(inDays(barFrom, barTo)), barSince = coverageSince(evs, lines(barFrom, barTo))
	const bars = weeks.map(w => {
		const s = weekSpan(w), clip = s.from !== w || s.to !== addDays(w, 6) ? { span: s } : {}
		if (barSince === undefined || day(barSince) > s.to) return { week: w, ...clip }
		return { week: w, use: useOf(barRuns.filter(inDays(s.from, s.to)).filter(r => r.at >= barSince)), ...(day(barSince) >= s.from ? { since: barSince } : {}), ...clip }
	})
	// PE §9.2: standing Today depends only on its own day's coverage (the By-day rule for that one day), never on the selected span.
	const todaySince = today ? coverageSince(evs, lines(today, today)) : undefined
	const todayRuns = today && todaySince !== undefined && day(todaySince) <= today ? all.filter(inDays(today, today)).filter(r => r.at >= todaySince) : undefined
	const dayList = custom ? (daysIn(span) <= 31 ? Array.from({ length: daysIn(span) }, (_, i) => addDays(span.from, i)) : []) : today ? Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)) : []
	const daySince = dayList.length ? coverageSince(evs, lines(dayList[0], dayList.at(-1)!)) : undefined
	const days = dayList.map(d => (daySince === undefined || day(daySince) > d ? { day: d } : { day: d, use: useOf(all.filter(inDays(d, d)).filter(r => r.at >= daySince)), ...(day(daySince) === d ? { since: daySince } : {}) }))
	return { state: after ? 'after' : 'before', ...(since ? { since } : {}), clipped, ...breakdown(counted, !after), bars, days, ...(todayRuns ? { today: useOf(todayRuns) } : {}), ...(earliest ? { earliest } : {}), options }
}

// AU4: what one item used, over all its runs. A run counts for the item it names; a job's run only when that job serves exactly one
// item (a shared job is never split); checking his own replies belongs to no item.
export function usageByItem(evs: Ev[], itemOfJob: (job: string) => string | undefined): Map<string, Use & { models: string[] }> {
	const by = new Map<string, TimedRun[]>()
	for (const r of usageRuns(evs)) {
		if (r.kind === 'owner-reply') continue
		const id = r.workflowId ?? (r.job ? itemOfJob(r.job) : undefined)
		if (id) by.set(id, [...(by.get(id) ?? []), r])
	}
	return new Map([...by].map(([id, runs]) => {
		const n = new Map<string, number>()
		for (const r of runs) { const m = r.models[0]; if (m) n.set(m.name ?? m.id, (n.get(m.name ?? m.id) ?? 0) + 1) }
		// Its counts are only what its reporting runs reported (PM 12:49:18Z); runs and reported keep the whole count.
		const told = runs.filter(r => r.reported)
		return [id, { ...useOf(told), runs: runs.length, reported: told.length, models: [...n].sort((a, b) => b[1] - a[1]).map(([m]) => m) }]
	}))
}