import type { Effect, Workflow } from './types.ts'
import { ACTION_CLAIMS, changeClaim, shown, type ActionClaimDescriptor } from './effects.ts'
import { pageChangeId, pageDigest, workflowApprovalRev } from './page-approval.ts'
import { clausesOf, sentencesOf } from './vote-claims.ts'

type Target = { kind: string; id: string }
export type ActionPromise = { capability: string; action: string; sentence: string; effectIds: string[] }
export type ActionClaimGap = ActionPromise & { why: string }
export const actionClaimConfirmation = (claim: ActionClaimGap) =>
	`Send anyway? Your reply says you'll ${claim.action}, but it isn't ticked, so Delegate won't do it.`
export const actionClaimReview = (workflow: Workflow, text: string, include: readonly string[]) =>
	pageDigest(['action-claim', workflowApprovalRev(workflow), text, [...include].sort()])

export const actionClaimContext = (workflow: Workflow, text: string, include: readonly string[]) =>
	pageDigest([workflow.id, workflow.chat.id, workflow.revAt, workflow.lastMsgId, workflow.lastAsk, workflow.msgIds,
		workflow.sent?.msgId, text, workflow.effects?.map(pageChangeId), [...include].sort()])

export function actionClaimApproved(workflow: Workflow, text: string): boolean {
	const consent = workflow.actionClaimOverride
	return !!consent && consent.digest === actionClaimContext(workflow, text, consent.include) &&
		(workflow.effects ?? []).filter(effect => !effect.done && !effect.off).every(effect => consent.include.includes(pageChangeId(effect)))
}
type Claim = { descriptor: ActionClaimDescriptor; sentence: string; clause: string; action: string; future: boolean; targets: Target[] }
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = (value: string) => new RegExp(`\\b${escape(value)}s?\\b`, 'i')
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const kindOf = (word: string) => /^(?:pr|pull request)$/i.test(word) ? 'pr' : /^(?:comment|thread|build|pipeline)$/i.test(word) ? word.toLowerCase() : 'work-item'

function targetsIn(clause: string): Target[] {
	return [...clause.matchAll(/\b(pull requests?|PRs?|work[ -]items?|incidents?|trackers?|tickets?|bugs?|tasks?|comments?|threads?|builds?|pipelines?)\s*#?\s*(\d+(?:\s*(?:,\s*(?:(?:and|or)\s+)?|(?:and|or|&)\s*)#?\s*\d+)*)/gi)]
		.flatMap(match => [...match[2].matchAll(/\d+/g)].map(id => ({ kind: kindOf(match[1].replace(/s$/i, '').replace('-', ' ')), id: id[0] })))
}

function claims(text: string): Claim[] {
	const normalized = text.replace(/\u2019/g, "'")
	return sentencesOf(text).flatMap(sentence => clausesOf(sentence, true).flatMap(clause => {
		const future = /^(?:I|we)(?:'ll| will)\s+(.*)$/i.exec(clause)
		const completed = /^(?:I|we)(?:'ve| have| had)?\s+(?:(?:just|already|now|also|successfully)\s+)*(.*)$/i.exec(clause)
		const action = future?.[1] ?? completed?.[1]
		if (!action || /\?\s*$/.test(clause) || /\b(?:not|never|nothing|neither|without)\b|n't\b/i.test(action)) return []
		const at = normalized.indexOf(sentence)
		const original = at < 0 ? sentence : text.slice(at, at + sentence.length)
		const descriptors = Object.values(ACTION_CLAIMS).filter(descriptor =>
			(future ? descriptor.promised : descriptor.completed).some(verb => new RegExp(`^${escape(verb)}\\b`, 'i').test(action)) &&
			descriptor.objects.some(noun => word(noun).test(action)))
		const positions = descriptors.map(descriptor => Math.min(...descriptor.objects.map(noun => word(noun).exec(action)?.index ?? Infinity)))
		const first = Math.min(...positions)
		return descriptors.filter((_, index) => positions[index] === first).map(descriptor => ({
				descriptor, sentence: original, clause, action: action.replace(/[.!;]$/, ''), future: !!future, targets: targetsIn(clause),
			}))
	}))
}

function effectTargets(effect: Effect): Target[] {
	const args = effect.call?.args ?? {}
	const fields: [string, string[]][] = [
		['pr', ['pullRequestId', 'pullRequestNumber', 'prId']],
		['work-item', ['workItemId', 'id']], ['comment', ['commentId']], ['thread', ['threadId']],
		['build', ['buildId']], ['pipeline', ['pipelineId']],
	]
	return fields.flatMap(([kind, keys]) => keys.flatMap(key =>
		typeof args[key] === 'number' || typeof args[key] === 'string' ? [{ kind, id: String(args[key]) }] : []))
}

function targetMatches(claim: Claim, effect: Effect, target?: Target): boolean {
	if (changeClaim(effect)?.capability !== claim.descriptor.capability) return false
	const refs = effectTargets(effect)
	if (!(target ? [target] : claim.targets).every(wanted => refs.some(ref => ref.kind === wanted.kind && ref.id === wanted.id))) return false
	const args = effect.call?.args ?? {}
	const emails = claim.clause.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []
	const attendees = [args.attendeeEmails, args.attendees].flatMap(value => Array.isArray(value) ? value : [])
	const names = attendees.flatMap(value => {
		if (typeof value === 'string') return [value]
		if (!object(value)) return []
		const email = object(value.emailAddress) ? value.emailAddress : value
		return [email.address, email.email, email.name].filter((part): part is string => typeof part === 'string')
	})
	if (emails.length && !emails.every(email => names.some(name => name.toLowerCase() === email.toLowerCase()))) return false
	const invited = /\b(?:invited|invite)\s+([\p{L}'-]+)/iu.exec(claim.clause)?.[1]
	if (invited && !/^(you|them|everyone)$/i.test(invited) && !names.some(name => word(invited).test(name))) return false
	return true
}

function matched(claim: Claim, effects: readonly Effect[], target?: Target): Effect[] {
	return effects.filter(effect => targetMatches(claim, effect, target))
}

export function attributePromise(text: string, effect: Effect, effects: readonly Effect[] = [effect]): string | undefined {
	for (const claim of claims(text)) {
		if (/\b(?:if|unless|once|after|when|until|before)\b/i.test(claim.clause) && claim.future) continue
		const candidates = matched(claim, effects)
		const ids = new Set(candidates.map(pageChangeId))
		if (ids.size === 1 && ids.has(pageChangeId(effect))) return claim.sentence
	}
	return undefined
}

export function replyPromises(text: string, effects: readonly Effect[] = []): ActionPromise[] {
	return claims(text).filter(claim => claim.future && !claim.descriptor.vote).map(claim => ({
		capability: claim.descriptor.capability, action: claim.descriptor.action, sentence: claim.sentence,
		effectIds: [...new Set(matched(claim, effects).map(pageChangeId))],
	}))
}

export function actionClaimGap(text: string, effects: readonly Effect[] = [], include: readonly string[] = []): ActionClaimGap | undefined {
	const included = new Set(include)
	for (const claim of claims(text).filter(claim => !claim.future && !claim.descriptor.vote)) {
		for (const target of claim.targets.length ? claim.targets : [undefined]) {
			const candidates = matched(claim, effects, target)
			const supported = candidates.length && candidates.every(effect => !effect.error && !effect.maybe &&
				(!!effect.done || !effect.off && included.has(pageChangeId(effect))))
			if (supported) continue
			return {
				capability: claim.descriptor.capability, action: candidates.length === 1 ? shown(candidates[0]).line : claim.descriptor.action,
				sentence: claim.sentence, effectIds: [...new Set(candidates.filter(effect => !effect.done).map(pageChangeId))],
				why: `Your reply says you ${claim.action}, but ${candidates.length ? "that's not ticked" : 'there is no matching change'}.`,
			}
		}
	}
	return undefined
}
