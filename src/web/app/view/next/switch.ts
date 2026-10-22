// One version menu in both page headers; below 560px it lives in the Views menu.
import { env } from '../../state/store.ts'
import { html, raw, type H } from '../html.ts'

export function uiSwitch(where: 'top' | 'menu'): H {
	// The AI-chat panel offers no switch until it is verified in a real host (review P2-3); it follows this machine's setting.
	if (env.snap || env.panel) return ''
	return html`<label class="uisw uisw-${raw(where)}"><span class="sr">App version</span><select aria-label="App version" data-ui-choice><option value="classic"${env.ui === 'classic' ? raw(' selected') : ''}>Classic</option><option value="new"${env.ui === 'new' ? raw(' selected') : ''}>New</option><option value="react">React (preview)</option></select></label>`
}
