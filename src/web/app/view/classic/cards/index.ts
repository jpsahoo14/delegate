// Each card type draws its own body; the card around it is the same for all (view/classic/card.ts).
// A new type is a module here and a line in BODY, and its primary action in model/derive.ts.
import type { CardUi, ItemCard } from '../../../../model/types.ts'
import type { H } from '../../html.ts'
import * as choice from './choice.ts'
import * as meeting from './meeting.ts'
import * as question from './question.ts'
import * as reply from './reply.ts'
import * as review from './review.ts'

const BODY: Record<ItemCard['type'], (c: ItemCard, u: CardUi) => H> = { reply: reply.body, question: question.body, choice: choice.body, meeting: meeting.body, review: review.body }
// A type the page does not know draws as a reply.
export const bodyOf = (c: ItemCard, u: CardUi) => (BODY[c.type] || BODY.reply)(c, u)
