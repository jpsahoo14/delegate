// The card's golden cases (queue-new #34; engineer-card-state-devspec.md §5): one row per rule, per past card bug and per edge case,
// run over cardState() only. No browser, no model, well under a second. A proof script, not a test: run it by hand with
// `node scripts/card-golden.ts` and paste its last line into the report of every change that touches card state. Every new card bug
// adds its row here before the fix. Item codes are the owner's; everything else is fictional.
import { cardState, checkCard, currentFailure, type CardFacts, type Failure, type HeldReason } from '../src/core/card-state.ts'
import { cardFacts } from '../src/core/card-facts.ts'

const DAY = 86_400_000, now = Date.parse('2026-10-24T12:00:00Z')
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString()
const fail = (f: Partial<Failure> = {}): Failure => ({ kind: 'other', at: at(1), why: 'the run stopped without a result', tried: [], repeats: 0, systemChanged: false, ...f })
const draft = (d: Partial<NonNullable<CardFacts['draft']>> = {}) => ({ holding: false, preview: false, at: at(0), ...d })
const facts = (f: Partial<CardFacts> = {}): CardFacts => ({ state: 'needs_human', changes: 0, ...f })
const held = (...reasons: HeldReason[]): NonNullable<CardFacts['held']> => ({ digest: 'd1', who: 'Kim', reasons })
type Row = { id: string; what: string; facts: CardFacts; expect: { mode: string; primary?: string | null; secondary?: string[]; more?: string[]; editor?: string; warn?: string | null; warnIs?: string; waited?: string | null }; broken?: string[] }
// A failed document read as an item records it, through cardFacts (pure), so the cause mapping itself is checked (#40 handoff).
const docFailure = (why: string, tried: string[], kind = 'content') => cardFacts({ wf: { state: 'needs_human', status: `Couldn't finish: ${why}`, runFailed: { at: at(1), kind, why, tried, job: 'j9' }, updatedAt: at(1) } as any, card: {}, changes: 0 })
// A held item as the engine leaves it (#45), through cardFacts: its approved draft kept and its reasons.
const heldItem = (hold: Record<string, unknown>) => cardFacts({ wf: { state: 'needs_human', status: 'Your approved draft is kept. Send anyway or Redraft.', asker: { id: 'kim', name: 'Kim Lane' }, revAt: at(0), updatedAt: at(0), ...hold } as any, card: { draft: {} }, changes: 0 })

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
	// The owner's Send held by SEND's wf.reason (PE 14:28): Send anyway past exactly that reason, or Redraft / Skip.
	{ id: 'G45', what: 'held: Kim edited their message after the ok', facts: facts({ draft: draft(), held: held({ kind: 'ask-edited' }) }), expect: { mode: 'held', primary: 'send-anyway', secondary: ['redraft', 'later'], editor: 'reply', warn: 'Kim edited their message after you approved.' } },
	{ id: 'G46', what: 'held: Kim wrote again after the ok', facts: facts({ draft: draft(), held: held({ kind: 'asker-wrote-again' }) }), expect: { mode: 'held', primary: 'send-anyway', secondary: ['redraft', 'later'], warn: 'Kim wrote again after you approved.' } },
	{ id: 'G47', what: 'held: no reply looks needed', facts: facts({ draft: draft(), held: held({ kind: 'no-reply-needed', why: 'Kim said thanks, no question' }) }), expect: { mode: 'held', primary: 'send-anyway', secondary: ['dismiss', 'later'], warnIs: 'Delegate thinks no reply is needed now: Kim said thanks, no question.' } },
	// #40 handoff (SEND 14:50): a missing decoder is a fixed cause; no access or too large can't be helped by trying again.
	{ id: 'G49', what: 'A76 (#40): Office file only as encoded binary: fixed now, Try again leads', facts: docFailure('Available readers return only the opening of the spec', ['readSmallBinaryFile: the whole file as base64, no decoder']), expect: { mode: 'failed', primary: 'try-again', secondary: ['write-own', 'later'] } },
	{ id: 'G50', what: '#40: no access to the document', facts: docFailure("Couldn't open Robin's v7 spec: no access", []), expect: { mode: 'failed', primary: 'write-own', secondary: ['try-again', 'later'], more: ['dismiss'] } },
	{ id: 'G51', what: '#40: the document is over the size limit', facts: docFailure("Couldn't open the Acme deck: too large to open (over 25 MB)", []), expect: { mode: 'failed', primary: 'write-own', secondary: ['try-again', 'later'] } },
	// A CLI tool denial is not a document Delegate can't open: it keeps its own kind, so Try again leads (PE 0c follow-up).
	{ id: 'G58', what: 'a CLI tool denial (recorded as other) is not permanent: Try again leads', facts: docFailure('The run stopped: the CLI denied the tool (no access to shell)', ['shell: permission denied'], 'other'), expect: { mode: 'failed', primary: 'try-again', secondary: ['write-own', 'later'] } },
	// After a holding reply went (#41), the item is open on its question with no draft: the card asks for the answer.
	{ id: 'G59', what: 'after the holding reply went: answer mode', facts: cardFacts({ wf: { state: 'needs_human', question: 'Which Acme region ships first?', status: 'Holding reply sent. Kim is waiting for the full answer.', sent: { msgId: 'm9', at: at(1), holding: true }, updatedAt: at(1) } as any, card: { question: 'Which Acme region ships first?' }, changes: 0 }), expect: { mode: 'answer', primary: 'answer', editor: 'answer' } },
	// Open in a terminal (#43, PE 16:50): the hold beats any state; the page offers only Take it back (the engine refuses Dismiss while a window holds it).
	{ id: 'G60', what: 'a terminal hold beats a running state', facts: facts({ state: 'running', hold: { kind: 'window', text: 'Open in a terminal', machine: 'PC-1', since: at(1) } }), expect: { mode: 'in-terminal', primary: 'take-back', secondary: [], more: [], editor: 'none', warn: 'Open in a terminal on PC-1 since' } },
	{ id: 'G61', what: 'a terminal hold beats a draft (no "draft cannot be sent")', facts: facts({ draft: draft(), hold: { kind: 'window', text: 'Open in a terminal', machine: 'PC-1', since: at(1) } }), expect: { mode: 'in-terminal', primary: 'take-back', secondary: [] } },
	{ id: 'G62', what: 'a terminal hold beats a failure and a question; nothing that moves the item on', facts: facts({ question: { text: 'Which region?', reviewAgain: false }, failure: fail(), hold: { kind: 'window', text: 'Open in a terminal', machine: 'PC-1' } }), expect: { mode: 'in-terminal', primary: 'take-back', secondary: [], more: [], warn: 'Open in a terminal on PC-1 · Delegate waits' } },
	// Need to know (#36, PE 17:05 point 6): one "Why it waited" line per kind of hold, in the PM's words; the draft still sends on Send.
	...([
		['G63', { kind: 'guest', record: 'Incident 900001' }, 'Waiting for you: this chat has a guest or someone from outside your org, and the reply uses Incident 900001.'],
		['G64', { kind: 'restricted', record: 'Incident 900002', who: 'a restricted incident' }, 'Waiting for you: Incident 900002 is a restricted incident.'],
		['G65', { kind: 'conversation', chat: 'Globex war room', who: 'Dev' }, "Waiting for you: it uses Globex war room, and Dev isn't in it."],
		['G66', { kind: 'customer', record: 'Incident 900001' }, 'Waiting for you: it names the customer from Incident 900001.'],
		['G67', { kind: 'unread', record: 'Incident 900003' }, 'Waiting for you: it cites Incident 900003 without having read it.'],
		['G68', { kind: 'marked', chat: 'Acme leads', level: 'private' }, 'Waiting for you: it uses Acme leads, which you marked private.'],
		['G69', { kind: 'members', chat: 'Globex war room' }, "Waiting for you: it uses Globex war room, and I couldn't check who is in each chat."],
		['G70', { kind: 'reads' }, "Waiting for you: it searched your chats and I couldn't tell which ones it read."],
	] as const).map(([id, hold, line]) => ({ id, what: `need to know: ${hold.kind}`, facts: facts({ draft: draft(), shareHold: hold as any }), expect: { mode: 'reply', primary: 'approve', waited: line } })),
	// What ⋯ holds (PE step-4 review): Answer instead only where a question is open.
	{ id: 'G52', what: 'more: reply', facts: facts({ draft: draft() }), expect: { mode: 'reply', more: ['dismiss'] } },
	{ id: 'G53', what: 'more: holding', facts: facts({ draft: draft({ holding: true }) }), expect: { mode: 'holding', more: ['dismiss'] } },
	{ id: 'G54', what: 'more: reply-with-question', facts: facts({ question: { text: 'Also ping the release channel?', reviewAgain: false }, draft: draft() }), expect: { mode: 'reply-with-question', more: ['answer', 'dismiss'] } },
	{ id: 'G48', what: 'an edit cleared the hold: a plain Send', facts: facts({ draft: draft({ preview: true }) }), expect: { mode: 'reply', primary: 'approve', editor: 'reply' } },
	{ id: 'G55', what: 'held with a preview draft still leads with Send anyway (PE B2)', facts: facts({ draft: draft({ preview: true }), held: held({ kind: 'ask-edited' }) }), expect: { mode: 'held', primary: 'send-anyway', more: ['dismiss'] } },
	{ id: 'G56', what: 'more: held, wrote again', facts: facts({ draft: draft(), held: held({ kind: 'asker-wrote-again' }) }), expect: { mode: 'held', more: ['dismiss'] } },
	{ id: 'G57', what: 'more: held, no reply needed (Skip is in the bar)', facts: facts({ draft: draft(), held: held({ kind: 'no-reply-needed', why: 'thanks' }) }), expect: { mode: 'held', more: [] } },
	// #45 (PE 17:15): every reason in one line, newest first; Redraft leads on a real change (the engine's `changed` line).
	{ id: 'G71', what: 'held: a real change leads with Redraft and names it', facts: facts({ draft: draft(), held: held({ kind: 'asker-wrote-again', at: at(0), changed: 'Incident 900001 is Active again, so she asks for a new ETA.' }) }), expect: { mode: 'held', primary: 'redraft', secondary: ['send-anyway', 'later'], more: ['dismiss'], warnIs: 'Kim wrote again after you approved: Incident 900001 is Active again, so she asks for a new ETA.', waited: null } },
	{ id: 'G72', what: 'held: no reply needed alone leads with Send anyway', facts: facts({ draft: draft(), held: held({ kind: 'no-reply-needed', why: 'Kim only shared the incident list' }) }), expect: { mode: 'held', primary: 'send-anyway', secondary: ['dismiss', 'later'], more: [], warnIs: 'Delegate thinks no reply is needed now: Kim only shared the incident list.' } },
	{ id: 'G73', what: 'held: two reasons, one sentence each, the asker first; a real change still leads with Redraft, Skip stays', facts: facts({ draft: draft(), held: held({ kind: 'no-reply-needed', why: 'it is a daily digest' }, { kind: 'asker-wrote-again', at: at(0), changed: 'She now asks you to own Incident 900002.' }) }), expect: { mode: 'held', primary: 'redraft', secondary: ['send-anyway', 'dismiss', 'later'], more: [], warnIs: 'Kim wrote again after you approved: She now asks you to own Incident 900002. Delegate thinks no reply is needed now: it is a daily digest.', waited: null } },
	{ id: 'G74', what: 'held: three reasons, at most two sentences (newest ask, then no reply); the third is in Details', facts: facts({ draft: draft(), held: held({ kind: 'ask-edited', at: at(1) }, { kind: 'no-reply-needed', why: 'thanks' }, { kind: 'asker-wrote-again', at: at(0) }) }), expect: { mode: 'held', primary: 'send-anyway', secondary: ['redraft', 'dismiss', 'later'], warnIs: 'Kim wrote again after you approved. Delegate thinks no reply is needed now: thanks.', waited: 'Why it waited:\nKim wrote again after you approved.\nKim edited their message after you approved.\nDelegate thinks no reply is needed now: thanks.' } },
	// Through cardFacts: an item from before #45 (wf.reason only) reads through holdReasons; every new message is summarised (2c3e3d2d).
	{ id: 'G75', what: 'held: an old wf.reason-only item, through the accessor', facts: heldItem({ reason: { kind: 'asker-wrote-again', msgId: 'm2', text: 'Any news?', at: at(0), digest: 'r1' } }), expect: { mode: 'held', primary: 'send-anyway', secondary: ['redraft', 'later'], warn: 'Kim wrote again after you approved.' } },
	{ id: 'G76', what: 'held: an earlier "also, can you…?" then an unchanged digest is held, and both messages count', facts: heldItem({ reasons: [{ kind: 'asker-wrote-again', msgId: 'm3', msgIds: ['m2', 'm3'], messages: [{ id: 'm2', text: 'Also, can you send the rollback plan?', at: at(0.1) }, { id: 'm3', text: 'Daily incident list (10)', at: at(0) }], text: '', at: at(0), digest: 'r2', changed: 'She also asks you for the rollback plan.' }], holdDigest: 'h2' }), expect: { mode: 'held', primary: 'redraft', secondary: ['send-anyway', 'later'], warnIs: 'Kim wrote 2 more messages after you approved: She also asks you for the rollback plan.' } },
	{ id: 'G77', what: 'held through cardFacts: two engine reasons together, Redraft leads, Skip in the bar', facts: heldItem({ reasons: [{ kind: 'no-reply-needed', why: 'it is a daily digest', digest: 'r3' }, { kind: 'ask-edited', msgId: 'm1', before: 'Owners, update your incidents', text: 'Owners, update your incidents by noon', at: at(0), digest: 'r4', changed: 'She now wants it by noon.' }], holdDigest: 'h3' }), expect: { mode: 'held', primary: 'redraft', secondary: ['send-anyway', 'dismiss', 'later'], warnIs: 'Kim edited their message after you approved: She now wants it by noon. Delegate thinks no reply is needed now: it is a daily digest.' } },
	// The leak invariant: a real incident number in a change line is not a leaked id; a hash still is.
	{ id: 'G78', what: 'held: a 9-digit incident number in the change line is not a leak', facts: facts({ draft: draft(), held: held({ kind: 'ask-edited', at: at(0), changed: 'Incident 900000123 is Active again.' }) }), expect: { mode: 'held', primary: 'redraft', warn: 'Kim edited their message after you approved: Incident 900000123 is Active again.' } },
	{ id: 'G79', what: 'held: a hash in the change line is still a leak', facts: facts({ draft: draft(), held: held({ kind: 'ask-edited', at: at(0), changed: 'see 3fa9c0d2b7 for details' }) }), expect: { mode: 'held', primary: 'redraft' }, broken: ['the warning leaks an id or an error'] },
	// PM final 19:20/19:40: each sentence about 110 characters at most, cut with … at a word; Details: 'Why it waited:', one reason per line.
	// PE 19:16: an ask with a change line comes before a newer one without, so the line says why Redraft leads.
	{ id: 'G82', what: 'held: the ask with a change line leads even when an ask without one is newer', facts: facts({ draft: draft(), held: held({ kind: 'asker-wrote-again', at: at(0) }, { kind: 'ask-edited', at: at(1), changed: 'She now wants the risks by noon.' }) }), expect: { mode: 'held', primary: 'redraft', secondary: ['send-anyway', 'later'], warnIs: 'Kim edited their message after you approved: She now wants the risks by noon. Kim wrote again after you approved.', waited: null } },
	{ id: 'G80', what: 'held: a long change line is cut at about 110 characters and kept in full in Details', facts: facts({ draft: draft(), held: held({ kind: 'asker-wrote-again', at: at(0), count: 3, changed: 'She now asks you to own Incident 900002 and Incident 900003, post the rollback plan in the channel, and confirm the Friday date with Robin.' }) }), expect: { mode: 'held', primary: 'redraft', warnIs: 'Kim wrote 3 more messages after you approved: She now asks you to own Incident 900002 and Incident 900003…', waited: 'Why it waited:\nKim wrote 3 more messages after you approved: She now asks you to own Incident 900002 and Incident 900003, post the rollback plan in the channel, and confirm the Friday date with Robin.' } },
	{ id: 'G81', what: 'held: a long no-reply reason is cut too; the asker sentence stays whole', facts: facts({ draft: draft(), held: held({ kind: 'no-reply-needed', why: 'it is the daily status digest that the Events team posts every morning, and nothing in it asks you anything directly' }, { kind: 'asker-wrote-again', at: at(0), changed: 'She asks for a new ETA.' }) }), expect: { mode: 'held', primary: 'redraft', warnIs: 'Kim wrote again after you approved: She asks for a new ETA. Delegate thinks no reply is needed now: it is the daily status digest that the Events team posts every…', waited: 'Why it waited:\nKim wrote again after you approved: She asks for a new ETA.\nDelegate thinks no reply is needed now: it is the daily status digest that the Events team posts every morning, and nothing in it asks you anything directly.' } },
]

const t0 = performance.now()
let bad = 0
for (const r of rows) {
	const s = cardState(r.facts), broken = checkCard(r.facts, s), e = r.expect, why: string[] = []
	if (s.mode !== e.mode) why.push(`mode ${s.mode}, expected ${e.mode}`)
	if (e.primary !== undefined && (s.primary ?? null) !== e.primary) why.push(`primary ${s.primary ?? 'none'}, expected ${e.primary ?? 'none'}`)
	if (e.secondary && JSON.stringify(s.secondary) !== JSON.stringify(e.secondary)) why.push(`secondary ${s.secondary.join(',')}, expected ${e.secondary.join(',')}`)
	if (e.more && JSON.stringify(s.more) !== JSON.stringify(e.more)) why.push(`more ${s.more.join(',')}, expected ${e.more.join(',')}`)
	if (e.editor && s.editor !== e.editor) why.push(`editor ${s.editor}, expected ${e.editor}`)
	if (e.warn === null && s.warn) why.push(`warn "${s.warn}", expected none`)
	if (e.warnIs && s.warn !== e.warnIs) why.push(`warn "${s.warn ?? ''}", expected exactly "${e.warnIs}"`)
	if (e.waited === null && s.waited) why.push(`waited "${s.waited}", expected none`)
	if (e.waited && s.waited !== e.waited) why.push(`waited "${s.waited ?? ''}", expected "${e.waited}"`)
	if (e.warn && !s.warn?.startsWith(e.warn)) why.push(`warn "${s.warn ?? ''}", expected "${e.warn}…"`)
	if (JSON.stringify(broken) !== JSON.stringify(r.broken ?? [])) why.push(`invariants [${broken.join('; ')}], expected [${(r.broken ?? []).join('; ')}]`)
	if (why.length) { bad++; console.log(`FAIL ${r.id} ${r.what}: ${why.join(' · ')}`) }
}
// Every held sentence stays within about 110 characters (PM 19:20).
for (const r of rows.filter(r => r.facts.held)) {
	const long = (cardState(r.facts).warn ?? '').split(/(?<=[.…])\s+(?=[A-Z])/).find(s => s.length > 112)
	if (long) { bad++; console.log(`FAIL ${r.id} a held sentence is ${long.length} characters: ${long}`) }
}
// The digest a held card passes is the engine's holdDigest, or the one reason's digest for an item from before #45 (G75-G77).
for (const [id, want] of [['G75', 'r1'], ['G76', 'h2'], ['G77', 'h3']] as const) {
	const got = rows.find(r => r.id === id)!.facts.held?.digest
	if (got !== want) { bad++; console.log(`FAIL ${id} held digest ${got}, expected ${want}`) }
}
console.log(`card-golden: ${rows.length - bad}/${rows.length} pass in ${(performance.now() - t0).toFixed(1)} ms`)
process.exitCode = bad ? 1 : 0
