import { automationApprovalRev, pageDigest } from '../core/page-approval.ts'
import { pendingEffects } from '../core/effects.ts'
import type { Store } from './state.ts'
import type { Job, Workflow } from '../core/types.ts'

export const workflowManagementRev = (workflow: Workflow, job?: Job): string => pageDigest({
	id: workflow.id, kind: workflow.kind, state: workflow.state,
	chat: workflow.chat, asker: workflow.asker, askers: workflow.askers, status: workflow.status,
	lastAsk: workflow.lastAsk, question: workflow.question, draft: workflow.draft,
	choices: workflow.choices, context: workflow.context, meeting: workflow.meeting,
	fyi: workflow.fyi, todos: workflow.todos,
	kept: workflow.kept?.filter(todo => !todo.done),
	changes: pendingEffects(workflow.effects),
	work: workflow.work && {
		goal: workflow.work.goal, doneWhen: workflow.work.doneWhen, next: workflow.work.next,
		waitingOn: workflow.work.waitingOn, steps: workflow.work.steps, links: workflow.work.links,
		closed: workflow.work.closed, proposed: workflow.work.proposed,
		plan: workflow.work.plan?.map(step => ({ id: step.id, what: step.what, who: step.who, done: step.done, in: step.in, ring: step.ring })),
	},
	follow: workflow.follow, watchBy: workflow.watchBy, watchedAs: workflow.watchedAs,
	changedAt: workflow.changedAt, ackAt: workflow.ackAt,
	watch: job && { id: job.id, every: job.every, until: job.until, endsAt: job.endsAt },
})

export function pageManagementRev(store: Store, code: string): string | undefined {
	if (!code) return pageDigest(store.control())
	const workflow = store.byCode(code)
	if (workflow) {
		const jobId = workflow.work?.watch ?? workflow.job
		const job = jobId ? store.job(jobId) : undefined
		return workflowManagementRev(workflow, job)
	}
	const automation = store.automation(code)
	if (automation) return pageDigest([automationApprovalRev(automation), automation.why])
	const entity = store.proposal(code) ?? store.habit(code) ?? store.waiting().find(waiting => waiting.code === code)
	return entity ? pageDigest(entity) : undefined
}
