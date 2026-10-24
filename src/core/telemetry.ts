import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ROOT, VERSION } from '../paths.ts'
import { scrub } from './secrets.ts'

export type TraceContext = Readonly<{ trace: string; runId?: string }>
const traces = new AsyncLocalStorage<TraceContext>()

// Factory for an item code + page submission, or a fresh tick/page trace when no code is supplied.
export function startTrace(code: string = randomUUID(), submissionId?: string): TraceContext {
	const id = typeof code === 'string' && code.trim() ? code : randomUUID()
	const submission = typeof submissionId === 'string' && submissionId.trim() ? submissionId : randomUUID()
	return Object.freeze({ trace: submissionId === undefined ? id : `${id}:${submission}` })
}
export const currentTrace = (): TraceContext | undefined => traces.getStore()

// A runId-only child inherits the item trace; an explicit trace starts a new scope without its parent's runId.
export function traceRun<T>(ctx: TraceContext | { runId: string }, action: () => T): T {
	const requested = 'trace' in ctx ? ctx.trace : currentTrace()?.trace
	const missing = typeof requested !== 'string' || !requested.trim()
	const trace = missing ? randomUUID() : requested
	const runId = typeof ctx.runId === 'string' && ctx.runId.trim() ? ctx.runId : undefined
	return traces.run(Object.freeze({ trace, ...(runId ? { runId } : {}) }), () => {
		if (missing && !missingTraceLogged) {
			missingTraceLogged = true
			diagnostic({ event: 'telemetry-trace-missing' })
		}
		return action()
	})
}

export const telemetryError = (error: unknown): string => scrub(error instanceof Error ? error.message : String(error)).slice(0, 200)

type EventFields = {
	build: { release: string; commit?: string; error?: string }
	'log-capped': { bytes: number; limit: number }
	'share-hold': { kind: 'customer'; field: 'ids' | 'owningTenantName' | 'customField' }
	'telemetry-trace-missing': Record<never, never>
	'telemetry-field-dropped': { targetEvent: string; field: string }
	'telemetry-write-failed': { targetEvent: string }
	'run-tools': {
		call: number; tool: string; ok: boolean; class: 'ok' | 'tool-error' | 'exception' | 'unfinished' | 'unknown'
		ms?: number; bytes: number; contentTypes: string[]; keys: string[]; keysTruncated: boolean; offloaded: boolean
	}
	'run-tools-invalid': { class: 'invalid-json' | 'inspection-error'; lines?: number }
	'vote-claim-override': { code: string; pr?: number; claim: number | 'approval' | 'others'; vote?: number }
	'members-shape': { memberKeys: string[]; roles: { array: number; undefined: number; other: number }; roleValues: string[]; tenantIdPresent: number }
}
const metadataEvents = {
	build: { privacy: 'metadata', fields: ['release', 'commit', 'error'] },
	'log-capped': { privacy: 'metadata', fields: ['bytes', 'limit'] },
	'share-hold': { privacy: 'metadata', fields: ['kind', 'field'] },
	'telemetry-trace-missing': { privacy: 'metadata', fields: [] },
	'telemetry-field-dropped': { privacy: 'metadata', fields: ['targetEvent', 'field'] },
	'telemetry-write-failed': { privacy: 'metadata', fields: ['targetEvent'] },
	'run-tools': { privacy: 'metadata', fields: ['call', 'tool', 'ok', 'class', 'ms', 'bytes', 'contentTypes', 'keys', 'keysTruncated', 'offloaded'] },
	'run-tools-invalid': { privacy: 'metadata', fields: ['class', 'lines'] },
	'vote-claim-override': { privacy: 'metadata', fields: ['code', 'pr', 'claim', 'vote'] },
	'members-shape': { privacy: 'metadata', fields: ['memberKeys', 'roles', 'roleValues', 'tenantIdPresent'] },
} as const satisfies { [K in keyof EventFields]: { privacy: 'metadata'; fields: readonly (keyof EventFields[K])[] } }

export const TELEMETRY_CATALOG = {
	...metadataEvents,
	sent: { privacy: 'content' }, skipped: { privacy: 'content' }, replied: { privacy: 'content' }, outcome: { privacy: 'content' },
} as const
export type TelemetryEvent = { [K in keyof EventFields]: { event: K } & EventFields[K] }[keyof EventFields]
type Diagnostic = { event: 'telemetry-trace-missing' } | ({ event: 'telemetry-field-dropped' } & EventFields['telemetry-field-dropped']) | ({ event: 'telemetry-write-failed' } & EventFields['telemetry-write-failed'])
let missingTraceLogged = false
const stderrDiagnostic = (entry: Diagnostic) => console.warn(JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...currentTrace(), ...entry }))
let diagnosticLogger: (entry: Diagnostic) => void = stderrDiagnostic
// New/HOST can route diagnostics to Store.log after constructing the Store; stderr is the pre-start fallback.
export function setTelemetryDiagnosticLogger(log: (entry: Diagnostic) => void): () => void {
	const previous = diagnosticLogger
	diagnosticLogger = log
	return () => { diagnosticLogger = previous }
}
function diagnostic(entry: Diagnostic) {
	try { diagnosticLogger(entry) } catch {
		try { stderrDiagnostic(entry) } catch { /* Telemetry cannot stop owner work even when neither log sink can write. */ }
	}
}
export function telemetryPrivacy(event: string): 'metadata' | 'content' | 'unknown' {
	return Object.hasOwn(TELEMETRY_CATALOG, event) ? TELEMETRY_CATALOG[event as keyof typeof TELEMETRY_CATALOG].privacy : 'unknown'
}
export function telemetryEvent<K extends keyof EventFields>(event: K, fields: EventFields[K]): { event: K } & EventFields[K] {
	const allowed: readonly string[] = Object.hasOwn(metadataEvents, event) ? metadataEvents[event].fields : []
	const clean = { ...fields }
	for (const key of Object.keys(clean)) if (!allowed.includes(key)) {
		Reflect.deleteProperty(clean, key)
		diagnostic({ event: 'telemetry-field-dropped', targetEvent: scrub(String(event)).slice(0, 80), field: scrub(key).slice(0, 80) })
	}
	const entry = { ...clean, event }
	if ('error' in clean && clean.error !== undefined) Object.assign(entry, { error: telemetryError(clean.error) })
	return entry
}

let build: Readonly<EventFields['build']> | undefined
export function readTelemetryCommit(root: string): string {
	const dot = join(root, '.git')
	const pointer = statSync(dot).isDirectory() ? undefined : /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, 'utf8'))?.[1]?.trim()
	if (pointer === '') throw new Error('Git telemetry directory is empty')
	const gitDir = pointer ? resolve(root, pointer) : dot
	const commonFile = join(gitDir, 'commondir')
	const common = existsSync(commonFile) ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim()) : gitDir
	const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
	const ref = /^ref:\s*(refs\/[^\s]+)$/.exec(head)?.[1]
	let commit = head
	if (ref) {
		if (ref.split('/').some(part => part === '..' || !part)) throw new Error('Git telemetry ref is invalid')
		const loose = [join(gitDir, ref), join(common, ref)].find(path => existsSync(path))
		const packed = join(common, 'packed-refs')
		commit = loose ? readFileSync(loose, 'utf8').trim() : existsSync(packed)
			? readFileSync(packed, 'utf8').split(/\r?\n/).map(line => line.split(' ')).find(([, name]) => name === ref)?.[0] ?? '' : ''
	}
	if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commit)) throw new Error('Git returned an invalid telemetry commit')
	return commit
}
// Lazy and cached per process: Store.log can import this without creating a Store/update dependency cycle.
export function telemetryBuild(): Readonly<EventFields['build']> {
	if (!build) {
		try {
			const commit = readTelemetryCommit(ROOT)
			build = Object.freeze({ release: VERSION, commit })
		} catch (error) {
			build = Object.freeze({ release: VERSION, error: telemetryError(error) })
		}
	}
	return build
}
export function telemetryBase(machine: string) {
	const { release, commit } = telemetryBuild()
	return { at: new Date().toISOString(), v: `${release}+${commit?.slice(0, 8) ?? 'unknown'}`, machine, pid: process.pid, ...currentTrace() }
}
export function writeTelemetry(machine: string, log: (entry: TelemetryEvent & ReturnType<typeof telemetryBase>) => void, entry: TelemetryEvent): void {
	try { log({ ...telemetryBase(machine), ...entry }) } catch { diagnostic({ event: 'telemetry-write-failed', targetEvent: entry.event }) }
}
