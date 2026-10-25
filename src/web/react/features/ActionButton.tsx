import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import type { Action, Intent } from '../domain/contracts.ts'
import { NOT_SAVED, NOT_SENT, useAction, useActionWindow, useCardUi, useItemBusy, usePendingStatus, useSnapshot } from '../data/hooks.ts'
import { disabledHover, hoverOf, hoverValues } from '../domain/hover.ts'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { NAME } from '../brand.ts'
import { actionPresentation, useActionAvailability } from '../data/presentation.ts'
import { Icon } from '../components/ui/icon.tsx'
import { useData, type CardUi } from '../data/store.ts'
import { verbing } from '../domain/verbing.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'

// #27 poll (PM copy, P0-03): neutral throughout; the disabled button already stops a second click, so the words never warn.
const HAS = `${NAME} has your click.`
const STILL = `Still working on it. ${NAME} has your click and will finish it; you can leave this page.`
// Decision 49 (b), PM 22:43:03Z (A): a send whose outcome is unknown. Send stays disabled (this is its hover); Check again re-polls.
export const UNSURE_SEND = `Couldn't confirm whether your reply was sent. Check again before sending it again.`
const unsureOf = (ui: CardUi, effect?: string) => !!ui.pending && (ui.pending.phase === 'unknown' || ui.pending.phase === 'unreached') && effect === 'sends'
// PE 00:59:32Z (3): measured only, never shown, so typical refusals aren't clipped: the longest refusal a send's receipt carries today
// (the runner's not-sent status when the reply check failed). A longer one is clipped, its words in the title.
const LONGEST_REFUSAL = 'Not sent: I could not check whether you already replied in the chat. Try again after the check succeeds.'
// I28, PE 22:44:56Z/22:49:23Z: the owner's click reserves this slot for its largest state at the current width (pending, the unknown
// state with its button, the not-sent line), so a later state swaps in place and no bar below moves. Measured off-screen in the slot
// before paint and removed at once (no hidden copies stay on the page); it shrinks only on a new click here or when the card unmounts.
function largestState(slot: HTMLElement, sends: boolean): number {
	const line = (className: string, text: string, button?: { label: string; className: string; data?: Record<string, string> }) => {
		const box = document.createElement('div'), p = document.createElement('p')
		box.style.cssText = 'display:flow-root;visibility:hidden'
		p.className = className
		p.append(text)
		if (button) { const b = document.createElement('button'); b.type = 'button'; b.className = button.className; Object.assign(b.dataset, button.data); b.textContent = button.label; p.append(' ', b) }
		box.append(p)
		return box
	}
	const ghosts = [line('muted', STILL, { label: 'Check now', className: 'link-button' }), line('error', sends ? NOT_SENT : NOT_SAVED),
		...(sends ? [line('', LONGEST_REFUSAL), line('muted unsure-line', UNSURE_SEND, { label: 'Check again', className: `${buttonVariants({ variant: 'outline', size: 'sm' })} check-again`, data: { slot: 'button', variant: 'outline', size: 'sm' } })] : [])]
	const heights = ghosts.map(ghost => { slot.append(ghost); const height = ghost.getBoundingClientRect().height; ghost.remove(); return height })
	return Math.ceil(Math.max(slot.getBoundingClientRect().height, ...heights))
}
export function ActionState({ item, rev }: { item: string; rev: string }) {
	const ui = useCardUi(item, rev), snapshot = useSnapshot()
	const pending = usePendingStatus(item, rev), { href } = useScreenNavigation()
	const sends = !!ui.pending && snapshot?.entities.actions[ui.pending.action]?.effect === 'sends'
	const unsure = unsureOf(ui, sends ? 'sends' : undefined)
	const line = !ui.pending || unsure ? undefined : ui.pending.phase === 'unreached' ? 'Not confirmed yet.' : pending.long ? STILL : HAS
	const slot = useRef<HTMLDivElement>(null), checkAgain = useRef<HTMLButtonElement>(null), toggle = useRef<HTMLButtonElement>(null)
	const [reserved, setReserved] = useState<{ id: string; sends: boolean; min?: number }>()
	// PE 01:13:27Z (decision 49, nit 1): a clipped line gets a visible Show all he can focus and tap. Expanding is his own change, to
	// the height measured at his tap (so nothing later grows it unasked); Show less, his next click here, or unmount returns it.
	const [expanded, setExpanded] = useState<number>(), [clipped, setClipped] = useState(false)
	const clicked = ui.pending?.phase === 'submitting' ? ui.pending.submissionId : undefined
	useLayoutEffect(() => {
		if (!clicked) return
		// First the slot becomes a block (the click's own change), then its largest state is measured in it, both before paint.
		if (reserved?.id !== clicked) { setReserved({ id: clicked, sends }); setExpanded(undefined) }
		else if (reserved.min === undefined && slot.current) setReserved({ ...reserved, min: largestState(slot.current, reserved.sends) })
	}, [clicked, reserved, sends])
	useLayoutEffect(() => { const el = slot.current; setClipped(!!el && !!reserved?.min && el.scrollHeight > el.clientHeight + 1) })
	// Shown lines stay whole: the band under Show all starts at the top of the first line that doesn't fully fit above it (overlay only).
	useLayoutEffect(() => {
		const el = slot.current, button = toggle.current, band = button?.parentElement
		if (!el || !button || !band) return
		if (!clipped) { band.style.height = ''; return }
		const bottom = el.getBoundingClientRect().bottom, room = bottom - button.offsetHeight, range = document.createRange()
		let cover = room
		for (const p of el.querySelectorAll(':scope > p')) { range.selectNodeContents(p); for (const r of range.getClientRects()) if (r.bottom > room + 0.5 && r.top < cover) cover = r.top }
		band.style.height = `${Math.ceil(bottom - cover)}px`
	})
	// Show all: for one layout pass before paint the cap is lifted (expanded = 0), the natural height is read, then fixed with a row
	// for Show less.
	useLayoutEffect(() => { if (expanded === 0 && slot.current) setExpanded(Math.ceil(slot.current.getBoundingClientRect().height) + (toggle.current?.parentElement?.offsetHeight ?? 0)) }, [expanded])
	// Focus moves from the disabled Send to Check again when the outcome turns out unknown (Designer 22:43:29Z), without scrolling.
	useEffect(() => {
		const focused = document.activeElement as HTMLButtonElement | null
		if (ui.pending?.phase === 'unreached' && unsure && (!focused || focused === document.body || focused.disabled)) checkAgain.current?.focus({ preventScroll: true })
	}, [ui.pending?.phase, unsure])
	// CR B1 on 7556c674 (I28): the receipt's and the server's own words (ui.result, ui.error) land later and have no length bound, so
	// once reserved the slot is capped at its reserved height too; a longer line is clipped here, with Show all, its full words in its
	// title and its whole text node for screen readers, and nothing below moves.
	const height = expanded === 0 ? undefined : expanded ?? reserved?.min
	const fixed = height ? { minHeight: height, maxHeight: height, overflow: 'clip', overflowClipMargin: 4 } as const : expanded === 0 ? { minHeight: reserved?.min } : undefined
	const showAll = () => setExpanded(0)
	return <div ref={slot} className={reserved ? 'action-slot reserved' : 'action-slot'} style={fixed}>
		{line && <p role="status" className="muted">{line}{ui.pending && (pending.long || ui.pending.phase === 'unreached') && <> <button type="button" className="link-button" onClick={pending.check}>Check now</button></>}</p>}
		{unsure && <p key={ui.pending!.phase} role={ui.pending!.phase === 'unreached' ? 'alert' : 'status'} className="muted unsure-line">{UNSURE_SEND} <Button ref={checkAgain} type="button" variant="outline" size="sm" className="check-again" onClick={pending.check}>Check again</Button></p>}
		{ui.note && <p role="status" className="muted card-note" title={ui.note.text}>{ui.note.text}{ui.note.open && <> <a href={href('done/replies')}>Open</a></>}</p>}
		{ui.error && <p role="alert" className="error" title={ui.error}>{ui.error}</p>}
		{ui.result && <p role={ui.result.refused || ui.result.uncertain ? 'alert' : 'status'} title={ui.result.text}>{ui.result.text}</p>}
		{(clipped || expanded !== undefined) && <div className="slot-toggle-band"><button ref={toggle} type="button" className="link-button slot-toggle" aria-expanded={!clipped}
			onClick={() => clipped ? showAll() : setExpanded(undefined)}>{clipped ? 'Show all' : 'Show less'}</button></div>}
	</div>
}
export { verbing } from '../domain/verbing.ts'
const CHANGED = 'The card changed as you clicked. Nothing was done; check and click again.'
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
	// PE 01:13:27Z nit 4 (0.2.46): a countdown's label changes on a timer ("Undo 0:42", then "Undo window closed"), so the button
	// reserves its widest label at mount (tabular digits, the closed wording) and later relabels swap in place, moving nothing beside it.
	const [sizers] = useState(() => action.expiresAt ? ['Undo window closed', `${label}${window.countdown ? ` ${window.countdown.replace(/\d/g, '0')}` : ''}`] : undefined)
	// I28 (PE 22:49:23Z, found proving the CR B1 fix on 7556c674): a busy button reads "Sending…", wider than "Send"; when the result
	// lands later the label shrinks back and the controls beside it slide over. It keeps the width it took at the owner's click.
	const self = useRef<HTMLButtonElement>(null), [minWidth, setMinWidth] = useState<number>()
	useLayoutEffect(() => {
		const width = busy && self.current ? Math.ceil(self.current.getBoundingClientRect().width) : 0
		if (width) setMinWidth(min => min && min >= width ? min : width)
	}, [busy])
	useEffect(() => { const el = self.current; if (el) return track(el) }, [])
	// Spec S7: what it does, from the one shared map; a disabled control says why (by default from what it needs).
	const what = hoverOf(action.kind, label, hoverValues(snapshot, action, { left: window.countdown }), action.meaning)
	const reason = disabledReason ?? (disabled ? action.kind === 'pick' ? 'pick' : action.kind === 'answer' ? 'Type your answer first.' : action.input === 'text' ? 'Type your text first.' : undefined : undefined)
	const hover = !online ? disabledHover({ offline: true }, what) : unsureOf(ui, action.effect) && ui.pending?.action === action.id ? UNSURE_SEND : off ? disabledHover({ unavailable: unavailable?.reason, busy, expired: window.expired, submitted: alreadySubmitted,
		stale: disabled && reason === 'stale', needsPick: disabled && reason === 'pick' },
		disabled && reason && !['stale', 'pick'].includes(reason) ? reason : what) : what
	return <><Button ref={self} style={minWidth ? { minWidth } : undefined} variant={primary ? 'default' : 'outline'} data-action-kind={action.kind} title={hover} aria-describedby={hover ? describedBy : undefined} aria-label={ariaLabel ?? (action.kind === 'undo' ? 'Undo' : undefined)} disabled={off} data-primary={primary || undefined}
		onPointerDown={event => { shiftedBeforePress(event); watchPress(event, () => useData.getState().edit(action.item, action.rev, { note: { text: CHANGED } })) }}
		onClick={event => {
			// Decision 46 (3), the 600 ms shift-then-press guard: a pointer press on a button that moved just before it does nothing.
			// Only a pointer click (detail > 0) is judged; a keyboard click (Enter or Space, detail 0) is never refused (CR 06:40:30Z B1).
			if (refusedPress(event.currentTarget) && event.detail > 0) {
				console.info('[guard] refused', action.kind)
				return useData.getState().edit(action.item, action.rev, { note: { text: CHANGED } })
			}
			void act(action, prepareInput ? prepareInput() : input)
		}}>{action.kind === 'undo' && <Icon name="undo" />}{(text => sizers ? <span className="label-stack"><span>{text}</span>{sizers.map(sizer => <span key={sizer} className="label-sizer" aria-hidden="true">{sizer}</span>)}</span> : text)(busy ? pendingLabel ?? verbing(label) : window.expired ? 'Undo window closed' : unavailable?.label ?? `${label}${window.countdown ? ` ${window.countdown}` : ''}`)}</Button>{hover && <span id={describedBy} className="sr-only">{hover}</span>}</>
}

// Decision 46 (3)-(4), PE 06:23:42Z B: the 600 ms shift-then-press guard (0.2.46). A pointer press is refused when the button's
// VIEWPORT position (top or left, PE 06:39:54Z A (a)) changed within the 600 ms before it, unless the change was his own: wheel, touchmove, scroll keys, a pointerdown
// outside any control (the scrollbar), opening or closing a card, or input in the same card (a scroll that continues his own counts
// too). App-initiated moves (scrollIntoView, Find's Open, anchoring, late content) are not excepted. Enter or Space is never refused,
// and a refusal shows the muted line and never synthesises a click. Event-driven: idle, nothing runs; a DOM change, resize or
// scroll schedules one measurement of the mounted buttons in the next frame.
const GUARD_MS = 600, MIN_SHIFT = 4, CARD = '.item-card, .classic-open-card, .now-row'
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '])
const spots = new Map<Element, { top: number, left: number }>(), movedAt = new WeakMap<Element, number>(), cardInput = new WeakMap<Element, number>(), refused = new WeakMap<Element, number>()
let ownerAt = -Infinity, scheduled = false, installed = false
const now = () => performance.now()
function measure() {
	scheduled = false
	const at = now(), owner = at - ownerAt < GUARD_MS
	for (const [el, spot] of spots) {
		// A settle of under 4 px on both axes (fonts, a scrollbar) can't put another control under the pointer; drift still adds up from
		// the last recorded spot. A sideways slide within a bar counts the same as a vertical one.
		const { top, left } = el.getBoundingClientRect()
		if (Math.abs(top - spot.top) < MIN_SHIFT && Math.abs(left - spot.left) < MIN_SHIFT) continue
		spots.set(el, { top, left })
		const card = el.closest(CARD)
		if (!owner && !(card && at - (cardInput.get(card) ?? -Infinity) < GUARD_MS)) movedAt.set(el, at)
	}
}
const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(measure) } }
function install() {
	installed = true
	const owner = () => { ownerAt = now() }, opts = { capture: true, passive: true } as const
	addEventListener('wheel', owner, opts)
	addEventListener('touchmove', owner, opts)
	addEventListener('keydown', event => { const field = (event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable=true]'); if (!field && SCROLL_KEYS.has(event.key)) owner() }, opts)
	addEventListener('pointerdown', event => { const target = event.target as Element | null; if (!target?.closest?.('button, a[href], [role=button], input, textarea, select, label, summary') || target.closest('[aria-expanded], summary')) owner() }, opts)
	addEventListener('input', event => { const card = (event.target as Element | null)?.closest?.(CARD); if (card) cardInput.set(card, now()) }, opts)
	addEventListener('scroll', () => { if (now() - ownerAt < GUARD_MS) owner(); schedule() }, opts)
	addEventListener('resize', schedule, opts)
	new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
}
function track(el: Element) {
	if (!installed) install()
	const { top, left } = el.getBoundingClientRect()
	spots.set(el, { top, left })
	return () => { spots.delete(el) }
}
// At pointerdown: clear any earlier press's flag first, so every press is judged on its own (a refused press released off the
// button leaves no click to consume it); settle any move not yet measured; then mark this press refused when the button moved,
// not by him, under 600 ms ago.
function shiftedBeforePress(event: PointerEvent<HTMLButtonElement>) {
	refused.delete(event.currentTarget)
	if (event.button !== 0 || !event.isPrimary) return
	measure()
	if (now() - (movedAt.get(event.currentTarget) ?? -Infinity) < GUARD_MS) refused.set(event.currentTarget, now())
}
// The click that follows a refused press (within 2 s). Always consumes the flag; the caller judges only pointer clicks.
function refusedPress(el: Element) {
	const at = refused.get(el)
	refused.delete(el)
	return at !== undefined && now() - at < 2000
}

// PE decision 46 / PM A R44 (4): a press is never carried over to a button that moved (no keepPress): pointerdown and pointerup on
// different nodes give no click, as the browser does. When a press ends off the button BECAUSE the button moved during it (its page
// position changed, not the pointer), the card says so in one muted line; nothing acts. One press is watched at a time, only until it
// ends (pointercancel, the next pointerdown, 2 s, its own release), and only for the same pointer.
let watching: AbortController | undefined
const pageTop = (element: Element) => element.getBoundingClientRect().top + scrollY
function watchPress(event: PointerEvent<HTMLButtonElement>, moved: () => void) {
	watching?.abort()
	if (event.button !== 0 || !event.isPrimary) return
	const button = event.currentTarget, top = pageTop(button), pointer = event.pointerId
	const watch = watching = new AbortController(), signal = watch.signal, stop = () => watch.abort()
	const timer = setTimeout(stop, 2000)
	signal.addEventListener('abort', () => { clearTimeout(timer); if (watching === watch) watching = undefined })
	addEventListener('pointercancel', up => { if (up.pointerId === pointer) stop() }, { capture: true, signal })
	addEventListener('pointerdown', stop, { capture: true, signal })
	addEventListener('pointerup', up => {
		if (up.pointerId !== pointer) return
		stop()
		if (up.target instanceof Node && button.contains(up.target)) return
		if (button.isConnected && Math.abs(pageTop(button) - top) > 1) moved()
	}, { capture: true, signal })
}const onlineEvents = (changed: () => void) => { addEventListener('online', changed); addEventListener('offline', changed); return () => { removeEventListener('online', changed); removeEventListener('offline', changed) } }
export const useOnline = () => useSyncExternalStore(onlineEvents, () => navigator.onLine, () => true)
