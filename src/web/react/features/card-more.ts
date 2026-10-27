import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useData } from '../data/store.ts'

// D-MORE-MENU (PE engineer-d-more-menu §3-§6, Designer MM1-MM4 / MM-i / MM-j): the card ⋯ and every other `details.card-more-menu`
// (Settings › Your way of working's `ways-more` too) close on Escape, on a pointerdown outside them, and when another one opens; New's
// App and Classic each mount useCardMenuDismiss once. Focus is only ever rescued to ⋯ from `body`, null or a detached node.
const OPEN = 'details.card-more-menu[open]'
const summaryOf = (menu: Element) => menu.querySelector<HTMLElement>(':scope > summary')
const lost = (element: Element | null) => !element || element === document.body || !element.isConnected
// CR 00:34:04 B1 / CR 00:44:37: every close of a menu ends its opening, recorded at the close itself, never from the later toggle
// notification (queued and coalesced, so it can read a reopened menu, or arrive after a new opening's own choice). The helper's closes
// count in shut(); the native one, his press on its ⋯ (pointer, Enter or Space all click the summary), counts in the capture click
// before the summary's activation closes it. An accepted choice acts only on the opening it was made in.
const closings = new WeakMap<HTMLDetailsElement, number>()
const ended = (menu: HTMLDetailsElement) => closings.set(menu, (closings.get(menu) ?? 0) + 1)
const shut = (menu: HTMLDetailsElement) => { menu.open = false; ended(menu) }

// Closes every open card menu; focuses the first one's ⋯ when asked. Returns whether one was open.
export function closeOpenCardMenu(focus: boolean): boolean {
	const open = [...document.querySelectorAll<HTMLDetailsElement>(OPEN)]
	for (const menu of open) shut(menu)
	if (focus && open[0]) summaryOf(open[0])?.focus()
	return open.length > 0
}

// Closes the menu holding this element (an item that acts elsewhere, such as Edit in Teams), focusing its ⋯ when asked.
export function closeMenuOf(element: Element, focus: boolean) {
	const menu = element.closest<HTMLDetailsElement>('details.card-more-menu')
	if (!menu) return
	shut(menu)
	if (focus) summaryOf(menu)?.focus()
}

export function useCardMenuDismiss(closeHeaderMenu: () => void) {
	const close = useRef(closeHeaderMenu)
	close.current = closeHeaderMenu
	useEffect(() => {
		// §3.2(a) + §5.2: outside means not inside that open menu; it closes without preventDefault, so the press still acts. Focus
		// stays with what was pressed, unless it was inside the menu and fell to `body` (the target wasn't focusable): then ⋯.
		const down = (event: PointerEvent) => {
			const target = event.target instanceof Node ? event.target : null
			for (const menu of document.querySelectorAll<HTMLDetailsElement>(OPEN)) {
				if (target && menu.contains(target)) continue
				const had = !!document.activeElement && menu.contains(document.activeElement)
				shut(menu)
				if (had) requestAnimationFrame(() => { if (menu.isConnected && lost(document.activeElement)) summaryOf(menu)?.focus() })
			}
		}
		// §3.2(b) + §5.3: one card menu open at a time, and never together with the header ≡.
		const toggle = (event: Event) => {
			const menu = event.target
			if (!(menu instanceof HTMLDetailsElement) || !menu.open || !menu.matches('details.card-more-menu')) return
			for (const other of document.querySelectorAll<HTMLDetailsElement>(OPEN)) if (other !== menu) shut(other)
			close.current()
		}
		// CR 00:44:37 B1: a click on an open menu's own ⋯ is the native close; it ends the opening now, before the activation runs.
		const click = (event: MouseEvent) => {
			const summary = event.target instanceof Element ? event.target.closest('summary') : null, menu = summary?.parentElement
			if (menu instanceof HTMLDetailsElement && menu.open && menu.matches('details.card-more-menu') && summaryOf(menu) === summary) ended(menu)
		}
		// §6.2 MM-j: a pending in-menu button turns natively disabled (or unmounts) and drops focus to `body`; while that menu is
		// still open and mounted, focus goes to its ⋯, which doesn't toggle it, so the clicked item's line stays visible.
		const out = (event: FocusEvent) => {
			const menu = event.target instanceof Element ? event.target.closest<HTMLDetailsElement>('details.card-more-menu') : null
			if (!menu?.open) return
			requestAnimationFrame(() => { if (menu.open && menu.isConnected && lost(document.activeElement)) summaryOf(menu)?.focus() })
		}
		document.addEventListener('pointerdown', down, true)
		document.addEventListener('toggle', toggle, true)
		document.addEventListener('focusout', out, true)
		document.addEventListener('click', click, true)
		return () => {
			document.removeEventListener('pointerdown', down, true)
			document.removeEventListener('toggle', toggle, true)
			document.removeEventListener('focusout', out, true)
			document.removeEventListener('click', click, true)
		}
	}, [])
}

// §3.4 + §5.4 (G2 outranks "choose → closes"): an ActionButton in the menu passes this as onSubmitted, so only a submission its own
// press created is followed, and only within the opening it was pressed in (CR 00:34:04 B1). The menu stays open while that click is
// pending, refused, errored or uncertain, keeping its line where he clicked; it closes on the accepted, not refused receipt, focusing
// ⋯ while the card is still there. Once that opening has ended (Escape, an outside press, ≡, another menu, its ⋯, Send anyway's
// confirm), a late receipt does nothing: a reopened menu and his focus are left alone, and a new opening's own choice is never ended by
// an old notification. Native pending, in-flight and receipt data are untouched. A cancelled confirm, a held hide verb or a refused
// press creates no submission, so it never closes the menu.
type Armed = { id: string; menu: HTMLDetailsElement; opening: number }
export function useMenuChoice(menu: RefObject<HTMLDetailsElement | null>) {
	const [armed, setArmed] = useState<Armed>()
	const receipt = useData(state => armed ? Object.values(state.byRevision).find(ui => ui.result?.submissionId === armed.id)?.result : undefined)
	useEffect(() => {
		if (!armed || !receipt || receipt.uncertain) return
		setArmed(undefined)
		const details = menu.current
		if (!receipt.accepted || receipt.refused || details !== armed.menu || (closings.get(details) ?? 0) !== armed.opening || !details.open || !details.isConnected) return
		shut(details)
		summaryOf(details)?.focus()
	}, [armed, receipt, menu])
	return useCallback((id: string) => {
		const details = menu.current
		setArmed(details?.open ? { id, menu: details, opening: closings.get(details) ?? 0 } : undefined)
	}, [menu])
}
