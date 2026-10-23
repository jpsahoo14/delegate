import { NAME } from '../brand.ts'
import type { Action, Snapshot } from './contracts.ts'

// Hover text (spec S7): what a control does and what changes, in one or two short sentences, never a chat command.
// One source for both experiences; the server's item-specific `meaning` wins. "[clause]" is dropped when a value inside
// is missing; "[clause|fallback]" uses the fallback instead.
export type HoverValues = { name?: string; target?: string; until?: string; date?: string; n?: number; topic?: string; todo?: string; next?: string; left?: string; at?: string; mode?: string }

const BY_KIND: Record<string, string> = {
	'needs-me': `Move this to Waiting on you. ${NAME} drafts a reply[ to {name}] for your OK, and learns that messages like this need you. Nothing is sent yet.`,
	'mark-all-read': 'Mark the Catch up items shown here as read. They stay in Done › Catch up, and nothing is sent.',
	undo: 'Delete this reply from the Teams chat and put the item back in Waiting on you.[ Possible for {left} more.] Changes already made are not reversed.',
	'undo-facts': `Take back the[ {n}] facts this saved[ about {topic}]. Each one goes back to what it was before. Facts you edited since then are kept.`,
	wrong: `${NAME} drafts a correction for your OK.`,
	incomplete: `${NAME} drafts what was missing for your OK.`,
	unneeded: `${NAME} notes it and replies less in cases like this. Within the Undo time, it also takes the reply back.`,
	later: 'Move this to the end of your list for now. Nothing is sent and nothing changes in Teams.',
	dismiss: 'Remove this from your list without replying. Nothing is sent.[ It comes back if {name} writes again.]',
	'dismiss-waiting': 'Remove this from your list without replying. Nothing is sent.[ It comes back if {name} writes again.]',
	continue: `Continue this item's ${NAME} session on your computer, for example to look at the code it used.`,
	'classic-continue': `Continue this item's ${NAME} session on your computer, for example to look at the code it used.`,
	'reply-only': 'Send the reply without posting any of the PR comments.',
	pick: 'Show the reply for this option in the reply box. Nothing is sent yet.',
	answer: `${NAME} writes a reply from your answer. You see it before anything is sent.`,
	'use-note': `${NAME} redrafts the reply using this answer. You see the new draft before anything is sent.`,
	'review-again': `${NAME} reruns the review on the latest version of the PR. Nothing is posted yet.`,
	'approve-again': 'Make the approved changes one more time. Use only if they did not happen the first time.',
	'todo-done': 'Tick off [{todo}|this to-do]. The work stays open, and nothing is sent.',
	'todo-row-done': 'Tick off [{todo}|this to-do]. The work stays open, and nothing is sent.',
	report: `${NAME} drafts your update[ to {name}] from your result. Nothing is sent until you OK it.`,
	'follow-up': `${NAME} drafts a short follow-up[ to {name}] for your OK. Nothing is sent by itself.`,
	'classic-work-wait': `Stop asking you about this for 3 days.[ ${NAME} checks again on {date}.]`,
	'classic-work-close': `End this work. ${NAME} stops following it and closes its parts. Nothing is sent.`,
	'classic-close': `End this work. ${NAME} stops following it and closes its parts. Nothing is sent.`,
	'classic-ack-watch': `Clear the Changed mark. ${NAME} keeps watching.`,
	'stop-watch': 'Stop checking [{target}|this]. It moves to Done. Nothing is sent.',
	'stop-channel': 'Stop checking [{target}|this channel]. It moves to Done. Nothing is sent.',
	'extend-watch': 'Keep watching for 7 more days[, until {date}].',
	'classic-extend': 'Keep watching for 7 more days[, until {date}].',
	interval: `Change how often ${NAME} checks [{target}|this].`,
	'classic-interval': `Change how often ${NAME} checks [{target}|this].`,
	end: 'Stop this reminder for good.',
	'classic-start': 'Turn this automation on.[ Its first message goes {next}.]',
	'remind-someone': `${NAME} sends [{name}|them] this message on schedule, from your account.`,
	'save-facts': `Save the ticked facts. ${NAME} uses them in future drafts. You can undo this from Done.`,
	'skip-facts': "Don't save any of these facts.",
	'edit-fact': `Save the fact as you wrote it, instead of ${NAME}'s wording.`,
	'accept-habit': `${NAME} does this for you from now on. You can turn it off in Settings.`,
	'defer-habit': 'Ask again later.',
	'never-habit': "Don't suggest this again.",
	'chat-normal': 'Treat this chat like any other again.',
	'retry-source': `Ask ${NAME} to read your chats again now, instead of waiting for the next cycle.`,
	'health:source': `Ask ${NAME} to read your chats again now, instead of waiting for the next cycle.`,
	'check-update': `Look for a newer version of ${NAME} now.`,
	'paste-missed': `Treat this message as an ask for you: ${NAME} drafts a reply for your OK.`,
	'report-problem': `Send a note about what went wrong to ${NAME}'s feedback log, with the current page. Nothing goes to Teams.`,
}
// Controls whose kind is shared by several labels (row actions, toggles, the watch form) are told apart by their label.
const BY_LABEL: Record<string, string> = {
	Watch: `Have ${NAME} keep an eye on this and tell you when it changes. You choose what to watch and until when.`,
	'Start watching': `${NAME} checks [{target}|it] regularly and shows a Changed mark when it moves.[ Stops when {until}, or by the date you pick.]`,
	'Not right?': `Tell ${NAME} this reply was wrong, incomplete or unneeded. It drafts a fix for your OK and learns from it.`,
	'Do it now': `${NAME} starts the next step now, instead of waiting.`,
	'Try again': 'Run this item again from where it stopped.',
	'Draft a nudge': `${NAME} drafts a short follow-up[ to {name}] for your OK. Nothing is sent by itself.`,
	'Follow up': `${NAME} drafts a short follow-up[ to {name}] for your OK. Nothing is sent by itself.`,
	'Draft follow-up': `${NAME} drafts a short follow-up[ to {name}] for your OK. Nothing is sent by itself.`,
	Track: `${NAME} follows this work until it is done and tells you when your step comes.`,
	'Got it': `Clear the Changed mark. ${NAME} keeps watching.`,
	Pause: 'Stop sending this reminder until you resume it.',
	Resume: 'Send this reminder again on its schedule[, from {next}].',
	'Wait 3 days': `Stop asking you about this for 3 days.[ ${NAME} checks again on {date}.]`,
	'Edit in Teams': `Open Teams with this draft so you can change and send it there. ${NAME} sees that you replied.`,
	'Open in Teams': 'Open this message in Teams, in a new tab.',
	'Show thread': 'Show the earlier messages of this conversation here. Nothing changes in Teams.',
	'Mark normal again': 'Treat this chat like any other again.',
	'Check now': `Ask ${NAME} to read your chats again now, instead of waiting for the next cycle.`,
	'Make it an item': `Treat this message as an ask for you: ${NAME} drafts a reply for your OK.`,
	'Create reminder': `${NAME} sends [{name}|them] this message on schedule, from your account.`,
	Experience: 'Switch between New and Classic. Same items and data; nothing is sent.',
	'App version': 'Choose which version of the page to use: Classic, New or React (preview). The page reloads.',
}
// A row's Skip is "don't track"; the facts form has its own Skip, by kind.
const BY_KIND_LABEL: Record<string, string> = { 'row|Skip': "Don't track this. Nothing is sent.", 'row|Close': `End this work. ${NAME} stops following it and closes its parts. Nothing is sent.` }
// The label already says it all.
const PLAIN = new Set(['Send', 'Cancel', 'Close', 'Save', 'Edit', 'Open', 'Hide', 'Prev', 'Previous', 'Next'])

export const CHIP_HOVER: Record<string, string> = {
	A: "This item's code. You can use it in chat, for example to reply or close it.",
	K: `A set of facts ${NAME} learned or proposes to save.`,
	R: `A reminder ${NAME} sends for you.`,
	W: 'Something you asked someone and are waiting on.',
	H: `A habit ${NAME} suggests or follows.`,
	new: 'Changed since you last looked, on any of your machines.',
	back: 'This was waiting on someone else and now needs you again.',
	changed: 'The watched thing changed since you last clicked Got it.',
	group: `Posted to the whole group, not addressed to you. ${NAME} checks whether you should reply.`,
	before: `This message arrived before ${NAME} was set up. It is shown so nothing old is missed.`,
	holding: `A short 'working on it' reply while ${NAME} finishes the real answer.`,
	retrying: `${NAME}'s last try failed. It tries again automatically[ {at}].`,
	guests: `This chat has people from outside your company. ${NAME} keeps private facts out of replies here.`,
	pointed: `You pasted this message's link, so ${NAME} made it an item.`,
	'count-needs': '{n} need you.',
	'count-done': '{n} new since you last looked.',
	'count-ongoing': '{n} watches changed.',
	'count-knowledge': '{n} fact sets to check.',
}

// A chip's or item code's hover text; undefined when the chip has none (spec S7, chips and codes).
export const chipHover = (kind: string, values: HoverValues = {}) => CHIP_HOVER[kind] ? fill(CHIP_HOVER[kind], values) || undefined : undefined
export const codeHover = (code: string) => /^[AKRWH]\d+$/i.test(code) ? CHIP_HOVER[code[0].toUpperCase()] : undefined

// Fills the values; a bracketed clause with a missing value is dropped, or replaced by its fallback.
export function fill(template: string, values: HoverValues = {}): string {
	const value = (key: string) => { const v = values[key as keyof HoverValues]; return v === undefined || v === '' ? undefined : String(v) }
	const put = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => value(key) ?? '\u0000')
	return template.replace(/\[([^\]|]*)(?:\|([^\]]*))?\]/g, (_, text: string, fallback = '') => { const done = put(text); return done.includes('\u0000') ? put(fallback) : done })
		.replace(/\{(\w+)\}/g, (_, key: string) => value(key) ?? '').replace(/\u0000/g, '').replace(/\s{2,}/g, ' ').trim()
}

// What a control does, for its hover text and description. Undefined: the label says it all.
export function hoverOf(kind: string, label: string, values: HoverValues = {}, meaning?: string): string | undefined {
	if (meaning?.trim()) return meaning.trim()
	const row = kind.startsWith('row-') ? 'row' : kind
	const template = BY_KIND_LABEL[`${row}|${label}`] ?? (row === 'row' ? undefined : BY_KIND[kind]) ?? (kind === '' || kind === 'toggle' || row === 'row' || kind.startsWith('watch') ? PLAIN.has(label) ? undefined : BY_LABEL[label] : undefined)
	return template ? fill(template, values) || undefined : undefined
}

// Why a control cannot be used now (spec S7: a disabled control says why). Offline comes first.
export function disabledHover(why: { offline?: boolean; stale?: boolean; needsPick?: boolean; unavailable?: string; busy?: boolean; expired?: boolean; submitted?: boolean }, text?: string): string | undefined {
	const reason = why.offline ? 'Offline: reconnect to act.' : why.unavailable ? why.unavailable : why.stale ? 'Changed since you looked: open the new version first.' :
		why.needsPick ? 'Pick an option first.' : why.busy ? `Waiting for the saved result of your last action here.` : why.expired ? 'The Undo time is over.' : why.submitted ? `Already submitted. Waiting for ${NAME}.` : undefined
	return reason ? `${reason}${text && why.offline ? ` ${text}` : ''}` : text
}

// The values an action's hover text can name, read from the page data.
export function hoverValues(snapshot: Snapshot | undefined, action: Action, extra: HoverValues = {}): HoverValues {
	const entities = snapshot?.entities, code = action.item
	const item = entities?.items[code], watch = entities?.watches[code], proposal = entities?.knowledgeProposals[code]
	const person = item ? entities?.people[item.personId] : undefined
	const todo = action.todoIds?.length === 1 ? entities?.todos[action.todoIds[0]]?.text : undefined
	const automation = entities?.automations[code]
	return {
		name: person?.name.split(' ')[0] ?? automation?.to, target: watch?.what, until: undefined,
		date: watch?.endsAt ? new Date(Date.parse(watch.endsAt) + 7 * 86_400_000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : undefined,
		n: proposal?.factIds.length, topic: proposal?.topic, todo, next: automation?.next ?? undefined, ...extra,
	}
}
