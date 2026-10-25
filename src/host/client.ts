// The tick's side of the resident host (#19): find a live host, or start one, and run on it. A host that can't start or answer
// in time leaves the run on today's path, one process per run, so nothing waits on the host.
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { runAgent } from '../adapters/agent.ts'
import { LostResponse } from '../adapters/mcp-client.ts'
import { mcpCaller, type Caller } from '../runner/change.ts'
import { staleCatalog, type CliLister } from '../runner/catalog.ts'
import type { ToolInfo } from '../core/tool-class.ts'
import { inQuietHours } from '../core/policy.ts'
import { dayIn, isWorkHours } from '../core/schedule.ts'
import type { Config } from '../core/types.ts'
import { CLI, VERSION } from '../paths.ts'
import type { RunWorker } from '../runner/dispatch.ts'
import { readJson, writeJson } from '../store/fs.ts'
import { LOCAL_DIR, loadLocal, Store } from '../store/state.ts'
import { hostFile, hostHash, type HostInfo, type HostQuick, type HostResult, type HostRun } from './host.ts'
import { hostOff } from './locate.ts'
import { unavailableTools } from '../core/agent-failure.ts'
import { reportFromText } from '../core/report.ts'
import { intents } from '../core/intents.ts'
import { timedExternal } from '../core/io-time.ts'

const READY_MS = 15_000, BACKOFF = [5_000, 30_000, 120_000]
const markFile = () => join(LOCAL_DIR, 'host-start.json')
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' } }
// fails: hosts that did not start. strikes: host faults in a row (#19b); disables: times it was set aside since its last good run.
type Mark = { at: string; fails: number; strikes?: number; disables?: number; disabledUntil?: string; warmDay?: string }
const readMark = () => readJson<Mark>(markFile(), { at: '', fails: 0 })
// Until when runs skip the host after it failed again and again; undefined when they may use it.
export function hostDisabledUntil(now = Date.now()): string | undefined { const u = readMark().disabledUntil; return u && Date.parse(u) > now ? u : undefined }

function httpCall<T>(h: HostInfo, method: string, path: string, body?: unknown, timeoutMs = 3_000, signal?: AbortSignal): Promise<{ status: number; body: T }> {
	return new Promise((ok, no) => {
		const data = body === undefined ? undefined : JSON.stringify(body)
		const req = request({ host: '127.0.0.1', port: h.port, method, path, signal, headers: { authorization: `Bearer ${h.token}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, res => {
			let s = ''; res.setEncoding('utf8'); res.on('data', c => (s += c)); res.on('end', () => { try { ok({ status: res.statusCode ?? 0, body: JSON.parse(s || '{}') as T }) } catch (e) { no(e) } })
		})
		if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('the AI host did not answer')))
		req.on('error', no)
		req.end(data)
	})
}
const call = timedExternal(httpCall)
const pingOk = (h: HostInfo) => call<{ ok?: boolean }>(h, 'GET', '/ping').then(r => r.status === 200 && !!r.body.ok, () => false)
const current = () => readJson<HostInfo | undefined>(hostFile(), undefined)

// Owner-approved sends fail open: this never discovers/starts a runtime and never falls back to spawn.
export async function quick(prompt: string, jsonSchema: object, timeoutMs = 5000): Promise<unknown> {
	const started = Date.now(), controller = new AbortController()
	let store: Store | undefined, timer: ReturnType<typeof setTimeout> | undefined
	const note = (result: string, reason?: string) => store?.log({ event: 'host-quick', side: 'client', result, reason, ms: Date.now() - started })
	try {
		const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 5000) : 0
		if (budget) timer = setTimeout(() => controller.abort(new Error('the quick check timed out')), budget)
		store = new Store(loadLocal())
		if (!budget) { note('unavailable', 'invalid timeout'); return undefined }
		const h = current(), cfg = store.config()
		if (!h || !cfg || cfg.agent.host === false || cfg.agent.flavor !== 'copilot' || hostDisabledUntil() ||
			inQuietHours(new Date(), cfg.quiet) || typeof h.cli !== 'string' || h.configHash !== hostHash(cfg, h.cli)) {
			note('unavailable', 'no matching warm host'); return undefined
		}
		const ping = await call<{ ok?: boolean; warm?: boolean; draining?: boolean }>(h, 'GET', '/ping', undefined, 0, controller.signal)
		if (ping.status !== 200 || !ping.body.ok || !ping.body.warm || ping.body.draining) { note('unavailable', 'host not warm'); return undefined }
		const remaining = budget - (Date.now() - started)
		if (remaining <= 0) { note('timeout'); return undefined }
		const result = await call<{ result?: unknown }>(h, 'POST', '/quick', { prompt, jsonSchema, timeoutMs: remaining } satisfies Omit<HostQuick, 'jsonSchema'> & { jsonSchema: object }, 0, controller.signal)
		if (result.status !== 200 || !('result' in result.body)) { note('unavailable', `status ${result.status}`); return undefined }
		note('ok')
		return result.body.result
	} catch (error) {
		if (store) note(controller.signal.aborted ? 'timeout' : 'error', error instanceof Error ? error.name : 'unknown')
		else console.error('The AI quick check was unavailable:', error)
		return undefined
	} finally { if (timer) clearTimeout(timer) }
}

// A live host started for this config, else a new one; undefined means "use one process per run" this time. Calls that come together
// (the pool's first runs) share one look and one start, so one tick never starts two hosts.
// fresh: started for this call, so the run it serves is not warm (#25).
type Found = HostInfo & { fresh?: true }
let looking: Promise<Found | undefined> | undefined
export function ensureHost(store: Store, cfg: Config): Promise<Found | undefined> {
	looking ??= findOrStart(store, cfg).finally(() => { looking = undefined })
	return looking
}
async function findOrStart(store: Store, cfg: Config): Promise<Found | undefined> {
	if (hostOff(cfg) || process.env.NODE_TEST_CONTEXT || hostDisabledUntil()) return undefined
	const h = current(), want = hostHash(cfg)
	const live = h && alive(h.pid), answers = live && await pingOk(h!)
	// Alive but silent: it is stopped, so two hosts never share the runs.
	if (h && live && !answers) { try { process.kill(h.pid) } catch { /* gone */ } store.log({ event: 'host-replaced', why: 'did not answer' }) }
	if (h && answers) {
		if (h.configHash === want) return h
		// The config or the CLI changed: the old host finishes its runs and goes; this run starts a new one.
		await call(h, 'POST', '/drain').catch(() => undefined)
		store.log({ event: 'host-replaced', why: 'config changed', from: { hash: h.configHash, delegate: h.delegate, cli: h.cli }, to: { hash: want, delegate: VERSION } })
	}
	const mark = readMark()
	if (mark.fails && Date.now() - Date.parse(mark.at) < BACKOFF[Math.min(mark.fails, BACKOFF.length) - 1]) return undefined
	const log = openSync(join(LOCAL_DIR, 'host.log'), 'a')
	try { spawn(process.execPath, [CLI, 'host'], { detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env }).unref() } finally { closeSync(log) }
	const until = Date.now() + READY_MS
	while (Date.now() < until) {
		await new Promise(r => setTimeout(r, 250))
		const n = current()
		if (n && n.pid !== h?.pid && n.configHash === want && await pingOk(n)) { writeJson(markFile(), { ...readMark(), at: new Date().toISOString(), fails: 0, strikes: 0, disabledUntil: undefined }, store.machine); return { ...n, fresh: true } }
	}
	writeJson(markFile(), { ...mark, at: new Date().toISOString(), fails: mark.fails + 1 }, store.machine)
	store.log({ event: 'host-start-failed', fails: mark.fails + 1 })
	return undefined
}

// Host faults in a row (#19b): at the limit the host drains and runs use one process each for the next backoff step; a good run resets.
const HOST_FAULTS = 2
export const hostFaultLimit = (cfg: Config) => Math.max(1, cfg.agent.hostFaults ?? HOST_FAULTS)
function hostFault(store: Store, cfg: Config, h: HostInfo, what: string, why: string | undefined) {
	const m = readMark(), strikes = (m.strikes ?? 0) + 1, limit = hostFaultLimit(cfg)
	store.log({ event: 'host-fault', what, strikes, error: why?.slice(0, 160) })
	if (strikes < limit) return writeJson(markFile(), { ...m, strikes }, store.machine)
	const disables = (m.disables ?? 0) + 1, until = new Date(Date.now() + BACKOFF[Math.min(disables, BACKOFF.length) - 1]).toISOString()
	writeJson(markFile(), { ...m, at: new Date().toISOString(), strikes: 0, disables, disabledUntil: until }, store.machine)
	store.log({ event: 'host-disabled', faults: strikes, until })
	void call(h, 'POST', '/drain').catch(() => undefined)
}
function hostGood(store: Store) { const m = readMark(); if (m.strikes || m.disables) writeJson(markFile(), { ...m, strikes: 0, disables: 0 }, store.machine) }

// An approved change made on the host's warm connection (#7E, design §6). A host that never took the call (none, not answering,
// not connected to that server, or unable to start it) leaves it to a client of its own, as before; one that took it and then went
// away may have made it, so that is "lost", never tried again here.
export const hostCaller = (store: Store, cfg: Config, fallback: Caller = mcpCaller(cfg)): Caller => async (server, tool, args) => {
	const h = await ensureHost(store, cfg)
	if (!h) return fallback(server, tool, args)
	let r: { status: number; body: { result?: unknown; error?: string; notCalled?: boolean; lost?: boolean } }
	try { r = await call(h, 'POST', '/call', { server, tool, args }, 0) } catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ECONNREFUSED') return fallback(server, tool, args)
		throw new LostResponse(`${server}-${tool}`, e)
	}
	if (r.status === 404) return fallback(server, tool, args)
	if (r.body.lost) throw new LostResponse(`${server}-${tool}`, r.body.error)
	if (r.body.error) { if (r.body.notCalled && r.body.error.includes('has no tool')) staleCatalog(server); throw new Error(r.body.error) }
	hostGood(store)
	return r.body.result
}

// Runs a reply on the host, or on today's path when there is none, it is busy, or it could not run it (that run is made here).
export const hostRunner = (store: Store, own: RunWorker = runAgent): RunWorker => async (agent, input) => {
	const fallback: RunWorker = async (a, i) => ({ ...(await own(a, i)), via: 'spawn' })
	const cfg = store.config(), h = await ensureHost(store, cfg)
	if (!h) return fallback(agent, input)
	let r: { status: number; body: HostResult }
	try { r = await call<HostResult>(h, 'POST', '/run', { agent, input } satisfies HostRun, 0) } catch (e) {
		// It went away mid-run: the run did not finish, and is tried again on the next check like a run that could not start.
		store.log({ event: 'host-lost', workflowId: input.workflowId, error: String(e).slice(0, 160) })
		return { exitCode: 1, ms: 0, error: `Could not start: the AI host stopped during the run` }
	}
	if (r.status === 503 || r.status === 429) return fallback(agent, input)
	// The host never got the run to the model: the same run is made on one process now, resuming the same session.
	if (r.status === 502 && r.body.hostFault) { hostFault(store, cfg, h, `run ${r.body.hostFault}`, r.body.error); return fallback(agent, input) }
	if (r.status !== 200) return { exitCode: 1, ms: 0, error: `The AI host refused the run (${r.status})` }
	const missing = unavailableTools(`${r.body.error ?? ''}\n${r.body.summary ?? ''}`, [...input.extraTools, ...agent.tools.filter(name => name.startsWith('delegate_worker-'))])
	if (missing.length && !store.peekReport(input.workflowId, input.runId) && !reportFromText(r.body.summary, input.workflowId, intents(store.root).map(i => i.id))) {
		store.log({ event: 'host-tools-missing', workflowId: input.workflowId, runId: input.runId, sessionId: input.sessionId, missing, afterTurn: true })
		hostFault(store, cfg, h, 'run tools', `The run ended without a report and said these worker tools were unavailable: ${missing.join(', ')}`)
		return fallback(agent, input)
	}
	hostGood(store)
	// Warm: the host was there before this run and every server it used was already connected (#25).
	return { ...r.body, via: 'host', warm: !h.fresh && r.body.warm !== false }
}

// Tool lists through the AI CLI's own connections (#23c), for servers Delegate's client can't list: none without a host.
export const hostLister = (store: Store, cfg: Config): CliLister => async servers => {
	const h = await ensureHost(store, cfg)
	if (!h) return undefined
	const r = await call<{ servers?: Record<string, { tools?: ToolInfo[]; error?: string }> }>(h, 'POST', '/list', { servers }, 60_000).catch(() => undefined)
	return r?.status === 200 ? r.body.servers : undefined
}

// The first check of a work day starts the AI host, so the day's first reply is warm too (#25 c). Once a day, recorded before the
// start, so a host that can't start is not tried again on every check; runs still start it as before.
export async function prewarmHost(store: Store, cfg: Config, now = new Date()): Promise<void> {
	if (hostOff(cfg) || process.env.NODE_TEST_CONTEXT || !isWorkHours(now, cfg.tz) || inQuietHours(now, cfg.quiet)) return
	const day = dayIn(now, cfg.tz), m = readMark()
	if (m.warmDay === day) return
	writeJson(markFile(), { ...m, warmDay: day }, store.machine)
	const h = await ensureHost(store, cfg)
	store.log({ event: 'host-prewarmed', day, started: !!h?.fresh, ...(h ? {} : { skipped: true }) })
}
