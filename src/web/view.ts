import { homeOf, openTodos } from '../runner/work.ts'
import type { Automation, Choices, Fact, Meeting, Note, Proposal, Workflow } from '../core/types.ts'
import { asksReviewAgain, isVote, meaningParts, pendingEffects, reviewAgainCmd, shown, type Meaning } from '../core/effects.ts'
import { voteDropped } from '../runner/probe.ts'
import { groups, lookLine } from '../core/render.ts'
import type { Store } from '../store/state.ts'
import { bootLines, knowledgeOf } from '../runner/proposals.ts'
import type { Knowledge } from '../knowledge/index.ts'
import { describe, when } from '../runner/automations.ts'
import { DEFAULT_UNTIL } from '../runner/track.ts'
import { isThread, parseThread, messageLink, openLink, teamsChat } from '../adapters/channels.ts'
import { NAME } from '../brand.ts'
import type { versionInfo } from '../os/autoupdate.ts'
import type { settingsView } from './settings.ts'
import type { UiChoice } from '../store/state.ts'
import { place, snapshot, type NextView } from './next.ts'
import { currentDraft } from '../core/policy.ts'
import { htmlToText } from '../core/intake.ts'

// The one shape every surface renders: the browser page, the chat panel, and the synced snapshot (design-spec/data.md).
// Only what the owner should see: no ids, paths, or raw citations.

export type Who = { name: string; initials: string; hue: number }
export type SourceRow = { kind: 'Knowledge' | 'In the chat' | 'Private'; label: string; href?: string; stale?: boolean; locked?: boolean }
// meaning: what Azure DevOps says the change is about, in parts: a vote's PR and what an approval may do (a warning), or a
// deploy's ring (next action, owned work)
export type Change = { n: number; summary: string; target: string; system: string; action: string; detail?: string; meaning?: Meaning }
export type CardType = 'reply' | 'question' | 'choice' | 'meeting' | 'review'

export type ItemCard = {
	code: string; type: CardType; rev: string; who: Who; chat: { name: string; group: boolean; guests: boolean }; at: string
	ask?: string; thread: { who: string; text: string; at: string; owner: boolean }[]; newCount: number; earlier?: string
	// From the first-setup read: when the ask was sent.
	before?: string
	question?: string; draft?: { text: string; commitment: boolean; preview: boolean; holding?: true }
	choices?: Choices; picked?: number[]; context?: Fact[]; meeting?: Meeting; changes: Change[]; job?: string
	why: { reason?: string; confidence?: string; sources: SourceRow[]; gaps: string[]; searched?: string[] }
	notes: Note[]; status: string; openOn?: string; teams?: string
	todos?: string[]; follow?: { target: string; until: string; everyHours: number }
	// The owner's own words already went out: said, and why checking what they promised failed (Slice 3).
	promise?: { said: string; failed?: string }
	work?: WorkView
	// Show details (Settings, Advanced): what decided this item, for when something looks wrong.
	debug?: string[]
	// "Send reply only": a change failed or was dropped as not needed, and the reply is unsent. The existing "ok <code> except
	// <every change>"; the runner quotes the reply and a second ok sends it (next action).
	replyOnly?: string
	// "Review again": the PR changed since the review, so the question asks for the stale flow's own command.
	reviewAgain?: string
}
// Open work as the page shows it: the goal, where it stands, and its latest steps (R-WRK-07).
export type WorkView = { goal: string; next?: string; waiting?: string; due: boolean; steps: { at: string; what: string; news: boolean }[]; plan: { what: string; who: string; done: boolean; where?: string; build?: string }[]; home?: string; proposed: boolean }
export type KnowledgeCard = { code: string; rev: string; topic: string; home: 'team' | 'personal'; facts: { type: string; text: string; who?: string; date: string; href?: string; private: boolean }[] }
export type AutomationRow = { code: string; sentence: string; to: string; text: string; when: string; state: Automation['state']; why?: string; next?: string; count: number; rev: string }
export type DoneRow = { work?: string; code: string; kind: 'reply' | 'review' | 'change' | 'closed' | 'catchup' | 'reminder' | 'learned'; who: Who; sentence: string; high?: boolean; teams?: string; ask?: string; said?: string; inTeams?: boolean; gist?: string; watch?: { target: string; until: string }; watchedAs?: string; own?: boolean; href?: string; by: string; at: string; text?: string; undoUntil?: string; notes?: Note[]; why?: ItemCard['why']; rule?: string; fresh?: boolean ; msgs?: string[]; sentId?: string; earlier?: true }
export type Tile = { key: string; count: number; label: string; sub?: string }

export type View = {
	now: string; since?: string; owner: string
	// When the owner last looked at each Done filter (design-spec/done-v2.md).
	seen: Record<string, string>
	// Home's Catch up card: what Delegate read for the owner since they last looked, worth knowing first (design-spec/catch-up.md).
	catchUp: { count: number; top: DoneRow[] }
	details?: { runner: string; log: string[] }
	status: { state: 'on' | 'paused' | 'stopped'; autoSend: boolean; runs: number; cap: number; reading: Reading }
	health: { key: string; text: string; since: string; fix?: { label: string; command: string } }[]
	version?: ReturnType<typeof versionInfo>
	settings?: ReturnType<typeof settingsView>
	tiles: Tile[]; also: Tile[]
	needs: ItemCard[]; knowledge: KnowledgeCard[]
	done: DoneRow[]; running: { code: string; what: string; who?: string; since: string; progress?: number }[]
	watching: { code: string; what: string; last: string; changedAt?: string; update: boolean; rev: string; every?: number; endsAt?: string; by?: string; nextAt?: string; from?: string }[]
	progress: { code: string; who: Who; chat: string; goal: string; status: string; last?: { at: string; what: string }; next?: string; checkAt?: string; every?: number; endsAt?: string; rev: string }[]
	// Channels the owner named to watch (B5); link is the channel link, so stopping goes through the same path as starting.
	channels: { name: string; link: string }[]
	waiting: { code: string; to: string; chat: string; text: string; at: string; link?: string }[]
	automations: AutomationRow[]; people: { name: string; chat: string; group: boolean }[]
	// The New experience switch on this machine, and the new page's rows, built only when the new page asks (R-NEX-01, R-NEX-02).
	ui?: UiChoice; next?: NextView
}

const HUES = [210, 160, 25, 280, 340, 45]
export function who(name = 'Someone'): Who {
	const parts = name.trim().split(/\s+/)
	let h = 0
	for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
	return { name, initials: ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase(), hue: HUES[h % HUES.length] }
}

// At most 3 on Home: worth knowing first, then newest. The rest is one tap away under Done.
const catchUpOf = (rows: DoneRow[]) => ({ count: rows.length, top: [...rows].sort((a, b) => Number(!!b.high) - Number(!!a.high) || b.at.localeCompare(a.at)).slice(0, 3) })

// Ids and decisions as plain lines: shown under Show details, and copied as they are into a bug report.
export function debugLines(w: Workflow): string[] {
	const d = w.decision
	return [
		`${w.code} · ${w.id} · ${w.kind} · ${w.state}${w.startedBy ? ` · started by ${w.startedBy}` : ''}`,
		`Intent: ${w.intent ?? 'none yet'}`,
		d ? `Decision: ${d.action}${d.ruleId ? ` by rule ${d.ruleId}` : ''}, ${d.confidence} confidence: ${d.reason}` : 'Decision: none yet',
		`Chat: ${w.chat.id}${w.chat.group ? ' (group)' : ''}${w.chat.guests ? ' (guests)' : ''}`,
		`AI session: ${w.session.agent} ${w.session.id}${w.job ? ` · job ${w.job}` : ''}`,
		...(w.drewOn?.length ? [`Drew on: ${w.drewOn.join(', ')}`] : []),
		`Updated: ${w.updatedAt}`,
	]
}
const SKIP = new Set(['state', 'outcome'])
// Bet 1: whether chats are being read, from the last good read (the lease is written even when a read fails).
export type Reading = { state: 'ok' | 'late' | 'off' | 'never'; machine?: string; at?: string }
export function readingOf(store: Store, now = Date.now()): Reading {
	const c = store.chats(), at = c.goodAt ?? c.readAt, machine = store.lease()?.machine
	if (!at) return { state: 'never', machine }
	const min = (now - Date.parse(at)) / 60_000
	return { state: min < 20 ? 'ok' : min < 60 ? 'late' : 'off', machine, at }
}

function detailsOf(store: Store): { runner: string; log: string[] } {
	const l = store.lease(), ago = l ? Math.round((Date.now() - Date.parse(l.at)) / 60_000) : undefined
	const log = store.logs(1).filter(e => !SKIP.has(String(e.event))).slice(-15).reverse().map(e => [String(e.at).slice(11, 16), e.event, e.code, e.reason ?? e.why ?? e.error ?? e.summary].filter(Boolean).map(String).join(' · ').slice(0, 200))
	return { runner: l ? `${l.machine} reads your chats; last check ${ago} min ago. This machine: ${store.machine}.` : `No machine has checked yet. This machine: ${store.machine}.`, log }
}

// The page is the owner's own, so a cited fact shows its words and a link to where it was said (B30).
function source(ref: string, tier: string, stale?: boolean, label?: string, k?: Knowledge): SourceRow {
	const e = ref.startsWith('card:') ? k?.read(ref) : undefined, fact = e && !Array.isArray(e) ? e : undefined
	const link = fact?.src.map(x => x.link).find(l => /^https:\/\//.test(l)), open = link && openLink(link)
	const priv = fact?.audience === 'private' || tier === 'private'
	if (fact) return { kind: priv ? 'Private' : 'Knowledge', label: fact.text, href: open, stale, ...(priv ? { locked: true } : {}) }
	if (tier === 'card') return { kind: 'Knowledge', label: `Your knowledge: ${ref.replace(/^card:/, '').split(/[/#]/)[0].replace(/-/g, ' ')}`, stale }
	if (tier === 'private') return { kind: 'Private', label: label ?? 'A private chat or file', locked: true, stale, ...(/^https:\/\//.test(ref) ? { href: openLink(ref) } : {}) }
	const href = /^https:\/\//.test(ref) ? openLink(ref) : undefined
	const short = href ? (() => { const u = new URL(href); return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ''}` })() : ref.slice(0, 60)
	return { kind: 'In the chat', label: label ? `${short} · ${label}` : short, href, stale }
}

export function cardType(w: Workflow): CardType {
	if (w.meeting) return 'meeting'
	if (w.choices) return 'choice'
	if (pendingEffects(w.effects).length && w.job && !w.promised) return 'review'
	if (w.question && !w.draft?.preview) return 'question'
	return 'reply'
}

const nextOf = (k: NonNullable<Workflow['work']>) => k.next && `${k.next.who === 'you' ? 'You: ' : k.next.who === 'me' ? '' : ''}${k.next.what}`
// The Done chip for a reply on work: still in progress (and what is next), or closed (R-WRK-07).
function workLine(w: Workflow): string | undefined {
	const k = w.work
	if (!k) return undefined
	if (k.closed) return htmlToText(`Closed: ${k.closed.why}`)
	const next = nextOf(k)
	return htmlToText(`In progress${k.waitingOn ? ` · waiting on ${k.waitingOn.who}` : next ? ` · next: ${next}` : ''}`)
}
function workView(w: Workflow, home = w): WorkView | undefined {
	const k = home.work
	if (!k) return undefined
	const next = nextOf(k)
	return { goal: htmlToText(k.goal), next: next === undefined ? undefined : htmlToText(next), waiting: k.waitingOn && htmlToText(`${k.waitingOn.who}${k.waitingOn.where ? ` (${k.waitingOn.where})` : ''}`), due: home === w && w.state === 'needs_human' && !w.draft && /^No news/.test(w.status), steps: k.steps.slice(-6).map(x => ({ at: x.at, what: htmlToText(x.what), news: !!x.news })), plan: (k.plan ?? []).map(p => ({ what: htmlToText(p.what), who: p.who, done: !!p.done, ...(p.in ? { where: p.in } : {}), ...(p.probe ? { build: `${p.probe.build}${p.seen ? ` · ${p.seen}` : ''}` } : {}) })), ...(home !== w ? { home: home.code } : {}), proposed: !!k.proposed }
}

// What the owner can do when a change did not go as shown: send only the reply, or review a changed PR again. Cards are only
// for items that wait on the owner (needs_human), so a working item never offers either.
function nextSteps(w: Workflow): Pick<ItemCard, 'replyOnly' | 'reviewAgain'> {
	const left = pendingEffects(w.effects)
	const failed = left.some(e => e.error || e.maybe), dropped = voteDropped(w.status) && (w.effects ?? []).some(e => e.off && !e.done && isVote(e.call))
	return {
		// Never while a question is open: every ok is refused then (a stale vote after a change run, a refusedAsk; review chui P2-1).
		// Nor on a draft with a blank, which every ok refuses too (re-review N4).
		...(left.length && w.draft?.text && !/_{3,}/.test(w.draft.text) && !w.sent && !w.question && (failed || dropped) ? { replyOnly: `ok ${w.code} except ${left.map((_, i) => i + 1).join(' ')}` } : {}),
		...(asksReviewAgain(w.code, w.question) ? { reviewAgain: reviewAgainCmd(w.code) } : {}),
	}
}

export function card(store: Store, w: Workflow, k = knowledgeOf(store, store.config())): ItemCard {
	const job = w.job ? store.job(w.job) : undefined
	const draft = currentDraft(w, job)
	return {
		code: w.code, type: cardType(w), rev: w.revAt ?? w.updatedAt, who: who(w.startedBy === 'owner' ? 'You' : w.asker?.name), at: w.createdAt,
		chat: { name: w.chat.name, group: !!w.chat.group, guests: !!w.chat.guests },
		ask: w.lastAsk === undefined ? undefined : htmlToText(w.lastAsk), newCount: w.newCount, earlier: w.earlier === undefined ? undefined : htmlToText(w.earlier), before: w.before ? store.thread(w.id).find(m => m.id === w.lastMsgId)?.at ?? w.createdAt : undefined,
		thread: store.thread(w.id).slice(-12).map(m => ({ who: m.from.name, text: htmlToText(m.text).slice(0, 600), at: m.at, owner: !!m.byOwner })),
		question: w.question === undefined ? undefined : htmlToText(w.question), draft: draft?.text && !/^_{3,}$/.test(draft.text.trim()) ? { text: draft.text, commitment: draft.commitment, preview: !!draft.preview, ...(draft.holding ? { holding: true } : {}) } : undefined,
		choices: w.choices, picked: w.picked, context: [...(w.shareHold ? [{ label: 'Need to know', text: w.shareHold, tone: 'warn' as const }] : []), ...(w.context ?? [])].map(fact => ({ ...fact, label: htmlToText(fact.label), text: htmlToText(fact.text) })), meeting: w.meeting, job: job?.goal,
		// Every field is built from the change's call, never the AI's words about it (review 10-21 P1-1).
		changes: pendingEffects(w.effects).map((e, i) => { const s = shown(e), m = meaningParts(e); return { n: i + 1, summary: s.text, target: s.loc || s.system, system: s.system, action: s.line, detail: s.detail || undefined, ...(m ? { meaning: m } : {}) } }),
		...nextSteps(w),
		...(store.config().showDetails ? { debug: debugLines(w) } : {}),
		why: { reason: w.decision?.reason, confidence: w.decision?.confidence, sources: (w.draft?.sources ?? []).map(s => source(s.ref, s.tier, s.stale, s.label, k)), gaps: w.gaps ?? [], searched: (w.looked ?? []).map(lookLine) },
		...(w.promise?.state === 'offered' || w.promise?.state === 'failed' ? { promise: { said: w.promise.text, ...(w.promise.state === 'failed' ? { failed: w.promise.why ?? 'its run ended without a result' } : {}) } } : {}),
		work: workView(w, homeOf(store, w)), notes: (w.notes ?? []).map(n => n.sources ? { ...n, sources: n.sources.map(s => ({ ...s, ref: openLink(s.ref) })) } : n), status: htmlToText(w.status), openOn: w.openOn, todos: w.todos?.map(htmlToText), follow: w.follow && { target: w.follow.target, until: w.follow.until, everyHours: w.follow.everyHours ?? 4 },
		teams: teamsOf(w),
	}
}

export function knowledge(p: Proposal): KnowledgeCard {
	return { code: p.code, rev: p.revAt, topic: p.title, home: p.home ?? 'personal', facts: p.ops.map(o => ({ type: o.entry.type, text: o.entry.text, who: o.entry.src[0]?.who, date: o.entry.src[0]?.date ?? '', href: /^https:\/\//.test(o.entry.src[0]?.link ?? '') ? o.entry.src[0].link : undefined, private: o.entry.audience === 'private' })) }
}

const TASK = /task|work ?item|bug/i, PR = /pull|(^|_)pr($|_)|create_pr/i, INVITE = /calendar|invite|event|meeting/i, COMMENT = /comment|review/i

// The Done filters, which "seen" is kept for. Rows of a kind count as new after the owner last looked at its filter.
export const SEEN_KEYS = ['replies', 'reviews', 'changes', 'reminders', 'learned', 'catchup']
// The ask on one line, without the greeting, for list rows: "Hi Robin, which date…" reads "which date…".
const askLine = (t = '') => htmlToText(t).replace(/^\s*(hi|hello|hey|hii+|good (morning|afternoon|evening))\b[^,.!:\n]{0,40}[,.!:]?\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 160)
const short = (t = '') => htmlToText(t).replace(/\s+/g, ' ').trim().slice(0, 200)
// A test chat that is a real Teams chat links too (bug 10-23 E60); a made-up demo chat does not.
const teamsOf = (w: Workflow, msgId = w.lastMsgId) => (w.chat.id && msgId && (!w.chat.test || teamsChat(w.chat.id)) ? messageLink(w.chat.id, msgId) : undefined)
// Why an item closed with no reply from Delegate. Items from before closedBy was kept are read from their status.
const closedHow = (w: Workflow) => w.closedBy ?? (/^You replied yourself/.test(w.status) ? 'replied' : /^Skipped by you/.test(w.status) ? 'skipped' : undefined)

// An item's messages as "chat|msg", for Find on the new page (N1b review P2-6). A channel thread's item lives under
// "ch|<team>|<channel>|<root>", but a pasted link names the channel, so its messages are keyed by the channel (round 2, P2-B).
export const msgKeys = (w: Pick<Workflow, 'chat' | 'msgIds'>) => { const c = isThread(w.chat.id) ? parseThread(w.chat.id).channelId : w.chat.id; return w.msgIds.map(m => `${c}|${m}`) }

// An item's own Done row: its reply, its Catch up line, the owner's reply in Teams, or how it closed. Skipped items have none.
function itemRow(store: Store, w: Workflow): DoneRow | undefined {
	const name = w.asker?.name ?? 'Someone', where = w.chat.group ? ` in ${w.chat.name}` : '', first = name.split(/[\s,(]+/)[0]
	const made = (w.effects ?? []).filter(e => e.done)
	const sent = w.sent?.text ?? w.draft?.text
	const base = { code: w.code, who: who(name), teams: teamsOf(w), ask: w.redacted ? undefined : askLine(w.lastAsk) || undefined, ...(w.msgIds.length ? { msgs: msgKeys(w) } : {}) }
	if (w.sent) return { ...base, kind: made.length && w.intent === 'pr_review' ? 'review' : 'reply', sentence: made.length && w.intent === 'pr_review' ? `Reviewed for ${name} and replied${where}` : `Replied to ${name}${where}`, by: w.sent.byRule ? `by rule ${w.sent.byRule}` : 'by you', at: w.sent.at, text: w.redacted || sent === undefined ? undefined : htmlToText(sent), said: w.redacted ? undefined : short(sent), own: !w.sent.byRule, notes: w.notes ?? [], why: { reason: w.decision?.reason, confidence: w.decision?.confidence, sources: (w.draft?.sources ?? []).map(s => source(s.ref, s.tier, s.stale, s.label)), gaps: w.gaps ?? [] }, rule: w.sent.byRule, undoUntil: w.sent.undoUntil, work: workLine(homeOf(store, w)) }
	if (w.fyi) return { ...base, kind: 'catchup', sentence: htmlToText(w.fyi.line), gist: w.fyi.gist === undefined ? base.ask : htmlToText(w.fyi.gist), watch: w.fyi.watch, watchedAs: w.watchedAs, by: `${first}${w.chat.group ? ` · ${w.chat.name}` : ''}`, at: w.fyi.at ?? w.updatedAt, high: w.fyi.weight === 'high' }
	if (closedHow(w) === 'replied') {
		// Answered in Teams by the owner: a reply like any other, with their own words from the thread.
		const mine = store.thread(w.id).filter(m => m.byOwner).at(-1)
		return { ...base, kind: 'reply', sentence: `Replied to ${name}${where}`, by: 'by you in Teams', at: w.updatedAt, said: w.redacted ? undefined : mine ? short(mine.text) : undefined, inTeams: true, own: true, teams: (mine && teamsOf(w, mine.id)) ?? base.teams }
	}
	if (closedHow(w) !== 'skipped') return { ...base, kind: 'closed', sentence: `${name}: ${htmlToText(w.status.replace(/: ".*$/s, ''))}`, by: '', at: w.updatedAt }
	return undefined
}

// The rows a number on the Numbers tab counted, in Done's format, however long ago they closed (R-NEX-11). Keyed by item code.
export function itemRows(store: Store, codes: Iterable<string>, wfs: Workflow[] = store.workflows()): Record<string, DoneRow> {
	const want = new Set(codes), out: Record<string, DoneRow> = {}
	for (const w of wfs) if (w.code && want.has(w.code)) out[w.code] = itemRow(store, w) ?? { code: w.code, kind: 'closed', who: who(w.asker?.name), sentence: `${w.asker?.name ?? 'Someone'}: ${htmlToText(w.status.replace(/: ".*$/s, ''))}`, by: '', at: w.updatedAt, teams: teamsOf(w) }
	return out
}

function doneRows(store: Store, since: string, workflows = store.workflows()): DoneRow[] {
	const rows: DoneRow[] = [], listed = new Set<string>()
	for (const w of workflows.filter(w => (w.state === 'done' || w.state === 'open' && w.sent) && w.code && (w.intent !== 'none' || w.fyi) && w.updatedAt > since && w.kind !== 'tracker')) {
		const r = itemRow(store, w), name = w.asker?.name ?? 'Someone'
		if (r) rows.push(r)
		if (w.sent?.msgId) listed.add(w.sent.msgId)
		for (const e of (w.effects ?? []).filter(e => e.done)) if (!(w.intent === 'pr_review' && COMMENT.test(e.action))) rows.push({ code: w.code, kind: 'change', who: who(name), sentence: htmlToText(shown(e).line), by: shown(e).system, at: e.done!.at, own: true, href: /^https:\/\//.test(e.done?.ref ?? '') ? e.done!.ref : undefined })
	}
	// Every reply that went, as Numbers counts them: one an item made before it opened again, or an earlier one of the same item,
	// stays in Done from the send log (bug 10-23 E60). Its words are what was sent; feedback acts on the item's current reply only.
	const byCode = new Map(workflows.map(w => [w.code, w]))
	for (const e of store.logs(7).filter(e => e.event === 'sent' && String(e.at) > since && typeof e.msgId === 'string' && !listed.has(e.msgId) && !String(e.approvedBy ?? '').startsWith('automation:'))) {
		const w = byCode.get(String(e.code)), asker = e.asker as { name?: string } | undefined, name = asker?.name ?? w?.asker?.name ?? 'Someone'
		const rule = String(e.approvedBy ?? '').startsWith('rule:') ? String(e.approvedBy).slice(5) : undefined, chat = typeof e.chat === 'string' ? e.chat : w?.chat.id
		listed.add(String(e.msgId))
		rows.push({ code: String(e.code), kind: 'reply', who: who(name), sentence: `Replied to ${name}${w?.chat.group ? ` in ${w.chat.name}` : ''}`, by: rule ? `by rule ${rule}` : 'by you', at: String(e.at), text: typeof e.text === 'string' && !w?.redacted ? htmlToText(e.text) : undefined, said: typeof e.text === 'string' && !w?.redacted ? short(e.text) : undefined, own: !rule, rule, sentId: String(e.msgId), earlier: true, teams: chat && (!w?.chat.test || teamsChat(chat)) ? messageLink(chat, String(e.msgId)) : undefined })
	}
	for (const e of store.logs(7).filter(e => e.event === 'sent' && String(e.approvedBy ?? '').startsWith('automation:') && String(e.at) > since)) {
		const name = (e.asker as { name?: string })?.name ?? 'someone'
		rows.push({ code: String(e.code), kind: 'reminder', who: who(name), sentence: `Reminded ${name}`, said: typeof e.text === 'string' ? short(e.text) : undefined, by: String(e.code), at: String(e.at) })
	}
	for (const p of store.proposals().filter(p => p.state === 'applied' && p.from !== 'remember' && p.applied && p.applied.at > since)) {
		const n = p.ops.length
		rows.push({ code: p.code, kind: 'learned', who: who(p.source ?? 'your chats'), sentence: htmlToText(`Learned ${n} ${n === 1 ? 'fact' : 'facts'} about ${p.title}, from ${p.source ?? 'your chats'}`), gist: p.ops[0]?.entry.text ? short(p.ops[0].entry.text) : undefined, by: `say "undo ${p.code}" to take it back`, at: p.applied!.at })
	}
	return rows.sort((a, b) => b.at.localeCompare(a.at))
}

// Home tiles count only what happened since the owner last looked; a zero tile is hidden (design-spec/home.md).
function tiles(store: Store, since: string, needs: number, done: DoneRow[]): Tile[] {
	const replies = done.filter(r => r.kind === 'reply' || r.kind === 'review')
	const people = new Set(replies.map(r => r.who.name))
	const byRule = replies.filter(r => r.by.startsWith('by rule')).length
	const reviews = store.jobs().filter(j => j.intent === 'pr_review' && j.result && j.updatedAt > since).length
	const effects = store.workflows().flatMap(w => (w.effects ?? []).filter(e => e.done && e.done.at > since))
	const count = (re: RegExp) => effects.filter(e => re.test(`${e.system} ${e.action}`)).length
	const tasks = count(TASK), prs = effects.filter(e => PR.test(e.action)).length, invites = count(INVITE)
	const comments = effects.filter(e => COMMENT.test(e.action)).length
	const reminders = done.filter(r => r.kind === 'reminder').length
	const learned = store.proposals().filter(p => p.state === 'applied' && p.from !== 'remember' && p.applied && p.applied.at > since).reduce((n, p) => n + p.ops.length, 0)
	const t: Tile[] = [
		{ key: 'needs', count: needs, label: needs === 1 ? 'needs you' : 'need you' },
		{ key: 'replies', count: people.size, label: people.size === 1 ? 'Replied to 1 person' : `Replied to ${people.size} people`, sub: replies.length ? `${replies.length - byRule} by you, ${byRule} by your rules` : undefined },
		{ key: 'reviews', count: reviews, label: reviews === 1 ? 'Reviewed 1 PR' : `Reviewed ${reviews} PRs`, sub: comments ? `${comments} comment${comments === 1 ? '' : 's'} posted` : undefined },
		{ key: 'tasks', count: tasks, label: tasks === 1 ? 'Created 1 task' : `Created ${tasks} tasks` },
		{ key: 'prs', count: prs, label: prs === 1 ? 'Created 1 PR' : `Created ${prs} PRs` },
		{ key: 'invites', count: invites, label: invites === 1 ? 'Sent 1 invite' : `Sent ${invites} invites` },
		{ key: 'reminders', count: reminders, label: reminders === 1 ? 'Sent 1 reminder' : `Sent ${reminders} reminders` },
		{ key: 'learned', count: learned, label: learned === 1 ? 'Learned 1 fact' : `Learned ${learned} facts` },
	]
	return t.filter(x => x.key === 'needs' || x.count > 0)
}

export function view(store: Store, since: string | undefined, now = new Date(), workflows = store.workflows()): View {
	const cfg = store.config(), c = store.control()
	const from = since ?? new Date(now.getTime() - 86_400_000).toISOString()
	const wfs = workflows
	const g = groups(wfs, from)
	const placements = place(snapshot(store))
	const represented = new Set(placements.map(r => r.act))
	const todos = new Set(placements.filter(r => r.rule === 'todo').map(r => r.act))
	// A tracker needs the owner only when it proposes changes or asks something; otherwise it lives under Ongoing.
	const needs = g.needs.filter(w => represented.has(w.code) && !todos.has(w.code) && (w.kind !== 'tracker' || pendingEffects(w.effects).length || w.question)).map(w => card(store, w))
	const kp = store.proposals().filter(p => p.state === 'needs_human').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(knowledge)
	// Done keeps a week of history; only what is new since the owner last looked counts on Home (dogfood: replies vanished after a restart).
	const week = new Date(now.getTime() - 7 * 86_400_000).toISOString()
	const done = doneRows(store, from < week ? from : week, wfs).map(r => ({ ...r, fresh: r.at > from }))
	const autos = store.automations().filter(a => a.state !== 'ended').map(a => ({ code: a.code, sentence: describe(a).replace(/^R\d+ · /, ''), to: a.to.name, text: a.text, when: when(a.schedule), state: a.state, why: a.why, next: a.next, count: a.count, rev: a.updatedAt }))
	const watching = g.watching.filter(w => represented.has(w.code) && !todos.has(w.code)).map(w => ({ code: w.code, what: htmlToText((w.lastAsk ?? '').replace(/^Watch /, '').replace(` until ${DEFAULT_UNTIL}`, '')), last: htmlToText(w.status), changedAt: w.changedAt, update: !!w.changedAt && w.changedAt > from && (!w.ackAt || w.changedAt > w.ackAt), rev: w.revAt ?? w.updatedAt , every: (w.job ? store.job(w.job) : undefined)?.every, endsAt: (w.job ? store.job(w.job) : undefined)?.endsAt, by: w.watchBy, nextAt: (w.job ? store.job(w.job) : undefined)?.nextAt, from: w.watchFrom === 'catchup' ? wfs.find(x => x.watchedAs === w.code)?.code : undefined }))
	const progress = wfs.filter(w => represented.has(w.code) && (todos.has(w.code) || w.state === 'open' || w.state === 'waiting_on_sender')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(w => {
		const k = homeOf(store, w).work, job = k?.watch ? store.job(k.watch) : undefined, last = k?.steps.at(-1)
		const next = todos.has(w.code) ? `You: ${openTodos(w).map(t => t.text).join('; ')}` : k ? nextOf(k) : undefined
		return { code: w.code, who: who(w.asker?.name), chat: w.chat.name, goal: htmlToText(k?.goal ?? w.lastAsk ?? w.status), status: htmlToText(w.status), last: last && { at: last.at, what: htmlToText(last.what) }, next: next === undefined ? undefined : htmlToText(next), checkAt: k?.checkAt, every: job?.every, endsAt: job?.every ? job.endsAt : undefined, rev: w.updatedAt }
	})
	const running = [...g.running.filter(w => represented.has(w.code) && !todos.has(w.code)).map(w => ({ code: w.code, what: htmlToText(w.status), who: w.asker?.name, since: w.waitingSince ?? w.updatedAt })), ...bootLines(store).map(b => ({ code: '', what: htmlToText(b.what), since: b.since, ...(b.total ? { progress: (b.done ?? 0) / b.total } : {}) }))]
	const state = c.stopped ? 'stopped' : c.paused || cfg.paused ? 'paused' : 'on'
	const health = Object.entries(store.health()).map(([key, h]) => ({ key, text: h.text, since: h.since, fix: key === 'source' ? { label: 'Try again', command: 'retry' } : undefined }))
	if (state !== 'on') health.unshift({ key: 'paused', text: state === 'stopped' ? `${NAME} is stopped. It is not reading your chats.` : `${NAME} is paused. It keeps drafting, and sends nothing.`, since: '', fix: { label: 'Resume', command: 'resume' } })
	const people = new Map<string, { chat: string; group: boolean }>()
	for (const w of wfs) if (!w.chat.test && w.asker && !isThread(w.chat.id)) people.set(w.chat.group ? w.chat.name : w.asker.name, { chat: w.chat.id, group: !!w.chat.group })
	// The owner's asks nobody answered for followUpHours (default 24) (design: Waiting on others).
	const due = now.getTime() - (cfg.followUpHours ?? 24) * 3_600_000
	// A wait with an open follow-up item is shown as that item; once the item closes, it returns after another followUpHours.
	const quietSince = (w: ReturnType<Store['waiting']>[number]) => { const f = w.item ? store.byCode(w.item) : undefined; return f ? (f.state === 'done' ? Date.parse(f.updatedAt) : Infinity) : Date.parse(w.at) }
	const waiting = store.waiting().filter(w => w.state === 'waiting' && quietSince(w) < due).map(w => ({ code: w.code, to: w.to.join(', '), chat: w.chat.name, text: htmlToText(w.text), at: w.at, link: w.msgId ? messageLink(w.chat.id, w.msgId) : undefined }))
	const updates = watching.filter(w => w.update).length
	return {
		now: now.toISOString(), since, owner: cfg.owner.name,
		status: { state, autoSend: !!c.autoSend, runs: store.runsToday(), cap: cfg.dailyRuns ?? 200, reading: readingOf(store) },
		health, tiles: tiles(store, from, needs.length, done.filter(r => r.fresh)),
		also: [
			{ key: 'knowledge', count: kp.length, label: kp.length === 1 ? 'to learn' : 'to learn' },
			{ key: 'watching', count: updates, label: updates === 1 ? 'update' : 'updates', sub: [`${watching.length} watched`, ...(progress.length ? [`${progress.length} in progress`] : [])].join(' · ') },
			{ key: 'waiting', count: waiting.length, label: 'waiting on others', sub: waiting[0] ? `${waiting[0].to}, since ${new Date(waiting[0].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined },
			{ key: 'suggestions', count: store.habits().filter(h => h.state === 'suggested').length, label: 'suggestion', sub: 'From what you usually do' },
			{ key: 'running', count: running.length, label: 'running' },
			{ key: 'automations', count: autos.filter(a => a.state !== 'paused').length, label: autos.length === 1 ? 'automation' : 'automations', sub: autos.find(a => a.next) ? `Next: ${autos.find(a => a.next)!.to}` : undefined },
		].filter(t => t.count > 0 || (t.key === 'watching' && watching.length + progress.length > 0)),
		seen: store.seen(),
		catchUp: catchUpOf(done.filter(r => r.kind === 'catchup' && r.at > (store.seen().catchup ?? from))),
		needs, knowledge: kp, done, running, watching, progress, waiting, automations: autos,
		...(cfg.showDetails ? { details: detailsOf(store) } : {}),
		channels: (store.config()?.channels || []).map(c => ({ name: c.name, link: `https://teams.microsoft.com/l/channel/${encodeURIComponent(c.channelId)}/${encodeURIComponent(c.name)}?groupId=${c.teamId}` })),
		people: [...people].map(([name, p]) => ({ name, ...p })).sort((a, b) => a.name.localeCompare(b.name)),
	}
}
