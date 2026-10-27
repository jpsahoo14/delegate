// One card state, from one ordered rule list (engineer-card-state-devspec.md §2). The projection offers exactly the actions this names,
// and the card draws them; nothing else picks a card's primary, its one editable box, or its warning line. Pure: no store, no clock.
// The first rule whose `when` holds decides, as core/whose.ts places rows.

import { shareHoldText, type ShareHold } from './share.ts'
import type { FailureCause } from './normalize-report.ts'

export type ActionKind = 'take-back' | 'approve' | 'send-anyway' | 'redraft' | 'send-edit' | 'answer' | 'pick' | 'later' | 'dismiss' | 'try-again' | 'write-own' | 'review-again' | 'reply-only' | 'reopen' | 'report' | 'todo-done' | 'add-vote' | 'one-more'
	| 'approve-pr' | 'post-waiting'
export type Mode = 'in-terminal' | 'agent-wait' | 'own-reply' | 'review-again' | 'review-done' | 'failed' | 'working' | 'declined' | 'held' | 'your-step' | 'choices' | 'answer' | 'answer-with-holding' | 'stopped'
	| 'reply-with-question' | 'changes' | 'reply' | 'holding' | 'not-sent' | 'todo' | 'unknown'
export type HeldReason = { kind: 'ask-edited' | 'asker-wrote-again' | 'no-reply-needed'; changed?: string; why?: string; count?: number; at?: string }
// PE A R31: SEND's ReportFailure.cause (core/normalize-report.ts), structured; target is page-safe.
export type { FailureCause } from './normalize-report.ts'

export type Failure = { kind: 'setup' | 'other' | 'content' | 'tool' | 'stopped'; at: string; why: string; tried: string[]; repeats: number; systemChanged: boolean; job?: string; review?: boolean; cause?: FailureCause }
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
	// Delegate is working on it (#48, PE 19:40): running, or a job queued or running for it (Try again, an answer's redraft, approved
	// changes being made). what: the item's own status; since: when it started.
	// #48b (PM A R21): kind redraft (running on his answer) or retry (Trying again); the card and row word each its own way.
	working?: { what: string; since?: string; kind?: 'redraft' | 'retry' }
	// The owner's Send was held by the engine (SEND, #45): every current reason at once, under one digest (wf.holdDigest).
	// changed: the engine's line for a real change in what is asked of him; count: the asker's new messages; at: when, for the order.
	held?: { digest: string; who: string; reasons: HeldReason[] }
	ownReply?: { at: string }
	declined?: { pr: number; addMe: boolean }
	yourStep?: { kind: 'decision' | 'report'; what: string }
	promiseFailed?: string
	// Open kept to-dos only the owner can do (#44(2), PE 18:15): how many, so a card with nothing else open is a to-do card.
	todos?: number
	// Why the draft waits for the owner on need to know (#36): structured, worded by shareHoldText (PM wording).
	shareHold?: ShareHold | string
	// The draft commits him (L4): the promise it makes, from its first promise to-do, when there is one.
	commitment?: { promise?: string }
	// The asker wrote again after this draft (block 1 used to say so on its own line).
	newMessages?: { who: string; n: number }
	// Other warnings, already worded: report facts that warn, and what a proposed change warns about.
	warns?: string[]
	// L1b (SEND's vote-claim guard): his reply claims a vote Delegate won't make. text: the PM's sentence; held: the engine already held
	// a Send on it (statusReason 'vote-claim'); override: ⋯ Send anyway is allowed (never for an automatic hold or canOverride false);
	// addVote: the review recommended a vote that isn't proposed, so Add the vote can propose it.
	voteGap?: { text: string; held: boolean; override: boolean; addVote: boolean }
	// Back from his terminal window (step 6, HOST's returnedFrom): the card says so in a status line; report: a result came back.
	returned?: { machine: string; at: string; report: boolean }
	// R10b (PM §2, joint C2): a review posted under his rule and waits for his approval. high: High comments posted; approvable: his
	// approve vote is proposed and the PR's head read now is the reviewed head (A R20); moved: the head moved past it (since when, if known);
	// waiting: comments still waiting for his OK.
	reviewDone?: { high: number; approvable: boolean; moved?: { at?: string }; waiting: number }
	// P0-10 (A R27): the PR's head moved during the review (wf.reviewAgain) and nothing asks the question; Review again still leads.
	reviewAgain?: boolean
	// D-COST New-COST-1: the item's job stopped (HOST's sticky job.stopped): no tool can do a step, or it reached its per-job limit.
	stop?: JobStop
}
// The stop the card shows, from the job's typed fields only: its kind and need, the per-job limit and what the job spent, his asker
// (a holding reply is then drafted for his OK), and the asker's newest message since the stop (news; nothing restarts on it).
export type JobStop = { kind: 'capability' | 'budget'; need?: string; at: string; runs?: number; tokens?: number; asker: boolean; news?: { who: string; at: string; again: boolean } }
// The PM's words (pm-cost-control.md, PM FINAL 04:03:13 / R3): the card's warn line for each stop.
export function stopLine(s: JobStop): string {
	if (s.kind === 'budget') return `Delegate stopped this job at its limit: ${s.runs ?? 0} AI runs, ${(s.tokens ?? 0).toLocaleString('en-US')} tokens. Nothing more runs unless you say so.`
	return `Delegate can't do this: none of its tools can ${s.need ?? 'do this step'}. It stopped and didn't retry.`
}
export type CardState = {
	mode: Mode; primary?: ActionKind; secondary: ActionKind[]; more: ActionKind[]
	editor: 'reply' | 'answer' | 'none'
	warn?: string
	// What the warn is (L4, PE 22:12): a reason (why it waited, or why a Send can't go as it is) or a notice (a report or change
	// warning, the promise). A click's result line names only a reason.
	warnKind?: 'reason' | 'notice'
	// Delegate is working on it (#48): the status strip in the bar's place, what it is doing and since when.
	strip?: { doing: string; since?: string; kind?: 'redraft' | 'retry' }
	// The "Why it waited" line a need-to-know hold gives the card (#36, PE 17:05 point 6).
	waited?: string
	// R10b: "Open PR to approve" is a link, not an action; where it sits in the bar.
	openPr?: 'primary' | 'secondary'
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

// The failure words (PM A R30 (2), PE A R31): "Couldn't <what>: <why>." from STRUCTURED fields only, never from the free-text why
// (which stays in Details with what it tried). Each step needs its target; each reason has its words. Today only kind 'stopped' is
// structured; the rest light up as SEND fills cause. Anything else is the PM fallback.
export const FAILURE_FALLBACK = "Couldn't finish this. What it tried is in Details."
const clock = (at?: string) => at && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined
// A title or subject is quoted once, whether or not the producer's target already carries the quotes.
const quoted = (target: string) => `"${target.replace(/^["“](.*)["”]$/, '$1')}"`
const WHAT: Record<Exclude<FailureCause['step'], 'run-stopped'>, (target: string) => string> = {
	'pr-read': target => `read PR ${target}`,
	'doc-read': target => `read ${quoted(target)}`,
	'teams-read': target => `read the messages in ${target}`,
	post: target => `post the comment on PR ${target}`,
	send: target => `send your reply to ${target}`,
	calendar: target => `create ${quoted(target)}`,
	'work-item': target => `update work item ${target}`,
}
const WHY: Record<NonNullable<FailureCause['reason']>, (c: FailureCause) => string | undefined> = {
	unreachable: c => c.system && `${c.system} wasn't reachable`,
	'no-access': () => 'Delegate has no access to it',
	'not-found': () => "it wasn't found (it may have been moved or deleted)",
	timeout: c => c.system && `${c.system} didn't answer in time`,
	busy: c => c.system && clock(c.retryAt) && `${c.system} is busy; Delegate tries again at ${clock(c.retryAt)}`,
	'too-large': c => c.size ? `it's too large to open (${c.size})` : "it's too large to open",
	unsupported: () => "Delegate can't open this kind of file yet",
}
export function failureLine(f: Pick<Failure, 'kind' | 'cause'>): string {
	const c = f.cause
	if (c?.step === 'run-stopped' || !c && f.kind === 'stopped') return "Couldn't finish the reply: Delegate stopped before it had an answer."
	const target = c?.target?.trim()
	if (!c || !target) return FAILURE_FALLBACK
	const what = WHAT[c.step](target), why = c.reason ? WHY[c.reason](c) : undefined
	return why ? `Couldn't ${what}: ${why}.` : `Couldn't ${what}. What it tried is in Details.`
}
export const failLine = (f: Failure) => `${failureLine(f)}${f.repeats > 0 ? ` It failed the same way ${f.repeats + 1} times.` : ''}`

// The held warn line (#45, PM final 19:20 and 19:40): one sentence per reason, at most two: the asker's change first (one with a
// `changed` line before one without, so the line says why Redraft leads, PE 19:16; then the newest), then "no reply is needed now".
// Each sentence is about 110 characters at most; a longer change line is cut with … and a third reason left out. When anything is cut
// or left out, `full` has every reason in full, one per line, for Details.
const bare = (s: string) => s.replace(/[.\s]+$/, '')
const MAX = 110
function sentence(head: string, rest?: string): { short: string; full: string } {
	const tail = rest && bare(rest), full = `${head}${tail ? `: ${tail}` : ''}.`
	if (full.length <= MAX || !tail) return { short: full, full }
	const room = Math.max(10, MAX - head.length - 3)
	return { short: `${head}: ${tail.slice(0, room).replace(/\s+\S*$/, '').replace(/[\s,;:]+$/, '')}…`, full }
}
export function heldLine(who: string, reasons: HeldReason[]): { line: string; full?: string } {
	const asks = reasons.filter(r => r.kind !== 'no-reply-needed').toSorted((a, b) => (a.changed ? 0 : 1) - (b.changed ? 0 : 1) || (b.at ?? '').localeCompare(a.at ?? ''))
	const noReply = reasons.find(r => r.kind === 'no-reply-needed')
	const said = (r: HeldReason) => r.kind === 'no-reply-needed' ? sentence('Delegate thinks no reply is needed now', r.why)
		: sentence(`${who} ${r.kind === 'ask-edited' ? 'edited their message' : (r.count ?? 1) > 1 ? `wrote ${r.count} more messages` : 'wrote again'} after you approved`, r.changed)
	const all = [...asks, ...(noReply ? [noReply] : [])].map(said)
	const shown = [asks[0], noReply ?? asks[1]].filter((r): r is HeldReason => !!r).map(said)
	const line = shown.map(s => s.short).join(' ')
	const full = all.map(s => s.full).join('\n')
	return all.length === shown.length && all.every((s, i) => s.full === shown[i].short) ? { line } : { line, full }
}

type Rule = { mode: Mode; when: (f: CardFacts) => boolean; build: (f: CardFacts) => Omit<CardState, 'mode' | 'block3'> }
const asked = (f: CardFacts) => !!f.question || f.yourStep?.kind === 'decision'
// "since Thu 7:53 PM": the hold's start in this machine's time (a format, not a clock).
const sinceWords = (at?: string) => at && Number.isFinite(Date.parse(at)) ? ` since ${new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''
const dayTime = (at?: string) => at && Number.isFinite(Date.parse(at)) ? ` · ${new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''
export const RULES: Rule[] = [
	// Open in a terminal (#43, PE 16:50): Delegate leaves the item alone, so the only page step is taking it back; it beats any state.
	{ mode: 'in-terminal', when: f => f.hold?.kind === 'window', build: f => ({ primary: 'take-back', secondary: [], more: [], editor: 'none', warn: `Open in a terminal on ${f.hold!.machine ?? 'another machine'}${sinceWords(f.hold!.since)} · Delegate waits until you close it.` }) },
	{ mode: 'agent-wait', when: f => f.hold?.kind === 'agent', build: f => ({ primary: 'write-own', secondary: [], more: ['dismiss'], editor: 'none', warn: f.hold!.text }) },
	{ mode: 'own-reply', when: f => !!f.ownReply, build: () => ({ secondary: [], more: ['reopen'], editor: 'none' }) },
	// D-COST JB1/JB2/JBΔ (Designer; PM R3): a stopped job waits for him and nothing restarts by itself. With an asker the holding reply
	// is drafted in the one editor and Send holding reply leads; Try again (Can't do) or Run it once more (limit) is the outline next to
	// it, and leads once the asker wrote again (the news line). Without an asker the retry leads. Close it is in ⋯.
	// CR COST1 B3: a held holding reply keeps the held card (its reasons, Send anyway / Redraft and their digest), with the retry added.
	{ mode: 'stopped', when: f => !!f.stop && !(f.held && f.draft), build: f => {
		const s = f.stop!, retry: ActionKind = s.kind === 'budget' ? 'one-more' : 'try-again', warn = stopLine(s)
		if (f.draft) return s.news ? { primary: retry, secondary: ['approve', 'later'], more: ['dismiss'], editor: 'reply', warn } : { primary: 'approve', secondary: [retry, 'later'], more: ['dismiss'], editor: 'reply', warn }
		if (s.asker && s.kind === 'capability' && !s.news) return { primary: 'write-own', secondary: [retry, 'later'], more: ['dismiss'], editor: 'none', warn }
		return { primary: retry, secondary: ['later'], more: ['dismiss'], editor: 'none', warn }
	} },
	{ mode: 'failed', when: f => !!f.failure || !!f.promiseFailed && !f.draft, build: f => {
		// A failed check of the owner's own promise is checked again, as its own action does.
		if (!f.failure) return { primary: 'approve', secondary: ['later'], more: ['dismiss'], editor: 'none', warn: `Couldn't check what your reply promised: ${f.promiseFailed}.` }
		const fl = f.failure, write: ActionKind[] = fl.review ? [] : ['write-own'], retry = retryHelps(fl)
		// A review's own way out is the "Review it yourself" link on the card, not an action: it leads when trying again won't help.
		if (!retry && fl.review) return { secondary: ['try-again', 'later'], more: ['dismiss'], editor: 'none', warn: failLine(fl) }
		const [primary, ...rest] = retry ? ['try-again' as ActionKind, ...write] : [...write, 'try-again' as ActionKind]
		return { primary, secondary: [...rest, 'later'], more: ['dismiss'], editor: 'none', warn: failLine(fl) }
	} },
	// Delegate is working on it (#48, PE 19:40): no button leads, a status strip says what it is doing; Dismiss stays in ⋯. Write the
	// reply yourself stays visible the whole time (PM 19:50). A terminal hold, an AI-limit wait, his own reply and a failure decide first.
	{ mode: 'working', when: f => !!f.working, build: f => ({ secondary: ['write-own'], more: ['dismiss'], editor: 'none', strip: { doing: f.working!.what, ...(f.working!.since ? { since: f.working!.since } : {}), ...(f.working!.kind ? { kind: f.working!.kind } : {}) } }) },
	{ mode: 'review-again', when: f => !!f.question?.reviewAgain || !!f.reviewAgain && !f.reviewDone, build: f => ({ primary: 'review-again', secondary: [...(f.draft ? [f.changes ? 'reply-only' as const : 'approve' as const] : []), 'later'], more: ['dismiss'], editor: 'none' }) },
	// R10b (joint C2, A5.4/A5.5): the bar is chosen by the findings. Any High: Open PR to approve leads, Approve PR <n> beside it; else
	// Approve leads. Approve only while it is his proposed vote on the reviewed head; on new changes Review again leads, Open PR beside it.
	{ mode: 'review-done', when: f => !!f.reviewDone && !f.draft, build: f => {
		const r = f.reviewDone!, post: ActionKind[] = r.waiting ? ['post-waiting'] : []
		if (r.moved) return { primary: 'review-again', secondary: [...post, 'later'], more: ['dismiss'], editor: 'none', openPr: 'secondary', warn: `New changes since the review${dayTime(r.moved.at)}` }
		if (!r.approvable) return { secondary: [...post, 'later'], more: ['review-again', 'dismiss'], editor: 'none', openPr: 'primary' }
		return r.high ? { secondary: ['approve-pr', ...post, 'later'], more: ['review-again', 'dismiss'], editor: 'none', openPr: 'primary' }
			: { primary: 'approve-pr', secondary: [...post, 'later'], more: ['review-again', 'dismiss'], editor: 'none', openPr: 'secondary' }
	} },
	{ mode: 'declined', when: f => !!f.declined, build: f => ({ primary: f.declined!.addMe && f.changes ? 'approve' : undefined, secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	// A held Send (#45, PE 17:15): every current reason in one line, newest first; Send anyway passes exactly those (holdDigest).
	// Redraft leads when the engine found a real change in what is asked of him (a reason with `changed`), because the draft no
	// longer answers it; otherwise Send anyway leads. Skip when no reply looks needed. His own text goes with Send your version.
	{ mode: 'held', when: f => !!f.held && !!f.draft, build: f => {
		const h = f.held!, reasons = h.reasons
		const asks = reasons.filter(r => r.kind !== 'no-reply-needed'), noReply = reasons.some(r => r.kind === 'no-reply-needed')
		const primary: ActionKind = asks.some(r => r.changed) ? 'redraft' : 'send-anyway'
		const other: ActionKind[] = primary === 'redraft' ? ['send-anyway'] : asks.length ? ['redraft'] : []
		// CR COST1 B3: on a stopped job the held card also offers its one retry (Try again / Run it once more).
		const retry: ActionKind[] = f.stop ? [f.stop.kind === 'budget' ? 'one-more' : 'try-again'] : []
		const secondary: ActionKind[] = [...other, ...retry, ...(noReply ? ['dismiss' as const] : []), 'later']
		const said = heldLine(h.who, reasons)
		return { primary, secondary, more: noReply ? [] : ['dismiss'], editor: 'reply', warn: said.line, ...(said.full ? { waited: `Why it waited:\n${said.full}` } : {}) }
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
	// Kept to-dos are the only open thing (#44(2), PE 18:15): "I've done these" leads. With a draft or a question open, that mode wins and
	// the to-dos stay as "Left for you" in block 3.
	{ mode: 'todo', when: f => !!f.todos, build: () => ({ primary: 'todo-done', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
	{ mode: 'unknown', when: () => true, build: () => ({ primary: 'write-own', secondary: ['later'], more: ['dismiss'], editor: 'none' }) },
]

// The promise line (L4, PM R9 #6): what he'd be promising, cut to about 80 characters at a word; without the words, a general line.
const PROMISE_MAX = 80
export function promiseLine(promise?: string): string {
	const p = promise && bare(promise.trim())
	if (!p) return "You'd be promising something in this reply. Check it before sending."
	const said = /^[A-Z][a-z]/.test(p) ? p[0].toLowerCase() + p.slice(1) : p
	return said.length <= PROMISE_MAX ? `You'd be promising: ${said}.` : `You'd be promising: ${said.slice(0, PROMISE_MAX).replace(/\s+\S*$/, '').replace(/[\s,;:]+$/, '')}…`
}

export function cardState(f: CardFacts): CardState {
	const rule = RULES.find(r => r.when(f))!
	const s = rule.build(f)
	// L4 (PE split; R8 1.2, 1.3, 3.3; R9 #6): block 1 has at most one warn line, the first of these, highest first: a false claim, then
	// why it waited (the mode's own line: a terminal, an AI wait, a failure, a held or refused Send; need to know; new messages), then
	// other warnings, then the promise. Every other one is a line in Details › Why it waited, and the warn is not repeated there.
	// A holding reply is a promise by definition, so it never gets the promise line. L1b's voteGap goes first when it lands.
	const shared = f.draft ? shareHoldText(f.shareHold) : undefined
	// Each line is a reason (why it waited or why a Send can't go as it is) or a notice; a click's result line names only a reason.
	const candidates = ([
		// L1b: a reply that claims a vote Delegate won't make leads, above everything (PE split L4 1.).
		[f.voteGap && f.draft ? f.voteGap.text : undefined, 'reason'],
		// "Your reply mentions something Delegate won't do": the reply is changed first, so the editor's version is what goes.
		[f.replyCountsOnRefused && s.editor === 'reply' ? "Your reply mentions something Delegate won't do. Change the reply first." : undefined, 'reason'],
		[s.warn, 'reason'],
		[shared && `Need to know: ${shared.replace(/^Waiting for you:\s*/, '')}`, 'reason'],
		[f.newMessages && f.draft && !f.held ? `${f.newMessages.who} wrote again after this draft${f.newMessages.n > 1 ? ` (${f.newMessages.n} new messages)` : ''}.` : undefined, 'reason'],
		...(f.warns ?? []).map(line => [line, 'notice']),
		[f.commitment && f.draft && !f.draft.holding && rule.mode !== 'holding' ? promiseLine(f.commitment.promise) : undefined, 'notice'],
	] as [string | undefined, 'reason' | 'notice'][]).filter((c, n, all): c is [string, 'reason' | 'notice'] => !!c[0] && all.findIndex(o => o[0] === c[0]) === n)
	const [chosen, ...rest] = candidates
	// The mode's own full text (a held Send's every reason) comes first in Why it waited, then the lines that did not lead.
	const lines = [...(s.waited ? s.waited.replace(/^Why it waited:\n/, '').split('\n') : []), ...rest.map(([line]) => line)]
	const { warn: _own, waited: _full, ...base } = s
	// L1b: Send stays (the card keeps it disabled until the reply changes); ⋯ Send anyway only where the engine lets the owner override,
	// and Add the vote when the review recommended one.
	if (f.voteGap && f.draft && s.editor === 'reply') {
		const offered = new Set([base.primary, ...base.secondary, ...base.more])
		if (f.voteGap.addVote && !offered.has('add-vote')) base.secondary = [...base.secondary.filter(k => k !== 'later'), 'add-vote', ...base.secondary.filter(k => k === 'later')]
		if (f.voteGap.override && !offered.has('send-anyway')) base.more = ['send-anyway', ...base.more]
		if (!f.voteGap.override) {
			if (base.primary === 'send-anyway') base.primary = 'redraft'
			base.secondary = base.secondary.filter(k => k !== 'send-anyway' && k !== base.primary); base.more = base.more.filter(k => k !== 'send-anyway')
		}
	}
	return { mode: rule.mode, ...base, ...(chosen ? { warn: chosen[0], warnKind: chosen[1] } : {}), ...(lines.length ? { waited: `Why it waited:\n${lines.join('\n')}` } : {}), block3: s.editor === 'reply' ? 'when-you-send' : 'none' }
}

// The invariants every card keeps (§4); a list of the broken ones, empty when the card is sound. Logged, never thrown.
// A leaked id is hex with a letter in it (a hash, a job id); a plain number such as an incident a change line names is not (#45).
const LEAK = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{8,}\b|job:|Error:|Not made for you/
export function checkCard(f: CardFacts, s: CardState): string[] {
	const out: string[] = []
	const all = [s.primary, ...s.secondary, ...s.more].filter(Boolean)
	if (new Set(all).size !== all.length) out.push('an action is offered twice')
	// The engine refuses everything but Take it back while a terminal holds the item (PE on c094cdc4), so the card offers nothing else.
	if (s.mode === 'in-terminal' && all.some(k => k !== 'take-back')) out.push('a card held by a terminal offers what the engine refuses')
	if (f.draft && !['in-terminal', 'working', 'not-sent', 'failed', 'own-reply', 'agent-wait', 'review-again', 'declined', 'your-step', 'choices'].includes(s.mode) && !all.includes('approve') && !all.includes('send-anyway') && !all.includes('send-edit')) out.push('a draft cannot be sent')
	if (f.held && f.draft && !all.includes('send-anyway') && f.voteGap?.override !== false) out.push('a held Send offers no Send anyway')
	if (f.voteGap && !f.voteGap.override && all.includes('send-anyway')) out.push('a vote claim the engine will not override offers Send anyway')
	if (f.failure && f.draft && Date.parse(f.draft.at) > Date.parse(f.failure.at) && s.mode === 'failed') out.push('a failure older than the draft decided the card')
	if (s.mode === 'unknown') out.push('no mode fits')
	if (f.todos && s.mode === 'unknown') out.push('open to-dos have no card')
	if (f.stop && !['in-terminal', 'agent-wait', 'own-reply', 'stopped', 'held'].includes(s.mode)) out.push('a stopped job has no stop card')
	if (f.stop && s.mode === 'held' && !all.includes(f.stop.kind === 'budget' ? 'one-more' : 'try-again')) out.push('a held stopped job offers no retry')
	if (f.working && !['in-terminal', 'agent-wait', 'own-reply', 'failed', 'working'].includes(s.mode)) out.push('a working item has no working card')
	if (s.warn && LEAK.test(s.warn)) out.push('the warning leaks an id or an error')
	if (s.editor === 'answer' && s.primary !== 'answer') out.push('an answer box without Answer')
	if (all.includes('approve-pr') && !(f.reviewDone?.approvable && !f.reviewDone.moved)) out.push('Approve is offered on a PR that changed since the review')
	return out
}
