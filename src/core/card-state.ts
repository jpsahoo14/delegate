// One card state, from one ordered rule list (engineer-card-state-devspec.md §2). The projection offers exactly the actions this names,
// and the card draws them; nothing else picks a card's primary, its one editable box, or its warning line. Pure: no store, no clock.
// The first rule whose `when` holds decides, as core/whose.ts places rows.

import { shareHoldText, type ShareHold } from './share.ts'

export type ActionKind = 'take-back' | 'approve' | 'send-anyway' | 'redraft' | 'send-edit' | 'answer' | 'pick' | 'later' | 'dismiss' | 'try-again' | 'write-own' | 'review-again' | 'reply-only' | 'reopen' | 'report'
export type Mode = 'in-terminal' | 'agent-wait' | 'own-reply' | 'review-again' | 'failed' | 'declined' | 'held' | 'your-step' | 'choices' | 'answer' | 'answer-with-holding'
	| 'reply-with-question' | 'changes' | 'reply' | 'holding' | 'not-sent' | 'unknown'
export type Failure = { kind: 'setup' | 'other' | 'content' | 'tool' | 'stopped'; at: string; why: string; tried: string[]; repeats: number; systemChanged: boolean; job?: string; review?: boolean }
// Everything a card may depend on, computed once per item (card-facts.ts). draft.at: when Delegate (or the owner's edit) wrote it.
export type CardFacts = {
	state: 'running' | 'needs_human' | 'waiting_on_task' | 'waiting_on_sender' | 'scheduled' | 'open' | 'done'
	draft?: { holding: boolean; preview: boolean; at: string }
	question?: { text: string; reviewAgain: boolean }
	choices?: { multi: boolean }
	changes: number
	replyCountsOnRefused?: boolean
	failure?: Failure
	// window: the item is open in a terminal (the runner sets wf.openOn each tick; since is from its open record, #43).
	hold?: { kind: 'agent' | 'paused' | 'active' | 'window'; until?: string; text: string; machine?: string; since?: string }
	notSent?: { why: string }
	// The owner's Send was held by the engine (SEND, wf.reason): the asker changed or added to the ask, or no reply looks needed.
	held?: { kind: 'ask-edited' | 'asker-wrote-again' | 'no-reply-needed'; digest: string; who: string; why?: string }
	ownReply?: { at: string }
	declined?: { pr: number; addMe: boolean }
	yourStep?: { kind: 'decision' | 'report'; what: string }
	promiseFailed?: string
	// Why the draft waits for the owner on need to know (#36): structured, worded by shareHoldText (PM wording).
	shareHold?: ShareHold | string
}
export type CardState = {
	mode: Mode; primary?: ActionKind; secondary: ActionKind[]; more: ActionKind[]
	editor: 'reply' | 'answer' | 'none'
	warn?: string
	// The "Why it waited" line a need-to-know hold gives the card (#36, PE 17:05 point 6).
	waited?: string
	block3: 'when-you-send' | 'none'
}

// Try again leads only when trying again can help (PM change 4): a passing kind of failure, or one whose cause was fixed since,
// and not after it already failed the same way twice.
export function retryHelps(f: Failure): boolean {
	return (['other', 'tool', 'stopped'].includes(f.kind) || f.systemChanged) && f.repeats < 2
}

// The newest failure wins, and any failure older than the draft is no longer the card's (the #33 rule, in one place).
export function currentFailure(candidates: (Failure | undefined)[], draftAt?: string): Failure | undefined {
	const f = candidates.filter((c): c is Failure => !!c).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
	return f && draftAt && Date.parse(draftAt) > Date.parse(f.at) ? undefined : f
}

const failLine = (f: Failure) => `${f.kind === 'content' ? "Couldn't finish" : "Couldn't draft this"}: ${f.why.replace(/[.\s]+$/, '')}.${f.repeats > 0 ? ` It failed the same way ${f.repeats + 1} times.` : ''}`

type Rule = { mode: Mode; when: (f: CardFacts) => boolean; build: (f: CardFacts) => Omit<CardState, 'mode' | 'block3'> }
const asked = (f: CardFacts) => !!f.question || f.yourStep?.kind === 'decision'
// "since Thu 7:53 PM": the hold's start in this machine's time (a format, not a clock).
const sinceWords = (at?: string) => at && Number.isFinite(Date.parse(at)) ? ` since ${new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''
export const RULES: Rule[] = [
	// Open in a terminal (#43, PE 16:50): Delegate leaves the item alone, so the only page step is taking it back; it beats any state.
	{ mode: 'in-terminal', when: f => f.hold?.kind === 'window', build: f => ({ primary: 'take-back', secondary: [], more: [], editor: 'none', warn: `Open in a terminal on ${f.hold!.machine ?? 'another machine'}${sinceWords(f.hold!.since)} · Delegate waits until you close it.` }) },
	{ mode: 'agent-wait', when: f => f.hold?.kind === 'agent', build: f => ({ primary: 'write-own', secondary: [], more: ['dismiss'], editor: 'none', warn: f.hold!.text }) },
	{ mode: 'own-reply', when: f => !!f.ownReply, build: () => ({ secondary: [], more: ['reopen'], editor: 'none' }) },
	{ mode: 'failed', when: f => !!f.failure || !!f.promiseFailed && !f.draft, build: f => {
		// A failed check of the owner's own promise is checked again, as its own action does.
		if (!f.failure) return { primary: 'approve', secondary: ['later'], more: ['dismiss'], editor: 'none', warn: `Couldn't check what your reply promised: ${f.promiseFailed}.` }
		const fl = f.failure, write: ActionKind[] = fl.review ? [] : ['write-own'], retry = retryHelps(fl)
		// A review's own way out is the "Review it yourself" link on the card, not an action: it leads when trying again won't help.
		if (!retry && fl.review) return { secondary: ['try-again', 'later'], more: ['dismiss'], editor: 'none', warn: failLine(fl) }
		const [primary, ...rest] = retry ? ['try-again' as ActionKind, ...write] : [...write, 'try-again' as ActionKind]
		return { primary, secondary: [...rest, 'later'], more: ['dismiss'], editor: 'none', warn: failLine(fl) }
	} },
	{ mode: 'review-again', when: f => !!f.question?.reviewAgain, build: f => ({ primary: 'review-again', secondary: [...(f.draft ? [f.changes ? 'reply-only' as const : 'approve' as const] : []), 'later'], more: ['dismiss'], editor: 'none' }) },
	{ mode: 'declined', when: f => !!f.declined, build: f => ({ primary: f.declined!.addMe && f.changes ? 'approve' : undefined, secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	// A held Send (SEND B1, PE 14:28): Send anyway sends the draft the owner saw past exactly this reason; Redraft starts over with the
	// new message, or Skip when no reply looks needed. It always leads with Send anyway: an edit or a redraft clears the reason, so an
	// edited draft is no longer held (PE 0b review, B2); his own text typed here goes with Send your version.
	{ mode: 'held', when: f => !!f.held && !!f.draft, build: f => {
		const h = f.held!, warn = h.kind === 'ask-edited' ? `${h.who} edited the question after you approved.` : h.kind === 'asker-wrote-again' ? `${h.who} wrote again after you approved.` : `Delegate thinks no reply is needed: ${(h.why ?? '').replace(/[.\s]+$/, '')}.`.replace(/: \.$/, '.')
		const primary: ActionKind = 'send-anyway'
		return h.kind === 'no-reply-needed' ? { primary, secondary: ['dismiss', 'later'], more: [], editor: 'reply', warn } : { primary, secondary: ['redraft', 'later'], more: ['dismiss'], editor: 'reply', warn }
	} },
	// Send stays: the engine checks the refused condition again on every Send, so it goes once that holds (A57, A61).
	{ mode: 'not-sent', when: f => !!f.notSent && !!f.draft, build: f => ({ primary: 'approve', secondary: ['later'], more: ['dismiss'], editor: 'reply', warn: `Didn't send: ${f.notSent!.why.replace(/[.\s]+$/, '')}.` }) },
	{ mode: 'your-step', when: f => f.yourStep?.kind === 'report', build: () => ({ primary: 'report', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	{ mode: 'choices', when: f => !!f.choices && !f.draft?.preview, build: () => ({ primary: 'pick', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	{ mode: 'answer', when: f => asked(f) && !f.draft, build: () => ({ primary: 'answer', secondary: ['later'], more: ['dismiss'], editor: 'answer' }) },
	{ mode: 'answer-with-holding', when: f => asked(f) && !!f.draft?.holding, build: () => ({ primary: 'answer', secondary: ['approve', 'later'], more: ['dismiss'], editor: 'answer' }) },
	{ mode: 'reply-with-question', when: f => asked(f) && !!f.draft, build: f => ({ primary: 'approve', secondary: ['later'], more: ['answer', 'dismiss'], editor: 'reply' }) },
	{ mode: 'changes', when: f => f.changes > 0, build: f => ({ primary: 'approve', secondary: [...(f.draft ? ['reply-only' as const] : []), 'later'], more: ['dismiss'], editor: f.draft ? 'reply' : 'none' }) },
	{ mode: 'holding', when: f => !!f.draft?.holding, build: () => ({ primary: 'approve', secondary: ['later'], more: ['dismiss'], editor: 'reply' }) },
	{ mode: 'reply', when: f => !!f.draft, build: () => ({ primary: 'approve', secondary: ['later'], more: ['dismiss'], editor: 'reply' }) },
	{ mode: 'unknown', when: () => true, build: () => ({ primary: 'write-own', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
]

export function cardState(f: CardFacts): CardState {
	const rule = RULES.find(r => r.when(f))!
	const s = rule.build(f)
	// "Your reply mentions something Delegate won't do": the reply is changed first, so the editor's version is what goes.
	const warn = s.warn ?? (f.replyCountsOnRefused && s.editor === 'reply' ? "Your reply mentions something Delegate won't do. Change the reply first." : undefined)
	const waited = f.draft ? shareHoldText(f.shareHold) : undefined
	return { mode: rule.mode, ...s, ...(warn ? { warn } : {}), ...(waited ? { waited } : {}), block3: s.editor === 'reply' ? 'when-you-send' : 'none' }
}

// The invariants every card keeps (§4); a list of the broken ones, empty when the card is sound. Logged, never thrown.
const LEAK = /[0-9a-f]{8,}|job:|Error:|Not made for you/
export function checkCard(f: CardFacts, s: CardState): string[] {
	const out: string[] = []
	const all = [s.primary, ...s.secondary, ...s.more].filter(Boolean)
	if (new Set(all).size !== all.length) out.push('an action is offered twice')
	// The engine refuses everything but Take it back while a terminal holds the item (PE on c094cdc4), so the card offers nothing else.
	if (s.mode === 'in-terminal' && all.some(k => k !== 'take-back')) out.push('a card held by a terminal offers what the engine refuses')
	if (f.draft && !['in-terminal', 'not-sent', 'failed', 'own-reply', 'agent-wait', 'review-again', 'declined', 'your-step', 'choices'].includes(s.mode) && !all.includes('approve') && !all.includes('send-anyway') && !all.includes('send-edit')) out.push('a draft cannot be sent')
	if (f.held && f.draft && !all.includes('send-anyway')) out.push('a held Send offers no Send anyway')
	if (f.failure && f.draft && Date.parse(f.draft.at) > Date.parse(f.failure.at) && s.mode === 'failed') out.push('a failure older than the draft decided the card')
	if (s.mode === 'unknown') out.push('no mode fits')
	if (s.warn && LEAK.test(s.warn)) out.push('the warning leaks an id or an error')
	if (s.editor === 'answer' && s.primary !== 'answer') out.push('an answer box without Answer')
	return out
}
