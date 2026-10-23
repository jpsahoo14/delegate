// Typing, picking, and submitting: fields keep the owner's words in the page state; forms send them.
import { RESULTS, primaryOf } from '../../model/derive.ts'
import type { ItemCard, KnowledgeCard } from '../../model/types.ts'
import * as A from '../state/actions.ts'
import { S, U, cardOf, env } from '../state/store.ts'
import { current, render } from '../view/render.ts'
import { focusOn } from './ui.ts'
import { loadNumbers } from '../state/numbers.ts'
import { switchUi } from './switch.ts'
import type { WindowKey } from '../../model/types.ts'

export function onChange(e: Event) {
	const t = e.target as HTMLInputElement
	if (t.hasAttribute('data-ui-choice')) {
		const choice = t.value
		t.value = env.ui
		if (choice === 'new' || choice === 'classic' || choice === 'react') void switchUi(choice)
		return
	}
	if (t.dataset.ws === 'push') { S.wform!.push = t.checked; return }
	// No re-render: leaving a field fires change on the way to its Save button, and a redraw would drop that click.
	if (t.dataset.set) { S.set[t.dataset.set] = t.value; current().patch.unsaved(t); return }
	if (t.dataset.every) { const code = t.dataset.every; A.act(`row:${code}`, code, `every ${code}: ${t.value}`, 'row'); return }
	// The Numbers tab's window: its numbers are asked for again.
	if (t.dataset.numwin != null) { void loadNumbers(t.value as WindowKey); return }
	if (t.dataset.f) { (S.form as Record<string, unknown>)[t.dataset.f] = t.value; render(); return }
	// Report your result: the choice is kept in the page state, so a redraw keeps it (N2).
	if (t.dataset.result) { U(`result:${t.dataset.result}`).pick = [+t.value]; render(); return }
	const el = t.closest<HTMLElement>('[data-code]'); if (!el) return
	const code = el.dataset.code!, c = cardOf(code) as ItemCard, u = U(code)
	if (t.dataset.opt) {
		if (t.dataset.opt === 'other') { Object.assign(u, { otherOn: true, touched: true }); render(); focusOn(`oth-${code}`); return }
		const n = +t.dataset.opt
		u.otherOn = false
		if (c.choices!.multi) { const s = new Set(u.pick ?? c.picked ?? []); if (s.has(n)) s.delete(n); else s.add(n); u.pick = [...s]; u.touched = true; render(); return }
		u.pick = [n]
		A.act(code, code, `pick ${code} ${n}`, 'pick', c.rev)
		return
	}
	if (t.dataset.cmt) { const s = u.cmts ??= new Set(c.changes.map(x => x.n)); if (t.checked) s.add(+t.dataset.cmt); else s.delete(+t.dataset.cmt); u.touched = true; render() }
	if (t.dataset.fact) { const k = c as unknown as KnowledgeCard, s = u.facts ??= new Set(k.facts.map((_, i) => i + 1)); if (t.checked) s.add(+t.dataset.fact); else s.delete(+t.dataset.fact); u.touched = true; render() }
}
export function onInput(e: Event) {
	const t = e.target as HTMLInputElement
	// Find filters as the owner types; the redraw puts the caret back where it was (view/render.ts).
	// During a composition only the words are kept; compositionend draws the result (control/index.ts).
	if (t.id === 'find') { if ((e as InputEvent).isComposing) S.find = t.value; else A.setFind(t.value); return }
	const enable = (act: string, on: boolean) => { const b = document.querySelector<HTMLButtonElement>(`[data-act=${act}]`); if (b) b.disabled = !on }
	if (t.dataset.ws) { (S.wform as Record<string, unknown>)[t.dataset.ws] = t.type === 'checkbox' ? t.checked : t.value; enable('wscreate', !!S.wform!.text.trim()); return }
	if (t.dataset.wf) { (S.watchForm as Record<string, unknown>)[t.dataset.wf] = t.value; enable('watchgo', !!S.watchForm!.target.trim()); return }
	if (t.dataset.set) { S.set[t.dataset.set] = t.value; current().patch.unsaved(t); return }
	if (t.dataset.f === 'text') { S.form!.text = t.value; current().patch.reminder(S.form!); enable('autocreate', !!t.value.trim()); return }
	if (t.dataset.saw) { U(`result:${t.dataset.saw}`).answer = t.value; return }
	if (t.dataset.tell) { U(`tell:${t.dataset.tell}`).answer = t.value; const b = document.querySelector<HTMLButtonElement>(`[data-form=tell][data-code="${t.dataset.tell}"] button[type=submit]`); if (b) b.disabled = !t.value.trim(); return }
	const el = t.closest<HTMLElement>('[data-code]'); if (!el || !t.dataset.input) return
	const code = el.dataset.code!, c = cardOf(code) as ItemCard, u = U(code)
	;(u as Record<string, unknown>)[t.dataset.input] = t.value
	if (t.dataset.input === 'ask' || t.dataset.input === 'marknote') return
	const p = primaryOf(c, u, env.name)
	current().patch.primary(code, p.label, !!p.disabled || u.stale || S.offline)
}
export function onSubmit(e: SubmitEvent) {
	const f = e.target as HTMLFormElement, form = f.dataset.form
	const value = (id: string) => ((document.getElementById(id) as HTMLInputElement | null)?.value || '').trim()
	if (form === 'report') { e.preventDefault(); A.report(value('repin')); return }
	if (form === 'missed') { e.preventDefault(); A.missed(value('missin')); return }
	// Enter in Find: a pasted link that is not an item yet becomes one; otherwise the rows are already there.
	if (form === 'find') { e.preventDefault(); A.findMissed(); return }
	// Your step on work: what the owner did or found goes back through the answer path ("A30: …").
	if (form === 'tell') { e.preventDefault(); const code = f.dataset.code!, u = U(`tell:${code}`), text = u.answer.trim(); if (!text) return; u.answer = ''; A.act(`row:${code}`, code, f.dataset.cmd!.replace('{text}', text), 'row'); return }
	// Report your result: "<code>: Issues found: 403 on checkout", through the answer path. Delegate drafts; ok sends (R-NEX-05).
	if (form === 'result') {
		e.preventDefault()
		const code = f.dataset.code!, u = U(`result:${code}`), result = RESULTS[u.pick?.[0] ?? -1], saw = u.answer.replace(/\s+/g, ' ').trim()
		if (!result) return
		// Functions, so a "$&" in pasted logs is not a replacement pattern (review N2 P2-4); the words go only once the runner has them.
		A.act(`row:${code}`, code, f.dataset.cmd!.replace('{result}', () => result).replace(saw ? '{text}' : ': {text}', () => saw), 'row', undefined, '', () => Object.assign(u, { pick: null, answer: '' }))
		return
	}
	if (form === 'mark') { e.preventDefault(); A.markCard(f.closest<HTMLElement>('[data-code]')!.dataset.code!); return }
	if (form !== 'ask') return
	e.preventDefault()
	A.ask(f.closest<HTMLElement>('[data-code]')!.dataset.code!)
}
