import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Audience, Card, CardName, Entry, EntryType, Hit, Proposal, TopicLine } from '../core/types.ts'
import { writeText } from '../store/fs.ts'
import { CARDS, editCard, expired, formatLine, hashOf, newCard, parseCard } from './format.ts'

// The one boundary every part of Delegate uses for knowledge. Another store (Basic Memory, a team wiki) implements the same calls.
export interface Knowledge {
	search(q: string, f?: { types?: EntryType[]; audience?: Audience; limit?: number }): Hit[]
	read(ref: string): Entry | Card[] | undefined
	topics(): TopicLine[]
	bySource(link: string): Entry | undefined
	cardHash(topic: string, card: CardName, home?: 'personal' | 'team'): string
	apply(p: Proposal): Applied
	line(topic: string, card: CardName, id: string): string | undefined
	// Where a proposal saves: the owner's own folder, or the team's shared folder (R-KNO-06).
	home?(p: Pick<Proposal, 'topic' | 'ops'>): 'personal' | 'team'
}

export class StaleCard extends Error {}

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
		if (!existsSync(dir)) return []
		return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
			CARDS.map(c => join(dir, d.name, `${c}.md`)).filter(existsSync).map(p => parseCard(p, readFileSync(p, 'utf8'))))
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
		return hits.sort((a, b) => b.score - a.score || Number(a.expired) - Number(b.expired)).slice(0, f.limit ?? 12)
	}

	// "card:topic/card#id" resolves only on that card (tester 05 P1-7). Also "topic", "topic/card", or a bare unique id.
	read(ref: string): Entry | Card[] | undefined {
		const all = this.cards()
		const [path, id] = ref.replace(/^card:/, '').split('#')
		const [topic, card] = path.split('/')
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
		return [...this.mine.search(q, f), ...this.team.search(q, f)].sort((a, b) => b.score - a.score).slice(0, f?.limit ?? 12)
	}
	read(ref: string) { return this.mine.read(ref) ?? this.team.read(ref) }
	topics() { const own = this.mine.topics(); return [...own, ...this.team.topics().filter(t => !own.some(o => o.topic === t.topic))] }
	bySource(link: string) { return this.mine.bySource(link) ?? this.team.bySource(link) }
	// Each step uses the proposal's destination, so a private fact under a team topic saves to the owner's own folder (review 085 P1-3).
	cardHash(topic: string, card: CardName, home?: 'personal' | 'team') { return (home === 'personal' ? this.mine : home === 'team' ? this.team : this.at(topic) ?? this.team).cardHash(topic, card) }
	apply(p: Proposal) { return (p.home === 'personal' ? this.mine : p.home === 'team' ? this.team : this.of(p)).apply(p) }
	line(topic: string, card: CardName, id: string) { return this.mine.line(topic, card, id) ?? this.team.line(topic, card, id) }
}
