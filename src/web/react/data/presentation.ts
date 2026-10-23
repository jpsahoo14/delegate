import type { Action, Intent } from '../domain/contracts.ts'
import { useData } from './store.ts'

export function useActionAvailability(action: Action) {
	return useData(state => state.entities.actions[action.id] ? state.entities.actions[action.id].unavailable : action.unavailable)
}

export function readingStatus(state: string): string {
	return state === 'ok' ? 'Reading' : state === 'late' ? 'Reading is late' : state === 'off' ? 'Not reading now' : state === 'never' ? 'Chats have not been read yet' : `Reading status: ${state}`
}

export function actionPresentation(action: Action, input?: Intent['input']): { label: string; unavailable: boolean } {
	const selection = action.selection
	if (!selection) return { label: action.label, unavailable: false }
	const excluded = new Set(input?.excluded ?? []), count = selection.total - excluded.size
	if (!count) return { label: selection.empty, unavailable: !selection.allowEmpty }
	if (count === 1 && selection.total === 1 && selection.exactSingle) return { label: selection.exactSingle, unavailable: false }
	return { label: `${selection.verb} ${count} ${count === 1 ? selection.singular : selection.plural}${selection.suffix}`, unavailable: false }
}
