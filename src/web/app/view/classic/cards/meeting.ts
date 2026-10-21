// A meeting ask: when it is, then the choice or the reply.
import type { CardUi, ItemCard } from '../../../model/types.ts'
import { esc, html, type H } from '../../html.ts'
import { ctx, meetingStrip, options, preview } from './blocks.ts'

export const body = (c: ItemCard, u: CardUi): H => html`${meetingStrip(c)}${c.question || c.choices?.prompt ? html`<p class="q">${esc(c.question || c.choices!.prompt)}</p>` : ''}${ctx(c)}${c.choices ? options(c, u) : ''}${preview(c, u)}`
