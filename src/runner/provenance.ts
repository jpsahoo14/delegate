// What a run read, from the AI CLI's own session log (#21): every chat a reply drew on, for need to know, without wrapper tools.
// Copilot logs each call as tool.execution_start {toolCallId, toolName, arguments, mcpServerName, mcpToolName} and its result as
// tool.execution_complete {toolCallId, success, result.content}. A large result is saved to a file and the log keeps only a preview
// ("Output too large to read at once (N KB). Saved to: <path>"); that file is read instead. A read that names its chat in its
// arguments is known from them. A search whose results can't be read, or a log that can't be read, is "unknown": the reply then
// waits for the owner, never counted as having read nothing (#21b: shapes checked against real CLI 1.0.x logs).
import { existsSync, readFileSync } from 'node:fs'
import { parseMessageLink } from '../adapters/channels.ts'
import type { Knowledge } from '../knowledge/index.ts'
import type { Look } from './sharing.ts'

// One Teams call: how its chats were known, or why they could not be.
export type ReadCall = { tool: string; from: 'args' | 'result' | 'file' | 'none'; chats: number; unknown?: 'saved file gone' | 'no result' | 'unfinished' | 'empty log' }
export type Reads = { chats: string[]; searches: Look[]; unknown: boolean; calls: ReadCall[]; knowledge: number }
type Event = { type?: string; data?: Record<string, unknown> }

const CHAT_ID = /19:[\w.\-=:]+@(?:thread\.(?:v2|tacv2|skype)|unq\.gbl\.spaces)/g
const LINK = /https:\/\/teams\.microsoft\.com\/l\/message\/[^\s"'<>)\]\\]+|https:\/\/teams\.cloud\.microsoft\/l\/message\/[^\s"'<>)\]\\]+/g
const CARD = /topics[\\/]+([^\\/\s"'`]+)[\\/]+(architecture|decisions|faq|status)\.md/g
const SAVED = /Output too large[^\n]*?Saved to:\s*(\S+)/i
// A Teams read tool: its server, or a name that reads chats, channels or messages. The source server is named "teams" by setup.
const chatTool = (d: Record<string, unknown>) => /^teams$/i.test(String(d.mcpServerName ?? '')) || /^teams-/i.test(String(d.toolName ?? ''))
const QUERY_KEYS = ['query', 'queryString', 'q', 'searchText', 'search', 'message', 'pattern']

// The text a result carries, whatever shape the CLI logged it in; undefined when there is none to read.
function resultText(d: Record<string, unknown>): string | undefined {
	const r = d.result as { content?: unknown } | string | undefined
	const c = typeof r === 'string' ? r : r?.content
	if (typeof c === 'string') return c
	if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? x : typeof (x as { text?: unknown })?.text === 'string' ? (x as { text: string }).text : '')).join('\n')
	return undefined
}
// Chat ids as written, percent-encoded in links, or escaped inside JSON text.
const chatsIn = (text: string) => {
	const plain = text.replace(/%3a/gi, ':').replace(/%40/gi, '@').replace(/\\u003a/gi, ':').replace(/\\u0040/gi, '@')
	return [...new Set([...(plain.match(CHAT_ID) ?? []), ...[...text.matchAll(LINK)].map(m => parseMessageLink(m[0])?.chatId).filter((c): c is string => !!c)])]
}
const readSaved = (path: string) => { try { return existsSync(path) ? readFileSync(path, 'utf8') : undefined } catch { return undefined } }

// slice: the run's part of the session log (JSON lines). knowledgeDirs: the folders a card file path can be under.
export function readsOf(slice: string, k: Knowledge, knowledgeDirs: string[], read = readSaved): Reads {
	const events: Event[] = slice.split('\n').filter(l => l.trim()).flatMap(l => { try { return [JSON.parse(l) as Event] } catch { return [] } })
	if (!events.length) return { chats: [], searches: [], unknown: true, calls: [{ tool: '', from: 'none', chats: 0, unknown: 'empty log' }], knowledge: 0 }
	const starts = new Map<string, Record<string, unknown>>(), done = new Set<string>(), chats = new Set<string>(), searches: Look[] = [], calls: ReadCall[] = []
	let knowledge = 0
	const underKnowledge = (s: string) => knowledgeDirs.some(d => s.toLowerCase().includes(d.replace(/\\/g, '/').toLowerCase()) || s.toLowerCase().includes(d.toLowerCase().replace(/\\/g, '\\\\')) || s.toLowerCase().includes(d.toLowerCase()))
	const cardsIn = (s: string) => [...s.matchAll(CARD)].map(m => `${m[1]}/${m[2]}`)
	const fromCard = (ref: string) => { const r = k.read(ref); return Array.isArray(r) ? r.flatMap(c => c.entries.flatMap(e => e.src.map(x => parseMessageLink(x.link)?.chatId))).filter((c): c is string => !!c) : [] }
	for (const e of events) {
		const d = e.data ?? {}
		if (e.type === 'tool.execution_start' && typeof d.toolCallId === 'string') starts.set(d.toolCallId, d)
		if (e.type !== 'tool.execution_complete') continue
		done.add(String(d.toolCallId))
		const start = starts.get(String(d.toolCallId)) ?? {}
		const args = (start.arguments ?? {}) as Record<string, unknown>, argText = JSON.stringify(args), name = String(start.mcpToolName ?? start.toolName ?? '')
		const q = QUERY_KEYS.map(key => args[key]).find((v): v is string => typeof v === 'string')
		if (chatTool(start)) {
			if (d.success === false) continue
			const named = [...chatsIn(argText), ...(typeof args.chatId === 'string' ? [args.chatId] : []), ...(typeof args.teamId === 'string' && typeof args.channelId === 'string' ? [args.channelId] : [])]
			for (const c of named) chats.add(c)
			const shown = resultText(d), saved = shown && SAVED.exec(shown)?.[1]
			const full = saved ? read(saved) : shown
			const found = full === undefined ? [] : chatsIn(full)
			for (const c of found) chats.add(c)
			// A read that names its chat is known from that; a search is known only from its full result.
			const unknown = named.length ? undefined : shown === undefined ? 'no result' as const : saved && full === undefined ? 'saved file gone' as const : undefined
			calls.push({ tool: name, from: named.length ? 'args' : saved && full !== undefined ? 'file' : found.length || full !== undefined ? 'result' : 'none', chats: new Set([...named, ...found]).size, ...(unknown ? { unknown } : {}) })
			if (q) searches.push({ tool: 'teams', q: q.slice(0, 120), n: full === undefined ? 0 : (full.match(LINK) ?? []).length || found.length })
			continue
		}
		// The owner's knowledge read with the built-in view/grep/glob/rg: a card read counts as reading every chat behind it.
		const text = resultText(d)
		if (/^(view|grep|glob|rg|read_file|Read|Grep|Glob)$/.test(name) && underKnowledge(`${argText}\n${text ?? ''}`)) {
			const cards = [...new Set([...cardsIn(argText), ...cardsIn(text ?? '')])]
			knowledge += cards.length
			for (const ref of cards) for (const c of fromCard(ref)) chats.add(c)
			if (q || cards.length) searches.push({ tool: 'knowledge', q: (q ?? cards.join(', ')).slice(0, 120), n: cards.length })
		}
	}
	// A Teams search that started and never finished may have been read; it counts as unknown. A named chat is already counted.
	for (const [id, s] of starts) if (chatTool(s) && !done.has(id)) {
		const args = (s.arguments ?? {}) as Record<string, unknown>
		if (typeof args.chatId === 'string') { chats.add(args.chatId); continue }
		calls.push({ tool: String(s.mcpToolName ?? s.toolName ?? ''), from: 'none', chats: 0, unknown: 'unfinished' })
	}
	return { chats: [...chats], searches: searches.slice(-20), unknown: calls.some(c => c.unknown), calls, knowledge }
}
