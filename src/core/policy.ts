import { shareHoldText } from './share.ts'
import { pendingEffects } from './effects.ts'
import type { Confidence, Config, Job, Person, Rule, Source, Workflow } from './types.ts'

export function currentDraft(workflow: Workflow, job?: Job) {
	if (workflow.ownerSend && (!workflow.sent || workflow.sent.at < workflow.ownerSend.at)) return workflow.draft ?? workflow.ownerSend.draft
	const endedWithoutReply = job && job.id === workflow.job && job.state === 'done' && job.purpose === 'work' && job.result && !job.result.reply &&
		(workflow.status === job.result.summary || workflow.status === `Nothing needed: ${job.result.summary}`) &&
		Date.parse(workflow.revAt ?? workflow.updatedAt) <= Date.parse(job.result.at ?? job.updatedAt)
	return endedWithoutReply ? undefined : workflow.draft
}

export const DEFAULT_POLICY = {
	delayMin: 15, undoMin: 10, maxAutoPerChatHour: 3,
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

export type Decision = { action: 'send' | 'ack' | 'draft' | 'ignore'; ruleId?: string; reason: string; confidence: Confidence }
export type PolicyContext = { autoSend: boolean; autoSendsThisHour: number; maxPerHour: number; never?: Person[]; held?: string[] }

// Sender groups cannot be detected from chat messages yet, so only rules that name accounts can match (R-RUL-04, R-RUL-07).
function matches(r: Rule, wf: Workflow, conf: Confidence): boolean {
	const who = !!wf.asker && !!r.who.accounts?.some(a => a.id === wf.asker!.id)
	if (!who) return false
	if (r.when.intent && r.when.intent !== wf.intent) return false
	// "direct": any one-to-one chat with these people, so a rule needs no chat ID found in advance (dogfood 10-19).
	if (r.when.chat === 'direct') { if (wf.chat.group || wf.chat.test || wf.chat.id.startsWith('ch|')) return false }
	else if (r.when.chat && r.when.chat !== wf.chat.id) return false
	return !r.when.minConfidence || RANK[conf] >= RANK[r.when.minConfidence]
}

// The first matching rule decides; every check that blocks an automatic send names its reason (R-POL-01). A drafting style
// learned from edits never decides: it would shadow a send, ack or ignore rule for the same people (edit habits guard).
export function decide(wf: Workflow, rules: Rule[], ctx: PolicyContext): Decision {
	const conf = confidence(wf.draft?.sources ?? [])
	const rule = rules.find(r => !r.style && matches(r, wf, conf))
	const d = (action: Decision['action'], reason: string): Decision => ({ action, ruleId: rule?.id, reason, confidence: conf })
	if (replyGap(wf.draft?.text)) return d('draft', REPLY_BLANK)
	if (wf.before) return d('draft', 'It came before setup; replies to older messages wait for you')
	if (wf.draft?.holding) return d('draft', 'A holding reply: the work is not finished, so it waits for you')
	if (ctx.never?.some(p => p.id === wf.asker?.id)) return d('draft', 'This person never gets automatic replies')
	if (wf.chat.id.startsWith('ch|')) return d('draft', 'Channel replies always wait for you')
	if (wf.correction) return d('draft', 'A correction always waits for you')
	if (wf.needsMe) return d('draft', 'You said this one needs you')
	if (wf.startedBy === 'room') return d('draft', 'It was sent to the whole chat; a reply there waits for you')
	if (wf.work || wf.partOf) return d('draft', 'Replies on open work always wait for you')
	if (wf.shareHold) return d('draft', shareHoldText(wf.shareHold)!)
	if (pendingEffects(wf.effects).length || wf.todos?.length || wf.follow) return d('draft', 'It promises changes, a follow-up, or something you must do')
	if (!rule) return d('draft', 'No rule covers this sender and ask')
	if (ctx.held?.includes(rule.id)) return d('draft', `Rule ${rule.id} is on hold: you said one of its replies was not needed`)
	if (rule.then === 'ignore') return d('ignore', `Rule ${rule.id}: ignore`)
	if (rule.then === 'draft') return d('draft', `Rule ${rule.id}: always draft`)
	if (rule.then === 'shortcut') return d('draft', `Rule ${rule.id}: shortcut actions arrive later`)
	if (!ctx.autoSend) return d('draft', 'Auto-send is off')
	if (ctx.autoSendsThisHour >= ctx.maxPerHour) return d('draft', `Already ${ctx.maxPerHour} automatic replies in this chat this hour`)
	if (rule.then === 'ack') return d('ack', `Rule ${rule.id}: acknowledge`)
	if (commits(wf)) return d('draft', 'It commits you to something')
	if (labeledToGuests(wf)) return d('draft', 'It quotes labeled content, and this chat has guests')
	if (wf.gaps?.length) return d('draft', `It could not read ${wf.gaps.join(', ')}`)
	if (wf.draft?.sources.some(s => s.tier === 'private')) return d('draft', 'It uses a private source')
	if (conf === 'low') return d('draft', 'Not enough evidence to send on its own')
	return d('send', `Rule ${rule.id}, confidence ${conf}`)
}

// Why a draft waits for the owner instead of going out by itself, in at most two plain parts (#33): the automatic-reply rule that
// didn't apply (and why), and the safety check that held it. A rule that would have sent it but for one check says so. Any one
// part alone makes it wait; the checks are the ones decide() and the send gate apply.
export function whyWaited(wf: Workflow, rules: Rule[], ctx: PolicyContext): string[] {
	const conf = confidence(wf.draft?.sources ?? [])
	const first = wf.asker?.name?.split(/\s+/)[0] || 'this person'
	const auto = rules.filter(r => !r.style && r.then !== 'ignore')
	const named = auto.filter(r => !!wf.asker && !!r.who.accounts?.some(a => a.id === wf.asker!.id))
	const rule = named.find(r => matches(r, wf, conf))
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
export function withMarker(text: string, marker: string, ownerName: string): string {
	const line = marker.replace('{first}', ownerName.split(/\s+/)[0])
	// A draft in the owner's voice may already end with their signature, copied from past replies: it is added once.
	const body = text.trimEnd().toLowerCase().endsWith(line.toLowerCase()) ? text.trimEnd().slice(0, -line.length).trimEnd() : text
	return `${body}\n\n${line}`
}
export const approvedReplyText = (text: string, workflow: Workflow, cfg: Config): string =>
	text && signsApproved(cfg) && !workflow.learnAfter && !workflow.draft?.byOwner ? withMarker(text, signatureOf(cfg), cfg.owner.name) : text

export function inQuietHours(now: Date, quiet = { from: '20:00', to: '08:00' }): boolean {
	const m = now.getHours() * 60 + now.getMinutes()
	const [f, t] = [quiet.from, quiet.to].map(s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm })
	return f <= t ? m >= f && m < t : m >= f || m < t
}
