import { NAME } from '../brand.ts'
import type { Snapshot } from './contracts.ts'

// WDD rows' words (joint-what-delegate-did.md: PM rounds 1-3, Designer D2/D5/D8), built from the projection's facts, never from text.
export type WddRow = NonNullable<Snapshot['wdd']>['rows'][number]
export type WddPart = WddRow['parts'][number]

export const WDD_TITLE = 'Done for you'
// The subline and the empty line (PM R3/D8, D5; PE v1.135 item 4; PM 14:05:55), from the ledger's start (SEND's reviewed ledgerStart):
// unknown: "What Delegate did for you" / "Nothing yet."; under N days: "· since <day>" / "Nothing yet. Delegate lists what it does for
// you from <day>."; after: "· last N days" / "Nothing done by Delegate in the last N days.". H4 uses the reader's capped retention N.
// Missing days in an older projection means the former 30-day window. The day is the owner-zone ownerDay.
type Wdd = NonNullable<Snapshot['wdd']>
const windowDays = (wdd: Wdd) => wdd.days ?? 30
const recent = (wdd: Wdd, now: string) => !!wdd.since && Date.parse(now) - Date.parse(wdd.since) < windowDays(wdd) * 86_400_000
export const wddSubline = (wdd: Wdd | undefined, now = new Date().toISOString()) => `What ${NAME} did for you${!wdd?.since || !wdd.sinceDay ? '' : recent(wdd, now) ? ` · since ${wdd.sinceDay}` : ` · last ${windowDays(wdd)} days`}`
export const wddEmpty = (wdd: Wdd, now = new Date().toISOString()) => !wdd.since || !wdd.sinceDay ? 'Nothing yet.'
	: recent(wdd, now) ? `Nothing yet. ${NAME} lists what it does for you from ${wdd.sinceDay}.` : `Nothing done by ${NAME} in the last ${windowDays(wdd)} days.`
export const WDD_OLD = 'This action is older than 30 days'
// The kind chips that combine with By Delegate (D1), over the ledger's own kinds; an ack is a reply.
export const WDD_KINDS: Record<string, { label: string; kinds: WddRow['kind'][] }> = {
	all: { label: 'All', kinds: ['reply', 'ack', 'review', 'change', 'reminder'] }, replies: { label: 'Replies', kinds: ['reply', 'ack', 'review'] },
	reviews: { label: 'Reviews', kinds: ['review'] }, changes: { label: 'Changes', kinds: ['change'] }, reminders: { label: 'Reminders', kinds: ['reminder'] },
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
export const comments = (row: WddRow) => row.parts.filter(part => part.kind === 'comment')
const replied = (row: WddRow) => row.parts.some(part => part.kind === 'message' && part.outcome === 'posted')

// PM FINAL B2 (14:51:19): a reply, ack or reminder whose one message part failed, or never completed (the stub stays unconfirmed). Its
// line 1 never says "Replied" or "Sent", its quote line labels the words as planned, and it has no message ↗ (Check ↗ when unconfirmed).
export function wddMissed(row: WddRow): 'failed' | 'unconfirmed' | undefined {
	if (row.kind === 'review' || row.kind === 'change') return undefined
	const message = row.parts.filter(part => part.kind === 'message')
	return message.length === 1 && message[0].outcome !== 'posted' ? message[0].outcome : undefined
}
// PM FINAL B2 / CR 15:24:37, 15:49:01: a part's `why` is shown only when it is positively recognised as a plain reason PM has written
// (O1's reasons, by their words or their class key, both case-insensitive); anything else, a diagnostic or unknown text, never reaches the row and the caller
// uses PM's no-reason words. No blacklist certifies text. PM's reason list (O1, PM round 3):
const PLAIN_REASON: Record<string, string> = { forbidden: "Teams didn't allow it", 'replied-to': 'someone already replied to it', edited: 'it was edited after it was sent' }
const PLAIN_WORDS = new Map(Object.values(PLAIN_REASON).map(words => [words.toLowerCase(), words]))
export function wddPlainWhy(why?: string): string | undefined {
	const text = why?.trim().replace(/[.\s]+$/, '').replace(/’/g, "'") ?? ''
	const folded = text.toLowerCase()
	return Object.hasOwn(PLAIN_REASON, folded) ? PLAIN_REASON[folded] : PLAIN_WORDS.get(folded)
}
// "Not sent: <reason>. It was going to say: " (the bundle parts' plain reason; "Not sent. …" without one) / "It may have gone out. …".
export function wddPlanned(row: WddRow): string | undefined {
	const missed = wddMissed(row), why = wddPlainWhy(row.parts.find(part => part.kind === 'message')?.why)
	return missed === 'failed' ? `Not sent${why ? `: ${why}` : ''}. It was going to say: ` : missed === 'unconfirmed' ? 'It may have gone out. It was going to say: ' : undefined
}

// Line 1, verb first (PM round 1; D2.1/D2.5): "Replied to Kim", "Posted 4 comments on PR 4200001 and replied to Kim" ("Posted 3 of 4…" when
// partial), "Sent your reminder to Robin".
export function wddWhat(row: WddRow): string {
	const to = row.to ? ` to ${row.to}` : '', missed = wddMissed(row)
	if (missed) return row.kind === 'reminder' ? `${missed === 'failed' ? "Couldn't send" : "Couldn't confirm"} your reminder${to}` : missed === 'failed' ? `Couldn't reply${to}` : `Couldn't confirm a reply${to}`
	if (row.kind === 'reminder') return `Sent your reminder${to}`
	if (row.kind === 'review') {
		const all = comments(row), posted = all.filter(part => part.outcome === 'posted').length, pr = all.find(part => part.pr)?.pr
		const posting = all.length ? `Posted ${posted < all.length ? `${posted} of ${all.length} comments` : plural(all.length, 'comment')}${pr ? ` on PR ${pr}` : ''}` : ''
		return posting && replied(row) ? `${posting} and replied${to}` : posting || `Replied${to}`
	}
	if (row.kind === 'change') return `Made a change${row.to ? ` for ${row.to}` : ''}`
	return `Replied${to}`
}
export const wddWhere = (row: WddRow) => (row.chat.group ? `in ${row.chat.name}` : '1:1')
// Line 2: the exact words that went out (the message parts), never a recap; on a row that didn't go out, the planned words under wddPlanned.
export const wddWords = (row: WddRow) => row.parts.filter(part => part.kind === 'message').map(part => part.text).filter(Boolean).join('\n\n') || undefined
// ↗ to the posted message itself, else the first part with a link.
export const wddLink = (row: WddRow) => wddMissed(row) ? undefined : row.parts.find(part => part.kind === 'message' && part.outcome === 'posted' && part.link)?.link ?? row.parts.find(part => part.link)?.link

// Line 3, why (D2.3, D8 E5/O3/O4): what Stop doing this did comes first; then the frozen line, the setting or the reminder; never a guess.
export type WddWhy = { text: string; to?: { line: string } | { reminder: string } }
export function wddWhy(row: WddRow): WddWhy {
	const b = row.because, s = row.stopped
	if (s?.mode === 'turned-off' && b.kind === 'line') return { text: `Turned off: "${b.text}"`, to: { line: b.lineId } }
	if (s?.text && s.lineId) return { text: `Stopped: "${s.text}"`, to: { line: s.lineId } }
	if (b.kind === 'line') return { text: `Because you wrote: "${b.text}"${b.state === 'edited' ? ' (edited since)' : b.state === 'deleted' ? ' (line deleted)' : ''}`, ...(b.state === 'deleted' ? {} : { to: { line: b.lineId } }) }
	// H3(b) (PM 17:18:54; PE v1.149): his Pause / End, while the reminder is still paused / ended, with the record's frozen label.
	if (b.kind === 'setting' && b.reminder && row.reminderStopped) return { text: `Reminder ${row.reminderStopped.state}: "${b.label}"`, to: { reminder: b.reminder } }
	if (b.kind === 'setting') return b.reminder ? { text: `Because you set up this reminder: "${b.label}"`, to: { reminder: b.reminder } } : { text: `Because you turned on: ${b.label}` }
	return { text: `${NAME} didn't record why this was allowed.` }
}

// O1 (PM round 3): the adapter's reason class in plain words. PE v1.149 (PM flag): the pointer to Not right? › Wrong only when the row
// offers Wrong (a superseded send doesn't).
export const wddUndoFailed = (why?: string, wrong = true) => `Couldn't take it back${why && Object.hasOwn(PLAIN_REASON, why) ? `: ${PLAIN_REASON[why]}` : ''}.${wrong ? ' Use Not right? › Wrong to send a correction.' : ''}`

// A bundle part's outcome (D2.5): posted / failed: <reason> / couldn't confirm.
export const wddOutcome = (part: WddPart) => part.outcome === 'posted' ? 'posted' : part.outcome === 'failed' ? `failed${(why => (why ? `: ${why}` : ''))(wddPlainWhy(part.why))}` : "couldn't confirm"

// The local day a row belongs to (grouping and #done/by-delegate/<day> landing).
export const wddDay = (at: string) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const wddDayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
