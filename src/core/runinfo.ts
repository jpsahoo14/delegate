// What an AI run used and where its time went, read from the AI CLI's own JSON output (R-SET-14, design-spec/runinfo.md).
// Copilot's -p output ends with a result that names no model and no call; its session log has one record per model call,
// so a Copilot run is read from both, each event once.
// Only model names and numbers are kept: never text from the prompt or the answer, and never a token or key.
import { scrub } from './secrets.ts'

export type Model = { id: string; name?: string }
export type RunUse = { models?: Model[]; modelCalls?: number; modelMs?: number; tokensIn?: number; tokensOut?: number; toolCalls?: number; toolMs?: number; startMs?: number }
export type RunKind = 'draft' | 'review' | 'ask' | 'change' | 'job' | 'reminder'

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
const sum = (...vs: unknown[]) => { const ns = vs.map(num).filter((n): n is number => n !== undefined); return ns.length ? ns.reduce((a, b) => a + b, 0) : undefined }
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

// Copilot prints one event per line; Claude prints one result object. Lines that are not JSON objects are skipped.
function eventsOf(out: string): Record<string, unknown>[] {
	const t = out.trim()
	if (!t) return []
	if (t.startsWith('{')) try { const one = JSON.parse(t); if (one && typeof one === 'object' && !Array.isArray(one)) return [one] } catch { /* JSONL */ }
	return t.split('\n').flatMap(l => { try { const e = JSON.parse(l); return e && typeof e === 'object' && !Array.isArray(e) ? [e] : [] } catch { return [] } })
}
// The session log holds every run of the session: only this run's events, and only lines that may be the kinds read here, are parsed.
const WANTED = /"type":"(session\.(start|resume|usage_record)|assistant\.usage|tool\.execution_(start|complete))"/
function sessionEvents(log: string, since: number, until = Infinity): Record<string, unknown>[] {
	return log.split('\n').filter(l => WANTED.test(l)).flatMap(l => { try { const e = JSON.parse(l), at = Date.parse(e.timestamp); return at >= since && at <= until ? [e] : [] } catch { return [] } })
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
		const models: Model[] = [], weight = new Map<string, number>()
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
			for (const [id, m] of Object.entries(mu)) add(id, undefined, num(obj(m).outputTokens) ?? 0)
			const tokensIn = sum(u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens) ?? sum(...per.flatMap(m => [m.inputTokens, m.cacheReadInputTokens, m.cacheCreationInputTokens]))
			const tokensOut = num(u.output_tokens) ?? sum(...per.map(m => m.outputTokens))
			return { use: tidy({ models: ranked(), modelCalls: num(result.num_turns), modelMs: num(result.duration_api_ms), tokensIn, tokensOut }) }
		}
		let calls = 0, selected: unknown, timed = false, lastAt: number | undefined, firstCall: number | undefined
		let modelMs: number | undefined, tokensIn: number | undefined, tokensOut: number | undefined
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
			if (type === 'session.start' || type === 'session.resume') selected ??= d.selectedModel
			else if (type.endsWith('.usage_record') || (type === 'assistant.usage' && !records)) {
				const u = obj(d.usage ?? d)
				if (typeof u.model !== 'string') continue
				calls++
				add(u.model, u.modelDisplayName, 1)
				const ms = num(u.duration)
				if (ms !== undefined) modelMs = (modelMs ?? 0) + ms
				if (num(u.inputTokens) !== undefined) tokensIn = (tokensIn ?? 0) + num(u.inputTokens)!
				if (num(u.outputTokens) !== undefined) tokensOut = (tokensOut ?? 0) + num(u.outputTokens)!
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
		modelMs ??= apiMs
		// Tools often run side by side: their time is the time at least one was running. One still running at the end ran until then.
		// Tool counts are told only once the run did something: a lone start event says nothing about tools.
		const did = calls > 0 || tools.size > 0
		let toolMs: number | undefined
		if (timed && did) {
			const spans = [...tools.values()].filter(t => t.s !== undefined).map(t => [t.s!, Math.max(t.s!, t.e ?? lastAt ?? t.s!)] as const).sort((a, b) => a[0] - b[0])
			toolMs = 0
			let end = -Infinity
			for (const [s, e] of spans) { if (e <= end) continue; toolMs += e - Math.max(s, end); end = e }
		}
		const startMs = firstCall !== undefined && startedAt !== undefined && firstCall >= startedAt ? firstCall - startedAt : undefined
		return { use: tidy({ models: ranked(), modelCalls: calls || undefined, modelMs, tokensIn, tokensOut, toolCalls: did ? tools.size : undefined, toolMs, startMs }), lastAt }
	} catch { return { use: {} } }
}

/** The fields for a run's log event: none when the run said nothing. */
export function ran(kind: RunKind, use?: RunUse): Record<string, unknown> {
	return use && Object.keys(use).length ? { ...use, runKind: kind } : {}
}

const KINDS: [RunKind, string][] = [['draft', 'Drafts'], ['review', 'Reviews'], ['ask', 'Asks'], ['change', 'Changes you approved'], ['job', 'Tracking and other jobs'], ['reminder', 'Replies to your reminders']]
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
