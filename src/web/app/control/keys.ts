// The keyboard: the queue keys on Needs you, g h, u, ?, and Escape (the key list in the experience shows them all).
import type { ItemCard } from '../../model/types.ts'
import * as A from '../state/actions.ts'
import { S, V, cardOf } from '../state/store.ts'
import { current, field, render } from '../view/render.ts'
import { onClick } from './clicks.ts'
import { focusOn } from './ui.ts'

let gAt = 0
export function onKey(e: KeyboardEvent) {
	const inField = field(), c = S.route === 'focus' ? cardOf(S.cur ?? '') as ItemCard | undefined : null
	if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && c && !S.done.has(c.code)) { e.preventDefault(); document.getElementById(`pri-${c.code}`)?.click(); return }
	if (e.key === 'Escape') {
		// The key list closes itself; Escape there must not also leave the item.
		if (current().keys.isOpen()) return
		if (S.sheet) { S.sheet = null; render(); return }
		// Escape in Find with words in it clears them first; the next Escape leaves it.
		const a = document.activeElement as HTMLInputElement | null
		if (a?.id === 'find' && a.value) { e.preventDefault(); A.setFind(''); return }
		// Leaving a field returns to its card, so the card keys keep working.
		if (inField) { const active = document.activeElement as HTMLElement, card = active.closest<HTMLElement>('article.card'); active.blur(); card?.focus({ preventScroll: true }); return }
		if (S.route === 'focus') location.hash = '#home'
		return
	}
	if (inField || e.metaKey || e.ctrlKey || e.altKey || current().keys.isOpen()) return
	if (e.key === '?') { current().keys.open(); return }
	// "/" goes to Find, where the page has it (Now on the new page).
	if (e.key === '/' && document.getElementById('find')) { e.preventDefault(); focusOn('find'); return }
	if (e.key === 'g') { gAt = Date.now(); return }
	if (e.key === 'h' && Date.now() - gAt < 800) { location.hash = '#home'; return }
	if (e.key === 'u') { const r = V.done.find(x => x.undoUntil && Date.parse(x.undoUntil) > Date.now()); if (r) { location.hash = '#done/replies'; A.act(`row:${r.code}`, r.code, `undo ${r.code}`, 'row') } return }
	if (!c || S.done.has(c.code)) return
	if (e.key === 'j' || e.key === 'ArrowRight') { e.preventDefault(); A.step(1) }
	else if (e.key === 'k' || e.key === 'ArrowLeft') { e.preventDefault(); A.step(-1) }
	else if (e.key === 'l') A.act(c.code, c.code, `later ${c.code}`, 'later', c.rev)
	else if (e.key === 'a') { e.preventDefault(); focusOn(`askin-${c.code}`) }
	else if (e.key === 'e' && c.draft && (c.type === 'reply' || c.type === 'review')) { e.preventDefault(); onClick({ target: document.querySelector(`#card-${c.code} [data-act=edit]`), stopPropagation() {}, preventDefault() {} } as unknown as MouseEvent) }
	else if (/^[1-9]$/.test(e.key)) {
		const n = +e.key, inp = (c.choices ? document.getElementById(`o-${c.code}-${n}`) : document.getElementById(`cm-${c.code}-${n}`)) as HTMLInputElement | null
		if (inp && !inp.disabled) inp.click()
	}
}

