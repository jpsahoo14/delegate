import type { Action, Intent } from '../domain/contracts.ts'

export function actionPresentation(action: Action, input?: Intent['input']): { label: string; unavailable: boolean } {
	const selection = action.selection
	if (!selection) return { label: action.label, unavailable: false }
	const excluded = new Set(input?.excluded ?? []), count = selection.total - excluded.size
	if (!count) return { label: selection.empty, unavailable: !selection.allowEmpty }
	if (count === 1 && selection.total === 1 && selection.exactSingle) return { label: selection.exactSingle, unavailable: false }
	return { label: `${selection.verb} ${count} ${count === 1 ? selection.singular : selection.plural}${selection.suffix}`, unavailable: false }
}
