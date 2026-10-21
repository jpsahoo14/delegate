import { createHash } from 'node:crypto'
import type { Audience, Card, CardName, Entry, EntryType, Src } from '../core/types.ts'

export const TYPES: EntryType[] = ['fact', 'decision', 'faq', 'owner', 'status', 'open']
export const CARDS: CardName[] = ['architecture', 'decisions', 'faq', 'status']

// Which card a type lives on (R-KNO-01): split by how often it changes.
export const CARD_OF: Record<EntryType, CardName> = { fact: 'architecture', owner: 'architecture', decision: 'decisions', faq: 'faq', status: 'status', open: 'status' }

// How long an entry stays trusted without a newer source (dev-spec/slices/05-knowledge.md). Undefined means until replaced.
const TTL_DAYS: Partial<Record<EntryType, number>> = { faq: 90, owner: 90, status: 14, open: 14 }

export function reviewDate(e: Pick<Entry, 'type' | 'src' | 'review'>): string | undefined {
	if (e.review) return e.review
	const days = TTL_DAYS[e.type]
	const last = e.src.map(s => s.date).filter(d => DATE.test(d)).sort().at(-1)
	if (!days || !last) return undefined
	return new Date(Date.parse(last) + days * 86_400_000).toISOString().slice(0, 10)
}

export const expired = (e: Pick<Entry, 'type' | 'src' | 'review'>, now = new Date()) => {
	const r = reviewDate(e)
	return !!r && r < now.toISOString().slice(0, 10)
}

export const hashOf = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 12)

const LINE = /^- \[(\w+)\]\s+(.*)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const GROUP = /\s*\((src|review|audience):\s*([^()]*)\)\s*$/
const TAG = /\s#([\p{L}\p{N}_-]+)\s*$/u
const ID = /\s\^([a-z0-9]{2,12})\s*$/i

// One line, no structure: text from a source can never become a second entry or metadata (tester 05 P1-4).
export const clean = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
const day = (s: string) => (DATE.test(s?.trim() ?? '') ? s.trim() : '')

// "- [decision] Ship to ring 1 first. ^b7k2 #rollout (audience: private) (src: https://…, 2026-10-12, Vikram) (review: 2026-10-29)".
// Read from the end: metadata groups, then tags, then the id; everything before is text, whatever it contains.
export function parseLine(line: string, card: Pick<Card, 'topic' | 'card' | 'audience'>): Entry | undefined {
	const m = line.match(LINE)
	if (!m || !TYPES.includes(m[1] as EntryType)) return undefined
	let rest = ` ${m[2]}`
	const src: Src[] = []
	let review: string | undefined, audience = card.audience
	for (let g = rest.match(GROUP); g; g = rest.match(GROUP)) {
		const [kind, body] = [g[1], g[2].trim()]
		if (kind === 'review') review = day(body) || undefined
		else if (kind === 'audience') audience = body === 'team' ? 'team' : 'private'
		else { const [link, date, ...who] = body.split(/,\s*/); src.unshift({ link: link.trim(), date: day(date ?? ''), who: who.join(', ').trim() || undefined }) }
		rest = rest.slice(0, g.index)
	}
	const tags: string[] = []
	for (let t = rest.match(TAG); t; t = rest.match(TAG)) { tags.unshift(t[1]); rest = rest.slice(0, t.index) }
	const idm = rest.match(ID)
	if (idm) rest = rest.slice(0, idm.index)
	return { id: idm?.[1] ?? '', type: m[1] as EntryType, text: rest.trim(), tags, src, review, ...card, audience }
}

export function formatLine(e: Omit<Entry, 'topic' | 'card' | 'audience'> & { audience?: Audience }): string {
	const tags = e.tags.map(t => clean(t).replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).map(t => ` #${t}`).join('')
	const meta = (v: string) => clean(v).replace(/[()]/g, '')
	const src = e.src.map(s => ` (src: ${[meta(s.link).replace(/,/g, '%2C'), day(s.date), s.who && meta(s.who).replace(/,/g, ' ')].filter(Boolean).join(', ')})`).join('')
	return `- [${e.type}] ${clean(e.text)}${e.id ? ` ^${e.id}` : ''}${tags}${e.audience === 'private' ? ' (audience: private)' : ''}${src}${e.review && day(e.review) ? ` (review: ${day(e.review)})` : ''}`
}

// Frontmatter keys we read; everything else in the file is kept as the owner wrote it.
export function parseCard(path: string, text: string): Card {
	const fm = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ''
	const get = (k: string) => fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].trim() ?? ''
	const list = (v: string) => v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean)
	const head = { topic: get('topic'), card: get('card') as CardName, audience: (get('audience') || 'private') as Audience }
	const entries = text.split('\n').map(l => parseLine(l, head)).filter((e): e is Entry => !!e)
	return { path, ...head, title: get('title'), aliases: list(get('aliases')), entries, hash: hashOf(text) }
}

export function newCard(topic: string, title: string, card: CardName, audience: Audience, aliases: string[] = []): string {
	title = clean(title).replace(/^---/, '')
	return ['---', `title: ${title} · ${card}`, 'type: card', `topic: ${topic}`, `card: ${card}`, `audience: ${audience}`, `aliases: [${aliases.join(', ')}]`, '---', '## Observations', ''].join('\n')
}

// Applies one change to a card's text in place: other lines, including the owner's own notes, stay untouched.
export function editCard(text: string, op: 'add' | 'update' | 'retire', line: string, id?: string): string {
	const lines = text.split('\n')
	const at = id ? lines.findIndex(l => LINE.test(l) && new RegExp(`\\s\\^${id}(\\s|$)`).test(l)) : -1
	// An update or removal whose entry is gone is a changed card, never an add (tester 05 P1-9).
	if ((op === 'retire' || op === 'update') && at < 0) throw new Error(`entry ${id} is not on this card`)
	if (op === 'retire') return [...lines.slice(0, at), ...lines.slice(at + 1)].join('\n')
	if (op === 'update') { lines[at] = line; return lines.join('\n') }
	const obs = lines.findIndex(l => /^## Observations\s*$/.test(l))
	if (obs < 0) return `${text.replace(/\n*$/, '')}\n\n## Observations\n${line}\n`
	let end = obs + 1
	while (end < lines.length && (LINE.test(lines[end]) || lines[end].trim() === '')) end++
	let last = end
	while (last > obs + 1 && lines[last - 1].trim() === '') last--
	return [...lines.slice(0, last), line, ...lines.slice(last)].join('\n')
}

// Unicode-aware, and names that differ only after 48 characters, or only in symbols, stay apart (tester 05 P2-1).
export function slug(s: string): string {
	const base = clean(s).normalize('NFKC').toLowerCase().replace(/c\+\+/g, 'cpp').replace(/c#/g, 'csharp').replace(/\.net/g, 'dotnet').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
	if (!base) return `topic-${hashOf(s).slice(0, 6)}`
	return base.length > 48 ? `${base.slice(0, 41)}-${hashOf(base).slice(0, 6)}` : base
}
