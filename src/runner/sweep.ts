import type { Config, WatchedChat } from '../core/types.ts'
import type { Source } from '../adapters/source.ts'
import type { Store, SweepChat } from '../store/state.ts'
import { classify, nextTurn, type RawMsg, type Turn } from '../core/intake.ts'
import { askedOf } from '../core/waiting.ts'
import { offRecord } from '../core/levels.ts'
import { isThread } from '../adapters/channels.ts'
import { kindOf } from './discover.ts'
import { intake, say } from './intake.ts'
import { MARK } from '../core/render.ts'

// First setup reads the 14 days before it once, for people still waiting on the owner (design-spec/first-sweep.md).
export const SWEEP_DAYS = 14
const PAGES = 5
const FULL = 45
const DAY = 86_400_000
const TRIES = 3
// A first check reads for at most this long, so live messages never wait long behind the first-setup read (dry run 10-20: 73 chats took 222 s).
const BUDGET_MS = 90_000
const t = (iso: string) => Date.parse(iso)

// Only the very first read sweeps: no chat state, no items, no chat cursors. A second machine or an update never does.
export function planSweep(store: Store, now = Date.now()): boolean {
	if (store.sweep() || store.hasChats() || store.workflows().length || Object.keys(store.cursors()).some(k => k !== 'self')) return false
	store.saveSweep({ since: new Date(now - SWEEP_DAYS * DAY).toISOString() })
	store.log({ event: 'sweep-planned' })
	return true
}

// Still reading: the knowledge read of chats waits, so the two never throttle each other.
export const sweeping = (store: Store) => { const s = store.sweep(); return !!s && !s.told && (!s.cut || !!s.left?.length) }

// One step per check: list the chats once, read them one at a time, then tell the owner the count once everything is triaged.
export async function sweep(store: Store, src: Source, cfg: Config, now = Date.now): Promise<number> {
	let s = store.sweep()
	if (!s || s.told) return 0
	const t0 = now()
	if (!s.cut) try {
		const cut = store.chats().startedAt, since = s.since
		const skip = (id: string) => id === src.selfChatId || (cfg.exclude ?? []).includes(id) || offRecord(cfg, id)
		const listed = (await src.recentChats()).filter(c => c.lastAt)
		const threads = cfg.channels !== false && src.channelThreads ? (await src.channelThreads(store.threadCache(), since, cfg.channels || [])).list : []
		const chats = new Map<string, SweepChat>()
		const add = (c: { id: string; name: string; lastAt: string }) => { if (t(c.lastAt) > t(since) && t(c.lastAt) <= t(cut) && !skip(c.id) && !chats.has(c.id)) chats.set(c.id, { id: c.id, name: c.name, group: isThread(c.id) || kindOf(c.id) !== 'oneOnOne' }) }
		for (const c of [...listed, ...threads]) add(c)
		// A full list ends before the read window does; search adds the chats it did not reach. If search fails, the count says how far back it read.
		let reach = since
		const oldest = listed.map(c => c.lastAt).sort((a, b) => t(a) - t(b))[0]
		if (listed.length >= FULL && t(oldest) > t(since)) {
			try {
				// Search names a chat by who wrote; a group chat gets its own name.
				for (const c of await src.awaiting?.(since, oldest) ?? []) if (!chats.has(c.id)) add(isThread(c.id) || kindOf(c.id) !== 'oneOnOne' ? { ...c, name: await src.chatName?.(c.id).catch(() => c.name) ?? c.name } : c)
				if (!src.awaiting) reach = oldest
			} catch (e) { reach = oldest; store.log({ event: 'sweep-search-failed', error: String(e).slice(0, 200) }) }
		}
		s = { ...s, cut, left: [...chats.values()], reach }
		store.saveSweep(s)
		store.log({ event: 'sweep-listed', chats: s.left!.length, reach })
	} catch (e) {
		// A list that keeps failing ends the sweep, so it never holds the knowledge read back for good.
		const tries = (s.listTries ?? 0) + 1
		store.saveSweep({ ...s, listTries: tries, ...(tries >= TRIES ? { told: true } : {}) })
		store.log({ event: 'sweep-list-failed', tries, error: String(e).slice(0, 200) })
		if (tries >= TRIES) await say(store, src, `${MARK} I could not list your chats from before setup, so I did not look for who is still waiting on you. New messages are read as usual.`).catch(() => undefined)
		return 0
	}
	let made = 0
	while (s.left?.length) {
		if (now() - t0 > BUDGET_MS) return made
		const chat: SweepChat = s.left[0]
		try { made += await sweepChat(store, src, cfg, s, chat) } catch (e) {
			store.log({ event: 'sweep-read-failed', chat: chat.id, error: String(e).slice(0, 200) })
			// Throttled: the next check resumes at this chat. Any other error, three times: that chat is skipped (left, deleted, no access).
			if (/\b429\b|throttl|too many requests/i.test(String(e))) return made
			const tries: number = (chat.tries ?? 0) + 1
			s = tries >= TRIES ? { ...s, left: s.left.slice(1), skipped: (s.skipped ?? 0) + 1 } : { ...s, left: [{ ...chat, tries }, ...s.left.slice(1)] }
			store.saveSweep(s)
			if (tries >= TRIES) { store.log({ event: 'sweep-chat-skipped', chat: chat.id }); continue }
			return made
		}
		s = { ...s, left: s.left.slice(1) }
		store.saveSweep(s)
	}
	const items = store.workflows().filter(w => w.before)
	if (items.some(w => w.state === 'running')) return made
	const need = items.filter(w => w.state !== 'done').length, keep = items.filter(w => w.state === 'done' && w.fyi?.watch).length
	// A sweep saved before the window grew keeps its own since.
	const back = (s.reach && t(s.reach) > t(s.since) ? `since ${s.reach.slice(0, 10)}` : s.cut && t(s.since) > t(s.cut) - SWEEP_DAYS * DAY ? `since ${s.since.slice(0, 10)}` : `from the last ${SWEEP_DAYS} days`) + (s.skipped ? ` (${s.skipped} chat${s.skipped === 1 ? '' : 's'} could not be read)` : '')
	// Said when there is something, or when the read could not reach the whole window, so the owner knows how far back it looked.
	const short = !!s.reach && t(s.reach) > t(s.since) || !!s.skipped
	if (need + keep) await say(store, src, `${MARK} I read your chats ${back}: ${need} still need${need === 1 ? 's' : ''} you (in Needs you, marked From before setup)${keep ? `, ${keep} to keep an eye on (Catch up)` : ''}. Nothing is sent without your ok.`)
	else if (short) await say(store, src, `${MARK} I read your chats ${back}: nobody from before setup is still waiting on you.${s.reach && t(s.reach) > t(s.since) ? ' Older chats were out of reach.' : ''}`)
	store.saveSweep({ ...s, told: true })
	store.log({ event: 'sweep-done', items: items.length, need, keep })
	return made
}

// One chat: newest first, stopping at the owner's last message and one before it; only what came at or before the cut (later is the live read's).
async function sweepChat(store: Store, src: Source, cfg: Config, s: { since: string; cut?: string }, chat: SweepChat): Promise<number> {
	const me = cfg.owner.id
	let mine = false
	const { msgs, truncated } = await src.newMessages(chat.id, undefined, s.since, { maxPages: PAGES, stop: m => { if (mine) return true; if (m.from?.id === me) mine = true; return false } })
	const at = msgs.findLastIndex(m => m.from?.id === me)
	const owner = at >= 0 ? msgs[at] : undefined, prev = at > 0 ? msgs[at - 1] : undefined
	let after = at >= 0 ? msgs.slice(at + 1) : truncated ? msgs.slice(-20) : msgs
	after = after.filter(m => t(m.at) <= t(s.cut!))
	// The owner asked someone and nobody has answered: they wait on that, as with a live message.
	if (owner && at === msgs.length - 1 && t(owner.at) <= t(s.cut!)) waitOn(store, cfg, chat, owner)
	if (!after.length) return 0
	// The owner's last message is their turn, so an unnamed answer to it counts; it is this read's own and never saved.
	const c = owner && classify(owner, { ownerId: me, ownerName: cfg.owner.name, aliases: cfg.aliases, test: false, group: chat.group, sentIds: new Set() })
	const turns: Record<string, Turn> = owner ? { [chat.id]: nextTurn(prev?.from && prev.from.id !== me ? nextTurn(undefined, { owner: false, from: prev.from, at: prev.at }) : undefined, { owner: true, at: owner.at, text: c && c.kind === 'owner' ? c.text : '' }) } : {}
	const read: Source = new Proxy(src, { get: (t, k) => (k === 'newMessages' ? async () => ({ msgs: after, newest: undefined, truncated: false }) : typeof (t as never)[k] === 'function' ? ((t as never)[k] as (...a: unknown[]) => unknown).bind(t) : (t as never)[k]) })
	const watched: WatchedChat = { id: chat.id, name: chat.name, group: chat.group, test: false }
	return intake(store, read, cfg, {}, [watched], { backlog: { turns } })
}

function waitOn(store: Store, cfg: Config, chat: SweepChat, m: RawMsg) {
	const c = classify(m, { ownerId: cfg.owner.id, ownerName: cfg.owner.name, aliases: cfg.aliases, test: false, group: chat.group, sentIds: new Set() })
	const to = c.kind === 'owner' ? askedOf(m, cfg.owner.name) : undefined
	if (!to || c.kind !== 'owner' || store.waiting().some(w => w.msgId === m.id)) return
	store.saveWaiting([...store.waiting(), { code: store.nextCode('W'), chat: { id: chat.id, name: chat.name }, msgId: m.id, at: m.at, to, text: c.text.slice(0, 600), state: 'waiting' }])
}
