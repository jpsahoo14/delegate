import { site } from '../core/site.ts'
import type { PlanStep, Report, Step, Workflow, WorkReport } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { canonicalKey } from './jobs.ts'
import { isVote, pendingEffects, prIdOf, VOTES, voteName, voteValue } from '../core/effects.ts'

// Open work: an item that keeps one code until its work is closed. Every state change for work items is here (dev-spec/work.md).

const DAY = 86_400_000
const MAX_STEPS = 40

export const active = (wf: Workflow) => !!wf.work && !wf.work.closed && !wf.work.proposed

// A part is an item in another chat whose work lives on its home item (part 2). Every other item is its own home.
export function homeOf(store: Store, wf: Workflow): Workflow {
	const h = wf.partOf ? store.workflow(wf.partOf) : undefined
	return h && h.work?.parts?.includes(wf.id) ? h : wf
}
// Whether this item (a home or a part) belongs to active work.
export const inWork = (store: Store, wf: Workflow) => active(homeOf(store, wf))
export const label = (wf: Workflow, home: Workflow) => (wf === home || wf.id === home.id ? '' : `${wf.asker?.name?.split(' ')[0] ?? wf.chat.name} (${wf.chat.group ? wf.chat.name : '1:1'}, ${wf.code}): `)

// Typed links a message names; numbers alone are never links (review part 2 #2).
export function linksIn(text: string): string[] {
	const out = new Set<string>()
	for (const m of text.matchAll(/\b(?:pull request|PR)\s*#?\s*(\d{4,})/gi)) out.add(`pr:${m[1]}`)
	for (const m of text.matchAll(/https?:\/\/[^\s<>]+\/pullrequest\/(\d+)/gi)) out.add(`pr:${m[1]}`)
	const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const builds = ['build', 'run', 'pipeline run', ...(site().buildWords ?? [])].map(esc).join('|')
	for (const m of text.matchAll(new RegExp(`\\b(?:${builds})\\s*#?\\s*(\\d{6,})\\b`, 'gi'))) out.add(`build:${m[1]}`)
	const words = ['incident', ...(site().incidentWords ?? [])].map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
	for (const m of text.matchAll(new RegExp(`\\b(?:${words})\\s*#?\\s*(\\d{6,})`, 'gi'))) out.add(`incident:${m[1]}`)
	for (const m of text.matchAll(/\b(?:work ?item|bug|task)\s*#?\s*(\d{6,})/gi)) out.add(`workItem:${m[1]}`)
	return [...out]
}
const sameLink = (a: string, b: string) => a.split(':')[0].toLowerCase() === b.split(':')[0].toLowerCase() && a.split(/[:/]/).at(-1) === b.split(/[:/]/).at(-1)
// The one active home whose links the text names; none when it names none or several.
export function homeNamed(homes: Workflow[], text: string): Workflow | undefined {
	const ls = linksIn(text)
	const hit = ls.length ? homes.filter(h => active(h) && !h.partOf && h.work!.links.some(l => ls.some(x => sameLink(l, x)))) : []
	return hit.length === 1 ? hit[0] : undefined
}
export function addPart(home: Workflow, part: Workflow) {
	part.partOf = home.id
	home.work!.parts = [...new Set([...(home.work!.parts ?? []), part.id])]
}

// A step with a ref is added once, so a replayed report adds nothing.
export function step(wf: Workflow, what: string, o: { ref?: string; news?: boolean; at?: string } = {}): boolean {
	if (!wf.work) return false
	if (o.ref && wf.work.steps.some(s => s.ref === o.ref)) return false
	const s: Step = { at: o.at ?? new Date().toISOString(), what: what.replace(/\s+/g, ' ').trim().slice(0, 300), ...(o.ref ? { ref: o.ref } : {}), ...(o.news ? { news: true } : {}) }
	wf.work.steps.push(s)
	if (wf.work.steps.length > MAX_STEPS) {
		const old = wf.work.steps.splice(0, wf.work.steps.length - MAX_STEPS + 1)
		wf.work.steps.unshift({ at: old[0].at, what: `Earlier: ${old.map(x => x.what).join('; ').slice(0, 280)}` })
	}
	return true
}

export function mergeWork(wf: Workflow, w: WorkReport | undefined, now = new Date(), from = '', changedAsk?: string) {
	if (!w) return
	const at = now.toISOString()
	if (!wf.work) {
		if (!w.goal) return
		wf.work = { goal: w.goal, doneWhen: w.doneWhen ?? 'the asker has what they needed', steps: [], links: [] }
		step(wf, `Started: ${w.goal}`, { at })
	} else {
		if (changedAsk && w.changedAsk === changedAsk) {
			if (w.goal) wf.work.goal = w.goal
			if (w.doneWhen) wf.work.doneWhen = w.doneWhen
		}
		if (wf.work.closed && !w.closed) wf.work.closed = undefined
	}
	const k = wf.work
	if (w.step) step(wf, `${from}${w.step}`, { at })
	if (w.next) k.next = w.next
	if (w.waitingOn) k.waitingOn = { ...w.waitingOn, since: k.waitingOn?.who === w.waitingOn.who ? k.waitingOn.since : at }
	for (const l of w.links ?? []) { const key = canonicalKey(l); if (!k.links.includes(key)) k.links.push(key) }
	k.checkAt = new Date(now.getTime() + (w.checkInDays ?? 3) * DAY).toISOString()
	// A part sees the whole plan but works on its own chat's steps: it updates and adds, and never drops the home's (live run 10-19).
	if (w.plan) k.plan = mergePlan(k.plan ?? [], w.plan, at, !!from)
	if (w.closed) k.closed = { at, why: w.closed }
}

export const hasDecisions = (r: Report) => !!r.choices || !!r.effects?.length

export function mergeReportWork(wf: Workflow, r: Report, home = wf, changedAsk?: string, allowClose = true) {
	const deferred = !!(r.reply || r.question || hasDecisions(r) || r.job)
	wf.closeWorkAfterSend = deferred ? r.work?.closed : undefined
	mergeWork(home, r.work && (deferred || !allowClose) ? { ...r.work, closed: undefined } : r.work, undefined, label(wf, home), changedAsk)
}

// The worker sends the full list; a step keeps its id, done mark, and probe state across reports.
export function mergePlan(old: PlanStep[], next: NonNullable<WorkReport['plan']>, at: string, keep = false): PlanStep[] {
	let n = old.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, '')) || 0), 0)
	const merged = next.slice(0, 10).map(p => {
		const was = (p.id && old.find(o => o.id === p.id)) || old.find(o => o.what.toLowerCase() === p.what.toLowerCase())
		const probe = p.build ? { build: p.build, project: p.project ?? was?.probe?.project ?? '' } : was?.probe
		const sameProbe = !!probe && !!was?.probe && probe.build === was.probe.build && probe.project === was.probe.project
		return { id: was?.id ?? `p${++n}`, what: p.what, who: p.who, ...(p.done || sameProbe && was?.done ? { done: was?.done ?? at } : {}), ...(p.in ? { in: p.in.toUpperCase() } : {}), ...(probe ? { probe } : {}), ...(was?.seen && sameProbe ? { seen: was.seen } : {}), ...(was?.ring ? { ring: was.ring, ...(was.done && !p.done ? { done: was.done } : {}) } : {}) }
	})
	// A deploy Delegate made stays on the plan, so its ring is still watched, whatever a run's new plan leaves out (owned work).
	merged.push(...old.filter(o => o.ring && !merged.some(m => m.id === o.id)))
	if (!keep) return merged
	return [...old.map(o => merged.find(m => m.id === o.id) ?? o), ...merged.filter(m => !old.some(o => o.id === m.id))].slice(0, 12)
}

// The fields of one reply. New input on open work starts a new turn, so its reply is a new send (review P0.1).
// Ending a turn without new input (wait, skip, close, the owner's own message) keeps the last send for Done and "Not right?".
// The turn's own to-dos go with it; the ones a sent reply promised (kept) stay until the owner marks them done (R-NEX-07).
export function newTurn(wf: Workflow, keepSent = false) {
	Object.assign(wf, { draft: undefined, prDraft: undefined, learnAfter: undefined, closeWorkAfterSend: undefined, choices: undefined, question: undefined, effects: undefined, promised: undefined, decision: undefined, approved: undefined, picked: undefined, sendAt: undefined, correction: undefined, todos: undefined, newCount: 0, ...(keepSent ? {} : { sent: undefined }) })
}

// When a reply goes out, what it promised the owner would do becomes theirs to keep, once per open text (R-NEX-07).
export function keepTodos(wf: Workflow, at: string, todos = wf.todos) {
	const kept = wf.kept ?? []
	let n = kept.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, '')) || 0), 0)
	const add = [...new Set(todos ?? [])].filter(text => !kept.some(t => !t.done && t.text === text)).map(text => ({ id: `t${++n}`, text, at }))
	// Always set, even empty: an item with no kept list was written before N2, and only those are migrated (review N2 P2-2).
	wf.kept = [...kept, ...add]
}
export const openTodos = (wf: Workflow) => (wf.kept ?? []).filter(t => !t.done)
// "Mark done": the open to-dos on the item are done, or only those named (the ones the owner saw). Nothing else about the item changes.
export function doneTodos(wf: Workflow, at = new Date().toISOString(), only?: string[]): string[] {
	const open = openTodos(wf).filter(t => !only || only.includes(t.id))
	wf.kept = (wf.kept ?? []).map(t => (open.includes(t) ? { ...t, done: at } : t))
	return open.map(t => t.text)
}

// A report with no response or decision: active work stays open, closed work is done.
export function settle(wf: Workflow, r: Report, home = wf): boolean {
	if (!home.work) return false
	if (r.reply || r.question || hasDecisions(r)) return false
	if (active(home)) { Object.assign(wf, { state: 'open', status: r.summary || 'In progress', pending: [] }); return true }
	if (home.work.closed) { Object.assign(wf, { state: 'done', status: `Closed: ${home.work.closed.why}`, pending: [] }); return true }
	return false
}

// After a reply is sent. Returns true when the item stays open.
export function afterSend(wf: Workflow, text: string, msgId: string, home = wf, closeApproval = true, closeReport = true): boolean {
	if (!home.work) return false
	wf.completionSeen = `sent:${msgId}`
	step(home, `${label(wf, home)}Replied: ${text}`, { ref: `sent:${msgId}` })
	const effects = (wf.effects ?? []).filter(e => !e.off)
	const reported = closeReport && !wf.pending.length && !wf.question && effects.every(e => e.done) && !wf.effects?.some(e => e.off) && wf.closeWorkAfterSend
	wf.closeWorkAfterSend = undefined
	if (reported || closeApproval && wf === home && approvalOnly(home) && !wf.follow && effects.length && effects.every(e => e.done) && effects.some(e => isVote(e.call) && (voteValue(e.call) ?? 0) >= 5 && linksIn(wf.lastAsk ?? '').includes(`pr:${prIdOf(e.call)}`))) {
		home.work.closed = { at: new Date().toISOString(), why: reported || 'Approval recorded and reply sent' }
		home.work.next = undefined
		home.work.waitingOn = undefined
	}
	if (!active(home)) { Object.assign(wf, { state: 'done', status: `Closed: ${home.work.closed?.why ?? 'closed'}`, pending: [] }); return false }
	Object.assign(wf, { state: 'open', status: statusOf(home), pending: [] })
	return true
}

export const approvalMention = (text: string) => /approv|sign[ -]?off|\blgtm\b/i.test(text)
// A run tag such as "[E2E-… 1792751673901]" before the words is a label, not part of what they say (bug 10-23 E35).
const untagged = (text: string) => text.trim().replace(/\u2019/g, "'").replace(/^(?:\[[^\]\n]{1,120}\]\s*)+/, '')
const sentencesOf = (text: string) => untagged(text).split(/(?<=[.!?;])\s+|\n+/).map(s => s.trim()).filter(Boolean)
// Only a number written as a pull request names one ("PR 12", "pull request #12", ".../pullrequest/12"); tags, times and counts never do.
export const prNumbersIn = (text: string) => [...text.matchAll(/\b(?:PR|pull\s+request|pullrequest\/)\s*#?\s*(\d+)\b|(?:^|\s)#(\d{3,})\b/gi)].map(m => Number(m[1] ?? m[2]))
export function approvalReplyMatches(text: string, vote: number | undefined, pr: number): boolean {
	if (!approvalMention(text)) return true
	// Every sentence that speaks of approval must be a complete, bounded statement the vote supports; the rest is free.
	return sentencesOf(text).filter(approvalMention).every(s => approvalSentenceMatches(s, vote, pr))
}
function approvalSentenceMatches(sentence: string, vote: number | undefined, pr: number): boolean {
	const line = sentence.replace(/[.!;]$/, '')
	// Only complete, bounded statements pass. Unrecognized approval wording waits for a redraft.
	const target = '(?:\\s+(?:(?:the\\s+)?(?:PR|pull request)(?:\\s*#?\\s*\\d+)?|it|\\d+))?'
	const condition = '(?:\\s+(?:after|once|when|until)\\s+(?:(?:the\\s+|its\\s+)?(?:build|tests?|checks?|requested changes|null check|comments?)(?:\\s+(?:is|are)\\s+(?:green|fixed|addressed|resolved|complete|done))?|checking the comments))?'
	const future = new RegExp(`^(?:(?:(?:Rechecked,?\\s+)?looks good(?: to me)?[.!;]|Yes,)\\s+)?(?:I|we)(?:'ll| will(?: not)?| won't)\\s+(?:approve|sign[ -]?off)${target}(?:\\s+too)?${condition}(?:, and add [a-z][a-z -]{0,60} as a reviewer)?$`, 'i')
	if (future.test(line)) return true
	if ([...prNumbersIn(line), ...[...line.matchAll(/\b(?:approve|approved|sign[ -]?off|signed[ -]?off)\s+#?(\d+)\b/gi)].map(m => Number(m[1]))].some(id => id !== pr)) return false
	if (vote === undefined || !Object.values(VOTES).includes(vote)) return false
	const negative = new RegExp(`^(?:(?:I|we)\\s+(?:have not|haven't|did not|didn't|have never|never)\\s+(?:approved|signed[ -]?off)${target}(?:\\s+yet)?|(?:Not yet,\\s*)?(?:my|our)\\s+approval\\s+(?:has not been|hasn't been|is not|isn't)\\s+(?:recorded|given))$`, 'i')
	if (negative.test(line)) return vote !== undefined && vote < 5
	const positive = new RegExp(`^(?:(?:I|we)\\s+(?:have\\s+)?)?(?:approved|signed[ -]?off)${target}(?:,\\s*(?:thanks|with suggestions))?$|^LGTM$`, 'i')
	return vote !== undefined && vote >= 5 && positive.test(line)
}
export const reReviewAsk = (text: string) => /re[ -]?review|review again|recheck/i.test(text)
// A reply that only reports other people's approval state ("Priya has approved; the EM approval is still pending"): it does not
// speak for the owner, so it is checked against those reviewers' live votes, not the owner's (queue-new #6, A57).
const FIRST_PERSON = /\b(?:I|we|my|our|me|us|mine)\b/i
const NAMED_APPROVED = /\b(?:has|have|had)\s+(?:already\s+|now\s+|just\s+)?(?:approved|signed[ -]?off)\b/i
const APPROVED_BY = /\b(?:approved|signed[ -]?off)\s+by\s+(.+)$/i
const PENDING = /\b(?:approvals?|sign[ -]?offs?)\b.*\b(?:is|are)\s+(?:still\s+)?(?:pending|outstanding|needed|required|missing)\b|\b(?:still\s+)?(?:needs?|waiting\s+(?:on|for)|awaiting)\b.*\b(?:approvals?|sign[ -]?offs?)\b/i
type Kind = { kind: 'named'; who: string } | { kind: 'pending' }
function othersSentence(sentence: string, owner: string): Kind | undefined {
	const line = sentence.replace(/[.!;]$/, '')
	if (FIRST_PERSON.test(line) || /^\W*(?:approved|LGTM)\b/i.test(line)) return undefined
	const named = NAMED_APPROVED.exec(line), by = APPROVED_BY.exec(line)
	const who = (named ? line.slice(0, named.index) : by?.[1] ?? '').replace(/[@*_]/g, ' ').trim()
	if (who) return owner && who.toLowerCase().includes(owner.toLowerCase()) ? undefined : { kind: 'named', who }
	return PENDING.test(line) && !/\bapproved\b/i.test(line) ? { kind: 'pending' } : undefined
}
// Every sentence about approval reports someone else's state; undefined when any of them speaks for the owner (today's strict path).
export function othersApproval(text: string, owner: string): Kind[] | undefined {
	const said = sentencesOf(text).filter(approvalMention)
	if (!said.length) return undefined
	const kinds = said.map(s => othersSentence(s, owner.trim()))
	return kinds.every((k): k is Kind => !!k) ? kinds : undefined
}
// Why the live PR does not support such a reply, or undefined when it does. The reviewer named closest before "has approved"
// (or right after "approved by") must have voted approve (5 or more); "still pending" needs an active PR still short of approval.
export function othersApprovalMismatch(kinds: Kind[], st: { status: string; votes: { name: string; vote: number }[] }, pr: number): string | undefined {
	for (const k of kinds) {
		if (k.kind === 'pending') {
			if (!/^active$/i.test(st.status)) return `PR ${pr} is ${st.status.toLowerCase()}, so no approval is pending`
			if (st.votes.length && st.votes.every(v => v.vote >= 5)) return `every reviewer on PR ${pr} has approved, so none is pending`
			continue
		}
		const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(w => w.length > 1)
		const said = words(k.who)
		const hits = st.votes.map(v => {
			const full = words(v.name), at = (() => { for (let i = said.length - 1; i >= 0; i--) if (full.includes(said[i])) return i; return -1 })()
			return { v, at }
		}).filter(h => h.at >= 0)
		const last = Math.max(-1, ...hits.map(h => h.at)), named = hits.filter(h => h.at === last)
		if (!named.length) return `the reply says "${k.who}" approved, but no reviewer by that name is on PR ${pr}`
		if (named.length > 1) return `the reply says "${k.who}" approved, but more than one reviewer on PR ${pr} matches that name`
		if (named[0].v.vote < 5) return `the reply says ${named[0].v.name} approved, but their vote on PR ${pr} is ${voteName(named[0].v.vote)}`
	}
	return undefined
}
// The vote the owner's own words say is already in place: 'approval' for "I approved it" or "LGTM", a vote value for
// "my vote is now Waiting for author"; undefined for a plan, a condition or a negation (bug 10-23 E35).
const VOTE_SAID: Record<string, number> = { approved: 10, approvedwithsuggestions: 5, waitingforauthor: -5, rejected: -10, novote: 0 }
export function claimedVote(text: string): number | 'approval' | undefined {
	let out: number | 'approval' | undefined
	for (const s of sentencesOf(text)) {
		if (/\b(?:not|never|until|unless|if|once|after|when|before|will)\b|n't\b|'ll\b/i.test(s)) continue
		const v = /\bmy vote (?:is|was set to|has been set to)\s+(?:now\s+)?["']?(approved with suggestions|approved|waiting for author|waitingforauthor|rejected|no vote|novote)\b/i.exec(s)
			?? /\b(?:I|we)(?:'ve|\s+have)?\s+(?:just\s+|now\s+|already\s+)?(?:voted|set my vote(?: on \S+(?: \d+)?)? to)\s+["']?(approved with suggestions|approved|waiting for author|waitingforauthor|rejected|no vote|novote)\b/i.exec(s)
		if (v) { out = VOTE_SAID[v[1].toLowerCase().replace(/\s+/g, '')]; continue }
		if (/\b(?:I|we)(?:'ve|\s+have)?\s+(?:just\s+|now\s+|already\s+)?(?:approved|signed[ -]?off)\b|^\W*(?:approved|LGTM)\b/i.test(s)) out ??= 'approval'
	}
	return out
}
export const claimsApproval = (text: string) => claimedVote(text) !== undefined
export const approvalAsk = (text: string) => approvalMention(text) && !reReviewAsk(text)
export const approvalOnly = (wf: Workflow) => {
	const k = wf.work
	if (!k || !/^(?:please\s+)?(?:review\s+(?:and|&)\s+)?(?:approve|sign[ -]?off)\s+(?:PR|pull request)\s*#?\s*\d{4,}[.!]?$/i.test(k.goal)) return false
	if (k.plan?.some(p => !p.done) || /\b(?:after|before|then|validat\w*|test\w*|deploy\w*|ship\w*|monitor\w*|rollback|config\w*|partner)\b/i.test(k.doneWhen)) return false
	const goal = linksIn(k.goal).filter(l => l.startsWith('pr:')), ask = linksIn(wf.lastAsk ?? '').filter(l => l.startsWith('pr:'))
	return new Set([...k.links.filter(l => /^pr:/i.test(l)), ...goal, ...ask].map(l => l.split(/[:/]/).at(-1))).size <= 1
}

export function pendingParts(store: Store, home: Workflow, except?: string): boolean {
	return (home.work?.parts ?? []).filter(id => id !== except).some(id => {
		const part = store.workflow(id)
		return part && (pendingEffects(part.effects).length > 0 || part.state !== 'done' && (part.pending.length || part.question || part.draft || part.state === 'running' || part.state === 'waiting_on_task' || active(part)))
	})
}

export function canCloseReport(store: Store, home: Workflow, reporter: Workflow): boolean {
	return !pendingParts(store, home, reporter.id) && (home === reporter || !home.pending.length && !pendingEffects(home.effects).length)
}

export function canCloseApproval(store: Store, home: Workflow): boolean {
	return approvalOnly(home) && approvalAsk(home.lastAsk ?? '') && !/\b(?:then|also|after|before|plus)\b|[;&]|\band\b(?!\s+approve)/i.test(home.lastAsk ?? '') && !pendingParts(store, home)
}

export function statusOf(wf: Workflow): string {
	const k = wf.work
	if (!k) return 'In progress'
	if (k.waitingOn) return `In progress: waiting on ${k.waitingOn.who}${k.waitingOn.where ? ` (${k.waitingOn.where})` : ''}`
	return k.next ? `In progress. Next: ${k.next.what}` : 'In progress'
}

export function closeWork(wf: Workflow, why: string) {
	if (!wf.work) return
	wf.work.closed = { at: new Date().toISOString(), why }
	wf.work.next = undefined
	wf.work.waitingOn = undefined
	step(wf, `Closed: ${why}`)
	newTurn(wf, !!wf.sent)
	Object.assign(wf, { state: 'done', status: `Closed: ${why}`, pending: [] })
}

// Open work with no news by its check date asks the owner what next (R-WRK-05).
export function due(wf: Workflow, now = Date.now()): boolean {
	return wf.state === 'open' && active(wf) && !!wf.work!.checkAt && Date.parse(wf.work!.checkAt) <= now
}
export function askWhatNext(wf: Workflow) {
	const k = wf.work!
	const since = k.steps.at(-1)?.at.slice(0, 10) ?? ''
	newTurn(wf, true)
	Object.assign(wf, {
		state: 'needs_human',
		status: `No news since ${since}`,
		question: `No news on "${k.goal}" since ${since}${k.waitingOn ? `; waiting on ${k.waitingOn.who}` : ''}. Answer "${wf.code}: nudge them" for a drafted follow-up, "wait ${wf.code}: 3d", or "close ${wf.code}".`,
	})
}
export function wait(wf: Workflow, days: number) {
	const k = wf.work!
	k.checkAt = new Date(Date.now() + days * DAY).toISOString()
	step(wf, `You chose to wait ${days} day${days === 1 ? '' : 's'}`)
	newTurn(wf, !!wf.sent)
	Object.assign(wf, { state: 'open', status: statusOf(wf), pending: [] })
}

// The item a message belongs to: the open work it names, else the sender's most recent (R-WRK-09).
export function named(items: Workflow[], text: string): Workflow | undefined {
	const ids = new Set(text.match(/\b\d{4,}\b/g) ?? [])
	return ids.size ? items.find(w => w.work?.links.some(l => ids.has(l.split(/[:/]/).at(-1)!))) : undefined
}

// A watch result for open work: a news step once per result, and the item runs so the worker decides the next step.
// The watch's own stop condition stops only the watch (review P0.2).
export function watchNews(wf: Workflow, r: Report, ref: string, first: boolean): boolean {
	if (!wf.work) return false
	if (r.done) step(wf, `Watch stopped: ${r.summary}`, { ref: `${ref}:done`, news: true })
	else if (first) { step(wf, r.summary, { ref }); return false }
	else if (!step(wf, r.summary, { ref, news: true })) return false
	wake(wf, `News: ${r.summary}`)
	return true
}
export function watchEnded(wf: Workflow, what: string) {
	step(wf, what)
	if (wf.state === 'open') askWhatNext(wf)
}
// News on an item: open work starts a new turn; a waiting draft is withdrawn and redrafted with it.
export function wake(wf: Workflow, status: string) {
	if (wf.state === 'waiting_on_task') return
	if (wf.state === 'open') newTurn(wf)
	Object.assign(wf, { state: 'running', status, approved: undefined, sendAt: undefined })
}
export function ownerStep(wf: Workflow, text: string, msgId: string, home = wf) {
	step(home, `${wf === home ? 'You wrote' : `You wrote to ${label(wf, home).replace(/: $/, '')}`}: ${text}`, { ref: `owner:${msgId}` })
	if (wf.state === 'waiting_on_task') return
	newTurn(wf, !!wf.sent)
	Object.assign(wf, { state: 'open', status: statusOf(home), pending: [] })
}
