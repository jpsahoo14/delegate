import { create } from 'zustand'
import { revisionKey, type Action, type Intent } from '../domain/contracts.ts'
import { useData } from './store.ts'
import { UNDO_MS } from './todo-marks.ts'

// WYS ✕ (PE 16:55:13Z (B), decision 59): turning a suggestion down hides its line with "Won't suggest this · Undo" for 6 s, client-held:
// nothing is dispatched until the window ends and Undo sends nothing. Then the dont-suggest offer is sent and the line stays hidden
// until the suggestion leaves the page, or the press fails or is declined on the page (CR 18:15:11Z B1: a local refusal leaves only a
// note, so the line comes back at once).
export type SuggestionHold = { item: string; changeId: string; action: string; sent?: boolean }
export const useSuggestionHolds = create<{ holds: Record<string, SuggestionHold> }>(() => ({ holds: {} }))
const timers = new Map<string, ReturnType<typeof setTimeout>>()
type Act = (action: Action, input?: Intent['input']) => Promise<void>
const keyOf = (item: string, changeId: string) => `${item}|${changeId}`
const put = (key: string, hold?: SuggestionHold) => useSuggestionHolds.setState(state => {
	const holds = { ...state.holds }
	if (hold) holds[key] = hold
	else delete holds[key]
	return { holds }
})

export function holdDismiss(action: Action, changeId: string, act: Act) {
	const key = keyOf(action.item, changeId)
	clearTimeout(timers.get(key))
	put(key, { item: action.item, changeId, action: action.id })
	timers.set(key, setTimeout(() => {
		timers.delete(key)
		put(key, { item: action.item, changeId, action: action.id, sent: true })
		const revision = revisionKey(action.item, action.rev), before = useData.getState().byRevision[revision]
		void act(action).finally(() => {
			const ui = useData.getState().byRevision[revision]
			const submitted = ui?.pending?.action === action.id || ui?.lastAction === action.id && !!ui.result && ui.result !== before?.result
			if (!submitted && !ui?.error) return put(key)
			const settled = () => {
				const state = useData.getState(), now = state.byRevision[revision]
				return !state.entities.actions[action.id] || !!now?.error || !!now?.result && (!now.result.accepted || !!now.result.refused)
			}
			if (settled()) return put(key)
			const stop = useData.subscribe(() => { if (settled()) { stop(); clearTimeout(limit); put(key) } })
			const limit = setTimeout(() => { stop(); put(key) }, 30_000)
		})
	}, UNDO_MS))
}
export function undoDismissHold(item: string, changeId: string) {
	const key = keyOf(item, changeId)
	if (useSuggestionHolds.getState().holds[key]?.sent) return
	clearTimeout(timers.get(key)); timers.delete(key)
	put(key)
}
