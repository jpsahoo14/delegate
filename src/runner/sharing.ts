import type { ChatLevel, Config, Src, Workflow } from '../core/types.ts'
import { assertTestSafe } from '../store/fs.ts'
import type { Store } from '../store/state.ts'
import type { Source } from '../adapters/source.ts'
import type { Knowledge } from '../knowledge/index.ts'
import { parseMessageLink } from '../adapters/channels.ts'
import { LEVEL_SAYS, heldLevel, offRecord, shareable } from '../core/levels.ts'
import { customerDetails, recordOfLink, shareChatName, type ShareHold, type SourceRecord } from '../core/share.ts'
import { NAME } from '../brand.ts'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { moveOffRecord, restoreOffRecord } from './offrecord.ts'
import { telemetryEvent } from '../core/telemetry.ts'

// Need to know, first slice: a reply may go by itself only when everyone in its chat could already see every other
// conversation it drew on (dev-spec/sharing.md). Owner-approved sends are not held; the owner sees the sources.

// The owner's own AI chat records what history_search found; a worker run's reads come from its session log (provenance.ts, #21).
export const provenanceFile = (root: string, runId: string) => join(root, 'state', 'provenance', `${runId}.json`)
// What a run looked at through Delegate's own tools: the chats its hits came from and each search with its hit count.
// Queries and counts only, never result text (round 3 review: traces must not copy other chats' words).
// tool: where it looked. Teams search when absent (the first records had no tool).
// incident/ado/wiki: a record read through its system's tool; id is the record's ("inc:900001", #36).
export type Look = { tool?: 'teams' | 'knowledge' | 'read' | 'incident' | 'ado' | 'wiki'; q: string; n: number; id?: string }
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

// Member ids per chat, cached for a day, with whether a guest or someone from another tenant is in it. Undefined when they cannot
// be read. A read that finds a guest in a chat marked "Shareable within my org" clears the mark at once and tells the owner once (#36).
export async function membersOf(store: Store, src: Source, chatId: string): Promise<string[] | undefined> {
	const cache = store.members(), hit = cache[chatId]
	// An entry from before names (or guests) were kept is read again, so mentions can find people.
	if (hit?.names && hit.guests !== undefined && Date.now() - Date.parse(hit.at) < 86_400_000) return hit.ids
	const r = await src.members?.(chatId).catch(() => undefined)
	if (!r?.ids?.length) return undefined
	store.saveMembers({ ...store.members(), [chatId]: { ids: r.ids, names: r.names, guests: !!r.guests, at: new Date().toISOString() } })
	if (r.guests) await clearShareable(store, src, chatId)
	return r.ids
}
const guestsIn = (store: Store, chat: string) => store.members()[chat]?.guests
export async function clearShareable(store: Store, src: Source, chatId: string) {
	const cfg = store.config(), level = cfg.chatLevels?.[chatId]
	if (level?.level !== 'shareable') return
	const levels = { ...cfg.chatLevels }
	delete levels[chatId]
	store.saveConfig({ ...cfg, chatLevels: levels })
	store.log({ event: 'shareable-cleared', chat: chatId })
	await src.sendSelf?.(`${level.name} has a guest or someone from outside your org now, so it is a normal chat again: ${NAME} won't quote it elsewhere without your ok.`).catch(() => undefined)
}
const nameOf = (store: Store, chat: string, id: string) => store.members()[chat]?.names?.[id]?.split(/\s+/)[0]

// What a draft used (#36, PE 17:05 point 3). Records: those it cites and read, plus any restricted one it read (it may have used
// it without citing). unread: record links it cites without a read of that id, which count as unknown. Chats: those it cites
// (chat links, the chats behind knowledge cards, documents through where they were shared), and every chat it read unless each
// source is a record it read: a reply that cites no source for a fact still counts the chats it read (fail-closed).
export type DraftUse = { chats: string[]; records: SourceRecord[]; unread: string[]; labelled?: string; customerNames?: { record: string; field: 'owningTenantName' | 'customField'; names: string[] }[] }
export function draftUse(wf: Workflow, k: Knowledge, read: { chats?: string[]; records?: SourceRecord[]; customerNames?: DraftUse['customerNames'] } = {}): DraftUse {
	const sources = wf.draft?.sources ?? [], seen = new Map((read.records ?? []).map(r => [r.id, r]))
	const cited = sources.map(s => ({ s, rec: recordOfLink(s.ref) }))
	const records = new Map<string, SourceRecord>(), unread: string[] = []
	for (const { rec } of cited) if (rec) { const r = seen.get(rec.id); if (r) records.set(r.id, r); else unread.push(rec.label) }
	for (const r of read.records ?? []) if (r.audience === 'restricted') records.set(r.id, r)
	const links = cited.filter(x => !x.rec).flatMap(({ s }) => {
		if (s.ref.startsWith('card:')) { const e = k.read(s.ref); return e && !Array.isArray(e) ? e.src.map(x => x.link) : [] }
		return [s.ref]
	})
	const allRecords = cited.length > 0 && cited.every(x => x.rec && seen.has(x.rec.id))
	const chats = [...links.map(l => parseMessageLink(l)?.chatId).filter((c): c is string => !!c), ...(allRecords ? [] : read.chats ?? [])]
	// A document labelled Confidential or Highly Confidential holds whatever its audience (rule 2).
	const labelled = sources.find(s => /^(?:highly\s+)?confidential\b/i.test(s.label ?? ''))?.label
	return { chats: [...new Set(chats)].filter(c => c !== wf.chat.id), records: [...records.values()], unread: [...new Set(unread)], ...(labelled ? { labelled } : {}), ...(read.customerNames?.length ? { customerNames: read.customerNames } : {}) }
}
// The other conversations a draft drew on (kept for callers that only need the chats).
export const sourceChats = (wf: Workflow, k: Knowledge, read: string[] = []): string[] => draftUse(wf, k, { chats: read }).chats

// A chat the owner marked private or off the record holds whatever uses it, whoever is in it. Checked again at send time, so marking a
// chat stops a reply already scheduled. Shareable within my org is not a hold.
export function markedHold(cfg: Config, chats: string[] = []): ShareHold | undefined {
	const c = chats.find(x => heldLevel(cfg, x))
	return c ? { kind: 'marked', chat: shareChatName(cfg.chatLevels![c].name), level: heldLevel(cfg, c) } : undefined
}
// Knowledge from a chat kept off the record is not searched or read, even if it was learned before the chat was marked. The owner's own "remember" stays.
export const fromOffChat = (cfg: Config, src: Src[]) => !src.some(s => s.link.startsWith('delegate:remember')) && src.some(s => offRecord(cfg, parseMessageLink(s.link)?.chatId))
const flatName = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
const namesIn = (text: string, name: string) => {
	const escaped = flatName(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return !!escaped && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(flatName(text))
}

// Why a draft must wait for the owner (PM rules 1-5), structured; undefined when everyone here could already see every source.
// Owner sends are never blocked by it (core/gate.ts); an automatic send needs none of it.
export async function sharingHold(store: Store, src: Source, wf: Workflow, use: DraftUse): Promise<ShareHold | undefined> {
	const cfg = store.config(), thread = use.records.length || use.customerNames?.length ? store.thread(wf.id).map(m => m.text).join('\n') : ''
	const customer = use.customerNames?.find(r => r.names.some(name => namesIn(wf.draft?.text ?? '', name) && !namesIn(thread, name)))
	const firstUse = use.records[0]?.label ?? use.unread[0] ?? customer?.record
	if (!use.chats.length && !use.records.length && !use.unread.length && !use.labelled && !customer) return undefined
	const marked = markedHold(cfg, use.chats)
	if (marked) return marked
	const chatName = async (c: string) => shareChatName(await src.chatName?.(c).catch(() => undefined)) ?? shareChatName(cfg.chatLevels?.[c]?.name)
	// 1: a guest or someone from outside here, or members that can't be read, and anything from outside this chat.
	const here = await membersOf(store, src, wf.chat.id)
	if (!here) return { kind: 'members', chat: use.chats.length ? await chatName(use.chats[0]) : firstUse }
	if (guestsIn(store, wf.chat.id) ?? wf.chat.guests) return { kind: 'guest', ...(firstUse ? { record: firstUse } : { chat: await chatName(use.chats[0]) }) }
	// 2: a restricted record (or one whose audience is unknown), or a labelled document.
	const restricted = use.records.find(r => r.audience === 'restricted')
	if (restricted) return { kind: 'restricted', record: restricted.label, ...(restricted.why ? { who: restricted.why } : {}) }
	if (use.labelled) return { kind: 'restricted', record: 'A document it uses', who: `labelled ${use.labelled}` }
	if (use.unread.length) return { kind: 'unread', record: use.unread[0] }
	// 3: a conversation someone here wasn't in, unless the owner marked it Shareable within my org (this chat has no guest, above).
	for (const c of use.chats) {
		if (shareable(cfg, c)) continue
		const there = await membersOf(store, src, c)
		if (!there) return { kind: 'members', chat: await chatName(c) }
		const out = here.filter(id => !there.includes(id))
		if (out.length) {
			const names = out.map(id => nameOf(store, wf.chat.id, id)).filter(Boolean)
			return { kind: 'conversation', chat: await chatName(c), ...(names.length === out.length && names.length <= 3 ? { who: names.join(' and ') } : {}) }
		}
	}
	// 4: customer details from a record (ids, emails and its own name fields) that this chat hasn't seen.
	if (use.records.length) {
		const seen = new Set(customerDetails(thread))
		if (customerDetails(wf.draft?.text ?? '').some(d => !seen.has(d))) {
			store.log(telemetryEvent('share-hold', { kind: 'customer', field: 'ids' }))
			return { kind: 'customer', record: use.records[0].label }
		}
	}
	if (customer) {
		store.log(telemetryEvent('share-hold', { kind: 'customer', field: customer.field }))
		return { kind: 'customer', record: customer.record }
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
	// Shareable within my org is for group and meeting chats: a 1:1 is a conversation by nature (PM rule, #36).
	const group = store.workflows().find(w => w.chat.id === id)?.chat.group ?? !/@unq\.gbl\.spaces$/.test(id)
	if (level === 'shareable' && !group) return `Shareable within my org is for group and meeting chats only; ${name} stays a normal chat.`
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
