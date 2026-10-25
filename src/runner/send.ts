import { outcome } from './habits.ts'
import { membersOf } from './sharing.ts'
import { active, afterSend, canCloseApproval, homeOf, inWork, keepTodos, linksIn, newTurn, approvalClaim, pendingParts, statusOf, step } from './work.ts'
import { claimsInvite, isInvite, isVote, OLD_INVITE, OLD_INVITE_ASK, pendingEffects, prIdOf, refusal, shown, voteValue } from '../core/effects.ts'
import type { Answer, Config, Effect, Person, Workflow } from '../core/types.ts'
import { sendGate } from '../core/gate.ts'
import { classify, htmlToText } from '../core/intake.ts'
import { mdToHtml } from '../core/format.ts'
import { authorizeReply, currentDraft, DEFAULT_POLICY, REPLY_BLANK, signatureOf, signsApproved, withMarker, reviewRuleFor, ruleFor } from '../core/policy.ts'
import { scrub } from '../core/secrets.ts'
import { authorize } from '../core/limits.ts'
import { automaticDecision, policyContext } from './autosend.ts'
import { effectResultLine, MARK } from '../core/render.ts'
import { placeOf } from '../web/model/place.ts'
import { SendUncertain, type SendOpts, type Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { close } from './intake.ts'
import { matchesOwnerDraft, ownReplyText, ownerReplies, OWNER_REPLY_UNCHECKED, rememberOwnerReply } from './owner-reply.ts'
import { realProcs } from './jobs.ts'

import { heldBy } from './owner.ts'
import { learnFrom, withdrawLearning } from './learn.ts'

import { kindOf } from './discover.ts'

import { askAtOf } from '../core/numbers.ts'
import { startFollow, startWatch, stopWatch } from './track.ts'
import { prRefOf, prTarget, type BuildProbe } from './probe.ts'

import { notePromise, promiseDue, rest } from './promise.ts'

import { PAGE_REPLY_CHANGED, pageAnswerRefusal, pageDigest } from '../core/page-approval.ts'

import { holdReplyGap } from './reply-gap.ts'
import { clearHold, clearVoteHold, holdDigest, holdReasons, reasonMessages, reviewDigest, reviewedReasons, setHoldReasons, voteHold } from '../core/owner-send.ts'
import { holdCheck, type Quick } from './send-holds.ts'
import { freshRead } from '../store/fs.ts'
import { recordCommit } from './commit.ts'
import { checkVoteClaims, voteClaimDigest, voteClaimReview } from './vote-claim.ts'
import { voteClaimText } from '../core/vote-claims.ts'
import { stateFields, statusFields } from '../core/upgrades.ts'
import { telemetryEvent } from '../core/telemetry.ts'
import { reply, closeFamily, only } from './apply.ts'

export function okSendGate(store: Store, cfg: Config, wf: Workflow, a: Answer): { refuse?: { text: string; refused: boolean }; voteChecks: string[] } {
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	let voteChecks: string[] = []
	if (a.surface === 'self' && !a.page && a.verb === 'ok') {
		const left = pendingEffects(wf.effects), omitted = left.filter(e => isVote(e.call) && !namesVote(a.text, e))
		if (omitted.length) {
			const keep = left.flatMap((e, i) => omitted.includes(e) ? [] : [i + 1])
			const removed = only(store, wf, keep.length ? keep : [0], 'self-chat-ok')
			if (typeof removed === 'string') return { refuse: { text: `${MARK} ${removed}`, refused: true }, voteChecks }
			voteChecks = omittedVoteChecks(wf)
			if (wf.ownerSend) wf.ownerSend.checks = [...new Set([...(wf.ownerSend.checks ?? []), ...voteChecks])]
			wf.status = voteChecks.join(' ')
			commit()
			store.log({ event: 'self-ok-votes-left-out', workflowId: wf.id, code: wf.code, prs: omitted.map(e => prIdOf(e.call)) })
			if (!wf.draft?.text && !pendingEffects(wf.effects).length) {
				if (wf.promise && wf.sent) rest(store, wf)
				wf.status = `Nothing was changed. ${voteChecks.join(' ')}`
				commit()
				return { refuse: { text: `${MARK} ${wf.status}`, refused: false }, voteChecks }
			}
		}
	}
	const denied = pendingEffects(wf.effects).map(effect => ({ effect, why: refusal(cfg, effect, prTarget(store, wf)) })).find(entry => entry.why)
	if (denied) {
		wf.status = `${shown(denied.effect).line} cannot be made: ${denied.why}.`
		// An old invite cannot be retried as it is: the owner is offered a new draft (legacy E16).
		if (denied.why!.startsWith(OLD_INVITE)) { wf.status += ' Nothing was created, and the reply was not sent.'; Object.assign(wf, { question: OLD_INVITE_ASK, questionHint: undefined, revAt: new Date().toISOString() }) }
		wf.statusReason = { kind: 'refused', text: wf.status, at: new Date().toISOString() }
		commit(); store.markShown([wf])
		return { refuse: { text: `${MARK} Not done ${wf.code}: ${wf.status} Nothing was changed.`, refused: true }, voteChecks }
	}
	return { voteChecks }
}

// The numbers are the order the changes are shown in: only those still to make.
// Returns why the numbers are refused, or the changes it left out.
export function namesVote(text: string | undefined, effect: Effect): boolean {
	const word = (text ?? '').trim().replace(/[.!]$/, '')
	if (/^vote$/i.test(word)) return true
	if (!/^[a-z][a-z _-]*$/i.test(word)) return false
	const value = voteValue({ tool: '', args: { vote: word } })
	return value !== undefined && value === voteValue(effect.call)
}

export function omittedVoteChecks(wf: Workflow): string[] {
	return [...new Set((wf.effects ?? []).filter(e => e.off && e.offReason === 'self-chat-ok' && isVote(e.call)).map(e => {
		const pr = prIdOf(e.call)
		return `Your vote${pr === undefined ? '' : ` on PR ${pr}`} wasn't cast: a plain ok never votes. Vote on the PR.`
	}))]
}

const norm = (t: string) => htmlToText(t).replace(/\s+/g, ' ').trim()
// The owner's words differ from what Delegate drafted, or it drafted nothing: they may promise something new (Slice 3).
const flat = (t: string) => t.replace(/\s+/g, ' ').trim()
export function ownWords(wf: Workflow, text: string): true | undefined {
	const theirs = wf.learnAfter?.draft ?? (wf.draft?.byOwner ? undefined : wf.draft?.text)
	return !theirs || flat(theirs) !== flat(text) ? true : undefined
}
// Letters and digits only: a post carries our text after the quote it answers, with tags and mentions in between (review 10-20 R1c).
const squash = (t: string) => norm(t).replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

export type SendBy = { answer?: Answer; ruleId?: string; replyDigest?: string; sendReview?: string; quick?: Quick }

export function markerFor(text: string, wf: Workflow, by: SendBy, cfg: Config): {
	text: string; applied: boolean; why: 'auto' | 'approved' | 'owner-edit' | 'owner-text' | 'off'
} {
	const marker = signatureOf(cfg), strip = (value: string) => withMarker(value, marker, cfg.owner.name, false)
	const body = strip(text)
	const why = by.ruleId ? 'auto'
		: wf.learnAfter ? 'owner-edit'
		: !wf.draft || wf.draft.byOwner || by.answer?.verb === 'send' && by.answer.text !== undefined ? 'owner-text'
		: norm(body) !== norm(strip(wf.draft.text)) ? 'owner-edit'
		: signsApproved(cfg) ? 'approved' : 'off'
	const applied = why === 'auto' || why === 'approved'
	return { text: withMarker(body, marker, cfg.owner.name, applied), applied, why }
}

export function rememberSend(store: Store, wf: Workflow) {
	if (!wf.draft) return
	const previous = wf.ownerSend?.askMsgId === wf.lastMsgId && pageDigest(wf.ownerSend.draft) === pageDigest(wf.draft) ? wf.ownerSend.checks : undefined
	const checks = [...new Set([...(previous ?? []), ...omittedVoteChecks(wf)])]
	wf.ownerSend = { draft: structuredClone(wf.draft), at: new Date().toISOString(), askMsgId: wf.lastMsgId, ...(checks.length ? { checks } : {}) }
	recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))(false)
}

export async function heldSend(store: Store, src: Source, wf: Workflow, a: Answer, options: Parameters<typeof holdCheck>[3] = {}): Promise<boolean> {
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	const previous = holdReasons(wf)
	const reviewed = reviewedReasons(wf, a.sendReview)
	const checked = await holdCheck(store, src, wf, options)
	if (checked.deleted) {
		close(wf, 'The message was deleted'); commit()
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${wf.asker?.name ?? 'they'} deleted the message.`)
		return true
	}
	// An incomplete source read cannot withdraw a stored hold the owner has not reviewed.
	const missing = previous.filter(reason => !reviewed.includes(reason.digest) && !checked.reasons.some(current => current.kind === reason.kind))
	if (missing.length) {
		checked.reasons.push(...missing.map(reason => ({ ...reason, digest: reviewDigest(wf, reasonMessages(reason)) })))
		setHoldReasons(wf, checked.reasons)
	}
	if (!checked.reasons.some(reason => !reviewed.includes(reason.digest))) return false
	const edited = checked.reasons.find(reason => reason.kind === 'ask-edited')
	const newer = checked.reasons.find(reason => reason.kind === 'asker-wrote-again')
	Object.assign(wf, { ...stateFields(wf, options.automatic && (edited || newer) ? 'running' : 'needs_human'), approved: undefined, sendAt: undefined,
		status: options.automatic && (edited || newer) ? 'The message changed. Redrafting.'
			: a.page && newer ? `Not sent: ${wf.asker?.name ?? 'They'} wrote again after you looked. Check and send again.`
			: 'Your approved draft is kept. Send anyway or Redraft.' })
	if (options.automatic && edited?.kind === 'ask-edited') { wf.lastAsk = edited.text; wf.pending = [edited.msgId] }
	if (options.automatic && newer?.kind === 'asker-wrote-again') { wf.lastAsk = newer.text; wf.pending = newer.msgIds ?? [newer.msgId] }
	commit()
	store.log({ event: 'owner-send-held', code: wf.code, kind: checked.reasons[0].kind, reasons: checked.reasons.map(r => r.kind) })
	const details = a.page ? '' : checked.reasons.map(reason => reason.kind === 'no-reply-needed' ? reason.why
		: reason.kind === 'ask-edited' ? `Before: ${reason.before}\nNow: ${reason.text}`
		: `${wf.asker?.name ?? 'They'} wrote:\n${reason.text}`).join('\n\n')
	const digest = holdDigest(checked.reasons)
	if (await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${wf.status}${details ? `\n\n${details}` : ''}`, true) && !a.page) {
		wf.holdNotice = { digest, at: new Date().toISOString() }
		commit(false)
	}
	return true
}

// What happened in the thread since the item's last ask: a newer ask from the asker, the owner's own reply, or our exact text.
export async function threadSince(store: Store, src: Source, cfg: Config, wf: Workflow, want: string, signed = false) {
	const fresh = await src.newMessages(wf.chat.id, wf.lastMsgId)
	const c = { ownerId: cfg.owner.id, ownerName: cfg.owner.name, aliases: cfg.aliases, test: wf.chat.test, group: !!wf.chat.group, sentIds: store.sentIds() }
	const openHere = store.openInChat(wf.chat.id)
	const claimed = new Set(openHere.filter(o => o.id !== wf.id).flatMap(o => o.msgIds))
	let asker: string | undefined, ours = false, ownerReplied = false, ownerAt: string | undefined, ownerUnknown = false, ownerExact = false
	const messages: { id: string; text: string; at: string }[] = []
	for (const m of fresh.msgs) {
		// Reconcile before sending: our earlier send may have landed even if we never recorded it (R-STO-06).
		// Checked before classify, which skips marked text.
		// Only a post never recorded can be ours landing late: another item's recorded reply, even with the same words, never counts (review 10-20).
		// Ending the same way counts only for a signed reply: the signature is in the post. Unsigned, only the exact text is ours.
		if (m.from?.id === cfg.owner.id && want && !c.sentIds.has(m.id) && (norm(m.body) === want || signed && squash(m.body).endsWith(squash(want)))) { ours = true; ownerAt ??= m.at; continue }
		const k = classify(m, c)
		if (k.kind === 'ask' && k.from.id === wf.asker?.id && !claimed.has(m.id)) {
			asker = m.id
			messages.push({ id: m.id, text: k.text, at: m.at })
		}
		if (k.kind !== 'owner') continue
		// A message open work already took as a step belongs to an earlier turn.
		if (homeOf(store, wf).work?.steps.some(s => s.ref === `owner:${m.id}`)) continue
		const replied = await ownerReplies(store, cfg, m, k.text, openHere, { ai: false })
		const ownText = ownReplyText(m, k.text)
		for (const item of openHere) rememberOwnerReply(store, item, { id: m.id, at: m.at, from: cfg.owner, text: k.text, byOwner: true }, replied.get(item.id), ownText)
		if (replied.get(wf.id)) { ownerReplied = true; ownerAt ??= m.at; ownerExact ||= matchesOwnerDraft(ownText, wf) }
		else if (!replied.has(wf.id)) ownerUnknown = true
	}
	return { asker, messages, ours, ownerReplied, ownerAt, ownerUnknown, ownerExact }
}

export function aboutPr(store: Store, wf: Workflow, text?: string): boolean {
	return !!prRefOf(store, wf) || wf.intent === 'pr_review' || linksIn([text ?? '', wf.lastAsk ?? '', ...store.thread(wf.id).filter(m => m.from.id === wf.asker?.id).map(m => m.text)].join('\n')).some(l => l.startsWith('pr:'))
}

export async function send(store: Store, src: Source, cfg: Config, wf: Workflow, text: string | undefined, by: SendBy, probe?: BuildProbe): Promise<boolean> {
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	const reviewReply = !!by.ruleId && wf.reviewRun?.rule === by.ruleId && !!wf.reviewDone
	if (!by.ruleId) rememberSend(store, wf)
	if (holdReplyGap(store, wf, text, !!by.ruleId)) {
		if (by.answer) await reply(store, src, by.answer, `${MARK} ${REPLY_BLANK}`, true)
		return false
	}
	if (!wf.ownerSend && wf.draft && !currentDraft(wf, wf.job ? store.job(wf.job) : undefined)) {
		wf.draft = undefined; wf.learnAfter = undefined; wf.approved = undefined; wf.sendAt = undefined
		commit()
		store.log({ event: 'stale-draft-refused', code: wf.code, reason: 'latest-work-result-has-no-reply' })
		await reply(store, src, by.answer ?? { id: '', code: wf.code, verb: 'ok', surface: 'chat', at: '' }, `${MARK} The latest turn proposes no reply. Nothing was sent.`, true)
		return false
	}
	const aboutPR = aboutPr(store, wf, text)
	// The owner's own typed words go as written; only one that says an approval is already made is checked against the PR,
	// and then held with why, never redrafted away (bug 10-23 E35).
	const owner = !by.ruleId && !!wf.draft?.byOwner && text === wf.draft.text
	const told = async (why: string) => { if (by.answer) await reply(store, src, by.answer, `${MARK} Not sent ${wf.code}: ${why}`, true) }
	// A reply may say the invite went only once it exists: one left out, failed or not made yet holds the reply (bug 10-23 E16).
	const unmadeInvite = (wf.effects ?? []).find(e => isInvite(e) && !e.done)
	if (unmadeInvite && claimsInvite(text ?? '')) {
		const why = `the reply says the invite was sent, but it has not been made${unmadeInvite.error ? ` (${unmadeInvite.error.slice(0, 120)})` : unmadeInvite.off ? ' (you left it out)' : ''}. Make the invite first with "ok ${wf.code}", or edit the reply.`
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, approved: undefined, ...statusFields('not-sent', `Not sent: ${why}`) })
		store.log({ event: 'invite-claim-held', workflowId: wf.id, code: wf.code })
		commit(); await told(why)
		return false
	}
	// The PR is read before a reply goes only when the reply CLAIMS a vote state: the owner's own approval or vote, or a named
	// reviewer's approval (#6). Withholding, conditional or future words claim nothing and go with no PR read (queue-new #12).
	const says = approvalClaim(text ?? '', cfg.owner.name)
	if (says !== 'none' && aboutPR) {
		const check = await checkVoteClaims(store, cfg, wf, text ?? '', owner, probe)
		if (check) {
			commit.refresh()
			const held = voteHold(wf), reviewed = by.answer?.sendReview ?? by.sendReview
			const override = !by.ruleId && check.canOverride !== false && (!by.answer || !!by.answer.page) && !!held && !held.automatic &&
				held.digest === voteClaimDigest(text ?? '', check) && reviewed === voteClaimReview(wf)
			if (override) {
				const stale = by.answer?.page && freshRead(() => pageAnswerRefusal(by.answer!, store.workflow(wf.id), undefined, undefined, cfg, undefined, wf.job ? store.job(wf.job) : undefined))
				if (stale) { await told(stale); return false }
				store.log({ event: 'vote-claim-override', code: wf.code, pr: check.pr, claim: check.claim, vote: check.vote })
			}
			else if (by.ruleId && !wf.voteClaimRedrafted && !wf.ownerSend) {
				clearVoteHold(wf)
				Object.assign(wf, { ...stateFields(wf, 'running'), draft: undefined, prDraft: undefined, sendAt: undefined, approved: undefined,
					voteClaimRedrafted: true, status: `The PR evidence does not support this reply (${check.why}). Redrafting.`,
					ownerAnswer: `Redraft the reply without claiming an unsupported vote: ${check.why}`, pending: wf.pending.length ? wf.pending : wf.msgIds.slice(-1) })
				store.log({ event: 'pr-reply-redraft', workflowId: wf.id, why: check.why })
				commit(); await told(wf.status)
				return false
			} else {
				const why = check.canOverride === false ? check.why : voteClaimText(check.pr, check.claim, text ?? '')
				Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, approved: undefined, status: `Not sent: ${why}`,
					statusReason: { kind: 'vote-claim', text: why, at: new Date().toISOString() },
					voteClaim: { ...check, digest: voteClaimDigest(text ?? '', check), automatic: !!by.ruleId || held?.automatic } })
				store.log({ event: 'pr-owner-claim-held', workflowId: wf.id, code: wf.code, pr: check.pr, vote: check.vote, claim: check.claim })
				commit(); await told(why)
				return false
			}
		}
	}
	// After approved changes the reply goes out later; the result goes back to where the owner said ok.
	const a = by.answer ?? { id: '', code: wf.code, verb: 'ok', surface: wf.answerSurface ?? 'chat', at: '', sendReview: by.sendReview } as Answer
	const p = { ...DEFAULT_POLICY, ...cfg.policy }
	const marker = text ? markerFor(text, wf, by, cfg) : undefined
	const rendered = marker?.text ?? text
	let out = rendered === undefined ? undefined : scrub(rendered)
	if (out !== text && holdReplyGap(store, wf, out, !!by.ruleId)) {
		if (by.answer) await reply(store, src, by.answer, `${MARK} ${REPLY_BLANK}`, true)
		return false
	}
	const replyDigest = by.replyDigest ?? wf.approved?.replyDigest
	if (replyDigest && pageDigest(out ?? '') !== replyDigest) {
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, approved: undefined, status: PAGE_REPLY_CHANGED })
		store.log({ event: 'page-reply-refused', code: wf.code, reason: 'reply-changed-after-changes' })
		commit()
		if (by.answer) await reply(store, src, by.answer, `${MARK} ${PAGE_REPLY_CHANGED}`, true)
		return false
	}
	if (heldBy(store, wf) === 'window') {
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: it is open in a window.`, true)
		return false
	}
	const { asker, messages, ours, ownerReplied, ownerAt, ownerUnknown, ownerExact } = await threadSince(store, src, cfg, wf, out ? norm(mdToHtml(out)) : '', !!out && out !== text)
	if (ownerUnknown && !ownerReplied && !ours) {
		store.log({ event: 'owner-reply-fallback', code: wf.code, byRule: by.ruleId, note: OWNER_REPLY_UNCHECKED })
	}
	if (ownerReplied) {
		if (inWork(store, wf)) { const home = homeOf(store, wf); Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(home), pending: [] }); step(home, `${wf === home ? '' : `${wf.code}: `}You replied in the chat yourself`); newTurn(wf, !!wf.sent); if (home !== wf) store.save(home) }
		else { const askAt = askAtOf(store.thread(wf.id), wf.msgIds); close(wf, ownerExact ? 'You sent it yourself' : 'You replied yourself'); wf.closedBy = 'replied'; commit(true, { askAt, replyAt: ownerAt }) }
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: you already replied in the chat.`)
		return false
	}
	const checked = !by.ruleId || a.page ? new Map<string, string | undefined>() : undefined
	if (!ours && await heldSend(store, src, wf, a, { messages, automatic: !!by.ruleId, quick: by.quick, checked })) return false
	// Every automatic send rechecks membership; a failed read must not reuse an earlier safe audience.
	if (by.ruleId) {
		await membersOf(store, src, wf.chat.id, true)
		wf.chat.guests = store.members()[wf.chat.id]?.guests
	}
	// A send answers one inbound ask: only a send that answered the newest one (or came after it) makes this reply a duplicate.
	// An earlier turn's send kept on the item never blocks a reply to a newer ask (bug 10-23 E34).
	const newest = store.thread(wf.id).filter(m => !m.byOwner && wf.msgIds.includes(m.id)).sort((x, y) => x.at.localeCompare(y.at)).at(-1)
	const sameOrLater = (a: string, b: string) => a === b || /^\d+$/.test(a) && /^\d+$/.test(b) && BigInt(a) >= BigInt(b)
	// A holding reply answered nothing yet: the full reply to the same ask still goes (#41).
	const answered = !!wf.sent && !wf.sent.holding && (!newest || (wf.sent.askMsgId ? sameOrLater(wf.sent.askMsgId, newest.id) : Date.parse(wf.sent.at) >= Date.parse(newest.at)))
	const gate = sendGate(wf, text, {
		paused: !!cfg.paused || store.control().paused, ownerApproved: !by.ruleId, draftOnly: !by.ruleId,
		newestThreadMsgId: asker ?? wf.lastMsgId, alreadyReplied: answered || ours, ruleAllows: !!by.ruleId,
	})
	if (!gate.send) {
		if (gate.rerun) Object.assign(wf, { ...stateFields(wf, 'running'), status: 'New messages arrived. Redrafting.' })
		if (ours) { const askAt = askAtOf(store.thread(wf.id), wf.msgIds); close(wf, 'You sent it yourself'); wf.closedBy = 'replied'; commit(true, { askAt, replyAt: ownerAt }) }
		if (by.ruleId && !gate.rerun && !ours) Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, ...statusFields('not-sent', `Not sent automatically: ${gate.reason}`) })
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${gate.reason}.`)
		return false
	}
	// Anyone in the chat the reply names with "@" is tagged, not only the asker (dogfood 10-20: "@Christian" stayed plain text).
	const named = /@\p{L}/u.test(out!) && (wf.chat.group || kindOf(wf.chat.id) !== 'oneOnOne') ? (await membersOf(store, src, wf.chat.id), store.members()[wf.chat.id]?.names) : undefined
	const beforeSend = new Date().toISOString()
	const ask = store.thread(wf.id).filter(message => !message.byOwner && message.at <= beforeSend && wf.msgIds.includes(message.id) && (!wf.asker || message.from.id === wf.asker.id))
		.sort((a, b) => a.at.localeCompare(b.at)).at(-1)
	let msgId: string
	if (by.ruleId) {
		const held = freshRead(() => {
			const latest = store.workflow(wf.id), currentCfg = store.config()
			const decision = latest && automaticDecision(store, currentCfg, latest)
			if (decision) wf.decision = decision
			if (!latest || latest.pending.length || latest.ownerSend || latest.draft?.text !== text ||
				decision?.action !== 'send' || decision.ruleId !== by.ruleId) return decision?.reason ?? 'The automatic reply changed'
			if (reviewReply || wf.reviewRun) {
				if (latest.state !== 'needs_human' || latest.reviewRun?.rule !== by.ruleId || latest.reviewRun?.sendText !== text ||
					reviewRuleFor(latest, store.rules())?.id !== by.ruleId) return 'The review reply changed'
			} else if (latest.state !== 'scheduled') return 'The automatic reply is no longer scheduled'
			const auth = authorizeReply(latest, policyContext(store, currentCfg, latest), out, true, ruleFor(latest, store.rules())?.who.group === 'outside')
			if (!auth.allowed) { wf.decision = { ...decision, action: 'draft', reason: auth.reason, blockedBy: auth.blockedBy }; return auth.reason }
			return undefined
		})
		if (held) {
			const latest = freshRead(() => store.workflow(wf.id))
			if (latest && latest.revAt === wf.revAt && latest.state === wf.state && !latest.ownerSend && !latest.pending.length) {
				Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, ...statusFields('not-sent', `Not sent automatically: ${held}`) })
				commit()
			}
			store.log({ event: reviewReply ? 'review-autoreply-held' : 'autosend-held', code: wf.code, byRule: by.ruleId, reason: held, blockedBy: wf.decision?.blockedBy })
			return false
		}
	} else out = authorize({ automatic: false, text: out }).text
	if (checked) {
		const until = Date.now() + 5000
		let stable = false
		while (Date.now() < until) {
			const judgments = checked.size
			const latest = await threadSince(store, src, cfg, wf, out ? norm(mdToHtml(out)) : '', !!out && out !== text)
			if (latest.ownerReplied || latest.ours) {
				if (inWork(store, wf)) {
					const home = homeOf(store, wf)
					Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(home), pending: [] })
					step(home, `${wf === home ? '' : `${wf.code}: `}You replied in the chat yourself`)
					newTurn(wf, !!wf.sent)
					if (home !== wf) store.save(home)
				} else {
					close(wf, latest.ownerExact || latest.ours ? 'You sent it yourself' : 'You replied yourself')
					wf.closedBy = 'replied'
				}
				commit(true, { askAt: askAtOf(store.thread(wf.id), wf.msgIds), replyAt: latest.ownerAt })
				await reply(store, src, a, `${MARK} Not sent ${wf.code}: you already replied in the chat.`)
				return false
			}
			if (await heldSend(store, src, wf, a, { messages: latest.messages, automatic: !!by.ruleId, quick: by.quick, checked })) return false
			if (Date.now() >= until) break
			if (checked.size === judgments) { stable = true; break }
		}
		if (!stable) {
			const why = "Delegate couldn't finish checking the chat in time. Check the chat and Send again."
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), approved: undefined, sendAt: undefined, ...statusFields('not-sent', `Not sent: ${why}`) })
			commit()
			store.log({ event: 'owner-send-held', code: wf.code, kind: 'thread-not-settled' })
			await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${why}`, true)
			return false
		}
	}
	try { ({ msgId } = await src.send(wf.chat.id, out!, replyContext(wf, out!, named, cfg.owner.id))) } catch (e) {
		if (!(e instanceof SendUncertain)) throw e
		// May have been posted: held for the owner, never sent again by a rule, a retry or a stale ok (bug 10-23 R4).
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, approved: undefined, ...statusFields('not-sure-sent', `Not sure it was sent; check Teams. Its answer was lost, and the chat did not show it yet. If it is there, skip ${wf.code}; if not, send it again.`) })
		store.log({ event: 'send-uncertain', workflowId: wf.id, code: wf.code, chat: wf.chat.id, byRule: by.ruleId, error: e.message.slice(0, 300) })
		commit()
		await reply(store, src, a, `${MARK} ${wf.code}: ${wf.status}`, true)
		return false
	}
	// Persist the send before anything else can fail, so a retry never sends twice.
	store.addSent(msgId, out!)
	// Edited: the words going out are the owner's, from an edit or their own text; a new draft drops the mark (R-NEX-11).
	// learnAfter is not proof: it is learning state, and a correction a rule sent leaves it set.
	const askAt = ask?.at, askMsgId = ask?.id, edited = !!wf.draft?.byOwner
	// Changes left out before this reply: removed by the owner, or dropped as no longer needed (a vote on a PR that closed). Either way the reply
	// counted on them and needed a second look, so it is not "handled as proposed" (R-NEX-11).
	// Every new draft replaces effects, so an off change here belongs to this reply's turn.
	const changesOff = (wf.effects ?? []).filter(e => e.off).length
	// A holding reply keeps the item open on its question, and the full answer is still owed (#41, PE 16:40).
	const holding = !!wf.draft?.holding
	wf.needsMe = undefined
	wf.statusReason = undefined; wf.reviewAgain = undefined
	const sendChecks = wf.ownerSend?.checks ?? []
	wf.ownerSend = undefined; clearHold(wf)
	wf.sent = { msgId, at: new Date().toISOString(), text, sendText: out !== text ? out : undefined, byRule: by.ruleId, undoUntil: new Date(Date.now() + p.undoMin * 60_000).toISOString(), ...(askMsgId ? { askMsgId } : {}), ...(sendChecks.length ? { checks: sendChecks } : {}), ...(holding ? { holding: true as const } : {}) }
	if (wf.approved) wf.approved.replyDigest = undefined
	commit(false)
	if (marker) store.log(telemetryEvent('marker', { code: wf.code, applied: marker.applied, why: marker.why }))
	if (reviewReply) store.addAuto(wf.chat.id, 'send')
	keepTodos(wf, wf.sent.at)
	const home = homeOf(store, wf)
	for (const check of sendChecks) {
		step(home, `Sent. ${check}`)
		store.log({ event: 'owner-send-history', workflowId: wf.id, code: wf.code, text: `Sent. ${check}` })
	}
	const first = (wf.asker?.name ?? 'them').split(/\s+/)[0]
	if (holding) Object.assign(wf, { ...stateFields(wf, 'needs_human'), question: wf.question ?? `What should the full reply to ${first} say?`, questionHint: wf.question != null ? wf.questionHint : undefined, approved: undefined, status: `Holding reply sent. ${first} is waiting for the full answer.` })
	else if (reviewReply) {
		if (wf.reviewRun?.rule === by.ruleId && wf.reviewDone && !wf.pending.length)
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), status: `PR ${wf.reviewDone.pr} waits for your approval`, approved: undefined })
	}
	else if (home.work) { afterSend(wf, out!, msgId, home, canCloseApproval(store, home), !home.pending.length && !pendingEffects(home.effects).length && !pendingParts(store, home, wf.id)); if (!active(home)) { stopWatch(store, home); closeFamily(store, realProcs, home, home.work.closed?.why ?? 'closed') } if (home !== wf) store.save(home) }
	else close(wf, by.ruleId ? `Sent by rule ${by.ruleId}: "${text!.slice(0, 70)}"` : `Sent: "${text!.slice(0, 80)}"`)
	// The owner's own words may promise what the draft did not: a short run checks, after the reply is out (Slice 3).
	if (promiseDue(store, wf, by)) notePromise(store, wf, text!)
	if (sendChecks.length) wf.status += ` ${sendChecks.join(' ')}`
	wf.sendAt = undefined
	wf.newCount = 0
	commit()
	store.log({ event: 'sent', workflowId: wf.id, code: wf.code, chat: wf.chat.id, asker: wf.asker, intent: wf.intent, unchanged: !by.ruleId && a.verb === 'ok' && !edited, v: 2, edited, ...(changesOff ? { changesOff } : {}), ...(wf.draft?.holding ? { holding: true } : {}), ...(askAt ? { askAt, askMsgId } : {}), msgId, approvedBy: by.ruleId ? `rule:${by.ruleId}` : 'owner', ...(by.ruleId ? { byRule: by.ruleId } : {}), surface: a.surface, verb: a.verb, text: out, draft: wf.learnAfter?.draft, sources: wf.draft?.sources ?? [], confidence: wf.decision?.confidence })
	outcome(store, wf, 'sent', { draft: wf.learnAfter?.draft ?? text, sent: text, approvedBy: by.ruleId ? `rule:${by.ruleId}` : 'owner', msgId })
	// A correction that went out teaches what the first reply got wrong, the same way an edit does.
	if (wf.correction) { wf.learnAfter = { draft: wf.correction.sent, sent: `${out}${wf.correction.note ? `\n(The owner's note: ${wf.correction.note})` : ''}` }; wf.correction = undefined }
	// The owner changed the draft before it went out: a short background run checks whether the facts changed (R-LRN-01).
	// The check-back the reply promised starts once the reply is out (B19).
	// On open work the watch belongs to the item itself: its news comes back here, with no second code (R-WRK-04).
	const watching = wf.follow && !wf.follow.code ? (active(home) ? startWatch(store, home, wf.follow) : startFollow(store, wf.follow)) : undefined
	if (watching && home !== wf) store.save(home)
	if (watching) { wf.follow = { ...wf.follow!, code: watching }; commit() }
	// A holding text is not the answer, so nothing is learned from it; the draft goes, and the full reply is drafted from the question.
	if (holding) { wf.learnAfter = undefined; wf.draft = undefined; commit() }
	if (wf.learnAfter && !by.ruleId) { learnFrom(store, cfg, wf, wf.learnAfter.draft, wf.learnAfter.sent); wf.learnAfter = undefined; commit() }
	const place = placeOf(store, wf.chat, wf.asker)
	if (!by.ruleId) await reply(store, src, a, `${MARK} ${!holding && wf.effects?.some(e => e.done && !e.off) ? effectResultLine(wf, 'done', '', place) : !holding && wf.effects?.some(e => e.off) && !omittedVoteChecks(wf).length ? effectResultLine(wf, 'reply-only', '', place) : `Sent ${holding ? 'the holding reply' : 'your reply'} to ${wf.asker?.name?.split(/\s+/)[0] ?? 'them'}${place ? ` in ${place.sentence}` : wf.chat.group ? ` in ${wf.chat.name}` : ''}.${holding ? ' It stays open for the full answer.' : ''}`}${sendChecks.length ? ` ${sendChecks.join(' ')}` : ''}${watching ? ` Watching ${wf.follow!.target} every ${wf.follow!.everyHours ?? 4} h as ${watching}; it stops after 7 days unless you extend it.` : ''}${wf.todos?.length ? ` Still yours to do: ${wf.todos.join('; ')}.` : ''}`)
	return true
}

// In a group or meeting chat the reply quotes the ask it answers and tags whoever asked, so it reads in context
// however many messages came in between. A 1:1 chat needs neither. Test chats use made-up people, who cannot be tagged.
export function replyContext(wf: Workflow, text = '', all: Record<string, string> = {}, ownerId = ''): SendOpts | undefined {
	const members = Object.fromEntries(Object.entries(all).filter(([id]) => id !== ownerId))
	if (!wf.chat.group && kindOf(wf.chat.id) === 'oneOnOne') return undefined
	const at = (n: string) => new RegExp(`@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text)
	const first = (n: string) => n.split(/\s+/)[0].toLowerCase()
	// A first name tags only when one person in the chat has it; two Chrises are left for the owner to tag.
	const tagged = Object.entries(members).filter(([, n]) => at(n) || (at(n.split(/\s+/)[0]) && Object.values(members).filter(m => first(m) === first(n)).length === 1)).map(([id, name]) => ({ id, name }))
	const people = [wf.asker, ...(wf.askers ?? []), ...tagged].filter((p, i, all): p is Person => !!p && all.findIndex(q => q?.id === p.id) === i)
	return {
		...(wf.lastAsk && wf.asker ? { replyTo: { name: wf.asker.name, text: wf.lastAsk } } : {}),
		mentions: people.filter(p => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id)).map(p => ({ id: p.id, name: p.name })),
	}
}

// Undo deletes a sent reply during its window, sent by a rule or approved by the owner, and turns the item back into a draft
// (R-POL-04; owner 10-21). A change already made, such as a vote, is not undone by it.
export async function undo(store: Store, src: Source, cfg: Config, wf: Workflow, a: Answer) {
	if (!wf.sent) return reply(store, src, a, `${MARK} ${wf.code} has not been sent. Nothing changed.`)
	if (Date.now() > Date.parse(wf.sent.undoUntil ?? '')) {
		return reply(store, src, a, `${MARK} The undo window for ${wf.code} has closed. To post a correction, say "send ${wf.code}: <text>".`)
	}
	// Some chats do not allow deleting (measured: meeting chats). Then the message is edited into a withdrawal note.
	const p = { ...DEFAULT_POLICY, ...cfg.policy }
	let how = 'deleted'
	try { await src.deleteMessage(wf.chat.id, wf.sent.msgId) } catch {
		try { await src.editMessage(wf.chat.id, wf.sent.msgId, withMarker('This message was withdrawn.', signatureOf(cfg), cfg.owner.name)); how = 'withdrawn' } catch (e) {
			store.log({ event: 'undo-failed', workflowId: wf.id, code: wf.code, error: String(e).slice(0, 200) })
			return reply(store, src, a, `${MARK} I could not undo ${wf.code}: Teams refused both delete and edit. To correct it, reply "edit ${wf.code}: <text>".`)
		}
	}
	store.log({ event: 'undo', workflowId: wf.id, code: wf.code, msgId: wf.sent.msgId, rule: wf.sent.byRule, how })
	withdrawLearning(store, cfg, wf.chat.id, wf.sent.msgId)
	const made = (wf.effects ?? []).filter(e => e.done)
	Object.assign(wf, { ...stateFields(wf, 'needs_human'), sent: undefined, status: 'Undone by you. The draft is kept.' })
	await reply(store, src, a, `${MARK} Undid ${wf.code} (message ${how}). It is back in your inbox as a draft.${made.length ? ` The ${made.length === 1 ? 'change it made stays' : `${made.length} changes it made stay`}: ${made.map(e => e.summary).join('; ')}.` : ''}`)
}
