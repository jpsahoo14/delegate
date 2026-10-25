import type { Store } from '../store/state.ts'
import { counted } from '../store/numbers.ts'
import { statSync } from 'node:fs'
import { numbers, weekOf, addDays, usageWindow, usageByItem, type Numbers, type WindowKey, type Ev, type UsageWindow, type Use } from '../core/numbers.ts'
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

export function numbersPage(store: Store, key: WindowKey = 'this', now = new Date()): NumbersPage {
	const evs = counted(store), wfs = store.workflows(), n = numbers(evs, wfs, now, store.config()?.tz, key)
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
	return { ...n, rows, missed, sendKeys, usage: usageWindow(evs, n.window, n.bars.map(b => b.week), tz) }
}

// COST-USAGE: the AI USE section's words and cells, the same for New and Classic (PM FINAL wording; Designer AU1-AU5).
// Unknown is a word, never 0; no credit or money figure; the numbers open no rows (PM rule-2 exception).
export type UsageCell = { text: string; title?: string; unknown?: true }
export type UsageBarModel = { week: string; label: string; n?: number; height: number; since: boolean; alt: string }
export type UsageModel = {
	credits: string; state: 'before' | 'after'; note?: string
	headline?: string; coverage?: string; unreported?: { text: string; title: string }; bars?: UsageBarModel[]
	columns: { text: string; title: string }[]; kinds: { label: string; cells: UsageCell[] }[]; models: { label: string; cells: UsageCell[] }[]; total: { cells: UsageCell[]; note?: string }
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const md = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
const runsWord = (n: number) => `${n} AI run${n === 1 ? '' : 's'}`
const big = (n: number): UsageCell => (n < 1000 ? { text: String(n) } : { text: n < 1e6 ? `${n < 10_000 ? +(n / 1000).toFixed(1) : Math.round(n / 1000)} k` : `${+(n / 1e6).toFixed(1)} M`, title: n.toLocaleString('en-US') })
const time = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${+(ms / 3_600_000).toFixed(1)} h`)
const UNKNOWN: UsageCell = { text: 'unknown', unknown: true }, NOT_COUNTED: UsageCell = { text: 'not counted', unknown: true }
const tokensOf = (u: Use) => (u.tokensIn !== undefined && u.tokensOut !== undefined ? u.tokensIn + u.tokensOut : undefined)
const cells = (u: Use, counted = true): UsageCell[] => !counted ? Array.from({ length: 6 }, () => NOT_COUNTED)
	: [{ text: String(u.runs) }, ...([u.modelCalls, u.tokensIn, u.tokensOut, u.toolCalls].map(v => (v === undefined ? UNKNOWN : big(v)))), u.ms === undefined ? UNKNOWN : { text: time(u.ms) }]
const COVERAGE = (u: Use) => `Usage reported for ${u.reported} of ${runsWord(u.runs)}`
export const USAGE_RULE = `Each AI run ${NAME} started, from its own log on all your machines, counted once. A run that didn't report what it used counts as a run, and its numbers read "unknown", never 0. These numbers don't open a list: to see what one item used, open it: it's in its Details.`
const COLUMNS = [
	{ text: 'AI runs', title: `AI runs: each time ${NAME} started the AI for a piece of work.` },
	{ text: 'model calls', title: 'Model calls: the requests the AI sent to its model in those runs.' },
	{ text: 'input tokens', title: 'Tokens: the amount of text the AI read (input) and wrote (output).' },
	{ text: 'output tokens', title: 'Tokens: the amount of text the AI read (input) and wrote (output).' },
	{ text: 'tool calls', title: 'Tool calls: the tools the AI used, such as reading a file or a PR.' },
	{ text: 'time', title: 'Time: how long the runs took, start to finish.' },
]

export function usageModel(u: UsageWindow, key: WindowKey, tz?: string): UsageModel {
	const t = tokensOf(u.total), label = { this: 'This week', last: 'Last week', '4w': 'Last 4 weeks', all: 'Since you started' }[key]
	const sinceDay = u.since ? dayIn(u.since, tz) : undefined
	const top = Math.max(1, ...u.bars.map(b => b.use?.runs ?? 0))
	const missing = u.total.runs - u.total.reported
	return {
		credits: `Credits aren't shown: your AI tool doesn't report them. ${NAME} shows the runs and tokens it can count.`,
		state: u.state,
		...(u.state === 'before'
			? { note: sinceDay ? `Owner-reply and promise checks not included before ${md(sinceDay)}.` : `Not fully counted yet: checks of your own replies and promises are included after ${NAME}'s next update.` }
			: {
				...(u.clipped && sinceDay ? { note: `Counted since ${md(sinceDay)}` } : {}),
				headline: `${label}: ${runsWord(u.total.runs)} · ${t === undefined ? 'unknown' : big(t).text} tokens`,
				coverage: COVERAGE(u.total),
				...(missing > 0 ? { unreported: { text: `${missing} run${missing === 1 ? '' : 's'} didn't report usage`, title: `Not reported: ${u.missing.join(', ')}.` } } : {}),
				bars: u.bars.map(b => {
					const tokens = b.use ? tokensOf(b.use) : undefined
					return { week: b.week, label: md(b.week), ...(b.use ? { n: b.use.runs } : {}), height: b.use ? Math.round((b.use.runs / top) * 100) : 0, since: !!b.since,
						alt: b.use ? `Week of ${md(b.week)}: ${runsWord(b.use.runs)}, ${tokens === undefined ? 'tokens unknown' : `${big(tokens).text} tokens`}, usage reported for ${b.use.reported} of ${b.use.runs}${b.since ? `. Counted since ${md(dayIn(b.since, tz))}` : ''}` : `Week of ${md(b.week)}: not counted` }
				}),
			}),
		columns: COLUMNS,
		kinds: u.kinds.map(k => ({ label: k.label, cells: cells(k.use, k.counted) })),
		models: u.models.map(m => ({ label: m.label, cells: cells(m.use) })),
		total: { cells: cells(u.total, u.state === 'after'), ...(u.state === 'after' ? { note: COVERAGE(u.total) } : {}) },
	}
}

// AU4 (PM 12:49:18Z): "What it used: <N> AI runs · <tokens> tokens · <time> · <model>" from the runs that reported, with "(<k> runs didn't
// report usage)" when some didn't; "· usage unknown" only when none did. Never one "unknown" for a partly counted item.
// None for an item with no attributed runs. Counted once per log change: the snapshot asks every 20 seconds.
export function usedLine(u: Use & { models: string[] }): string | undefined {
	if (!u.runs) return undefined
	if (!u.reported) return `What it used: ${runsWord(u.runs)} · usage unknown`
	const t = tokensOf(u), missing = u.runs - u.reported
	return `What it used: ${[runsWord(u.runs), ...(t !== undefined ? [`${big(t).text} tokens`] : []), ...(u.ms !== undefined ? [time(u.ms)] : []), ...u.models.slice(0, 1)].join(' · ')}${missing ? ` (${missing} run${missing === 1 ? '' : 's'} didn't report usage)` : ''}`
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