import type { Blocker, Fact, Job, QuestionHint, Report, Workflow } from './types.ts'
import { documentFailureCause } from './document-failure.ts'
import { scrub } from './secrets.ts'
import { displayedLeftAction, leftActionText, type LeftRefusal } from './left-lines.ts'

export type FailureCause = {
	step: 'pr-read' | 'doc-read' | 'teams-read' | 'post' | 'send' | 'calendar' | 'work-item' | 'run-stopped'
	target?: string
	reason?: 'unreachable' | 'no-access' | 'not-found' | 'timeout' | 'busy' | 'too-large' | 'unsupported'
	system?: string
	retryAt?: string
	size?: string
}
export type ReportFailure = { kind: 'setup' | 'other' | 'content' | 'tool' | 'stopped'; why: string; tried: string[]; at?: string; cause?: FailureCause }
export type ReportRefusal = LeftRefusal & { what: string; target: string; reason: string }
type ReportData = Partial<Pick<Report, 'intent' | 'context' | 'summary' | 'goalMet' | 'blocker' | 'todos' | 'question' | 'questionHint' | 'refused'>>
export type StoredReport = ReportData & {
	key?: string
	every?: number
	state?: Job['state'] | Workflow['state']
	error?: string
	updatedAt?: string
	result?: ReportData
	retry?: Pick<NonNullable<Job['retry']>, 'last' | 'tried'> & { nextAt?: string }
	runFailed?: Workflow['runFailed']
	failure?: ReportFailure
}
export type NormalizedReport = {
	question?: Report['question']
	questionHint?: Report['questionHint']
	context: Fact[]
	findings: Fact[]
	refused: ReportRefusal[]
	todos: string[]
	failure?: ReportFailure
}

const CI = /\b(?:builds?|CI|pipelines?|checks?|validation)\s+(?:(?:is|are|has|have)\s+)?(?:failed|failing|passed|green|red|pending|running|succeeded|queued)\b|\bcoverage\s+(?:dropped|is below|fell)\b/i
const VOTE_STATUS = /\b(?:your|my|our|(?:the )?owner's)\s+(?:reviewer\s+)?groups?\b|\bowner\s+(?:has\s+)?(?:approved|voted|is waiting)\b|\b(?:votes?|reviewer status)\s+(?:is|are)\s+(?:(?:still|already)\s+)?(?:present|recorded|approved|pending|waiting)\b/i
const REVIEWER_STATUS = /^(?:[A-Z][\w'-]*\s+){1,3}(?:has\s+)?(?:approved|voted|(?:is\s+)?waiting)(?=$|[.!;,]|\s+(?:on|for|with|this|the|PR)\b)/
const REVIEW_STATUS_LABEL = /^(?:live votes?|newest builds?|ci and (?:test |code )?coverage)\b|\bdependency\b.*\bvotes?\b/i
const PLUMBING = /\b(?:tool discovery|execution calls?|tool schema)\b/i
const INTERNAL = /[0-9a-f]{8,}|job:|Error:|\bworker\b|\b(?:ado|teams|sharepoint|delegate_worker)[-_][\w-]+/i
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

function failureKind(blocker: Blocker): ReportFailure['kind'] {
	if (blocker.documentFailure) return 'content'
	if (blocker.kind === 'tool') return 'tool'
	return blocker.kind === 'transient' || blocker.kind === 'budget' ? 'other' : 'content'
}

const causeText = (text: string | undefined) => text && !/[\\/]|(?:https?|file):/i.test(text)
	? plain(scrub(text), '').slice(0, 200) || undefined : undefined
function cleanCause(cause: FailureCause): FailureCause {
	const target = causeText(cause.target), system = causeText(cause.system), size = causeText(cause.size)
	return { step: cause.step, ...(cause.reason ? { reason: cause.reason } : {}),
		...(target ? { target } : {}), ...(system ? { system } : {}), ...(size ? { size } : {}),
		...(cause.retryAt && Number.isFinite(Date.parse(cause.retryAt)) ? { retryAt: cause.retryAt } : {}) }
}

export function normalizeQuestionHint(hint: QuestionHint): QuestionHint {
	const answers: string[] = [], seen = new Set<string>()
	const unsafe = (text: string) => /\b[AWRKH]\d+\b/i.test(text) || /^[^a-z]*(?:ok|send|approve|vote|close|skip|wait|never|pause|resume|stop|undo|remember|edit)\b/i.test(text)
	for (const answer of hint.answers ?? []) {
		const text = answer.replace(/["`\u2018-\u201f\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '').replace(/\s+/g, ' ').trim()
		if (unsafe(text)) continue
		const short = Array.from(text).slice(0, 60).join('').trim(), key = short.toLowerCase()
		if (!short || seen.has(key) || unsafe(short)) continue
		answers.push(short)
		seen.add(key)
		if (answers.length === 3) break
	}
	return answers.length ? { answers } : {}
}

function refusalHref(href: string): boolean {
	if (!URL.canParse(href)) return false
	const url = new URL(href), host = url.hostname
	return url.protocol === 'https:' && (host === 'dev.azure.com' || host.endsWith('.visualstudio.com') ||
		host === 'teams.microsoft.com' || host === 'teams.cloud.microsoft')
}

// Read-only display facts, not an upgrade or a retry decision. Older Job.result has no context:
// callers can supply the workflow's context/intent alongside it; absent facts are never guessed from summary prose.
// Normalize failure candidates separately; cardFacts still decides newest failure versus newer draft.
export function normalizeReport(stored: StoredReport): NormalizedReport {
	const report = stored.result ?? stored
	const review = !stored.every && ((stored.intent ?? report.intent) === 'pr_review' || /^pr:/i.test(stored.key?.trim() ?? ''))
	const normalized: NormalizedReport = { context: [], findings: [], refused: [], todos: [] }
	const question = report.question?.trim()
	if (question) {
		normalized.question = question
		if (report.questionHint) normalized.questionHint = normalizeQuestionHint(report.questionHint)
	}
	const addRefusal = (r: LeftRefusal) => {
		const { reply, pr, ...record } = r
		const action = displayedLeftAction(r.action)
		const clean: ReportRefusal = { ...record, action,
			...(reply && refusalHref(reply.href) ? { reply } : {}),
			...(pr && refusalHref(pr.href) ? { pr } : {}),
			what: plain(leftActionText(action), 'Make the change yourself'),
			target: r.action.pr ? `PR ${r.action.pr}` : plain(r.action.target ?? '', ''),
			reason: plain(r.why ?? '', "Delegate can't make this change from here.") }
		const key = (draft: LeftRefusal) => JSON.stringify([draft.kind, draft.action.key, draft.action.verb, draft.action.pr, draft.action.target, draft.action.quote, draft.why, draft.setting, draft.reply, draft.pr])
		if (!normalized.refused.some(x => key(x) === key(clean))) normalized.refused.push(clean)
	}
	for (const r of [...(report.refused ?? []), ...(stored.result ? stored.refused ?? [] : [])]) addRefusal(r)
	for (const text of [...(report.todos ?? []), ...(stored.result ? stored.todos ?? [] : [])]) {
		const todo = plain(text, 'Review this step yourself.')
		if (!normalized.todos.includes(todo)) normalized.todos.push(todo)
	}
	for (const fact of stored.context ?? report.context ?? []) {
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
	const failed: ReportFailure | undefined = explicit
		? { kind: explicit.kind, why: explicit.why, tried: explicit.tried ?? [], ...(explicit.at ? { at: explicit.at } : {}) }
		: blocker
			? { kind: failureKind(blocker), why: blocker.why, tried: [...(stored.retry?.tried ?? []), ...blocker.tried], ...(stored.updatedAt ? { at: stored.updatedAt } : {}) }
			: stored.state === 'failed'
				? { kind: 'other', why: stored.error ?? 'The work stopped before it finished.', tried: stored.retry?.tried ?? [], ...(stored.updatedAt ? { at: stored.updatedAt } : {}) }
				: undefined
	if (failed) {
		const doc = explicit
			? explicit.kind === 'content' ? documentFailureCause(explicit.why) : undefined
			: blocker?.documentFailure ? documentFailureCause(blocker.why) : undefined
		const cause: FailureCause | undefined = explicit && 'cause' in explicit && explicit.cause
			? cleanCause(explicit.cause)
			: failed.kind === 'stopped' ? { step: 'run-stopped' }
			: doc ? { ...doc, target: causeText(doc.target) ?? 'the document' } : undefined
		if (cause && stored.retry?.nextAt && Number.isFinite(Date.parse(stored.retry.nextAt))) cause.retryAt = stored.retry.nextAt
		normalized.failure = {
			...failed,
			...(cause ? { cause } : {}),
			why: plain(failed.why, "The work couldn't be completed."),
			tried: [...new Set(failed.tried.map(text => plain(text, 'Tried another way, without a usable result.')))],
		}
	}
	return normalized
}
