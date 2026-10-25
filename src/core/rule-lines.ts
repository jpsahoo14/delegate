import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CAPABILITY_VERSION, readBack, RuleSchema } from './capabilities.ts'
import { LIMITS } from './limits.ts'
import type { LimitId } from './limits.ts'
import type { Rule } from './types.ts'

export const RuleCompileSchema = z.object({
	grants: z.array(RuleSchema),
	notYet: z.array(z.object({ clause: z.string().min(1), missing: z.string().min(1) })).default([]),
	limited: z.array(z.object({ clause: z.string().min(1), limit: z.enum(LIMITS.map(limit => limit.id)) })).default([]),
	question: z.string().min(1).optional(),
	setting: z.object({ row: z.string().min(1) }).optional(),
}).superRefine((output, ctx) => {
	if (output.setting && (output.grants.length || output.question))
		ctx.addIssue({ code: 'custom', message: 'A Settings redirect cannot also grant an action or ask a question.' })
})
export type RuleCompile = {
	grants: Rule[]
	notYet: { clause: string; missing: string }[]
	limited: { clause: string; limit: LimitId }[]
	question?: string
	setting?: { row: string }
}
export type RuleLine = {
	id: string; text: string; source: 'owner' | 'settings' | 'learned'; off?: true
	compile?: RuleCompile; catalogVersion?: number
	confirmedAt?: string; confirmedHash?: string; confirmedCatalogVersion?: number
	grantIds?: string[]
	unbound?: true
	carried?: true
	learned?: Rule['learned']; style?: string
}

export const ruleTextHash = (text: string) => createHash('sha256').update(text).digest('hex')
export const widening = (rule: Rule) => !rule.style && ['send', 'ack', 'ignore', 'review'].includes(rule.then)
export const grantConfirmed = (rule: Rule) => !widening(rule) || !rule.when.results && rule.catalogVersion === undefined ||
	!!rule.confirmedAt && rule.confirmedHash === ruleTextHash(rule.text) && (!rule.when.results || (rule.catalogVersion ?? 0) >= 3)
export const lineConfirmed = (line: RuleLine) => !line.unbound && !!line.confirmedAt && line.confirmedHash === ruleTextHash(line.text) &&
	line.confirmedCatalogVersion === line.catalogVersion
export const lineNeedsCompile = (line: RuleLine) => !line.compile ||
	line.catalogVersion !== CAPABILITY_VERSION && !!line.compile.notYet.length
const withoutConfirmation = (line: RuleLine): RuleLine => ({
	...line, confirmedAt: undefined, confirmedHash: undefined, confirmedCatalogVersion: undefined,
})

export function compileRuleLine(line: RuleLine, raw: unknown, trusted: Rule[] = []): RuleLine {
	const output = RuleCompileSchema.parse(raw)
	const grants = output.grants.map((grant, i): Rule => {
		const old = trusted[i]
		const style = line.style ?? old?.style, learned = line.learned ?? old?.learned
		return { ...grant, id: old?.id ?? line.grantIds?.[i] ?? `${line.id}-g${i + 1}`, text: line.text,
			off: old?.off,
			who: grant.who.accounts?.length ? { accounts: grant.who.accounts } : grant.who,
			...(style && grant.then === 'draft' ? { style } : {}), ...(learned ? { learned } : {}) }
	})
	const notYet = [...output.notYet], limited = [...output.limited]
	for (const grant of grants) {
		if (grant.who.group === 'team')
			notYet.push({ clause: line.text, missing: 'Verified team membership is not available yet' })
		if (widening(grant) && grant.who.group === 'outside')
			limited.push({ clause: line.text, limit: 'sharing' })
	}
	if (!grants.length && !notYet.length && !limited.length && !output.question && !output.setting)
		notYet.push({ clause: line.text, missing: 'This line has no supported action yet' })
	const next: RuleLine = { ...line, compile: { ...output, grants, notYet, limited }, catalogVersion: CAPABILITY_VERSION,
		grantIds: [...new Set([...(line.grantIds ?? []), ...grants.map(grant => grant.id)])] }
	// The same words can acquire new permissions when they are read again.
	if (JSON.stringify(line.compile) === JSON.stringify(next.compile))
		return lineConfirmed(line) ? { ...next, confirmedCatalogVersion: next.catalogVersion } : next
	return withoutConfirmation(next)
}
export function editRuleLine(line: RuleLine, text: string): RuleLine {
	text = text.replace(/\r\n/g, '\n')
	if (!text.trim()) throw new Error('Write a line before saving it.')
	return text === line.text ? line : withoutConfirmation({
		...line, text, compile: undefined, catalogVersion: undefined, unbound: undefined,
		grantIds: [...new Set([...(line.grantIds ?? []), ...(line.compile?.grants ?? []).map(grant => grant.id)])],
		...(line.style ? { style: text } : {}),
	})
}
export function setRuleLineOff(line: RuleLine, off: boolean): RuleLine {
	return { ...line, off: off ? true : undefined,
		...(!off && line.compile ? { compile: { ...line.compile, grants: line.compile.grants.map(grant => ({ ...grant, off: undefined })) } } : {}) }
}
export function confirmRuleLine(line: RuleLine, at = new Date().toISOString()): RuleLine {
	if (lineNeedsCompile(line) || !line.compile?.grants.length || line.compile.question || line.compile.setting)
		throw new Error('Read this line into supported actions before turning it on.')
	return { ...setRuleLineOff(line, false), unbound: undefined, confirmedAt: at, confirmedHash: ruleTextHash(line.text), confirmedCatalogVersion: line.catalogVersion }
}
export function lineGrants(line: RuleLine): Rule[] {
	if (!line.compile || line.compile.question || line.compile.setting) return []
	const confirmed = lineConfirmed(line), reading = lineNeedsCompile(line)
	return line.compile.grants.map(grant => ({
		...grant, text: line.text,
		...(line.learned ? { learned: line.learned } : {}),
		...(line.style && grant.then === 'draft' ? { style: line.style } : {}),
		off: line.unbound || line.off || grant.off || widening(grant) && (reading || !confirmed) ||
			grant.who.group === 'team' || widening(grant) && grant.who.group === 'outside' ? true : undefined,
		catalogVersion: line.catalogVersion, confirmedAt: confirmed ? line.confirmedAt : undefined,
		confirmedHash: confirmed ? line.confirmedHash : undefined,
		...(line.source === 'settings' ? { source: 'settings' as const, textHash: ruleTextHash(line.text) } : {}),
	}))
}

function scopesOverlap(a: Rule, b: Rule): boolean {
	if (a.when.intent && b.when.intent && a.when.intent !== b.when.intent) return false
	if (a.when.chat && b.when.chat && a.when.chat !== b.when.chat && a.when.chat !== 'direct' && b.when.chat !== 'direct') return false
	if (a.when.reviewerGroup && b.when.reviewerGroup &&
		a.when.reviewerGroup.split('\\').at(-1)!.normalize('NFKC').trim().toLowerCase() !==
		b.when.reviewerGroup.split('\\').at(-1)!.normalize('NFKC').trim().toLowerCase()) return false
	if (a.then === 'review' && ['send', 'ack'].includes(b.then) || b.then === 'review' && ['send', 'ack'].includes(a.then)) return false
	if (a.who.accounts?.length && b.who.accounts?.length)
		return a.who.accounts.some(person => b.who.accounts!.some(other => other.id === person.id))
	return a.who.group === b.who.group || a.who.group === 'org' || b.who.group === 'org'
}
export function ruleConflicts(lines: RuleLine[]): Record<string, string[]> {
	const active = lines.flatMap(line => lineGrants(line)
		.filter(grant => !grant.off && !grant.style).map(grant => ({ line, grant })))
	const conflicts: Record<string, string[]> = {}
	for (const current of active) for (const other of active) {
		if (current.line.id === other.line.id || current.grant.then === other.grant.then || !scopesOverlap(current.grant, other.grant)) continue
		const ids = conflicts[current.line.id] ??= []
		if (!ids.includes(other.line.id)) ids.push(other.line.id)
	}
	return conflicts
}

export type RuleLineStatus = 'reading' | 'off' | 'unclear' | 'waiting' | 'partly' | 'cant-yet' | 'limited' | 'conflict' | 'doing'
export function ruleLineView(line: RuleLine, conflict?: RuleLine) {
	const output = line.compile
	const supported = output?.grants.filter(grant => grant.who.group !== 'team' &&
		!(widening(grant) && grant.who.group === 'outside')) ?? []
	const meaning = supported.map(grant => grant.style ? `Use this drafting style: ${grant.style}` : readBack({ ...grant, off: undefined })).join(' ')
	const result = (status: RuleLineStatus, statusText: string, value = meaning) => ({
		status, meaning: value, statusText, setting: output?.setting?.row,
	})
	if (lineNeedsCompile(line)) return result('reading', '', 'Reading\u2026')
	if (line.unbound) return result('waiting', 'Waiting for your OK: this recorded rule could not be matched to its source line. Check or edit it before turning it on.')
	if (output?.setting) return result('off', '', `That's a setting: change it in Settings \u203a ${output.setting.row}.`)
	if (line.off) return result('off', 'Off \u00b7 kept so you can turn it on again')
	if (output?.question) return result('unclear', `Not sure what you mean: ${output.question}`, 'It waits for you.')
	const missing = output?.notYet.map(part => `"${part.clause}": ${part.missing}`).join('; ')
	if (supported.some(widening) && !lineConfirmed(line))
		return result('waiting', `Waiting for your OK: Delegate would now ${meaning.replace(/^(Send|Acknowledge|Keep|Ignore|Propose|When|Use)\b/, word => word.toLowerCase())}`)
	if (conflict) return result('conflict', `This overlaps with your other line: "${conflict.text}". The stricter line wins where they overlap.`)
	if (missing) return supported.length
		? result('partly', `Doing part of this: ${meaning} Not yet: ${missing}. Until then: it waits for you.`)
		: result('cant-yet', `Delegate can't do this yet: ${missing}. Until then: it waits for you.`, 'It waits for you.')
	if (output?.limited.length) {
		const limits = LIMITS.filter(limit => output.limited.some(part => part.limit === limit.id)).map(limit => limit.page).join(' ')
		return result('limited', `Limited for safety: ${limits}${supported.length ? ' It does the rest.' : ''}`, meaning || 'It waits for you.')
	}
	return result('doing', 'Doing this')
}

export function ruleUses(events: Record<string, unknown>[], now = Date.now()): Record<string, number> {
	const since = now - 7 * 86_400_000, counts: Record<string, number> = {}, seen = new Set<string>()
	for (const event of events) {
		if (typeof event.byRule !== 'string' || typeof event.at !== 'string') continue
		const at = Date.parse(event.at)
		if (!Number.isFinite(at) || at < since || at > now) continue
		const counted = ['ack', 'auto-ack', 'auto-send', 'review-autoposted', 'review-autoreplied'].includes(String(event.event)) ||
			event.event === 'sent' && event.intent !== 'pr_review'
		if (!counted) continue
		const key = typeof event.msgId === 'string' ? `${event.byRule}:${event.msgId}` : undefined
		if (key && seen.has(key)) continue
		if (key) seen.add(key)
		counts[event.byRule] = (counts[event.byRule] ?? 0) + 1
	}
	return counts
}
