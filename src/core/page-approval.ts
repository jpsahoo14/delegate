import type { Answer, Automation, Config, Effect, Job, Proposal, Workflow } from './types.ts'
import { createHash } from 'node:crypto'
import { isVote, pendingEffects } from './effects.ts'
import { legacyEffectOrigins } from './normalize-report.ts'
import { approvedReplyText, currentDraft } from './policy.ts'
import { NAME } from '../brand.ts'
import { openLeft } from '../runner/left.ts'
import type { FoldedAction } from '../store/actions.ts'

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
	value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value
export const pageDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export const PAGE_REPLY_CHANGED = 'The reply changed since you approved it. It was not sent. Review the current reply.'
export const actionApprovalRev = (action: FoldedAction): string => pageDigest(action)
export const ACTION_UNDO_TOO_LATE = 'Too late to take it back'
export function actionUndoRefusal(action: FoldedAction, rev: string, now = Date.now()): string | undefined {
	if (!action.undo || !(now < Date.parse(action.undo.until)) || action.amendments.some(change => change.kind === 'undone')) return ACTION_UNDO_TOO_LATE
	if (rev !== actionApprovalRev(action)) return 'Changed since you looked. Nothing was deleted. Open the current action first.'
	return undefined
}

export const pageChangeId = (effect: Effect) => pageDigest([effect.call ?? effect.payload, effect.system, effect.action, effect.target, effect.head])
export const pageOptionId = (option: NonNullable<Workflow['choices']>['options'][number]) => pageDigest(option)
export const workflowApprovalRev = (workflow: Workflow): string => pageDigest({
	state: workflow.state, draft: workflow.draft, turn: workflow.revAt,
	conversation: [workflow.chat.id, workflow.chat.guests, workflow.lastMsgId, workflow.lastAsk, workflow.pending, workflow.msgIds, workflow.newCount],
	changes: pendingEffects(workflow.effects).map(effect => ({ id: pageChangeId(effect), meaning: [effect.pr, effect.ring, effect.build, effect.deploy], summary: effect.summary, maybe: effect.maybe, origin: effect.origin, reason: effect.reason, askQuote: effect.askQuote, group: effect.group })),
	choices: workflow.choices && { ...workflow.choices, options: workflow.choices.options.map(pageOptionId) },
	question: workflow.question, reason: workflow.reason, reasons: workflow.reasons, holdDigest: workflow.holdDigest, statusReason: workflow.statusReason, meeting: workflow.meeting, sent: workflow.sent?.msgId,
	voteClaim: workflow.statusReason?.kind === 'vote-claim' ? workflow.voteClaim?.digest : undefined,
	fyi: workflow.fyi, watchedAs: workflow.watchedAs,
	promises: workflow.todos,
	todos: workflow.kept?.filter(todo => !todo.done).map(todo => [todo.id, todo.text, todo.at]),
	work: workflow.work && { goal: workflow.work.goal, next: workflow.work.next, proposed: workflow.work.proposed },
})
export const automationApprovalRev = (automation: Automation): string => pageDigest({
	state: automation.state, endedFrom: automation.endedFrom, to: automation.to, text: automation.text, texts: automation.texts, rotation: automation.rotation,
	schedule: automation.schedule, until: automation.until, maxSends: automation.maxSends, stopOnReply: automation.stopOnReply,
})
export const proposalApprovalRev = (proposal: Proposal): string => pageDigest({ state: proposal.state, title: proposal.title, ops: proposal.ops })
export const leftRev = (workflow: Workflow): string => pageDigest(
	openLeft(workflow).map(({ id, cleared }) => ({ id, cleared })).sort((a, b) => a.id.localeCompare(b.id)),
)

export type EffectConsent = { ok: false; reason: string } | { ok: true; include?: string[]; vote?: string; notice?: string }

export function effectConsent(workflow: Workflow, answer: Answer): EffectConsent {
	const legacy = legacyEffectOrigins(workflow)
	const refused = (reason: string): EffectConsent => ({ ok: false, reason: `${reason} Nothing was sent or changed.` })
	if (answer.vote !== undefined) {
		if (legacy) return refused('Open the current page to approve a vote.')
		if (!answer.page) return refused('Approve a vote on the page, not in a chat command.')
	}
	if (answer.include === undefined && legacy) return { ok: true }
	if (answer.except !== undefined || answer.nums?.length) return refused('This version needs an explicit change selection. Use the current page.')
	const pending = pendingEffects(workflow.effects)
	let include: string[]
	if (answer.page) {
		if (answer.page.expect !== workflowApprovalRev(workflow)) return refused('Changed since you looked. Open the new version first.')
		if (!Array.isArray(answer.include) || answer.include.some(id => typeof id !== 'string' || !id)) return refused('Choose the changes on the current page first.')
		include = answer.include
	} else {
		if (answer.include !== undefined) return refused('Select extra changes on the page, not in a chat command.')
		include = pending.filter(effect => effect.origin && ['asked', 'promised', 'note', 'rule'].includes(effect.origin) && !effect.group && !isVote(effect.call)).map(pageChangeId)
	}
	if (new Set(include).size !== include.length) return refused('The change selection contains duplicate ids.')
	const selected: Effect[] = []
	for (const id of include) {
		const matches = pending.filter(effect => pageChangeId(effect) === id)
		if (matches.length !== 1) return refused('A selected change is stale or ambiguous. Open the current page.')
		if (isVote(matches[0].call)) return refused('Votes use the separate Approve action, never a change selection.')
		selected.push(matches[0])
	}
	for (const effect of selected) {
		const group = effect.group
		if (!group) continue
		const groups = pending.flatMap(candidate => candidate.group?.id === group.id ? [candidate.group] : [])
		if (!group.id || groups.some(member => !Number.isInteger(member.min) || member.min < 1) ||
			selected.filter(candidate => candidate.group?.id === group.id).length < Math.max(...groups.map(member => member.min))) {
			return refused('Choose enough options for the selected change first.')
		}
	}
	if (answer.vote !== undefined) {
		const matches = pending.filter(effect => pageChangeId(effect) === answer.vote)
		if (matches.length !== 1 || !isVote(matches[0].call) || include.includes(answer.vote))
			return refused('The vote selection is stale or ambiguous. Open the current page.')
	}
	const suggestions = !answer.page ? pending.filter(effect => effect.origin === 'suggested').length : 0
	return { ok: true, include, ...(answer.vote !== undefined ? { vote: answer.vote } : {}), ...(suggestions ? { notice: `${suggestions} suggestions not included: tick them on ${NAME}'s page.` } : {}) }
}

export function pageAnswerRefusal(answer: Answer, workflow?: Workflow, automation?: Automation, proposal?: Proposal, cfg?: Config, managementRev?: string, job?: Job): string | undefined {
	const guard = answer.page
	if (!guard) return answer.verb === 'undo-action' ? 'Invalid action approval. Nothing was deleted. Open the current action first.' : undefined
	if (answer.verb === 'undo-action' || guard.kind === 'undo-action') {
		if (answer.verb !== 'undo-action' || guard.kind !== 'undo-action' ||
			!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(answer.text ?? '') || !/^[a-f0-9]{64}$/.test(guard.expect))
			return 'Invalid action approval. Nothing was deleted. Open the current action first.'
		// The runner checks the exact folded record again immediately before deletion.
		return undefined
	}
	if (guard.kind === 'manage') return managementRev === guard.expect ? undefined : 'Changed since you looked. Nothing was sent or changed. Open the new version first.'
	if (guard.kind === 'send-reply' && workflow?.state === 'done') return 'Already sent. Nothing else was sent. Open the current item before posting a correction.'
	if (guard.kind === 'send-reply' && (!workflow || !currentDraft(workflow, job)?.text)) return 'The latest turn proposes no reply. Nothing was sent. Open the current item.'
	if (answer.verb === 'left-ask-again' || answer.verb === 'left-draft-invite') {
		if (!workflow || !openLeft(workflow).some(line => line.id === answer.text) || guard.expect !== leftRev(workflow)) return 'These to-dos changed. Nothing was changed. Open the current list.'
		return undefined
	}
	if (guard.kind === 'mark-todos') {
		if (!workflow || guard.expect !== leftRev(workflow) || !guard.todoIds?.length || guard.todoIds.some(id =>
			!workflow.kept?.some(todo => todo.id === id && !todo.done) && !openLeft(workflow).some(line => line.id === id))) return 'These to-dos changed. Nothing was marked. Open the current list.'
		return undefined
	}
	if (answer.verb === 'close' && workflow && (workflow.kept?.some(todo => !todo.done) || openLeft(workflow).length)) return 'These to-dos changed. Nothing was marked. Open the current list.'
	if (guard.kind === 'undo-send' && (!workflow?.sent || workflow.sent.msgId !== guard.sentMessageId)) return 'That reply is no longer the current sent reply. Nothing was deleted.'
	if (guard.kind === 'feedback-send' && (!workflow?.sent || workflow.sent.msgId !== guard.sentMessageId)) return 'That reply changed. Nothing was sent, deleted or redrafted. Open its current activity first.'
	const current = workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
	if (current !== guard.expect) return 'Changed since you looked. Nothing was sent or changed. Open the new version first.'
	if (guard.replyDigest && (!cfg || !workflow?.draft || pageDigest(approvedReplyText(workflow.draft.text, workflow, cfg)) !== guard.replyDigest)) return 'The reply signature changed since you looked. Nothing was sent or changed. Open the new version first.'
	if (workflow && (answer.verb === 'ok' || answer.verb === 'send')) {
		const consent = effectConsent(workflow, answer)
		if (!consent.ok) return consent.reason
	}
	return undefined
}
