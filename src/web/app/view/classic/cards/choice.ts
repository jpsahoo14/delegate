// A choice: the options, and once one is picked, the exact reply it sends.
import type { CardUi, ItemCard } from '../../../../model/types.ts'
import { esc, html, type H } from '../../html.ts'
import { ctx, options, preview } from './blocks.ts'
import { forPage } from '../../../../model/format.ts'

export const body = (c: ItemCard, u: CardUi): H => html`<p class="q">${esc(forPage(c.choices!.prompt || c.question))}</p>${ctx(c)}${options(c, u)}${preview(c, u)}`
