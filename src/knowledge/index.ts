import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Audience, Card, CardName, Entry, EntryType, Hit, Proposal, TopicLine } from '../core/types.ts'
import { readText, scoped, writeText } from '../store/fs.ts'
import { CARDS, editCard, expired, formatLine, hashOf, newCard, parseCard } from './format.ts'
import { openLink } from '../adapters/channels.ts'

// The one boundary every part of Delegate uses for knowledge. Another store (Basic Memory, a team wiki) implements the same calls.
export interface Knowledge {
	search(q: string, f?: { types?: EntryType[]; audience?: Audience; limit?: number }): Hit[]
	read(ref: string): Entry | Card[] | undefined
	topics(): TopicLine[]
	bySource(link: string): Entry | undefined
	withdrawSource(link: string): number
	cardHash(topic: string, card: CardName, home?: 'personal' | 'team'): string
	apply(p: Proposal): Applied
	line(topic: string, card: CardName, id: string): string | undefined
	// Where a proposal saves: the owner's own folder, or the team's shared folder (R-KNO-06).
	home?(p: Pick<Proposal, 'topic' | 'ops'>): 'personal' | 'team'
	// Where one entry lives, when there is a team layer (#20 G3).
	homeOf?(ref: string): 'personal' | 'team' | undefined
	// The owner's own cards only (#21 §2c): a team card is shared, and a run that reads one is still held by need to know.
	moveOut?(match: (e: Entry) => boolean): { path: string; line: string; at: number }[]
	moveBack?(items: { path: string; line: string; at: number }[]): number
}

export class StaleCard extends Error {}
// Best score first; at equal score a live entry before an expired one, then the newest source first, so a draft quotes the newer fact (#20).
const newestSrc = (h: Hit) => h.src.map(s => s.date).sort().at(-1) ?? ''
const byRank = (a: Hit, b: Hit) => b.score - a.score || Number(a.expired) - Number(b.expired) || newestSrc(b).localeCompare(newestSrc(a))

// What each op wrote and what was there before, so undo can restore exactly that and nothing else.
export type Applied = { ids: string[]; lines: string[]; prev: (string | undefined)[] }

const STOP = new Set('a an and are as at be by for from has have how in is it its of on or that the this to was what when where which who why will with'.split(' '))
const words = (s: string) => s.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !STOP.has(w))

// Plain Markdown cards in the owner's folder (R-KNO-01). Parsed on each call: hundreds of cards take milliseconds, and nothing goes stale.
export class FilesKnowledge implements Knowledge {
	readonly root: string
	readonly machine: string
	constructor(root: string, machine: string) { this.root = root; this.machine = machine }

	private cards(): Card[] {
		const dir = join(this.root, 'topics')
		return scoped(`cards:${dir}`, () => {
			if (!existsSync(dir)) return []
			return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
				CARDS.map(c => join(dir, d.name, `${c}.md`)).filter(existsSync).map(p => parseCard(p, readText(p))))
		})
	}

	search(q: string, f: { types?: EntryType[]; audience?: Audience; limit?: number } = {}): Hit[] {
		const want = words(q)
		const hits: Hit[] = []
		for (const c of this.cards()) {
			const head = new Set(words(`${c.topic} ${c.title} ${c.aliases.join(' ')}`))
			for (const e of c.entries) {
				if (f.types && !f.types.includes(e.type)) continue
				if (f.audience === 'team' && e.audience !== 'team') continue
				const body = new Set(words(e.text)), tags = new Set(e.tags.flatMap(words))
				// Substring matching covers languages written without spaces (tester 05 P2-1).
				const flat = e.text.normalize('NFKC').toLowerCase()
				const score = want.reduce((s, w) => s + (tags.has(w) || head.has(w) ? 3 : 0) + (body.has(w) ? 2 : flat.includes(w) ? 1 : 0), 0)
				if (score) hits.push({ ...e, score, expired: expired(e) })
			}
		}
		return hits.sort(byRank).slice(0, f.limit ?? 12)
	}

	// "card:topic/card#id" resolves only on that card (tester 05 P1-7). Also "topic", "topic/card", or a bare unique id.
	read(ref: string): Entry | Card[] | undefined {
		const [path, id] = ref.replace(/^card:/, '').split('#')
		const [topic, card] = path.split('/')
		// A cited fact names its card's folder: that one file is read when it says it is that card, not every card (#27 step 2).
		if (id && card && /^[\w.-]+$/.test(topic) && /^[\w.-]+$/.test(card)) {
			const p = join(this.root, 'topics', topic, `${card}.md`)
			const c = existsSync(p) ? parseCard(p, readText(p)) : undefined
			if (c?.topic === topic && c.card === card) return c.entries.find(e => e.id === id)
		}
		const all = this.cards()
		if (id) return all.find(c => c.topic === topic && c.card === card)?.entries.find(e => e.id === id)
		const cards = all.filter(c => c.topic === topic && (!card || c.card === card))
		if (cards.length) return cards
		const hits = all.flatMap(c => c.entries).filter(e => e.id === ref)
		return hits.length === 1 ? hits[0] : undefined
	}

	topics(): TopicLine[] {
		const by = new Map<string, TopicLine>()
		for (const c of this.cards()) {
			const t = by.get(c.topic) ?? { topic: c.topic, title: c.title.split(' · ')[0], aliases: [], entries: 0 }
			t.aliases = [...new Set([...t.aliases, ...c.aliases])]
			t.entries += c.entries.length
			by.set(c.topic, t)
		}
		return [...by.values()].sort((a, b) => a.topic.localeCompare(b.topic))
	}

	bySource(link: string): Entry | undefined {
		return this.cards().flatMap(c => c.entries).find(e => e.src.some(s => s.link === link))
	}

	withdrawSource(link: string): number {
		let removed = 0
		for (const card of this.cards()) {
			let text = readFileSync(card.path, 'utf8'), changed = false
			for (const entry of card.entries) {
				const src = entry.src.filter(source => openLink(source.link) !== openLink(link))
				if (src.length === entry.src.length) continue
				text = editCard(text, src.length ? 'update' : 'retire', src.length ? formatLine({ ...entry, src }) : '', entry.id)
				changed = true
				removed++
			}
			if (changed) writeText(card.path, text, this.machine)
		}
		if (removed) this.writeIndex()
		return removed
	}

	// A chat marked off the record (#21 §2c): its facts leave the cards a run may read, kept line for line with where they stood, so
	// unmarking puts them back byte for byte. match picks the entries; the caller keeps what this returns.
	moveOut(match: (e: Entry) => boolean): { path: string; line: string; at: number }[] {
		const out: { path: string; line: string; at: number }[] = []
		for (const card of this.cards()) {
			const ids = new Set(card.entries.filter(match).map(e => e.id))
			if (!ids.size) continue
			const lines = readFileSync(card.path, 'utf8').split('\n'), keep: string[] = []
			lines.forEach((l, at) => { const id = /^- \[/.test(l) ? [...ids].find(i => new RegExp(`\\s\\^${i}(?:\\s|$)`).test(l)) : undefined; if (id) out.push({ path: relative(this.root, card.path), line: l, at }); else keep.push(l) })
			writeText(card.path, keep.join('\n'), this.machine)
		}
		if (out.length) this.writeIndex()
		return out
	}
	moveBack(items: { path: string; line: string; at: number }[]): number {
		let n = 0
		for (const path of [...new Set(items.map(i => i.path))]) {
			const file = join(this.root, path), lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
			for (const i of items.filter(x => x.path === path).sort((a, b) => a.at - b.at)) if (!lines.includes(i.line)) { lines.splice(Math.min(i.at, lines.length), 0, i.line); n++ }
			mkdirSync(dirname(file), { recursive: true })
			writeText(file, lines.join('\n'), this.machine)
		}
		if (n) this.writeIndex()
		return n
	}

	private path(topic: string, card: CardName) { return join(this.root, 'topics', topic, `${card}.md`) }

	cardHash(topic: string, card: CardName): string {
		const p = this.path(topic, card)
		return existsSync(p) ? hashOf(readFileSync(p, 'utf8')) : ''
	}

	// Writes only if every card is still the version the proposal was made against (R-BOOT-06, exact-revision ok).
	apply(p: Proposal): Applied {
		const touched = [...new Set(p.ops.map(o => o.card))]
		for (const card of touched) if (this.cardHash(p.topic, card) !== (p.base[card] ?? '')) throw new StaleCard(`${p.topic}/${card} changed since ${p.code} was proposed`)
		// Index i belongs to p.ops[i].
		const out: Applied = { ids: [], lines: [], prev: [] }
		const texts = new Map<CardName, string>()
		for (const card of touched) {
			const path = this.path(p.topic, card)
			// New cards default to team; private entries carry their own mark, so one card can hold both safely (tester 05 P0-2).
			let text = existsSync(path) ? readFileSync(path, 'utf8') : newCard(p.topic, p.title, card, 'team')
			const before = parseCard(path, text).entries
			for (const [i, o] of p.ops.entries()) {
				if (o.card !== card) continue
				const id = o.id ?? newId(text)
				const line = formatLine({ ...o.entry, id })
				try { text = editCard(text, o.op, line, o.id) } catch (e) { throw new StaleCard(String(e)) }
				const old = before.find(e => e.id === id)
				out.ids[i] = id
				out.lines[i] = o.op === 'retire' ? '' : line
				out.prev[i] = old && formatLine(old)
			}
			texts.set(card, text)
		}
		for (const [card, text] of texts) writeText(this.path(p.topic, card), text, this.machine)
		this.writeIndex()
		return out
	}

	// The current line of an entry, in canonical form, to check that nobody changed it since it was written.
	line(topic: string, card: CardName, id: string): string | undefined {
		const e = this.read(`card:${topic}/${card}#${id}`)
		return e && !Array.isArray(e) ? formatLine(e) : undefined
	}

	// index.md is generated, so it never drifts from the cards (R-KNO-02).
	private writeIndex() {
		const lines = this.topics().map(t => `- [[${t.topic}]] ${t.title}${t.aliases.length ? ` (also: ${t.aliases.join(', ')})` : ''} · ${t.entries} entr${t.entries === 1 ? 'y' : 'ies'}`)
		writeText(join(this.root, 'index.md'), ['# Knowledge index', '', 'One line per topic. Generated from the cards; edit the cards, not this file.', '', ...lines, ''].join('\n'), this.machine)
	}
}

function newId(text: string): string {
	for (;;) {
		const id = Math.random().toString(36).slice(2, 6)
		if (!text.includes(`^${id}`)) return id
	}
}

export function openKnowledge(root: string, machine: string, team?: string): Knowledge {
	return team ? new LayeredKnowledge(new FilesKnowledge(root, machine), new FilesKnowledge(team, machine)) : new FilesKnowledge(root, machine)
}

// Team cards in a shared folder, personal cards in the owner's own, one template (R-KNO-06).
// A topic lives in one place: where it already is, else the team folder unless any entry is private.
// Each owner sees both; a private entry never reaches the shared folder.
export class LayeredKnowledge implements Knowledge {
	readonly mine: FilesKnowledge
	readonly team: FilesKnowledge
	constructor(mine: FilesKnowledge, team: FilesKnowledge) { this.mine = mine; this.team = team }
	private at(topic: string): FilesKnowledge | undefined {
		return this.mine.topics().some(t => t.topic === topic) ? this.mine : this.team.topics().some(t => t.topic === topic) ? this.team : undefined
	}
	home(p: Pick<Proposal, 'topic' | 'ops'>): 'personal' | 'team' {
		const at = this.at(p.topic)
		if (at) return at === this.team && !p.ops.some(o => o.entry.audience === 'private') ? 'team' : 'personal'
		return p.ops.some(o => o.entry.audience === 'private') ? 'personal' : 'team'
	}
	private of(p: Pick<Proposal, 'topic' | 'ops'>) { return this.home(p) === 'team' ? this.team : this.mine }
	search(q: string, f?: Parameters<Knowledge['search']>[1]): Hit[] {
		return [...this.mine.search(q, f), ...this.team.search(q, f)].sort(byRank).slice(0, f?.limit ?? 12)
	}
	read(ref: string) { return this.mine.read(ref) ?? this.team.read(ref) }
	moveOut(match: (e: Entry) => boolean) { return this.mine.moveOut(match) }
	moveBack(items: { path: string; line: string; at: number }[]) { return this.mine.moveBack(items) }
	homeOf(ref: string) { const m = this.mine.read(ref), t = this.team.read(ref); return m && !Array.isArray(m) ? 'personal' as const : t && !Array.isArray(t) ? 'team' as const : undefined }
	topics() { const own = this.mine.topics(); return [...own, ...this.team.topics().filter(t => !own.some(o => o.topic === t.topic))] }
	bySource(link: string) { return this.mine.bySource(link) ?? this.team.bySource(link) }
	withdrawSource(link: string) { return this.mine.withdrawSource(link) + this.team.withdrawSource(link) }
	// Each step uses the proposal's destination, so a private fact under a team topic saves to the owner's own folder (review 085 P1-3).
	cardHash(topic: string, card: CardName, home?: 'personal' | 'team') { return (home === 'personal' ? this.mine : home === 'team' ? this.team : this.at(topic) ?? this.team).cardHash(topic, card) }
	apply(p: Proposal) { return (p.home === 'personal' ? this.mine : p.home === 'team' ? this.team : this.of(p)).apply(p) }
	line(topic: string, card: CardName, id: string) { return this.mine.line(topic, card, id) ?? this.team.line(topic, card, id) }
}
