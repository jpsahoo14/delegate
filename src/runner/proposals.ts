import { view } from '../web/view.ts'
import { describe } from './automations.ts'
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Answer, Audience, Claim, Config, Entry, Op, Proposal, Source, Src, Job } from '../core/types.ts'
import { ulid } from '../core/ids.ts'
import { kindOf } from './discover.ts'
import type { Store } from '../store/state.ts'
import { openKnowledge, StaleCard, type Knowledge } from '../knowledge/index.ts'
import { CARD_OF, clean, expired, parseLine, slug } from '../knowledge/format.ts'
import { renderList } from '../core/render.ts'
import { YOURS, type BootSource } from './bootstrap.ts'
import { offRecord } from '../core/levels.ts'
import { fromOffChat } from './sharing.ts'
import { parseMessageLink } from '../adapters/channels.ts'
import { scrub } from '../core/secrets.ts'

export const knowledgeOf = (store: Store, cfg: Config): Knowledge => openKnowledge(cfg.cards?.root ?? join(store.root, 'knowledge'), store.machine, cfg.cards?.team)

// Any source the asker cannot see makes the claim private: a 1:1 chat, mail, or a worker's private flag (R-BOOT-07, tester 05 P0-2, P1-8).
const privateLink = (link: string) => {
	const chat = link.match(/teams\.microsoft\.com\/l\/message\/([^/]+)\//)?.[1]
	return (!!chat && kindOf(decodeURIComponent(chat)) === 'oneOnOne') || /outlook\.|mailto:/i.test(link)
}
const audienceOf = (c: Claim): Audience => (c.audience === 'private' || c.src.some(s => privateLink(s.link)) ? 'private' : 'team')
const mergeSrc = (a: Src[], b: Src[]) => [...a, ...b.filter(s => !a.some(x => x.link === s.link))]
const newest = (s: Src[]) => s.map(x => x.date).sort().at(-1) ?? ''

// Claims become proposals, one per topic, never merged into an earlier proposal, so an ok always applies exactly what it showed.
// A claim that matches a stored entry (same source or same text) updates that entry, on that entry's own card (tester 05 P1-9, P1-10).
export function propose(store: Store, k: Knowledge, claims: Claim[], from: Proposal['from'], source?: string): Proposal[] {
	const pending = store.proposals().filter(p => p.state === 'needs_human').flatMap(p => p.ops)
	const byTopic = new Map<string, { title: string; ops: Op[] }>()
	const titles = new Map(k.topics().map(t => [t.topic, t.title])), cfg = store.config()
	for (const raw of claims) {
		const src = (raw.src ?? []).map(s => ({ link: clean(s.link ?? ''), date: (s.date ?? '').slice(0, 10), who: s.who && clean(s.who) })).filter(s => s.link)
		const c: Claim = { ...raw, topic: clean(raw.topic ?? ''), text: scrub(clean(raw.text ?? '')), src }
		if (!c.text || !src.length) continue
		// Nothing is learned from a chat kept off the record, unless the owner says it themselves.
		if (from !== 'remember' && src.some(s => offRecord(cfg, parseMessageLink(s.link)?.chatId))) continue
		const topicSlug = slug(c.topic)
		const known = src.map(s => k.bySource(s.link)).find(Boolean) ?? sameText(k, topicSlug, c.text)
		const topic = known?.topic ?? topicSlug
		const group = byTopic.get(topic) ?? { title: titles.get(topic) ?? c.title ?? c.topic, ops: [] }
		byTopic.set(topic, group)
		const audience: Audience = known?.audience === 'private' ? 'private' : audienceOf(c)
		const entry = { type: c.type, text: c.text, tags: c.tags ?? [], src, audience }
		// The same source twice in one batch: the newer claim wins.
		const twin = group.ops.findIndex(o => o.entry.src.some(s => src.some(x => x.link === s.link)) || o.entry.text === c.text)
		if (twin >= 0) {
			const o = group.ops[twin]
			if (newest(src) >= newest(o.entry.src)) group.ops[twin] = { ...o, entry: { ...entry, src: mergeSrc(src, o.entry.src), audience: o.entry.audience === 'private' ? 'private' : audience } }
			continue
		}
		if (known) {
			const merged = mergeSrc(known.src, src)
			if (known.text === c.text && merged.length === known.src.length && known.audience === audience) continue
			group.ops.push({ op: 'update', id: known.id, card: known.card, entry: { ...entry, type: known.type, text: known.text === c.text ? known.text : c.text, src: merged, tags: [...new Set([...known.tags, ...entry.tags])] } })
			continue
		}
		if (pending.some(o => o.entry.text === c.text || o.entry.src.some(s => src.some(x => x.link === s.link)))) continue
		group.ops.push({ op: 'add', card: CARD_OF[c.type], entry })
	}
	const out: Proposal[] = []
	for (const [topic, { title, ops }] of byTopic) {
		if (!ops.length) continue
		const now = new Date().toISOString()
		const cards = [...new Set(ops.map(o => o.card))]
		const p: Proposal = { schema: 1, id: ulid(), code: store.nextCode('K'), topic, title: clean(title), ops, base: {}, from, source, state: 'needs_human', status: summary(ops, source ?? from), revAt: now, createdAt: now, updatedAt: now }
		p.home = k.home?.(p)
		p.base = Object.fromEntries(cards.map(c => [c, k.cardHash(topic, c, p.home)]))
		store.saveProposal(p)
		out.push(p)
	}
	return out
}

function sameText(k: Knowledge, topic: string, text: string): Entry | undefined {
	const cards = k.read(topic)
	return Array.isArray(cards) ? cards.flatMap(c => c.entries).find(e => e.text === text) : undefined
}

function summary(ops: Op[], from: string): string {
	const n = (k: Op['op']) => ops.filter(o => o.op === k).length
	return [n('add') && `${n('add')} new`, n('update') && `${n('update')} update${n('update') > 1 ? 's' : ''}`, n('retire') && `${n('retire')} to remove`].filter(Boolean).join(', ') + ` · from ${from}`
}

// ok K3 writes exactly what the owner saw; a changed card makes a fresh proposal instead (exact-revision ok).
export function answerProposal(store: Store, k: Knowledge, p: Proposal, a: Answer): string {
	if (a.verb === 'more') return renderProposal(p, a.surface === 'self' ? 6 : Infinity)
	if (a.verb === 'undo') return undoProposal(store, k, p)
	if (p.state !== 'needs_human') return `${p.code} is already ${p.state}.`
	if (a.verb === 'skip') { Object.assign(p, { state: 'dropped', status: 'Dropped by you' }); store.saveProposal(p); return `Dropped ${p.code}. Nothing was saved.` }
	if (a.verb === 'edit' && a.text) {
		if (p.ops.length !== 1) return `${p.code} has ${p.ops.length} entries. Edit the card file, or skip ${p.code} and say "remember ..." instead.`
		p.ops[0] = { ...p.ops[0], entry: { ...p.ops[0].entry, text: clean(a.text) } }
	} else if (a.verb !== 'ok') return `Use ok, edit, skip, more, or undo with ${p.code}.`
	else if (a.seenAt && a.seenAt < p.revAt) return `${p.code} changed after your ok. ${renderProposal(p)}\nReply "ok ${p.code}" to save it.`
	// "ok K1 #1 #3" saves only those facts; the rest are dropped from this proposal (design-spec cards: Knowledge).
	if (a.verb === 'ok' && a.nums?.length) {
		if (a.nums.some(n => n < 1 || n > p.ops.length)) return `${p.code} has facts 1 to ${p.ops.length}.`
		p.ops = p.ops.filter((_, i) => a.nums!.includes(i + 1))
	}
	try {
		const applied = k.apply(p)
		Object.assign(p, { state: 'applied', applied: { at: new Date().toISOString(), ...applied }, status: `Saved ${p.ops.length} to ${p.title}` })
		store.saveProposal(p)
		store.log({ event: 'knowledge-applied', code: p.code, topic: p.topic, ids: applied.ids })
		return `Saved ${p.code}: ${p.ops.length} entr${p.ops.length === 1 ? 'y' : 'ies'} in ${p.title}. Say "undo ${p.code}" to take it back.`
	} catch (e) {
		if (!(e instanceof StaleCard)) throw e
		const claims = p.ops.map(o => ({ topic: p.title, title: p.title, type: o.entry.type, text: o.entry.text, src: o.entry.src, audience: o.entry.audience, tags: o.entry.tags }))
		Object.assign(p, { state: 'dropped', status: 'Replaced: the card changed' })
		store.saveProposal(p)
		const [fresh] = propose(store, k, claims, p.from, p.source)
		return fresh ? `${p.title} changed since ${p.code}. Review ${fresh.code} instead.` : `${p.title} already has everything ${p.code} proposed.`
	}
}

// Undo restores exactly what K wrote over, and leaves any entry the owner changed since then alone (tester 05 P1-2, P1-3).
function undoProposal(store: Store, k: Knowledge, p: Proposal): string {
	const done = p.applied
	if (p.state !== 'applied' || !done?.lines) return `${p.code} was not saved, so there is nothing to undo.`
	const ops: Op[] = [], kept: string[] = []
	p.ops.forEach((o, i) => {
		const id = done.ids[i]
		if (k.line(p.topic, o.card, id) !== done.lines![i]) { kept.push(id); return }
		const prev = done.prev![i] && parseLine(done.prev![i]!, { topic: p.topic, card: o.card, audience: 'team' })
		ops.push(prev ? { op: 'update', id, card: o.card, entry: prev } : { op: 'retire', id, card: o.card, entry: o.entry })
	})
	if (ops.length) k.apply({ ...p, id: ulid(), ops, base: Object.fromEntries([...new Set(ops.map(o => o.card))].map(c => [c, k.cardHash(p.topic, c, p.home)])) })
	Object.assign(p, { state: 'dropped', status: 'Undone by you' })
	store.saveProposal(p)
	return `Took back ${p.code}: ${ops.length} fact${ops.length === 1 ? '' : 's'} in ${p.title} ${ops.length === 1 ? 'is' : 'are'} back as before.${kept.length ? ` ${kept.length} you changed since then stay as you left them.` : ''}`
}

// "remember ..." in the AI chat: the owner asked for it, so it is saved at once, as its own proposal, with undo (tester 05 P0-1).
export function remember(store: Store, k: Knowledge, owner: string, c: Omit<Claim, 'src'> & { link?: string }): string {
	const src = [{ link: c.link || `delegate:remember/${ulid()}`, date: new Date().toISOString().slice(0, 10), who: owner }]
	const [p] = propose(store, k, [{ ...c, src, audience: c.audience ?? 'private' }], 'remember', 'you')
	if (!p) return 'The knowledge already says that.'
	return answerProposal(store, k, p, { id: '', code: p.code, verb: 'ok', surface: 'chat', at: '' })
}

// The owner corrects or forgets one entry in plain words from the AI chat; saved at once with an undo, like remember.
export function changeKnowledge(store: Store, k: Knowledge, owner: string, c: { ref: string; text?: string; link?: string }): string {
	const e = k.read(c.ref)
	if (!e || Array.isArray(e)) return `I could not find ${c.ref}. Search first and pass one entry's citation.`
	const now = new Date().toISOString()
	const src = [{ link: c.link || `delegate:remember/${ulid()}`, date: now.slice(0, 10), who: owner }, ...e.src]
	const text = c.text ? clean(c.text) : undefined
	if (text === e.text) return 'The knowledge already says that.'
	const op: Op = text ? { op: 'update', id: e.id, card: e.card, entry: { type: e.type, text, tags: e.tags, src, audience: e.audience } } : { op: 'retire', id: e.id, card: e.card, entry: { type: e.type, text: e.text, tags: e.tags, src: e.src, audience: e.audience } }
	const titles = new Map(k.topics().map(t => [t.topic, t.title]))
	const p: Proposal = { schema: 1, id: ulid(), code: store.nextCode('K'), topic: e.topic, title: titles.get(e.topic) ?? e.topic, ops: [op], base: {}, from: 'remember', source: 'you', state: 'needs_human', status: summary([op], 'you'), revAt: now, createdAt: now, updatedAt: now }
	p.home = k.home?.(p)
	p.base = { [e.card]: k.cardHash(e.topic, e.card, p.home) }
	store.saveProposal(p)
	return answerProposal(store, k, p, { id: '', code: p.code, verb: 'ok', surface: 'chat', at: '' })
}

// What Delegate learns from the owner's chats, PRs, work items, and edits is saved at once, with its sources and an undo;
// approving each fact one by one was too much (dogfood: 43 waiting after the first part of the history read).
// reviewLearning in the config brings back approval first. Facts age by their kind (TTL_DAYS) and newer sources replace them.
export function saveLearned(store: Store): number {
	const cfg = store.config()
	if (cfg.reviewLearning) return 0
	const k = knowledgeOf(store, cfg)
	let n = 0
	for (const p of store.proposals().filter(p => p.state === 'needs_human' && (p.from === 'bootstrap' || p.from === 'edit'))) {
		// A chat marked off the record after this was proposed: its facts are not saved by themselves.
		const keep = p.ops.filter(o => !fromOffChat(cfg, o.entry.src))
		if (keep.length < p.ops.length) { Object.assign(p, { ops: keep, ...(keep.length ? {} : { state: 'dropped', status: 'From a chat you keep off the record' }) }); store.saveProposal(p); if (!keep.length) continue }
		answerProposal(store, k, p, { id: '', code: p.code, verb: 'ok', surface: 'chat', at: '' })
		if (store.proposals().find(q => q.id === p.id)?.state === 'applied') n++
	}
	if (n) store.log({ event: 'learned', proposals: n })
	return n
}

// "publish" in an owned session: the owner asked for it, so it is saved at once with undo; the session is the source (R-ADP-04).
export function publish(store: Store, k: Knowledge, owner: string, topic: string, claims: Omit<Claim, 'topic' | 'src'>[], session?: string): string {
	const src = () => [{ link: `copilot-session:${session ?? 'unknown'}/${ulid()}`, date: new Date().toISOString().slice(0, 10), who: owner }]
	const made = propose(store, k, claims.map(c => ({ ...c, topic, src: src(), audience: c.audience ?? 'private' })), 'remember', 'this session')
	if (!made.length) return 'The knowledge already says all of that.'
	return made.map(p => answerProposal(store, k, p, { id: '', code: p.code, verb: 'ok', surface: 'chat', at: '' })).join('\n')
}

// The phone shows a bounded view and says what it left out; ok still saves the whole topic, and says so (tester 05 P1-5).
export function renderProposal(p: Proposal, max = Infinity): string {
	const shown = p.ops.slice(0, max)
	const lines = shown.map(o => `- ${o.op === 'add' ? 'new' : o.op} [${o.entry.type}] ${o.entry.text}${o.entry.audience === 'private' ? ' (private)' : ''}\n  source: ${o.entry.src.map(s => [s.link, s.date, s.who].filter(Boolean).join(', ')).join('; ')}`)
	const rest = p.ops.length - shown.length
	return [`${p.code} · ${p.title} · ${p.status}${p.home === 'team' ? ' · saves to team knowledge' : ''}`, ...lines, ...(rest > 0 ? [`… and ${rest} more. ok ${p.code} saves all ${p.ops.length}. See them all with "open my inbox".`] : [])].join('\n')
}

// After each answer the next topic follows, so reviewing many is one reply each.
export function nextProposal(store: Store, after?: string, max = Infinity): string {
	const next = store.proposals().filter(p => p.state === 'needs_human' && p.code !== after).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
	if (!next) return after ? 'That was the last one.' : 'Nothing to review.'
	return `${after ? 'Next:\n' : ''}${renderProposal(next, max)}\nReply "ok ${next.code}", "skip ${next.code}", or "edit ${next.code}: ...".`
}

// Every citation is resolved by what it is, whatever tier the worker gave it (R-ANS-02, tester 05 P0-3, P1-6, P1-7).
export function resolveEvidence(k: Knowledge, cfg: Config, sources: Source[], root = ''): Source[] {
	const folders = (cfg.knowledge ?? []).map(f => resolve(root, f))
	return sources.map(s => {
		if (s.ref.startsWith('card:')) {
			const e = k.read(s.ref)
			if (!e || Array.isArray(e)) return { ...s, tier: 'card', stale: true }
			return { ...s, tier: e.audience === 'private' ? 'private' : 'card', stale: expired(e) || undefined }
		}
		if (/^https:\/\//i.test(s.ref)) return { ...s, tier: privateLink(s.ref) || s.tier === 'private' ? 'private' : 'live', stale: undefined }
		const path = resolve(s.ref)
		const inside = folders.some(f => { const r = relative(f, path); return !!r && !r.startsWith('..') && !isAbsolute(r) })
		if (inside && existsSync(path)) return { ...s, tier: s.tier === 'private' ? 'private' : 'card', stale: undefined }
		return { ...s, stale: true }
	})
}

// The one inbox every surface shows. Results of AI-chat actions wait here, so the owner sees them next time (tester 05 P2-2).
export function inbox(store: Store, since?: string): string {
	const receipts = store.takeReceipts()
	const list = renderList(store.workflows(), new Date(), since, store.health(), { proposals: store.proposals(), background: bootLines(store), automations: store.automations().filter(a => a.state !== 'ended').map(a => ({ line: describe(a), state: a.state, next: a.next, code: a.code })), waiting: view(store, since).waiting })
	store.markShown(store.workflows())
	const caught = catchUpLines(store, since)
	const all = caught.length ? `${list}\n\n### Catch up\n${caught.join('\n')}\nSay "mine ${caught[0].split(' ')[1]}" if one of these needs you.` : list
	return receipts.length ? `### Since you last asked\n${receipts.map(r => `- ${r.text.replace(/\n+/g, ' ')}`).join('\n')}\n\n${all}` : all
}

// What Delegate read for the owner and closed as worth knowing, worth knowing first (design-spec/catch-up.md).
export function catchUpLines(store: Store, since?: string, max = 8): string[] {
	const from = since ?? new Date(Date.now() - 86_400_000).toISOString()
	const ws = store.workflows().filter(w => w.state === 'done' && w.fyi && w.updatedAt > from).sort((a, b) => Number(b.fyi!.weight === 'high') - Number(a.fyi!.weight === 'high') || b.updatedAt.localeCompare(a.updatedAt))
	return [...ws.slice(0, max).map(w => `- ${w.code} ${w.asker?.name.split(/\s+/)[0] ?? 'Someone'}${w.chat.group ? ` · ${w.chat.name}` : ''}: ${w.fyi!.line}`), ...(ws.length > max ? [`- and ${ws.length - max} more on the page, under Done › Catch up`] : [])]
}

// One line per source being learned. A history read in parts is one line with its progress, not one per part (dogfood: 20 cards).
export function bootLines(store: Store): { what: string; since: string; done?: number; total?: number }[] {
	const groups = new Map<string, Job[]>()
	for (const j of store.jobs().filter(j => j.key.startsWith('bootstrap:'))) {
		const g = j.key.match(/^bootstrap:[^:]+(:\d{4}-\d{2}-\d{2})?/)![0]
		groups.set(g, [...(groups.get(g) ?? []), j])
	}
	return [...groups.values()].flatMap(js => {
		const active = js.filter(j => j.state === 'running' || j.state === 'queued')
		if (!active.length) return []
		const what = (js[0].label ?? YOURS[js[0].key.replace('bootstrap:', '') as BootSource] ?? js[0].key).replace(/, part \d+ of \d+$/, '')
		const since = js.map(j => j.createdAt).sort()[0]
		if (js.length === 1) return [{ what: `${active[0].state === 'running' ? 'Learning from' : 'Waiting to learn from'} ${what}`, since: active[0].run?.startedAt ?? since }]
		const reading = active.filter(j => j.state === 'running').length, done = js.length - active.length
		return [{ what: `Learning from ${what}: ${done} of ${js.length} parts done${reading ? `, ${reading} reading now` : ''}`, since, done, total: js.length }]
	})
}
