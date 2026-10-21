// Delegate's page. The shell puts the view on window.DELEGATE and the transport on window.DELEGATE_IO
// (design-spec/client-contract.md); this picks the experience that draws it and starts the page.
// Layers: model (pure), io (transport, polling), state (store, actions), view (experiences), control (events, keys, routes).
import { listen, route } from './control/index.ts'
import { say, setTheme } from './control/ui.ts'
import { chooseUi } from './control/switch.ts'
import { refresh } from './state/actions.ts'
import { init, env, syncOrder, V } from './state/store.ts'
import { classic } from './view/classic/index.ts'
import { next } from './view/next/index.ts'
import type { Experience } from './view/experience.ts'
import { start } from './view/render.ts'
import { theme } from './view/theme.ts'

// The experiences the page can draw: classic, and the new one behind the "New experience" switch (R-NEX-01).
const EXPERIENCES: Record<'classic' | 'new', Experience> = { classic, new: next }

// One start, after the experience is known: a #ui= link waits for its save before the first draw.
void (async () => {
	init(window.DELEGATE, window.DELEGATE_IO, window.DELEGATE_POLL_MS || 2000)
	const chosen = await chooseUi(), exp = EXPERIENCES[chosen.ui]
	start(exp)
	exp.boot(document.getElementById('app')!)
	syncOrder()
	if (!env.snap) listen()
	setTheme(theme())
	route()
	if (chosen.failed) say('Could not switch: offline')
	// The new page's rows come only when it asks (/data?ui=new); a page drawn from a classic view fetches them once.
	if (env.ui === 'new' && !V.next) void refresh()
})()
