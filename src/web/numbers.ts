import type { Store } from '../store/state.ts'
import { counted } from '../store/numbers.ts'
import { statSync } from 'node:fs'
import { numbers, weekOf, addDays, usageWindow, usageByItem, AI_CREDIT_LIST_USD, USAGE_KINDS, type Numbers, type WindowKey, type Ev, type UsageWindow, type Use, type UsageFilter, type Span } from '../core/numbers.ts'
import { NAME } from '../brand.ts'
import { messageLink } from '../adapters/channels.ts'
import { listsOf } from './model/numbers.ts'
import { placeOf } from './model/place.ts'
import { itemRows, type DoneRow } from './view.ts'
import { sendContext, sendRecord } from '../store/send-context.ts'
import { dayIn } from '../core/schedule.ts'

// What the Numbers tab gets (R-NEX-11, design-spec/north-star-tab.md): the numbers with their codes, and the rows those codes
// stand for, so every number opens exactly what it counted. rows: each item in Done's row format, for the lists this window's
// page can open (the page's own listsOf), without the sent text, why, and notes a Numbers list never expands. missed: a message
// the owner pointed at that never became an item (code missed:<msgId>), with when, and where it is in Teams.
export type NumbersRow = Omit<DoneRow, 'text' | 'why' | 'notes'>
export type MissedLink = { at: string; teams?: string }
export type NumbersPage = Numbers & { rows: Record<string, NumbersRow>; missed: Record<string, MissedLink>; sendKeys?: Record<string, string[][]>; usage?: UsageWindow }

const link = messageLink

// custom: the span of a custom window (PE §9), checked by the caller.
export function numbersPage(store: Store, key: WindowKey = 'this', now = new Date(), filter?: UsageFilter, custom?: Span): NumbersPage {
	const evs = counted(store), wfs = store.workflows(), n = numbers(evs, wfs, now, store.config()?.tz, key, custom)
	const codes = new Set(Object.values(listsOf({ ...n, rows: {}, missed: {} })).flatMap(l => l.groups.flatMap(g => g.codes)))
	const missed: Record<string, MissedLink> = {}
	for (const e of evs) if (e.event === 'missed') {
		const code = `missed:${e.msgId ?? e.at}`
		if (codes.has(code) && !missed[code]) missed[code] = { at: e.at, ...(e.chat && e.msgId ? { teams: link(e.chat, e.msgId) } : {}) }
	}
	const rows = Object.fromEntries(Object.entries(itemRows(store, [...codes].filter(c => !c.startsWith('missed:')), wfs)).map(([c, { text: _t, why: _w, notes: _n, ...r }]) => [c, r]))
	const events = [...new Map(evs.filter(e => e.at <= now.toISOString()).map(e => [`${e.event}|${e.at}|${e.code ?? ''}|${e.msgId ?? ''}|${e.chat ?? ''}|${e.items?.join(',') ?? ''}`, e])).values()]
	const earliest = [n.window.from, n.bars[0].week].sort()[0]
	const sends = events.filter(e => e.event === 'sent' && e.code && dayIn(e.at, store.config()?.tz) >= earliest)
	const first = sends.map(e => e.at).sort()[0]
	const logs = first ? store.logs(Math.max(1, Math.ceil((now.getTime() - Date.parse(first)) / 86_400_000) + 1)).filter(e => e.event === 'sent') : []
	const ref = (e: Ev) => `send:${encodeURIComponent(e.code!)}:${encodeURIComponent(e.msgId ?? e.at)}`
	for (const e of sends) {
		const workflow = wfs.find(w => w.code === e.code)
		const raw = logs.find(row => row.code === e.code && row.at === e.at && (e.msgId ? row.msgId === e.msgId : true))
		const rawSend = sendRecord(raw ?? {})
		const context = sendContext({ ...rawSend, at: e.at, code: e.code, msgId: e.msgId, askMsgId: e.askMsgId ?? rawSend?.askMsgId, askAt: e.askAt }, workflow ? store.thread(workflow.id) : [])
		const person = context.asker?.name ?? 'Someone', where = workflow?.chat.group && workflow.chat.id === context.chat ? ` in ${placeOf(store, workflow.chat, context.asker)?.sentence ?? workflow.chat.name}` : ''
		rows[ref(e)] = {
			code: e.code!, kind: 'reply', who: { name: person, initials: person.split(/\s+/).map(word => word[0]).slice(0, 2).join(''), hue: 210 },
			sentence: `Replied to ${person}${where}${workflow?.redacted || context.text === undefined ? ' (sent words no longer available)' : ''}`,
			ask: workflow?.redacted ? undefined : context.ask, said: workflow?.redacted ? undefined : context.text,
			teams: context.chat && context.msgId && !workflow?.chat.test ? link(context.chat, context.msgId) : undefined,
			at: e.at, by: context.approvedBy?.startsWith('rule:') ? `by rule ${context.approvedBy.slice(5)}` : 'by you',
		}
	}
	const tz = store.config()?.tz, today = dayIn(now, tz), fourFrom = addDays(weekOf(today), -21)
	const within = (e: Ev, four: boolean) => { const day = dayIn(e.at, tz); return day >= (four ? fourFrom : n.window.from) && day <= (four ? today : n.window.to) }
	const sendKeys: Record<string, string[][]> = {}
	const keys = (wanted: string[], candidates: Ev[]) => {
		const used = new Map<string, number>()
		return wanted.map(code => { const index = used.get(code) ?? 0; used.set(code, index + 1); const event = candidates.filter(e => e.code === code)[index]; return event ? ref(event) : code })
	}
	for (const four of [false, true]) {
		const r = four ? n.four.replies : n.now.replies
		const eligible = sends.filter(e => !e.holding && within(e, four))
		const groups = [
			keys(r.drafted, eligible.filter(e => e.asDrafted === true)),
			keys(r.edited, eligible.filter(e => e.asDrafted === false)),
			r.teams,
		]
		sendKeys[four ? 'four-replies' : 'replies'] = groups
		if (!four) {
			sendKeys.drafted = [groups[0]]; sendKeys.edited = [groups[1]]
			sendKeys.unknown = [keys(r.unknown, eligible.filter(e => e.asDrafted === undefined))]
		}
	}
	sendKeys.sends = [keys(n.corrections.sent, sends.filter(e => !e.holding && within(e, true)))]
	for (const four of [false, true]) {
		const teams = events.filter(e => e.event === 'closed' && e.closedBy === 'replied' && within(e, four)).filter((e, i, all) => all.findIndex(other => other.code === e.code) === i)
		const timed = [...sends.filter(e => within(e, four) && e.askAt).map(e => ({ code: e.code!, key: ref(e), minutes: (Date.parse(e.at) - Date.parse(e.askAt!)) / 60_000 })),
			...teams.filter(e => e.askAt && e.replyAt).map(e => ({ code: e.code!, key: e.code!, minutes: (Date.parse(e.replyAt!) - Date.parse(e.askAt!)) / 60_000 }))]
			.filter(e => e.minutes >= 0).sort((a, b) => a.minutes - b.minutes)
		sendKeys[four ? 'four-wait' : 'wait'] = [timed.map(e => e.key)]
	}
	const handled = (wanted: string[]) => wanted.map(code => {
		const e = sends.filter(e => e.code === code && e.asDrafted && !e.holding && !e.changesOff).sort((a, b) => a.at.localeCompare(b.at))[0]
		return n.handled.reply.includes(code) && e ? ref(e) : code
	})
	for (const [key, codes] of Object.entries({ handled: n.handled.codes, reply: n.handled.reply, check: n.handled.provisional })) sendKeys[key] = [handled(codes)]
	for (const bar of n.bars) sendKeys[`week:${bar.week}`] = [handled(bar.codes)]
	sendKeys.corrections = [n.corrections.codes.map(code => {
		const correction = events.filter(e => e.code === code && (e.event === 'marked' || e.event === 'undo') && within(e, true)).sort((a, b) => b.at.localeCompare(a.at))[0]
		const e = correction && sends.filter(e => e.code === code && (correction.target ? e.msgId === correction.target : e.at <= correction.at)).sort((a, b) => b.at.localeCompare(a.at))[0]
		return e ? ref(e) : code
	})]
	return { ...n, rows, missed, sendKeys, usage: key === 'custom'
		? usageWindow(evs, n.window, Array.from({ length: (Date.parse(weekOf(n.window.to)) - Date.parse(weekOf(n.window.from))) / (7 * 86_400_000) + 1 }, (_, i) => addDays(weekOf(n.window.from), 7 * i)), tz, today, filter, true)
		: usageWindow(evs, n.window, n.bars.map(b => b.week), tz, today, filter) }
}

// COST-USAGE + D-COST (PM FINAL credits 04:03:13, amended B; Designer UR1-UR3/URΔ; PE §6, §7.4, §7.6): the AI USE section's words and
// cells, the same for New and Classic. Unknown is a word, never 0; credits are shown only where runs reported them (Σ nano-credits of
// complete or own-key runs), with "≈ $ at list rate" from AI_CREDIT_LIST_USD; the numbers open no rows (PM rule-2 exception).
export type UsageCell = { text: string; title?: string; unknown?: true; muted?: true }
// UR1.3/URΔ3: a bar's segments, bottom up, as % of the tallest bar: tokens [in (not cached), cached, out] when every reporting run split
// its tokens, else [in, out] with whole set (its in segment then includes any cached part); credits [credits]. off: the word for a bar
// with no figure (not counted, not reported), drawn as an empty dashed bar, never a 0 bar. value: the figure above it.
export type UsageBarModel = { key: string; label: string; value?: string; segs: number[]; whole?: true; off?: string; since: boolean; alt: string }
export type UsageBars = { caption: string; tokens: UsageBarModel[]; credits: UsageBarModel[] }
export type UsageTable = { columns: { text: string; title: string }[]; rows: { label: string; cells: UsageCell[] }[]; total: { cells: UsageCell[]; note?: string } }
export type UsageModel = {
	state: 'before' | 'after'; note?: string; earlier?: string
	today?: { text: string; atCap: boolean }
	headline?: string; coverage?: string; unreported?: { text: string; title: string }; bars?: { week: UsageBars; day?: UsageBars }
	credits?: { text: string; coverage?: string; help: string }
	kinds: UsageTable; models: UsageTable
	// URΔ4: query selects this window for the filtered fetch; each filter's choices (All is value ''), its active value, and Machine only
	// where 2 or more machines ran something in the window (or one is chosen).
	query: string; filters: { model: UsageChoice; kind: UsageChoice; machine?: UsageChoice }
}
export type UsageChoice = { options: { value: string; text: string }[]; value?: string }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const md = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
const runsWord = (n: number) => `${n} AI run${n === 1 ? '' : 's'}`
const big = (n: number): UsageCell => (n < 1000 ? { text: String(n) } : { text: n < 1e6 ? `${n < 10_000 ? +(n / 1000).toFixed(1) : Math.round(n / 1000)} k` : `${+(n / 1e6).toFixed(1)} M`, title: n.toLocaleString('en-US') })
const time = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${+(ms / 3_600_000).toFixed(1)} h`)
const UNKNOWN: UsageCell = { text: 'unknown', unknown: true }, NOT_COUNTED: UsageCell = { text: 'not counted', unknown: true }, NOT_REPORTED: UsageCell = { text: 'not reported', unknown: true }
const tokensOf = (u: Use) => (u.tokensIn !== undefined && u.tokensOut !== undefined ? u.tokensIn + u.tokensOut : undefined)
// Credits from integer nano-credits: up to two decimals; ≈ $ at the list rate, always with "≈" (PM FINAL).
export const creditsText = (nano: number) => (nano / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const dollarsText = (nano: number) => `≈ $${((nano / 1e9) * AI_CREDIT_LIST_USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const CREDITS_HELP = `Credits as your AI tool reports them. ≈ $ uses the list rate ($${AI_CREDIT_LIST_USD.toFixed(2)} per credit). Your plan's included credits aren't known to ${NAME}, so this isn't your bill.`
const creditCell = (u: Use): UsageCell => !u.runs ? { text: '0' } : !u.credits.runs ? NOT_REPORTED
	: u.credits.byok === u.credits.runs ? { text: '0 · own key · no credits', muted: true }
		: { text: creditsText(u.credits.nano), ...(u.credits.runs < u.runs ? { title: `${u.credits.runs} of ${u.runs} runs reported credits` } : {}) }
const dollarCell = (u: Use): UsageCell => !u.runs ? { text: '≈ $0.00' } : !u.credits.runs ? NOT_REPORTED : u.credits.byok === u.credits.runs ? { text: '0 · own key · no credits', muted: true } : { text: dollarsText(u.credits.nano) }
const opt = (v: number | undefined, missing: UsageCell) => (v === undefined ? missing : big(v))
// By kind (Designer UR1.4 + URΔ2): tokens in · cached · out · runs · re-runs · Credits.
const KIND_COLUMNS = [
	{ text: 'tokens in', title: 'Tokens in: the text the AI read, including any read from the cache.' },
	{ text: 'cached', title: 'Cached: the part of the tokens in that the AI read from its cache. Shown only where your AI tool reports it.' },
	{ text: 'out', title: 'Tokens out: the text the AI wrote.' },
	{ text: 'runs', title: `AI runs: each time ${NAME} started the AI for a piece of work.` },
	{ text: 're-runs', title: 'Re-runs: runs started again to retry, to refresh tools, after a requeue, or through a relay.' },
	{ text: 'Credits', title: 'Credits as your AI tool reports them.' },
]
const kindCells = (u: Use, counted = true): UsageCell[] => !counted ? KIND_COLUMNS.map(() => NOT_COUNTED)
	: [opt(u.tokensIn, UNKNOWN), opt(u.tokensCacheRead, NOT_REPORTED), opt(u.tokensOut, UNKNOWN), { text: String(u.runs) }, { text: String(u.reruns) }, creditCell(u)]
// By model (AU3 + URΔ2): the AU3 columns, then Credits and ≈ $.
const MODEL_COLUMNS = [
	{ text: 'AI runs', title: `AI runs: each time ${NAME} started the AI for a piece of work.` },
	{ text: 'model calls', title: 'Model calls: the requests the AI sent to its model in those runs.' },
	{ text: 'input tokens', title: 'Tokens: the amount of text the AI read (input) and wrote (output).' },
	{ text: 'output tokens', title: 'Tokens: the amount of text the AI read (input) and wrote (output).' },
	{ text: 'tool calls', title: 'Tool calls: the tools the AI used, such as reading a file or a PR.' },
	{ text: 'time', title: 'Time: how long the runs took, start to finish.' },
	{ text: 'Credits', title: 'Credits as your AI tool reports them.' },
	{ text: '≈ $', title: `≈ $ at the list rate ($${AI_CREDIT_LIST_USD.toFixed(2)} per credit): an estimate, not your bill.` },
]
const modelCells = (u: Use, counted = true): UsageCell[] => !counted ? MODEL_COLUMNS.map(() => NOT_COUNTED)
	: [{ text: String(u.runs) }, ...([u.modelCalls, u.tokensIn, u.tokensOut, u.toolCalls].map(v => opt(v, UNKNOWN))), u.ms === undefined ? UNKNOWN : { text: time(u.ms) }, creditCell(u), dollarCell(u)]
const COVERAGE = (u: Use) => `Usage reported for ${u.reported} of ${runsWord(u.runs)}`
export const USAGE_RULE = `Each AI run ${NAME} started, from its own log on all your machines, counted once. A run that didn't report what it used counts as a run, and its numbers read "unknown" or "not reported", never 0. These numbers don't open a list: to see what one item used, open it: it's in its Details.`
// The Today line (UR1.1, PM FINAL): any part no run reported reads "not reported", never 0; credits only when some run reported them.
function todayLine(u: Use, daily?: { runs: number; cap: number }) {
	const parts = [u.tokensIn === undefined ? 'tokens in not reported' : `${big(u.tokensIn).text} tokens in (${u.tokensCacheRead === undefined ? 'cache not reported' : `${big(u.tokensCacheRead).text} from cache`})`,
		u.tokensOut === undefined ? 'out not reported' : `${big(u.tokensOut).text} out`, runsWord(u.runs), ...(daily ? [`${daily.runs} of ${daily.cap} daily runs`] : []),
		...(u.credits.runs && u.credits.byok < u.credits.runs ? [`${creditsText(u.credits.nano)} credits`] : [])]
	return { text: `Today: ${parts.join(' · ')}`, atCap: !!daily && daily.runs >= daily.cap }
}

// UR1.3 (+ URΔ3): one set of bars (weeks or days), as stacked tokens and as credits. Each bar's text says what it shows, with its coverage.
const pct = (v: number, top: number) => Math.round((v / top) * 100)
function barsOf(periods: { key: string; label: string; name: string; use?: Use; since?: string }[], caption: string, tz?: string): UsageBars {
	const split = (u: Use) => (u.split && u.reported > 0 && u.split.runs === u.reported ? u.split : undefined)
	const height = (u?: Use) => { const s = u && split(u); return s ? s.input + s.cacheWrite + s.cacheRead + s.output : u ? tokensOf(u) ?? 0 : 0 }
	const tokenTop = Math.max(1, ...periods.map(p => height(p.use))), creditTop = Math.max(1, ...periods.map(p => p.use?.credits.nano ?? 0))
	const since = (p: { since?: string }) => (p.since ? `. Counted since ${md(dayIn(p.since, tz))}` : '')
	const cover = (u: Use) => (u.reported < u.runs ? `, usage reported for ${u.reported} of ${u.runs}` : '')
	const notCounted = (p: { key: string; label: string; name: string }) => ({ key: p.key, label: p.label, segs: [], off: 'not counted', since: false, alt: `${p.name}: not counted` })
	const none = (p: { key: string; label: string; name: string; since?: string }) => ({ key: p.key, label: p.label, value: '0', segs: [], since: !!p.since, alt: `${p.name}: no AI runs${since(p)}` })
	return {
		caption,
		tokens: periods.map(p => {
			const u = p.use
			if (!u) return notCounted(p)
			if (!u.runs) return none(p)
			const s = split(u), tail = `${runsWord(u.runs)}${cover(u)}${since(p)}`
			// CR COST4b B1: a complete split is the bar's whole source, its total, its text and its segments, whether or not the flat counts
			// were reported; the flat counts draw only the unsplit fallback.
			if (s) {
				const tokensIn = s.input + s.cacheWrite + s.cacheRead
				return { key: p.key, label: p.label, value: big(tokensIn + s.output).text, since: !!p.since, segs: [pct(s.input + s.cacheWrite, tokenTop), pct(s.cacheRead, tokenTop), pct(s.output, tokenTop)],
					alt: `${p.name}: ${big(tokensIn).text} in (${big(s.cacheRead).text} cached) · ${big(s.output).text} out · ${tail}` }
			}
			const t = tokensOf(u)
			if (t === undefined) return { key: p.key, label: p.label, segs: [], off: 'not reported', since: !!p.since, alt: `${p.name}: tokens not reported · ${tail}` }
			return { key: p.key, label: p.label, value: big(t).text, since: !!p.since, segs: [pct(u.tokensIn!, tokenTop), pct(u.tokensOut!, tokenTop)], whole: true as const,
				alt: `${p.name}: ${big(u.tokensIn!).text} in (${u.tokensCacheRead === undefined ? 'cache not reported' : `${big(u.tokensCacheRead).text} cached`}) · ${big(u.tokensOut!).text} out · ${tail}` }
		}),
		credits: periods.map(p => {
			const u = p.use
			if (!u) return notCounted(p)
			if (!u.runs) return none(p)
			const c = u.credits, of = c.runs < u.runs ? `, ${c.runs} of ${u.runs} runs reported credits` : ''
			if (!c.runs) return { key: p.key, label: p.label, segs: [], off: 'not reported', since: !!p.since, alt: `${p.name}: credits not reported · ${runsWord(u.runs)}${of}${since(p)}` }
			if (c.byok === c.runs) return { key: p.key, label: p.label, value: '0', segs: [], since: !!p.since, alt: `${p.name}: 0 · own key · no credits · ${runsWord(u.runs)}${of}${since(p)}` }
			return { key: p.key, label: p.label, value: creditsText(c.nano), segs: [pct(c.nano, creditTop)], since: !!p.since, alt: `${p.name}: ${creditsText(c.nano)} credits · ${runsWord(u.runs)}${of}${since(p)}` }
		}),
	}
}

// A long run of bars names every k-th, so their labels never collide; each bar's text still names its own period.
const named = (n: number, i: number) => n <= 14 || i % Math.ceil(n / 8) === 0 || i === n - 1
export function usageModel(u: UsageWindow, key: WindowKey, tz?: string, daily?: { runs: number; cap: number }, filter: UsageFilter = {}, custom?: Span): UsageModel {
	const t = tokensOf(u.total), label = { this: 'This week', last: 'Last week', '4w': 'Last 4 weeks', all: 'Since you started', custom: 'Custom range' }[key]
	const range = custom && `${md(custom.from)} to ${md(custom.to)}`
	const sinceDay = u.since ? dayIn(u.since, tz) : undefined
	const missing = u.total.runs - u.total.reported, counted = u.state === 'after'
	// URΔ1: the window's credits: the figure and its list-rate estimate, or "not reported for these runs" (window-scoped); X of Y when some didn't.
	const c = u.total.credits
	const machines = u.options.machines.length >= 2 || filter.machine !== undefined ? [...new Set([...u.options.machines, ...(filter.machine !== undefined ? [filter.machine] : [])])] : undefined
	const models = [...u.options.models, ...(filter.model !== undefined && !u.options.models.some(m => m.id === filter.model) ? [{ id: filter.model, label: filter.model }] : [])]
	return {
		state: u.state,
		// PE §9.2: the standing Today line shows in either state, whenever today itself is counted.
		...(u.today ? { today: todayLine(u.today, daily) } : {}),
		query: custom ? `window=custom&from=${custom.from}&to=${custom.to}` : `window=${key}`,
		filters: {
			model: { options: models.map(m => ({ value: m.id, text: m.label })), ...(filter.model !== undefined ? { value: filter.model } : {}) },
			kind: { options: USAGE_KINDS.map(k => ({ value: k.label, text: k.label })), ...(filter.kind !== undefined ? { value: filter.kind } : {}) },
			...(machines ? { machine: { options: machines.map(m => ({ value: m, text: m })), ...(filter.machine !== undefined ? { value: filter.machine } : {}) } } : {}),
		},
		...(u.state === 'before'
			? { note: sinceDay ? `Owner-reply and promise checks not included before ${md(sinceDay)}.` : `Not fully counted yet: checks of your own replies and promises are included after ${NAME}'s next update.` }
			: {
				// URΔ5 / PE §7.7: the earlier-use line takes the old "Counted since" slot.
				...(u.earliest ? { earlier: `Includes earlier use from your AI tool's saved sessions, from ${md(dayIn(u.earliest, tz))}.` }
					: u.clipped && sinceDay ? { earlier: `Counting from ${md(sinceDay)}, when this machine updated. Earlier use isn't available.` } : {}),
				headline: `${label}: ${runsWord(u.total.runs)} · ${t === undefined ? 'unknown' : big(t).text} tokens`,
				credits: { text: c.runs && c.byok < c.runs ? `${creditsText(c.nano)} AI credits · ${dollarsText(c.nano)} at list rate` : c.runs ? '0 · own key · no credits' : 'Credits: not reported for these runs',
					...(c.runs < u.total.runs ? { coverage: `${c.runs} of ${u.total.runs} runs reported credits` } : {}), help: CREDITS_HELP },
				coverage: COVERAGE(u.total),
				...(missing > 0 ? { unreported: { text: `${missing} run${missing === 1 ? '' : 's'} didn't report usage`, title: `Not reported: ${u.missing.join(', ')}.` } } : {}),
				bars: {
					week: barsOf(u.bars.map((b, i) => ({ key: b.week, label: named(u.bars.length, i) ? md(b.span?.from ?? b.week) : '', name: b.span ? `${md(b.span.from)} to ${md(b.span.to)}` : `Week of ${md(b.week)}`, use: b.use, since: b.since })), range ? `by week, ${range}` : 'the last 8 weeks', tz),
					...(u.days.length ? { day: barsOf(u.days.map((d, i) => ({ key: d.day, label: named(u.days.length, i) ? String(Number(d.day.slice(8, 10))) : '', name: md(d.day), use: d.use, since: d.since })), range ? `by day, ${range}` : `the last 14 days (${md(u.days[0].day)} to today)`, tz) } : {}),
				},
			}),
		kinds: { columns: KIND_COLUMNS, rows: u.kinds.map(k => ({ label: k.label, cells: kindCells(k.use, k.counted) })), total: { cells: kindCells(u.total, counted) } },
		models: { columns: MODEL_COLUMNS, rows: u.models.map(m => ({ label: m.label, cells: modelCells(m.use) })), total: { cells: modelCells(u.total, counted), ...(counted ? { note: COVERAGE(u.total) } : {}) } },
	}
}

// AU4 (PM 12:49:18Z): "What it used: <N> AI runs · <tokens> tokens · <time> · <model>" from the runs that reported, with "(<k> runs didn't
// report usage)" when some didn't; "· usage unknown" only when none did. Never one "unknown" for a partly counted item.
// None for an item with no attributed runs. Counted once per log change: the snapshot asks every 20 seconds.
export function usedLine(u: Use & { models: string[] }): string | undefined {
	if (!u.runs) return undefined
	if (!u.reported) return `What it used: ${runsWord(u.runs)} · usage unknown`
	const t = tokensOf(u), missing = u.runs - u.reported
	// D-COST URΔ2 (PM FINAL): "· <C> credits" when its runs reported credits; own-key runs only: "· 0 · own key · no credits".
	const credits = u.credits.runs ? u.credits.byok === u.credits.runs ? ['0 · own key · no credits'] : [`${creditsText(u.credits.nano)} credits`] : []
	return `What it used: ${[runsWord(u.runs), ...(t !== undefined ? [`${big(t).text} tokens`] : []), ...(u.ms !== undefined ? [time(u.ms)] : []), ...u.models.slice(0, 1), ...credits].join(' · ')}${missing ? ` (${missing} run${missing === 1 ? '' : 's'} didn't report usage)` : ''}`
}
// The snapshot asks every 20 seconds and today's log grows all day, so only this week and last are counted again (review P2-4); the
// older weeks' runs are kept until one of their files changes (a late sync from another machine).
const usedCache = new Map<string, { old: string; oldEvs: Ev[]; key: string; lines: Map<string, string> }>()
export function usedLines(store: Store, now = new Date()): Map<string, string> {
	const wfs = store.workflows(), from = addDays(weekOf(now.toISOString().slice(0, 10)), -7), files = store.logFiles()
	const stat = (file: string) => { try { const st = statSync(file); return `${file}:${st.size}:${st.mtimeMs}` } catch { return file } }
	const keyOf = (recent: boolean) => [...store.numberWeeks().filter(w => (w.week >= from) === recent).map(w => w.file), ...files.filter(f => (weekOf(f.day) >= from) === recent).map(f => stat(f.file))].join('|')
	const old = keyOf(false), key = [old, keyOf(true), ...wfs.map(w => `${w.id}:${w.job ?? ''}`)].join('|')
	const had = usedCache.get(store.root)
	if (had?.key === key) return had.lines
	const oldEvs = had?.old === old ? had.oldEvs : counted(store).filter(e => e.event === 'run' && weekOf(e.at.slice(0, 10)) < from)
	const byJob = new Map<string, string[]>()
	for (const w of wfs) if (w.job) byJob.set(w.job, [...(byJob.get(w.job) ?? []), w.id])
	const evs = [...oldEvs, ...counted(store, from).filter(e => e.event === 'run')]
	const lines = new Map([...usageByItem(evs, job => (byJob.get(job)?.length === 1 ? byJob.get(job)![0] : undefined))].flatMap(([id, u]) => { const l = usedLine(u); return l ? [[id, l] as const] : [] }))
	usedCache.set(store.root, { old, oldEvs, key, lines })
	return lines
}