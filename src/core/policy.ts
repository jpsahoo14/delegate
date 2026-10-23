import { pendingEffects } from './effects.ts'
import type { Confidence, Config, Job, Person, Rule, Source, Workflow } from './types.ts'

export function currentDraft(workflow: Workflow, job?: Job) {
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

// The first matching rule decides; every check that blocks an automatic send names its reason (R-POL-01).
export function decide(wf: Workflow, rules: Rule[], ctx: PolicyContext): Decision {
	const conf = confidence(wf.draft?.sources ?? [])
	const rule = rules.find(r => matches(r, wf, conf))
	const d = (action: Decision['action'], reason: string): Decision => ({ action, ruleId: rule?.id, reason, confidence: conf })
	if (wf.before) return d('draft', 'It came before setup; replies to older messages wait for you')
	if (wf.draft?.holding) return d('draft', 'A holding reply: the work is not finished, so it waits for you')
	if (ctx.never?.some(p => p.id === wf.asker?.id)) return d('draft', 'This person never gets automatic replies')
	if (wf.chat.id.startsWith('ch|')) return d('draft', 'Channel replies always wait for you')
	if (wf.correction) return d('draft', 'A correction always waits for you')
	if (wf.needsMe) return d('draft', 'You said this one needs you')
	if (wf.startedBy === 'room') return d('draft', 'It was sent to the whole chat; a reply there waits for you')
	if (wf.work || wf.partOf) return d('draft', 'Replies on open work always wait for you')
	if (wf.shareHold) return d('draft', wf.shareHold)
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

// Labeled content never goes to a chat that has, or may have, guests without the owner (R-SEC-08).
// An item Delegate closed without replying can be reopened by the owner's answer: "A40: this one is mine, review it" (dogfood 10-20).
export const reopenable = (wf: Workflow, verb: string) => wf.state === 'done' && verb === 'answer' && wf.kind !== 'tracker' && !wf.sent && !wf.work && !wf.redacted

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
