// The tools migration (#17, design §3): an old allow list of read tools becomes "every read tool, minus what the owner switched off".
// Used once by `migrate` (schema 1 → 2), by the setup tools step when it is given a list, and by the tick to finish a deferred server.
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { toolServers } from '../adapters/mcp-client.ts'
import { site } from '../core/site.ts'
import type { Config } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { readCatalog } from './catalog.ts'

// The read tools setup used to give workers, per server. Data only: it tells an untouched old list from a hand-trimmed one.
export const OLD_READ_DEFAULTS: Record<string, string[]> = {
	teams: ['ListChats', 'ListChatMessages', 'GetChatMessage', 'GetChat', 'SearchTeamMessagesQueryParameters', 'ListChannelMessages', 'ListChannelMessageReplies'],
	calendar: ['ListCalendarView', 'FindMeetingTimes', 'GetUserDateAndTimeZoneSettings'],
	ado: ['repo_pull_request', 'repo_pull_request_thread', 'pipelines_build', 'pipelines_build_log', 'wit_work_item', 'search_workitem', 'search_wiki', 'wiki'],
}
const oldDefaults = () => ({ ...OLD_READ_DEFAULTS, ...site().read })

// A server's catalog reads, when it has been listed; undefined when it never has.
const readsOf = (server: string) => { const c = readCatalog(server); return c?.tools.length ? c.tools.filter(t => t.cls === 'read').map(t => `${server}-${t.name}`) : undefined }

export type ToolsMove = { mode: 'all-reads' | 'trimmed'; deny: string[]; pending: string[]; allowRead: string[] }
// Converts an old list. Built-ins (no server prefix) stay in tools. A server whose defaults are all there gets every read; one with a
// default missing keeps the owner's choice as a deny list, from its catalog, or waits for a listing (pendingTrim), never denying all.
// Tools he added beyond the defaults stay allowed (allowRead). A config already converted is returned as it is.
export function convertTools(cfg: Config): { cfg: Config; move?: ToolsMove } {
	const a = cfg.agent
	if (a.deny) return { cfg }
	const defaults = oldDefaults(), servers = [...new Set([...Object.keys(toolServers(cfg)), ...Object.keys(defaults)])]
	const serverOf = (t: string) => servers.filter(s => t.startsWith(`${s}-`)).sort((x, y) => y.length - x.length)[0]
	const old = a.tools ?? [], builtins = old.filter(t => !serverOf(t))
	const used = Object.keys(defaults).filter(s => (a.mcpServers as Record<string, unknown> | undefined)?.[s] || old.some(t => serverOf(t) === s))
	const trimmed = used.filter(s => defaults[s].some(t => !old.includes(`${s}-${t}`)))
	const allowRead = old.filter(t => serverOf(t) && !defaults[serverOf(t)!]?.includes(t.slice(serverOf(t)!.length + 1)))
	const deny: string[] = [], pending: string[] = []
	for (const s of trimmed) { const r = readsOf(s); if (r) deny.push(...r.filter(t => !old.includes(t))); else pending.push(s) }
	const agent: Config['agent'] = { ...a, tools: builtins, deny, ...(allowRead.length ? { allowRead } : {}), ...(trimmed.length ? { toolsTrimmed: true } : {}), ...(pending.length ? { pendingTrim: pending, trimmedFrom: old } : {}) }
	return { cfg: { ...cfg, agent }, move: { mode: trimmed.length ? 'trimmed' : 'all-reads', deny, pending, allowRead } }
}

// Once per root, before the change: config.json as it was, next to it.
export function backupConfig(store: Store, now = new Date()): string | undefined {
	const from = join(store.root, 'config.json'), to = join(store.root, `config.backup-${now.toISOString().slice(0, 10)}.json`)
	if (!existsSync(from)) return undefined
	if (!existsSync(to)) copyFileSync(from, to)
	return to
}

export function migrateTools(store: Store, why: string): ToolsMove | undefined {
	const cfg = store.config()
	if (!cfg?.agent) return undefined
	const { cfg: next, move } = convertTools(cfg)
	if (!move) return undefined
	const backup = backupConfig(store)
	store.saveConfig(next)
	store.log({ event: 'tools-migrated', why, mode: move.mode, deny: move.deny.length, pending: move.pending, allowRead: move.allowRead.length, backup: backup?.split(/[\\/]/).pop() })
	return move
}

// One line for the owner about what the migration did.
export const toolsSaid = (m: ToolsMove) => m.mode === 'all-reads'
	? `Drafts may now read with every read tool your tool servers offer${m.allowRead.length ? `, plus the ${m.allowRead.length} you added` : ''}; turn any off in Settings.`
	: `Your shorter list of read tools is kept: ${m.deny.length} read tool(s) stay off${m.pending.length ? `, and ${m.pending.join(', ')} is settled once it answers` : ''}. Settings › Tools can allow them all.`

// A server whose part of a trimmed old list waited for a listing: once it is listed, its reads the owner did not have are denied.
export function finishTrim(store: Store): number {
	const cfg = store.config(), a = cfg?.agent
	if (!a?.pendingTrim?.length) return 0
	const done = a.pendingTrim.filter(s => readsOf(s))
	if (!done.length) return 0
	const old = a.trimmedFrom ?? []
	const deny = [...new Set([...(a.deny ?? []), ...done.flatMap(s => readsOf(s)!.filter(t => !old.includes(t)))])]
	const pending = a.pendingTrim.filter(s => !done.includes(s))
	const { pendingTrim: _p, trimmedFrom: _t, ...rest } = a
	store.saveConfig({ ...cfg, agent: { ...rest, deny, ...(pending.length ? { pendingTrim: pending, trimmedFrom: old } : {}) } })
	store.log({ event: 'tools-migrated', why: 'deferred', servers: done, deny: deny.length, pending })
	return done.length
}
