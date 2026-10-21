// A question only the owner can answer: their words become the draft.
import type { CardUi, ItemCard } from '../../../model/types.ts'
import { esc, html, type H } from '../../html.ts'
import { ctx } from './blocks.ts'

export const body = (c: ItemCard, u: CardUi): H => html`<p class="q">${esc(c.question)}</p>${ctx(c)}<label class="sr" for="ans-${esc(c.code)}">Your answer</label><input class="field" id="ans-${esc(c.code)}" data-input="answer" placeholder="Your answer" value="${esc(u.answer)}" autocomplete="off">`
