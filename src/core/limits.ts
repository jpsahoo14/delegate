import { CAPABILITIES } from './capabilities.ts'
import { scrub } from './secrets.ts'

export const MAX_AUTO_PER_CHAT_HOUR = 3

let invalidCapLogged = false
export function hourlyCap(configured: unknown = MAX_AUTO_PER_CHAT_HOUR): number {
	if (typeof configured !== 'number' || !Number.isFinite(configured) || configured < 0) {
		if (!invalidCapLogged) {
			console.warn('invalid-hourly-cap: automatic sends are held at 0; fix the hourly limit in Settings.')
			invalidCapLogged = true
		}
		return 0
	}
	return Math.min(MAX_AUTO_PER_CHAT_HOUR, Math.floor(configured))
}
export function checkHourlyCap(configured: unknown): number {
	if (typeof configured !== 'number' || !Number.isInteger(configured) || configured < 0 || configured > MAX_AUTO_PER_CHAT_HOUR)
		throw new Error(`The automatic hourly limit must be a whole number from 0 to ${MAX_AUTO_PER_CHAT_HOUR}.`)
	return configured
}

// A10 owns this order and copy; Settings renders the catalog, not a second list.
export const LIMITS = [
	{ id: 'paused', page: "Nothing goes out while you've paused or stopped Delegate." },
	{ id: 'never', page: 'Never writes to people on your never list.' },
	{ id: 'vote', page: 'Never votes or approves.' },
	{ id: 'vote-claim', page: "Never says something was done when it wasn't (for example, that a PR was approved)." },
	{ id: 'sharing', page: "Never shares what someone here shouldn't see, and never sends anything by itself into a chat with guests or to people outside your company." },
	{ id: 'hourly-cap', page: 'Sends at most <cap> messages an hour by itself.' },
	{ id: 'reply-gap', page: 'Never sends a reply with a gap or a placeholder in it.' },
	{ id: 'secrets', page: 'Removes secrets from anything it sends or posts.' },
	{ id: 'capability', page: 'Never completes, merges, abandons or deletes; never changes reviewers or branches; never deploys or releases anything.' },
] as const

export type LimitId = typeof LIMITS[number]['id']
export type AuthorizationInput = {
	automatic: boolean; text?: string
	paused?: boolean; never?: boolean; vote?: boolean; voteClaim?: boolean
	sharing?: boolean; guests?: boolean; outside?: boolean
	autoSendsThisHour?: number; maxPerHour?: unknown; gap?: boolean; capabilityAllowed?: boolean
}
export type Authorization = { allowed: true; text?: string } | { allowed: false; blockedBy: LimitId; reason: string }

// Only code-derived facts reach the limits; no grant can configure a bypass.
export function authorize(input: AuthorizationInput & { automatic: false }): { allowed: true; text?: string }
export function authorize(input: AuthorizationInput): Authorization
export function authorize(input: AuthorizationInput): Authorization {
	const text = input.text === undefined ? undefined : scrub(input.text)
	if (!input.automatic) return { allowed: true, text }
	const blocked = input.paused ? 'paused'
		: input.never ? 'never'
		: input.vote ? 'vote'
		: input.voteClaim ? 'vote-claim'
		: input.sharing || input.guests !== false || input.outside ? 'sharing'
		: (input.autoSendsThisHour ?? 0) >= hourlyCap(input.maxPerHour) ? 'hourly-cap'
		: input.gap ? 'reply-gap'
		: input.capabilityAllowed === false ? 'capability' : undefined
	if (!blocked) return { allowed: true, text }
	const reason = productLimits(input.maxPerHour).find(limit => limit.id === blocked)!.page
	return { allowed: false, blockedBy: blocked, reason }
}
export const productLimits = (configured: unknown = MAX_AUTO_PER_CHAT_HOUR) =>
	LIMITS.map(limit => ({ id: limit.id, page: limit.page.replace('<cap>', String(hourlyCap(configured))) }))

for (const name of Object.keys(CAPABILITIES)) {
	if (/complete|merge|abandon|delete|reviewers?|branches|deploy|release/i.test(name))
		throw new Error(`The ${name} capability violates the product limits`)
}
