import { create } from 'zustand'
import { revisionKey, type Action, type Intent } from '../domain/contracts.ts'
import { useData } from './store.ts'
import { UNDO_MS } from './todo-marks.ts'

// A58 S-A2 (decision 54, extending decision 53 (3)): Close it, Stop waiting and Stop watching hide an item, so the page shows
// "<line>. · Undo" in its place for 6 s and dispatches only when the window ends; Undo inside it sends nothing. As with the to-do
// marks, the timer lives outside the row, so scrolling or leaving the card keeps the hold. After the dispatch the line stays (without
// Undo) until the action is gone from the page or the press failed, so the row doesn't flash back before the next snapshot.
export type Hold = { action: string; line: string; sent?: boolean }
export const useHolds = create<{ holds: Record<string, Hold> }>(() => ({ holds: {} }))
const timers = new Map<string, ReturnType<typeof setTimeout>>()
type Act = (action: Action, input?: Intent['input']) => Promise<void>
const put = (item: string, hold?: Hold) => useHolds.setState(state => {
	const holds = { ...state.holds }
	if (hold) holds[item] = hold
	else delete holds[item]
	return { holds }
})

export function holdHide(action: Action, act: Act) {
	if (!action.hold) return
	const item = action.item, line = action.hold.line
	clearTimeout(timers.get(item))
	put(item, { action: action.id, line })
	timers.set(item, setTimeout(() => {
		timers.delete(item)
		put(item, { action: action.id, line, sent: true })
		const key = revisionKey(item, action.rev), before = useData.getState().byRevision[key]
		void act(action).finally(() => {
			// CR B1 (18:15:11Z): act can decline without submitting (another click on this item is still pending, or saved actions can't
			// be read): it leaves only a note, never a pending submission or a new result. Then the hold ends at once, the item returns and
			// its ActionState shows that note, rather than looking done until the 30 s limit.
			const ui = useData.getState().byRevision[key]
			const submitted = ui?.pending?.action === action.id || ui?.lastAction === action.id && !!ui.result && ui.result !== before?.result
			if (!submitted && !ui?.error) return put(item)
			const settled = () => {
				const state = useData.getState(), ui = state.byRevision[revisionKey(item, action.rev)]
				return !state.entities.actions[action.id] || !!ui?.error || !!ui?.result && (!ui.result.accepted || !!ui.result.refused)
			}
			if (settled()) return put(item)
			const stop = useData.subscribe(() => { if (settled()) { stop(); clearTimeout(limit); put(item) } })
			const limit = setTimeout(() => { stop(); put(item) }, 30_000)
		})
	}, UNDO_MS))
}
export function undoHide(item: string) {
	if (useHolds.getState().holds[item]?.sent) return
	clearTimeout(timers.get(item)); timers.delete(item)
	put(item)
}
export const useHold = (item?: string) => useHolds(state => (item ? state.holds[item] : undefined))
