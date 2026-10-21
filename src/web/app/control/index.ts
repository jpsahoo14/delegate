// The live page's controls: delegated events, keys, the address, the countdowns, and fresh data. The snapshot has none.
import { mmss } from '../model/format.ts'
import { poll } from '../io/poll.ts'
import * as A from '../state/actions.ts'
import { S, U, V, env } from '../state/store.ts'
import { render, renderSoon, typing } from '../view/render.ts'
import { onClick } from './clicks.ts'
import { onChange, onInput, onSubmit } from './fields.ts'
import { onKey } from './keys.ts'
import { route } from './route.ts'

export { route }
export function listen() {
	document.addEventListener('click', onClick)
	document.addEventListener('change', onChange)
	document.addEventListener('input', onInput)
	document.addEventListener('submit', onSubmit)
	document.addEventListener('keydown', onKey)
	document.addEventListener('focusout', () => setTimeout(() => { if (S.deferred && !typing()) render() }, 0))
	document.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest?.('button,[data-act]')) S.pressing = Date.now() }, true)
	// A release outside the window never arrives, so a hold counts for 3 s at most.
	const released = () => { S.pressing = 0; setTimeout(() => { if (S.deferred && !typing()) render() }, 0) }
	document.addEventListener('pointerup', released, true); document.addEventListener('pointercancel', released, true)
	// Which open/closed state a <details> keeps across redraws. The toggle event comes a task after the click, so a redraw in
	// between drew it with the old state (CI macOS 10-21); the click records the intent at once, and toggle confirms it.
	const remember = (d: HTMLDetailsElement, open: boolean) => {
		const code = () => d.closest<HTMLElement>('[data-code]')?.dataset.code
		if (d.dataset?.row != null) { const c = code(); if (c) U(c).open = open }
		if (d.dataset?.why != null) { const c = code(); if (c) U(c).whyOpen = open }
		if (d.dataset?.dbg != null) { const c = code(); if (c) U(c).dbgOpen = open }
		if (d.dataset?.adv != null) S.advOpen = open
		if (d.dataset?.chan != null) S.chanOpen = open
	}
	document.addEventListener('click', e => { const sm = (e.target as Element | null)?.closest?.('summary'); const d = sm?.parentElement; if (d instanceof HTMLDetailsElement && sm === d.querySelector(':scope > summary')) remember(d, !d.open) }, true)
	document.addEventListener('toggle', e => remember(e.target as HTMLDetailsElement, (e.target as HTMLDetailsElement).open), true)
	window.addEventListener('hashchange', route)
	// The undo countdown ticks in place; the row re-renders when its window closes.
	setInterval(() => { document.querySelectorAll<HTMLElement>('[data-until]').forEach(el => { const s = Math.round((Date.parse(el.dataset.until!) - Date.now()) / 1000); if (s <= 0) renderSoon(); else el.textContent = mmss(s) }) }, 1000)
	poll(env.io!, env.poll, { since: () => V.since, ui: () => env.ui, waiting: () => [...V.needs, ...V.done].some(c => c.notes?.some(n => !n.a)), got: A.connected, lost: A.lost })
}
