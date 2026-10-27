import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { useSnapshot } from '../data/hooks.ts'
import { useData } from '../data/store.ts'
import { useWatchingPress } from '../data/watching.ts'
import { when } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { ActionButton, useOnline } from './ActionButton.tsx'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { NAME } from '../brand.ts'
import './watching.css'

// D-WATCH' (PE engineer-d-watch §8.2/§8.6/§8.7; PM FINAL NARROWED N2; Designer WS1/WS4/WS5, WS delta): one "Checking Teams" control
// on Home, the same in both shells. The status (Off with its since, and "· <machine>" with 2+ machines), Stop (outline) or Start
// (filled), the caption always visible (also the button's description), and while Off the Home line. No confirm and no Undo: the
// other button is the way back. The press is the page offer on the exact state; its receipt shows in the header slot.
export const CHECKING_BUTTON = 'checking-teams-button'
const OFFLINE = "Offline: can't change Teams checking now."
export function WatchingControl({ readOnly = false }: { readOnly?: boolean }) {
	const snapshot = useSnapshot(), w = snapshot?.status.watching, group = useRef<HTMLDivElement>(null), online = useOnline()
	const action = snapshot?.pageActionIds?.map(id => snapshot.entities.actions[id]).find(action => action?.kind === 'watching')
	// CR B2: the press is recorded only once the page accepted it, from the data store's pending click for this control.
	const actionId = action?.id, pending = useData(state => actionId ? Object.values(state.byRevision).find(ui => ui.pending?.action === actionId)?.pending?.submissionId : undefined)
	useLayoutEffect(() => { group.current?.querySelector('button')?.setAttribute('id', CHECKING_BUTTON) })
	useEffect(() => {
		if (pending) { useWatchingPress.setState({ submissionId: pending }); return }
		if (!useWatchingPress.getState().submissionId) return
		useWatchingPress.setState({ submissionId: undefined })
		// WS4: focus returns to the button, which now carries the other label (it was disabled while the press was pending).
		let tries = 0, timer: ReturnType<typeof setTimeout>
		const focus = () => {
			const button = group.current?.querySelector<HTMLButtonElement>('button'), lost = !document.activeElement || document.activeElement === document.body
			if (button && !button.disabled) { if (lost) button.focus() } else if (tries++ < 50) timer = setTimeout(focus, 100)
		}
		timer = setTimeout(focus, 0)
		return () => clearTimeout(timer)
	}, [pending])
	if (!snapshot || !w || readOnly) return null
	const status = w.on ? 'Checking Teams: On' : `Checking Teams: Off${w.since ? ` since ${when(w.since)}` : ''}${w.machines >= 2 && w.machine ? ` · ${w.machine}` : ''}`
	const caption = online ? action?.meaning : OFFLINE
	return <div ref={group} className="watching" role="group" aria-label="Checking Teams" data-watching={w.on ? 'on' : 'off'}>
		<div className="watching-line"><span className="watching-status"><Icon name="eye" />{status}</span>
			{action && <ActionButton action={action} primary={!w.on} ariaLabel={w.on ? 'Stop checking Teams' : 'Start checking Teams'} softDisabled={online ? undefined : OFFLINE} />}</div>
		{caption && <p className="watching-caption" aria-hidden="true">{caption}</p>}
		{!w.on && <p className="watching-home">{NAME} isn&apos;t checking Teams for new messages. Your clicks and everything already here still work.</p>}
	</div>
}

// PE §8.7(2), Designer R7: under Settings › Check Teams every, while checking is off. Home focuses the control's button.
export function CheckingOffNote({ as: Tag, className }: { as: 'small' | 'span'; className: string }) {
	const snapshot = useSnapshot(), { classic, href, navigate } = useScreenNavigation()
	if (snapshot?.status.watching?.on !== false) return null
	const home = (event: MouseEvent) => {
		event.preventDefault()
		navigate('now')
		// Home's route moves focus to its main a frame after it renders; the button is focused once it is there, and kept for a few frames.
		let frames = 0, held = 0
		const focus = () => {
			const button = document.getElementById(CHECKING_BUTTON)
			if (button && document.activeElement !== button) { button.focus(); held = 0 } else if (button) held++
			if (held < 3 && frames++ < 180) requestAnimationFrame(focus)
		}
		requestAnimationFrame(focus)
	}
	return <Tag className={className}>Not used while Teams checking is off. Start it on <a href={href(classic ? 'home' : 'now')} onClick={home}>Home</a>.</Tag>
}