import { createHash } from 'node:crypto'
import type { Call } from './types.ts'
import type { SettingKey } from './setting-keys.ts'

export type LeftKind = 'other-pr' | 'setting-off' | 'pr-lifecycle' | 'incomplete' | 'old-invite' | 'deploy' | 'other'
export type LeftQuote = { quote: string; quoteBy: 'asker' | 'owner' | 'delegate' }
export type LeftAction = {
	key: string
	verb: 'reply' | 'comment' | 'vote' | 'merge' | 'complete' | 'abandon' | 'delete' | 'reviewer' | 'deploy' | 'invite' | 'change' | 'promise'
	pr?: number
	target?: string
} & (LeftQuote | { quote?: undefined; quoteBy?: undefined })
type LeftDetails = {
	action: LeftAction
	why?: string
	setting?: SettingKey
	reply?: { text: string; href: string }
	pr?: { id: number; href: string }
}
export type LeftDraft = LeftDetails & (
	| { type: 'promise'; kind?: never }
	| { type: 'refusal'; kind: LeftKind }
)
export type LeftRefusal = Extract<LeftDraft, { type: 'refusal' }>
export type LeftSource = {
	kind: 'pr-comment' | 'chat-ask' | 'your-reply' | 'review'
	who?: string
	at: string
	pr?: number
	href?: string
}
export type LeftLine = LeftDraft & {
	id: string
	source: LeftSource
	at: string
	cleared?: {
		at: string
		by: 'owner' | 'engine'
		why: 'ticked' | 'allowed-now' | 'superseded' | 'item-closed' | 'seen-done'
		seen?: { pr: number; how: 'replied' | 'closed'; at: string }
	}
}

export function leftRefusal(action: LeftAction, kind: LeftKind, details: Omit<LeftDetails, 'action'> = {}): LeftRefusal {
	return { ...details, type: 'refusal', action: displayedLeftAction(action), kind }
}

export function leftPromise(quote: string): LeftDraft {
	return { type: 'promise', action: { verb: 'promise', key: normalized(quote), ...leftQuote(quote, 'owner') } }
}

export function leftQuote(quote: string, quoteBy: LeftQuote['quoteBy']): LeftQuote {
	const points = Array.from(quote)
	if (points.length <= 200) return { quote, quoteBy }
	const prefix = points.slice(0, 199).join('')
	const clipped = /\s/u.test(points[199]) ? prefix.trimEnd() : prefix.replace(/\S+$/u, '').trimEnd()
	return { quote: `${clipped}…`, quoteBy }
}

export function displayedLeftAction(action: LeftAction): LeftAction {
	if (action.quote === undefined) return action
	const quote = action.verb === 'comment' && action.quoteBy === 'delegate' ? action.quote.split(/\r?\n/, 1)[0] : action.quote
	return { ...action, ...leftQuote(quote, action.quoteBy) }
}

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()
export function leftActionKey(call: Call | undefined, summary: string): string {
	if (!call) return normalized(summary)
	// Only transport correlation ids are volatile; PR, thread, build and pipeline run ids identify the action.
	const args = Object.fromEntries(Object.entries(call.args).filter(([key]) => !/^(?:requestId|clientRequestId|correlationId|traceId)$/i.test(key)))
	const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
		value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)])) : value
	return createHash('sha256').update(JSON.stringify([call.tool, canonical(args)])).digest('hex')
}

export function leftActionText(action: LeftAction): string {
	if (action.verb === 'promise') return action.quote ?? 'Keep the promise'
	const verb: Record<Exclude<LeftAction['verb'], 'promise'>, string> = {
		reply: 'Send the reply', comment: 'Post the comment', vote: 'Cast the vote',
		merge: 'Merge', complete: 'Complete', abandon: 'Abandon', delete: 'Delete',
		reviewer: 'Change reviewers', deploy: 'Deploy', invite: 'Send the invite', change: 'Make the change',
	}
	const pr = action.pr ? `${['merge', 'complete', 'abandon', 'delete'].includes(action.verb) ? '' : 'on '}PR ${action.pr}` : ''
	return [verb[action.verb], pr, action.target].filter(Boolean).join(' ')
}

export function leftText(draft: LeftDraft): string {
	if (draft.type === 'promise') return leftActionText(draft.action)
	const action = leftActionText(draft.action).replace(/[.\s]+$/, '')
	return `${action}. Not made for you: ${draft.why ?? 'Delegate cannot make this change from here.'}`
}
