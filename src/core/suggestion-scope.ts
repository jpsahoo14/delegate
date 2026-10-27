import type { Effect, Person, Workflow } from './types.ts'
import type { ToolInfo } from './tool-class.ts'
import { linksIn } from './pr-refs.ts'

export type SuggestionScope = {
	pr?: number
	workItems: string[]
	incidents: string[]
	chat: string
	askers: Person[]
	item: string
}
const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const targetKey = (value: string): string => {
	const text = normalized(value)
	const link = /\/(?:pullrequest|_workitems\/edit)\/(\d+)\b/.exec(text)
	if (link) return `${text.includes('/pullrequest/') ? 'pr' : 'workitem'}:${Number(link[1])}`
	const pr = /^pr:[^/]+\/(?:.*\/)?(\d+)$/.exec(text)
	if (pr) return `pr:${Number(pr[1])}`
	const entity = /^(pr|pull request|work ?item|bug|task|incident)\s*[:# ]\s*(\d+)$/.exec(text)
	return entity ? `${/^(pr|pull request)$/.test(entity[1]) ? 'pr' : entity[1] === 'incident' ? 'incident' : 'workitem'}:${Number(entity[2])}` : text
}
export function suggestionScope(wf: Workflow, pr?: number): SuggestionScope {
	const links = [...linksIn(wf.lastAsk ?? ''), ...[...(wf.lastAsk ?? '').matchAll(/https?:\/\/[^\s<>]+/g)].map(match => targetKey(match[0])),
		...(wf.key.type === 'workItem' || wf.key.type === 'incident' ? [`${wf.key.type}:${wf.key.id}`] : [])]
	const ids = (kind: string) => [...new Set(links.map(targetKey).filter(key => key.startsWith(`${kind}:`)).map(key => key.slice(kind.length + 1)))]
	return { ...(pr ? { pr } : {}), workItems: ids('workitem'), incidents: ids('incident'), chat: wf.chat.id,
		askers: [wf.asker, ...(wf.askers ?? [])].filter((person): person is Person => person !== undefined), item: wf.id }
}
export function scopeHasTool(scope: SuggestionScope, tool: string, info: ToolInfo): boolean {
	const properties = info.inputSchema?.properties ?? {}
	if (/pull_request|pullrequest/i.test(tool)) return scope.pr !== undefined
	if (/work_item|workitem/i.test(tool)) return scope.workItems.length > 0
	if (/incident/i.test(tool) || Object.hasOwn(properties, 'incidentId')) return scope.incidents.length > 0
	if (/CreateEvent$/i.test(tool)) return scope.askers.length > 0
	return ['chatId', 'threadId'].some(key => Object.hasOwn(properties, key)) && !!scope.chat ||
		['userId', 'userIdOrUpn'].some(key => Object.hasOwn(properties, key)) && scope.askers.length > 0
}
export function suggestionOnTarget(effect: Effect, scope: SuggestionScope): boolean {
	const key = targetKey(effect.target), args = effect.call?.args ?? {}, tool = effect.call?.tool ?? ''
	if (/pull_request|pullrequest/i.test(tool))
		return scope.pr !== undefined && key === `pr:${scope.pr}` && Number(args.pullRequestId) === scope.pr
	if (/work_item|workitem/i.test(tool)) {
		const id = String(args.workItemId ?? args.id ?? '')
		return scope.workItems.includes(id) && key === `workitem:${id}`
	}
	if (/incident/i.test(tool) || args.incidentId !== undefined) {
		const id = String(args.incidentId ?? args.id ?? '')
		return scope.incidents.includes(id) && key === `incident:${id}`
	}
	const askerIds = scope.askers.map(person => normalized(person.id))
	const asker = scope.askers.some(person => key === normalized(person.id) || key === normalized(person.name))
	if (/CreateEvent$/i.test(tool)) {
		const recipients = Array.isArray(args.attendeeEmails) ? args.attendeeEmails
			: typeof args.attendeeEmails === 'string' ? args.attendeeEmails.split(/[;,]/) : []
		return asker && recipients.length > 0 && recipients.every(value => typeof value === 'string' && askerIds.includes(normalized(value)))
	}
	if (args.chatId !== undefined || args.threadId !== undefined)
		return key === normalized(scope.chat) && [args.chatId, args.threadId].filter(value => value !== undefined).every(value => value === scope.chat)
	if (args.userId !== undefined || args.userIdOrUpn !== undefined)
		return asker && [args.userId, args.userIdOrUpn].filter(value => value !== undefined)
			.every(value => typeof value === 'string' && askerIds.includes(normalized(value)))
	if (effect.system === 'delegate') {
		if (effect.action === 'check-back') return key === normalized(scope.item) || key === normalized(scope.chat)
		const payload = effect.payload
		if (effect.action !== 'watch' || !payload || typeof payload !== 'object' || !('target' in payload) || typeof payload.target !== 'string') return false
		const targets = [...(scope.pr ? [`pr:${scope.pr}`] : []), ...scope.workItems.map(id => `workitem:${id}`), ...scope.incidents.map(id => `incident:${id}`)]
		return targets.includes(key) && targetKey(payload.target) === key
	}
	return false
}
