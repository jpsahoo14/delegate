// Each tool server's tools, listed and classified once, cached on this machine (#17, design §2). Servers differ per machine, so the
// cache lives in the local folder, never the synced root. A server that cannot be listed keeps its last good list; with none,
// it offers drafts no tools.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { cliConfigPath, clientFor, McpClient, toolServers, unsetVars, type ServerSpec } from '../adapters/mcp-client.ts'
import { NAME } from '../brand.ts'
import { classifyTool, type ToolClass, type ToolInfo } from '../core/tool-class.ts'
import type { Config } from '../core/types.ts'
import { LOCAL_DIR, type Store } from '../store/state.ts'
import { UNTRACKED } from './sharing.ts'

export type CatalogTool = { name: string; cls: ToolClass; why: string; description?: string; info: ToolInfo }
// cause: what stopped the server, from diagnose (#24); file: the config that names it; fileStamp: that file as it was when a
// missing program was found, so the next try waits for an edit; retryNow: the owner pressed Retry.
export type Cause = 'missing' | 'config' | 'auth' | 'other'
export type Catalog = { server: string; version?: string; hash: string; spec: string; tools: CatalogTool[]; at: string; error?: string; errorAt?: string; triedAt?: string; stale?: true; fails?: number; retryAt?: string; via?: 'cli'; cause?: Cause; command?: string; file?: string; fileStamp?: string; retryNow?: true }

const DAY = 86_400_000, HOUR = 3_600_000, TIMEOUT = 30_000
// A server that keeps failing is tried less often (#23): an hour after its first failure, then every 6 hours, until it lists or its
// config changes. Its last good list, if any, is used meanwhile. A program that isn't installed waits for its config file (#24).
const RETRY = [HOUR, 6 * HOUR]
// Delegate's own server is never a source of worker tools.
const OWN = new Set(['delegate', 'delegate_worker'])
const dir = () => join(LOCAL_DIR, 'catalog')
const file = (server: string) => join(dir(), `${server.replace(/[^\w.-]/g, '_')}.json`)
const specKey = (s: ServerSpec) => createHash('sha256').update(JSON.stringify({ command: s.command, args: s.args ?? [], env: Object.keys(s.env ?? {}).sort(), ...(s.url ? { url: s.url } : {}) })).digest('hex').slice(0, 16)
const toolsHash = (tools: ToolInfo[]) => createHash('sha256').update(JSON.stringify(tools.map(t => [t.name, t.annotations ?? null, t.inputSchema ?? null]).sort())).digest('hex').slice(0, 16)
const stampOf = (path?: string) => { try { const s = statSync(path!); return `${s.mtimeMs}:${s.size}` } catch { return '' } }

export function readCatalog(server: string): Catalog | undefined {
	try { return JSON.parse(readFileSync(file(server), 'utf8')) as Catalog } catch { return undefined }
}
function writeCatalog(c: Catalog) {
	mkdirSync(dir(), { recursive: true })
	const p = file(c.server), tmp = `${p}.tmp-${process.pid}`
	writeFileSync(tmp, JSON.stringify(c, null, 1))
	renameSync(tmp, p)
}
// Listed again at the next refresh: the server said its list changed, or a call named a tool it no longer has.
export function staleCatalog(server: string) {
	const c = readCatalog(server)
	if (c && !c.stale) writeCatalog({ ...c, stale: true })
}
McpClient.onListChanged = staleCatalog
// Retry in Settings (#24): the next check tries the server again, whatever its wait.
export function retryServer(server: string): boolean {
	const c = readCatalog(server)
	if (!c?.error) return false
	writeCatalog({ ...c, retryNow: true })
	return true
}

// Servers the owner chose not to use on this machine (#24): never started, listed or offered here; Settings can bring one back.
const ignoreFile = () => join(LOCAL_DIR, 'tool-servers.json')
export const ignoredServers = (): string[] => { try { return (JSON.parse(readFileSync(ignoreFile(), 'utf8')) as { ignored?: string[] }).ignored ?? [] } catch { return [] } }
export function ignoreServer(server: string, ignore: boolean) {
	const now = new Set(ignoredServers())
	if (ignore) now.add(server); else now.delete(server)
	mkdirSync(LOCAL_DIR, { recursive: true })
	writeFileSync(ignoreFile(), JSON.stringify({ ignored: [...now].sort() }, null, 1))
}
const usable = (name: string, ignored: Set<string>) => !OWN.has(name) && !ignored.has(name)

// The servers whose tools workers may be given: the owner's servers this machine can start (a remote one cannot be listed here).
export const listable = (cfg: Config) => { const ig = new Set(ignoredServers()); return Object.entries(toolServers(cfg)).filter((e): e is [string, ServerSpec & { command: string }] => !!e[1].command && usable(e[0], ig)) }
// Remote servers (a url the AI CLI signs in to itself): Delegate's client can't open them; the AI host lists them through the CLI (#23).
export const remoteServers = (cfg: Config) => { const ig = new Set(ignoredServers()); return Object.entries(toolServers(cfg)).filter(([n, s]) => !s.command && !!s.url && usable(n, ig)).map(([n]) => n) }
// Where a server is set up, for the owner to fix it: Delegate's own settings, or the AI CLI's tool settings (#24).
export function serverSource(cfg: Config, server: string, root: string): { file: string; shown: string } {
	if ((cfg.agent.mcpServers ?? {})[server]) return { file: join(root, 'config.json'), shown: `${NAME}'s settings, config.json` }
	const path = cliConfigPath(cfg.agent.flavor), home = homedir()
	return { file: path, shown: `your AI CLI's tool settings, ${path.startsWith(home) ? `~${path.slice(home.length).replace(/\\/g, '/')}` : path}` }
}
// A failing server whose next try is still ahead: nothing starts it before then, here or in the AI host. One whose program isn't
// installed waits until its config file changes (#24); Retry ends any wait.
export const resting = (c: Catalog | undefined, spec: ServerSpec, now = Date.now()) => !!(c?.error && !c.retryNow && c.spec === specKey(spec)
	&& (c.cause === 'missing' && c.fileStamp !== undefined ? stampOf(c.file) === c.fileStamp : !!c.retryAt && Date.parse(c.retryAt) > now))
// The AI host doesn't start these itself: one resting, or one only the CLI's own connection could list (runs use that one).
export const hostSkips = (c: Catalog | undefined, spec: ServerSpec, now = Date.now()) => resting(c, spec, now) || (c?.via === 'cli' && !c.error && c.spec === specKey(spec))
// Every cached catalog for the owner's servers, read now (sync, for building a run's tool list).
export function cachedCatalogs(cfg: Config): Record<string, Catalog> {
	return Object.fromEntries([...listable(cfg).map(([name]) => name), ...remoteServers(cfg)].map(name => [name, readCatalog(name)]).filter((e): e is [string, Catalog] => !!e[1]))
}
export const catalogFiles = () => (existsSync(dir()) ? readdirSync(dir()).filter(f => f.endsWith('.json')) : [])


// "<server>-<tool>" matches itself and "<server>-*".
export const denied = (deny: string[], t: string) => deny.some(d => d === t || (d.endsWith('-*') && t.startsWith(d.slice(0, -1))))
// The tools a run is given to read (design §2): the owner's built-ins, every read his servers list, and the tools he allowed as reads,
// minus what he switched off. A Claude reply run never calls Teams reads directly, so every chat it reads is known (UNTRACKED).
// Before the tools migration (no deny list yet) it is his old list, as before. A server whose part of a trimmed old list waits for
// a listing keeps that part (pendingTrim), never all its reads.
export function workerTools(cfg: Config, kind: 'reply' | 'job'): string[] {
	const a = cfg.agent
	let tools = a.tools
	if (a.deny) {
		const pending = new Set(a.pendingTrim ?? [])
		const reads = Object.entries(cachedCatalogs(cfg)).filter(([s]) => !pending.has(s)).flatMap(([s, c]) => c.tools.filter(t => t.cls === 'read').map(t => `${s}-${t.name}`))
		const kept = (a.trimmedFrom ?? []).filter(t => [...pending].some(s => t.startsWith(`${s}-`)))
		tools = [...a.tools, ...reads, ...kept, ...(a.allowRead ?? [])].filter(t => !denied(a.deny!, t))
	}
	// Copilot runs read Teams with its own tools; what they read comes from the session log (#21). A Claude run has no such log.
	return [...new Set(kind === 'reply' && a.flavor !== 'copilot' ? tools.filter(t => !UNTRACKED.test(t)) : tools)]
}
// Each tool's own listing, for the write backstop (unsafeRead), from the cached catalogs.
export function catalogInfo(cfg: Config): (server: string, tool: string) => ToolInfo | undefined {
	const cats = cachedCatalogs(cfg)
	return (server, tool) => cats[server]?.tools.find(t => t.name === tool)?.info
}

// Lists each server whose cache is missing, stale, older than a day, or from another command. A failure keeps the last good list,
// says so in Health, and waits for its retry step (1 h, then 6 h) before the next try; setup's own listing (force) tries at once.
// viaCli (#23c): the AI host lists what Delegate's own client can't, through the CLI's connections: every remote server, and a
// command server that won't start here. Without it, a remote server is left alone (Settings says why).
export type CliLister = (servers: string[]) => Promise<Record<string, { tools?: ToolInfo[]; error?: string }> | undefined>
export async function refreshCatalogs(store: Store, cfg: Config, now = Date.now(), force = false, viaCli?: CliLister): Promise<number> {
	let n = 0
	const due = (name: string, spec: ServerSpec) => {
		const had = readCatalog(name), key = specKey(spec)
		const fresh = had && !had.stale && !had.error && had.spec === key && now - Date.parse(had.at) < DAY
		return force || !(fresh || resting(had, spec, now))
	}
	const listed = (name: string, spec: ServerSpec, info: ToolInfo[], version?: string, via?: 'cli') => {
		const had = readCatalog(name), tools = info.map(t => ({ name: t.name, ...classifyTool(name, t), ...(t.description ? { description: t.description.split(/(?<=[.!?])\s/)[0].slice(0, 200) } : {}), info: t }))
		writeCatalog({ server: name, version, hash: toolsHash(info), spec: specKey(spec), tools, at: new Date(now).toISOString(), ...(via ? { via } : {}) })
		store.setHealth(`catalog:${name}`)
		if (!had || had.hash !== toolsHash(info) || had.version !== version) store.log({ event: 'catalog-listed', server: name, version, tools: tools.length, reads: tools.filter(t => t.cls === 'read').length, unknown: tools.filter(t => t.cls === 'unknown').length, ...(via ? { via } : {}) })
		n++
	}
	const failed = (name: string, spec: ServerSpec, d: Diagnosis) => {
		const had = readCatalog(name), key = specKey(spec), at = new Date(now).toISOString(), src = serverSource(cfg, name, store.root)
		// Failures in a row count only for the same command: a config change starts again at the first step.
		const same = had?.error && had.spec === key, fails = (same ? had.fails ?? 1 : 0) + 1, since = same && had.errorAt ? had.errorAt : at
		const retryAt = new Date(now + RETRY[Math.min(fails, RETRY.length) - 1]).toISOString()
		// The last good list stays in use, even from an earlier command; the failure is this command's. It is not a banner: Settings ›
		// Tools shows it, and the top of the page only when an open item needs the server (server-needs.ts, #24).
		const { retryNow: _r, fileStamp: _s, ...kept } = had ?? { server: name, hash: '', tools: [], at: '' }
		writeCatalog({ ...kept, spec: key, error: d.text, cause: d.cause, ...(spec.command ? { command: commandOf(spec, d) } : {}), file: src.file, ...(d.cause === 'missing' ? { fileStamp: stampOf(src.file) } : {}), errorAt: since, triedAt: at, fails, retryAt })
		store.log({ event: 'catalog-failed', server: name, error: d.text, cause: d.cause, cached: !!had?.tools.length, fails, ...(d.cause === 'missing' ? { until: 'its config file changes' } : { retryAt }) })
	}
	const ask: { name: string; spec: ServerSpec; e?: unknown; said?: string }[] = []
	await Promise.all(listable(cfg).filter(([name, spec]) => due(name, spec)).map(async ([name, spec]) => {
		const client = clientFor(spec, name)
		try {
			const got = await Promise.race([client.listAll(), new Promise<never>((_, no) => setTimeout(() => no(new Error(`no answer in ${TIMEOUT / 1000} s`)), TIMEOUT).unref())])
			listed(name, spec, got.tools, got.server ? `${got.server.name}@${got.server.version}` : undefined)
		} catch (e) {
			if (viaCli) ask.push({ name, spec, e, said: client.stderrText() })
			else failed(name, spec, diagnose(e, spec, client.stderrText()))
		} finally { await client.close().catch(() => undefined) }
	}))
	const specs = toolServers(cfg)
	if (viaCli) for (const name of remoteServers(cfg)) if (due(name, specs[name])) ask.push({ name, spec: specs[name] })
	if (!ask.length) return n
	const got = await viaCli!(ask.map(a => a.name)).catch(() => undefined)
	for (const a of ask) {
		const r = got?.[a.name], cli = r?.error && !/no server by that name/.test(r.error) ? r.error : undefined
		if (r?.tools) listed(a.name, a.spec, r.tools, undefined, 'cli')
		// No host to ask this time: a remote server waits for one; a command server's own failure stands, read with what the CLI said.
		else if (a.e !== undefined) failed(a.name, a.spec, diagnose(a.e, a.spec, a.said, cli))
		else if (r?.error) failed(a.name, a.spec, { cause: diagnose('', a.spec, '', r.error).cause, text: r.error })
	}
	return n
}

// Why a server would not start, in plain words, from what it and the AI CLI said (#24). Never a cut-off piece of stderr: a known
// cause gets its own line, and the server's words are quoted only when they are short enough to quote whole.
export type Diagnosis = { cause: Cause; text: string; program?: string }
export function diagnose(e: unknown, spec: ServerSpec, said = '', cli = ''): Diagnosis {
	const raw = String(e ?? '').replace(/^(?:Mcp)?Error: /, '').replace(/^MCP error -?\d+: /, ''), all = `${said}\n${raw}\n${cli}`
	const named = /'([^'\r\n]+)' is not recognized as an internal or external command/i.exec(all)?.[1] ?? /(?:^|\s)([^\s:]+): (?:command )?not found/i.exec(all)?.[1]
	if (named || /program not found|\bENOENT\b|is not recognized as an internal or external command|command not found|cannot find the file specified/i.test(all)) {
		const program = named ?? basename(spec.command ?? '')
		return { cause: 'missing', text: `the program '${program}' isn't installed`, program }
	}
	const unset = unsetVars(spec)
	if (unset.length) return { cause: 'config', text: `it needs ${unset.join(', ')}, which ${unset.length === 1 ? "isn't" : "aren't"} set where ${NAME} runs` }
	if (/needs you to sign in/i.test(all)) return { cause: 'auth', text: 'it needs you to sign in to it in the AI CLI' }
	if (/\b40[13]\b|unauthori[sz]ed|forbidden|authenticat|credential|sign[- ]?in|\blog ?in\b|\btoken\b/i.test(all)) return { cause: 'auth', text: "it couldn't sign in: check its token or sign-in" }
	if (/no answer in \d+ s/.test(all)) return { cause: 'other', text: `it didn't answer in ${TIMEOUT / 1000} s` }
	const code = /exit code (-?\d+)/i.exec(all)?.[1], whole = said.trim().replace(/\s*\r?\n\s*/g, ' ')
	return { cause: 'other', text: `it stopped as it started${code ? ` (exit code ${code})` : ''}${whole && whole.length <= 160 ? `; it said "${whole}"` : ''}` }
}
const commandOf = (spec: ServerSpec, d: Diagnosis) => d.program ?? basename(spec.command ?? '')