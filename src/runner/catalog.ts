// Each tool server's tools, listed and classified once, cached on this machine (#17, design §2). Servers differ per machine, so the
// cache lives in the local folder, never the synced root. A server that cannot be listed keeps its last good list; with none,
// it offers drafts no tools.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clientFor, McpClient, toolServers, type ServerSpec } from '../adapters/mcp-client.ts'
import { classifyTool, type ToolClass, type ToolInfo } from '../core/tool-class.ts'
import type { Config } from '../core/types.ts'
import { LOCAL_DIR, type Store } from '../store/state.ts'
import { UNTRACKED } from './sharing.ts'

export type CatalogTool = { name: string; cls: ToolClass; why: string; description?: string; info: ToolInfo }
export type Catalog = { server: string; version?: string; hash: string; spec: string; tools: CatalogTool[]; at: string; error?: string; errorAt?: string; triedAt?: string; stale?: true }

const DAY = 86_400_000, RETRY = 10 * 60_000, TIMEOUT = 30_000
// Delegate's own server is never a source of worker tools.
const OWN = new Set(['delegate', 'delegate_worker'])
const dir = () => join(LOCAL_DIR, 'catalog')
const file = (server: string) => join(dir(), `${server.replace(/[^\w.-]/g, '_')}.json`)
const specKey = (s: ServerSpec) => createHash('sha256').update(JSON.stringify({ command: s.command, args: s.args ?? [], env: Object.keys(s.env ?? {}).sort() })).digest('hex').slice(0, 16)
const toolsHash = (tools: ToolInfo[]) => createHash('sha256').update(JSON.stringify(tools.map(t => [t.name, t.annotations ?? null, t.inputSchema ?? null]).sort())).digest('hex').slice(0, 16)

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

// The servers whose tools workers may be given: the owner's servers this machine can start (a remote one cannot be listed here).
export const listable = (cfg: Config) => Object.entries(toolServers(cfg)).filter((e): e is [string, ServerSpec & { command: string }] => !!e[1].command && !OWN.has(e[0]))
// Every cached catalog for the owner's servers, read now (sync, for building a run's tool list).
export function cachedCatalogs(cfg: Config): Record<string, Catalog> {
	return Object.fromEntries(listable(cfg).map(([name]) => [name, readCatalog(name)]).filter((e): e is [string, Catalog] => !!e[1]))
}
export const catalogFiles = () => (existsSync(dir()) ? readdirSync(dir()).filter(f => f.endsWith('.json')) : [])

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// "<server>-<tool>" matches itself and "<server>-*".
export const denied = (deny: string[], t: string) => deny.some(d => d === t || (d.endsWith('-*') && t.startsWith(d.slice(0, -1))))
// The tools a run is given to read (design §2): the owner's built-ins, every read his servers list, and the tools he allowed as reads,
// minus what he switched off. A reply run never calls Teams reads directly, so every chat it reads is recorded (UNTRACKED).
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
	return [...new Set(kind === 'reply' ? tools.filter(t => !UNTRACKED.test(t)) : tools)]
}
// Each tool's own listing, for the write backstop (unsafeRead), from the cached catalogs.
export function catalogInfo(cfg: Config): (server: string, tool: string) => ToolInfo | undefined {
	const cats = cachedCatalogs(cfg)
	return (server, tool) => cats[server]?.tools.find(t => t.name === tool)?.info
}

// Lists each server whose cache is missing, stale, older than a day, or from another command; at most once per server per window.
// A failure keeps the last good list and says so in Health; it is tried again after 10 minutes.
export async function refreshCatalogs(store: Store, cfg: Config, now = Date.now(), force = false): Promise<number> {
	let n = 0
	await Promise.all(listable(cfg).map(async ([name, spec]) => {
		const had = readCatalog(name), key = specKey(spec)
		const fresh = had && !had.stale && !had.error && had.spec === key && now - Date.parse(had.at) < DAY
		const resting = had?.error && had.triedAt && had.spec === key && now - Date.parse(had.triedAt) < RETRY
		if (!force && (fresh || resting)) return
		const client = clientFor(spec, name)
		try {
			const listed = await Promise.race([client.listAll(), new Promise<never>((_, no) => setTimeout(() => no(new Error(`no answer in ${TIMEOUT / 1000} s`)), TIMEOUT).unref())])
			const tools = listed.tools.map(t => ({ name: t.name, ...classifyTool(name, t), ...(t.description ? { description: t.description.split(/(?<=[.!?])\s/)[0].slice(0, 200) } : {}), info: t }))
			const version = listed.server ? `${listed.server.name}@${listed.server.version}` : undefined
			writeCatalog({ server: name, version, hash: toolsHash(listed.tools), spec: key, tools, at: new Date(now).toISOString() })
			store.setHealth(`catalog:${name}`)
			if (!had || had.hash !== toolsHash(listed.tools) || had.version !== version) store.log({ event: 'catalog-listed', server: name, version, tools: tools.length, reads: tools.filter(t => t.cls === 'read').length, unknown: tools.filter(t => t.cls === 'unknown').length })
			n++
		} catch (e) {
			const why = String(e).replace(/^(?:Mcp)?Error: /, '').replace(/^MCP error -?\d+: /, '').slice(0, 160), at = new Date(now).toISOString(), since = had?.error && had.errorAt ? had.errorAt : at
			if (had) writeCatalog({ ...had, error: why, errorAt: since, triedAt: at })
			else writeCatalog({ server: name, hash: '', spec: key, tools: [], at: '', error: why, errorAt: since, triedAt: at })
			store.setHealth(`catalog:${name}`, had?.tools.length ? `Couldn't list ${name}'s tools since ${when(since)}; using the list from ${when(had.at)}.` : `Couldn't list ${name}'s tools (${why}); drafts can't use them until it answers.`)
			store.log({ event: 'catalog-failed', server: name, error: why, cached: !!had?.tools.length })
		} finally { await client.close().catch(() => undefined) }
	}))
	return n
}
