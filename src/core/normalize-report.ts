import type { Blocker, Fact, Job, Report, Workflow } from './types.ts'

export type ReportFailure = { kind: 'setup' | 'other' | 'content' | 'tool' | 'stopped'; why: string; tried: string[]; at?: string }
export type ReportRefusal = { what: string; target: string; reason: string }
type ReportData = Partial<Pick<Report, 'intent' | 'context' | 'summary' | 'goalMet' | 'blocker' | 'todos'>>
export type StoredReport = ReportData & {
	key?: string
	every?: number
	state?: Job['state'] | Workflow['state']
	error?: string
	updatedAt?: string
	result?: ReportData
	retry?: Pick<NonNullable<Job['retry']>, 'last' | 'tried'>
	runFailed?: Workflow['runFailed']
	failure?: ReportFailure
	refused?: ReportRefusal[]
}
export type NormalizedReport = {
	context: Fact[]
	findings: Fact[]
	refused: ReportRefusal[]
	todos: string[]
	failure?: ReportFailure
}

const CI = /\b(?:builds?|CI|pipelines?|checks?|validation)\s+(?:(?:is|are|has|have)\s+)?(?:failed|failing|passed|green|red|pending|running|succeeded|queued)\b|\bcoverage\s+(?:dropped|is below|fell)\b/i
const VOTE_STATUS = /\b(?:your|my|our|(?:the )?owner's)\s+(?:reviewer\s+)?groups?\b|\bowner\s+(?:has\s+)?(?:approved|voted|is waiting)\b|\b(?:votes?|reviewer status)\s+(?:is|are)\s+(?:(?:still|already)\s+)?(?:present|recorded|approved|pending|waiting)\b/i
const REVIEWER_STATUS = /^(?:[A-Z][\w'-]*\s+){1,3}(?:has\s+)?(?:approved|voted|(?:is\s+)?waiting)(?=$|[.!;,]|\s+(?:on|for|with|this|the|PR)\b)/
const REVIEW_STATUS_LABEL = /^(?:live votes?|newest builds?)\b|\bdependency\b.*\bvotes?\b/i
const PLUMBING = /\b(?:tool discovery|execution calls?|tool schema)\b/i
const INTERNAL = /[0-9a-f]{8,}|job:|Error:|Not made for you|\bworker\b|\b(?:ado|teams|sharepoint|delegate_worker)[-_][\w-]+/i
const REFUSAL = /(?:\.\s*)?Not made for you:\s*/i
const GATE = /^Not reviewing$/i
const words = (s: string) => s.replace(/\s+/g, ' ').trim()

function factText(text: string): string {
	return words(text.replace(/\bjob:[^\s,;!?()[\]{}]+/gi, '')
		.replace(/\b(?:delegate_worker|ado|teams|sharepoint)[-_][\w-]+(?::[\w-]+)?\s*:?\s*/gi, '')
		.replace(/^(?:\s*Error:\s*)+/i, ''))
}

function plain(text: string, fallback: string): string {
	const value = words(text)
	if (!value) return fallback
	if (!INTERNAL.test(value) && !PLUMBING.test(value) && !/^schema$/i.test(value)) return value
	if (/too large|too much content/i.test(value)) return 'The document is too large to open.'
	if (/no access|access denied|forbidden|permission/i.test(value)) return 'Access to the source was denied.'
	if (/sign.in|authenticat|credentials/i.test(value)) return 'Sign in again to read the source.'
	if (/approval|approv.*confirm|unverified/i.test(value)) return "The approval couldn't be confirmed."
	if (/timeout|timed out|unreachable|connection/i.test(value)) return "The source couldn't be reached."
	if (/stopped|time budget|out of time/i.test(value)) return 'The work stopped before it finished.'
	return fallback
}

function refusal(text: string): ReportRefusal | undefined {
	const match = REFUSAL.exec(text)
	if (!match) return undefined
	const what = plain(text.slice(0, match.index).replace(/[.\s]+$/, ''), 'Make the change yourself')
	const pr = /\bPR\s*#?(\d+)\b/i.exec(what)?.[1]
	return { what, target: pr ? `PR ${pr}` : '', reason: text.slice(match.index + match[0].length).trim() }
}

function failureKind(blocker: Blocker): ReportFailure['kind'] {
	if (blocker.documentFailure) return 'content'
	if (blocker.kind === 'tool') return 'tool'
	return blocker.kind === 'transient' || blocker.kind === 'budget' ? 'other' : 'content'
}

function refusalReason(reason: string): string {
	const value = words(reason), pr = /^PR (\d+) is not this item's PR \((\d+)\)/i.exec(value)
	if (pr) return `This is about PR ${pr[1]}, but the item is about PR ${pr[2]}, so Delegate won't change PR ${pr[1]} from here.`
	if (/is not one of the changes you allow/i.test(value)) return "You haven't allowed Delegate to do this. Settings > Changes Delegate may make."
	if (/never completes, merges, abandons, bypasses, or deletes/i.test(value)) return 'Delegate never merges, completes, abandons or deletes. Do it in Azure DevOps.'
	if (/may only add you as a reviewer/i.test(value)) return 'Delegate can only add you as a reviewer.'
	if (/names no exact call|no exact call|must name.*(?:commit|PR)|vote must|pull request change must/i.test(value)) return "Delegate's proposal was incomplete, so it won't make it. Ask again from the card if you want it."
	if (/invite.*older form/i.test(value)) return 'This invite was made by an older version. Answer the question to get a new one.'
	if (/pipeline|deploy/i.test(value)) return 'Delegate only deploys to the places you allow, one at a time.'
	return plain(value, "Delegate can't make this change from here.")
}

// Read-only display facts, not an upgrade or a retry decision. Older Job.result has no context:
// callers can supply the workflow's context/intent alongside it; absent facts are never guessed from summary prose.
// Normalize failure candidates separately; cardFacts still decides newest failure versus newer draft.
export function normalizeReport(stored: StoredReport): NormalizedReport {
	const report = stored.result ?? stored
	const review = !stored.every && ((stored.intent ?? report.intent) === 'pr_review' || /^pr:/i.test(stored.key?.trim() ?? ''))
	const normalized: NormalizedReport = { context: [], findings: [], refused: [], todos: [] }
	const addRefusal = (r: ReportRefusal) => {
		const clean = { what: plain(r.what, 'Make the change yourself'), target: plain(r.target, ''), reason: refusalReason(r.reason) }
		if (!normalized.refused.some(x => x.what === clean.what && x.target === clean.target && x.reason === clean.reason)) normalized.refused.push(clean)
	}
	for (const r of stored.refused ?? []) addRefusal(r)
	for (const text of [...(report.todos ?? []), ...(stored.result ? stored.todos ?? [] : [])]) {
		const r = refusal(text)
		if (r) addRefusal(r)
		else {
			const todo = plain(text, 'Review this step yourself.')
			if (!normalized.todos.includes(todo)) normalized.todos.push(todo)
		}
	}
	for (const fact of stored.context ?? report.context ?? []) {
		const r = refusal(fact.text)
		if (r) { addRefusal(r); continue }
		if (/^(?:refused change|change refused|not made for you|left for you)$/i.test(fact.label.trim())) {
			addRefusal({ what: 'Make the change yourself', target: '', reason: fact.text })
			continue
		}
		const gate = GATE.test(fact.label.trim())
		const text = `${fact.label} ${fact.text}`
		// Status phrases, not source-code categories: builds, readers and service workers can have real findings.
		if (review && !gate && (CI.test(text) || VOTE_STATUS.test(text) || PLUMBING.test(text) || REVIEW_STATUS_LABEL.test(fact.label.trim()) || /\bThese are CI facts\b/i.test(fact.text) || REVIEWER_STATUS.test(fact.label.trim()) || REVIEWER_STATUS.test(fact.text.trim()))) continue
		const clean: Fact = {
			label: factText(fact.label),
			text: factText(fact.text),
			...(review ? { tone: gate && fact.tone === 'warn' ? 'warn' : 'info' } : fact.tone ? { tone: fact.tone } : {}),
		}
		normalized.context.push(clean)
		if (review && !gate) normalized.findings.push({ ...clean })
	}
	const explicit = stored.runFailed ?? stored.failure
	const blocker = (report.goalMet === false ? report.blocker : undefined) ?? (stored.state === 'failed' ? stored.retry?.last : undefined)
	const errorRefusal = stored.error ? refusal(stored.error) : undefined
	if (errorRefusal) addRefusal(errorRefusal)
	const failed: ReportFailure | undefined = explicit
		? { kind: explicit.kind, why: explicit.why, tried: explicit.tried ?? [], ...(explicit.at ? { at: explicit.at } : {}) }
		: blocker
			? { kind: failureKind(blocker), why: blocker.why, tried: [...(stored.retry?.tried ?? []), ...blocker.tried], ...(stored.updatedAt ? { at: stored.updatedAt } : {}) }
			: stored.state === 'failed' && !errorRefusal
				? { kind: 'other', why: stored.error ?? 'The work stopped before it finished.', tried: stored.retry?.tried ?? [], ...(stored.updatedAt ? { at: stored.updatedAt } : {}) }
				: undefined
	if (failed) {
		const whyRefusal = refusal(failed.why)
		if (whyRefusal) addRefusal(whyRefusal)
		else normalized.failure = {
			...failed,
			why: plain(failed.why, "The work couldn't be completed."),
			tried: [...new Set(failed.tried.flatMap(text => {
				const r = refusal(text)
				if (r) { addRefusal(r); return [] }
				return [plain(text, 'Tried another way, without a usable result.')]
			}))],
		}
	}
	return normalized
}
