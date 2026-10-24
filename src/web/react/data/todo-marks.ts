import type { Action, Intent } from '../domain/contracts.ts'
import { useData } from './store.ts'

// "I've done these" (#44(2), PM 18:40): the marked lines show "✓ Done: <text> · Undo" for 6 s and only then is the mark sent, so Undo
// within the window sends nothing. The timer lives outside the card, so leaving the card does not drop a mark he made.
export const UNDO_MS = 6_000
const timers = new Map<string, ReturnType<typeof setTimeout>>()
type Act = (action: Action, input?: Intent['input']) => Promise<void>

// rev: the card's revision, where the card keeps its unsent choices (the action has its own, over the to-dos).
export function markTodos(action: Action, rev: string, picks: number[], texts: string[], act: Act) {
	const key = `${action.item}@${rev}`
	clearTimeout(timers.get(key))
	useData.getState().edit(action.item, rev, { marking: { picks, texts, until: Date.now() + UNDO_MS }, ticked: [] })
	timers.set(key, setTimeout(() => {
		timers.delete(key)
		useData.getState().edit(action.item, rev, { marking: undefined })
		void act(action, { picks })
	}, UNDO_MS))
}
export function undoMark(item: string, rev: string) {
	const key = `${item}@${rev}`, marking = useData.getState().byRevision[key]?.marking
	clearTimeout(timers.get(key)); timers.delete(key)
	useData.getState().edit(item, rev, { marking: undefined, ticked: marking?.picks })
}
