// The facts a card is decided from, read from the item once (engineer-card-state-devspec.md §1). Nothing else reads raw item flags
// for the card: the projection passes what it already derived (the card view, the agent hold, the changes offered) and gets
// CardFacts back for cardState().
import type { CardFacts, Failure, FailureCause, JobStop } from './card-state.ts'
import { currentFailure } from './card-state.ts'
import type { Fact, Job, Workflow } from './types.ts'
import { holdReasons, voteHold } from './owner-send.ts'
import { normalizeReport } from './normalize-report.ts'
import { isVote, prIdOf, sameHead, voteValue } from './effects.ts'
import { reviewedUnits, type UnitReviewDone } from './review.ts'

// D-A239 frame-new (PE §8, 2026-10-25T20:20:09Z; SEND 5974137d, HOST 4c26c6c4): a PR review's state is its PR unit's frame, read
// through SEND's reviewedUnits; there is no last-job-wins scalar. An item HOST's migration has given units reads only those; an item
// without units (a closed item from before the migration, which HOST leaves as it was) still reads its old scalars, unchanged.
// head is that PR's own live read (the unit's read, else the runner's read of that same PR); again is HOST's moved-head mark.
export type ItemReview = { pr: number; done: UnitReviewDone; basis?: { head: string; at: string }; again?: { at: string }; head?: string }
const readHead = (wf: Workflow, pr: number) => { try { const read: unknown = wf.prRead ? JSON.parse(wf.prRead) : undefined; return Array.isArray(read) && read[0] === pr && typeof read[2] === 'string' ? read[2] : undefined } catch { return undefined } }
export function itemReviews(wf: Workflow): ItemReview[] {
	if (wf.prs) return reviewedUnits(wf).map(unit => ({ pr: unit.id, done: unit.review!.done!, ...(unit.review!.basis ? { basis: unit.review!.basis } : {}),
		...(unit.again ? { again: { at: unit.again.at } } : {}), ...((head => (head ? { head } : {}))(unit.read === 'ok' && unit.head ? unit.head : readHead(wf, unit.id))) }))
	if (!wf.reviewDone) return []
	const { pr, ...done } = wf.reviewDone
	return [{ pr, done, ...(wf.reviewBasis?.pr === pr ? { basis: { head: wf.reviewBasis.head, at: wf.reviewBasis.at } } : {}),
		...(wf.reviewAgain?.pr === pr ? { again: { at: wf.reviewAgain.at } } : {}), ...((head => (head ? { head } : {}))(readHead(wf, pr))) }]
}
// HOST's moved-head mark (CR B1): on an item with units only the units' own again marks; the retained scalar is read only by an item
// HOST left without units.
export const reviewMoved = (wf: Workflow): boolean => wf.prs ? wf.prs.some(unit => !!unit.again) : !!wf.reviewAgain
// The item-level review card reads one reviewed unit: with one PR, that PR (behaviour as before); with several, the newest review,
// until New-A239-1's per-PR blocks (MP1/MP2) show each unit.
export const itemReview = (wf: Workflow): ItemReview | undefined => itemReviews(wf).toSorted((a, b) => b.done.reviewedAt.localeCompare(a.done.reviewedAt))[0]
// One reviewed PR's Approve: its proposed approve vote, while that PR's read shows the reviewed head (A R20); a moved head (HOST's again
// mark, or the read itself) makes it Review again. The card's review and each per-PR block (D-A239 MP2) read the same rule.
export function reviewApproval(wf: Workflow, review: ItemReview): { approvable: boolean; moved?: { at?: string } } {
	const { done, basis, head } = review
	const vote = (wf.effects ?? []).some(e => !e.done && !e.off && isVote(e.call) && (voteValue(e.call) ?? 0) >= 5 && !e.error && prIdOf(e.call) === review.pr)
	const reviewed = !!basis && sameHead(basis.head, done.head)
	const moved = review.again ? { at: review.again.at } : head && !sameHead(head, done.head) ? {} : undefined
	return { approvable: !moved && vote && reviewed && !!head && sameHead(head, basis!.head), ...(moved ? { moved } : {}) }
}

export type FactsInput = {
	wf: Workflow
	job?: Job
	// From view.ts card(): what the owner is shown.
	card: { question?: string; draft?: { holding?: boolean; preview?: boolean; commitment?: boolean }; choices?: { multi?: boolean }; ownReply?: { at: string }; promise?: { failed?: string }; reviewAgain?: string }
	changes: number
	agentWait?: string
	// Open in a terminal on this machine name since then (wf.openOn and its open record, #43).
	window?: { machine: string; since?: string }
	replyCountsOnRefused?: boolean
	// How often the same cause failed before (from the log), when known.
	repeats?: number
	// Open kept to-dos the card lists (#44(2)).
	todos?: number
	// Other warnings the card shows, already worded (L4): report facts that warn, and what a proposed change warns about.
	warns?: string[]
	// L1b: SEND's voteClaimGap on the draft before any Send (the projection reads it; core never imports the runner), and whether the
	// review recommended a vote that isn't proposed yet.
	voteGap?: { pr?: number; why: string }
	voteRecommended?: boolean
	// D-COST New-COST-1: the item's one stopped job, worded from its typed fields (the projection reads the job and the thread).
	stop?: JobStop
}
// D-COST New-COST-1 (PE engineer-d-cost §8.3): the declared HOST-COST-1/-2 job shapes New builds against, until HOST's reviewed types
// carry them on Job. New never writes them.
export type JobStopped = { kind: 'capability' | 'budget'; need?: string; at: string; limit?: { runs?: number; tokens?: number } }
export type JobSpent = { runs: number; tokensIn: number; tokensOut: number; creditsNano?: number; unknownRuns: number; since: string }
export const jobStopOf = (job?: Job): { stopped?: JobStopped; spent?: JobSpent } => (job ?? {}) as { stopped?: JobStopped; spent?: JobSpent }

// Causes that a later version fixed: a failure with one of these is worth trying again whatever its kind.
// After #40 an Office document is read server-side, so a failure for want of a decoder no longer happens (SEND handoff 14:50).
const FIXED = [/It needs the repo https?:/i, /no decoder|encoded binary|base64/i]
// A document doc_read can't open whatever it tries (#40, PE doc-read item 5) is a content failure: Write leads, Try again follows.
const PERMANENT = /^Couldn't open .*?: (?:no access|too large to open|too much content to open|not a Word, PowerPoint or Excel file)/i
const NOT_SENT = /^(?:Not sent: |Not sure it was sent[:.]?\s*|Could not start: )/
// Step 6 (PE A1 18:55, 00:40): HOST's statusReason decides when it is there; only the display prefix of its text is dropped for the
// card's own words. Without one (an older item, or a writer that still sets the status alone) the text regexes read the status.
const SENT_PREFIX = /^(?:Not sent(?: automatically)?: |Not sure it was sent[:;.]?\s*|Could not start(?: the AI run)?[^:]*: |Held: )/
const FINISH_PREFIX = /^(?:Not finished|Couldn't finish|The job did not finish|.{1,40} couldn't draft this):\s*/

// A run that stopped on a change Delegate won't make is not a failure to retry, but the card still says why it stopped, in the reader's
// plain words, as a content failure (Write the reply yourself leads; Try again won't help).
const failureOf = (n: ReturnType<typeof normalizeReport>) => n.failure ?? (n.refused[0] ? { kind: 'content' as const, why: n.refused[0].reason, tried: [] } : undefined)
// PE A R31: SEND's structured cause on a ReportFailure (a refusal-made failure has none).
const causeOf = (f: ReturnType<typeof failureOf>): { cause?: FailureCause } => f && 'cause' in f && f.cause ? { cause: f.cause } : {}

// #48b (PM A R21): a redraft runs on his answer (apply.ts sets ownerAnswer and "Redrafting with your answer"; a vote-claim redraft is
// the engine's, not his answer); a retry is Try again after a failure ("Trying again") or a job queued again to retry.
function workingKind(wf: Workflow, job?: Job): 'redraft' | 'retry' | undefined {
	// "Trying again" first (PE 03:38 nit): a run that died before dispatch cleared ownerAnswer must not make Try again read as a redraft.
	if (/^Trying again\b/.test(wf.status)) return 'retry'
	if (wf.state === 'running' && wf.ownerAnswer && !/^Redraft the reply without claiming/.test(wf.ownerAnswer)) return 'redraft'
	return job?.retry ? 'retry' : undefined
}

export function cardFacts(i: FactsInput): CardFacts {
	const { wf, job, card } = i
	const draftAt = wf.revAt ?? wf.updatedAt
	const fixed = (why: string) => FIXED.some(r => r.test(why))
	const own = (f: Omit<Failure, 'repeats' | 'systemChanged'>): Failure => ({ ...f, repeats: i.repeats ?? 0, systemChanged: fixed([f.why, ...f.tried].join(' ')), ...(PERMANENT.test(f.why) ? { kind: 'content' as const } : {}) })
	const waiting = wf.state === 'needs_human'
	// Step 6, fixed after PE 00:40: HOST's structured field decides when it is there, else the status text, at every schema (some
	// writers still set the status alone). A reason counts only while its text is the current status (statusFields writes both).
	const reason = wf.statusReason?.text === wf.status ? wf.statusReason : undefined
	const finishedShort = reason?.kind === 'not-finished' || /^Not finished: /.test(wf.status)
	const finishedWhy = (reason?.kind === 'not-finished' ? reason.text.replace(FINISH_PREFIX, '') : wf.status.replace(/^Not finished: /, '')).split(/(?<=[.!?])\s+/)[0]
	const stopped = wf.state === 'waiting_on_task' && (!job || job.state === 'failed' || job.state === 'done')
	const failure = waiting || stopped ? currentFailure([
		// Each stored failure is read through the one canonical reader (card-state step 5, SEND's normalizeReport) before the newest one
		// is chosen: plain words, no ids or tool names, and a refusal is never a failure.
		(f => wf.runFailed && waiting && f ? own({ kind: f.kind, at: wf.runFailed.at, why: f.why, tried: f.tried, job: wf.runFailed.job, review: !!wf.runFailed.job && wf.intent === 'pr_review', ...causeOf(f) }) : undefined)(wf.runFailed && waiting ? failureOf(normalizeReport({ runFailed: wf.runFailed })) : undefined),
		(f => job?.state === 'failed' && f ? own({ kind: f.kind === 'content' ? 'content' : 'other', at: job.updatedAt, why: f.why, tried: f.tried, job: job.id, ...causeOf(f) }) : undefined)(job?.state === 'failed' && (waiting || stopped) ? failureOf(normalizeReport({ state: 'failed', error: job.error ?? 'the work stopped before it finished', updatedAt: job.updatedAt })) : undefined),
		stopped && job?.state !== 'failed' ? own({ kind: 'stopped', at: wf.updatedAt, why: wf.status || 'the work stopped before it finished', tried: [] }) : undefined,
		// A run that fell short with nothing to send and no question left only its status (statusReason 'not-finished'; dispatch.ts
		// "Not finished: " on an older item, A90).
		waiting && !wf.runFailed && !card.draft && card.question === undefined && finishedShort && finishedWhy ? own({ kind: 'content', at: reason?.at ?? wf.revAt ?? wf.updatedAt, why: finishedWhy, tried: [] }) : undefined,
	], card.draft ? draftAt : undefined) : undefined
	// The engine held the owner's Send (SEND #45): every current reason, structured, so it outranks any status prose. An item from
	// before #45 has only wf.reason, read through the same accessor.
	const reasons = waiting && card.draft ? holdReasons(wf) : []
	const held = reasons.length ? { digest: wf.holdDigest ?? reasons[0].digest, who: wf.asker?.name?.split(/\s+/)[0] || 'They', reasons: reasons.map(r => r.kind === 'no-reply-needed' ? { kind: r.kind, why: r.why }
		: { kind: r.kind, at: r.at, ...(r.changed ? { changed: r.changed } : {}), ...(r.kind === 'asker-wrote-again' && (r.msgIds?.length ?? 0) > 1 ? { count: r.msgIds!.length } : {}) }) } : undefined
	const notSentText = reason && ['not-sent', 'not-sure-sent', 'could-not-start'].includes(reason.kind) ? reason.text.replace(SENT_PREFIX, '')
		: NOT_SENT.test(wf.status) ? wf.status.replace(NOT_SENT, '') : undefined
	const notSent = !held && !voteHold(wf) && waiting && !!card.draft && notSentText !== undefined ? { why: notSentText.replace(/\s*\((?:Error|error)\b[^)]*\)/g, '').trim() } : undefined
	// L1b: a vote claim the engine held (statusReason 'vote-claim' with wf.voteClaim, SEND's contract: the text is the PM's sentence),
	// else the gap SEND's check finds in the draft before any Send.
	const claim = waiting && card.draft ? voteHold(wf) : undefined
	const voteGap = claim && wf.statusReason?.text ? { text: wf.statusReason.text, held: true, override: !claim.automatic && claim.canOverride !== false, addVote: !!i.voteRecommended }
		: waiting && card.draft && i.voteGap ? { text: i.voteGap.why, held: false, override: true, addVote: !!i.voteRecommended } : undefined
	// Delegate is working on it (#48): from the item's state now, never from what the page remembers clicking; since when, from HOST's
	// workingSince (step 6), else the older waitingSince.
	const working = wf.state === 'running' || wf.state === 'waiting_on_task' && (job?.state === 'queued' || job?.state === 'running')
		? { what: wf.status, ...((s => (s ? { since: s } : {}))(wf.workingSince ?? wf.waitingSince ?? wf.updatedAt)), ...((k => (k ? { kind: k } : {}))(workingKind(wf, job))) } : undefined
	// R10b (SEND cbe95960): a review posted under his rule (or verified clean) and the reply is no longer a draft. Approve PR <n> is his
	// proposed approve vote, and only while the runner's PR read [id, status, head, vote] shows the reviewed head (A R20); a moved head
	// (HOST's reviewAgain, or the read itself) makes it Review again.
	// D-A239 frame-new: the reviewed unit's frame (itemReview), never the scalars of a migrated item; its vote is that PR's vote.
	const review = itemReview(wf), done = review?.done
	const reviewDone = waiting && !card.draft && review && done && (done.posted.length > 0 || done.clean)
		? { high: done.counts.high, ...reviewApproval(wf, review), waiting: (wf.effects ?? []).filter(e => !e.done && !e.off && !isVote(e.call)).length } : undefined
	return {
		state: wf.state,
		...(waiting && i.stop ? { stop: i.stop } : {}),
		// CR COST1 B2 (PM 04:09:57, Designer JBΔ): a stopped job nobody waits on has no editor, so an incidental draft isn't the card's.
		...(card.draft && !(waiting && i.stop && !i.stop.asker) ? { draft: { holding: !!card.draft.holding, preview: !!card.draft.preview, at: draftAt } } : {}),
		// Review again (step 6): HOST's reviewAgain {pr, head, at} when there is one, else the view's command text (a writer without a head).
		...(card.question !== undefined ? { question: { text: card.question, reviewAgain: reviewMoved(wf) || !!card.reviewAgain } } : {}),
		// P0-10 (A R27): with no question, HOST's reviewAgain alone makes the card lead with Review again (a review-done card keeps its own).
		...(waiting && card.question === undefined && (reviewMoved(wf) || !!card.reviewAgain) ? { reviewAgain: true } : {}),
		...(card.choices ? { choices: { multi: !!card.choices.multi } } : {}),
		changes: i.changes,
		...(i.replyCountsOnRefused ? { replyCountsOnRefused: true } : {}),
		...(failure ? { failure } : {}),
		...(i.window ? { hold: { kind: 'window' as const, text: 'Open in a terminal', machine: i.window.machine, ...(i.window.since ? { since: i.window.since } : {}) } } : i.agentWait ? { hold: { kind: 'agent' as const, text: i.agentWait } } : {}),
		...(notSent ? { notSent } : {}),
		...(working ? { working } : {}),
		...(held ? { held } : {}),
		...(card.ownReply ? { ownReply: { at: card.ownReply.at } } : {}),
		...(waiting && wf.reviewDecline ? { declined: { pr: wf.reviewDecline.pr, addMe: i.changes > 0 } } : {}),
		...(card.promise?.failed ? { promiseFailed: card.promise.failed } : {}),
		...(i.todos ? { todos: i.todos } : {}),
		...(waiting && card.draft && wf.shareHold ? { shareHold: wf.shareHold } : {}),
		// L4: the promise is the draft's first promise to-do: not a change Delegate couldn't make, not a clone it left for him.
		...(card.draft?.commitment ? { commitment: (p => (p ? { promise: p } : {}))(wf.todos?.find(t => !/Not made for you:/.test(t) && !/^Clone \S+ on \S+ \(git clone /.test(t))) } : {}),
		...(card.draft && wf.newCount > 0 ? { newMessages: { who: wf.asker?.name?.split(/\s+/)[0] || 'They', n: wf.newCount } } : {}),
		...(i.warns?.length ? { warns: i.warns } : {}),
		...(voteGap ? { voteGap } : {}),
		// Back from his terminal window (step 6): a status line only, until his next action or a new draft clears it.
		...(waiting && wf.returnedFrom ? { returned: { machine: wf.returnedFrom.machine, at: wf.returnedFrom.at, report: wf.returnedFrom.report } } : {}),
		...(reviewDone ? { reviewDone } : {}),
	}
}

// The card's facts from the report, through the same reader (card-state step 5): no CI, vote or reviewer status, no tool plumbing,
// review findings as info (the "Not reviewing" gate keeps its warning), and no ids or tool names in the words. A refusal is not a
// fact. "Need to know" (#36) is the card's own warning, not a report fact, so it is kept as it is.
export function cardContext(wf: Workflow, job: Job | undefined, context: Fact[] = []): Fact[] {
	const own = context.filter(fact => fact.label === 'Need to know')
	const report = normalizeReport({ context: context.filter(fact => fact.label !== 'Need to know'), intent: wf.intent, ...(job?.key ? { key: job.key } : {}), ...(job?.every ? { every: job.every } : {}) })
	return [...own, ...report.context]
}