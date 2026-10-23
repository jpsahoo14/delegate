import type { Store } from './state.ts'
import { NAME } from '../brand.ts'

// Everything that went wrong, and every time the owner corrected Delegate, goes to <storage>/feedback/<machine>.jsonl
// in OneDrive (one file per machine, so syncing never merges two writers). It is kept forever and is the input for fixes.

export type Lesson = { kind: 'error' | 'correction' | 'report'; what: string; code?: string; detail?: Record<string, unknown> }
type Entry = Record<string, unknown>

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))

// Which logged events are mistakes, and how to say each one. A new kind of failure is one line here.
const RULES: Record<string, (e: Entry) => Lesson | undefined> = {
	worker: e => (!e.intent ? { kind: 'error', code: s(e.code), what: `The worker finished without a report${e.error ? `: ${s(e.error).slice(0, 200)}` : ''}.` }
		: e.salvaged ? { kind: 'error', code: s(e.code), what: 'The worker put its report in task_complete instead of submit_report. It was recovered.' } : undefined),
	'job-failed': e => ({ kind: 'error', what: `The job for ${s(e.key)} failed: ${s(e.error)}` }),
	'job-wrap-up': e => ({ kind: 'error', what: `The job for ${s(e.key)} ran out of time and was asked to report what it had.` }),
	'undo-failed': e => ({ kind: 'error', code: s(e.code), what: `Undo failed: ${s(e.error)}` }),
	'daily-failed': e => ({ kind: 'error', what: `The daily summary failed: ${s(e.error)}` }),
	'automation-ended': e => (e.why === 'a channel thread is not a person' ? { kind: 'error', code: s(e.code), what: `Reminder ${s(e.code)} pointed at a channel thread and was ended.` } : undefined),
	health: e => (e.text ? { kind: 'error', what: s(e.text), detail: { id: e.id } } : undefined),
	sent: e => (e.draft && e.draft !== e.text ? { kind: 'correction', code: s(e.code), what: 'You changed the draft before sending.', detail: { chat: e.chat, intent: e.intent, asker: e.asker, draft: e.draft, sent: e.text, msgId: e.msgId, askAt: e.askAt, askMsgId: e.askMsgId, confidence: e.confidence } } : undefined),
	notfyi: e => ({ kind: 'correction', code: s(e.code), what: 'You said a message closed as FYI needed you.', detail: { chat: e.chat, intent: e.intent, asker: e.asker, ask: e.ask, fyi: e.text } }),
	replied: e => (e.draft && e.draft !== e.text ? { kind: 'correction', code: s(e.code), what: 'You replied in Teams yourself, in your own words.', detail: { chat: e.chat, intent: e.intent, asker: e.asker, draft: e.draft, sent: e.text } } : undefined),
	skipped: e => (e.draft ? { kind: 'correction', code: s(e.code), what: 'You skipped the drafted reply.', detail: { chat: e.chat, intent: e.intent, asker: e.asker, ask: e.ask, draft: e.draft } } : undefined),
	undo: e => ({ kind: 'correction', code: s(e.code), what: 'You took back an automatic reply.', detail: { rule: e.rule } }),
	marked: e => ({ kind: 'correction', code: s(e.code), what: `You marked the sent reply ${s(e.kind)}${e.note ? `: ${s(e.note)}` : '.'}`, detail: { chat: e.chat, intent: e.intent, asker: e.asker, ask: e.ask, sent: e.sent, sentId: e.sentId, note: e.note, kind: e.kind, rule: e.rule } }),
	missed: e => ({ kind: 'report', what: `You pointed out a missed message: ${s(e.why)}.`, detail: { chat: e.chat, msgId: e.msgId, kind: e.kind, from: e.from, text: e.text, note: e.note } }),
	feedback: e => ({ kind: 'report', code: e.code ? s(e.code) : undefined, what: s(e.text), detail: e.item as Record<string, unknown> | undefined }),
}

export const lessonOf = (e: Entry): Lesson | undefined => RULES[s(e.event)]?.(e)

// The log as the owner and the next engineer read it: counts first, then the newest entries.
export function summary(ls: { at: string; kind: string; what: string; code?: string; machine: string }[], days = 7, now = Date.now()): string {
	const recent = ls.filter(l => Date.parse(l.at) > now - days * 86_400_000)
	if (!recent.length) return `Nothing went wrong in the last ${days} days, and you corrected nothing.`
	const n = (k: string) => recent.filter(l => l.kind === k).length
	const head = `Last ${days} days: ${n('error')} errors, ${n('correction')} corrections by you, ${n('report')} problems you reported.`
	const lines = recent.slice(-20).reverse().map(l => `- ${l.at.slice(0, 16).replace('T', ' ')} ${l.kind}${l.code ? ` ${l.code}` : ''}: ${l.what.slice(0, 200)}`)
	return [head, '', ...lines, '', 'Full log: the feedback folder in your storage folder.'].join('\n')
}

type Logged = Lesson & { at: string; event: string }
const words = (v: unknown) => s(v).split(/\s+/).filter(Boolean).length
const GREET = /^\s*(hi|hello|hey|thanks|thank you)\b/i
const q = (v: unknown) => `"${s(v).replace(/\s+/g, ' ').slice(0, 220)}"`

// The owner's recent corrections that matter for this item: the same person first, then the same kind of ask,
// else their recent edits, which carry their voice (B22). Only the same person's are quoted. The item's own corrections are already in its prompt.
export function corrections(ls: Logged[], item: { code?: string; intent?: string; asker?: { id: string } }, now = Date.now(), max = 4): string[] {
	const d = (l: Logged) => (l.detail ?? {}) as { intent?: string; asker?: { id?: string; name?: string }; draft?: string; sent?: string; ask?: string; note?: string; kind?: string }
	const score = (l: Logged) => (item.asker?.id && d(l).asker?.id === item.asker.id ? 2 : 0) + (item.intent && d(l).intent === item.intent ? 1 : 0)
	return ls
		.filter(l => l.kind === 'correction' && l.code !== item.code && Date.parse(l.at) > now - 30 * 86_400_000 && (score(l) > 0 || l.event === 'sent' || l.event === 'replied' || l.event === 'notfyi'))
		.sort((a, b) => score(b) - score(a) || b.at.localeCompare(a.at))
		.slice(0, max)
		.flatMap(l => {
			const x = d(l), who = x.asker?.name ? `For ${x.asker.name}` : 'Elsewhere'
			// Another person's words never reach this prompt; only the shape of the owner's edit does (review 10-19 #9).
			if (!item.asker?.id || x.asker?.id !== item.asker.id) {
				if (l.event === 'sent' || l.event === 'replied') return [`For someone else: the owner ${words(x.sent) < words(x.draft) ? 'cut' : 'changed'} a ${words(x.draft)}-word draft to ${words(x.sent)} words${GREET.test(s(x.draft)) && !GREET.test(s(x.sent)) ? ' and dropped the greeting' : ''}.`]
				if (l.event === 'marked') return [`For someone else: the owner marked a sent reply ${s(x.kind)}.`]
				if (l.event === 'notfyi') return [`For someone else: a message you closed as FYI${x.intent && x.intent !== 'none' ? ` (${s(x.intent).replace(/_/g, ' ')})` : ''} needed the owner.`]
				return []
			}
			if (l.event === 'sent' || l.event === 'replied') return [`${who}: you drafted ${q(x.draft)} and the owner sent ${q(x.sent)}.`]
			if (l.event === 'skipped') return [`${who}: you drafted ${q(x.draft)} for ${q(x.ask)}, and the owner chose not to reply.`]
			if (l.event === 'notfyi') return [`${who}: you closed ${q(x.ask)} as FYI, but the owner said it needed them.`]
			if (l.event === 'marked') return [`${who}: you sent ${q(x.sent)} and the owner marked it ${s(x.kind)}${x.note ? `: ${q(x.note)}` : '.'}`]
			return []
		})
}

// A problem in the owner's words goes to the feedback log, with the item it is about if they named one (B18).
export const REPORT = /^report(?:\s+([A-Z]\d+))?\s*:\s*([\s\S]+)$/i
export function report(s: Store, t: string, code?: string): string {
	const wf = code ? s.byCode(code.toUpperCase()) : undefined
	s.log({ event: 'feedback', code: wf?.code, text: t, item: wf && { intent: wf.intent, ask: wf.lastAsk?.slice(0, 400), draft: wf.draft?.text, status: wf.status, chat: wf.chat.name } })
	return `Noted${wf ? ` for ${wf.code}` : ''}. It is in your feedback log, with what ${NAME} had done, so it can be fixed.`
}
