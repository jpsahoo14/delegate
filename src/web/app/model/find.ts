// Find on Now (N1b): a person, a chat, a PR, incident, or work-item number, or words in an ask, goal, or gist, across Now and
// Done. Pure filtering over what the page already has: Now's rows, and Done's last 7 days, which is all Done shows. Pure.
import type { DoneRow, NextRow, View } from './types.ts'

export type Found = { now: NextRow[]; done: DoneRow[]; link?: { href: string; item?: string } }

// A Teams message link: its chat and message. Chats and channel threads both link this way (adapters/channels.ts).
export function teamsMessage(q: string): { chat: string; msg: string } | undefined {
	const m = /^https:\/\/teams\.microsoft\.com\/l\/message\/([^/?#]+)\/(\d+)/i.exec(q.trim())
	if (!m) return undefined
	try { return { chat: decodeURIComponent(m[1]), msg: m[2] } } catch { return undefined }
}

// The words to find. Any other link is looked up by its number (a PR, an incident, a work item).
function termsOf(q: string): string[] {
	const t = q.trim().toLowerCase()
	if (/^https?:\/\//.test(t)) { const n = t.match(/\d{3,}/g)?.at(-1); return n ? [n] : [] }
	return t.split(/\s+/).map(w => w.replace(/^[#"'(]+|[?"'),.:;!]+$/g, '')).filter(Boolean)
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A number or a code (A13, W2) matches whole, so 220 never finds 2204; a word matches the start of a word.
const matcher = (t: string) => /^\d+$|^[a-z]\d+$/.test(t) ? new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(t)}($|[^\\p{L}\\p{N}])`, 'u') : new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(t)}`, 'u')
const hay = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' \n ').toLowerCase()
const nowText = (r: NextRow) => hay([r.act, r.code, r.who?.name, r.facts.who, r.facts.where, r.headline, r.facts.quote?.by, r.facts.quote?.text, ...(r.facts.notes ?? []).map(n => n.text), r.gist, r.draft])
const doneText = (r: DoneRow) => hay([r.code, r.who.name, r.sentence, r.ask, r.said, r.gist, r.by, r.text])
// Any of the item's messages, not only its last (review P2-6): msgs holds "chat|msg" for each.
const sameMsg = (r: { teams?: string; msgs?: string[] }, m: { chat: string; msg: string }) => { if (r.msgs?.includes(`${m.chat}|${m.msg}`)) return true; const x = r.teams ? teamsMessage(r.teams) : undefined; return !!x && x.msg === m.msg && x.chat === m.chat }

export function find(v: Pick<View, 'next' | 'done'>, q: string): Found {
	const n = v.next, rows = n ? [...n.move, ...n.working, ...n.waiting, ...n.catchup.rows] : []
	const msg = teamsMessage(q)
	if (msg) {
		const now = rows.filter(r => sameMsg(r, msg)), done = (v.done ?? []).filter(r => sameMsg(r, msg) && !now.some(x => x.act === r.code || x.code === r.code))
		const item = now[0]?.act ?? done[0]?.code
		return { now, done, link: { href: q.trim(), ...(item ? { item } : {}) } }
	}
	const ms = termsOf(q).map(matcher)
	if (!ms.length) return { now: [], done: [] }
	const hit = (text: string) => ms.every(m => m.test(text))
	const now = rows.filter(r => hit(nowText(r)))
	// A thread on Now is shown once, there; Done adds what is closed.
	const done = (v.done ?? []).filter(r => hit(doneText(r)) && !now.some(x => x.act === r.code || x.code === r.code))
	return { now, done }
}
