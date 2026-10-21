// The page's state: the view from the server (V) and what the owner is doing on this page (S). Views read them; changes go
// through setView and the actions in state/actions.ts. Lives for one page load.
import { orderOf } from '../model/derive.ts'
import type { IO } from '../io/transport.ts'
import type { AutoForm, Boot, CardUi, ItemCard, KnowledgeCard, NumbersPage, RowWatch, SheetWatch, View, WindowKey } from '../model/types.ts'

export type PageState = {
	// The address after '#', and the card the queue is on.
	route: string; cur: string | null
	ui: Record<string, CardUi>
	// A newer version of a card the owner had started on, shown when they ask for it.
	fresh: Record<string, ItemCard | KnowledgeCard>
	// The queue's order; cards handled this visit, with what was said; cards moved to later.
	order: string[]; done: Map<string, { msg: string; card: ItemCard | KnowledgeCard }>; later: Set<string>
	offline: boolean
	// A redraw is owed: it waited while the owner typed or held a button.
	deferred: boolean; pressing?: number; flushT?: ReturnType<typeof setTimeout> | null
	// The automation sheet and its forms.
	sheet: null | 'pick' | 'form' | 'watch'; form: AutoForm | null; wform?: SheetWatch; formBusy: boolean; formErr: string; newAuto: string | null
	// Done: the seen marks as they were when this filter was opened, the filter they are for, and the Catch up row being watched.
	seenOpen?: Record<string, string>; seenFor?: string | null; watchOpen?: string | null; watchForm?: RowWatch | null
	// Now: each row's seen mark as it was when this look at Now first showed it, so New and Back to you stay for the look
	// though the row is marked seen a moment later (N1b). Cleared when the owner leaves Now. And Find's words.
	nowLook?: Record<string, string> | null; find?: string
	// A composition (a dead key or an IME) is in progress in a field: a redraw would cancel it (review P1-4).
	composing?: boolean
	// Settings edits not saved yet, and whether More is open.
	set: Record<string, string>; advOpen?: boolean
	// Now's footer: whether the list of channels the owner named is open.
	chanOpen?: boolean
	missedLink?: string; missing?: boolean; checking?: boolean; reporting?: boolean
	// The Numbers tab (R-NEX-11): its window, the last answer for it, whether one is on its way or could not be had, which
	// "How is this counted?" lines are open, and a counter so an older answer never replaces a newer one.
	num: { win: WindowKey; data?: NumbersPage; busy: boolean; failed: boolean; seq: number; how: Set<string> }
}

// What the shell said about this page: snapshot or live, the brand words, the version it started on, and how it acts.
export const env = { snap: false, name: '', cmd: '', start: undefined as string | undefined, io: null as IO | null, poll: 2000, ui: 'classic' as 'new' | 'classic', panel: false }
export let V: View
export const S: PageState = { route: 'home', cur: null, ui: {}, fresh: {}, order: [], done: new Map(), later: new Set(), offline: false, deferred: false, sheet: null, form: null, formBusy: false, formErr: '', newAuto: null, set: {}, num: { win: 'this', busy: false, failed: false, seq: 0, how: new Set() } }

export function init(boot: Boot, io: IO | null, poll: number) {
	Object.assign(env, { snap: boot.mode === 'snapshot', panel: boot.mode === 'panel', name: boot.name, cmd: boot.cmd, start: boot.view.version?.code, io, poll })
	V = boot.view
}
export const setView = (v: View) => { V = v }

export function U(code: string): CardUi {
	return S.ui[code] ??= { status: 'ready', msg: '', lost: false, stale: false, touched: false, pick: null, otherOn: false, other: '', editing: false, text: null, answer: '', ask: '', cmts: null, facts: null, threadOpen: false, whyOpen: false, dbgOpen: false, menu: false }
}
// A card's or row's state for drawing: what is there, or the defaults, without creating an entry (drawing writes no state).
const IDLE: CardUi = Object.freeze({ status: 'ready', msg: '', lost: false, stale: false, touched: false, pick: null, otherOn: false, other: '', editing: false, text: null, answer: '', ask: '', cmts: null, facts: null, threadOpen: false, whyOpen: false, dbgOpen: false, menu: false }) as CardUi
export const peek = (code: string): CardUi => S.ui[code] ?? IDLE
export const cardOf = (code: string): ItemCard | KnowledgeCard | undefined => V.needs.find(c => c.code === code) || V.knowledge.find(c => c.code === code)
export function syncOrder() {
	S.order = orderOf(S.order, V.needs, c => S.done.has(c), c => S.later.has(c))
}
export const queue = () => S.order.map(c => V.needs.find(x => x.code === c) || S.done.get(c)?.card as ItemCard | undefined).filter((c): c is ItemCard => !!c)
export const openCards = () => queue().filter(c => !S.done.has(c.code))
export function replaceCard(c: ItemCard | KnowledgeCard) {
	const list = (/^K/.test(c.code) ? V.knowledge : V.needs) as (ItemCard | KnowledgeCard)[], i = list.findIndex(x => x.code === c.code)
	if (i >= 0) list[i] = c; else list.push(c)
	syncOrder()
}

// What the drawing layer lends the actions: draw again (now, or once the owner stops typing), and say something.
export const hooks = {
	render: (_enter?: boolean) => {},
	renderSoon: () => {},
	say: (_t: string | undefined, _toast?: boolean) => {},
	typing: () => false,
}
