// A reply to send: the question it answers, context, the draft, and what else sending does.
import type { CardUi, ItemCard } from '../../../../model/types.ts'
import { esc, html, type H } from '../../html.ts'
import { alsoLine, ctx, draftBlock, promiseLines, saidLine } from './blocks.ts'
import { forPage } from '../../../../model/format.ts'

export const body = (c: ItemCard, u: CardUi): H => html`${saidLine(c)}${c.question && !c.draft?.preview ? html`<p class="q">${esc(forPage(c.question))}</p>` : ''}${ctx(c)}${draftBlock(c, u)}${alsoLine(c, 'task')}${promiseLines(c)}`
