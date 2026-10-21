// The address after '#': which tab, which card, which Settings section or row.
import * as A from '../state/actions.ts'
import { S, V, cardOf, env, openCards } from '../state/store.ts'
import { current, render } from '../view/render.ts'
import { hashUi } from '../model/ui.ts'
import { switchUi } from './switch.ts'

export function route() {
	// #ui=new or #ui=classic followed on an open page: the same as flipping the switch.
	const ui = env.snap || env.panel ? undefined : hashUi(location.hash)
	if (ui) { history.replaceState(null, '', location.pathname + location.search); if (ui !== env.ui) { void switchUi(ui); return } }
	// An experience may open an address its own way (the new one opens classic links in Now).
	const h0 = decodeURIComponent(location.hash.slice(1)) || 'home', h = current().alias?.(h0) ?? h0
	// Old addresses still work: Running, Watching, and Automations are sections of Ongoing now.
	S.route = h.startsWith('focus') ? 'focus' : ({ running: 'ongoing/running', watching: 'ongoing', automations: 'ongoing/automations', 'automations/new': 'ongoing' } as Record<string, string>)[h] || h
	// Coming back to Done is a new look: what arrived meanwhile is new, then seen.
	if (!S.route.startsWith('done')) S.seenFor = null
	if (h === 'automations/new') S.sheet = 'pick'
	// Entering the queue puts focus on a card, so its keys work at once.
	if (S.route === 'focus') { const code = h.split('/')[1] || S.cur || openCards()[0]?.code; if (code && cardOf(code)) return A.go(code) }
	// #settings/<section> scrolls to it; #settings/<key> opens More when the row is there, scrolls to it, and puts the cursor in it.
	const sub = S.route.startsWith('settings/') && S.route.split('/')[1], row = sub ? V.settings?.rows.find(r => r.key === sub) : undefined
	if (row?.advanced) S.advOpen = true
	A.viewing()
	render(S.route === 'focus')
	const at = S.route.startsWith('ongoing/') ? document.getElementById(S.route.split('/')[1]) : S.route.startsWith('now/') ? document.getElementById(`now-${S.route.split('/')[1]}`) : row ? document.querySelector(`[data-code="set:${row.key}"]`) : sub && document.getElementById(`setsec-${sub}`)
	// Text fields take the cursor; a choice is only scrolled to, so focus never holds back the page's updates.
	if (at) { at.scrollIntoView(); const f = row && document.getElementById(`set-${row.key}`); if (f && f.tagName !== 'SELECT') f.focus({ preventScroll: true }) } else if (S.route !== 'focus') window.scrollTo(0, 0)
}

