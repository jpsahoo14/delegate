import { useId, useSyncExternalStore } from 'react'
import type { Action, Intent } from '../domain/contracts.ts'
import { useAction, useActionWindow, useCardUi, useItemBusy, usePendingStatus, useSnapshot } from '../data/hooks.ts'
import { disabledHover, hoverOf, hoverValues } from '../domain/hover.ts'
import { Button } from '../components/ui/button.tsx'
import { NAME } from '../brand.ts'
import { actionPresentation, useActionAvailability } from '../data/presentation.ts'
import { Icon } from '../components/ui/icon.tsx'

// #27 poll (PM copy, P0-03): neutral throughout; the disabled button already stops a second click, so the words never warn. Only a
// send whose outcome is truly unknown says to check Teams.
const HAS = `${NAME} has your click.`
const STILL = `Still working on it. ${NAME} has your click and will finish it; you can leave this page.`
const UNSURE_SEND = `Couldn't confirm it was sent. Check Teams before you send again.`
export function ActionState({ item, rev }: { item: string; rev: string }) {
	const ui = useCardUi(item, rev), snapshot = useSnapshot()
	const pending = usePendingStatus(item, rev)
	const sends = !!ui.pending && snapshot?.entities.actions[ui.pending.action]?.effect === 'sends'
	const line = !ui.pending ? undefined : ui.pending.phase === 'unknown' && sends ? UNSURE_SEND : ui.pending.phase === 'unreached' ? 'Not confirmed yet.' : pending.long ? STILL : HAS
	return <>
		{line && <p role="status" className="muted">{line}{ui.pending && (pending.long || ui.pending.phase === 'unreached') && <> <button type="button" className="link-button" onClick={pending.check}>Check now</button></>}</p>}
		{ui.error && <p role="alert" className="error">{ui.error}</p>}
		{ui.result && <p role={ui.result.refused || ui.result.uncertain ? 'alert' : 'status'}>{ui.result.text}</p>}
	</>
}
// The button while its click is in flight (PM #27 poll): "Sending…", "Dismissing…", "Saving…", only for a label that starts with a
// verb in use (PE 23:42: "Later", "OK", "Not right?" are not verbs); every other label reads "Working…".
const VERBS: Record<string, string> = {
	send: 'Sending', approve: 'Approving', answer: 'Answering', dismiss: 'Dismissing', save: 'Saving', try: 'Trying', redraft: 'Redrafting',
	add: 'Adding', write: 'Writing', mark: 'Marking', stop: 'Stopping', skip: 'Skipping', undo: 'Undoing', open: 'Opening', reply: 'Replying',
	review: 'Reviewing', post: 'Posting', reopen: 'Reopening', remember: 'Remembering', turn: 'Turning',
}
export function verbing(label: string): string {
	return `${VERBS[(label.trim().split(/\s+/)[0] ?? '').toLowerCase()] ?? 'Working'}…`
}

export function ActionButton({ action, input, primary = false, disabled = false, ariaLabel, pendingLabel, prepareInput, disabledReason, label: shownLabel }: {
	action: Action; input?: Intent['input']; primary?: boolean; disabled?: boolean; ariaLabel?: string; pendingLabel?: string; prepareInput?: () => Intent['input']
	// A label the card says in its own words, such as "Draft my update to Pat"; the action's own label otherwise.
	label?: string
	// Why the caller disabled it, for the hover text: 'stale' (changed since you looked), 'pick' (no option picked), or words.
	disabledReason?: 'stale' | 'pick' | string
}) {
	const act = useAction(), busy = useItemBusy(action.item)
	const ui = useCardUi(action.item, action.rev)
	const alreadySubmitted = !!action.input && !!ui.result && (ui.result.uncertain || ui.result.accepted && !ui.result.refused) && ui.lastAction === action.id && JSON.stringify(ui.submittedInput ?? {}) === JSON.stringify(input ?? {})
	const window = useActionWindow(action.expiresAt)
	const presentation = actionPresentation(action, input)
	const unavailable = useActionAvailability(action)
	const online = useOnline(), snapshot = useSnapshot(), describedBy = useId()
	const off = disabled || busy || window.expired || alreadySubmitted || presentation.unavailable || !!unavailable
	const label = shownLabel ?? presentation.label
	// Spec S7: what it does, from the one shared map; a disabled control says why (by default from what it needs).
	const what = hoverOf(action.kind, label, hoverValues(snapshot, action, { left: window.countdown }), action.meaning)
	const reason = disabledReason ?? (disabled ? action.kind === 'pick' ? 'pick' : action.kind === 'answer' ? 'Type your answer first.' : action.input === 'text' ? 'Type your text first.' : undefined : undefined)
	const hover = !online ? disabledHover({ offline: true }, what) : off ? disabledHover({ unavailable: unavailable?.reason, busy, expired: window.expired, submitted: alreadySubmitted,
		stale: disabled && reason === 'stale', needsPick: disabled && reason === 'pick' },
		disabled && reason && !['stale', 'pick'].includes(reason) ? reason : what) : what
	return <><Button variant={primary ? 'default' : 'outline'} data-action-kind={action.kind} title={hover} aria-describedby={hover ? describedBy : undefined} aria-label={ariaLabel ?? (action.kind === 'undo' ? 'Undo' : undefined)} disabled={off} data-primary={primary || undefined}
		onClick={() => {
			void act(action, prepareInput ? prepareInput() : input)
		}}>{action.kind === 'undo' && <Icon name="undo" />}{busy ? pendingLabel ?? verbing(label) : window.expired ? 'Undo window closed' : unavailable?.label ?? `${label}${window.countdown ? ` ${window.countdown}` : ''}`}</Button>{hover && <span id={describedBy} className="sr-only">{hover}</span>}</>
}

const onlineEvents = (changed: () => void) => { addEventListener('online', changed); addEventListener('offline', changed); return () => { removeEventListener('online', changed); removeEventListener('offline', changed) } }
export const useOnline = () => useSyncExternalStore(onlineEvents, () => navigator.onLine, () => true)
