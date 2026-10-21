// The "New experience" switch (R-NEX-01): per machine on the server, cached in this browser for the first paint when it can be.
// Switching sends no command and changes no data; it reloads the page in the other experience.
import { hashUi, pickUi, type Ui } from '../model/ui.ts'
import { S, V, cardOf, env } from '../state/store.ts'
import { render } from '../view/render.ts'
import { say } from './ui.ts'

const KEY = 'delegate-ui'
// The AI-chat panel may not allow storage: every use is optional.
export function cached(): { ui: Ui; at?: string } | undefined {
	try { const c = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return c && (c.ui === 'new' || c.ui === 'classic') ? c : undefined } catch { return undefined }
}
const cache = (ui: Ui) => { try { localStorage.setItem(KEY, JSON.stringify({ ui, at: new Date().toISOString() })) } catch { /* no storage here */ } }
// Saved on the server first; only a saved choice is cached here, so this browser never disagrees with the machine (review P2-4).
const save = async (ui: Ui): Promise<boolean> => { const r = await env.io?.ui?.({ ui }).catch(() => undefined); if (r?.ok) cache(ui); return !!r?.ok }

// At start: the experience to draw. A #ui= address is saved like a flip and leaves the address, so a reload keeps it; it is
// drawn only once the server saved it, and offline the page stays as it was and says so (review round 2, P2-1).
export async function chooseUi(): Promise<{ ui: Ui; failed?: boolean }> {
	// The panel follows this machine's setting read-only: no address, no cache, no writes (review P2-3).
	if (env.panel) return { ui: env.ui = pickUi(V, '', undefined, env.snap) }
	const h = env.snap ? undefined : hashUi(location.hash)
	if (h) {
		history.replaceState(null, '', location.pathname + location.search)
		if (await save(h)) return { ui: env.ui = h }
		return { ui: env.ui = pickUi(V, '', cached(), env.snap), failed: true }
	}
	return { ui: env.ui = pickUi(V, '', cached(), env.snap) }
}

// Text the owner typed and has not sent: a card's answer, edit, other, ask, or note; a setting not saved; a form; any field on the page.
export function unsent(): boolean {
	for (const [code, u] of Object.entries(S.ui)) {
		const c = cardOf(code), draft = (c && 'draft' in c ? c.draft?.text?.trim() : '') ?? ''
		if (u.answer?.trim() || u.other?.trim() || u.ask?.trim() || u.marknote?.trim() || (u.editing && (u.text ?? '').trim() && (u.text ?? '').trim() !== draft)) return true
	}
	if (Object.keys(S.set).length || S.form?.text?.trim() || S.wform?.text?.trim()) return true
	return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#main textarea, #main input')].some(el => !/^(checkbox|radio|hidden|submit|button)$/.test(el.type) && !!el.value.trim() && el.value !== el.defaultValue)
}

// Flip: ask first when a field holds unsent text, save, then reload. Done and Settings reload on the same tab; the rest opens the start.
export async function switchUi(to: Ui) {
	if (env.panel) return
	if (unsent() && !window.confirm('Discard your edit?')) return
	if (!await save(to)) { say('Could not switch: offline'); return }
	const base = S.route.split('/')[0]
	history.replaceState(null, '', location.pathname + location.search + (base === 'done' || base === 'settings' ? location.hash : ''))
	location.reload()
}

// The first-time note on Now, closed once for this machine.
export function closeNote() {
	V.ui = { ...(V.ui ?? { ui: env.ui }), noted: true }
	void env.io?.ui?.({ noted: true }).catch(() => undefined)
	render()
}
