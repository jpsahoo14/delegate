import type { Person } from './types.ts'
import { MARK } from './render.ts'

export type Attachment = { name: string; type: string; url?: string }
export type RawMsg = { id: string; at: string; from: Person | null; html: boolean; body: string; deleted?: boolean; attachments?: Attachment[] }
export type Ctx = { ownerId: string; ownerName: string; aliases?: string[]; test: boolean; group: boolean; sentIds: Set<string> }
export type Classified =
	| { kind: 'skip'; why: string }
	| { kind: 'owner'; text: string }
	| { kind: 'ask' | 'context'; from: Person; text: string }

const ENT: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

export function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
		// A pasted image keeps its link, so a worker can open it with image_read.
		.replace(/<img\b([^>]*)>/gi, (_, attrs: string) => { const alt = /\balt="([^"]*)"/i.exec(attrs)?.[1], src = /\bsrc="(https:\/\/graph\.microsoft\.com\/[^"]+\/hostedContents\/[^"]+)"/i.exec(attrs)?.[1]; return `[image${alt ? `: ${alt}` : ''}${src ? ` ${src}` : ''}]` })
		.replace(/<[^>]+>/g, '')
		.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => ENT[m] ?? m)
		.replace(/\n{3,}/g, '\n\n').trim()
}

const DISCLOSURE = /\(sent by [^)]*assistant\)\s*$/i
const AS = /^\[as ([^\]]{1,60})\]\s*/i

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
		const as = c.test ? text.match(AS) : null
		if (!as) return { kind: 'owner', text }
		const name = as[1].trim()
		from = { id: `test:${name.toLowerCase()}`, name }
		text = text.slice(as[0].length)
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
