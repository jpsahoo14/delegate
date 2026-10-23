import type { ChatLevel, Config, Src, Workflow } from '../core/types.ts'
import { assertTestSafe } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import type { Source } from '../adapters/source.ts'
import type { Knowledge } from '../knowledge/index.ts'
import { parseMessageLink } from '../adapters/channels.ts'
import { LEVEL_SAYS, levelOf, offRecord } from '../core/levels.ts'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { moveOffRecord, restoreOffRecord } from './offrecord.ts'

// Need to know, first slice: a reply may go by itself only when everyone in its chat could already see every other
// conversation it drew on (dev-spec/sharing.md). Owner-approved sends are not held; the owner sees the sources.

// The owner's own AI chat records what history_search found; a worker run's reads come from its session log (provenance.ts, #21).
export const provenanceFile = (root: string, runId: string) => join(root, 'state', 'provenance', `${runId}.json`)
// What a run looked at through Delegate's own tools: the chats its hits came from and each search with its hit count.
// Queries and counts only, never result text (round 3 review: traces must not copy other chats' words).
// tool: where it looked. Teams search when absent (the first records had no tool).
export type Look = { tool?: 'teams' | 'knowledge' | 'read'; q: string; n: number }
export type Looked = { chats: string[]; searches: Look[] }
export function recordRead(root: string, runId: string | undefined, links: string[], query?: string, tool: Look['tool'] = 'teams', n = links.length) {
	if (!runId) return
	const f = provenanceFile(root, runId)
	const had: Looked = existsSync(f) ? normal(JSON.parse(readFileSync(f, 'utf8'))) : { chats: [], searches: [] }
	const chats = links.map(l => parseMessageLink(l)?.chatId).filter((c): c is string => !!c)
	assertTestSafe(f)
	mkdirSync(dirname(f), { recursive: true })
	writeFileSync(f, JSON.stringify({ chats: [...new Set([...had.chats, ...chats])], searches: [...had.searches, ...(query ? [{ tool, q: query.slice(0, 120), n }] : [])].slice(-20) }))
}
const normal = (v: unknown): Looked => (Array.isArray(v) ? { chats: v as string[], searches: [] } : (v as Looked))
export function takeRead(root: string, runId: string): Looked {
	const f = provenanceFile(root, runId)
	if (!existsSync(f)) return { chats: [], searches: [] }
	try { return normal(JSON.parse(readFileSync(f, 'utf8'))) } finally { rmSync(f, { force: true }) }
}

// Teams read tools a reply run must not call directly, so every chat it reads is known.
export const UNTRACKED = /^teams-(List|Get|Search)/i

// Member ids per chat, cached for a day. Undefined when they cannot be read.
export async function membersOf(store: Store, src: Source, chatId: string): Promise<string[] | undefined> {
	const cache = store.members(), hit = cache[chatId]
	// An entry from before names were kept is read again, so mentions can find people.
	if (hit?.names && Date.now() - Date.parse(hit.at) < 86_400_000) return hit.ids
	const r = await src.members?.(chatId).catch(() => undefined)
	if (!r?.ids?.length) return undefined
	store.saveMembers({ ...store.members(), [chatId]: { ids: r.ids, names: r.names, at: new Date().toISOString() } })
	return r.ids
}
const nameOf = (store: Store, chat: string, id: string) => store.members()[chat]?.names?.[id]?.split(/\s+/)[0]

// The other conversations a draft drew on: Teams links it cites, chats behind knowledge entries it cites, and chats it read.
export function sourceChats(wf: Workflow, k: Knowledge, read: string[] = []): string[] {
	const links = (wf.draft?.sources ?? []).flatMap(s => {
		if (s.ref.startsWith('card:')) { const e = k.read(s.ref); return e && !Array.isArray(e) ? e.src.map(x => x.link) : [] }
		return [s.ref]
	})
	const chats = [...links.map(l => parseMessageLink(l)?.chatId).filter((c): c is string => !!c), ...read]
	return [...new Set(chats)].filter(c => c !== wf.chat.id)
}

// A chat the owner marked holds whatever uses it, whoever is in it. Checked again at send time, so marking a chat stops a reply already scheduled.
export function markedHold(cfg: Config, chats: string[] = []): string | undefined {
	const c = chats.find(x => levelOf(cfg, x))
	return c ? `Uses something from ${cfg.chatLevels![c].name}, which you marked ${levelOf(cfg, c) === 'off' ? 'off the record' : 'private'}` : undefined
}
// Knowledge from a chat kept off the record is not searched or read, even if it was learned before the chat was marked. The owner's own "remember" stays.
export const fromOffChat = (cfg: Config, src: Src[]) => !src.some(s => s.link.startsWith('delegate:remember')) && src.some(s => offRecord(cfg, parseMessageLink(s.link)?.chatId))

// The reason a draft must wait for the owner, or undefined when everyone here could already see each source.
export async function sharingHold(store: Store, src: Source, wf: Workflow, chats: string[]): Promise<string | undefined> {
	if (!chats.length) return undefined
	const marked = markedHold(store.config(), chats)
	if (marked) return marked
	const here = await membersOf(store, src, wf.chat.id)
	for (const c of chats) {
		const there = await membersOf(store, src, c)
		const name = (await src.chatName?.(c).catch(() => undefined)) ?? 'another chat'
		if (!here || !there) return `Uses something from ${name}, and I could not check who is in each chat`
		const out = here.filter(id => !there.includes(id))
		if (out.length) {
			const names = out.map(id => nameOf(store, wf.chat.id, id)).filter(Boolean)
			return `Uses something from ${name}, and ${names.length === out.length && names.length <= 3 ? `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} not in it` : 'not everyone here is in that chat'}`
		}
	}
	return undefined
}

// The owner marks a chat in plain words. `chat` is a message link, a chat id, or a name Delegate knows from its items.
export function setChatLevel(store: Store, chat: string, level: ChatLevel | 'normal', said?: string): string {
	const cfg = store.config(), levels = { ...cfg.chatLevels }, known = new Map<string, string>()
	for (const w of store.workflows()) if (w.chat.id && w.chat.id !== cfg.source?.selfChatId) known.set(w.chat.id, w.chat.name)
	for (const [id, v] of Object.entries(levels)) known.set(id, v.name)
	const q = chat.trim(), lc = q.toLowerCase(), direct = parseMessageLink(q)?.chatId ?? (/^\d+:\S+$/.test(q) ? q : undefined)
	const named = (exact: boolean) => [...known].filter(([, n]) => (exact ? n.toLowerCase() === lc : n.toLowerCase().includes(lc))).map(([i]) => i)
	const ids = direct ? [direct] : named(true).length ? named(true) : named(false)
	if (!ids.length) return `I don't know a chat called "${q}". Paste a link to any message in it.`
	if (ids.length > 1) return `More than one chat matches "${q}": ${ids.map(i => known.get(i)).join('; ')}. Say which one, or paste a link to a message in it.`
	const id = ids[0], name = said?.trim() || known.get(id) || 'That chat'
	// Off the record takes the chat's facts out of the cards runs read, and back when it is no longer off (#21 §2c).
	const wasOff = levels[id]?.level === 'off'
	if (level === 'normal') {
		if (!levels[id]) return `${name} was not marked, so nothing changed.`
		delete levels[id]
		store.saveConfig({ ...cfg, chatLevels: levels })
		if (wasOff) restoreOffRecord(store, id)
		return `${name} is normal again.`
	}
	store.saveConfig({ ...cfg, chatLevels: { ...levels, [id]: { level, name, at: new Date().toISOString() } } })
	if (level === 'off' && !wasOff) moveOffRecord(store, id)
	else if (level !== 'off' && wasOff) restoreOffRecord(store, id)
	return `${name} is ${LEVEL_SAYS[level]}. Say "${name} is normal again" to undo.`
}
