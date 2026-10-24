// The card's golden cases (queue-new #34; engineer-card-state-devspec.md §5): one row per rule, per past card bug and per edge case,
// run over cardState() only. No browser, no model, well under a second. A proof script, not a test: run it by hand with
// `node scripts/card-golden.ts` and paste its last line into the report of every change that touches card state. Every new card bug
// adds its row here before the fix. Item codes are the owner's; everything else is fictional.
import { cardState, checkCard, currentFailure, type CardFacts, type Failure } from '../src/core/card-state.ts'

const DAY = 86_400_000, now = Date.parse('2026-10-24T12:00:00Z')
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString()
const fail = (f: Partial<Failure> = {}): Failure => ({ kind: 'other', at: at(1), why: 'the run stopped without a result', tried: [], repeats: 0, systemChanged: false, ...f })
const draft = (d: Partial<NonNullable<CardFacts['draft']>> = {}) => ({ holding: false, preview: false, at: at(0), ...d })
const facts = (f: Partial<CardFacts> = {}): CardFacts => ({ state: 'needs_human', changes: 0, ...f })
type Row = { id: string; what: string; facts: CardFacts; expect: { mode: string; primary?: string | null; secondary?: string[]; editor?: string; warn?: string | null }; broken?: string[] }

const rows: Row[] = [
	// One per rule (§2), the least that selects it.
	{ id: 'G1', what: 'rule 1: the AI limit holds drafting', facts: facts({ hold: { kind: 'agent', text: 'Waiting to draft: the AI limit for today is reached. Delegate tries again by itself at 9:00.' } }), expect: { mode: 'agent-wait', primary: 'write-own', editor: 'none', warn: 'Waiting to draft' } },
	{ id: 'G2', what: 'rule 2: the owner replied in Teams', facts: facts({ ownReply: { at: at(0) }, draft: draft() }), expect: { mode: 'own-reply', primary: null, editor: 'none' } },
	{ id: 'G3', what: 'rule 3: a run failed for a passing reason', facts: facts({ failure: fail() }), expect: { mode: 'failed', primary: 'try-again', secondary: ['write-own', 'later'], editor: 'none', warn: "Couldn't draft this" } },
	{ id: 'G4', what: 'rule 4: the PR changed since the review', facts: facts({ question: { text: 'PR 77 changed since your review. Review again?', reviewAgain: true }, draft: draft() }), expect: { mode: 'review-again', primary: 'review-again', secondary: ['approve', 'later'] } },
	{ id: 'G5', what: 'rule 5: not a reviewer; Add me offered', facts: facts({ declined: { pr: 77, addMe: true }, changes: 1 }), expect: { mode: 'declined', primary: 'approve', editor: 'none' } },
	{ id: 'G6', what: 'rule 6: a send was refused', facts: facts({ draft: draft(), notSent: { why: "the approval isn't on the PR yet" } }), expect: { mode: 'not-sent', primary: 'approve', editor: 'reply', warn: "Didn't send: the approval" } },
	{ id: 'G7', what: 'rule 7: the owner reports how it went', facts: facts({ yourStep: { kind: 'report', what: 'Tell Kim how the rollout went' } }), expect: { mode: 'your-step', primary: 'report' } },
	{ id: 'G8', what: 'rule 8: options to pick from', facts: facts({ choices: { multi: false }, question: { text: 'Which slot?', reviewAgain: false } }), expect: { mode: 'choices', primary: 'pick', editor: 'none' } },
	{ id: 'G9', what: 'rule 9: a question, no draft', facts: facts({ question: { text: 'Which Acme region?', reviewAgain: false } }), expect: { mode: 'answer', primary: 'answer', editor: 'answer' } },
	{ id: 'G10', what: 'rule 10: a question and a holding draft', facts: facts({ question: { text: 'Which Acme region?', reviewAgain: false }, draft: draft({ holding: true }) }), expect: { mode: 'answer-with-holding', primary: 'answer', secondary: ['approve', 'later'], editor: 'answer' } },
	{ id: 'G11', what: 'rule 11: a question and a full draft', facts: facts({ question: { text: 'Also ping the release channel?', reviewAgain: false }, draft: draft() }), expect: { mode: 'reply-with-question', primary: 'approve', editor: 'reply' } },
	{ id: 'G12', what: 'rule 12: changes and a draft', facts: facts({ changes: 2, draft: draft() }), expect: { mode: 'changes', primary: 'approve', secondary: ['reply-only', 'later'], editor: 'reply' } },
	{ id: 'G13', what: 'rule 13: a holding draft', facts: facts({ draft: draft({ holding: true }) }), expect: { mode: 'holding', primary: 'approve', editor: 'reply', warn: null } },
	{ id: 'G14', what: 'rule 14: a draft', facts: facts({ draft: draft() }), expect: { mode: 'reply', primary: 'approve', secondary: ['later'], editor: 'reply' } },
	{ id: 'G15', what: 'rule 15: nothing fits', facts: facts(), expect: { mode: 'unknown', primary: 'write-own' }, broken: ['no mode fits'] },
	// Past bugs, from their queue shapes (G16–G30).
	{ id: 'G16', what: 'A37 (#33): a review job failed days ago; a newer holding draft', facts: facts({ failure: currentFailure([fail({ at: at(4), why: 'It needs the repo https://dev.azure.com/acme on fictional-pc', job: 'j1' })], at(0)), draft: draft({ holding: true }) }), expect: { mode: 'holding', primary: 'approve', warn: null } },
	{ id: 'G17', what: 'A50: a review with a question and a draft', facts: facts({ question: { text: 'Ask Priya about the spec?', reviewAgain: false }, draft: draft() }), expect: { mode: 'reply-with-question', primary: 'approve' } },
	{ id: 'G18', what: 'A57 (#6): a draft citing a titled PR link', facts: facts({ draft: draft() }), expect: { mode: 'reply', primary: 'approve' } },
	{ id: 'G19', what: 'A61: a review reply, nothing to post', facts: facts({ draft: draft() }), expect: { mode: 'reply', primary: 'approve', editor: 'reply' } },
	{ id: 'G20', what: "A76 (#26): couldn't read the spec; readers added since", facts: facts({ failure: fail({ kind: 'content', why: 'Available readers return only the v7 prefix', systemChanged: true, job: 'j2' }) }), expect: { mode: 'failed', primary: 'try-again' } },
	{ id: 'G21', what: 'A120: question + draft, the reply counts on a refused change', facts: facts({ question: { text: 'Post the author comment?', reviewAgain: false }, draft: draft(), replyCountsOnRefused: true }), expect: { mode: 'reply-with-question', primary: 'approve', warn: 'Your reply mentions' } },
	{ id: 'G22', what: 'A128: approval unverified', facts: facts({ draft: draft(), notSent: { why: "your approval isn't on PR 1732433 yet" } }), expect: { mode: 'not-sent', warn: "Didn't send:" } },
	{ id: 'G23', what: 'A129: a review ran out of routes', facts: facts({ failure: fail({ kind: 'content', why: 'the diff could not be read', review: true, job: 'j3' }) }), expect: { mode: 'failed', primary: null, secondary: ['try-again', 'later'] } },
	{ id: 'G24', what: 'A177: a comment to post and a reply', facts: facts({ changes: 1, draft: draft() }), expect: { mode: 'changes', primary: 'approve', secondary: ['reply-only', 'later'] } },
	{ id: 'G25', what: 'A178: two changes, no reply', facts: facts({ changes: 2 }), expect: { mode: 'changes', primary: 'approve', secondary: ['later'], editor: 'none' } },
	{ id: 'G26', what: 'A179: a question and a holding draft', facts: facts({ question: { text: 'Which part of the spec?', reviewAgain: false }, draft: draft({ holding: true }) }), expect: { mode: 'answer-with-holding', primary: 'answer' } },
	{ id: 'G27', what: 'A88: a holding draft is not a warning', facts: facts({ draft: draft({ holding: true }) }), expect: { mode: 'holding', warn: null } },
	{ id: 'G28', what: "#15: the owner's own reply closes the card", facts: facts({ ownReply: { at: at(0) } }), expect: { mode: 'own-reply', primary: null } },
	{ id: 'G29', what: '#18: a message to the owner with a draft', facts: facts({ draft: draft() }), expect: { mode: 'reply', primary: 'approve' } },
	{ id: 'G30', what: '#22: a split review ask with a draft', facts: facts({ draft: draft() }), expect: { mode: 'reply', primary: 'approve' } },
	// Edge cases (G31–G40).
	{ id: 'G31', what: 'the same failure a third time: Write leads', facts: facts({ failure: fail({ repeats: 2 }) }), expect: { mode: 'failed', primary: 'write-own', secondary: ['try-again', 'later'], warn: "Couldn't draft this" } },
	{ id: 'G32', what: 'a setup failure, cause not fixed', facts: facts({ failure: fail({ kind: 'setup', why: 'the AI CLI is not signed in' }) }), expect: { mode: 'failed', primary: 'write-own' } },
	{ id: 'G33', what: 'a sign-in hold', facts: facts({ hold: { kind: 'agent', text: 'Waiting to draft: sign in to the AI CLI.' } }), expect: { mode: 'agent-wait' } },
	{ id: 'G34', what: 'paused, with a draft', facts: facts({ draft: draft(), hold: { kind: 'paused', text: 'Paused' } }), expect: { mode: 'reply', primary: 'approve' } },
	{ id: 'G35', what: 'choices after the owner edited', facts: facts({ choices: { multi: true }, draft: draft({ preview: true }) }), expect: { mode: 'reply', primary: 'approve' } },
	{ id: 'G36', what: 'a report step with a question', facts: facts({ yourStep: { kind: 'report', what: 'Report' }, question: { text: 'How did it go?', reviewAgain: false } }), expect: { mode: 'your-step', primary: 'report' } },
	{ id: 'G37', what: 'declined, no Add me', facts: facts({ declined: { pr: 77, addMe: false } }), expect: { mode: 'declined', primary: null } },
	{ id: 'G38', what: 'an edited draft is sent as edited', facts: facts({ draft: draft({ preview: true }) }), expect: { mode: 'reply', primary: 'approve', editor: 'reply' } },
	{ id: 'G39', what: 'the reply counts on a refused change', facts: facts({ draft: draft(), replyCountsOnRefused: true }), expect: { mode: 'reply', warn: 'Your reply mentions' } },
	{ id: 'G40', what: "a failed check of the owner's promise", facts: facts({ promiseFailed: 'its run ended without a result' }), expect: { mode: 'failed', primary: 'approve' } },
	{ id: 'G41', what: 'a draft older than the failure: the failure leads', facts: facts({ failure: currentFailure([fail({ at: at(1), job: 'j4' })], at(2)), draft: draft({ at: at(2), holding: true }) }), expect: { mode: 'failed', primary: 'try-again' } },
	{ id: 'G42', what: 'a decision step with a draft', facts: facts({ yourStep: { kind: 'decision', what: 'Pick the date' }, draft: draft() }), expect: { mode: 'reply-with-question', primary: 'approve' } },
	// Found by the inert-copy check of step 3 (owner data, 23 Oct).
	{ id: 'G43', what: 'A57/A61: approval not verified; Send checks again', facts: facts({ draft: draft(), notSent: { why: 'the PR approval could not be verified' } }), expect: { mode: 'not-sent', primary: 'approve', editor: 'reply', warn: "Didn't send: the PR approval" } },
	{ id: 'G44', what: 'A90: "Not finished" with nothing to send', facts: facts({ failure: fail({ kind: 'content', why: "The forwarded message's contents were not exposed" }) }), expect: { mode: 'failed', primary: 'write-own', secondary: ['try-again', 'later'] } },
]

const t0 = performance.now()
let bad = 0
for (const r of rows) {
	const s = cardState(r.facts), broken = checkCard(r.facts, s), e = r.expect, why: string[] = []
	if (s.mode !== e.mode) why.push(`mode ${s.mode}, expected ${e.mode}`)
	if (e.primary !== undefined && (s.primary ?? null) !== e.primary) why.push(`primary ${s.primary ?? 'none'}, expected ${e.primary ?? 'none'}`)
	if (e.secondary && JSON.stringify(s.secondary) !== JSON.stringify(e.secondary)) why.push(`secondary ${s.secondary.join(',')}, expected ${e.secondary.join(',')}`)
	if (e.editor && s.editor !== e.editor) why.push(`editor ${s.editor}, expected ${e.editor}`)
	if (e.warn === null && s.warn) why.push(`warn "${s.warn}", expected none`)
	if (e.warn && !s.warn?.startsWith(e.warn)) why.push(`warn "${s.warn ?? ''}", expected "${e.warn}…"`)
	if (JSON.stringify(broken) !== JSON.stringify(r.broken ?? [])) why.push(`invariants [${broken.join('; ')}], expected [${(r.broken ?? []).join('; ')}]`)
	if (why.length) { bad++; console.log(`FAIL ${r.id} ${r.what}: ${why.join(' · ')}`) }
}
console.log(`card-golden: ${rows.length - bad}/${rows.length} pass in ${(performance.now() - t0).toFixed(1)} ms`)
process.exitCode = bad ? 1 : 0
