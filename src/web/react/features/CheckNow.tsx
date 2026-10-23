import { useCardUi, useEntities, useSnapshot } from '../data/hooks.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'

export function CheckNow({ showState = true }: { showState?: boolean }) {
	const snapshot = useSnapshot(), entities = useEntities()
	const action = snapshot?.pageActionIds?.map(id => entities.actions[id]).find(action => action?.kind === 'retry-source')
	const ui = useCardUi(action?.item ?? '', action?.rev ?? '')
	if (!action) return null
	return <div className="check-now" data-key="row:retry"><ActionButton action={action} />
		{showState && ui.lastAction === action.id && <ActionState item={action.item} rev={action.rev} />}
	</div>
}
