import type { McpClient } from './mcp-client.ts'
import type { TeamsMsg } from './source-teams.ts'

// A channel thread read like a chat: "ch|<teamId>|<channelId>|<rootId>". Replies go to the thread (owner question 2).
export const threadId = (teamId: string, channelId: string, rootId: string) => `ch|${teamId}|${channelId}|${rootId}`
export const isThread = (id: string) => id.startsWith('ch|')
export function parseThread(id: string) { const [, teamId, channelId, rootId] = id.split('|'); return { teamId, channelId, rootId } }
export const threadLink = (id: string, msgId: string) => { const t = parseThread(id); return `https://teams.microsoft.com/l/message/${encodeURIComponent(t.channelId)}/${msgId}?groupId=${t.teamId}&parentMessageId=${t.rootId}` }
// The shape Teams copies: the chat ID as is, and the chat context, without which Teams looks for a channel message (bug 10-21).
export const messageLink = (chatId: string, msgId: string) => isThread(chatId) ? threadLink(chatId, msgId) : `https://teams.microsoft.com/l/message/${chatId}/${msgId}?context=%7B%22contextType%22%3A%22chat%22%7D`
const isChannel = (chatId = '') => /@thread\.(tacv2|skype)$/.test(chatId)

// What discovery remembers between ticks, so search runs at most every 30 minutes and each thread is checked every 5.
export type WatchedChannel = { teamId: string; channelId: string; name: string }

// A channel or message link: /l/channel/<channelId>/<name>?groupId=<teamId>, or a message link with groupId.
export function parseChannelLink(link: string): WatchedChannel | undefined {
	try {
		const u = new URL(link), parts = u.pathname.split('/').map(decodeURIComponent), teamId = u.searchParams.get('groupId')
		const i = parts.findIndex(p => p === 'channel' || p === 'message')
		if (!teamId || i < 0 || !parts[i + 1]?.startsWith('19:')) return undefined
		return { teamId, channelId: parts[i + 1], name: u.searchParams.get('channelName') ?? (parts[i] === 'channel' ? parts[i + 2] : undefined) ?? 'channel' }
	} catch { return undefined }
}

// A Teams message link: a chat message, or a channel message (groupId) whose thread is its parent or itself.
export function parseMessageLink(link: string): { chatId: string; msgId: string } | undefined {
	try {
		const u = new URL(link.trim()), parts = u.pathname.split('/').map(decodeURIComponent), i = parts.indexOf('message')
		const id = parts[i + 1], msgId = parts[i + 2], teamId = u.searchParams.get('groupId')
		if (i < 0 || !id?.startsWith('19:') || !/^\d+$/.test(msgId ?? '')) return undefined
		if (teamId && isChannel(id)) { const root = u.searchParams.get('parentMessageId'); return { chatId: threadId(teamId, id, root && root !== '0' ? root : msgId), msgId } }
		return { chatId: id, msgId }
	} catch { return undefined }
}

export type ThreadCache = {
	scannedAt?: string
	threads: { id: string; name: string; mine: boolean; hitAt: string }[]
	roots: Record<string, string>
	names: Record<string, string>
	last: Record<string, { at: string; checkedAt: string }>
}
export const emptyThreadCache = (): ThreadCache => ({ threads: [], roots: {}, names: {}, last: {} })

type Hit = { resource?: { id?: string; createdDateTime?: string; chatId?: string; channelIdentity?: { teamId?: string; channelId?: string }; from?: { emailAddress?: { name?: string } } } }
type Page = { replies?: TeamsMsg[]; messages?: TeamsMsg[]; value?: TeamsMsg[]; nextLink?: string; '@odata.nextLink'?: string }
const items = (p: Page) => p.replies ?? p.messages ?? p.value ?? []
const next = (p: Page) => p.nextLink ?? p['@odata.nextLink']

export class Threads {
	private readonly mcp: McpClient
	private readonly owner: string
	// How many newest thread starts to read per channel, and how many of those to open for replies. Bounded: each opened thread is one call.
	readonly depth: { starts: number; open: number }
	constructor(mcp: McpClient, owner: string, depth = { starts: 30, open: 30 }) { this.mcp = mcp; this.owner = owner; this.depth = depth }

	private async search(kql: string, pages = 2): Promise<Hit[]> {
		const out: Hit[] = []
		for (let from = 0; from < pages * 25; from += 25) {
			const r = await this.mcp.call<{ rawResponse?: string }>('SearchTeamMessagesQueryParameters', { queryString: kql, from })
			const c = JSON.parse(r.rawResponse ?? '{}').value?.[0]?.hitsContainers?.[0] ?? {}
			out.push(...(c.hits ?? []))
			if (!c.moreResultsAvailable) break
		}
		return out
	}

	// Up to max replies; truncated says more were left unread, so the caller can report a gap instead of claiming completeness.
	async replies(teamId: string, channelId: string, rootId: string, max = 1000): Promise<{ msgs: TeamsMsg[]; truncated: boolean }> {
		const all: TeamsMsg[] = []
		let p = await this.mcp.call<Page>('ListChannelMessageReplies', { teamId, channelId, messageId: rootId, maxReplies: 50 })
		for (;;) {
			all.push(...items(p))
			const n = next(p)
			if (!n) return { msgs: all, truncated: false }
			if (all.length >= max) return { msgs: all, truncated: true }
			p = await this.mcp.call<Page>('ListChannelMessageReplies', { teamId, channelId, messageId: rootId, nextLink: n })
		}
	}

	// A hit is a thread start if it has a reply list; otherwise it is found among the channel's newest starts.
	private async rootOf(teamId: string, channelId: string, id: string, cache: ThreadCache): Promise<string | undefined> {
		const key = `${channelId}/${id}`
		if (key in cache.roots) return cache.roots[key] || undefined
		let root = ''
		try { await this.mcp.call('ListChannelMessageReplies', { teamId, channelId, messageId: id, maxReplies: 1 }); root = id } catch {
			const starts = items(await this.mcp.call<Page>('ListChannelMessages', { teamId, channelId, top: 30 }))
			for (const s of starts) if ((await this.replies(teamId, channelId, s.id, 100)).msgs.some(r => r.id === id)) { root = s.id; break }
		}
		cache.roots[key] = root
		return root || undefined
	}

	// In the channels the owner named: thread starts from the last week that the owner started, that mention the owner,
	// or whose replies include the owner or mention them. Graph search has no channel filter, so this is the reliable path.
	private async scanChannel(ch: WatchedChannel, sinceIso: string): Promise<{ root: string; at: string; mine: boolean }[]> {
		const me = this.owner.toLowerCase(), first = me.split(' ')[0]
		const mentions = (m: TeamsMsg) => new RegExp(`<at[^>]*>[^<]*${first}`, 'i').test(m.body?.content ?? '')
		const byMe = (m: TeamsMsg) => (m.from?.displayName ?? '').toLowerCase() === me
		// Recency is the thread's, not the start's: a fresh reply on an older start counts (review p2-7 R14).
		const starts = items(await this.mcp.call<Page>('ListChannelMessages', { teamId: ch.teamId, channelId: ch.channelId, top: this.depth.starts }))
		const out: { root: string; at: string; mine: boolean }[] = []
		for (const s of starts.slice(0, this.depth.open)) {
			const at0 = s.lastModifiedDateTime ?? s.createdDateTime
			if ((byMe(s) || mentions(s)) && at0 >= sinceIso) { out.push({ root: s.id, at: at0, mine: byMe(s) }); continue }
			const rs = (await this.replies(ch.teamId, ch.channelId, s.id, 100).catch(() => ({ msgs: [] as TeamsMsg[] }))).msgs
			const at = [at0, ...rs.map(r => r.createdDateTime)].sort().at(-1)!
			if (at >= sinceIso && (byMe(s) || mentions(s) || rs.some(r => byMe(r) || mentions(r)))) out.push({ root: s.id, at, mine: byMe(s) })
		}
		return out
	}

	// Threads the owner started, posted in, or was @mentioned in, in the last week (capped).
	async discover(sinceIso: string, cache: ThreadCache, now = new Date(), channels: WatchedChannel[] = []): Promise<ThreadCache> {
		if (cache.scannedAt && now.getTime() - Date.parse(cache.scannedAt) < 30 * 60_000) return cache
		const since = sinceIso.slice(0, 10)
		const found = new Map(cache.threads.map(t => [t.id, t]))
		for (const ch of channels) {
			for (const t of await this.scanChannel(ch, sinceIso).catch(() => [])) {
				const id = threadId(ch.teamId, ch.channelId, t.root), old = found.get(id)
				found.set(id, { id, name: ch.name, mine: !!old?.mine || t.mine, hitAt: [old?.hitAt ?? '', t.at].sort().at(-1)! })
			}
		}
		const hits = [...await this.search(`from:"${this.owner}" AND sent>=${since}`), ...await this.search(`IsMentioned:true AND sent>=${since}`)]
		for (const h of hits.filter(h => isChannel(h.resource?.chatId) && h.resource?.channelIdentity?.teamId && h.resource.id)) {
			const r = h.resource!, teamId = r.channelIdentity!.teamId!, channelId = r.channelIdentity!.channelId ?? r.chatId!
			const root = await this.rootOf(teamId, channelId, r.id!, cache)
			if (!root) continue
			const id = threadId(teamId, channelId, root), mine = root === r.id && r.from?.emailAddress?.name === this.owner
			if (!(channelId in cache.names)) cache.names[channelId] = await this.mcp.call<{ displayName?: string }>('GetChannel', { teamId, channelId }).then(c => c.displayName ?? 'channel', () => 'channel')
			const old = found.get(id)
			found.set(id, { id, name: cache.names[channelId], mine: !!old?.mine || mine, hitAt: [old?.hitAt ?? '', r.createdDateTime ?? ''].sort().at(-1)! })
		}
		const week = new Date(now.getTime() - 7 * 86_400_000).toISOString()
		return { ...cache, scannedAt: now.toISOString(), threads: [...found.values()].filter(t => t.hitAt >= week).sort((a, b) => b.hitAt.localeCompare(a.hitAt)).slice(0, 15) }
	}

	// The newest message time per thread, checked at most every 5 minutes, so discovery reads only threads that changed.
	async freshness(cache: ThreadCache, now = new Date()): Promise<ThreadCache> {
		const last = { ...cache.last }
		for (const t of cache.threads) {
			const l = last[t.id]
			if (l && now.getTime() - Date.parse(l.checkedAt) < 5 * 60_000) continue
			const p = parseThread(t.id)
			const rs = (await this.replies(p.teamId, p.channelId, p.rootId).catch(() => ({ msgs: [] as TeamsMsg[] }))).msgs
			last[t.id] = { at: [t.hitAt, ...rs.map(r => r.createdDateTime)].sort().at(-1)!, checkedAt: now.toISOString() }
		}
		return { ...cache, last }
	}
}
