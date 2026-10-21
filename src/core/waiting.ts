import type { RawMsg } from './intake.ts'
import { htmlToText } from './intake.ts'

// The owner's own asks to others that nobody has answered yet (design: "Waiting on others"). Found without AI.
export type Waiting = {
	code: string; chat: { id: string; name: string }; msgId: string; at: string; to: string[]; text: string
	state: 'waiting' | 'answered' | 'dismissed'; doneAt?: string; item?: string
}

const REQUEST = /\?|\b(please|pls|can you|could you|can we|could we|let me know|kindly|review|approve|check|share|update me|any update|when can)\b/i

// The people an owner message @mentions, when it asks them for something. Plain-text mentions are too ambiguous to count.
export function askedOf(m: RawMsg, ownerName: string): string[] | undefined {
	if (!m.html) return undefined
	const owner = ownerName.toLowerCase()
	const to = [...new Set([...m.body.matchAll(/<at[^>]*>([^<]+)<\/at>/gi)].map(x => x[1].trim()).filter(n => n && !owner.startsWith(n.toLowerCase()) && !n.toLowerCase().startsWith(owner.split(' ')[0]) && !/^(everyone|here|channel)$/i.test(n)))]
	return to.length && REQUEST.test(htmlToText(m.body)) ? to : undefined
}

// A reply from any person the ask named answers it. Teams mentions can be a first name or the full name.
export function answers(w: Waiting, from: string): boolean {
	const f = from.toLowerCase()
	return w.to.some(t => { const n = t.toLowerCase(); return f === n || f.startsWith(`${n} `) || n.startsWith(`${f} `) || f.split(' ')[0] === n })
}
