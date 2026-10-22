import type { Action, Intent } from '../domain/contracts.ts'
import { useAction, useActionWindow, useCardUi, useItemBusy, usePendingStatus } from '../data/hooks.ts'
import { Button } from '../components/ui/button.tsx'
import { NAME } from '../brand.ts'
import { actionPresentation } from '../data/presentation.ts'

export function ActionState({ item, rev }: { item: string; rev: string }) {
	const ui = useCardUi(item, rev)
	const pending = usePendingStatus(item, rev)
	return <>
		{ui.pending && <p role="status">{ui.pending.phase === 'submitting' ? 'Submitting your action...' : ui.pending.phase === 'unknown' ? 'Checking the saved submission. Do not send again.' : `Queued. Waiting for ${NAME}.`}</p>}
		{ui.error && <p role="alert" className="error">{ui.error}</p>}
		{ui.result && <p role={ui.result.refused || ui.result.uncertain ? 'alert' : 'status'}>{ui.result.text}</p>}
		{ui.pending && (ui.error || pending.slow) && <div><p>Still checking the saved result. This action will not be resent.</p><Button variant="outline" onClick={pending.check}>Check saved result</Button></div>}
	</>
}

export function ActionButton({ action, input, primary = false, disabled = false }: {
	action: Action; input?: Intent['input']; primary?: boolean; disabled?: boolean
}) {
	const act = useAction(), busy = useItemBusy(action.item)
	const ui = useCardUi(action.item, action.rev)
	const alreadySubmitted = !!action.input && !!ui.result && (ui.result.uncertain || ui.result.accepted && !ui.result.refused) && ui.lastAction === action.id && JSON.stringify(ui.submittedInput ?? {}) === JSON.stringify(input ?? {})
	const window = useActionWindow(action.expiresAt)
	const presentation = actionPresentation(action, input)
	return <Button variant={primary ? 'default' : 'outline'} data-action-kind={action.kind} aria-label={action.kind === 'undo' ? 'Undo' : undefined} disabled={disabled || busy || window.expired || alreadySubmitted || presentation.unavailable} data-primary={primary || undefined}
		onClick={() => {
			void act(action, input)
		}}>{busy ? 'Waiting...' : window.expired ? 'Undo window closed' : `${presentation.label}${window.countdown ? ` ${window.countdown}` : ''}`}</Button>
}
