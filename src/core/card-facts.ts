// The facts a card is decided from, read from the item once (engineer-card-state-devspec.md §1). Nothing else reads raw item flags
// for the card: the projection passes what it already derived (the card view, the agent hold, the changes offered) and gets
// CardFacts back for cardState().
import type { CardFacts, Failure } from './card-state.ts'
import { currentFailure } from './card-state.ts'
import type { Fact, Job, Workflow } from './types.ts'
import { holdReasons, voteHold } from './owner-send.ts'
import { normalizeReport } from './normalize-report.ts'

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
}

// Causes that a later version fixed: a failure with one of these is worth trying again whatever its kind.
// After #40 an Office document is read server-side, so a failure for want of a decoder no longer happens (SEND handoff 14:50).
const FIXED = [/It needs the repo https?:/i, /no decoder|encoded binary|base64/i]
// A document doc_read can't open whatever it tries (#40, PE doc-read item 5) is a content failure: Write leads, Try again follows.
const PERMANENT = /^Couldn't open .*?: (?:no access|too large to open|too much content to open|not a Word, PowerPoint or Excel file)/i
const NOT_SENT = /^(?:Not sent: |Not sure it was sent[:.]?\s*|Could not start: )/

// A run that stopped on a change Delegate won't make is not a failure to retry, but the card still says why it stopped, in the reader's
// plain words, as a content failure (Write the reply yourself leads; Try again won't help).
const failureOf = (n: ReturnType<typeof normalizeReport>) => n.failure ?? (n.refused[0] ? { kind: 'content' as const, why: n.refused[0].reason, tried: [] } : undefined)

export function cardFacts(i: FactsInput): CardFacts {
	const { wf, job, card } = i
	const draftAt = wf.revAt ?? wf.updatedAt
	const fixed = (why: string) => FIXED.some(r => r.test(why))
	const own = (f: Omit<Failure, 'repeats' | 'systemChanged'>): Failure => ({ ...f, repeats: i.repeats ?? 0, systemChanged: fixed([f.why, ...f.tried].join(' ')), ...(PERMANENT.test(f.why) ? { kind: 'content' as const } : {}) })
	const waiting = wf.state === 'needs_human'
	const stopped = wf.state === 'waiting_on_task' && (!job || job.state === 'failed' || job.state === 'done')
	const failure = waiting || stopped ? currentFailure([
		// Each stored failure is read through the one canonical reader (card-state step 5, SEND's normalizeReport) before the newest one
		// is chosen: plain words, no ids or tool names, and a refusal is never a failure.
		(f => wf.runFailed && waiting && f ? own({ kind: f.kind, at: wf.runFailed.at, why: f.why, tried: f.tried, job: wf.runFailed.job, review: !!wf.runFailed.job && wf.intent === 'pr_review' }) : undefined)(wf.runFailed && waiting ? failureOf(normalizeReport({ runFailed: wf.runFailed })) : undefined),
		(f => job?.state === 'failed' && f ? own({ kind: f.kind === 'content' ? 'content' : 'other', at: job.updatedAt, why: f.why, tried: f.tried, job: job.id }) : undefined)(job?.state === 'failed' && (waiting || stopped) ? failureOf(normalizeReport({ state: 'failed', error: job.error ?? 'the work stopped before it finished', updatedAt: job.updatedAt })) : undefined),
		stopped && job?.state !== 'failed' ? own({ kind: 'stopped', at: wf.updatedAt, why: wf.status || 'the work stopped before it finished', tried: [] }) : undefined,
		// A run that fell short with nothing to send and no question left only its status (dispatch.ts "Not finished: ", A90).
		waiting && !wf.runFailed && !card.draft && card.question === undefined && /^Not finished: /.test(wf.status) ? own({ kind: 'content', at: wf.revAt ?? wf.updatedAt, why: wf.status.replace(/^Not finished: /, '').split(/(?<=[.!?])\s+/)[0], tried: [] }) : undefined,
	], card.draft ? draftAt : undefined) : undefined
	// The engine held the owner's Send (SEND #45): every current reason, structured, so it outranks any status prose. An item from
	// before #45 has only wf.reason, read through the same accessor.
	const reasons = waiting && card.draft ? holdReasons(wf) : []
	const held = reasons.length ? { digest: wf.holdDigest ?? reasons[0].digest, who: wf.asker?.name?.split(/\s+/)[0] || 'They', reasons: reasons.map(r => r.kind === 'no-reply-needed' ? { kind: r.kind, why: r.why }
		: { kind: r.kind, at: r.at, ...(r.changed ? { changed: r.changed } : {}), ...(r.kind === 'asker-wrote-again' && (r.msgIds?.length ?? 0) > 1 ? { count: r.msgIds!.length } : {}) }) } : undefined
	const notSent = !held && !voteHold(wf) && waiting && !!card.draft && NOT_SENT.test(wf.status) ? { why: wf.status.replace(NOT_SENT, '').replace(/\s*\((?:Error|error)\b[^)]*\)/g, '').trim() } : undefined
	// L1b: a vote claim the engine held (statusReason 'vote-claim' with wf.voteClaim, SEND's contract: the text is the PM's sentence),
	// else the gap SEND's check finds in the draft before any Send.
	const claim = waiting && card.draft ? voteHold(wf) : undefined
	const voteGap = claim && wf.statusReason?.text ? { text: wf.statusReason.text, held: true, override: !claim.automatic && claim.canOverride !== false, addVote: !!i.voteRecommended }
		: waiting && card.draft && i.voteGap ? { text: i.voteGap.why, held: false, override: true, addVote: !!i.voteRecommended } : undefined
	// Delegate is working on it (#48): from the item's state now, never from what the page remembers clicking.
	const working = wf.state === 'running' || wf.state === 'waiting_on_task' && (job?.state === 'queued' || job?.state === 'running')
		? { what: wf.status, ...(wf.waitingSince ?? wf.updatedAt ? { since: wf.waitingSince ?? wf.updatedAt } : {}) } : undefined
	return {
		state: wf.state,
		...(card.draft ? { draft: { holding: !!card.draft.holding, preview: !!card.draft.preview, at: draftAt } } : {}),
		...(card.question !== undefined ? { question: { text: card.question, reviewAgain: !!card.reviewAgain } } : {}),
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