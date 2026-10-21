import type { Store } from '../store/state.ts'
import { counted } from '../store/numbers.ts'
import { numbers, type Numbers, type WindowKey } from '../core/numbers.ts'
import { isThread, threadLink } from '../adapters/channels.ts'
import { listsOf } from './app/model/numbers.ts'
import { itemRows, type DoneRow } from './view.ts'

// What the Numbers tab gets (R-NEX-11, design-spec/north-star-tab.md): the numbers with their codes, and the rows those codes
// stand for, so every number opens exactly what it counted. rows: each item in Done's row format, for the lists this window's
// page can open (the page's own listsOf), without the sent text, why, and notes a Numbers list never expands. missed: a message
// the owner pointed at that never became an item (code missed:<msgId>), with when, and where it is in Teams.
export type NumbersRow = Omit<DoneRow, 'text' | 'why' | 'notes'>
export type MissedLink = { at: string; teams?: string }
export type NumbersPage = Numbers & { rows: Record<string, NumbersRow>; missed: Record<string, MissedLink> }

const link = (chat: string, msgId: string) => (isThread(chat) ? threadLink(chat, msgId) : `https://teams.microsoft.com/l/message/${encodeURIComponent(chat)}/${msgId}`)

export function numbersPage(store: Store, key: WindowKey = 'this', now = new Date()): NumbersPage {
	const evs = counted(store), wfs = store.workflows(), n = numbers(evs, wfs, now, store.config()?.tz, key)
	const codes = new Set(Object.values(listsOf({ ...n, rows: {}, missed: {} })).flatMap(l => l.groups.flatMap(g => g.codes)))
	const missed: Record<string, MissedLink> = {}
	for (const e of evs) if (e.event === 'missed') {
		const code = `missed:${e.msgId ?? e.at}`
		if (codes.has(code) && !missed[code]) missed[code] = { at: e.at, ...(e.chat && e.msgId ? { teams: link(e.chat, e.msgId) } : {}) }
	}
	const rows = Object.fromEntries(Object.entries(itemRows(store, [...codes].filter(c => !c.startsWith('missed:')), wfs)).map(([c, { text: _t, why: _w, notes: _n, ...r }]) => [c, r]))
	return { ...n, rows, missed }
}
