// To learn: facts waiting for the owner's ok. A tab only while there are some (model/derive.ts tabsOf).
import { V } from '../../../state/store.ts'
import { html, raw, type H } from '../../html.ts'
import { banners } from '../banners.ts'
import { kCard } from '../knowledge-card.ts'
import { listHead } from '../parts.ts'

export const knowledgeList = (): H => html`${banners()}${listHead('To learn', 'Facts waiting for your ok. Learned facts are saved by themselves; see Done, Learned.')}${V.knowledge.length ? html`<div style="display:flex;flex-direction:column;gap:16px;max-width:720px">${V.knowledge.map(kCard)}</div>` : raw('<p class="empty">Nothing to learn right now.</p>')}`
