// The resident AI host (#19): one long-lived Copilot runtime, driven through the SDK the owner's own CLI ships, with the owner's
// tool servers connected once and shared by every run as in-process tool proxies. Each item keeps its own session, resumed per run
// and disconnected after it, so the session log #16 backs up and #21 reads is the same file as before. Ticks talk to it on loopback
// HTTP with a token (host.json), like the page server. Runs it can't take fall back to one process per run (client.ts).
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clientFor, LostResponse, McpClient } from '../adapters/mcp-client.ts'
import { inQuietHours } from '../core/policy.ts'
import { sessionLog, workerEnv, type RunInput, type RunResult } from '../adapters/agent.ts'
import { readRun } from '../core/runinfo.ts'
import type { ToolInfo } from '../core/tool-class.ts'
import type { Config } from '../core/types.ts'
import { VERSION } from '../paths.ts'
import { listable } from '../runner/catalog.ts'
import { LOCAL_DIR, loadLocal, Store } from '../store/state.ts'
import { cliPackage } from './locate.ts'
import { z } from 'zod'
import { IMAGE_DESCRIPTION, IMAGE_LINK, readImage, REPORT, reportTaker, SUBMIT_DESCRIPTION, type ToolOut } from '../worker/tools.ts'

export type HostInfo = { pid: number; port: number; token: string; startedAt: string; cli: string; delegate: string; configHash: string }
// hostFault: the run never reached the model through the host (#19b); the caller makes it on one process instead.
export type HostResult = RunResult & { hostFault?: 'session' | 'no model turn' }
export type HostRun = { agent: Config['agent']; input: RunInput & { workflowId: string; runId: string } }
export const hostFile = () => join(LOCAL_DIR, 'host.json')
const WORKER_SERVER = 'delegate_worker'
const REPORT_JSON = z.toJSONSchema(REPORT) as Record<string, unknown>
const IDLE_MS = 20 * 60_000, LEASE_MS = 5 * 60_000, RUN_MS = 10 * 60_000
// A provider the owner set for the CLI (COPILOT_PROVIDER_*): the CLI applies it per process, an SDK session only when told.
function envProvider(): Record<string, unknown> | undefined {
	const e = process.env
	if (!e.COPILOT_PROVIDER_BASE_URL) return undefined
	return { type: e.COPILOT_PROVIDER_TYPE ?? 'openai', baseUrl: e.COPILOT_PROVIDER_BASE_URL, ...(e.COPILOT_PROVIDER_API_KEY ? { apiKey: e.COPILOT_PROVIDER_API_KEY } : {}), ...(e.COPILOT_PROVIDER_WIRE_API ? { wireApi: e.COPILOT_PROVIDER_WIRE_API } : {}), ...(e.COPILOT_PROVIDER_BEARER_TOKEN ? { bearerToken: e.COPILOT_PROVIDER_BEARER_TOKEN } : {}), ...(e.COPILOT_PROVIDER_MODEL_ID ? { modelId: e.COPILOT_PROVIDER_MODEL_ID } : {}) }
}

// What the host was started with: a change means a new host after the current runs (design §4).
export function hostHash(cfg: Config, cli = cliPackage()?.version ?? ''): string {
	const servers = Object.fromEntries(listable(cfg).map(([n, s]) => [n, { c: s.command, a: s.args ?? [], e: Object.keys(s.env ?? {}).sort() }]))
	return createHash('sha256').update(JSON.stringify({ c: cfg.agent.command, m: cfg.agent.model ?? '', servers, cli, d: VERSION })).digest('hex').slice(0, 16)
}

type Warm = { client: McpClient; tools: Promise<Map<string, ToolInfo>> }
const env = () => Object.fromEntries(Object.entries(workerEnv(process.env)).filter((e): e is [string, string] => typeof e[1] === 'string'))
const under = (path: string, dirs: string[]) => { const p = resolve(path); return dirs.some(d => { const r = relative(resolve(d), p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)) }) }
// A model turn began after since: what happened next is the run's own, not the host's.
const turnStarted = (log: string, since: number) => log.split('\n').some(l => {
	try { const e = JSON.parse(l) as { type?: string; timestamp?: string }; return (e.type === 'assistant.turn_start' || e.type === 'tool.execution_start') && Date.parse(e.timestamp ?? '') >= since } catch { return false }
})
const sessionFile = (id: string) => join(process.env.COPILOT_HOME ?? join(homedir(), '.copilot'), 'session-state', id, 'events.jsonl')

export async function runHost(): Promise<void> {
	const store = new Store(loadLocal()), cfg = store.config(), pkg = cliPackage()
	if (!pkg) throw new Error("The Copilot CLI's own SDK was not found")
	const sdk = await import(pathToFileURL(pkg.sdk).href)
	const t0 = Date.now()
	const client = new sdk.CopilotClient({ connection: { kind: 'stdio', path: process.execPath, args: [pkg.runtime] }, env: env() })
	await client.start()
	// Each of the owner's tool servers connects once; a run that needs one waits only for that one, and only on the first run.
	const warm = new Map<string, Warm>()
	for (const [name, spec] of listable(cfg)) {
		const mcp = clientFor(spec, name), at = Date.now()
		const tools = mcp.listAll().then(r => { store.log({ event: 'host-server-ready', server: name, ms: Date.now() - at, tools: r.tools.length }); return new Map(r.tools.map(t => [t.name, t])) })
		tools.catch(e => store.log({ event: 'host-server-failed', server: name, error: String(e).slice(0, 200) }))
		warm.set(name, { client: mcp, tools })
	}
	const limit = (cfg.maxParallel ?? 3) + (cfg.jobs?.parallel ?? 2)
	let active = 0, draining = false, lastRun = Date.now(), runs = 0
	const serverOf = (tool: string) => [...warm.keys()].filter(n => tool.startsWith(`${n}-`)).sort((a, b) => b.length - a.length)[0]

	async function run({ agent, input }: HostRun): Promise<HostResult> {
		const t = Date.now(), id = input.sessionId
		const names = [...new Set([...agent.tools, ...input.extraTools, 'task_complete'])]
		// A proxy per owner tool the run may use, with the server's own schema; its only shared state is the warm connection.
		const tools: unknown[] = []
		for (const name of names) {
			const server = serverOf(name), w = server ? warm.get(server) : undefined
			if (!server || !w) continue
			const tool = name.slice(server.length + 1), info = (await w.tools.catch(() => new Map<string, ToolInfo>())).get(tool)
			if (!info) continue
			tools.push(sdk.defineTool(name, { description: info.description ?? tool, parameters: info.inputSchema ?? { type: 'object', properties: {} }, skipPermission: true,
				handler: async (args: Record<string, unknown>) => {
					try { const r = await w.client.callText(tool, args ?? {}); return r.error ? { textResultForLlm: r.text, resultType: 'failure', error: r.text.slice(0, 300) } : r.text }
					catch (e) { return { textResultForLlm: `The ${server} tool server failed: ${String(e).slice(0, 300)}`, resultType: 'failure', error: String(e).slice(0, 300) } }
				} }))
		}
		// Delegate's own worker tools run in-process, bound to this workflow and run (step 2): no worker server process per run.
		const take = reportTaker(store, input.workflowId, input.runId)
		const out = (o: ToolOut) => o.image ? { textResultForLlm: o.text, binaryResultsForLlm: [{ data: o.image.data, mimeType: o.image.mimeType, type: 'image' }], resultType: 'success' } : o.error ? { textResultForLlm: o.text, resultType: 'failure', error: o.text.slice(0, 300) } : o.text
		const inProcess: Record<string, () => unknown> = {
			submit_report: () => sdk.defineTool(`${WORKER_SERVER}-submit_report`, { description: SUBMIT_DESCRIPTION, parameters: REPORT_JSON, skipPermission: true, handler: async (args: unknown) => out(take(args)) }),
			image_read: () => sdk.defineTool(`${WORKER_SERVER}-image_read`, { description: IMAGE_DESCRIPTION, parameters: { type: 'object', properties: { link: { type: 'string', description: IMAGE_LINK } }, required: ['link'] }, skipPermission: true, handler: async (args: { link?: string }) => out(await readImage(store, String(args?.link ?? ''))) }),
		}
		const mine = names.filter(n => n.startsWith(`${WORKER_SERVER}-`)).map(n => n.slice(WORKER_SERVER.length + 1))
		for (const n of mine) if (inProcess[n]) tools.push(inProcess[n]())
		// Any other worker tool (a change run's make_change) still comes from the per-run worker server.
		const own = mine.some(n => !inProcess[n]) ? (JSON.parse(readFileSync(input.mcpConfigPath, 'utf8')) as { mcpServers?: Record<string, Record<string, unknown>> }).mcpServers?.[WORKER_SERVER] : undefined
		const dirs = [input.cwd, ...(input.dirs ?? [])]
		const onPermissionRequest = async (r: { kind: string; path?: string; fileName?: string; serverName?: string }) =>
			r.kind === 'read' && r.path && under(r.path, dirs) || r.kind === 'mcp' && r.serverName === WORKER_SERVER || r.kind === 'custom-tool'
				? { kind: 'approve-once' } : { kind: 'reject', feedback: 'Delegate runs may only read the folders they were given and use the tools they were offered.' }
		const provider = envProvider()
		const config = { model: agent.model ?? (provider ? process.env.COPILOT_PROVIDER_MODEL_ID : undefined), ...(provider ? { provider } : {}), tools, availableTools: names, workingDirectory: input.cwd, additionalDirectories: input.dirs ?? [],
			...(own ? { mcpServers: { [WORKER_SERVER]: { type: 'local', command: own.command, args: own.args, env: { ...env(), ...(own.env as Record<string, string>) }, tools: ['*'] } } } : {}),
			onPermissionRequest, enableConfigDiscovery: false, skipCustomInstructions: true, memory: { enabled: false } }
		let session: { sendAndWait: (o: { prompt: string }, ms?: number) => Promise<{ data?: { content?: string } } | undefined>; disconnect: () => Promise<void> } | undefined
		// A host fault (#19b): the session could not be opened, or the prompt never reached a model turn. The run is then made on
		// one process instead; a model or tool error after the turn started is the run's own failure, as on that path.
		let opened = false
		try {
			session = existsSync(sessionFile(id)) ? await client.resumeSession(id, config) : await client.createSession({ sessionId: id, ...config })
			opened = true
			const r = await session!.sendAndWait({ prompt: input.prompt }, RUN_MS)
			// The session log is complete once the session lets go of it.
			await session!.disconnect().catch(() => undefined); session = undefined
			const used = readRun('', t, process.env, sessionLog('copilot', id), Date.now()).use
			return { exitCode: 0, ms: Date.now() - t, summary: r?.data?.content, used }
		} catch (e) {
			await session?.disconnect().catch(() => undefined); session = undefined
			const why = String(e).replace(/^Error: /, '').slice(0, 400)
			const turned = opened && turnStarted(sessionLog('copilot', id), t)
			return { exitCode: 1, ms: Date.now() - t, error: `The AI host could not finish the run: ${why}`, ...(turned ? {} : { hostFault: opened ? 'no model turn' : 'session' }) }
		} finally { await session?.disconnect().catch(() => undefined) }
	}

	const token = randomUUID()
	const reply = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
	const body = (req: IncomingMessage) => new Promise<string>((ok, no) => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => ok(s)); req.on('error', no) })
	const server = createServer(async (req, res) => {
		if (req.headers.authorization !== `Bearer ${token}`) return reply(res, 401, { error: 'no' })
		if (req.method === 'GET' && req.url === '/ping') return reply(res, 200, { ok: true, pid: process.pid, active, runs, draining })
		if (req.method === 'POST' && req.url === '/drain') { draining = true; reply(res, 200, { ok: true }); return maybeExit() }
		// An approved change made on the warm connection (#7E, design §6). Not known here: the caller uses its own client instead.
		if (req.method === 'POST' && req.url === '/call') {
			const { server: name, tool, args } = JSON.parse(await body(req)) as { server: string; tool: string; args: Record<string, unknown> }
			const w = warm.get(name)
			if (!w || draining) return reply(res, 404, { error: 'not here' })
			active++; lastRun = Date.now()
			try {
				// Before the call: the server would not start or list its tools here. The caller makes the call itself (#19b).
				try { await w.tools } catch (e) { return reply(res, 502, { error: String(e).replace(/^Error: /, '').slice(0, 400), hostFault: 'server' }) }
				const bad = await w.client.argsProblem(tool, args)
				if (bad) return reply(res, 200, { error: bad, notCalled: true })
				reply(res, 200, { result: await w.client.call(tool, args) })
			} catch (e) { reply(res, 200, { error: String(e).replace(/^Error: /, '').slice(0, 400), lost: e instanceof LostResponse }) }
			finally { active--; lastRun = Date.now(); maybeExit() }
			return
		}
		if (req.method === 'POST' && req.url === '/run') {
			if (draining) return reply(res, 503, { error: 'draining' })
			if (active >= limit) return reply(res, 429, { error: 'busy' })
			active++; runs++
			try { const r = await run(JSON.parse(await body(req)) as HostRun); reply(res, r.hostFault ? 502 : 200, r) }
			catch (e) { reply(res, 500, { error: String(e).slice(0, 300) }) }
			finally { active--; lastRun = Date.now(); maybeExit() }
			return
		}
		reply(res, 404, { error: 'unknown' })
	})
	server.requestTimeout = 0; server.headersTimeout = 60_000
	await new Promise<void>(ok => server.listen(0, '127.0.0.1', () => ok()))
	const info: HostInfo = { pid: process.pid, port: (server.address() as { port: number }).port, token, startedAt: new Date().toISOString(), cli: pkg.version, delegate: VERSION, configHash: hostHash(cfg, pkg.version) }
	const tmp = `${hostFile()}.${process.pid}`; writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 }); renameSync(tmp, hostFile())
	store.log({ event: 'host-started', pid: process.pid, cli: pkg.version, startMs: Date.now() - t0, servers: [...warm.keys()] })

	let stopping = false
	async function stop(why: string) {
		if (stopping) return
		stopping = true
		store.log({ event: 'host-stopped', why, runs })
		server.close()
		await Promise.all([...warm.values()].map(w => w.client.close().catch(() => undefined)))
		await client.stop().catch(() => undefined)
		try { const now = JSON.parse(readFileSync(hostFile(), 'utf8')) as HostInfo; if (now.pid === process.pid) rmSync(hostFile(), { force: true }) } catch { /* gone */ }
		process.exit(0)
	}
	let drainWhy = 'drained'
	function maybeExit() { if (draining && !active) void stop(drainWhy) }
	// Idle for 20 minutes, or quiet hours begin with nothing running: finish what runs, then go (design §7). A tick with work starts it again.
	setInterval(() => {
		const now = store.config()
		if (!active && (Date.now() - lastRun > IDLE_MS || inQuietHours(new Date(), now?.quiet))) void stop(Date.now() - lastRun > IDLE_MS ? 'idle' : 'quiet hours')
	}, 30_000).unref()
	// Another machine reads the chats now: the owner moved it (config), or it took the lease. Finish what runs, then go (design §5).
	setInterval(() => {
		const s = new Store(loadLocal()), l = s.lease(), pinned = s.config()?.runner
		if (l && l.machine !== store.machine || pinned && pinned !== store.machine) { draining = true; drainWhy = 'another machine reads the chats'; maybeExit() }
	}, LEASE_MS).unref()
	for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void stop(sig))
}
