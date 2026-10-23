import { active, addPart, homeNamed, homeOf, inWork, linksIn, newTurn, ownerStep, statusOf, step } from './work.ts'
import { reopenPromise } from './promise.ts'
import { watchCommand } from './track.ts'
import { askAtOf } from '../core/numbers.ts'
import { outcome } from './habits.ts'
import { answers, askedOf, type Waiting } from '../core/waiting.ts'
import { randomUUID } from 'node:crypto'
import type { Config, Msg, Person, WatchedChat, Workflow } from '../core/types.ts'
import { asSpeaker, classify, continuesOwner, htmlToText, inlineImages, nextTurn, replyTarget, type RawMsg, type Turn } from '../core/intake.ts'
import { matchesOwnerDraft, ownReplyText, ownerReplies, rememberOwnerReply } from './owner-reply.ts'
import { MARK, plain, renderPhone } from '../core/render.ts'
import { catchUpLines, inbox, nextProposal } from './proposals.ts'
import { statusText } from './status.ts'
import { parseVerbs } from '../core/verbs.ts'
import { ulid } from '../core/ids.ts'
import { CONTROL_VERBS, type Verb } from '../core/types.ts'

export const isControl = (v: Verb) => (CONTROL_VERBS as readonly string[]).includes(v)
import type { Source } from '../adapters/source.ts'
import type { Missed, Store } from '../store/state.ts'
import { isThread, parseMessageLink } from '../adapters/channels.ts'
import { kindOf } from './discover.ts'
import { REPORT, report } from '../store/feedback.ts'
import { NAME } from '../brand.ts'
import { prTarget } from './probe.ts'
import { askRelation, freshAsk } from './same-ask.ts'

const toMsg = (r: RawMsg, from: { id: string; name: string }, text: string, byOwner: boolean): Msg =>
	({ id: r.id, at: r.at, from, text, byOwner })

// Owner commands in the self-chat (R-HIL-15, R-HIL-16).
export async function readOwnerCommands(store: Store, src: Source, cursors: Record<string, string>): Promise<number> {
	const { msgs, newest } = await src.newMessages(src.selfChatId, cursors.self)
	if (newest) cursors.self = newest
	const sent = store.sentIds()
	let n = 0
	for (const m of msgs) {
		const text = (m.html ? htmlToText(m.body) : m.body).trim()
		if (sent.has(m.id) || text.startsWith(MARK) || store.wasSentRecently(text)) continue
		// The phone gets the same list as the AI chat, and marks it seen the same way (R-HIL-12, tester 06-07 P2-1).
		if (/^(what needs me|what did i miss|inbox)\??$/i.test(text)) { const since = store.lastViewed(), all = store.workflows(); const caught = catchUpLines(store, since); await say(store, src, renderPhone(all, store.proposals(), store.health(), since) + (caught.length ? `\n\nCatch up:\n${caught.join('\n')}` : '')); store.markShown(all); store.markViewed(); continue }
		if (/^status\??$/i.test(text)) { await say(store, src, `${MARK} ${statusText(store)}`); continue }
		if (/^review knowledge$/i.test(text)) { await say(store, src, plain(`${MARK} ${nextProposal(store, undefined, 6)}`).slice(0, 1800)); continue }
		const rep = text.match(REPORT)
		if (rep) { await say(store, src, `${MARK} ${report(store, rep[2].trim(), rep[1])}`); continue }
		const miss = text.match(MISSED)
		if (miss) { store.addMissed({ link: miss[1], note: miss[2]?.trim() || undefined, at: m.at }); n++; continue }
		// "review PR 12" or "review <PR link>": the owner's own ask to review counts as asked (owner decision, review gate).
		// It reaches the open item about that PR; with none, the reply says how to start one, never silence (G10).
		const rv = text.match(REVIEW_CMD)
		if (rv) {
			const id = Number(rv[1] ?? rv[2])
			const item = store.workflows().filter(w => w.state !== 'done' && w.kind !== 'tracker' && prTarget(store, w) === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
			if (item) { store.writeAnswer({ code: item.code, verb: 'answer', text: `review PR ${id}`, surface: 'self', seenAt: store.seenRev(item.code, m.at) }); n++ }
			else await say(store, src, `${MARK} No open item is about PR ${id}, so there is nothing to review it for. ${NAME} reviews a PR when someone asks you in a chat it reads; to start from an ask it missed, say "missed <link to that message>".`)
			continue
		}
		const parsed = parseVerbs(text)
		if (!parsed) continue
		for (const p of parsed) {
			if (isControl(p.verb) && !p.code) { store.writeAnswer({ code: '', verb: p.verb, surface: 'self' }); n++; continue }
			// "watch: make sure Ana sends the trace IDs by 2026-10-23" starts a watch at once; it is about no item yet.
			if (p.verb === 'watch' && !p.code) { await say(store, src, `${MARK} ${watchCommand(store, p).text}`); n++; continue }
			const code = p.code ?? latestPreview(store, 'self', m.at)
			if (!code) { await say(store, src, `${MARK} Which item? Reply with a code, for example "ok A1".`); continue }
			store.writeAnswer({ code, verb: p.verb, text: p.text, nums: p.nums, except: p.except, again: p.again, surface: 'self', seenAt: store.seenRev(code, m.at) })
			n++
		}
	}
	return n
}

// The preview on screen when a bare ok was typed: the newest shown at or before it, within 10 minutes (review 10-20 R1a).
export function latestPreview(store: Store, surface: string, typedAt = new Date().toISOString()): string | undefined {
	const raw = store.notify().previews?.[surface], t = Date.parse(typedAt), all = Array.isArray(raw) ? raw : raw ? [raw] : []
	// Teams time and this machine's clock can differ by seconds: a preview that looks just after the ok may be the one on screen, so it asks.
	const newest = all.at(-1)
	if (newest && Date.parse(newest.at) > t && Date.parse(newest.at) - t <= 30_000) return undefined
	const p = all.filter(x => Date.parse(x.at) <= t).at(-1)
	if (!p || Date.now() - Date.parse(p.at) > 10 * 60_000) return undefined
	return p.code
}

export async function say(store: Store, src: Source, text: string) {
	const { msgId } = await src.sendSelf(text)
	store.addSent(msgId, text)
}

// New messages in watched chats become events on workflows (R-WF-01, R-ING-03/08/09/10).
// The owner taking something on: "I'll", "I will", "I'd be the POC", "let me check", "I can take".
const COMMIT = /\b(I(?:'|’)ll|I will|I(?:'|’)d be|I would be|I can take|I(?:'|’)m on it|let me (?:check|take|look|handle|test|try|do))\b/i

export const SKIP_REASONS = ['prefilter', 'context-absorbed', 'dedupe', 'ai-noise', 'ai-fyi', 'budget-deferred'] as const
export function auditSkip(store: Store, chat: string, msgId: string, reason: typeof SKIP_REASONS[number], workflowId?: string) {
	const outcome = { prefilter: 'ignored', 'context-absorbed': 'context', dedupe: 'duplicate', 'ai-noise': 'noise', 'ai-fyi': 'fyi', 'budget-deferred': 'deferred' }[reason]
	store.log({ event: 'intake-skip', reason, chat, msgId, outcome, ...(workflowId ? { workflowId } : {}) })
}

// Backlog uses its own turns and message-time quiet checks. Its candidates persist behind direct asks, and every reply waits for the owner.
export async function intake(store: Store, src: Source, cfg: Config, cursors: Record<string, string>, chats: WatchedChat[] = cfg.watch, o: { backlog?: { turns: Record<string, Turn> } } = {}): Promise<number> {
	let asks = 0
	const backlog = !!o.backlog
	const sent = store.sentIds(), turns = o.backlog?.turns ?? store.turns()
	const claimed = new Set(store.workflows().flatMap(w => w.msgIds.map(id => `${w.chat.id}/${id}`)))
	for (const chat of chats) {
		const { msgs, newest, truncated } = await src.newMessages(chat.id, cursors[chat.id], chat.since)
		if (newest) cursors[chat.id] = newest
		if (truncated && !backlog) store.log({ event: 'gap', chat: chat.id, oldestRead: msgs[0]?.id, cursor: cursors[chat.id] })
		if (!backlog) store.setHealth(`gap:${chat.id}`, truncated ? `${chat.name} had more new messages than I can read at once. I read the newest ones; older ones were skipped.` : undefined)
		for (const raw of msgs) {
			const key = `${chat.id}/${raw.id}`
			if (claimed.has(key)) { auditSkip(store, chat.id, raw.id, 'dedupe'); continue }
			claimed.add(key)
			keepImages(store, raw)
			const now = backlog ? Date.parse(raw.at) : Date.now()
			let c = classify(raw, { ownerId: cfg.owner.id, ownerName: cfg.owner.name, aliases: cfg.aliases, test: !!chat.test, group: !!chat.group, sentIds: sent })
			if (chat.group) {
				const t = turns[chat.id]
				if (c.kind === 'skip' && sent.has(raw.id)) turns[chat.id] = nextTurn(t, { owner: true, at: raw.at, text: '', to: answeredBy(store, raw.id) })
				else if (c.kind === 'owner') turns[chat.id] = nextTurn(t, { owner: true, at: raw.at, text: c.text })
				else if (c.kind === 'ask' || c.kind === 'context') {
					if (c.kind === 'context' && continuesOwner(t, c.from, raw.at)) c = { ...c, kind: 'ask' }
					turns[chat.id] = nextTurn(t, { owner: false, from: c.from, at: raw.at })
				}
			}
			if (c.kind === 'skip') { auditSkip(store, chat.id, raw.id, 'prefilter'); continue }
			const open = store.openInChat(chat.id)
			if (c.kind === 'owner') {
				if (store.wasSentRecently(c.text)) { auditSkip(store, chat.id, raw.id, 'dedupe'); continue }
				store.saveActivity({ ownerLastAt: raw.at })
				const to = askedOf(raw, cfg.owner.name)
				// In a chat with open work the ask is also a step on that work, so the W entry belongs to it and the work's row
				// carries both (bug 10-21: the new page showed one thread twice). It follows up on its own once the work closes.
				const item = to ? workOfAsk(store, open, raw, c.text, to) : undefined
				if (to && !store.waiting().some(w => w.msgId === raw.id)) store.saveWaiting([...store.waiting(), { code: store.nextCode('W'), chat: { id: chat.id, name: chat.name }, msgId: raw.id, at: raw.at, to, text: c.text.slice(0, 600), state: 'waiting', ...(item ? { item } : {}) }])
				const replied = await ownerReplies(store, cfg, raw, c.text, open)
				for (const o of open) recordOwnerReply(store, o, toMsg(raw, cfg.owner, c.text, true), replied.get(o.id), ownReplyText(raw, c.text))
				// Naming a link of work that started in another chat makes this chat a part of it (R-WRK-10).
				const home = open.some(o => inWork(store, o)) ? undefined : homeNamed(store, store.workflows(), c.text)
				if (home && home.chat.id !== chat.id) {
					const part = await create(store, src, cfg, chat)
					if (!store.thread(part.id).some(m => m.id === raw.id)) appendThread(store, part, toMsg(raw, cfg.owner, c.text, true))
					addPart(home, part)
					step(home, `You wrote in ${chat.group ? chat.name : `the 1:1 with ${chat.name}`} (${part.code}): ${c.text}`, { ref: `owner:${raw.id}` })
					Object.assign(part, { state: 'open', status: statusOf(home), lastMsgId: raw.id, lastAsk: c.text, pending: [] })
					store.save(home); store.save(part)
					continue
				}
				// The owner taking something on may start work; one short run decides, and the owner confirms (R-WRK-11).
				if (!home && COMMIT.test(c.text) && !open.some(o => inWork(store, o))) {
					const cand = await create(store, src, cfg, chat)
					if (!store.thread(cand.id).some(m => m.id === raw.id)) appendThread(store, cand, toMsg(raw, cfg.owner, c.text, true))
					Object.assign(cand, { startedBy: 'owner', state: 'running', paced: true, ...(backlog ? { before: true } : {}), lastAsk: c.text, lastMsgId: raw.id, pending: [raw.id], msgIds: [raw.id], status: 'Checking whether you took something on' })
					store.save(cand)
				} else auditSkip(store, chat.id, raw.id, 'context-absorbed')
				continue
			}
			// Anyone the owner asked who now writes in that chat has answered.
			const sender = c.from
			const groupJudgment = c.kind === 'context'
			if (groupJudgment) c = { ...c, kind: 'ask' }
			const ws = store.waiting(), hit = ws.filter(w => w.state === 'waiting' && w.chat.id === chat.id && answers(w, sender.name) && raw.at > w.at)
			if (hit.length) store.saveWaiting(ws.map(w => (hit.includes(w) ? { ...w, state: 'answered', doneAt: raw.at } : w)))
			hearReply(store, chat, c.from.name, c.text, raw.at)
			// An open reply item that went quiet does not absorb a new conversation; it stays for the owner, and a new item starts (review 085 P1-1).
			const hours = cfg.quietHours ?? 48
			const live = open.filter(w => (w.job || inWork(store, w) || !quietFor(store, w, hours, now)) && (!backlog || w.before))
			// Sender identity alone is not a follow-up: unresolved cases become visible before the worker's tie-breaker.
			const follows = groupJudgment ? route(store, live.filter(o => o.asker?.id === c.from.id), raw, c.from.id, undefined, c.text) : undefined
			if (groupJudgment && !follows) for (const o of open) appendThread(store, o, toMsg(raw, c.from, c.text, false))
			let wf = follows ?? (groupJudgment ? undefined : route(store, live, raw, c.kind === 'ask' || c.kind === 'context' ? c.from.id : '', c.kind === 'ask' && !backlog ? recentItem(store, chat.id, c.from.id, hours, now) : undefined, c.text))
			// An ask that names a link of work from another chat goes to that work's part here, or starts one.
			const named = c.kind === 'ask' && !groupJudgment && !(wf && inWork(store, wf)) ? homeNamed(store, store.workflows(), c.text) : undefined
			const elsewhere = named && named.chat.id !== chat.id ? named : undefined
			if (elsewhere) wf = live.find(o => o.partOf === elsewhere.id && freshAsk(store, o, Date.parse(raw.at)) && askRelation(store, o, c.text) === 'same')
			// "Fixed, please recheck" reopens the same item, which keeps its code (scenario 04 step 5, tester P2-14).
			// It reattaches to its job only if the worker says the new ask is about the same entity (review 01-04 P0-2).
			// How and why it closed last time no longer describes it: a later close says its own.
			if (wf?.state === 'done') {
				newTurn(wf)
				Object.assign(wf, { job: undefined, closedBy: undefined, fyi: undefined, prVote: undefined, prStatus: undefined, before: undefined, paced: undefined })
			}
			if (wf?.state === 'done' && wf.work?.closed) { wf.work.closed = undefined; step(wf, `Reopened by ${c.from.name}`) }
			if (wf?.state === 'open' && c.kind === 'ask') newTurn(wf)
			// A request to the whole group ("hi guys, I have a PR") may be the owner's: one short run decides, using what the owner owns.
			const room = groupJudgment && !wf
			if (wf?.lastMsgId && BigInt(raw.id) <= BigInt(wf.lastMsgId)) { auditSkip(store, chat.id, raw.id, 'dedupe', wf.id); continue }
			// The reply already went and its promised change waits, or its check failed: the new ask is a new turn (Slice 3).
			if (wf && c.kind === 'ask') reopenPromise(store, wf)
			wf ??= await create(store, src, cfg, chat, c.kind === 'ask' ? earlierOf(store, chat.id, c.from.id) : undefined)
			if (elsewhere && !wf.partOf) { addPart(elsewhere, wf); step(elsewhere, `${c.from.name.split(' ')[0]} (${chat.group ? chat.name : '1:1'}, ${wf.code}): ${c.text}`, { ref: `part:${wf.id}` }); store.save(elsewhere) }
			appendThread(store, wf, toMsg(raw, c.from, c.text, false))
			// An old ask goes in its place among the newest lines the item started with.
			if (backlog) store.saveThread(wf.id, store.thread(wf.id).sort((a, b) => a.at.localeCompare(b.at)))
			if (wf.draft) wf.newCount++
			wf.pending.push(raw.id)
			wf.msgIds.push(raw.id)
			// A new ask withdraws any ok given before it (tester P0).
			Object.assign(wf, { asker: c.from, lastAsk: c.text, state: 'running', lastMsgId: raw.id, approved: undefined, needsMe: undefined, intakeDeferred: undefined })
			// The hold stays once set; only a draft that answers nothing but old messages waits its turn.
			if (backlog) Object.assign(wf, { before: true, paced: true })
			else wf.paced = undefined
			// Unaddressed group messages get judgment too, behind live asks and within the daily run cap.
			if (room) wf.paced = true
			// Only the message that was a guess stays a guess: a direct ask that joins the item is for the owner (review 10-20).
			if (room) Object.assign(wf, { startedBy: 'room', status: 'Checking whether this is for you' })
			else if (!groupJudgment && wf.startedBy === 'room') wf.startedBy = undefined
			if (truncated && !backlog) wf.status = 'Older messages skipped'
			store.save(wf)
			store.log({ event: 'intake-routed', chat: chat.id, msgId: raw.id, code: wf.code, reason: room ? 'group judgment' : follows ? 'same asker follow-up' : 'owned ask' })
			asks++
		}
	}
	if (!backlog) store.saveTurns(turns)
	return asks
}

// Whom a message sent for the owner answered: the people its item replied to.
function answeredBy(store: Store, msgId: string): string[] {
	const w = store.workflows().find(w => w.sent?.msgId === msgId)
	return w?.asker ? [w.asker.id, ...(w.askers ?? []).map(p => p.id)] : []
}

function route(store: Store, open: Workflow[], raw: RawMsg, senderId: string, recent?: Workflow, text = ''): Workflow | undefined {
	const candidates = [...open, ...(recent ? [recent] : [])].filter(item =>
		(item.asker?.id === senderId || !item.asker && !!item.partOf && !item.chat.group && !!senderId) &&
		freshAsk(store, item, Date.parse(raw.at), item === recent))
	const target = replyTarget(raw)
	const quoted = target && candidates.find(item => item.msgIds.includes(target) && askRelation(store, item, text) !== 'different')
	if (quoted) return quoted
	const same = candidates.filter(item => askRelation(store, item, text) === 'same')
	return same.length === 1 ? same[0] : undefined
}

// A follow-up continues the sender's closed item while the talk is fresh: a job item for 7 days (its PR is the key, R-WF-11),
// any other item until the thread has been quiet for quietHours (R-WF-09).
function recentItem(store: Store, chatId: string, senderId: string, quietHours: number, now = Date.now()): Workflow | undefined {
	// An item still inside its undo window keeps its receipt, so a follow-up starts a new item instead (review 01-04 P1-8).
	const undoable = (w: Workflow) => !!w.sent?.byRule && !!w.sent.undoUntil && Date.parse(w.sent.undoUntil) > now
	const fresh = (w: Workflow) => (w.job ? now - Date.parse(w.updatedAt) < 7 * 86_400_000 : !quietFor(store, w, quietHours, now))
	return closedBy(store, chatId, senderId).filter(w => !undoable(w) && fresh(w)).at(-1)
}

const closedBy = (store: Store, chatId: string, senderId: string) =>
	store.workflows().filter(w => w.state === 'done' && !w.redacted && w.chat.id === chatId && w.asker?.id === senderId).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))

// Quiet is measured from the conversation's last message, not from the item's last change.
function quietFor(store: Store, w: Workflow, hours: number, now = Date.now()): boolean {
	return now - Date.parse(store.thread(w.id).at(-1)?.at ?? w.updatedAt) > hours * 3_600_000
}

// After the quiet time, a new item starts from a short summary of the sender's last one, open or closed (R-WF-09).
function earlierOf(store: Store, chatId: string, senderId: string): string | undefined {
	const w = store.workflows().filter(w => w.code && !w.redacted && w.chat.id === chatId && w.asker?.id === senderId).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1)
	return w && `${w.updatedAt.slice(0, 10)}, ${w.code}: ${w.asker?.name ?? 'They'} asked "${(w.lastAsk ?? '').slice(0, 160)}". ${w.status.slice(0, 160)}`
}

// undefined means unknown, which the send gate treats as possibly having guests.
async function hasGuests(src: Source, chatId: string): Promise<boolean | undefined> {
	try { return (await src.members?.(chatId))?.guests } catch { return undefined }
}

async function create(store: Store, src: Source, cfg: Config, chat: WatchedChat, earlier?: string): Promise<Workflow> {
	const now = new Date().toISOString()
	const wf: Workflow = {
		schema: 1, id: ulid(), code: store.nextCode(), kind: 'reply', state: 'running',
		key: { type: 'thread', id: chat.id }, chat: { id: chat.id, name: chat.name, test: !!chat.test, group: !!chat.group, guests: await hasGuests(src, chat.id) },
		session: { agent: cfg.agent.flavor, id: randomUUID() },
		lastMsgId: '', pending: [], msgIds: [], status: 'Drafting a reply', newCount: 0, earlier, createdAt: now, updatedAt: now,
	}
	const history = await src.recent(chat.id, 20)
	for (const r of history) keepImages(store, r)
	store.saveThread(wf.id, history.filter(r => r.from).map(r => {
		const own = r.from!.id === cfg.owner.id, text = r.html ? htmlToText(r.body) : r.body
		// "[as Name]" in a test chat is that person's line, here as in classify (bug 10-23 E11).
		const as = own ? asSpeaker(text, !!chat.test) : undefined
		return as ? toMsg(r, as.from, as.text, false) : toMsg(r, own ? cfg.owner : r.from!, text, own)
	}))
	return wf
}

// Addressed to the whole chat, and asking for something: a PR, a review, or a question.
export const toRoom = (t: string) => /\b(guys|everyone|everybody|folks|anyone|anybody|someone|somebody)\b|\b(hi|hey|hello)\s+(all|team)\b/i.test(t) && /pullrequest\/\d+|\bPR\b|\breview\b|\?/i.test(t)

export const MISSED = /^missed\s+(https?:\/\/\S+)\s*(?::\s*([\s\S]*))?$/i
export const REVIEW_CMD = /^(?:re-?)?review\s+(?:(?:the\s+)?PR\s*#?\s*(\d+)|https?:\/\/\S*?pullrequest\/(\d+)\S*)\s*[.!]?$/i

// The owner pointed at a message that was missed (B21): it becomes an item like any ask, and why it was missed goes to the feedback log.
export async function takeMissed(store: Store, src: Source, cfg: Config): Promise<number> {
	let n = 0
	for (const q of store.missed()) {
		// Each link is handled on its own and leaves the queue only when done, so one failure loses nothing else.
		try { if (await takeOne(store, src, cfg, q)) n++ } catch (e) {
			store.log({ event: 'missed-failed', link: q.link, error: String(e).slice(0, 300) })
			if (Date.now() - Date.parse(q.at) < 86_400_000) continue
			await say(store, src, `${MARK} I could not make an item for ${q.link.slice(0, 120)} for a day, so I stopped trying: ${String(e).slice(0, 160)}`).catch(() => undefined)
		}
		store.doneMissed(q.file)
	}
	return n
}

async function takeOne(store: Store, src: Source, cfg: Config, q: Missed): Promise<boolean> {
	const at = parseMessageLink(q.link)
	if (!at) { await say(store, src, `${MARK} That is not a Teams message link, so nothing changed: ${q.link.slice(0, 120)}`); return false }
	const have = store.workflows().find(w => w.chat.id === at.chatId && w.msgIds.includes(at.msgId))
	if (have) { await say(store, src, `${MARK} That message is already ${have.code}: ${have.status}.`); return false }
	// An old message (from before the install, say) is read by itself, with what was said after it.
	let raw = (await src.recent(at.chatId, 50).catch(() => [])).find(m => m.id === at.msgId), after: RawMsg[] | undefined
	if (!raw && src.around) { const r = await src.around(at.chatId, at.msgId).catch(() => undefined); raw = r?.msg; after = r?.after }
	if (!raw?.from) { await say(store, src, `${MARK} I could not find that message in its chat, so nothing changed.`); return false }
	keepImages(store, raw)
	const group = isThread(at.chatId) || kindOf(at.chatId) !== 'oneOnOne', chats = store.chats()
	const c = classify(raw, { ownerId: cfg.owner.id, ownerName: cfg.owner.name, aliases: cfg.aliases, test: false, group, sentIds: store.sentIds() })
	const why = c.kind === 'owner' ? 'it is your own message, so it was not an ask' : c.kind === 'skip' ? `it was skipped (${c.why})`
		: !chats.seen[at.chatId] ? 'its chat was not among the chats being read'
		: raw.at <= chats.startedAt ? 'it came before reading started'
		: c.kind === 'context' ? 'it did not name you, and you had not just spoken to that person'
		: 'it looked like an ask, but no item was made'
	store.log({ event: 'missed', chat: at.chatId, msgId: at.msgId, kind: c.kind, why, note: q.note, from: raw.from, text: 'text' in c ? c.text.slice(0, 400) : '' })
	const name = (await src.chatName?.(at.chatId).catch(() => undefined)) ?? (isThread(at.chatId) ? 'Channel thread' : 'Teams chat')
	// The owner's own message: the work they took on then may still be theirs, so it is offered as work (round 3, item 6).
	if (c.kind === 'owner') {
		const wf = await create(store, src, cfg, { id: at.chatId, name, group })
		if (after) store.saveThread(wf.id, [toMsg(raw, cfg.owner, c.text, true), ...threadOf(after, cfg).slice(-39)])
		else if (!store.thread(wf.id).some(m => m.id === raw.id)) appendThread(store, wf, toMsg(raw, cfg.owner, c.text, true))
		Object.assign(wf, { startedBy: 'owner', missed: { at: raw.at }, lastAsk: c.text, state: 'running', lastMsgId: raw.id, pending: [raw.id], msgIds: [raw.id], status: 'Checking whether you took something on' })
		store.save(wf)
		await say(store, src, `${MARK} Checking whether your message from ${raw.at.slice(0, 10)} started work you still own (${wf.code}). Nothing is sent.`)
		return true
	}
	if (c.kind !== 'ask' && c.kind !== 'context') { await say(store, src, `${MARK} No item made: ${why}.`); return false }
	const wf = await create(store, src, cfg, { id: at.chatId, name, group })
	if (after) store.saveThread(wf.id, [toMsg(raw, c.from, c.text, false), ...threadOf(after, cfg).slice(-39)])
	else if (!store.thread(wf.id).some(m => m.id === raw.id)) appendThread(store, wf, toMsg(raw, c.from, c.text, false))
	Object.assign(wf, { asker: c.from, lastAsk: c.text, state: 'running', lastMsgId: raw.id, pending: [raw.id], msgIds: [raw.id], status: 'Drafting a reply to a message you said was missed' })
	store.save(wf)
	await say(store, src, `${MARK} Made ${wf.code} for ${c.from.name}'s message. It was missed because ${why}; that is logged so it can be fixed. A draft follows, and nothing is sent.`)
	return true
}

// Messages after an old one, as thread lines: who said what. The thread keeps 40, so the old message goes first and the newest 39 follow.
function threadOf(msgs: RawMsg[], cfg: Config): Msg[] {
	return msgs.filter(m => m.from && !m.deleted).map(m => toMsg(m, m.from!.id === cfg.owner.id ? cfg.owner : { id: m.from!.id, name: m.from!.name }, (m.html ? htmlToText(m.body) : m.body).trim().slice(0, 4000), m.from!.id === cfg.owner.id))
}

// An image pasted inline is kept, so the [image … inline:<key>] line in the thread opens with image_read (bug 10-23 E17).
function keepImages(store: Store, raw: RawMsg) { if (raw.html) for (const i of inlineImages(raw.body)) store.saveMedia(i.key, i.type, i.data) }

function appendThread(store: Store, wf: Workflow, m: Msg) {
	const t = store.thread(wf.id).filter(x => x.id !== m.id)
	store.saveThread(wf.id, [...t, m])
}

export function recordOwnerReply(store: Store, item: Workflow, message: Msg, answered?: boolean, text = message.text) {
	const askAt = askAtOf(store.thread(item.id), item.msgIds)
	rememberOwnerReply(store, item, message, answered, text)
	if (answered) {
		if (inWork(store, item)) {
			const home = homeOf(store, item)
			ownerStep(item, message.text, message.id, home)
			if (home !== item) store.save(home)
		} else {
			if (item.draft?.text && !item.sent && item.state === 'needs_human') {
				store.log({ event: 'replied', workflowId: item.id, code: item.code, chat: item.chat.id, asker: item.asker, intent: item.intent, draft: item.draft.text, text: text.slice(0, 2000) })
				outcome(store, item, 'sent', { draft: item.draft.text, sent: text, approvedBy: 'owner', msgId: message.id })
			}
			close(item, matchesOwnerDraft(text, item) ? 'You sent it yourself' : 'You replied yourself')
			item.closedBy = 'replied'
		}
	}
	store.save(item, true, item.closedBy === 'replied' ? { askAt, replyAt: message.at } : undefined)
}

// The open work an owner's @-ask in this chat belongs to, if any (bug 10-21; code review round 3, P2-2). A reply to one of a
// work's messages belongs to it; otherwise the ask must go to someone the work waits on or its asker, or name the work's link,
// and exactly one work may match; its asker alone is enough only when the chat has one open topic. An ask about anything else
// stays its own W entry, with its own follow-up.
export function workOfAsk(store: Store, open: Workflow[], raw: RawMsg, text: string, to: string[]): string | undefined {
	const homes = [...new Map(open.filter(o => inWork(store, o)).map(o => { const h = homeOf(store, o); return [h.id, h] as const })).values()]
	if (!homes.length) return undefined
	const quoted = replyTarget(raw)
	if (quoted) {
		const replied = homes.find(h => [h, ...store.workflows().filter(w => w.partOf === h.id)].some(w => w.msgIds?.includes(quoted) || w.lastMsgId === quoted))
		if (replied) return replied.code
	}
	const asked = { to } as Waiting
	const waited = homes.filter(h => !!h.work!.waitingOn?.who && answers(asked, h.work!.waitingOn.who))
	const theirs = homes.filter(h => waited.includes(h) || (!!h.asker?.name && answers(asked, h.asker.name)))
	const named = homeNamed(store, homes, text)
	const hit = [...new Set([...theirs, ...(named ? [named] : [])])]
	if (hit.length !== 1) return undefined
	// The asker alone is a weak sign (code review round 4, P2-2): "Kim, lunch?" in Kim's chat is not about Kim's work. With more
	// than one open topic in the chat (its open items, by home, and the owner's asks still waiting there), it takes the
	// work's link or someone the work waits on.
	const chat = open[0].chat.id
	const topics = new Set(open.map(o => homeOf(store, o).id)).size + store.waiting().filter(w => w.state === 'waiting' && w.chat.id === chat && !w.item).length
	return topics > 1 && hit[0] !== named && !waited.includes(hit[0]) ? undefined : hit[0].code
}

// A close starts with no reason; the caller sets one when it has it, so an earlier close's never carries over.
export function close(wf: Workflow, status: string) {
	Object.assign(wf, { state: 'done', status, pending: [], closedBy: undefined })
}

// Move messages the worker marked as another topic into a new item in the same chat, and queue it (D2).
export function splitOff(store: Store, cfg: Config, from: Workflow, ids: string[]): Workflow | undefined {
	// Work stays with the item that has it; the other topic leaves without it.
	const moving = new Set(ids.filter(id => from.msgIds.includes(id)))
	// An item cannot split off all of its own messages; then it already is that topic.
	if (!moving.size || moving.size >= from.msgIds.length) return undefined
	const thread = store.thread(from.id)
	const msgs = thread.filter(m => moving.has(m.id))
	const last = msgs.at(-1)!
	const now = new Date().toISOString()
	const wf: Workflow = {
		schema: 1, id: ulid(), code: store.nextCode(), kind: from.kind, state: 'running', key: from.key, chat: from.chat,
		asker: msgs[0].from, session: { agent: cfg.agent.flavor, id: randomUUID() }, lastMsgId: last.id, lastAsk: last.text,
		pending: [...moving], msgIds: [...moving], status: 'Drafting a reply', newCount: 0, createdAt: now, updatedAt: now,
		// A topic split from the week before keeps its hold.
		...(from.before ? { before: true as const } : {}),
	}
	from.msgIds = from.msgIds.filter(id => !moving.has(id))
	from.pending = from.pending.filter(id => !moving.has(id))
	const own = thread.filter(m => from.msgIds.includes(m.id))
	if (own.length) Object.assign(from, { asker: own.at(-1)!.from, lastAsk: own.at(-1)!.text, lastMsgId: own.at(-1)!.id })
	store.saveThread(wf.id, thread)
	store.save(wf)
	store.log({ event: 'split', from: from.code, to: wf.code, ids: [...moving] })
	return wf
}

// Someone else in the chat asked for the same thing: this item joins the open one, which redrafts once to answer and tag them all.
export function joinInto(store: Store, from: Workflow, to: Workflow, judged = false): boolean {
	if (to.id === from.id || to.chat.id !== from.chat.id || to.state === 'done') return false
	const relation = askRelation(store, to, from.lastAsk ?? '')
	if (!freshAsk(store, to) || relation === 'different' || relation === 'unknown' && !judged || to.sent) {
		store.log({ event: 'join-refused', from: from.code, to: to.code, reason: 'not the same recent unanswered ask' })
		return false
	}
	// Work does not merge yet: both items keep their own steps and watches (review P1.1).
	if (from.work || active(to)) return false
	const all = [to.asker, ...(to.askers ?? []), from.asker, ...(from.askers ?? [])].filter((p, i, a): p is Person => !!p && a.findIndex(q => q?.id === p.id) === i)
	// Each message keeps the line of the item that owns it: that one was read as an ask, the other may be only history (bug 10-23 E11).
	const own = new Set(from.msgIds), fromThread = store.thread(from.id), byId = new Map<string, Msg>()
	for (const m of store.thread(to.id)) byId.set(m.id, m)
	for (const m of fromThread) if (!byId.has(m.id) || own.has(m.id)) byId.set(m.id, m)
	store.saveThread(to.id, [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)))
	to.msgIds = [...new Set([...to.msgIds, ...from.msgIds])]
	to.pending = [...new Set([...to.pending, ...from.msgIds])]
	const latest = [...byId.values()].filter(message => !message.byOwner && to.msgIds.includes(message.id)).sort((a, b) => b.at.localeCompare(a.at))[0]
	if (latest) Object.assign(to, { asker: latest.from, lastAsk: latest.text, lastMsgId: latest.id })
	to.askers = all.filter(p => p.id !== to.asker?.id)
	if (to.state !== 'waiting_on_task') Object.assign(to, { state: 'running', status: `Redrafting to answer ${from.asker?.name ?? 'them'} too`, approved: undefined, sendAt: undefined })
	close(from, `Joined ${to.code}: the same ask`)
	store.save(to)
	store.save(from)
	store.log({ event: 'joined', from: from.code, to: to.code, asker: from.asker?.name })
	return true
}

// A reminder exists to get a reply. Once the person writes back in their 1:1, it pauses and says why; their message flows on as a normal item.
// Group chats are left alone: anyone else talking there is not the reminded person answering.
// A reply from the reminded person waits for the AI to read it with the reminder in view (B4). In a group chat only
// that person counts; others talking there are not them answering. Several replies before a decision are read together.
function hearReply(store: Store, chat: WatchedChat, name: string, text: string, at: string) {
	const first = (n: string) => n.trim().split(/\s+/)[0].toLowerCase()
	for (const a of store.automations()) {
		if (a.state !== 'active' || a.stopOnReply === false || a.to.chatId !== chat.id || !a.lastAt || !(Date.parse(at) > Date.parse(a.lastAt))) continue
		if (chat.group && first(name) !== first(a.to.name)) continue
		const heard = { text: [a.heard?.text, text].filter(Boolean).join('\n').slice(-1200), from: name, at }
		store.saveAutomation({ ...a, heard, updatedAt: new Date().toISOString() })
		store.log({ event: 'automation-heard', code: a.code, chat: chat.id })
	}
}
