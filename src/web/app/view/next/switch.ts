// The "New experience" switch, in both experiences' headers (R-NEX-01). top: next to the theme button; menu: the item in the
// narrow menu. A dot says "New" until it has been turned on once.
import { V, env } from '../../state/store.ts'
import { html, raw, type H } from '../html.ts'

export function uiSwitch(where: 'top' | 'menu'): H {
	// The AI-chat panel offers no switch until it is verified in a real host (review P2-3); it follows this machine's setting.
	if (env.snap || env.panel) return ''
	const on = env.ui === 'new', fresh = !V.ui?.tried
	return html`<button class="uisw uisw-${raw(where)}" type="button" role="switch" aria-checked="${raw(String(on))}" data-act="ui"><span class="uisw-l">New experience</span>${fresh ? raw('<span class="newdot" title="New"><span class="sr"> (new)</span></span>') : ''}<span class="uisw-t" aria-hidden="true"><i></i></span></button>`
}
