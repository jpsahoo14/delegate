import type { Workflow } from './types.ts'
import { pageChangeId, pageDigest } from './page-approval.ts'

export const reviewDigest = (wf: Workflow, messages: { id: string; text: string; at: string }[]) =>
	pageDigest([wf.draft, wf.effects?.map(e => [pageChangeId(e), e.summary, e.off, e.maybe]), messages])
export const reasonMessages = (reason: NonNullable<Workflow['reason']>) => reason.kind === 'no-reply-needed' ? [] :
	reason.kind === 'asker-wrote-again' && reason.messages ? reason.messages : [{ id: reason.msgId, text: reason.text, at: reason.at }]
export type Reason = NonNullable<Workflow['reason']>
export const holdReasons = (wf: Workflow): Reason[] => wf.reasons ?? (wf.reason ? [wf.reason] : [])
export const holdDigest = (reasons: Reason[]) => pageDigest(reasons.map(r => r.digest).sort())
export function setHoldReasons(wf: Workflow, reasons: Reason[]) {
	wf.reasons = reasons.length ? reasons : undefined
	wf.reason = reasons[0]
	wf.holdDigest = reasons.length ? holdDigest(reasons) : undefined
}
export function restampReasons(wf: Workflow) {
	setHoldReasons(wf, holdReasons(wf).map(reason => ({ ...reason, digest: reviewDigest(wf, reasonMessages(reason)) })))
}
export function reviewedReasons(wf: Workflow, reviewed?: string): string[] {
	const reasons = holdReasons(wf)
	return reviewed && (reviewed === holdDigest(reasons) || reasons.length === 1 && reviewed === reasons[0].digest) ?
		reasons.filter(reason => reviewDigest(wf, reasonMessages(reason)) === reason.digest).map(reason => reason.digest) : []
}
export function clearHold(wf: Workflow) { setHoldReasons(wf, []); wf.holdCheckPending = undefined }

export function keepApprovedDraft(wf: Workflow, reason: string) {
	if (!wf.ownerSend || wf.sent && !wf.sent.holding && wf.sent.at >= wf.ownerSend.at) return
	wf.draft = { ...wf.ownerSend.draft }
	const messages: { id: string; text: string; at: string }[] = []
	setHoldReasons(wf, [...holdReasons(wf).filter(r => r.kind !== 'no-reply-needed'), { kind: 'no-reply-needed', why: reason, digest: reviewDigest(wf, messages) }])
	wf.holdCheckPending = true
	Object.assign(wf, { state: 'needs_human', question: undefined, choices: undefined, sendAt: undefined, approved: undefined,
		closedBy: undefined, status: `Delegate thinks no reply is needed now: ${reason}. Your approved draft is kept. Send anyway or Skip.` })
}
