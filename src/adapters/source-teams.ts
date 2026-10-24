import type { Config } from '../core/types.ts'
import type { RawMsg } from '../core/intake.ts'
import { LostResponse, McpClient } from './mcp-client.ts'
import { htmlToText } from '../core/intake.ts'
import { SendUncertain } from './source.ts'
import { mdToHtml } from '../core/format.ts'
import type { ReadOpts, SendOpts, Source } from './source.ts'
import { isThread, parseThread, Threads, type ThreadCache, type WatchedChannel } from './channels.ts'
import { NAME } from '../brand.ts'

export type TeamsMsg = { id: string; createdDateTime: string; lastModifiedDateTime?: string; lastEditedDateTime?: string | null; deletedDateTime?: string | null; replyToId?: string | null; from?: { id: string; displayName: string } | null; body?: { contentType: string; content: string }; attachments?: { name?: string | null; contentType?: string; contentUrl?: string | null; content?: string | null; driveId?: string; itemId?: string }[] }
type Page = { messages?: TeamsMsg[]; nextLink?: string; '@odata.nextLink'?: string }

const DEFAULT_TOOLS = { list: 'ListChatMessages', send: 'SendMessageToChat', sendSelf: 'SendMessageToSelf', get: 'GetChat', chats: 'ListChats', del: 'DeleteChatMessage', edit: 'UpdateChatMessage', presence: 'GetUserPresence', members: 'ListChatMembers', message: 'GetChatMessage' }
const newer = (a: string, b: string) => BigInt(a) > BigInt(b)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Member = { roles?: string[]; userId?: string; displayName?: string }

export class TeamsSource implements Source {
	private mcp: McpClient
	private tools: typeof DEFAULT_TOOLS
	readonly selfChatId: string
	private threads: Threads
	private owner: string
	constructor(cfg: Config['source'], mcp = new McpClient(cfg.command), owner = '') {
		this.mcp = mcp
		this.threads = new Threads(mcp, owner)
		this.owner = owner
		this.tools = { ...DEFAULT_TOOLS, ...cfg.tools }
		this.selfChatId = cfg.selfChatId
	}

	// Messages newer than afterId (or, with no cursor, newer than sinceIso), oldest first.
	// With neither, returns [] and the newest ID, so history is never answered.
	async newMessages(chatId: string, afterId: string | undefined, sinceIso?: string, o: ReadOpts = {}): Promise<{ msgs: RawMsg[]; newest?: string; truncated: boolean }> {
		const maxPages = o.maxPages ?? 25
		if (isThread(chatId)) {
			const { msgs: all, truncated } = await this.thread(chatId)
			const newest = all.at(-1)?.id ?? afterId
			if (!afterId && !sinceIso) return { msgs: [], newest, truncated: false }
			const msgs = all.filter(m => (afterId ? newer(m.id, afterId) : m.at > sinceIso!))
			const from = o.stop ? msgs.length - 1 - [...msgs].reverse().findIndex(m => o.stop!(m)) : msgs.length
			return { msgs: o.stop && from < msgs.length ? msgs.slice(from) : msgs, newest, truncated: truncated && !(o.stop && from < msgs.length) }
		}
		const out: TeamsMsg[] = []
		const bounded = !!afterId || !!sinceIso
		const isOld = (m: TeamsMsg) => (afterId ? !newer(m.id, afterId) : !!sinceIso && m.createdDateTime <= sinceIso)
		let nextLink: string | undefined
		let reached = false
		for (let page = 0; page < maxPages; page++) {
			const r = await this.mcp.call<Page>(this.tools.list, nextLink ? { chatId, nextLink, include: 'attachments' } : { chatId, top: 20, include: 'attachments' })
			for (const m of r.messages ?? []) {
				if (isOld(m)) { reached = true; break }
				out.push(m)
				if (o.stop?.(toRaw(m))) { reached = true; break }
			}
			nextLink = r.nextLink ?? r['@odata.nextLink']
			if (reached || !bounded || !nextLink) break
		}
		const newest = out[0]?.id ?? afterId
		if (!bounded) return { msgs: [], newest, truncated: false }
		return { msgs: out.reverse().map(toRaw), newest, truncated: !reached && !!nextLink }
	}

	async recentChats(): Promise<{ id: string; name: string; lastAt: string }[]> {
		const r = await this.mcp.call<{ chats?: { id: string; topic?: string | null; lastMessagePreview?: { createdDateTime?: string; from?: string } }[] }>(this.tools.chats, {})
		return (r.chats ?? []).map(c => ({ id: c.id, name: c.topic || c.lastMessagePreview?.from || c.id, lastAt: c.lastMessagePreview?.createdDateTime ?? '' }))
	}

	// A thread is its start plus its replies, oldest first.
	private async thread(id: string): Promise<{ msgs: RawMsg[]; truncated: boolean }> {
		const t = parseThread(id)
		const starts = await this.mcp.call<Page>('ListChannelMessages', { teamId: t.teamId, channelId: t.channelId, top: 50, include: 'attachments' })
		const root = (starts.messages ?? []).find(m => m.id === t.rootId)
		const { msgs: replies, truncated } = await this.threads.replies(t.teamId, t.channelId, t.rootId)
		return { msgs: [...(root ? [root] : []), ...replies].map(toRaw).sort((a, b) => (newer(a.id, b.id) ? 1 : -1)), truncated }
	}

	// Channel threads where the owner started, posted, or was mentioned, for discovery (owner question 2).
	async channelThreads(cache: ThreadCache, sinceIso: string, channels: WatchedChannel[] = []): Promise<{ list: { id: string; name: string; lastAt: string; mine: boolean }[]; cache: ThreadCache }> {
		const c = await this.threads.freshness(await this.threads.discover(sinceIso, cache, new Date(), channels))
		return { list: c.threads.map(t => ({ id: t.id, name: `${t.name} (thread)`, lastAt: c.last[t.id]?.at ?? t.hitAt, mine: t.mine })), cache: c }
	}

	async recent(chatId: string, n: number): Promise<RawMsg[]> {
		if (isThread(chatId)) return (await this.thread(chatId)).msgs.slice(-n)
		const r = await this.mcp.call<Page>(this.tools.list, { chatId, top: n, include: 'attachments' })
		return (r.messages ?? []).reverse().map(toRaw)
	}

	// One message, even an old one, and the messages after it, oldest first (a missed link from before the install).
	async around(chatId: string, msgId: string, max = 300): Promise<{ msg?: RawMsg; after: RawMsg[] }> {
		if (isThread(chatId)) { const t = (await this.thread(chatId)).msgs, i = t.findIndex(m => m.id === msgId); return i < 0 ? { after: [] } : { msg: t[i], after: t.slice(i + 1) } }
		const seen: TeamsMsg[] = []
		let p = await this.mcp.call<Page>(this.tools.list, { chatId, top: 50, include: 'attachments' })
		for (let i = 0; i < Math.ceil(max / 50); i++) {
			seen.push(...(p.messages ?? []))
			const next = p.nextLink ?? p['@odata.nextLink']
			if (seen.some(m => m.id === msgId) || !next) break
			p = await this.mcp.call<Page>(this.tools.list, { chatId, top: 50, nextLink: next })
		}
		const all = seen.map(toRaw).sort((a, b) => (newer(a.id, b.id) ? 1 : -1))
		const at = all.findIndex(m => m.id === msgId)
		if (at >= 0) return { msg: all[at], after: all.slice(at + 1) }
		const one = await this.mcp.call<TeamsMsg>(this.tools.message, { chatId, messageId: msgId }).catch(() => undefined)
		return { msg: one?.id ? toRaw(one) : undefined, after: all.filter(m => newer(m.id, msgId)) }
	}

	async send(chatId: string, text: string, o: SendOpts = {}): Promise<{ msgId: string }> {
		// The Teams tool turns "@Name" in the text into a mention when that exact name is listed; a name not written in the text is left out.
		const mentions = (o.mentions ?? []).flatMap(m => { const n = [m.name, m.name.split(' ')[0]].find(x => new RegExp(`@${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text)); return n ? [{ displayName: n, id: m.id, type: 'user' }] : [] })
		const quote = o.replyTo ? `<blockquote><b>${esc(o.replyTo.name)}</b>: ${esc(o.replyTo.text.replace(/\s+/g, ' ').slice(0, 200))}${o.replyTo.text.length > 200 ? '…' : ''}</blockquote>` : ''
		const extra = mentions.length ? { mentions: JSON.stringify(mentions) } : {}
		if (isThread(chatId)) { const t = parseThread(chatId), content = mdToHtml(text); return this.posted(chatId, content, () => this.mcp.call('ReplyToChannelMessage', { teamId: t.teamId, channelId: t.channelId, messageId: t.rootId, content, contentType: 'html' })) }
		const content = quote + mdToHtml(text)
		return this.posted(chatId, mdToHtml(text), () => this.mcp.call(this.tools.send, { chatId, content, contentType: 'html', ...extra }))
	}

	// A send whose answer was lost is never sent again: the chat is read back, and the message found there is the one sent.
	// Not found, it may still land, so the caller holds it as not sure (bug 10-23 R4: a rule reply posted twice).
	private async posted(chatId: string, words: string, post: () => Promise<unknown>): Promise<{ msgId: string }> {
		const started = Date.now()
		try { return { msgId: idOf(await post()) } } catch (e) {
			if (!(e instanceof LostResponse)) throw e
			const want = squashText(words), since = started - 120_000
			let recent: TeamsMsg[] = []
			try {
				if (isThread(chatId)) { const t = parseThread(chatId), p = await this.mcp.call<Page & { replies?: TeamsMsg[]; value?: TeamsMsg[] }>('ListChannelMessageReplies', { teamId: t.teamId, channelId: t.channelId, messageId: t.rootId, maxReplies: 20 }); recent = p.replies ?? p.messages ?? p.value ?? [] }
				else recent = (await this.mcp.call<Page>(this.tools.list, { chatId, top: 20 })).messages ?? []
			} catch (read) { throw new SendUncertain(`${e.message}; reading the chat back failed too (${String(read).slice(0, 120)})`) }
			const hit = recent.filter(m => !m.deletedDateTime && Date.parse(m.createdDateTime) >= since && !!want && squashText(m.body?.content ?? '').endsWith(want)).sort((a, b) => (newer(a.id, b.id) ? -1 : 1))[0]
			if (hit) { console.warn(`${NAME}: the send's answer was lost; found it in the chat as ${hit.id}.`); return { msgId: hit.id } }
			throw new SendUncertain(e.message)
		}
	}

	async sendSelf(text: string): Promise<{ msgId: string }> {
		return { msgId: idOf(await this.mcp.call(this.tools.sendSelf, { content: mdToHtml(text), contentType: 'html' })) }
	}

	async deleteMessage(chatId: string, msgId: string): Promise<void> {
		if (isThread(chatId)) throw new Error(`${NAME} cannot change channel messages`)
		await this.mcp.call(this.tools.del, { chatId, messageId: msgId })
	}

	async editMessage(chatId: string, msgId: string, text: string): Promise<void> {
		if (isThread(chatId)) throw new Error(`${NAME} cannot change channel messages`)
		await this.mcp.call(this.tools.edit, { chatId, messageId: msgId, content: mdToHtml(text), contentType: 'html' })
	}

	async presence(): Promise<{ availability: string; oof?: string }> {
		const r = await this.mcp.call<{ availability?: string; outOfOfficeSettings?: { isOutOfOffice?: boolean; message?: string | null } }>(this.tools.presence, {})
		const o = r.outOfOfficeSettings
		return { availability: r.availability ?? 'Unknown', oof: o?.isOutOfOffice ? (o.message ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'out of office' : undefined }
	}

	async members(chatId: string): Promise<{ guests: boolean; ids?: string[]; names?: Record<string, string> }> {
		const t = isThread(chatId) ? parseThread(chatId) : undefined
		const r = await this.mcp.call<{ members?: Member[] }>(t ? 'ListChannelMembers' : this.tools.members, t ? { teamId: t.teamId, channelId: t.channelId } : { chatId })
		const ms = r.members ?? []
		return { guests: ms.some(m => (m.roles ?? []).includes('guest')), ids: ms.map(m => m.userId).filter((u): u is string => !!u), names: Object.fromEntries(ms.flatMap(m => (m.userId && m.displayName ? [[m.userId, m.displayName]] : []))) }
	}

	async chatName(chatId: string): Promise<string> {
		const r = await this.mcp.call<{ topic?: string }>(this.tools.get, { chatId })
		return r.topic ?? chatId
	}

	async close() { await this.mcp.close() }

	// Search is the only list of chats past the 50 newest (measured 10-20: 49 chats reached back 5 days). Chats only; channels come from channelThreads.
	async awaiting(sinceIso: string, untilIso: string): Promise<{ id: string; name: string; lastAt: string }[]> {
		if (!this.owner) return []
		const out = new Map<string, { id: string; name: string; lastAt: string }>()
		for (let from = 0; from < 1000; from += 25) {
			const r = await this.mcp.call<{ rawResponse?: string }>('SearchTeamMessagesQueryParameters', { queryString: `to:"${this.owner}" AND sent>=${sinceIso.slice(0, 10)} AND sent<=${new Date(Date.parse(untilIso) + 86_400_000).toISOString().slice(0, 10)}`, from })
			const c = JSON.parse(r.rawResponse ?? '{}').value?.[0]?.hitsContainers?.[0] as { hits?: { resource?: { chatId?: string; createdDateTime?: string; from?: { emailAddress?: { name?: string } } } }[]; moreResultsAvailable?: boolean } | undefined
			for (const h of c?.hits ?? []) {
				const id = h.resource?.chatId, at = h.resource?.createdDateTime ?? ''
				// Search days are whole days in the tenant's zone; the exact window is applied here, as times, not text.
				if (!id || /@thread\.(tacv2|skype)$/.test(id) || !(Date.parse(at) > Date.parse(sinceIso) && Date.parse(at) <= Date.parse(untilIso))) continue
				const was = out.get(id)
				if (!was || Date.parse(at) > Date.parse(was.lastAt)) out.set(id, { id, name: was?.name ?? h.resource?.from?.emailAddress?.name ?? id, lastAt: at })
			}
			if (!c?.moreResultsAvailable || !c.hits?.length) break
		}
		return [...out.values()]
	}
}

export function toRaw(m: TeamsMsg): RawMsg {
	let replyToId = m.replyToId || undefined
	for (const attachment of m.attachments ?? []) {
		if (replyToId || attachment.contentType !== 'messageReference' || !attachment.content) continue
		try {
			const reference: unknown = JSON.parse(attachment.content)
			if (reference && typeof reference === 'object' && 'messageId' in reference && typeof reference.messageId === 'string') replyToId = reference.messageId
		} catch (error) { console.warn('Could not read Teams reply reference:', error) }
	}
	return {
		id: m.id,
		at: m.createdDateTime,
		editedAt: m.lastEditedDateTime ?? undefined,
		from: m.from ? { id: m.from.id, name: m.from.displayName } : null,
		html: m.body?.contentType?.toLowerCase() === 'html',
		body: m.body?.content ?? '',
		deleted: !!m.deletedDateTime,
		replyToId,
		attachments: (m.attachments ?? []).filter(a => a.contentType !== 'messageReference').map(a => ({ name: a.name ?? '', type: a.contentType ?? 'file', url: a.contentUrl ?? undefined, ...(a.driveId && a.itemId ? { driveId: a.driveId, itemId: a.itemId } : {}) })),
	}
}

function idOf(r: unknown): string {
	const o = r as { id?: string; messageId?: string; message?: { id?: string } }
	return o.id ?? o.messageId ?? o.message?.id ?? ''
}
// Letters and digits only: the post carries our words after a quote, with mentions and markup in between.
const squashText = (html: string) => htmlToText(html).replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
