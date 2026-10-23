// Words and times as the page says them. Pure: the same input gives the same text.
import type { Who } from './types.ts'
import { time } from '../react/domain/time.ts'
export { time, when } from '../react/domain/time.ts'

export const first = (n: string | undefined) => String(n || 'Someone').split(' ')[0]
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
export const hueOf = (name: string) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return [210, 160, 25, 280, 340, 45][h % 6] }
export const whoOf = (name: string): Who => ({ name, initials: name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(), hue: hueOf(name) })
export const clock = (s: string) => { const [h, m] = s.split(':').map(Number); return time(new Date(2000, 0, 1, h, m)) }
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// A done-by choice as a date: today, this Friday (next week's when today is Friday), or a week from today.
export function byDate(k: string): string {
	const d = new Date()
	if (k === 'fri') d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
	else if (k === 'week') d.setDate(d.getDate() + 7)
	else if (k !== 'today') return ''
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// What a queued command is doing, in words, so the card never shows the raw command or the wrong action.
export function doing(verb = '', name: string): string {
	const v = verb.trim()
	if (/^skip\b/i.test(v)) return 'Dismissing.'
	if (/^unwatch\b/i.test(v)) return 'Stopping the check-back.'
	if (/^later\b/i.test(v)) return 'Moving it to later.'
	if (/^edit\b/i.test(v)) return 'Saving your edit.'
	if (/^(ok|send)\b/i.test(v)) return 'Sending.'
	if (/^pick\b/i.test(v)) return 'Preparing the reply for that option.'
	if (/^ask\b/i.test(v)) return `Asking ${name}.`
	if (/^[A-Z]\d+\s*:/i.test(v)) return 'Updating the draft with your answer.'
	return `Working on "${v.length > 60 ? v.slice(0, 58) + '…' : v}".`
}
// The words on an answer's source chip: what the source is, not the start of its address (bug 10-21: "https:").
export function sourceChip(s: { ref: string; label?: string }): string {
	if (s.label) return s.label
	if (s.ref.startsWith('card:')) return s.ref.slice(5).split(/[/#]/)[0].replace(/-/g, ' ')
	if (!/^https?:\/\//.test(s.ref)) return s.ref.slice(0, 60)
	let u: URL
	try { u = new URL(s.ref) } catch { return s.ref.slice(0, 60) }
	const pr = u.pathname.match(/\/pullrequest\/(\d+)/)
	if (pr) return `PR ${pr[1]}`
	if (u.hostname === 'teams.microsoft.com') return 'Teams message'
	return u.hostname.replace(/^www\./, '')
}
// An ok the runner did not act on: a check to read first ("Before you ok …"), or a change not made (bug 10-21 A12).
export const refusalOf = (msg: string) => (/^Before you ok\b/.test(msg) ? { label: 'Check this first.', cls: 'check' } : { label: 'Not done.', cls: 'refused' })
// The runner's words are shared with the chat, where commands are typed. On the page the buttons act, so a sentence that tells
// the owner to type a command (a quoted command naming an item, such as "ok A1") is left out (owner 10-21).
const typed = (sentence: string) => /"(?:ok|edit|send|skip|answer|pick|undo|more|close|wait|later|dismiss|continue|ask|wrong|incomplete|unneeded|every|extend|never|nudge|pause|resume|watch)\s+[AKWRH]\d+\b[^"]*"/i.test(sentence) ||
	/\b(?:say|type|reply(?:\s+with)?)\s*"[AKWRH]\d+\s*:/i.test(sentence)
export const forPage = (text = '') => text.replace(/^Before you ok [A-Z]\d{1,3}:/, 'Before it goes ahead:').split(/(?<=[.?!])\s+(?=[A-Z])/).filter(s => !typed(s)).join(' ').trim()
