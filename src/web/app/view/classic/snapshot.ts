// The read-only snapshot synced to the owner's storage: Home, then every card, with the words to type instead of buttons.
import { V, env } from '../../state/store.ts'
import { esc, html, type H } from '../html.ts'
import { I } from '../icons.ts'
import { card } from './card.ts'
import { kCard } from './knowledge-card.ts'
import { home } from './tabs/home.ts'

export const snapshot = (): H => html`<div class="snapnote">${I('info')}<span>This is a snapshot. To act, reply in your Teams self-chat with the words on each card, or run <code>${esc(env.cmd)} open</code>.</span></div>
	${home()}${V.needs.length ? html`<h2 class="also-h">Needs you</h2><div style="display:flex;flex-direction:column;gap:16px;max-width:720px">${V.needs.map(c => card(c))}</div>` : ''}
	${V.knowledge.length ? html`<h2 class="also-h">To learn</h2><div style="display:flex;flex-direction:column;gap:16px;max-width:720px">${V.knowledge.map(kCard)}</div>` : ''}`
