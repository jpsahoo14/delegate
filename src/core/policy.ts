import { shareHoldText } from './share.ts'
import { pendingEffects, sameHead } from './effects.ts'
import type { Confidence, Config, Job, Person, Rule, Source, Workflow } from './types.ts'
import { voteMention } from './vote-claims.ts'
import { scrub } from './secrets.ts'
import { authorize, hourlyCap, MAX_AUTO_PER_CHAT_HOUR, type LimitId } from './limits.ts'
import { compareGrants } from './capabilities.ts'
import { grantConfirmed } from './rule-lines.ts'

export function currentDraft(workflow: Workflow, job?: Job) {
	if (workflow.ownerSend && (!workflow.sent || workflow.sent.at < workflow.ownerSend.at)) return workflow.draft ?? workflow.ownerSend.draft
	const endedWithoutReply = job && job.id === workflow.job && job.state === 'done' && job.purpose === 'work' && job.result && !job.result.reply &&
		(workflow.status === job.result.summary || workflow.status === `Nothing needed: ${job.result.summary}`) &&
		Date.parse(workflow.revAt ?? workflow.updatedAt) <= Date.parse(job.result.at ?? job.updatedAt)
	return endedWithoutReply ? undefined : workflow.draft
}

export const DEFAULT_POLICY = {
	delayMin: 15, undoMin: 10, maxAutoPerChatHour: MAX_AUTO_PER_CHAT_HOUR,
	marker: "(sent by {first}'s assistant)", ackText: 'Got it, {first} will get back to you.',
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

export const REPLY_BLANK = 'This reply still has a blank: fill it or edit'
export function replyGap(text: string | undefined): boolean {
	return !!text && /_{3,}|\b(?:XX|TODO|TBD)\b|\[(?:TBD|TODO|missing\b[^\]\n]*|unknown|insert\b[^\]\n]*|fill\b[^\]\n]*|your\b[^\]\n]*here)\]|(?:<|\{)\s*(?:\.{3}|\u2026|(?:insert|fill|missing|your)\b[^<>{}\n]*|name|location|date|time|answer|value|address|email|link|amount)\s*(?:>|\})|\{\{[^{}\n]+\}\}/.test(text)
}

// R-ANS-02: high = a card plus a live source, medium = a card only, low = no card. Inferred-only evidence counts one level lower.
export function confidence(sources: Source[]): Confidence {
	sources = sources.filter(s => !s.stale)
	const extracted = sources.filter(s => s.origin === 'extracted')
	const level = (s: Source[]) => (!s.some(x => x.tier === 'card') ? 0 : s.some(x => x.tier === 'live') ? 2 : 1)
	const n = extracted.length ? level(extracted) : Math.max(0, level(sources) - 1)
	return (['low', 'medium', 'high'] as const)[n]
}

export type Decision = { action: 'send' | 'ack' | 'draft' | 'ignore'; ruleId?: string; reason: string; confidence: Confidence; blockedBy?: LimitId }
export type PolicyContext = { autoSend: boolean; autoSendsThisHour: number; maxPerHour: number; never?: Person[]; held?: string[]; paused?: boolean; guests?: boolean; outsideAsker?: boolean }

export function authorizeReply(wf: Workflow, ctx: PolicyContext, text: string | undefined, automatic: boolean, outsideGrant = false) {
	const current = 'guests' in ctx ? { ...wf, chat: { ...wf.chat, guests: ctx.guests } } : wf
	return authorize({
		automatic, text, paused: ctx.paused, never: ctx.never?.some(p => p.id === wf.asker?.id),
		voteClaim: voteMention(text ?? ''), sharing: !!wf.shareHold || labeledToGuests(current),
		guests: current.chat.guests, outside: !!ctx.outsideAsker || outsideGrant,
		autoSendsThisHour: ctx.autoSendsThisHour, maxPerHour: ctx.maxPerHour, gap: replyGap(text),
	})
}

const internalGroup = (r: Rule, wf: Workflow) => !r.who.accounts?.length && r.who.group === 'org' && wf.chat.guests === false &&
	(r.then === 'review' || r.then === 'draft' || r.then === 'shortcut' || r.catalogVersion !== undefined)
function matchesScope(r: Rule, wf: Workflow, conf: Confidence): boolean {
	const who = !!wf.asker && (!!r.who.accounts?.some(a => a.id === wf.asker!.id) ||
		internalGroup(r, wf))
	if (!who) return false
	if (r.when.intent && r.when.intent !== wf.intent) return false
	// "direct": any one-to-one chat with these people, so a rule needs no chat ID found in advance (dogfood 10-19).
	if (r.when.chat === 'direct') { if (wf.chat.group || wf.chat.test || wf.chat.id.startsWith('ch|')) return false }
	else if (r.when.chat && r.when.chat !== wf.chat.id) return false
	if (r.when.reviewerGroup && !wf.prGroups?.some(g => groupName(g) === groupName(r.when.reviewerGroup!))) return false
	return r.then === 'review' || !r.when.minConfidence || RANK[conf] >= RANK[r.when.minConfidence]
}
const groupName = (name: string) => name.split('\\').at(-1)!.normalize('NFKC').trim().toLowerCase()
const inLane = (r: Rule, wf: Workflow, mode: 'reply' | 'result' = 'reply') => (mode === 'result' ?
	r.then !== 'review' && (r.then !== 'send' || !!r.when.results) :
	wf.intent === 'pr_review' ? r.then !== 'send' && r.then !== 'ack' : r.then !== 'review') &&
	(r.then !== 'review' || r.review?.comments === 'post' && r.review.reply === 'send')
export function ruleFor(wf: Workflow, rules: Rule[], conf = confidence(wf.draft?.sources ?? []), mode: 'reply' | 'result' = 'reply'): Rule | undefined {
	return rules.filter(r => !r.off && grantConfirmed(r) && !r.style && matchesScope(r, wf, conf) && inLane(r, wf, mode))
		.sort(compareGrants)[0]
}
export const reviewRuleFor = (wf: Workflow, rules: Rule[]) => {
	const rule = wf.intent === 'pr_review' ? ruleFor(wf, rules) : undefined
	return rule?.then === 'review' ? rule : undefined
}

// The strictest matching rule decides; every check that blocks an automatic send names its reason (R-POL-01). A drafting style
// learned from edits never decides: it would shadow a send, ack or ignore rule for the same people (edit habits guard).
export function decide(wf: Workflow, rules: Rule[], ctx: PolicyContext, mode: 'reply' | 'review-comments' | 'result' = 'reply'): Decision {
	const conf = confidence(wf.draft?.sources ?? [])
	const current = 'guests' in ctx ? { ...wf, chat: { ...wf.chat, guests: ctx.guests } } : wf
	const lane = mode === 'result' ? 'result' : 'reply'
	const rule = ruleFor(current, rules, conf, lane)
	const review = rule?.then === 'review' ? rule : undefined
	const reviewReply = !!review && !!wf.reviewBasis && wf.reviewBasis.pr === wf.reviewRun?.pr && sameHead(wf.reviewBasis.head, wf.reviewRun.head) &&
		wf.reviewRun.rule === review.id && (mode === 'review-comments' ? wf.reviewRun.phase === 'posting' :
		wf.reviewRun.phase === 'held' && wf.reviewRun.turn === wf.revAt && wf.reviewRun.sendText === wf.draft?.text && wf.reviewDone?.byRule === review.id && (wf.reviewDone.posted.length > 0 || wf.reviewDone.clean === true))
	const d = (action: Decision['action'], reason: string): Decision => ({ action, ruleId: rule?.id, reason, confidence: conf })
	if (!rule) {
		const pending = rules.filter(r => !r.style && !grantConfirmed(r) && matchesScope(r, current, conf) && inLane(r, current, lane)).sort(compareGrants)[0]
		if (pending) return { ...d('draft', `Waiting for your OK: "${pending.text}".`), ruleId: pending.id }
	}
	if (ctx.autoSend && rule && (rule.then === 'send' || rule.then === 'ack' || rule.then === 'review')) {
		const auth = authorizeReply(wf, ctx, wf.draft?.text, true, rule.who.group === 'outside')
		if (!auth.allowed) return { ...d('draft', auth.reason), blockedBy: auth.blockedBy }
	}
	if (replyGap(wf.draft?.text)) return d('draft', REPLY_BLANK)
	if (ctx.paused) return d('draft', 'Paused or stopped')
	if (wf.before) return d('draft', 'It came before setup; replies to older messages wait for you')
	if (wf.draft?.holding) return d('draft', 'A holding reply: the work is not finished, so it waits for you')
	if (ctx.never?.some(p => p.id === wf.asker?.id)) return d('draft', 'This person never gets automatic replies')
	if (wf.chat.id.startsWith('ch|')) return d('draft', 'Channel replies always wait for you')
	if (wf.correction) return d('draft', 'A correction always waits for you')
	if (wf.needsMe) return d('draft', 'You said this one needs you')
	if (wf.startedBy === 'room') return d('draft', 'It was sent to the whole chat; a reply there waits for you')
	if (mode !== 'result' && (wf.work || wf.partOf)) return d('draft', 'Replies on open work always wait for you')
	if (wf.shareHold) return d('draft', shareHoldText(wf.shareHold)!)
	if ((!reviewReply && pendingEffects(wf.effects).length) || wf.todos?.length || wf.follow) return d('draft', 'It promises changes, a follow-up, or something you must do')
	if (mode !== 'result' && wf.intent === 'pr_review' && !review && !rule) return d('draft', 'PR reviews wait for you; no review rule covers this.')
	if (review && wf.reviewRun?.phase === 'replied') return d('draft', 'The review reply was sent; approving stays yours.')
	if (voteMention(wf.draft?.text ?? '')) return d('draft', 'It speaks of an approval or a vote, so it waits for you')
	if (!rule) return d('draft', mode === 'result' ? 'No rule sends results in this chat' : 'No rule covers this sender and ask')
	if (ctx.held?.includes(rule.id)) return d('draft', `Rule ${rule.id} is on hold: you said one of its replies was not needed`)
	if (rule.then === 'ignore') return d('ignore', `Rule ${rule.id}: ignore`)
	if (rule.then === 'draft') return d('draft', `Rule ${rule.id}: always draft`)
	if (rule.then === 'shortcut') return d('draft', `Rule ${rule.id}: shortcut actions arrive later`)
	if (!ctx.autoSend) return d('draft', 'Auto-send is off')
	const cap = hourlyCap(ctx.maxPerHour)
	if (ctx.autoSendsThisHour >= cap) return d('draft', `Already ${cap} automatic replies in this chat this hour`)
	if (rule.then === 'ack') return d('ack', `Rule ${rule.id}: acknowledge`)
	if (commits(wf)) return d('draft', 'It commits you to something')
	if (labeledToGuests(wf)) return d('draft', 'It quotes labeled content, and this chat has guests')
	if (wf.gaps?.length) return d('draft', `It could not read ${wf.gaps.join(', ')}`)
	if (wf.draft?.sources.some(s => s.tier === 'private')) return d('draft', 'It uses a private source')
	if (review) return reviewReply ? d('send', `Review rule ${review.id}: posted comments and receipt-built reply`) : d('draft', 'The review comments must be posted before its rule can send a reply')
	if (conf === 'low') return d('draft', 'Not enough evidence to send on its own')
	return d('send', `Rule ${rule.id}, confidence ${conf}`)
}

// Why a draft waits for the owner instead of going out by itself, in at most two plain parts (#33): the automatic-reply rule that
// didn't apply (and why), and the safety check that held it. A rule that would have sent it but for one check says so. Any one
// part alone makes it wait; the checks are the ones decide() and the send gate apply.
export function whyWaited(wf: Workflow, rules: Rule[], ctx: PolicyContext): string[] {
	if ('guests' in ctx) wf = { ...wf, chat: { ...wf.chat, guests: ctx.guests } }
	const decision = decide(wf, rules, ctx)
	if (decision.blockedBy) return [decision.reason]
	if (decision.ruleId && !ruleFor(wf, rules)) return [decision.reason]
	if (wf.intent === 'pr_review') {
		const review = reviewRuleFor(wf, rules)
		if (ruleFor(wf, rules) && !review) return [decision.reason]
		const off = !review && reviewRuleFor(wf, rules.map(r => ({ ...r, off: undefined })))
		if (!review) return [off ? `Your PR review rule ${off.id} is off.` : 'PR reviews wait for you; no review rule covers this.']
		return decision.action === 'send' ? [] : [decision.reason]
	}
	const conf = confidence(wf.draft?.sources ?? [])
	const first = wf.asker?.name?.split(/\s+/)[0] || 'this person'
	const auto = rules.filter(r => !r.off && !r.style && r.then !== 'ignore')
	const named = auto.filter(r => !!wf.asker && (!!r.who.accounts?.some(a => a.id === wf.asker!.id) || internalGroup(r, wf)))
	const rule = ruleFor(wf, rules, conf)
	const chatOk = (r: Rule) => r.when.chat === 'direct' ? !(wf.chat.group || wf.chat.test || wf.chat.id.startsWith('ch|')) : !r.when.chat || r.when.chat === wf.chat.id
	const ruleLine = !named.length ? `no automatic-reply rule covers ${first}`
		: !rule ? (!named.some(chatOk) ? 'no automatic-reply rule covers this chat'
			: !named.some(r => chatOk(r) && (!r.when.intent || r.when.intent === wf.intent)) ? `your rule for ${first} covers other kinds of asks`
			: `your rule for ${first} needs more evidence than this draft has`)
		: ctx.held?.includes(rule.id) ? `your rule for ${first} is on hold`
		: rule.then === 'draft' || rule.then === 'shortcut' ? `your rule for ${first} says to always draft`
		: !ctx.autoSend ? 'automatic replies are off'
		: ctx.autoSendsThisHour >= ctx.maxPerHour ? `${ctx.maxPerHour} automatic replies already went to this chat this hour` : undefined
	const vote = pendingEffects(wf.effects).some(e => /pull_request_write/.test(e.call?.tool ?? '') && /vote/i.test(`${e.action} ${JSON.stringify(e.call?.args ?? {})}`))
	const gate = replyGap(wf.draft?.text) ? 'it still has a blank to fill'
		: vote ? 'a PR vote always waits for you'
		: wf.intent === 'pr_review' ? 'pull request review replies always wait for you'
		: voteMention(wf.draft?.text ?? '') ? 'it speaks of an approval or a vote, so it waits for you'
		: commits(wf) ? (wf.intent === 'pr_review' || /\bapprov/i.test(`${wf.lastAsk ?? ''} ${wf.draft?.text ?? ''}`) ? 'replies about PR approvals always wait for you' : 'it commits you to something (a date, an approval or ownership)')
		: wf.draft?.holding ? "the work didn't finish, so it's a holding reply"
		: wf.draft?.preview ? 'you edited it, so it waits for your ok'
		: wf.correction ? 'a correction always waits for you'
		: wf.before ? 'it came before setup'
		: ctx.never?.some(p => p.id === wf.asker?.id) ? `${first} never gets automatic replies`
		: wf.chat.id.startsWith('ch|') ? 'channel replies always wait for you'
		: wf.needsMe ? 'you said this one needs you'
		: wf.startedBy === 'room' ? 'it was asked of the whole chat'
		: wf.work || wf.partOf ? 'replies on open work always wait for you'
		: wf.shareHold ? shareHoldText(wf.shareHold)!.replace(/^Waiting for you: /, '').replace(/[.]$/, '').replace(/^./, c => c.toLowerCase())
		: pendingEffects(wf.effects).length || wf.todos?.length || wf.follow ? 'it promises changes, a follow-up, or something you must do'
		: labeledToGuests(wf) ? 'it quotes labeled content, and this chat has guests'
		: wf.gaps?.length ? `it could not read ${wf.gaps.join(', ')}`
		: wf.draft?.sources.some(s => s.tier === 'private') ? 'it uses a private source'
		: conf === 'low' ? 'there is not enough evidence for it to go on its own' : undefined
	// The rule matched and would have sent it: only the check held it.
	if (rule && !ruleLine) return gate ? [`your rule for ${first} would have sent it, but ${gate}`] : []
	return [ruleLine, gate].filter((s): s is string => !!s)
}

// Labeled content never goes to a chat that has, or may have, guests without the owner (R-SEC-08).
// An item Delegate closed without replying can be reopened by the owner's answer: "A40: this one is mine, review it" (dogfood 10-20).
// A holding reply is not the reply (#41): an item whose last send held can still be answered.
export const reopenable = (wf: Workflow, verb: string) => wf.state === 'done' && verb === 'answer' && wf.kind !== 'tracker' && (!wf.sent || !!wf.sent.holding) && !wf.work && !wf.redacted

export const labeledToGuests = (wf: Workflow): boolean => wf.chat.guests !== false && !!wf.draft?.sources.some(s => !!s.label && !/^(public|general|non-?business)$/i.test(s.label))

// A commitment holds if either the worker's flag or its intent says so: a contradictory report never sends (final review P1-4).
export const commits = (wf: Workflow): boolean => !!wf.draft?.commitment || wf.intent === 'commitment_decision'

// The owner's own signature, else the policy's marker. {first} is the owner's first name.
// Approved AI replies are signed when the owner asks, or by default once they wrote their own signature (bug 10-20: "(sent via AI)" was missing).
export const signsApproved = (cfg: Config) => cfg.signApproved ?? !!cfg.signature?.trim()
export const signatureOf = (cfg: Config) => cfg.signature?.trim() || cfg.policy?.marker || DEFAULT_POLICY.marker
export function withMarker(text: string, marker: string, ownerName: string, required = true): string {
	const line = marker.replace('{first}', ownerName.split(/\s+/)[0])
	let body = text.trimEnd()
	while (line.length && body.toLowerCase().endsWith(line.toLowerCase())) {
		const before = body.slice(0, -line.length)
		if (before && !/[\r\n]$/.test(before)) break
		body = before.trimEnd()
	}
	return required ? `${body}\n\n${line}` : body
}
export const approvedReplyText = (text: string, workflow: Workflow, cfg: Config): string =>
	text ? scrub(withMarker(text, signatureOf(cfg), cfg.owner.name, signsApproved(cfg) && !workflow.learnAfter && !workflow.draft?.byOwner)) : text

export function inQuietHours(now: Date, quiet = { from: '20:00', to: '08:00' }): boolean {
	const m = now.getHours() * 60 + now.getMinutes()
	const [f, t] = [quiet.from, quiet.to].map(s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm })
	return f <= t ? m >= f && m < t : m >= f || m < t
}
