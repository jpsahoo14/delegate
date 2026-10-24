// One card state, from one ordered rule list (engineer-card-state-devspec.md §2). The projection offers exactly the actions this names,
// and the card draws them; nothing else picks a card's primary, its one editable box, or its warning line. Pure: no store, no clock.
// The first rule whose `when` holds decides, as core/whose.ts places rows.

export type ActionKind = 'approve' | 'send-edit' | 'answer' | 'pick' | 'later' | 'dismiss' | 'try-again' | 'write-own' | 'review-again' | 'reply-only' | 'reopen' | 'report'
export type Mode = 'agent-wait' | 'own-reply' | 'review-again' | 'failed' | 'declined' | 'your-step' | 'choices' | 'answer' | 'answer-with-holding'
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
	hold?: { kind: 'agent' | 'paused' | 'active'; until?: string; text: string }
	notSent?: { why: string }
	ownReply?: { at: string }
	declined?: { pr: number; addMe: boolean }
	yourStep?: { kind: 'decision' | 'report'; what: string }
	promiseFailed?: string
}
export type CardState = {
	mode: Mode; primary?: ActionKind; secondary: ActionKind[]; more: ActionKind[]
	editor: 'reply' | 'answer' | 'none'
	warn?: string
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
const send = (f: CardFacts): ActionKind => f.draft?.preview ? 'approve' : 'approve'
export const RULES: Rule[] = [
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
	// Send stays: the engine checks the refused condition again on every Send, so it goes once that holds (A57, A61).
	{ mode: 'not-sent', when: f => !!f.notSent && !!f.draft, build: f => ({ primary: 'approve', secondary: ['later'], more: ['dismiss'], editor: 'reply', warn: `Didn't send: ${f.notSent!.why.replace(/[.\s]+$/, '')}.` }) },
	{ mode: 'your-step', when: f => f.yourStep?.kind === 'report', build: () => ({ primary: 'report', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	{ mode: 'choices', when: f => !!f.choices && !f.draft?.preview, build: () => ({ primary: 'pick', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	{ mode: 'answer', when: f => asked(f) && !f.draft, build: () => ({ primary: 'answer', secondary: ['later'], more: ['dismiss'], editor: 'answer' }) },
	{ mode: 'answer-with-holding', when: f => asked(f) && !!f.draft?.holding, build: () => ({ primary: 'answer', secondary: ['approve', 'later'], more: ['dismiss'], editor: 'answer' }) },
	{ mode: 'reply-with-question', when: f => asked(f) && !!f.draft, build: f => ({ primary: 'approve', secondary: ['later'], more: ['answer', 'dismiss'], editor: 'reply' }) },
	{ mode: 'changes', when: f => f.changes > 0, build: f => ({ primary: 'approve', secondary: [...(f.draft ? ['reply-only' as const] : []), 'later'], more: ['dismiss'], editor: f.draft ? 'reply' : 'none' }) },
	{ mode: 'holding', when: f => !!f.draft?.holding, build: f => ({ primary: 'approve', secondary: ['later'], more: ['answer', 'dismiss'], editor: 'reply' }) },
	{ mode: 'reply', when: f => !!f.draft, build: f => ({ primary: 'approve', secondary: ['later'], more: ['answer', 'dismiss'], editor: 'reply' }) },
	{ mode: 'unknown', when: () => true, build: () => ({ primary: 'write-own', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
]

export function cardState(f: CardFacts): CardState {
	const rule = RULES.find(r => r.when(f))!
	const s = rule.build(f)
	// "Your reply mentions something Delegate won't do": the reply is changed first, so the editor's version is what goes.
	const warn = s.warn ?? (f.replyCountsOnRefused && s.editor === 'reply' ? "Your reply mentions something Delegate won't do. Change the reply first." : undefined)
	return { mode: rule.mode, ...s, ...(warn ? { warn } : {}), block3: s.editor === 'reply' ? 'when-you-send' : 'none' }
}

// The invariants every card keeps (§4); a list of the broken ones, empty when the card is sound. Logged, never thrown.
const LEAK = /[0-9a-f]{8,}|job:|Error:|Not made for you/
export function checkCard(f: CardFacts, s: CardState): string[] {
	const out: string[] = []
	const all = [s.primary, ...s.secondary, ...s.more].filter(Boolean)
	if (new Set(all).size !== all.length) out.push('an action is offered twice')
	if (f.draft && !['not-sent', 'failed', 'own-reply', 'agent-wait', 'review-again', 'declined', 'your-step', 'choices'].includes(s.mode) && !all.includes('approve') && !all.includes('send-edit')) out.push('a draft cannot be sent')
	if (f.failure && f.draft && Date.parse(f.draft.at) > Date.parse(f.failure.at) && s.mode === 'failed') out.push('a failure older than the draft decided the card')
	if (s.mode === 'unknown') out.push('no mode fits')
	if (s.warn && LEAK.test(s.warn)) out.push('the warning leaks an id or an error')
	if (s.editor === 'answer' && s.primary !== 'answer') out.push('an answer box without Answer')
	return out
}
