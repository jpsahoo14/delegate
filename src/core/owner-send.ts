import type { Workflow } from './types.ts'
import { pageChangeId, pageDigest } from './page-approval.ts'

export const reviewDigest = (wf: Workflow, messages: { id: string; text: string; at: string }[]) =>
	pageDigest([wf.draft, wf.effects?.map(e => [pageChangeId(e), e.summary, e.off, e.maybe]), messages])
export const reasonMessages = (reason: NonNullable<Workflow['reason']>) => reason.kind === 'no-reply-needed' ? [] : [{ id: reason.msgId, text: reason.text, at: reason.at }]

export function keepApprovedDraft(wf: Workflow, reason: string) {
	if (!wf.ownerSend || wf.sent && wf.sent.at >= wf.ownerSend.at) return
	wf.draft = { ...wf.ownerSend.draft }
	const messages: { id: string; text: string; at: string }[] = []
	wf.reason = { kind: 'no-reply-needed', why: reason, digest: reviewDigest(wf, messages) }
	Object.assign(wf, { state: 'needs_human', question: undefined, choices: undefined, sendAt: undefined, approved: undefined,
		closedBy: undefined, status: `Delegate thinks no reply is needed now: ${reason}. Your approved draft is kept. Send anyway or Skip.` })
}
