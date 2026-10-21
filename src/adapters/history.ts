import type { Config } from '../core/types.ts'
import { McpClient } from './mcp-client.ts'

// The owner's own message history, searched where it already lives. A Slack or Google adapter implements the same shape.
export type HistoryHit = { at: string; who: string; mine: boolean; text: string; link: string }
// A conversation the owner wrote in: a chat, or a channel with its team. mine counts the owner's messages in the window.
export type Convo = { id: string; team?: string; mine: number; lastAt: string }
export interface History {
	search(query: string, o: { mine?: boolean; before?: string; limit?: number }): Promise<HistoryHit[]>
	conversations?(sinceDay: string, now?: Date): Promise<Convo[]>
	close(): Promise<void>
}

type Hit = { summary?: string; resource?: { createdDateTime?: string; webLink?: string; chatId?: string; channelIdentity?: { teamId?: string; channelId?: string }; from?: { emailAddress?: { name?: string } } } }

// Teams keeps a search index of every chat and channel message; Delegate stores no copy (research.md: knowledge sources).
export class TeamsHistory implements History {
	private mcp: McpClient
	private readonly owner: string
	constructor(cfg: Config, mcp = new McpClient(cfg.source.command)) { this.mcp = mcp; this.owner = cfg.owner.name }
	async search(query: string, o: { mine?: boolean; before?: string; limit?: number } = {}): Promise<HistoryHit[]> {
		const words = query.replace(/["()]/g, ' ').replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim()
		// Search works by day; the exact cut-off is applied to each hit below.
		const kql = [o.mine ? `from:"${this.owner}"` : '', words, o.before ? `sent<=${o.before.slice(0, 10)}` : ''].filter(Boolean).join(' AND ')
		const r = await this.mcp.call<{ rawResponse?: string }>('SearchTeamMessagesQueryParameters', { queryString: kql, from: 0 })
		const hits: Hit[] = JSON.parse(r.rawResponse ?? '{}').value?.[0]?.hitsContainers?.[0]?.hits ?? []
		return hits
			.filter(h => h.resource?.createdDateTime && (!o.before || h.resource.createdDateTime < o.before))
			.slice(0, o.limit ?? 10)
			.map(h => {
				const who = h.resource!.from?.emailAddress?.name ?? 'someone'
				return { at: h.resource!.createdDateTime!, who, mine: who === this.owner, text: (h.summary ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), link: (h.resource!.webLink ?? '').replace(/\?context=.*$/, '') }
			})
	}
	// Every conversation the owner wrote in since a day. The chat list stops at 50; search finds them all
	// (measured: 158 conversations in 90 days, 145 calls, about 3 minutes). Week by week, so each window pages fully.
	async conversations(sinceDay: string, now = new Date()): Promise<Convo[]> {
		const day = (t: number) => new Date(t).toISOString().slice(0, 10), D = 86_400_000
		const out = new Map<string, Convo>()
		// Whole-day windows of seven days that never share a day, so no message is counted twice.
		for (let last = Date.parse(day(now.getTime())); day(last) >= sinceDay; last -= 7 * D) {
			const first = Math.max(last - 6 * D, Date.parse(sinceDay))
			for (let from = 0; from < 1000; from += 25) {
				const r = await this.mcp.call<{ rawResponse?: string }>('SearchTeamMessagesQueryParameters', { queryString: `from:"${this.owner}" AND sent>=${day(first)} AND sent<=${day(last)}`, from })
				const c = JSON.parse(r.rawResponse ?? '{}').value?.[0]?.hitsContainers?.[0] as { hits?: Hit[]; moreResultsAvailable?: boolean } | undefined
				for (const h of c?.hits ?? []) {
					const id = h.resource?.chatId, at = h.resource?.createdDateTime ?? ''
					if (!id) continue
					const team = /@thread\.(tacv2|skype)$/.test(id) ? h.resource?.channelIdentity?.teamId : undefined
					const o = out.get(id) ?? { id, ...(team ? { team } : {}), mine: 0, lastAt: '' }
					out.set(id, { ...o, mine: o.mine + 1, lastAt: at > o.lastAt ? at : o.lastAt })
				}
				if (!c?.moreResultsAvailable || !c.hits?.length) break
			}
		}
		return [...out.values()].sort((a, b) => b.mine - a.mine)
	}
	close() { return this.mcp.close() }
}
