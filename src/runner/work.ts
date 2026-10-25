import { stateFields } from '../core/upgrades.ts'
import { clearHold } from '../core/owner-send.ts'
import type { PlanStep, Report, Step, Workflow, WorkReport } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { canonicalKey } from './jobs.ts'
import { isVote, pendingEffects, prIdOf, voteValue } from '../core/effects.ts'
import { approvalAsk, approvalOnly } from '../core/vote-claims.ts'
import { prTarget } from './probe.ts'
import { adoPrNumber, isNonAdoPrLink, linksIn, prMentions } from '../core/pr-refs.ts'
import { messageLink } from '../adapters/channels.ts'
import { leftActionText, leftPromise } from '../core/left-lines.ts'
import { clearLeft, mergeLeft, openLeft } from './left.ts'
export { openLeft } from './left.ts'
export { approvalMention, voteMention, approvalReplyMatches, reReviewAsk, othersApproval, othersApprovalMismatch, voteSentences, claimedVote, claimsApproval, approvalClaim, voteClaimGap, claimedPrs, approvalAsk, approvalOnly, type ApprovalClaim } from '../core/vote-claims.ts'
export { linksIn, prNumbersIn, isNonAdoPrLink } from '../core/pr-refs.ts'

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

const sameLink = (a: string, b: string) => a.split(':')[0].toLowerCase() === b.split(':')[0].toLowerCase() && a.split(/[:/]/).at(-1) === b.split(/[:/]/).at(-1)
// An item's own links: what its own asks name, and its PR job's key; never links its parts brought (queue-new #9).
export function askLinks(store: Store, w: Workflow): string[] {
	return [...new Set([w.lastAsk ?? '', ...store.thread(w.id).filter(m => !m.byOwner && w.msgIds.includes(m.id)).map(m => m.text)].flatMap(linksIn))]
}
export function ownLinks(store: Store, w: Workflow): string[] {
	const job = w.job ? store.job(w.job) : undefined, key = job ? canonicalKey(job.key) : ''
	return [...new Set([...askLinks(store, w), ...(/^pr:/i.test(key) ? [`pr:${key.split(/[:/]/).at(-1)}`] : [])])]
}
const prIds = (ls: string[]) => ls.filter(l => /^pr:/i.test(l)).map(l => l.split(/[:/]/).at(-1)!)
// Why an item may not join a home as its part, or undefined when they share a subject (queue-new #9): the same typed link, or the
// same chat and asker. Two items about different PRs never join; an AI join into a home whose own ask names no link is refused.
export function joinWhy(store: Store, home: Workflow, part: Workflow, ai = false): string | undefined {
	const own = ownLinks(store, home), goal = linksIn(home.work?.goal ?? '').filter(l => /^pr:/i.test(l))
	const mine = goal.length ? [...own.filter(l => !/^pr:/i.test(l)), ...goal] : own, theirs = ownLinks(store, part)
	const other = prIds(theirs).filter(id => !prIds(mine).includes(id))
	if (other.length) return `it is about PR ${other.join(', PR ')}, and ${home.code} is about ${prIds(mine).length ? `PR ${prIds(mine).join(', PR ')}` : 'no PR'}`
	const sameAsker = home.chat.id === part.chat.id && !!home.asker?.id && home.asker.id === part.asker?.id
	if (ai && !askLinks(store, home).length && !goal.length && !sameAsker) return `${home.code}'s own ask names no link`
	if (theirs.some(l => mine.some(x => sameLink(l, x))) || sameAsker) return undefined
	return mine.length ? `it names none of ${home.code}'s links` : `${home.code} has no link to share`
}
// The one active home whose own links the text names, about no other PR; none when it names none or several.
export function homeNamed(store: Store, homes: Workflow[], text: string): Workflow | undefined {
	const ls = linksIn(text)
	const hit = ls.length ? homes.filter(h => {
		if (!active(h) || h.partOf) return false
		const own = ownLinks(store, h)
		return own.some(l => ls.some(x => sameLink(l, x))) && prIds(ls).every(id => prIds(own).includes(id))
	}) : []
	return hit.length === 1 ? hit[0] : undefined
}
export function prJoinCandidates(store: Store, items: Workflow[], text: string): { prs: number[]; candidates: Workflow[] } {
	const urls = [...text.matchAll(/https?:\/\/[^\s<>]+/gi)].map(match => match[0].replace(/[.,;:!?'")\]]+$/, ''))
	const body = text.replace(/https?:\/\/[^\s<>]+/gi, ' ')
	const named = [...prMentions(body)].flatMap(match => match[1] && !/^pullrequest\//i.test(match[0]) ? [Number(match[1])] : [])
	const linked = urls.flatMap(url => {
		const id = adoPrNumber(url)
		return id === undefined ? [] : [id]
	})
	const prs = [...new Set([...named, ...linked].filter(id => Number.isSafeInteger(id) && id > 0))]
	const nonAdo = urls.some(url => {
		if (isNonAdoPrLink(url)) return true
		if (!URL.canParse(url)) return false
		const link = new URL(url), host = link.hostname.toLowerCase()
		return host !== 'dev.azure.com' && !host.endsWith('.visualstudio.com') && /\/pullrequest\/[1-9]\d*(?:\/|$)/i.test(link.pathname)
	})
	return { prs, candidates: prs.length || nonAdo ? items.filter(item => {
		const target = prTarget(store, item)
		return prs.length ? target !== undefined && prs.includes(target) : target === undefined
	}) : items }
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
	// A part never brings a second PR to a home that already has one (queue-new #9: one wrong join snowballed through its links).
	for (const l of w.links ?? []) { const key = canonicalKey(l); if (!k.links.includes(key) && !(from && /^pr:/i.test(key) && k.links.some(x => /^pr:/i.test(x) && !sameLink(x, key)))) k.links.push(key) }
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
	wf.statusReason = undefined; wf.reviewAgain = undefined; wf.returnedFrom = undefined; wf.leftRetry = undefined
	wf.ownerSend = undefined; clearHold(wf)
	wf.reviewRun = undefined; wf.reviewDone = undefined; wf.reviewAsk = undefined; wf.reviewAttempt = undefined; wf.reviewBasis = undefined
	wf.voteClaimRedrafted = undefined
	Object.assign(wf, { draft: undefined, prDraft: undefined, learnAfter: undefined, closeWorkAfterSend: undefined, choices: undefined, question: undefined, effects: undefined, promised: undefined, decision: undefined, approved: undefined, picked: undefined, sendAt: undefined, correction: undefined, todos: undefined, newCount: 0, ...(keepSent ? {} : { sent: undefined }) })
}

// When a reply goes out, what it promised the owner would do becomes theirs to keep, once per open text (R-NEX-07).
export function keepTodos(wf: Workflow, at: string, todos = wf.todos) {
	const msgId = wf.sent?.at === at ? wf.sent.msgId : wf.promise?.at === at ? wf.promise.msgId : undefined
	mergeLeft(wf, [...new Set(todos ?? [])].map(leftPromise), { kind: 'your-reply', at,
		...(msgId ? { href: messageLink(wf.chat.id, msgId) } : {}) })
	// Always set, even empty: an item with no kept list was written before N2, and only those are migrated (review N2 P2-2).
	wf.kept ??= []
}
export const openTodos = (wf: Workflow) => (wf.kept ?? []).filter(t => !t.done)
// "Mark done": the open to-dos on the item are done, or only those named (the ones the owner saw). Nothing else about the item changes.
export function doneTodos(wf: Workflow, at = new Date().toISOString(), only?: string[]): string[] {
	const open = openTodos(wf).filter(t => !only || only.includes(t.id))
	wf.kept = (wf.kept ?? []).map(t => (open.includes(t) ? { ...t, done: at } : t))
	const left = openLeft(wf).filter(line => !only || only.includes(line.id))
	clearLeft(wf, left.map(line => line.id), { at, by: 'owner', why: 'ticked' })
	return [...open.map(t => t.text), ...left.map(line => leftActionText(line.action))]
}

// A report with no response or decision: active work stays open, closed work is done.
export function settle(wf: Workflow, r: Report, home = wf): boolean {
	if (!home.work) return false
	if (r.reply || r.question || hasDecisions(r)) return false
	if (active(home)) { Object.assign(wf, { ...stateFields(wf, 'open'), status: r.summary || 'In progress', pending: [] }); return true }
	if (home.work.closed) { Object.assign(wf, { ...stateFields(wf, 'done'), status: `Closed: ${home.work.closed.why}`, pending: [] }); return true }
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
	if (!active(home)) { Object.assign(wf, { ...stateFields(wf, 'done'), status: `Closed: ${home.work.closed?.why ?? 'closed'}`, pending: [] }); return false }
	Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(home), pending: [] })
	return true
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
	wf.ownerSend = undefined; clearHold(wf)
	wf.work.closed = { at: new Date().toISOString(), why }
	wf.work.next = undefined
	wf.work.waitingOn = undefined
	step(wf, `Closed: ${why}`)
	newTurn(wf, !!wf.sent)
	Object.assign(wf, { ...stateFields(wf, 'done'), status: `Closed: ${why}`, pending: [] })
}

// Open work with no news by its check date asks the owner what next (R-WRK-05). Any message on it (the owner's reply, the awaited
// person's, anyone's in its chats) or a step is news: the check moves to that activity plus the interval, and never fires right
// after it (queue-new #13).
export const CHECK_DAYS = 3
export function lastActivity(store: Store, wf: Workflow): string | undefined {
	const parts = (wf.work?.parts ?? []).map(id => store.workflow(id)).filter((p): p is Workflow => !!p)
	return [wf.work?.steps.at(-1)?.at, ...[wf, ...parts].map(w => store.thread(w.id).at(-1)?.at)].filter((x): x is string => !!x).sort().at(-1)
}
export function due(wf: Workflow, now = Date.now(), store?: Store): boolean {
	if (!(wf.state === 'open' && active(wf) && !!wf.work!.checkAt && Date.parse(wf.work!.checkAt) <= now)) return false
	const last = store && lastActivity(store, wf)
	if (last && Date.parse(last) > now - CHECK_DAYS * DAY) {
		wf.work!.checkAt = new Date(Date.parse(last) + CHECK_DAYS * DAY).toISOString()
		store!.save(wf, false)
		return false
	}
	return true
}
export function askWhatNext(wf: Workflow, store?: Store) {
	const k = wf.work!
	const since = (store && lastActivity(store, wf) || k.steps.at(-1)?.at || '').slice(0, 10)
	newTurn(wf, true)
	Object.assign(wf, {
		...stateFields(wf, 'needs_human'),
		status: `No news since ${since}`,
		question: `No news on "${k.goal}" since ${since}${k.waitingOn ? `; waiting on ${k.waitingOn.who}` : ''}. Answer "${wf.code}: nudge them" for a drafted follow-up, "wait ${wf.code}: 3d", or "close ${wf.code}".`,
	})
}
export function wait(wf: Workflow, days: number) {
	const k = wf.work!
	k.checkAt = new Date(Date.now() + days * DAY).toISOString()
	step(wf, `You chose to wait ${days} day${days === 1 ? '' : 's'}`)
	newTurn(wf, !!wf.sent)
	Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(wf), pending: [] })
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
	Object.assign(wf, { ...stateFields(wf, 'running'), status, approved: undefined, sendAt: undefined })
}
export function ownerStep(wf: Workflow, text: string, msgId: string, home = wf) {
	step(home, `${wf === home ? 'You wrote' : `You wrote to ${label(wf, home).replace(/: $/, '')}`}: ${text}`, { ref: `owner:${msgId}` })
	// The owner's own message is news: no "no news" check right after it (queue-new #13).
	if (home.work && !home.work.closed) home.work.checkAt = new Date(Date.now() + CHECK_DAYS * DAY).toISOString()
	if (wf.state === 'waiting_on_task') return
	wf.ownerSend = undefined; clearHold(wf)
	newTurn(wf, !!wf.sent)
	Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(home), pending: [] })
}
