// Drawing the page again, safely: never under a held button, never while the owner types, and the cursor stays where it was.
import { viewing } from '../state/actions.ts'
import { S, hooks } from '../state/store.ts'
import type { Experience } from './experience.ts'

let exp: Experience
// The experience drawing this page.
export const current = () => exp

// Background updates wait while the owner is typing, so a field never jumps.
export const field = () => { const a = document.activeElement as HTMLInputElement | null; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio' }
export const typing = () => field() && !!(document.activeElement as HTMLInputElement).value

export function render(enter = false) {
	// Never while a button is held: replacing it under the pointer drops the click. The release redraws.
	if (S.pressing && Date.now() - S.pressing < 3000) { S.flushT ??= setTimeout(() => { S.flushT = null; if (S.deferred && !typing()) render() }, 3000 - (Date.now() - S.pressing)); S.deferred = true; return }
	const a = document.activeElement as HTMLInputElement | null, id = a && a.id, caret = a && typeof a.selectionStart === 'number' ? a.selectionStart : null
	S.deferred = false
	viewing()
	exp.draw(enter)
	if (id) { const el = document.getElementById(id) as HTMLInputElement | null; if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret) } catch { /* not a text field */ } } }
}
// A redraw between mouse-down and mouse-up replaces the button under the pointer, and the browser drops the click (dogfood 10-20: Send needed two clicks).
export const renderSoon = () => { if (typing()) S.deferred = true; else render() }

// The experience draws; the actions reach it only through the store's hooks.
export function start(e: Experience) {
	exp = e
	Object.assign(hooks, { render, renderSoon, typing, say: (t: string | undefined, toast = true) => { if (t) e.say(t, toast) } })
}
