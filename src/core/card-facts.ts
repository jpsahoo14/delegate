// The facts a card is decided from, read from the item once (engineer-card-state-devspec.md §1). Nothing else reads raw item flags
// for the card: the projection passes what it already derived (the card view, the agent hold, the changes offered) and gets
// CardFacts back for cardState().
import type { CardFacts, Failure } from './card-state.ts'
import { currentFailure } from './card-state.ts'
import type { Job, Workflow } from './types.ts'

export type FactsInput = {
	wf: Workflow
	job?: Job
	// From view.ts card(): what the owner is shown.
	card: { question?: string; draft?: { holding?: boolean; preview?: boolean }; choices?: { multi?: boolean }; ownReply?: { at: string }; promise?: { failed?: string }; reviewAgain?: string }
	changes: number
	agentWait?: string
	replyCountsOnRefused?: boolean
	// How often the same cause failed before (from the log), when known.
	repeats?: number
}

// Causes that a later version fixed: a failure with one of these is worth trying again whatever its kind.
const FIXED = [/It needs the repo https?:/i]
const NOT_SENT = /^(?:Not sent: |Not sure it was sent[:.]?\s*|Could not start: )/

export function cardFacts(i: FactsInput): CardFacts {
	const { wf, job, card } = i
	const draftAt = wf.revAt ?? wf.updatedAt
	const fixed = (why: string) => FIXED.some(r => r.test(why))
	const own = (f: Omit<Failure, 'repeats' | 'systemChanged'>): Failure => ({ ...f, repeats: i.repeats ?? 0, systemChanged: fixed(f.why) })
	const waiting = wf.state === 'needs_human'
	const stopped = wf.state === 'waiting_on_task' && (!job || job.state === 'failed' || job.state === 'done')
	const failure = waiting || stopped ? currentFailure([
		wf.runFailed && waiting ? own({ kind: wf.runFailed.kind, at: wf.runFailed.at, why: wf.runFailed.why, tried: wf.runFailed.tried ?? [], job: wf.runFailed.job, review: !!wf.runFailed.job && wf.intent === 'pr_review' }) : undefined,
		job?.state === 'failed' && (waiting || stopped) ? own({ kind: 'other', at: job.updatedAt, why: job.error ?? 'the work stopped before it finished', tried: [], job: job.id }) : undefined,
		stopped && job?.state !== 'failed' ? own({ kind: 'stopped', at: wf.updatedAt, why: wf.status || 'the work stopped before it finished', tried: [] }) : undefined,
		// A run that fell short with nothing to send and no question left only its status (dispatch.ts "Not finished: ", A90).
		waiting && !wf.runFailed && !card.draft && card.question === undefined && /^Not finished: /.test(wf.status) ? own({ kind: 'content', at: wf.revAt ?? wf.updatedAt, why: wf.status.replace(/^Not finished: /, '').split(/(?<=[.!?])\s+/)[0], tried: [] }) : undefined,
	], card.draft ? draftAt : undefined) : undefined
	const notSent = waiting && !!card.draft && NOT_SENT.test(wf.status) ? { why: wf.status.replace(NOT_SENT, '').replace(/\s*\((?:Error|error)\b[^)]*\)/g, '').trim() } : undefined
	return {
		state: wf.state,
		...(card.draft ? { draft: { holding: !!card.draft.holding, preview: !!card.draft.preview, at: draftAt } } : {}),
		...(card.question !== undefined ? { question: { text: card.question, reviewAgain: !!card.reviewAgain } } : {}),
		...(card.choices ? { choices: { multi: !!card.choices.multi } } : {}),
		changes: i.changes,
		...(i.replyCountsOnRefused ? { replyCountsOnRefused: true } : {}),
		...(failure ? { failure } : {}),
		...(i.agentWait ? { hold: { kind: 'agent' as const, text: i.agentWait } } : {}),
		...(notSent ? { notSent } : {}),
		...(card.ownReply ? { ownReply: { at: card.ownReply.at } } : {}),
		...(waiting && wf.reviewDecline ? { declined: { pr: wf.reviewDecline.pr, addMe: i.changes > 0 } } : {}),
		...(card.promise?.failed ? { promiseFailed: card.promise.failed } : {}),
	}
}
