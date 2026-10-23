import type { Store } from '../store/state.ts'
import { counted } from '../store/numbers.ts'
import { numbers, weekOf, addDays, type Numbers, type WindowKey, type Ev } from '../core/numbers.ts'
import { messageLink } from '../adapters/channels.ts'
import { listsOf } from './app/model/numbers.ts'
import { itemRows, type DoneRow } from './view.ts'
import { sendContext, sendRecord } from '../store/send-context.ts'
import { dayIn } from '../core/schedule.ts'

// What the Numbers tab gets (R-NEX-11, design-spec/north-star-tab.md): the numbers with their codes, and the rows those codes
// stand for, so every number opens exactly what it counted. rows: each item in Done's row format, for the lists this window's
// page can open (the page's own listsOf), without the sent text, why, and notes a Numbers list never expands. missed: a message
// the owner pointed at that never became an item (code missed:<msgId>), with when, and where it is in Teams.
export type NumbersRow = Omit<DoneRow, 'text' | 'why' | 'notes'>
export type MissedLink = { at: string; teams?: string }
export type NumbersPage = Numbers & { rows: Record<string, NumbersRow>; missed: Record<string, MissedLink>; sendKeys?: Record<string, string[][]> }

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
		const person = context.asker?.name ?? 'Someone', where = workflow?.chat.group && workflow.chat.id === context.chat ? ` in ${workflow.chat.name}` : ''
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
	return { ...n, rows, missed, sendKeys }
}
