import type { Action, Intent } from '../domain/contracts.ts'
import { useAction, useCardUi, useItemBusy } from '../data/hooks.ts'
import { Button } from '../components/ui/button.tsx'
import { NAME } from '../brand.ts'

export function ActionState({ item, rev }: { item: string; rev: string }) {
	const ui = useCardUi(item, rev)
	return <>
		{ui.pending && <p role="status">Queued. Waiting for {NAME}.</p>}
		{ui.error && <p role="alert" className="error">{ui.error}</p>}
		{ui.result && <p role="status">{ui.result.text}</p>}
	</>
}

export function ActionButton({ action, input, primary = false, disabled = false }: {
	action: Action; input?: Intent['input']; primary?: boolean; disabled?: boolean
}) {
	const act = useAction(), busy = useItemBusy(action.item)
	return <Button variant={primary ? 'default' : 'outline'} disabled={disabled || busy} data-primary={primary || undefined}
		onClick={() => {
			void act(action, input)
		}}>{busy ? 'Waiting...' : action.label}</Button>
}
