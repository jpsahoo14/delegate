import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { TELEMETRY_CATALOG, telemetryError, telemetryPrivacy } from '../core/telemetry.ts'
import { scrubDeep } from '../core/secrets.ts'
import { CMD } from '../brand.ts'
import { isCode } from '../core/ids.ts'

type Entry = Record<string, unknown>
type Row = { entry: Entry; source: 'state' | 'host' | 'report' }
const object = (value: unknown): value is Entry => !!value && typeof value === 'object' && !Array.isArray(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[\w.:-]{1,256}$/.test(value)
const fileId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]+$/.test(value)
const base = ['at', 'v', 'machine', 'pid', 'trace', 'runId', 'event']
// Legacy events can contain content even though they have no catalogue entry.
const legacy = ['code', 'workflowId', 'job', 'jobId', 'sessionId', 'submissionId', 'step', 'class', 'gate', 'rule',
	'tool', 'ms', 'ok', 'exitCode', 'via', 'warm', 'fallback', 'direct', 'purpose', 'intent', 'calls', 'inputTokens',
	'outputTokens', 'tokensIn', 'tokensOut', 'modelCalls', 'modelMs', 'toolCalls', 'toolMs', 'startMs',
	'effects', 'hasReply', 'findingCount', 'todoCount', 'blocked', 'error']
function itemTrace(value: unknown) {
	if (!identifier(value)) return undefined
	const split = value.indexOf(':'), code = value.slice(0, split), submission = value.slice(split + 1)
	return split > 0 && isCode(code.toUpperCase()) && identifier(submission) ? { code, submission } : undefined
}
function links(e: Entry): string[] {
	const trace = itemTrace(e.trace)
	return [
		...(trace ? [`trace:${e.trace}`, `submission:${trace.submission}`] : []),
		...(identifier(e.runId) ? [`run:${e.runId}`] : []),
		...(identifier(e.submissionId) ? [`submission:${e.submissionId}`] : []),
	]
}
function matches(e: Entry, selector: string) {
	const codeMatches = (value: unknown) => typeof value === 'string' && value.toUpperCase() === selector.toUpperCase()
	const trace = itemTrace(e.trace)
	return e.trace === selector || e.runId === selector || e.submissionId === selector ||
		codeMatches(e.code) || !!trace && (codeMatches(trace.code) || trace.submission === selector)
}
function metadata(e: Entry): Entry {
	const event = String(e.event), definition = Object.hasOwn(TELEMETRY_CATALOG, event) ? TELEMETRY_CATALOG[event as keyof typeof TELEMETRY_CATALOG] : undefined
	const fields: readonly string[] = definition && 'fields' in definition ? definition.fields : legacy
	const out: Entry = {}
	for (const key of [...base, ...fields]) {
		const value = e[key]
		if (value === undefined) continue
		if (!definition && typeof value === 'object') continue
		out[key] = key === 'error' ? telemetryError(value) : value
	}
	return out
}
function failed(e: Entry) {
	return /(?:^|[-_.])(?:failed|failure|error)(?:$|[-_.])/.test(String(e.event)) || e.event === 'run-no-report' ||
		e.ok === false || e.blocked === true || e.class === 'tool-error' || e.class === 'exception' ||
		typeof e.exitCode === 'number' && e.exitCode !== 0
}

// Reads today's and yesterday's UTC logs only. Never creates a Store, follows a session path, or starts a host.
export async function traceTimeline(root: string, local: string, selector: string, content = false, now = Date.now()) {
	const today = new Date(now).toISOString().slice(0, 10), since = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10)
	const until = Date.parse(today) + 86_400_000, rows: Row[] = []
	let invalid = 0
	const within = (e: Entry) => typeof e.at === 'string' && Date.parse(e.at) >= Date.parse(since) && Date.parse(e.at) < until
	const add = (entry: unknown, source: Row['source']) => {
		if (!object(entry) || typeof entry.event !== 'string' || !/^[\w.-]{1,100}$/.test(entry.event) || typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at))) { invalid++; return }
		if (within(entry)) rows.push({ entry, source })
	}
	const logs = join(root, 'state', 'log')
	const files: { file: string; source: Row['source'] }[] = existsSync(logs) ? readdirSync(logs).filter(name => /^\d{4}-\d{2}-\d{2}-.+\.jsonl$/.test(name) &&
		(name.slice(0, 10) === today || name.slice(0, 10) === since)).sort().map(name => ({ file: join(logs, name), source: 'state' })) : []
	const host = join(local, 'host.log')
	if (existsSync(host)) files.push({ file: host, source: 'host' })
	for (const { file, source } of files) {
		const stream = createReadStream(file, { encoding: 'utf8' }), lines = createInterface({ input: stream, crlfDelay: Infinity })
		stream.on('error', error => lines.emit('error', error))
		try {
			for await (const line of lines) {
				if (!line.trim()) continue
				let entry: unknown
				try { entry = JSON.parse(line) } catch { invalid++; continue }
				add(entry, source)
			}
		} finally { lines.close(); stream.destroy() }
	}
	const byLink = new Map<string, number[]>()
	for (const [i, row] of rows.entries()) for (const key of links(row.entry)) {
		const hits = byLink.get(key) ?? []
		hits.push(i); byLink.set(key, hits)
	}
	const pending = rows.flatMap((row, i) => matches(row.entry, selector) ? [i] : [])
	const selected = new Set<number>()
	for (let index = 0; index < pending.length; index++) {
		const i = pending[index]
		if (selected.has(i)) continue
		selected.add(i)
		for (const key of links(rows[i].entry)) {
			for (const hit of byLink.get(key) ?? []) pending.push(hit)
			byLink.delete(key)
		}
	}
	const matched = [...selected].map(i => rows[i]), reports = new Set<string>()
	for (const { entry } of [...matched].sort((a, b) => Date.parse(String(b.entry.at)) - Date.parse(String(a.entry.at)))) {
		const id = entry.workflowId ?? entry.job ?? entry.jobId
		if (!fileId(id) || !fileId(entry.runId)) continue
		const name = `${id}-${entry.runId}.json`
		if (reports.has(name)) continue
		reports.add(name)
		const file = [join(root, 'state', 'reports', name), join(root, 'state', 'done', 'reports', name)].find(f => existsSync(f))
		if (!file) continue
		let report: unknown
		try { report = JSON.parse(readFileSync(file, 'utf8')) } catch (error) {
			if (!(error instanceof SyntaxError)) throw error
			invalid++; continue
		}
		if (!object(report)) { invalid++; continue }
		matched.push({ source: 'report', entry: {
			at: entry.at, event: 'run-summary', trace: entry.trace, runId: entry.runId, workflowId: id,
			intent: report.intent, effects: Array.isArray(report.effects) ? report.effects.length : 0,
			hasReply: object(report.reply), findingCount: Array.isArray(report.findings) ? report.findings.length : 0,
			todoCount: Array.isArray(report.todos) ? report.todos.length : 0, blocked: !!report.blocker || report.goalMet === false,
			...(content ? { summary: report.summary, reply: report.reply, blocker: report.blocker } : {}),
		} })
	}
	const timeline = matched.filter(row => content || telemetryPrivacy(String(row.entry.event)) !== 'content')
		.sort((a, b) => Date.parse(String(a.entry.at)) - Date.parse(String(b.entry.at)))
		.map(({ entry, source }) => scrubDeep({ ...(content ? entry : metadata(entry)), source,
			...(failed(entry) ? { failureStep: typeof entry.step === 'string' ? entry.step : entry.event } : {}) }))
	return { timeline, invalid, since, today }
}

export async function traceCommand(args: string[], root: string, local: string) {
	const ids = args.filter(arg => arg !== '--content')
	if (ids.length !== 1 || !identifier(ids[0]) || ids[0].startsWith('-') || args.filter(arg => arg === '--content').length > 1) {
		console.error(`Usage: ${CMD} trace <code|traceId|submissionId|runId> [--content]`)
		process.exitCode = 1
		return
	}
	const result = await traceTimeline(root, local, ids[0], args.includes('--content'))
	if (result.invalid) console.error(`Trace skipped ${result.invalid} malformed or unstructured log/report line(s); no raw content was printed.`)
	for (const entry of result.timeline) console.log(JSON.stringify(entry))
	if (!result.timeline.length) console.log(`No trace entries found for ${ids[0]} (${result.since} through ${result.today} UTC).`)
}
