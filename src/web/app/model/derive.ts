// What the page works out from the data: what is new, the queue's order, the tabs, and each card's one primary action. Pure.
import { plural } from './format.ts'
import type { CardUi, DoneRow, ItemCard, KnowledgeCard, NextRow, Primary, View } from './types.ts'

/* ------------------------------ what is new ------------------------------ */
// Each Done filter and the row kinds in it. Closed-with-nothing-to-know rows are only a footer under Catch up; skipped ones are never shown.
export const DONE_KINDS: Record<string, DoneRow['kind'][]> = { replies: ['reply', 'review'], reviews: ['review'], changes: ['change'], reminders: ['reminder'], learned: ['learned'], catchup: ['catchup'] }
export const CHIP_LABEL: Record<string, string> = { catchup: 'Catch up' }
export const KIND_KEY: Partial<Record<DoneRow['kind'], string>> = { reply: 'replies', review: 'replies', change: 'changes', reminder: 'reminders', learned: 'learned', catchup: 'catchup' }
// When the owner last looked at a filter; before any look, since the visit started.
export const seenIn = (v: View) => (k: string) => v.seen?.[k] ?? v.since ?? ''
// New: something Delegate did or read that the owner has not seen since they last looked at its filter. Their own sends never count.
// A row the owner already looked at on Now (its item mark, N1b) is not new either, in either experience.
export const itemSeen = (v: View) => (code: string): string | undefined => v.seen?.[`item:${code}`]
export const isNew = (r: DoneRow, seen: (k: string) => string, item: (code: string) => string | undefined = () => undefined) => !r.own && !!KIND_KEY[r.kind] && r.at > seen(KIND_KEY[r.kind]!) && !((item(r.code) ?? '') >= r.at)
export const newCount = (v: View) => v.done.filter(r => isNew(r, seenIn(v), itemSeen(v))).length

/* ------------------------------ New and Back to you on Now (N1b) ------------------------------ */
export const latest = (...xs: (string | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? ''
// When the owner last saw a row on Now: the marks of its items (the home and the code that placed it), or its filter's: Catch up's
// mark for a Catch up row, and the start of this visit for every row. Seen marks merge across machines, so any machine counts.
export const rowMark = (v: View, r: Pick<NextRow, 'code' | 'act' | 'section'>) => latest(v.seen?.[`item:${r.code}`], v.seen?.[`item:${r.act}`], r.section === 'catchup' ? v.seen?.catchup : undefined, v.since)
// Back to you: it entered Your move after the owner last looked, and the owner had seen it before (it is older than the look).
// New: it changed after the owner last looked. Back says more, so it wins.
// A watch's "Changed" already says New, with its Got it.
export function freshOf(r: Pick<NextRow, 'fresh'> & { chips?: NextRow['chips'] }, mark: string): 'new' | 'back' | undefined {
	const f = r.fresh
	if (!f) return undefined
	if (f.back && f.back > mark && f.born <= mark) return 'back'
	return f.changed && f.changed > mark && !r.chips?.some(c => c.kind === 'changed') ? 'new' : undefined
}
export const FRESH_TEXT = { new: 'New', back: 'Back to you' } as const

/* ------------------------------ the queue ------------------------------ */
// Cards keep the order they arrived in, handled ones stay in place for the visit, and Later ones go to the end.
export function orderOf(order: string[], needs: ItemCard[], handled: (code: string) => boolean, later: (code: string) => boolean): string[] {
	const live = new Set(needs.map(c => c.code))
	const next = order.filter(c => live.has(c) || handled(c))
	for (const c of needs) if (!next.includes(c.code)) next.push(c.code)
	return next.sort((a, b) => (later(a) ? 1 : 0) - (later(b) ? 1 : 0))
}

// A card the owner has started on: a redraw from fresh data must not throw away what they typed or picked.
export const dirty = (u: CardUi) => u.touched || u.editing || !!u.answer || !!u.other || !!u.ask

// The tabs and their order. To learn is a tab only while facts wait for the owner's ok. Numbers, last before Settings, has no
// count, and only where it can be asked for (not the snapshot) (R-NEX-11).
export const tabsOf = (v: View, snap: boolean, numbers = false): [string, string, number?][] => [['home', 'Home'], ['focus', 'Needs you'], ['done', 'Done', snap ? 0 : newCount(v)], ['ongoing', 'Ongoing'], ...(v.knowledge.length ? [['knowledge', 'To learn'] as [string, string]] : []), ...(numbers && !snap ? [['numbers', 'Numbers'] as [string, string]] : []), ...(v.settings ? [['settings', 'Settings'] as [string, string]] : [])]

/* ------------------------------ primary actions ------------------------------ */
export function changeLabel(c: ItemCard, n: number, reply: boolean): string {
	if (c.type === 'meeting' && n) return 'Send and create invite'
	const comments = c.changes.length && c.changes.every(x => /comment|review/i.test(x.action))
	const what = comments ? `Post ${plural(n, 'comment')}` : `Make ${plural(n, 'change')}`
	return n ? (reply ? `${what} and reply` : what) : reply ? 'Send reply only' : 'Nothing to do'
}
const sendOrEdit = (c: ItemCard, u: CardUi): Primary => u.text != null && u.text.trim() !== c.draft!.text.trim()
	? { label: 'Send your version', cmd: `send ${c.code}: ${u.text.trim()}`, kind: 'finish' }
	: { label: c.draft?.holding ? 'Send holding reply' : 'Send', cmd: `ok ${c.code}`, kind: 'finish' }
const replyPrimary = (c: ItemCard, u: CardUi): Primary => c.draft
	? (c.changes.length ? { ...sendOrEdit(c, u), label: changeLabel(c, c.changes.length, true) } : sendOrEdit(c, u))
	: { label: changeLabel(c, c.changes.length, false), cmd: `ok ${c.code}`, kind: 'finish', disabled: !c.changes.length }
function choicePrimary(c: ItemCard, u: CardUi, name: string): Primary {
	if (u.otherOn) return { label: 'Draft reply', cmd: `${c.code}: ${u.other.trim()}`, kind: 'draft', disabled: !u.other.trim(), hint: 'Nothing is sent yet. You will see the reply first.', verb: `${c.code}: your answer` }
	const picks = (u.pick ?? []).slice().sort((a, b) => a - b), server = (c.picked ?? []).slice().sort((a, b) => a - b)
	const changed = u.pick && picks.join() !== server.join()
	if (c.choices!.multi && changed) return { label: picks.length ? 'Draft reply' : 'Pick at least one', cmd: `pick ${c.code} ${picks.join(', ')}`, kind: 'draft', disabled: !picks.length, hint: `${name} writes the reply from your picks. Nothing is sent yet.` }
	if (c.draft?.preview && server.length) { const n = c.changes.length; return { label: n ? changeLabel(c, n, true) : 'Send', cmd: `ok ${c.code}`, kind: 'finish' } }
	return { label: c.type === 'meeting' ? 'Send and create invite' : 'Send', cmd: `ok ${c.code}`, kind: 'finish', disabled: true, hint: c.choices!.multi ? 'Pick what to include.' : 'Pick an option to see the exact reply.', verb: `pick ${c.code} 1` }
}
function reviewPrimary(c: ItemCard, u: CardUi): Primary {
	const on = [...(u.cmts ?? new Set(c.changes.map(x => x.n)))].sort((a, b) => a - b), all = on.length === c.changes.length
	const edited = u.text != null && c.draft && u.text.trim() !== c.draft.text.trim()
	const label = changeLabel(c, on.length, !!c.draft)
	if (edited) return all ? { label: `${label.replace(/ and reply$/, '')} and send your version`, cmd: `send ${c.code}: ${u.text!.trim()}`, kind: 'finish' } : { label, cmd: '', kind: 'finish', disabled: true, hint: 'To change the reply and skip a change, do one at a time.' }
	const skip = c.changes.map(x => x.n).filter(n => !on.includes(n))
	return { label, cmd: all ? `ok ${c.code}` : `ok ${c.code} except ${skip.join(', ')}`, kind: 'finish', disabled: !on.length && !c.draft }
}
// Each card type's primary action. A type the page does not know acts like a reply.
const PRIMARY: Record<ItemCard['type'], (c: ItemCard, u: CardUi, name: string) => Primary> = {
	reply: replyPrimary,
	question: (c, u) => ({ label: 'Draft reply', cmd: `${c.code}: ${u.answer.trim()}`, kind: 'draft', disabled: !u.answer.trim(), hint: 'Nothing is sent yet. You will see the reply first.', verb: `${c.code}: your answer` }),
	choice: choicePrimary,
	meeting: (c, u, name) => c.choices ? choicePrimary(c, u, name) : replyPrimary(c, u),
	review: reviewPrimary,
}
export const primaryOf = (c: ItemCard, u: CardUi, name: string) => (PRIMARY[c.type] || PRIMARY.reply)(c, u, name)

// To learn: every fact by default; a subset names the ones to keep.
export const factsOn = (k: KnowledgeCard, u: CardUi) => u.facts ?? new Set(k.facts.map((_, i) => i + 1))
export const kCmd = (k: KnowledgeCard, u: CardUi) => { const on = factsOn(k, u); return on.size === k.facts.length ? `ok ${k.code}` : `ok ${k.code} ${[...on].sort((a, b) => a - b).map(x => `#${x}`).join(' ')}` }

/* ------------------------------ the Since line (N1b) ------------------------------ */
// "Since 6:10 PM: replied to 5 (2 by rule) · 1 review · 4 FYIs · 11 handled": what Delegate did since the owner last looked, from
// Done's rows on the page, each part opening its Done filter; "handled" is this week's, from the Numbers count, and opens Numbers.
// Replies are to people, by Delegate on the owner's word or a rule; the owner's own replies in Teams are not.
export function sinceOf(v: Pick<View, 'now' | 'since' | 'done' | 'next'>): { at: string; parts: { text: string; href: string }[] } {
	const at = v.since ?? new Date(Date.parse(v.now) - 86_400_000).toISOString()
	const fresh = (v.done ?? []).filter(r => r.at > at)
	const replies = fresh.filter(r => r.kind === 'reply' && !r.inTeams), people = new Set(replies.map(r => r.who.name)).size
	// Both numbers count people (review P2-5): three rule replies to Kim are "replied to 1 (1 by rule)".
	const byRule = new Set(replies.filter(r => r.by.startsWith('by rule')).map(r => r.who.name)).size
	const reviews = fresh.filter(r => r.kind === 'review').length, fyis = fresh.filter(r => r.kind === 'catchup').length, handled = v.next?.handled ?? 0
	const parts = [
		people ? { text: `replied to ${people}${byRule ? ` (${byRule} by rule)` : ''}`, href: '#done/replies' } : undefined,
		reviews ? { text: plural(reviews, 'review'), href: '#done/reviews' } : undefined,
		fyis ? { text: fyis === 1 ? '1 FYI' : `${fyis} FYIs`, href: '#done/catchup' } : undefined,
		handled ? { text: `${handled} handled`, href: '#numbers' } : undefined,
	].filter((p): p is { text: string; href: string } => !!p)
	return { at, parts }
}
