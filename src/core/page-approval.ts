import type { Answer, Automation, Config, Effect, Job, Proposal, Workflow } from './types.ts'
import { createHash } from 'node:crypto'
import { pendingEffects } from './effects.ts'
import { approvedReplyText, currentDraft } from './policy.ts'

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
	value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value
export const pageDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export const PAGE_REPLY_CHANGED = 'The reply changed since you approved it. It was not sent. Review the current reply.'

export const pageChangeId = (effect: Effect) => pageDigest([effect.call ?? effect.payload, effect.system, effect.action, effect.target, effect.head])
export const pageOptionId = (option: NonNullable<Workflow['choices']>['options'][number]) => pageDigest(option)
export const workflowApprovalRev = (workflow: Workflow): string => pageDigest({
	state: workflow.state, draft: workflow.draft, turn: workflow.revAt,
	conversation: [workflow.chat.id, workflow.chat.guests, workflow.lastMsgId, workflow.lastAsk, workflow.pending, workflow.msgIds, workflow.newCount],
	changes: pendingEffects(workflow.effects).map(effect => ({ id: pageChangeId(effect), meaning: [effect.pr, effect.ring, effect.build, effect.deploy], summary: effect.summary, maybe: effect.maybe })),
	choices: workflow.choices && { ...workflow.choices, options: workflow.choices.options.map(pageOptionId) },
	question: workflow.question, reason: workflow.reason, meeting: workflow.meeting, sent: workflow.sent?.msgId,
	fyi: workflow.fyi, watchedAs: workflow.watchedAs,
	promises: workflow.todos,
	todos: workflow.kept?.filter(todo => !todo.done).map(todo => [todo.id, todo.text, todo.at]),
	work: workflow.work && { goal: workflow.work.goal, next: workflow.work.next, proposed: workflow.work.proposed },
})
export const automationApprovalRev = (automation: Automation): string => pageDigest({
	state: automation.state, to: automation.to, text: automation.text, texts: automation.texts, rotation: automation.rotation,
	schedule: automation.schedule, until: automation.until, maxSends: automation.maxSends, stopOnReply: automation.stopOnReply,
})
export const proposalApprovalRev = (proposal: Proposal): string => pageDigest({ state: proposal.state, title: proposal.title, ops: proposal.ops })

export function pageAnswerRefusal(answer: Answer, workflow?: Workflow, automation?: Automation, proposal?: Proposal, cfg?: Config, managementRev?: string, job?: Job): string | undefined {
	const guard = answer.page
	if (!guard) return undefined
	if (guard.kind === 'manage') return managementRev === guard.expect ? undefined : 'Changed since you looked. Nothing was sent or changed. Open the new version first.'
	if (guard.kind === 'send-reply' && workflow?.state === 'done') return 'Already sent. Nothing else was sent. Open the current item before posting a correction.'
	if (guard.kind === 'send-reply' && (!workflow || !currentDraft(workflow, job)?.text)) return 'The latest turn proposes no reply. Nothing was sent. Open the current item.'
	if (guard.kind === 'mark-todos') {
		if (!workflow || !guard.todoIds?.length || guard.todoIds.some(id => !workflow.kept?.some(todo => todo.id === id && !todo.done))) return 'These to-dos changed. Nothing was marked. Open the current list.'
		return undefined
	}
	if (answer.verb === 'close' && workflow?.kept?.some(todo => !todo.done)) return 'These to-dos changed. Nothing was marked. Open the current list.'
	if (guard.kind === 'undo-send' && (!workflow?.sent || workflow.sent.msgId !== guard.sentMessageId)) return 'That reply is no longer the current sent reply. Nothing was deleted.'
	if (guard.kind === 'feedback-send' && (!workflow?.sent || workflow.sent.msgId !== guard.sentMessageId)) return 'That reply changed. Nothing was sent, deleted or redrafted. Open its current activity first.'
	const current = workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
	if (current !== guard.expect) return 'Changed since you looked. Nothing was sent or changed. Open the new version first.'
	if (guard.replyDigest && (!cfg || !workflow?.draft || pageDigest(approvedReplyText(workflow.draft.text, workflow, cfg)) !== guard.replyDigest)) return 'The reply signature changed since you looked. Nothing was sent or changed. Open the new version first.'
	return undefined
}
