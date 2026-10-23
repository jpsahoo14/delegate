import type { Person } from './types.ts'
import { MARK } from './render.ts'

export type Attachment = { name: string; type: string; url?: string }
export type RawMsg = { id: string; at: string; from: Person | null; html: boolean; body: string; deleted?: boolean; attachments?: Attachment[]; replyToId?: string }
export const replyTarget = (raw: RawMsg): string | undefined => raw.replyToId || (raw.html ?
	/<blockquote[^>]*itemtype="http:\/\/schema\.skype\.com\/Reply"[^>]*itemid="([^"]+)"/i.exec(raw.body)?.[1] ??
	/<blockquote[^>]*itemid="([^"]+)"[^>]*itemtype="http:\/\/schema\.skype\.com\/Reply"/i.exec(raw.body)?.[1] : undefined)
export type Ctx = { ownerId: string; ownerName: string; aliases?: string[]; test: boolean; group: boolean; sentIds: Set<string> }
export type Classified =
	| { kind: 'skip'; why: string }
	| { kind: 'owner'; text: string }
	| { kind: 'ask' | 'context'; from: Person; text: string }

const ENT: Record<string, string> = {
	'&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
	'&mdash;': '\u2014', '&ndash;': '\u2013', '&hellip;': '\u2026',
	'&lsquo;': '\u2018', '&rsquo;': '\u2019', '&ldquo;': '\u201c', '&rdquo;': '\u201d',
	'&copy;': '\u00a9', '&reg;': '\u00ae', '&trade;': '\u2122', '&bull;': '\u2022', '&middot;': '\u00b7',
}

// An image pasted inline as a data URI: kept in the store under a short key, so a worker can open it as inline:<key> (bug 10-23 E17).
const DATA_IMG = /\bsrc="data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)"/i
const keyOf = (data: string) => { let h = 0xcbf29ce484222325n; for (let i = 0; i < data.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(data.charCodeAt(i))) * 0x100000001b3n); return `${h.toString(16).padStart(16, '0')}${data.length.toString(16)}` }
export function inlineImages(html: string): { key: string; type: string; data: string }[] {
	return [...html.matchAll(/<img\b([^>]*)>/gi)].flatMap(([, attrs]) => { const m = DATA_IMG.exec(attrs); if (!m) return []; const data = m[2].replace(/\s+/g, ''); return [{ key: keyOf(data), type: m[1].toLowerCase(), data }] })
}

export function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
		// A pasted image keeps its link, so a worker can open it with image_read; one with no link it can open says so.
		.replace(/<img\b([^>]*)>/gi, (_, attrs: string) => {
			const alt = /\balt="([^"]*)"/i.exec(attrs)?.[1], src = /\bsrc="(https:\/\/graph\.microsoft\.com\/[^"]+\/hostedContents\/[^"]+)"/i.exec(attrs)?.[1], data = DATA_IMG.exec(attrs)
			const link = src ?? (data ? `inline:${keyOf(data[2].replace(/\s+/g, ''))}` : undefined)
			return `[image${alt ? `: ${alt}` : ''}${link ? ` ${link}` : ' (it cannot be opened here)'}]`
		})
		.replace(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, '')
		.replace(/&(?:#(?:[xX][\da-fA-F]+|\d+)|[A-Za-z]+);/g, entity => {
			if (entity[1] !== '#') return ENT[entity] ?? entity
			const hex = entity[2].toLowerCase() === 'x'
			const point = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10)
			return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity
		})
		.replace(/\n{3,}/g, '\n\n').trim()
}

const DISCLOSURE = /\(sent by [^)]*assistant\)\s*$/i
const AS = /^\[as ([^\]]{1,60})\]\s*/i
// In a test chat the owner speaks as someone else with "[as Name] …": that line is that person's, wherever it is read (bug 10-23 E11).
export function asSpeaker(text: string, test: boolean): { from: Person; text: string } | undefined {
	const as = test ? text.match(AS) : null
	if (!as) return undefined
	const name = as[1].trim()
	return { from: { id: `test:${name.toLowerCase()}`, name }, text: text.slice(as[0].length) }
}
// Someone the owner played in a test chat ("[as Name] …"): never a real person to send to.
export const isPersona = (id: string) => id.startsWith('test:')

export function classify(m: RawMsg, c: Ctx): Classified {
	if (c.sentIds.has(m.id)) return { kind: 'skip', why: 'sent by us' }
	if (!m.from) return { kind: 'skip', why: 'system message' }
	// Attachments, images, and cards reach the worker as data lines it can open or name as a gap (R-ING-11).
	const att = (m.attachments ?? []).map(a => `[attachment: ${a.name || 'unnamed'} (${a.type})${a.url ? ` ${a.url}` : ''}]`)
	let text = [m.html ? htmlToText(m.body.replace(/<attachment[^>]*><\/attachment>/gi, '')) : m.body.trim(), ...att].filter(Boolean).join('\n')
	if (!text) return { kind: 'skip', why: 'empty' }
	if (text.startsWith(MARK) || DISCLOSURE.test(text)) return { kind: 'skip', why: 'assistant marker' }
	let from = m.from
	if (from.id === c.ownerId) {
		const as = asSpeaker(text, !!c.test)
		if (!as) return { kind: 'owner', text }
		from = as.from
		text = as.text
	}
	if (!c.group) return { kind: 'ask', from, text }
	return { kind: mentionsOwner(m, text, [c.ownerName.split(/\s+/)[0], ...(c.aliases ?? [])]) ? 'ask' : 'context', from, text }
}

function mentionsOwner(m: RawMsg, text: string, names: string[]): boolean {
	return names.filter(Boolean).some(n => (m.html && new RegExp(`<at[^>]*>[^<]*\\b${escape(n)}\\b`, 'i').test(m.body)) || new RegExp(`\\b${escape(n)}\\b`, 'i').test(text))
}

// Who spoke last in a group chat, and the owner's latest turn there: when, whom it answered, and what it said.
export type Turn = { last?: { id: string; at: string }; owner?: { at: string; to: string[]; text: string } }
// Answers to the owner's question often come days later (dogfood 10-20: Tian answered after 2.5 days); a week matches Waiting on others.
const TURN_HOURS = 7 * 24

// A message without the owner's name still answers the owner when the owner spoke last, recently, and to this sender:
// the owner replied to them or named them, and nobody else has joined in since (dogfood: "is this the right area path?").
export function continuesOwner(t: Turn | undefined, from: Person, at: string): boolean {
	const o = t?.owner
	if (!o || Date.parse(at) - Date.parse(o.at) > TURN_HOURS * 3_600_000) return false
	const first = from.name.split(/[\s,(]+/)[0]
	return o.to.includes(from.id) || (first.length > 1 && new RegExp(`\\b${escape(first)}\\b`, 'i').test(o.text))
}

// The next turn after a message: the owner's turn names whom it answered; anyone outside it ends the owner's turn.
export function nextTurn(t: Turn | undefined, by: { owner: true; at: string; text: string; to?: string[] } | { owner: false; from: Person; at: string }): Turn {
	if (by.owner) return { last: t?.last, owner: { at: by.at, to: by.to ?? (t?.last ? [t.last.id] : []), text: by.text.slice(0, 600) } }
	return { last: { id: by.from.id, at: by.at }, owner: continuesOwner(t, by.from, by.at) ? t!.owner : undefined }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
