import { asksReviewAgain, isVote, prIdOf } from './effects.ts'
import type { Workflow } from './types.ts'

export const WORKFLOW_SCHEMA = 7
export const LEGACY_FALLBACK = /^(?:Check this item, then answer or skip it|Sign in, then answer or skip this item)$/
export const LEGACY_STOP = /^(?:Tried \d+ times; |Blocked: |Needs the asker: |Still not ready after \d+ hours; )/
export const LEGACY_VOTE_DROPPED = /^PR \d+ is \w+, so no vote is needed$/

export function statusFields(kind: NonNullable<Workflow['statusReason']>['kind'], text: string, at = new Date().toISOString()) {
	return { status: text, statusReason: { kind, text, at } }
}

export function stateFields(w: Pick<Workflow, 'state' | 'workingSince'> | undefined, state: Workflow['state'], at = new Date().toISOString()) {
	return { state, workingSince: state === 'running' || state === 'waiting_on_task' ? w?.state === state ? w.workingSince ?? at : at : undefined }
}

export function legacyStatusReason(status: string, at: string): Workflow['statusReason'] {
	const kind = /^Not sure it was sent/.test(status) ? 'not-sure-sent'
		: /^Not sent[: ]|^Held/.test(status) ? 'not-sent'
		: /^Could not start/.test(status) ? 'could-not-start'
		: LEGACY_STOP.test(status) || /^(?:The worker did not finish|The job did not finish:|Couldn't finish:|Not finished:)/.test(status) ? 'not-finished'
		: LEGACY_VOTE_DROPPED.test(status) ? 'refused'
		: /^Back from/.test(status) ? 'back-from-window' : undefined
	return kind ? { kind, text: status, at } : undefined
}

// Pure compatibility only. Context-dependent changes are committed by the runner's schema pass.
export function upgrade(w: Workflow): Workflow {
	w.schema ??= 1
	w.msgIds ??= [...w.pending]
	if (w.state === 'running' || w.state === 'waiting_on_task') w.workingSince ??= w.waitingSince ?? w.updatedAt
	else w.workingSince = undefined
	if (!w.kept && w.todos?.length && w.sent && (w.state === 'done' || w.state === 'open')) w.kept = [...new Set(w.todos)].map((text, i) => ({ id: `t${i + 1}`, text, at: w.sent!.at }))
	if (w.schema < 4) {
		w.statusReason ??= legacyStatusReason(w.status, w.updatedAt)
		const vote = w.effects?.find(e => isVote(e.call) && prIdOf(e.call) !== undefined && e.head)
		if (!w.reviewAgain && asksReviewAgain(w.code, w.question) && vote?.head) w.reviewAgain = { pr: prIdOf(vote.call)!, head: vote.head, at: w.revAt ?? w.updatedAt }
	}
	return w
}
