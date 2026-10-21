import type { Config, WatchedChat } from '../core/types.ts'
import type { Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { isThread, type ThreadCache } from '../adapters/channels.ts'

export function kindOf(id: string): 'meeting' | 'oneOnOne' | 'group' {
	if (id.startsWith('19:meeting_')) return 'meeting'
	if (id.endsWith('@unq.gbl.spaces')) return 'oneOnOne'
	return 'group'
}

// Chats to read this tick (R-ING-06, R-ING-07): one list call, then only chats whose last message changed.
// Pinned chats from config are always read when they are outside the recent list.
export async function discover(store: Store, src: Source, cfg: Config): Promise<{ chats: WatchedChat[]; commit: () => void }> {
	const state = store.chats()
	const pinned = new Map(cfg.watch.map(w => [w.id, w]))
	const exclude = new Set([...(cfg.exclude ?? []), src.selfChatId])
	const readAt = new Date().toISOString()
	const listed: { id: string; name: string; lastAt: string; mine?: boolean }[] = cfg.discover === false ? [] : await src.recentChats()
	// The list holds only the newest 50 chats. When its oldest is newer than the last good read (after downtime or a busy spell),
	// chats pushed out of it are found by search for the gap (review 10-20 R3). A failed search keeps the gap for next time.
	// With no record of a good read (the first cycle after an update), the gap is unknown, so it is not searched; at most 3 days are.
	// A failed search waits 15 minutes before the next try, and says so under Health.
	let gapOpen = false, gapFailAt = state.gapFailAt
	const oldest = listed.map(c => c.lastAt).filter(Boolean).sort()[0]
	const last = state.readAt && new Date(Math.max(Date.parse(state.readAt), Date.now() - 3 * 86_400_000)).toISOString()
	const waiting = !!gapFailAt && Date.now() - Date.parse(gapFailAt) < 15 * 60_000
	if (cfg.discover !== false && last && !waiting && listed.length >= 45 && oldest && Date.parse(oldest) > Date.parse(last) && src.awaiting) {
		try {
			const have = new Set(listed.map(c => c.id))
			for (const c of await src.awaiting(last, oldest)) if (!have.has(c.id)) { listed.push(c); have.add(c.id) }
			gapFailAt = undefined
			store.setHealth('gap-search')
		} catch (e) {
			gapOpen = true; gapFailAt = new Date().toISOString()
			store.log({ event: 'gap-search-failed', since: last, until: oldest, error: String(e).slice(0, 200) })
			store.setHealth('gap-search', `Could not search for chats missed since ${last.slice(0, 16).replace('T', ' ')}. It tries again in 15 minutes.`)
		}
	} else if (last && waiting && listed.length >= 45 && oldest && Date.parse(oldest) > Date.parse(last)) gapOpen = true
	// No gap to search, and none waiting: an older failure no longer matters.
	else if (!waiting) { gapFailAt = undefined; store.setHealth('gap-search') }
	// Channel threads join the same flow; a thread the owner started treats every reply as addressed to them (owner question 2).
	let threadCache: ThreadCache | undefined
	if (cfg.discover !== false && cfg.channels !== false && src.channelThreads) {
		const r = await src.channelThreads(store.threadCache(), new Date(Date.now() - 7 * 86_400_000).toISOString(), cfg.channels || [])
		threadCache = r.cache
		listed.push(...r.list)
	}
	const out: WatchedChat[] = []
	for (const c of listed) {
		if (exclude.has(c.id) || !c.lastAt) continue
		const prev = state.seen[c.id]
		state.seen[c.id] = c.lastAt
		if (prev === c.lastAt) continue
		// A chat seen for the first time is read only if it changed after discovery started, so history is never answered.
		if (!prev && c.lastAt <= state.startedAt) continue
		const pin = pinned.get(c.id)
		out.push({ id: c.id, name: pin?.name ?? c.name, test: !!pin?.test, group: pin ? !!pin.group : isThread(c.id) ? !c.mine : kindOf(c.id) !== 'oneOnOne', since: prev ?? state.startedAt })
		pinned.delete(c.id)
	}
	const listedIds = new Set(listed.map(c => c.id))
	for (const w of pinned.values()) if (!listedIds.has(w.id) && !exclude.has(w.id)) out.push(w)
	// Saved only after intake succeeds, so a failed read is retried instead of marked seen.
	return { chats: out, commit: () => { store.saveChats({ ...store.chats(), startedAt: state.startedAt, seen: state.seen, ...(gapOpen ? {} : { readAt }), gapFailAt, goodAt: readAt }); if (threadCache) store.saveThreadCache(threadCache) } }
}
