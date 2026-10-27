// What an AI run used and where its time went, read from the AI CLI's own JSON output (R-SET-14, design-spec/runinfo.md).
// Copilot's -p output ends with a result that names no model and no call; its session log has one record per model call,
// so a Copilot run is read from both, each event once.
// Usage keeps model names, numbers and local session IDs/hashed keys, never prompt/answer text or secrets.
import { createHash } from 'node:crypto'
import { scrub } from './secrets.ts'

export type CreditsStatus = 'complete' | 'partial' | 'none' | 'byok'
export type TokenDetail = { input: number; cacheRead: number; cacheWrite: number; output: number }
export type Model = { id: string; name?: string; calls?: number; tokensIn?: number; tokensOut?: number; tokensCacheRead?: number; tokensCacheWrite?: number; creditsNano?: number; creditsStatus?: CreditsStatus }
export type RunKey = { kind: 'chat' | 'ask' | 'pr' | 'repo' | 'job' | 'run'; hash: string }
export type RunSession = { id: string; state?: 'new' | 'resumed' | 'rotated'; why?: 'retry' | 'catalog' | 'cap' | 'crash' | 'relay' | 'requeue' | 'age' | 'rules'; ageMin?: number; turn?: number }
export type RunOutcome = 'done' | 'failed' | 'retry' | 'stopped' | 'budget-stopped'
export type PromptMode = 'file' | 'parts' | 'mention'
export type PromptDelivery = { requested: PromptMode; used: PromptMode; fallback?: 'long-line' }
export const PROMPT_DELIVERY_EVENT = 'delegate.prompt_delivery'
// Flat input is the CLI's reported count, not a fresh-input estimate. Only tokenDetail.input reports the fresh category.
// Missing metrics stay absent; partial credits are sums of complete records only, with their status retained.
export type RunUse = {
	models?: Model[]; modelCalls?: number; modelMs?: number
	tokensIn?: number; tokensOut?: number; tokensCacheRead?: number; tokensCacheWrite?: number
	firstCallIn?: number; carriedIn?: number; newPromptIn?: number; promptChars?: number
	toolCalls?: number; toolTokens?: number; reasoningTokens?: number; toolMs?: number; startMs?: number
	requestBytes?: number; toolsAvailable?: number
	promptDelivery?: PromptDelivery
	creditsNano?: number; creditsStatus?: CreditsStatus; tokenDetail?: TokenDetail
	cliVersion?: string; key?: RunKey; session?: RunSession; outcome?: RunOutcome
}
export type RunKind = 'draft' | 'review' | 'ask' | 'change' | 'job' | 'reminder' | 'owner-reply' | 'promise' | 'rule'
export const usageKey = (kind: RunKey['kind'], key: string): RunKey => ({ kind, hash: createHash('sha256').update(key).digest('hex').slice(0, 16) })

const TOKEN_DETAIL_KIND_KEY = 'tokenType'
type CallUse = Pick<Model, 'tokensIn' | 'tokensOut' | 'tokensCacheRead' | 'tokensCacheWrite' | 'creditsNano' | 'creditsStatus'> & {
	input?: number; detail?: TokenDetail
}

// A model ID has no spaces; a display name is a few words. Anything else is not a model name, whatever field it came in.
const ID = /^[A-Za-z0-9][\w.:/@+-]{0,79}$/
const NAME = /^[A-Za-z0-9][\w .:/@()+-]{0,39}$/
const SECRET_ENV = /TOKEN|KEY|SECRET|PASS|PAT$|AUTH|CREDENTIAL|COOKIE/i

const envSecrets = (env: NodeJS.ProcessEnv) => Object.entries(env).filter(([k, v]) => SECRET_ENV.test(k) && v && v.length >= 8).map(([, v]) => v!)
function nameOf(v: unknown, re: RegExp, secrets: string[]): string | undefined {
	if (typeof v !== 'string') return undefined
	const t = v.trim()
	if (!re.test(t) || t.split(' ').length > 5 || scrub(t) !== t || secrets.some(s => t.includes(s))) return undefined
	return t
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
const sum = (...vs: unknown[]) => { const ns = vs.map(num).filter((n): n is number => n !== undefined); return ns.length ? num(ns.reduce((a, b) => a + b, 0)) : undefined }
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const completeSum = (values: (number | undefined)[]) => values.length && values.every(value => value !== undefined) ? sum(...values) : undefined
const completeMax = (values: (number | undefined)[]) => values.length && values.every((value): value is number => num(value) !== undefined) ? Math.max(...values) : undefined
function creditsOf(usage: Record<string, unknown>): Pick<Model, 'creditsNano' | 'creditsStatus'> {
	const credits = obj(usage.copilotUsage)
	if (credits.isByok === true || usage.isByok === true) return { creditsNano: 0, creditsStatus: 'byok' }
	if (!Object.keys(credits).length) return { creditsStatus: 'none' }
	const value = num(credits.totalNanoAiu)
	return credits.aiCreditsStatus === 'complete' && value !== undefined && Number.isSafeInteger(value)
		? { creditsNano: value, creditsStatus: 'complete' } : { creditsStatus: 'partial' }
}
function creditsStatus(rows: { creditsStatus?: CreditsStatus }[]): CreditsStatus {
	if (!rows.length || rows.every(row => row.creditsStatus === undefined || row.creditsStatus === 'none')) return 'none'
	if (rows.every(row => row.creditsStatus === 'byok')) return 'byok'
	return rows.every(row => row.creditsStatus === 'complete' || row.creditsStatus === 'byok') ? 'complete' : 'partial'
}
function tokenDetailOf(usage: Record<string, unknown>): TokenDetail | undefined {
	const items = obj(usage.copilotUsage).tokenDetails
	if (!Array.isArray(items) || !items.length) return undefined
	const detail: Partial<TokenDetail> = {}, fields: Record<string, keyof TokenDetail> = { input: 'input', cache_read: 'cacheRead', cache_write: 'cacheWrite', output: 'output' }
	for (const value of items) {
		const item = obj(value), kind = item[TOKEN_DETAIL_KIND_KEY], count = num(item.tokenCount)
		const field = typeof kind === 'string' && Object.hasOwn(fields, kind) ? fields[kind] : undefined
		if (!field || count === undefined || item.model !== undefined && item.model !== usage.model) return undefined
		const total = num((detail[field] ?? 0) + count)
		if (total === undefined) return undefined
		detail[field] = total
	}
	return detail.input !== undefined && detail.cacheRead !== undefined && detail.cacheWrite !== undefined && detail.output !== undefined
		? { input: detail.input, cacheRead: detail.cacheRead, cacheWrite: detail.cacheWrite, output: detail.output } : undefined
}

// Copilot prints one event per line; Claude prints one result object. Lines that are not JSON objects are skipped.
function eventsOf(out: string): Record<string, unknown>[] {
	// Strip detached-run metadata without splitting a CLI's pretty-printed result object.
	const diagnostics: Record<string, unknown>[] = []
	const t = out.trim().split('\n').filter(line => {
		if (!line.startsWith(`{"type":"${PROMPT_DELIVERY_EVENT}"`)) return true
		try {
			const event = JSON.parse(line)
			if (event?.type === PROMPT_DELIVERY_EVENT) { diagnostics.push(event); return false }
		} catch { /* Preserve malformed output for the normal parser. */ }
		return true
	}).join('\n').trim()
	if (!t) return diagnostics
	if (t.startsWith('{')) try { const one = JSON.parse(t); if (one && typeof one === 'object' && !Array.isArray(one)) return [...diagnostics, one] } catch { /* JSONL */ }
	return [...diagnostics, ...t.split('\n').flatMap(l => { try { const e = JSON.parse(l); return e && typeof e === 'object' && !Array.isArray(e) ? [e] : [] } catch { return [] } })]
}

const promptMode = (value: unknown): value is PromptMode => value === 'file' || value === 'parts' || value === 'mention'
function promptDeliveryOf(value: unknown): PromptDelivery | undefined {
	const data = obj(value), requested = data.requested, used = data.used
	if (!promptMode(requested) || !promptMode(used)) return undefined
	if (data.fallback === 'long-line') return { requested, used, fallback: 'long-line' }
	return data.fallback === undefined ? { requested, used } : undefined
}
// The session log holds every run of the session: only this run's events, and only lines that may be the kinds read here, are parsed.
const WANTED = /"type"\s*:\s*"(session\.(start|resume|usage_record)|assistant\.usage|tool\.execution_(start|complete))"/
function sessionEvents(log: string, since: number, until = Infinity): Record<string, unknown>[] {
	return log.split('\n').filter(l => WANTED.test(l)).flatMap(l => { try { const e = JSON.parse(l), at = Date.parse(e.timestamp); return at >= since && at <= until ? [e] : [] } catch { return [] } })
}

export function sessionUse(id: string, log: string, at: number, choice: { fresh?: boolean; why?: RunSession['why'] } = {}): Pick<RunUse, 'session' | 'carriedIn'> {
	const events = sessionEvents(log, 0, at).filter(event => Date.parse(String(event.timestamp)) < at)
	const birth = events.find(event => event.type === 'session.start')
	const born = birth ? Date.parse(String(birth.timestamp)) : NaN
	const state = choice.why ? 'rotated' : choice.fresh ? 'new' : birth ? 'resumed' : undefined
	const session: RunSession = { id, ...(state ? { state } : {}), ...(choice.why ? { why: choice.why } : {}),
		...(choice.fresh ? { ageMin: 0, turn: 1 } : Number.isFinite(born) && born <= at ?
			{ ageMin: (at - born) / 60_000, turn: 2 + events.filter(event => event.type === 'session.resume').length } : {}) }
	const previous = !choice.fresh && (state === 'resumed' || state === 'rotated')
		? events.filter(event => event.type === 'session.usage_record').at(-1) : undefined
	const usage = obj(obj(previous?.data).usage), input = num(usage.inputTokens), output = num(usage.outputTokens)
	return { session, ...(input !== undefined && output !== undefined ? { carriedIn: input + output } : {}) }
}

// Drops empty values and rounds, so the log holds only what the run said.
function tidy(u: RunUse): RunUse {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(u)) if (Array.isArray(v) ? v.length : v !== undefined) out[k] = typeof v === 'number' ? Math.round(v) : v
	return out as RunUse
}

/** What a run used, from its output and, for Copilot, its session log between `startedAt` (its launch) and `until` (its end). `lastAt` is the last event's time, when given. Never throws. */
export function readRun(out: string, startedAt?: number, env: NodeJS.ProcessEnv = process.env, session = '', until?: number): { use: RunUse; lastAt?: number } {
	try {
		const secrets = envSecrets(env), seen = new Set<string>()
		const events = [...(session && startedAt !== undefined ? sessionEvents(session, startedAt, until) : []), ...eventsOf(out)].filter(e => typeof e.id !== 'string' || (!seen.has(e.id) && !!seen.add(e.id)))
		let promptDelivery: PromptDelivery | undefined
		for (const event of events) {
			if (event.type !== PROMPT_DELIVERY_EVENT) continue
			const at = Date.parse(String(event.timestamp))
			if (!Number.isFinite(at) || startedAt !== undefined && at < startedAt || until !== undefined && at > until) continue
			promptDelivery = promptDeliveryOf(event.data)
			if (promptDelivery) break
		}
		const models: Model[] = [], weight = new Map<string, number>(), usageByModel = new Map<string, CallUse[]>()
		const add = (id: unknown, name?: unknown, w = 0) => {
			const i = nameOf(id, ID, secrets), n = nameOf(name, NAME, secrets)
			if (!i) return
			const m = models.find(x => x.id === i)
			if (!m) models.push(n ? { id: i, name: n } : { id: i })
			else if (n && !m.name) m.name = n
			weight.set(i, (weight.get(i) ?? 0) + w)
		}
		// The most used model first, so a small helper model never reads as the run's model; ties keep the order they ran in.
		const ranked = () => [...models].sort((a, b) => weight.get(b.id)! - weight.get(a.id)!)
		// Claude's result has its models and its token counts; Copilot's has neither.
		const result = events.find(e => e.type === 'result' && (Object.keys(obj(e.modelUsage)).length || typeof obj(e.usage).input_tokens === 'number'))
		if (result) {
			// Claude Code: models by ID, its API time, and its turns. No tool calls or start-up time.
			const mu = obj(result.modelUsage), u = obj(result.usage), per = Object.values(mu).map(obj)
			for (const [id, value] of Object.entries(mu)) {
				const m = obj(value)
				add(id, undefined, num(m.outputTokens) ?? 0)
				const model = models.find(model => model.id === id.trim())
				if (model) Object.assign(model, { calls: per.length === 1 ? num(result.num_turns) : undefined,
					tokensIn: num(m.inputTokens) ?? (per.length === 1 ? num(u.input_tokens) : undefined),
					tokensOut: num(m.outputTokens) ?? (per.length === 1 ? num(u.output_tokens) : undefined),
					tokensCacheRead: num(m.cacheReadInputTokens) ?? (per.length === 1 ? num(u.cache_read_input_tokens) : undefined),
					tokensCacheWrite: num(m.cacheCreationInputTokens) ?? (per.length === 1 ? num(u.cache_creation_input_tokens) : undefined), creditsStatus: 'none' })
			}
			const tokensIn = models.length ? completeSum(models.map(m => m.tokensIn)) : num(u.input_tokens)
			const tokensOut = models.length ? completeSum(models.map(m => m.tokensOut)) : num(u.output_tokens)
			const tokensCacheRead = models.length ? completeSum(models.map(m => m.tokensCacheRead)) : num(u.cache_read_input_tokens)
			const tokensCacheWrite = models.length ? completeSum(models.map(m => m.tokensCacheWrite)) : num(u.cache_creation_input_tokens)
			return { use: tidy({ models: ranked(), modelCalls: num(result.num_turns), modelMs: num(result.duration_api_ms),
				tokensIn, tokensOut, tokensCacheRead, tokensCacheWrite, creditsStatus: 'none', promptDelivery }) }
		}
		let calls = 0, selected: unknown, timed = false, lastAt: number | undefined, firstCall: number | undefined
		let modelMs: number | undefined
		let firstCallIn: number | undefined, toolTokens: number | undefined, reasoningTokens: number | undefined
		let reportedToolCalls: number | undefined, cliVersion: string | undefined
		const durations: (number | undefined)[] = [], toolCounts: (number | undefined)[] = []
		const toolTokenCounts: (number | undefined)[] = [], reasoningCounts: (number | undefined)[] = []
		const requestCounts: (number | undefined)[] = [], availableCounts: (number | undefined)[] = []
		const tools = new Map<string, { s?: number; e?: number }>()
		let anon = 0, apiMs: number | undefined
		// A CLI that wrote both kinds of usage event would count each call twice: the records win.
		const records = events.some(e => typeof e.type === 'string' && e.type.endsWith('.usage_record'))
		for (const e of events) {
			const type = typeof e.type === 'string' ? e.type : '', d = obj(e.data)
			const at = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
			if (type === 'result') apiMs = num(obj(e.usage).totalApiDurationMs)
			if (!/^(session|assistant|tool|user)\./.test(type)) continue
			if (Number.isFinite(at)) { timed = true; lastAt = Math.max(lastAt ?? at, at) }
			if (type === 'session.start' || type === 'session.resume') {
				selected ??= d.selectedModel
				cliVersion ??= nameOf(d.cliVersion ?? d.copilotVersion, ID, secrets)
			}
			else if (type.endsWith('.usage_record') || (type === 'assistant.usage' && !records)) {
				const u = obj(d.usage ?? d)
				const model = nameOf(u.model, ID, secrets)
				if (!model) continue
				calls++
				add(model, u.modelDisplayName, 1)
				const ms = num(u.duration)
				durations.push(ms)
				const detail = tokenDetailOf(u), hasDetail = Object.hasOwn(obj(u.copilotUsage), 'tokenDetails')
				const row: CallUse = { tokensIn: num(u.inputTokens), tokensOut: detail?.output ?? num(u.outputTokens),
					tokensCacheRead: detail?.cacheRead ?? (!hasDetail ? num(u.cacheReadTokens) : undefined),
					tokensCacheWrite: detail?.cacheWrite ?? (!hasDetail ? num(u.cacheWriteTokens) : undefined),
					input: num(u.inputTokens), detail, ...creditsOf(u) }
				usageByModel.set(model, [...(usageByModel.get(model) ?? []), row])
				if (calls === 1) firstCallIn = row.input
				toolTokenCounts.push(num(u.toolTokenCount))
				reasoningCounts.push(num(u.reasoningTokens))
				toolCounts.push(num(u.numToolCalls))
				requestCounts.push(num(u.requestBodyBytes))
				availableCounts.push(num(u.availableToolCount))
				// The record comes when the call ends: the call began its duration earlier.
				if (Number.isFinite(at)) { const s = at - (ms ?? 0); firstCall = Math.min(firstCall ?? s, s) }
			} else if (type === 'tool.execution_start' || type === 'tool.execution_complete') {
				const id = typeof d.toolCallId === 'string' ? d.toolCallId : type === 'tool.execution_start' ? `#${anon++}` : undefined
				if (!id) continue
				const t = tools.get(id) ?? {}
				if (Number.isFinite(at)) t[type === 'tool.execution_start' ? 's' : 'e'] = at
				tools.set(id, t)
			}
		}
		if (!calls) add(selected)
		modelMs = completeSum(durations) ?? apiMs
		reportedToolCalls = completeSum(toolCounts)
		toolTokens = completeSum(toolTokenCounts)
		reasoningTokens = completeSum(reasoningCounts)
		for (const model of models) {
			const rows = usageByModel.get(model.id)
			if (!rows) continue
			const creditsNano = sum(...rows.map(row => row.creditsNano))
			Object.assign(model, { calls: rows.length, tokensIn: completeSum(rows.map(row => row.tokensIn)),
				tokensOut: completeSum(rows.map(row => row.tokensOut)), tokensCacheRead: completeSum(rows.map(row => row.tokensCacheRead)),
				tokensCacheWrite: completeSum(rows.map(row => row.tokensCacheWrite)),
				creditsNano: creditsNano !== undefined && Number.isSafeInteger(creditsNano) ? creditsNano : undefined,
				creditsStatus: creditsStatus(rows) })
		}
		const rows = [...usageByModel.values()].flat()
		const input = completeSum(rows.map(row => row.detail?.input)), cacheRead = completeSum(rows.map(row => row.detail?.cacheRead))
		const cacheWrite = completeSum(rows.map(row => row.detail?.cacheWrite)), output = completeSum(rows.map(row => row.detail?.output))
		const tokenDetail = input !== undefined && cacheRead !== undefined && cacheWrite !== undefined && output !== undefined
			? { input, cacheRead, cacheWrite, output } : undefined
		const tokensIn = completeSum(models.map(model => model.tokensIn)), tokensOut = completeSum(models.map(model => model.tokensOut))
		const tokensCacheRead = completeSum(models.map(model => model.tokensCacheRead)), tokensCacheWrite = completeSum(models.map(model => model.tokensCacheWrite))
		const totalCredits = sum(...models.map(model => model.creditsNano))
		// Tools often run side by side: their time is the time at least one was running. One still running at the end ran until then.
		// Tool counts are told only once the run did something: a lone start event says nothing about tools.
		const did = calls > 0 || tools.size > 0
		let toolMs: number | undefined
		if (timed && did && (tools.size > 0 || reportedToolCalls === 0)) {
			const spans = [...tools.values()].filter(t => t.s !== undefined).map(t => [t.s!, Math.max(t.s!, t.e ?? lastAt ?? t.s!)] as const).sort((a, b) => a[0] - b[0])
			toolMs = 0
			let end = -Infinity
			for (const [s, e] of spans) { if (e <= end) continue; toolMs += e - Math.max(s, end); end = e }
		}
		const startMs = firstCall !== undefined && startedAt !== undefined && firstCall >= startedAt ? firstCall - startedAt : undefined
		return { use: tidy({ models: ranked(), modelCalls: calls || undefined, modelMs, tokensIn, tokensOut, tokensCacheRead, tokensCacheWrite,
			firstCallIn, toolCalls: reportedToolCalls ?? (tools.size ? tools.size : undefined), toolTokens, reasoningTokens, toolMs, startMs, cliVersion,
			requestBytes: completeSum(requestCounts), toolsAvailable: completeMax(availableCounts),
			promptDelivery,
			creditsNano: totalCredits !== undefined && Number.isSafeInteger(totalCredits) ? totalCredits : undefined,
			creditsStatus: creditsStatus(models), tokenDetail }), lastAt }
	} catch { return { use: {} } }
}

/** The run kind is always recorded; usage fields stay absent when the run reported none. */
export function ran(kind: RunKind, use?: RunUse, context: Pick<RunUse, 'key' | 'session' | 'carriedIn' | 'promptChars' | 'outcome'> = {}): RunUse & { runKind: RunKind } {
	const current = { ...use, ...context }, first = current.firstCallIn
	const fresh = current.session?.state === 'new' || current.session?.state === 'rotated' && current.session.turn === 1
	const extra = first !== undefined ? fresh ? first :
		current.carriedIn !== undefined && first >= current.carriedIn ? first - current.carriedIn : undefined : undefined
	return { ...current, ...(extra === undefined ? {} : { newPromptIn: extra }), runKind: kind }
}

export function mergeUse(uses: RunUse[]): RunUse {
	const grouped = new Map<string, Model[]>()
	for (const use of uses) for (const model of use.models ?? [])
		grouped.set(model.id, [...(grouped.get(model.id) ?? []), model])
	const models = [...grouped].map(([id, rows]): Model => {
		const creditsNano = sum(...rows.map(row => row.creditsNano))
		return { id, ...(rows.find(row => row.name)?.name ? { name: rows.find(row => row.name)!.name } : {}),
			calls: completeSum(rows.map(row => row.calls)), tokensIn: completeSum(rows.map(row => row.tokensIn)),
			tokensOut: completeSum(rows.map(row => row.tokensOut)), tokensCacheRead: completeSum(rows.map(row => row.tokensCacheRead)),
			tokensCacheWrite: completeSum(rows.map(row => row.tokensCacheWrite)),
			creditsNano: creditsNano !== undefined && Number.isSafeInteger(creditsNano) ? creditsNano : undefined,
			creditsStatus: creditsStatus(rows) }
	})
	const creditsNano = sum(...uses.map(use => use.creditsNano))
	const delivery = uses[0]?.promptDelivery
	const sameDelivery = delivery && uses.every(use => use.promptDelivery?.requested === delivery.requested &&
		use.promptDelivery.used === delivery.used && use.promptDelivery.fallback === delivery.fallback)
	return { models: models.length ? models : undefined, tokensIn: completeSum(uses.map(use => use.tokensIn)),
		tokensOut: completeSum(uses.map(use => use.tokensOut)), tokensCacheRead: completeSum(uses.map(use => use.tokensCacheRead)),
		tokensCacheWrite: completeSum(uses.map(use => use.tokensCacheWrite)), modelCalls: completeSum(uses.map(use => use.modelCalls)),
		requestBytes: completeSum(uses.map(use => use.requestBytes)), toolsAvailable: completeMax(uses.map(use => use.toolsAvailable)),
		...(sameDelivery ? { promptDelivery: delivery } : {}),
		creditsNano: creditsNano !== undefined && Number.isSafeInteger(creditsNano) ? creditsNano : undefined, creditsStatus: creditsStatus(uses) }
}

const KINDS: [RunKind, string][] = [['draft', 'Drafts'], ['review', 'Reviews'], ['ask', 'Asks'], ['change', 'Changes you approved'], ['job', 'Tracking and other jobs'], ['reminder', 'Replies to your reminders'], ['owner-reply', 'Checking your own replies'], ['promise', 'Checking promises'], ['rule', 'Reading your rules']]
type Run = { runId?: string; kind: RunKind; models: Model[]; ms?: number; modelMs?: number; toolMs?: number; startMs?: number }

// The runs among log events that recorded a model. Old events, without the fields, are not runs here.
export function runsOf(events: Record<string, unknown>[]): Run[] {
	const out = new Map<string, Run>()
	events.forEach((e, i) => {
		const kind = KINDS.find(([k]) => k === e.runKind)?.[0]
		const models = Array.isArray(e.models) ? e.models.map(obj).filter(m => typeof m.id === 'string').map(m => ({ id: String(m.id), ...(typeof m.name === 'string' ? { name: m.name } : {}) })) : []
		if (!kind || !models.length) return
		out.set(typeof e.runId === 'string' ? e.runId : `#${i}`, { runId: e.runId as string | undefined, kind, models, ms: num(e.ms), modelMs: num(e.modelMs), toolMs: num(e.toolMs), startMs: num(e.startMs) })
	})
	return [...out.values()]
}

const median = (ns: (number | undefined)[]) => { const s = ns.filter((n): n is number => n !== undefined).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : undefined }
const secs = (ms: number) => (ms < 1000 ? 'under 1 s' : `${Math.round(ms / 1000)} s`)
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// Each model by its display name when any run gave one, with its runs, most first.
function modelCounts(runs: Run[]): [string, number][] {
	const names = new Map<string, string>(), n = new Map<string, number>()
	for (const r of runs) for (const m of r.models) { if (m.name) names.set(m.id, m.name); n.set(m.id, (n.get(m.id) ?? 0) + 1) }
	return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id, c]) => [names.get(id) ?? id, c])
}

/** The display name a run gave for a model ID, if any. */
export function nameFor(events: Record<string, unknown>[], id: string): string | undefined {
	return runsOf(events).flatMap(r => r.models).find(m => m.id === id && m.name)?.name
}

/** One line per kind of run, in plain words: "Drafts: Claude Opus 5.5, 37 runs, typical 90 s (model 55 s, tools 30 s, start-up 5 s)". */
export function runLines(events: Record<string, unknown>[]): string[] {
	const runs = runsOf(events)
	return KINDS.flatMap(([kind, label]) => {
		const rs = runs.filter(r => r.kind === kind)
		if (!rs.length) return []
		const ms = modelCounts(rs), who = ms.length === 1 ? ms[0][0] : ms.map(([m, c]) => `${m} (${c})`).join(', ')
		// Each part is its typical share of a run, times the typical run, so the parts add up; what is left is "other".
		const typical = median(rs.map(r => r.ms))
		const share = (f: (r: Run) => number | undefined) => median(rs.map(r => (r.ms && f(r) !== undefined ? Math.min(1, f(r)! / r.ms) : undefined)))
		const shares = ([['model', share(r => r.modelMs)], ['tools', share(r => r.toolMs)], ['start-up', share(r => r.startMs)]] as const).filter(([, v]) => v !== undefined)
		// Typical shares can add up to more than a whole run: they are scaled down to fit.
		const whole = Math.max(1, shares.reduce((a, [, v]) => a + v!, 0))
		const parts = typical === undefined ? [] : shares.map(([l, v]) => [l, Math.round(v! / whole * typical / 1000) * 1000] as const)
		const other = typical === undefined || !parts.length ? 0 : Math.round(typical / 1000) * 1000 - parts.reduce((a, [, v]) => a + v, 0)
		const split = [...parts, ...(other >= 1000 ? [['other', other] as const] : [])].map(([l, v]) => `${l} ${secs(v)}`)
		return [`${label}: ${who}, ${plural(rs.length, 'run')}${typical !== undefined ? `, typical ${secs(typical)}` : ''}${split.length ? ` (${split.join(', ')})` : ''}`]
	})
}

/** The status line: which models ran, from today's log events. */
export function modelsLine(events: Record<string, unknown>[]): string {
	const ms = modelCounts(runsOf(events))
	return `AI models today: ${ms.length ? ms.map(([m, c]) => `${m} (${plural(c, 'run')})`).join(', ') : 'none recorded yet'}`
}
