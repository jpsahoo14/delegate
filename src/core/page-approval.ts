import type { Answer, Automation, Effect, Proposal, Workflow } from './types.ts'
import { createHash } from 'node:crypto'
import { pendingEffects } from './effects.ts'

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
	value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value
export const pageDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

export const pageChangeId = (effect: Effect) => pageDigest([effect.call ?? effect.payload, effect.system, effect.action, effect.target, effect.head])
export const pageOptionId = (option: NonNullable<Workflow['choices']>['options'][number]) => pageDigest(option)
export const workflowApprovalRev = (workflow: Workflow): string => pageDigest({
	state: workflow.state, draft: workflow.draft,
	conversation: [workflow.chat.id, workflow.chat.guests, workflow.lastMsgId, workflow.lastAsk, workflow.pending, workflow.msgIds, workflow.newCount],
	changes: pendingEffects(workflow.effects).map(effect => ({ id: pageChangeId(effect), meaning: [effect.pr, effect.ring, effect.build, effect.deploy], summary: effect.summary, maybe: effect.maybe })),
	choices: workflow.choices && { ...workflow.choices, options: workflow.choices.options.map(pageOptionId) },
	question: workflow.question, meeting: workflow.meeting, sent: workflow.sent?.msgId,
	todos: workflow.kept?.filter(todo => !todo.done).map(todo => [todo.id, todo.text, todo.at]),
	work: workflow.work && { goal: workflow.work.goal, next: workflow.work.next, proposed: workflow.work.proposed },
})
export const automationApprovalRev = (automation: Automation): string => pageDigest({
	state: automation.state, to: automation.to, text: automation.text, texts: automation.texts, rotation: automation.rotation,
	schedule: automation.schedule, until: automation.until, maxSends: automation.maxSends, stopOnReply: automation.stopOnReply,
})
export const proposalApprovalRev = (proposal: Proposal): string => pageDigest({ state: proposal.state, title: proposal.title, ops: proposal.ops })

export function pageAnswerRefusal(answer: Answer, workflow?: Workflow, automation?: Automation, proposal?: Proposal): string | undefined {
	const guard = answer.page
	if (!guard) return undefined
	if (guard.kind === 'send-reply' && workflow?.state === 'done') return 'Already sent. Nothing else was sent. Open the current item before posting a correction.'
	if (guard.kind === 'mark-todos') {
		if (!workflow || !guard.todoIds?.length || guard.todoIds.some(id => !workflow.kept?.some(todo => todo.id === id && !todo.done))) return 'These to-dos changed. Nothing was closed. Open the current checklist.'
		return undefined
	}
	if (guard.kind === 'undo-send' && (!workflow?.sent || workflow.sent.msgId !== guard.sentMessageId)) return 'That reply is no longer the current sent reply. Nothing was deleted.'
	const current = workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
	return current !== guard.expect ? 'Changed since you looked. Nothing was sent or changed. Open the new version first.' : undefined
}
