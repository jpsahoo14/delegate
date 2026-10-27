import { okSendGate, ownWords, rememberSend, heldSend, threadSince, send, undo, undoAction } from './send.ts'
import { basename } from 'node:path'
export { send, replyContext, aboutPr, type SendBy } from './send.ts'
import { answerHabitResult, dismissKey, dismissSuggestion, outcome } from './habits.ts'

import { active, closeWork, doneTodos, homeOf, inWork, newTurn, openTodos, pendingParts, statusOf, step, wait } from './work.ts'
import { allows, changeClaim, deployBusyLeft, doLine, effectCapability, externalPending, INTERNAL_ACTIONS, isInternal, isInvite, isVote, OLD_INVITE, OLD_INVITE_ASK, pendingEffects, prIdOf, proposalEffects, refusal, refusedAsk, sameChange, sameProposal, shown, vet, voteValue } from '../core/effects.ts'
import { allowLeft, clearLeft, closeLeft, openLeft } from './left.ts'
import { leaveForYou } from './left-source.ts'
import { settingKey } from '../core/setting-keys.ts'
import { leftActionText } from '../core/left-lines.ts'
import { telemetryEvent } from '../core/telemetry.ts'
import { placeOf } from '../web/model/place.ts'
import { PAGE_CONTROL_VERBS, type Answer, type Change, type Config, type Effect, type UndoReceipt, type Workflow } from '../core/types.ts'

import { contentKey, htmlToText } from '../core/intake.ts'

import { REPLY_BLANK, signatureOf, withMarker, reopenable } from '../core/policy.ts'

import { authorize } from '../core/limits.ts'

import { effectLine, effectResultLine, MARK, plain, renderMore, renderPreview } from '../core/render.ts'
import { type Source } from '../adapters/source.ts'
import { BUSY, type Store } from '../store/state.ts'
import { amendAction } from '../store/actions.ts'
import { close, isControl, say } from './intake.ts'
import { OWNER_REPLY_UNCHECKED } from './owner-reply.ts'
import { approveEffects, cancelRetry, carry, executing, okRelay, realProcs, refreshReviewQuestions, requestOneMore, saveInternalReceipts, saveUnitReceipts, stopPromisedWatch, stopStatusText, stopTracker, withdraw, type Procs } from './jobs.ts'
import { openContinue } from './continue.ts'
import { heldBy, workflowJobIds } from './owner.ts'
import { bumpReviewEpoch, clearReviewRequests, resetUnitReview } from './pr-review-state.ts'

import { answerAutomation } from './automations.ts'
import type { Waiting } from '../core/waiting.ts'
import { kindOf } from './discover.ts'
import { ulid } from '../core/ids.ts'
import { chooseSession } from './session-policy.ts'
import { answerProposal, knowledgeOf, nextProposal } from './proposals.ts'
import { CMD, NAME } from '../brand.ts'
import { groupSelection, isReviewJob, MAY_REVIEW, readFailureReason, reviewerGroupMatches } from './review-gate.ts'
import { askAtOf } from '../core/numbers.ts'
import { FOLLOW_DAYS, stopWatch, watchCommand } from './track.ts'
import { adoProbe, prRefOf, probePRs, probePrUnits, prTarget, recheckDeploy, recheckPr, type BuildProbe } from './probe.ts'
import { deployRunning, isValidate, reportsResult, saysTested, testedAsk } from './validate.ts'
import { checkAgain, dropPromise, notePromise, reopenPromise, rest } from './promise.ts'
import { isDeploy } from '../core/deploy.ts'
import { effectConsent, pageAnswerRefusal, pageChangeId, pageDigest } from '../core/page-approval.ts'
import { pageManagementRev } from '../store/page-revision.ts'
import { holdReplyGap } from './reply-gap.ts'
import { clearHold, clearVoteHold, holdReasons, reasonMessages, restampReasons, reviewedReasons, voteHold } from '../core/owner-send.ts'
import { holdCheck, type Quick } from './send-holds.ts'
import { freshRead, readPhase } from '../store/fs.ts'
import { recordCommit } from './commit.ts'
import { readActions, undoableAction } from '../store/actions.ts'
import { voteClaimReview } from './vote-claim.ts'
import { scrub } from '../core/secrets.ts'
import { legacyEffectOrigins } from '../core/normalize-report.ts'
import { changeReason, internalReceipt, makeChange, makeInternalChanges, mcpCaller } from './change.ts'

import { stateFields, statusFields, WORKFLOW_SCHEMA } from '../core/upgrades.ts'

const suggestionScope = (effect: Effect) => dismissKey(effectCapability(effect), effect.target)
function selectionEffectKey(cfg: Config, effect: Effect): string {
	const args = effect.call?.args ?? {}
	const internal = INTERNAL_ACTIONS.safeParse(effect), target = effect.target.toLowerCase().split(':')[0]
	const kind = internal.success ? internal.data.action === 'check-back' ? 'item'
		: target === 'pr' || target === 'incident' ? target : target === 'workitem' ? 'work-item' : 'other'
		: isDeploy(effect.call) ? 'pipeline' : prIdOf(effect.call) !== undefined ? 'pr' : isInvite(effect) ? 'calendar'
		: 'incidentId' in args ? 'incident' : 'workItemId' in args || /work_item/i.test(effect.call?.tool ?? '') ? 'work-item'
		: 'chatId' in args ? 'chat' : 'userId' in args ? 'person' : 'other'
	// Only catalog/config names enter metadata; action arguments may be free text.
	const capability = internal.success ? effectCapability(effect)
		: changeClaim(effect)?.capability ?? cfg.agent.effectTools?.find(entry => effect.call && allows([entry], effect.call)) ?? 'unknown'
	return `${capability}:${kind}`
}

function legacySelection(wf: Workflow, answer: Answer) {
	if (answer.include !== undefined || !legacyEffectOrigins(wf) || !answer.except?.length && !answer.nums?.length) return undefined
	const pending = pendingEffects(wf.effects), slots = new Map<string, boolean[]>(), removed: Effect[] = []
	let kept = 0
	for (const [index, effect] of pending.entries()) {
		const keep = answer.except?.length ? !answer.except.includes(index + 1) : answer.nums?.includes(index + 1) === true
		const id = pageChangeId(effect), choices = slots.get(id) ?? []
		choices.push(keep); slots.set(id, choices)
		if (keep) kept++
		else removed.push(effect)
	}
	return { slots, removed, kept, refused: wf.statusReason?.kind === 'refused',
		offVote: !!wf.effects?.some(effect => effect.off && isVote(effect.call)) || removed.some(effect => isVote(effect.call)) }
}

function recordSelection(store: Store, cfg: Config, wf: Workflow, before: Effect[]) {
	const included = new Set(pendingEffects(wf.effects).map(pageChangeId))
	for (const effect of before) {
		if (!effect.origin || isVote(effect.call)) continue
		store.log(telemetryEvent(included.has(pageChangeId(effect)) ? 'wys-include' : 'wys-exclude',
			{ code: wf.code, effectKey: selectionEffectKey(cfg, effect), origin: effect.origin }))
	}
}

// Apply owner answers in time order. Effects run here and nowhere else.
export async function applyAnswers(store: Store, src: Source, cfg: Config, procs: Procs = realProcs, controlsOnly = false, probe?: BuildProbe, quick?: Quick): Promise<number> {
	let n = 0
	for (const { file, answer } of store.answers()) {
		const pageControl = (PAGE_CONTROL_VERBS as readonly string[]).includes(answer.verb)
		if (controlsOnly && !isControl(answer.verb) && !pageControl) continue
		const recordUndo = answer.verb === 'undo-action'
		const recordRequest = recordUndo && answer.text && answer.page ? { id: answer.text, rev: answer.page.expect } : undefined
		const wf = !recordUndo && answer.code ? freshRead(() => store.byCode(answer.code)) : undefined
		let undoReceipt: UndoReceipt | undefined
		try {
			const kp = !recordUndo && answer.code?.startsWith('K') ? store.proposal(answer.code) : undefined
			if (answer.page || recordUndo) {
				if (store.answered(answer.id)) { store.doneAnswer(file); continue }
				// Watching checks its own synced-state digest in the handler.
				const refusal = recordUndo && (answer.code !== '' || answer.surface !== 'panel' || !recordRequest)
					? 'Invalid action approval. Nothing was deleted. Open the current action first.'
					: pageControl ? undefined : pageAnswerRefusal(answer, wf, answer.code?.startsWith('R') ? store.automation(answer.code) : undefined, kp, cfg, answer.page?.kind === 'manage' ? pageManagementRev(store, answer.code ?? '') : undefined, wf?.job ? store.job(wf.job) : undefined)
				if (refusal) {
					await reply(store, src, answer, `${MARK} ${refusal}`, true)
					store.doneAnswer(file)
					store.log({ event: 'page-answer-refused', code: answer.code, verb: answer.verb, reason: refusal })
					n++
					continue
				}
			}
			// Workflow approvals pass their original selection to the revision-bound gate.
			if (answer.except?.length && !wf) {
				const total = kp ? kp.ops.length : 0
				answer.nums = Array.from({ length: total }, (_, i) => i + 1).filter(n => !answer.except!.includes(n))
				if (!answer.nums.length) answer.nums = [0]
			}
			// "A14: 2" on an item with options picks option 2.
			if (wf?.choices && answer.verb === 'answer' && /^\s*#?\d+(\s*,\s*#?\d+)*\s*$/.test(answer.text ?? '')) Object.assign(answer, { verb: 'pick', nums: answer.text!.match(/\d+/g)!.map(Number), text: undefined })
			const auto = answer.code?.startsWith('R') ? store.automation(answer.code) : undefined
			const wt = answer.code?.startsWith('W') ? store.waiting().find(w => w.code === answer.code) : undefined
			const hb = answer.code?.startsWith('H') ? store.habit(answer.code) : undefined
			if (recordRequest) {
				const result = await undoAction(store, src, cfg, recordRequest.id, recordRequest.rev)
				undoReceipt = { outcome: result.outcome, reason: result.ok ? undefined : result.reason, recorded: result.recorded }
				const text = result.ok ? result.warning : result.why, refused = result.outcome === 'refused'
				if (text) await reply(store, src, answer, `${MARK} ${text}`, refused, undoReceipt)
				else store.completePageSubmission(answer, undefined, refused, undoReceipt)
			}
			else if (hb) {
				const result = answerHabitResult(store, hb, answer.verb, answer.text)
				await reply(store, src, answer, `${MARK} ${result.ok ? result.text : result.why}`, !result.ok)
			}
			else if (wt) await reply(store, src, answer, `${MARK} ${await followUp(store, src, cfg, wt, answer)}`)
			else if (auto) await reply(store, src, answer, `${MARK} ${answerAutomation(store, auto, answer)}`)
			else if (isControl(answer.verb)) await control(store, src, answer, procs)
			else if (pageControl) await watching(store, src, answer, basename(file).slice(27, -5))
			// Knowledge proposals are not chat replies: their own handler, never the send path (review 01-04 entry condition).
			else if (kp) await reply(store, src, answer, plain(`${MARK} ${answerProposal(store, knowledgeOf(store, cfg), kp, answer)}${answer.verb === 'more' || answer.verb === 'undo' ? '' : `\n\n${nextProposal(store, kp.code, answer.surface === 'self' ? 6 : Infinity)}`}`).slice(0, 1800))
			else if (!wf) await reply(store, src, answer, `${MARK} I can't find item ${answer.code}.`)
			else await applyOne(store, src, cfg, wf, answer, procs, probe, quick)
		} catch (e) {
			const why = String(e).slice(0, 160)
			store.log({ event: 'answer-failed', code: answer.code, verb: answer.verb, error: String(e).slice(0, 300) })
			// A failed action stays on the item, with the owner's words, so it can be retried (review P1-8).
			if (wf && (answer.verb === 'ok' || answer.verb === 'send') && wf.state !== 'done') {
				if (answer.verb === 'send' && answer.text && wf.draft) wf.draft = { ...wf.draft, text: answer.text }
				Object.assign(wf, { ...stateFields(wf, 'needs_human'), status: `Could not send: ${why}. Reply "ok ${wf.code}" to retry` })
				store.save(wf)
			}
			await reply(store, src, answer, `${MARK} ${answer.verb} ${answer.code} failed: ${why}`, true)
		}
		store.doneAnswer(file)
		store.addOutcome(answer.id, '')
		store.completePageSubmission(answer, undefined, false, undoReceipt)
		store.log({ event: 'answer', workflowId: wf?.id, code: answer.code, verb: answer.verb, surface: answer.surface, text: answer.text })
		n++
	}
	return n
}

async function applyOne(store: Store, src: Source, cfg: Config, wf: Workflow, a: Answer, procs: Procs, probe?: BuildProbe, quick?: Quick) {
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	if (a.verb === 'pr-approve') {
		commit.refresh()
		const refused = (reason: string) => reply(store, src, a, `${MARK} ${reason} Nothing was approved or sent.`, true)
		const id = a.nums?.length === 1 ? a.nums[0] : undefined, units = wf.prs ?? []
		const unit = units.find(unit => unit.id === id)
		if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || units.length < 2 || !unit)
			return refused('Choose one PR from the current multi-PR item.')
		const jobId = unit.review?.completed?.job ?? unit.review?.run?.carrier ?? unit.job
		const ids = [...new Set([jobId, unit.job, unit.review?.run?.job, unit.review?.run?.carrier].filter((id): id is string => !!id))]
		if (wf.state === 'done' || wf.redacted || store.openWindow(wf.id) || wf.job && store.openWindow(wf.job) || ids.some(id => store.openWindow(id)))
			return refused('This item is closed or open elsewhere.')
		const jobs = ids.map(id => store.job(id)), itemJob = wf.job ? store.job(wf.job) : undefined
		if (wf.state === 'waiting_on_task' || unit.review?.run?.phase === 'posting' ||
			jobs.some(job => job && (executing(job) || job.state === 'running' || job.state === 'queued')) ||
			itemJob && (executing(itemJob) || itemJob.state === 'queued'))
			return refused(`PR ${id} is still working. Wait for its result.`)
		const control = store.control()
		if (control.paused || control.stopped)
			return reply(store, src, a, `${MARK} ${NAME} is paused, so PR ${id} wasn't approved. Resume it, then approve again.`, true)
		const consent = effectConsent(wf, { ...a, nums: undefined, include: [] })
		if (!consent.ok) return refused(consent.reason.replace(/ Nothing was sent or changed\.$/, ''))
		const matches = pendingEffects(wf.effects).filter(effect => pageChangeId(effect) === a.vote)
		const effect = matches.length === 1 ? matches[0] : undefined
		if (!effect || !isVote(effect.call) || prIdOf(effect.call) !== id || !((voteValue(effect.call) ?? 0) >= 5) || effect.error || effect.maybe || effect.off)
			return refused('The vote changed. Open the current item.')
		const job = jobId ? store.job(jobId) : undefined
		const indexes = job?.result?.effects.flatMap((candidate, index) =>
			pendingEffects([candidate]).length && isVote(candidate.call) && prIdOf(candidate.call) === id && sameProposal(candidate, effect) ? [index] : []) ?? []
		if (!job || !job.parents.includes(wf.id) || indexes.length !== 1) return refused('Open the current item.')
		const index = indexes[0], runId = ulid(), live = probe ?? adoProbe(cfg)
		let result: Awaited<ReturnType<typeof makeChange>> | undefined, record: Change | undefined, unreadable = false
		try {
			try {
				result = await readPhase(`change:${job.id}:${index}`, () => makeChange(store, job.id, runId, index, mcpCaller(cfg), live, wf))
			} catch (error) {
				result = { error: scrub(String(error)).slice(0, 300) }
				store.log({ event: 'vote-action-failed', workflowId: wf.id, job: job.id, runId, error: result.error })
			}
			try { record = store.changes(job.id, runId)[index] } catch (error) {
				unreadable = true
				store.log({ event: 'vote-receipt-read-failed', workflowId: wf.id, job: job.id, runId, error: scrub(String(error)).slice(0, 300) })
			}
			let movedHead = effect.head
			if (record?.stale && unit.ref && live?.pr) try {
				movedHead = (await live.pr(unit.ref.project, unit.ref.repo, unit.id)).head ?? movedHead
			} catch (error) {
				store.log({ event: 'pr-check-failed', pr: id, error: scrub(String(error)).slice(0, 120) })
			}
			commit.refresh()
			const stored = !record && result?.ref !== undefined ? store.job(job.id)?.result?.effects[index] : undefined
			const done = record?.state === 'done' ? { ref: record.ref, at: record.at } : stored && sameProposal(stored, effect) ? stored.done : undefined
			const noAnswer = unreadable || record?.state === 'calling'
			const error = noAnswer ? 'No answer from the tool, so it may have been made' :
				record?.state === 'failed' ? record.error ?? result?.error ?? 'The vote has no recorded failure reason' : result?.error ?? 'The vote has no recorded result'
			const folded: Effect = done ? { ...effect, done, error: undefined } : { ...effect, error }
			wf.effects = wf.effects?.map(current => pageChangeId(current) === a.vote ?
				done ? { ...current, done, error: undefined } : { ...current, error } : current)
			saveUnitReceipts(store, wf, [folded])
			if (record?.stale) {
				const current = wf.prs?.find(unit => unit.id === id)
				if (current && movedHead) { current.again = { head: movedHead, at: new Date().toISOString() }; bumpReviewEpoch(current) }
			}
			const home = homeOf(store, wf), made = !!folded.done
			const moved = step(home, made ? `Made: ${effect.summary.replace(/[.\s]+$/, '')}${folded.done?.ref && folded.done.ref !== 'done' ? ` (${folded.done.ref})` : ''}` :
				`Not made: ${effect.summary.replace(/[.\s]+$/, '')} (${(folded.error ?? 'it failed').replace(/^Error: /, '').replace(/\.$/, '').slice(0, 160)})`,
			{ ref: `change:${runId}:${index}` })
			if (moved && home !== wf) store.save(home)
			wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
			commit()
			const sentDraft = wf.sent && !wf.sent.holding && wf.sent.text !== undefined &&
				wf.sent.text === wf.draft?.text && wf.sent.askMsgId === wf.lastMsgId && !wf.pending.length
			const rest = wf.draft?.text && !sentDraft ? ' Your reply still waits for you to send it.' : ''
			const why = changeReason(folded.error ?? '')
			const text = made ? `PR ${id}: approved.` : record?.stale ? `PR ${id} changed since the review, so it wasn't approved.` :
				noAnswer ? `PR ${id} may already be approved: Azure DevOps didn't answer. Open the PR to check before approving again.` :
					`PR ${id} wasn't approved${why ? `: ${why}` : ''}.`
			return reply(store, src, a, `${MARK} ${text}${rest}`, !made)
		} finally {
			if (!probe && live?.close) try { await live.close() } catch (error) {
				store.log({ event: 'pr-reader-close-failed', workflowId: wf.id, error: scrub(String(error)).slice(0, 300) })
			}
		}
	}
	if (a.verb === 'pr-retry' || a.verb === 'pr-skip') {
		const id = a.nums?.length === 1 ? a.nums[0] : undefined
		const units = wf.prs ?? [], unit = units.find(unit => unit.id === id)
		if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !unit)
			return reply(store, src, a, `${MARK} Choose one PR from the current item. Nothing changed.`, true)
		if (wf.state === 'done' || wf.redacted || store.openWindow(wf.id) || wf.job && store.openWindow(wf.job))
			return reply(store, src, a, `${MARK} ${wf.code} is closed or open elsewhere. Nothing changed.`, true)
		if (a.seenAt !== undefined && wf.revAt && a.seenAt !== wf.revAt)
			return reply(store, src, a, `${MARK} This item changed. Open its current PR list.`, true)
		const jobIds = [...new Set([unit.job, unit.review?.run?.job, unit.review?.completed?.job]
			.filter((job): job is string => !!job))]
		if (jobIds.some(id => store.openWindow(id)))
			return reply(store, src, a, `${MARK} PR ${unit.id} is open in a window. Close it before changing this outcome.`, true)
		const jobs = jobIds.map(id => store.job(id)).filter(job => job !== undefined)
		if (unit.review?.run?.phase === 'posting' || jobs.some(job => executing(job) || job.state === 'running' || job.state === 'queued'))
			return reply(store, src, a, `${MARK} PR ${unit.id} is still working. Wait for its result.`, true)
		if (a.verb === 'pr-skip' ? unit.read !== 'gave-up' && !jobs.some(job => !!job.stopped) : unit.read !== 'failed' && unit.read !== 'gave-up')
			return reply(store, src, a, `${MARK} PR ${unit.id} no longer needs this read action. Open its current outcome.`, true)
		const live = a.verb === 'pr-retry' ? probe ?? adoProbe(cfg) : undefined
		if (a.verb === 'pr-retry' && !live?.pr)
			return reply(store, src, a, `${MARK} The PR reader isn't available. PR ${unit.id} was not checked and nothing changed.`, true)
		const at = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
		wf.prs = units.map(current => {
			if (current.id !== unit.id) return current
			const next: typeof current = a.verb === 'pr-skip'
				? { ...current, skip: { by: 'owner', why: 'owner', at } }
				: { ...current, read: 'pending', tries: 0, readAt: undefined, failure: undefined, failureKind: undefined, skip: undefined }
			bumpReviewEpoch(next)
			return next
		})
		if (a.verb === 'pr-skip' && jobs.some(job => !!job.stopped && wf.status === stopStatusText(job)) &&
			!(wf.job && store.job(wf.job)?.stopped) &&
			!wf.prs.some(current => !current.skip && current.job && store.job(current.job)?.stopped))
			wf.status = ''
		wf.reviewReply = undefined
		wf.approved = undefined
		wf.sendAt = undefined
		wf.revAt = at
		if (!wf.sent && !wf.ownerSend && !wf.draft?.byOwner) wf.draft = undefined
		commit()
		if (a.verb === 'pr-retry') {
			try { await probePrUnits(store, cfg, live, Date.now(), true, [wf], unit.id) }
			finally { if (!probe) await live?.close?.() }
			commit.refresh()
		}
		store.log({ event: a.verb, code: wf.code, pr: unit.id })
		if (a.verb === 'pr-skip')
			return reply(store, src, a, `${MARK} PR ${unit.id}: not reviewing: you skipped it. Nothing was sent or made.`)
		const current = wf.prs?.find(candidate => candidate.id === unit.id)
		if (!current) return reply(store, src, a, `${MARK} The PR list changed. Open the current item. Nothing was sent or made.`, true)
		const reason = readFailureReason(current.failureKind)
		const outcome = current?.read === 'ok' ? 'read again' : current?.read === 'failed' || current?.read === 'gave-up'
			? `couldn't read it${reason ? `: ${reason}` : ''}` : current?.skip?.why === 'no-link'
				? "there's no link to it, so Delegate can't open it" : "checking you're a reviewer"
		return reply(store, src, a, `${MARK} PR ${unit.id}: ${outcome}. Nothing was sent or made.`, current?.read !== 'ok')
	}
	if (a.verb === 'dont-suggest') {
		if (!a.key?.trim() || !a.label?.trim())
			return reply(store, src, a, `${MARK} Choose a current suggestion to turn down.`, true)
		const job = wf.job ? store.job(wf.job) : undefined
		if (heldBy(store, wf) === 'window' || wf.state === 'running' || wf.state === 'waiting_on_task' || job && (executing(job) || job.state === 'running'))
			return reply(store, src, a, `${MARK} ${wf.code} is still working or open in a window. Wait before turning down a suggestion.`, true)
		if (a.seenAt !== undefined && wf.revAt && a.seenAt !== wf.revAt)
			return reply(store, src, a, `${MARK} That suggestion changed. Open the current item.`, true)
		const pending = pendingEffects(wf.effects)
		const scope = pending.filter(effect => effect.origin === 'suggested' && suggestionScope(effect) === a.key)
		if (scope.some(effect => effect.maybe))
			return reply(store, src, a, `${MARK} A change in this scope may already have been made. Check it before turning down this suggestion.`, true)
		const effect = scope.find(effect => scrub(effect.summary) === a.label)
		if (!effect || effect.origin !== 'suggested')
			return reply(store, src, a, `${MARK} That suggestion changed or is no longer available. Open the current item.`, true)
		const dismissed = dismissSuggestion(store, a.key, a.at, scrub(effect.summary))
		if (!dismissed.ok) return reply(store, src, a, `${MARK} ${dismissed.why}`, true)
		const keep = pending.flatMap((effect, index) => scope.includes(effect) ? [] : [index + 1])
		const removed = only(store, wf, keep.length ? keep : [0])
		if (typeof removed === 'string') throw new Error(removed)
		commit()
		store.log(telemetryEvent('wys-dismiss', { code: wf.code, effectKey: selectionEffectKey(cfg, effect), origin: effect.origin }))
		return reply(store, src, a, `${MARK} Suggestion turned down.`)
	}
	if (wf.returnedFrom) { wf.returnedFrom = undefined; commit(false) }
	wf.answerSurface = a.surface
	if (a.verb === 'left-ask-again' || a.verb === 'left-draft-invite') {
		const line = openLeft(wf).find(item => item.id === a.text)
		if (!line) return reply(store, src, a, `${MARK} That Left-for-you line has changed or is already done. Open the current item.`, true)
		if (a.verb === 'left-draft-invite' && (line.type !== 'refusal' || line.kind !== 'old-invite'))
			return reply(store, src, a, `${MARK} That line is not an old invite. Nothing changed.`, true)
		if (wf.leftRetry?.id === line.id) return reply(store, src, a, `${MARK} That line is already queued for a new proposal. Nothing was sent.`)
		const job = wf.job ? store.job(wf.job) : undefined
		if (heldBy(store, wf) === 'window' || wf.state === 'running' || wf.state === 'waiting_on_task' || job && (executing(job) || job.state === 'running'))
			return reply(store, src, a, `${MARK} ${wf.code} is still working or open in a window. Wait before asking for another proposal.`, true)
		newTurn(wf, !!wf.sent)
		clearReviewRequests(wf)
		Object.assign(wf, { ...stateFields(wf, 'running'), job: undefined, needsMe: true, fyi: undefined, runFailed: undefined,
			promise: undefined, startedBy: undefined, intent: undefined,
			leftRetry: { id: line.id, at: new Date().toISOString() }, ownerAnswer: `Propose ${leftActionText(line.action)} again. Draft only; wait for my OK.`,
			pending: wf.msgIds.slice(-1), status: 'Preparing a new proposal for your OK' })
		commit()
		return reply(store, src, a, `${MARK} ${wf.code}: preparing a new proposal. Nothing is sent or made without your OK.`)
	}
	if (a.verb === 'answer' && /^send anyway[.!]?$/i.test(a.text?.trim() ?? '') && (holdReasons(wf).length || voteHold(wf))) {
		const vote = voteHold(wf)
		if (vote && (!a.page || vote.automatic || vote.canOverride === false)) return reply(store, src, a, `${MARK} Not sent ${wf.code}: ${wf.statusReason!.text}`, true)
		a = { ...a, verb: 'ok', text: undefined, sendReview: a.page ? a.sendReview : wf.holdNotice?.digest }
	}
	if (a.verb === 'answer' && /^add (?:the )?vote[.!]?$/i.test(a.text?.trim() ?? '')) {
		const ref = prRefOf(store, wf), vote = (wf.job ? store.job(wf.job)?.result?.voteRecommendation : undefined)?.vote
		if (!ref || !vote || vote === 'none') return reply(store, src, a, `${MARK} No vote was recommended for this PR. Nothing changed.`, true)
		const effect: Effect = { system: 'azure devops', action: 'vote', target: `PR ${ref.id}`, summary: `Vote ${vote} on PR ${ref.id}`,
			call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: ref.project, repositoryId: ref.repo, pullRequestId: ref.id, vote } } }
		if (wf.prRead) {
			const read: unknown = JSON.parse(wf.prRead)
			if (Array.isArray(read) && read[0] === ref.id && typeof read[2] === 'string') effect.head = read[2]
		}
		const why = refusal(cfg, effect, ref.id)
		if (why) return reply(store, src, a, `${MARK} Cannot offer that vote: ${why}. Nothing changed.`, true)
		const effects = proposalEffects([...(wf.effects ?? []).filter(e => !isVote(e.call) || e.done || e.off), effect], [wf])
		const busy = carry(store, cfg, wf, effects)
		if (busy) return reply(store, src, a, `${MARK} This review is ${busy === 'busy' ? 'still making approved changes' : 'shared with another item'}. Nothing changed.`, true)
		clearVoteHold(wf)
		Object.assign(wf, { effects, approved: undefined, sendAt: undefined, ...stateFields(wf, 'needs_human'),
			revAt: new Date().toISOString(), status: 'Vote added to the proposal. Review and approve it before anything is made or sent.' })
		commit(); store.markShown([wf])
		return reply(store, src, a, `${MARK} ${wf.status}`)
	}
	const cardAnswer = a.verb === 'answer' && /^(?:try again|redraft|add the vote|send anyway|review again)[.!]?$/i.test(a.text?.trim() ?? '')
	if (wf.questionOf && a.verb === 'answer' && !cardAnswer) {
		const target = wf.questionOf, unit = wf.prs?.find(unit => unit.id === target.pr && (unit.review?.completed?.job ?? unit.job) === target.job)
		const job = unit ? store.job(target.job) : undefined
		if (wf.state === 'done' || !unit?.requested || !job?.parents.includes(wf.id) || job.byRule || job.carrier ||
			job.purpose !== 'work' || !job.result?.question?.trim())
			return reply(store, src, a, `${MARK} That PR question changed. Open the current item. Nothing was sent or made.`, true)
		if (a.seenAt !== undefined && wf.revAt && a.seenAt !== wf.revAt)
			return reply(store, src, a, `${MARK} This question changed. Open the current item before answering.`, true)
		if (store.openWindow(wf.id) || [target.job, unit.job, unit.review?.run?.job].some(id => id && store.openWindow(id)))
			return reply(store, src, a, `${MARK} PR ${unit.id} is open in a window. Close it before answering.`, true)
		if (job.state === 'running' || job.state === 'queued')
			return reply(store, src, a, `${MARK} PR ${unit.id} is already working on your answer. Nothing changed.`, true)
		if (unit.review?.run?.phase === 'posting')
			return reply(store, src, a, `${MARK} PR ${unit.id} is still posting its review. Wait for those receipts before answering.`, true)
		if (!a.text?.trim())
			return reply(store, src, a, `${MARK} Give an answer to the question on PR ${unit.id}. Nothing changed.`, true)
		const saveJob = recordCommit(job, () => store.job(job.id), store.saveJob.bind(store))
		if (job.stopped) {
			const refusal = requestOneMore(store, cfg, wf, job, a.text)
			if (refusal) return reply(store, src, a, `${MARK} ${refusal}`, true)
		} else {
			job.asks.push(`Owner: ${a.text}`)
			Object.assign(job, { state: 'queued', purpose: 'work', retry: undefined, nextAt: undefined, error: undefined })
		}
		job.result = { ...job.result, question: undefined, questionHint: undefined }
		saveJob()
		unit.job = job.id
		resetUnitReview(unit)
		wf.questionOf = undefined
		wf.question = undefined
		wf.questionHint = undefined
		wf.reviewReply = undefined
		wf.sendAt = undefined
		wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
		Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), status: `Checking PR ${unit.id} again with your answer` })
		refreshReviewQuestions(store, wf)
		if (wf.questionOf && !workflowJobIds(wf).some(id => { const job = store.job(id); return job && executing(job) }))
			Object.assign(wf, stateFields(wf, 'needs_human'))
		commit()
		return reply(store, src, a, `${MARK} PR ${unit.id} is queued with your answer. Nothing was sent or made.`)
	}
	const retryStopped = a.verb === 'answer' && /^try again[.!]?$/i.test(a.text?.trim() ?? '')
	if (a.verb === 'one-more' || retryStopped) {
		const ids = wf.prs ? wf.prs.filter(unit => unit.requested && !unit.skip && !unit.decline).map(unit => unit.job) : [wf.job ?? wf.runFailed?.job]
		const stopped = [...new Set(ids)].flatMap(id => {
			const job = id ? store.job(id) : undefined
			return job?.stopped && job.parents.includes(wf.id) && !job.carrier && !job.byRule ? [job] : []
		})
		if (stopped.length || a.verb === 'one-more') {
			if (wf.state === 'done' || wf.redacted || stopped.length !== 1)
				return reply(store, src, a, `${MARK} ${stopped.length > 1 ? 'Several jobs are stopped. Give a new direction for one job instead.' : 'This item no longer has one stopped job. Open the current item.'}`, true)
			if (a.seenAt !== undefined && wf.revAt && a.seenAt !== wf.revAt)
				return reply(store, src, a, `${MARK} This item changed. Open its current stop before trying again.`, true)
			const job = stopped[0], refusal = requestOneMore(store, cfg, wf, job)
			if (refusal) return reply(store, src, a, `${MARK} ${refusal}`, true)
			Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), status: 'Queued one more AI run; nothing is sent',
				waitingSince: new Date().toISOString(), runFailed: undefined, statusReason: undefined, approved: undefined, sendAt: undefined })
			commit()
			return reply(store, src, a, `${MARK} Queued one more run for ${wf.code}. Nothing is sent.`)
		}
	}
	if (wf.groupAsk && !cardAnswer && (a.verb === 'answer' || a.verb === 'pick' && !wf.choices)) {
		const selected = groupSelection(wf.groupAsk, a.verb === 'pick' ? { nums: a.nums ?? [] } : { text: a.text })
		if (!selected) return reply(store, src, a, `${MARK} Say which groups you're in, or none.`)
		return groupAnswer(store, src, wf, a, selected, probe)
	}
	// "Try again" on a run that gave no result: the item runs once more, as it was (queue-new #11). A job that ran out of routes is
	// queued again with its tries reset and a fresh session, so it is not led by its own conclusion (#17 b).
	if (wf.runFailed && a.verb === 'answer' && /^\s*try again\s*$/i.test(a.text ?? '')) {
		store.log({ event: 'run-retried', code: wf.code, why: wf.runFailed.why, ...(wf.runFailed.job ? { job: wf.runFailed.job } : {}) })
		const job = wf.runFailed.job ? store.job(wf.runFailed.job) : undefined
		if (job) {
			Object.assign(job, { state: 'queued', purpose: 'work', retry: undefined, nextAt: undefined, error: undefined, run: undefined, session: { ...job.session, id: chooseSession('job', { fresh: true }) } })
			store.saveJob(job)
			Object.assign(wf, { job: job.id, ...stateFields(wf, 'waiting_on_task'), runFailed: undefined, statusReason: undefined, reviewAgain: undefined, question: undefined, questionHint: undefined, status: `Working: ${job.goal}`, waitingSince: new Date().toISOString() })
			commit()
			return reply(store, src, a, `${MARK} Trying ${wf.code} again. You'll see what it finds first.`)
		}
		Object.assign(wf, { ...stateFields(wf, 'running'), runFailed: undefined, statusReason: undefined, reviewAgain: undefined, question: undefined, questionHint: undefined, status: 'Trying again', pending: wf.pending.length ? wf.pending : wf.msgIds.slice(-1) })
		commit()
		return reply(store, src, a, `${MARK} Trying ${wf.code} again. You'll see the draft first.`)
	}
	// "watch A41" from the self-chat: the same as from the AI chat or the page.
	if (a.verb === 'watch') return reply(store, src, a, `${MARK} ${watchCommand(store, { code: wf.code, text: a.text }).text}`)
	if (a.verb === 'unwatch') {
		const blocked = stopPromisedWatch(store, procs, wf)
		return reply(store, src, a, `${MARK} ${blocked ?? `Stopped the check-back for ${wf.code}. Work and to-dos stay open. Nothing was sent.`}`, !!blocked)
	}
	if (a.verb === 'close' || a.verb === 'wait') return workVerb(store, src, wf, a, procs)
	// A candidate from the owner's own message: ok starts tracking it, skip drops it (R-WRK-11).
	if (wf.work?.proposed && wf.state === 'needs_human' && a.verb !== 'skip' && a.verb !== 'more' && a.verb !== 'ask') {
		if (a.verb !== 'ok' && a.verb !== 'answer') return reply(store, src, a, `${MARK} ${wf.code} asks whether to track work: "${wf.work.goal}". Say "ok ${wf.code}" to track it, or "skip ${wf.code}".`)
		if (a.verb === 'ok') {
			wf.work.proposed = undefined
			wf.work.checkAt = new Date(Date.now() + 3 * 86_400_000).toISOString()
			step(wf, 'You chose to track this')
			newTurn(wf)
			Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(wf), pending: [] })
			commit()
			return reply(store, src, a, `${MARK} Tracking ${wf.code}: ${wf.work.goal}. Messages about it in any chat come back to it.`)
		}
	}
	// Open work has no draft: its next reply starts from the owner's words or the next news (dev-spec/work.md).
	if (wf.state === 'open') {
		let canUndo = false
		if (a.verb === 'undo') {
			const now = Date.now(), sent = wf.sent
			const actions = readActions(store, { since: new Date(now - 30 * 86_400_000).toISOString() }).filter(action => action.item?.wf === wf.id)
			const recorded = sent && actions.find(action => action.parts.some(part => part.kind === 'message' && part.msgId === sent.msgId))
			const target = sent ? recorded : actions.find(action => undoableAction(action, now))
			const unconfirmed = sent?.byRule && actions.some(action => !action.completedAt && action.at <= sent.at &&
				action.because.kind === 'line' && action.because.grantId === sent.byRule)
			canUndo = target ? undoableAction(target, now) : !!sent && now < Date.parse(sent.undoUntil ?? '') && !unconfirmed
		}
		if ((a.verb === 'edit' || a.verb === 'send') && a.text) { newTurn(wf); Object.assign(wf, stateFields(wf, 'needs_human')) }
		else if (a.verb === 'answer') newTurn(wf)
		else if (['ok', 'pick', 'later', 'undo'].includes(a.verb) && !(a.verb === 'undo' && canUndo)) return reply(store, src, a, `${MARK} ${wf.code} is in progress (${wf.status}) and has no draft. Say "${wf.code}: what to do next", "wait ${wf.code}: 3d", or "close ${wf.code}".`)
	}
	// A holding reply is not the reply (#41): words after it are the full answer, never a correction of it.
	const replied = !!wf.sent && !wf.sent.holding
	if (wf.state === 'done' && a.verb === 'send' && replied && a.text) return correct(store, src, wf, a)
	if (wf.state === 'done' && a.verb === 'edit' && replied) return reply(store, src, a, `${MARK} ${wf.code} was already sent. To post a correction under it, say "send ${wf.code}: <text>".`)
	// Later is a hold: an automatic send waiting on its delay is cancelled too (final review P1-5).
	if (a.verb === 'later') {
		if (wf.state !== 'scheduled') return reply(store, src, a, `${MARK} Left ${wf.code} for later. It stays in your inbox.`)
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, status: 'Held for later by you' })
		commit()
		return reply(store, src, a, `${MARK} Held ${wf.code}: it will not send on its own. It stays in your inbox.`)
	}
	if (a.verb === 'continue') return openContinue(store, src, wf, a, procs)
	// ok on a watched thing means "got it": the update leaves the list, the watching goes on (design-spec S9).
	if (a.verb === 'ok' && wf.kind === 'tracker' && !pendingEffects(wf.effects).length && !wf.draft?.text && !wf.question) { wf.ackAt = new Date().toISOString(); commit(); return reply(store, src, a, `${MARK} Got it. Still watching ${wf.code}.`) }
	if (a.verb === 'wrong' || a.verb === 'incomplete' || a.verb === 'unneeded') return mark(store, src, cfg, wf, a, procs)
	if (a.verb === 'every' || a.verb === 'extend') return retune(store, src, wf, a)
	// A finished item can still be asked about: the answer runs in its own session and nothing is sent (dogfood: keep talking after the reply).
	// "Needs me" on a Catch up line: the FYI call was wrong. It is drafted for the owner, and the next run learns from it.
	if (a.verb === 'mine') {
		if (wf.state !== 'done' || !wf.fyi || wf.sent) return reply(store, src, a, `${MARK} ${wf.code} is not in Catch up, so nothing changed.`)
		store.log({ event: 'notfyi', workflowId: wf.id, code: wf.code, chat: wf.chat.id, asker: wf.asker, intent: wf.intent, ask: wf.lastAsk?.slice(0, 400), text: wf.fyi.line })
		Object.assign(wf, { ...stateFields(wf, 'running'), needsMe: true, fyi: undefined, intent: undefined, startedBy: wf.startedBy === 'room' ? undefined : wf.startedBy, status: 'Drafting: you said this one needs you' })
		commit()
		return reply(store, src, a, `${MARK} Drafting a reply to ${wf.asker?.name ?? 'them'} (${wf.code}). It waits for your ok.`)
	}
	if (reopenable(wf, a.verb)) Object.assign(wf, { ...stateFields(wf, 'needs_human'), startedBy: wf.startedBy === 'room' ? undefined : wf.startedBy, intent: undefined })
	if (wf.state === 'done' && a.verb !== 'more' && a.verb !== 'undo' && a.verb !== 'ask') return reply(store, src, a, `${MARK} ${wf.code} is already done: ${wf.status}`)
	// While its session is open in a window, the owner works there; nothing here acts on it (R-WF-07).
	if (a.verb !== 'more' && heldBy(store, wf) === 'window') return reply(store, src, a, `${MARK} ${wf.code} is open in a window. Close the window first.`, true)
	// An ok, or a send that also makes changes, older than the item's last change approves something the owner has not seen (review 01-04 P0, final review P0-1).
	const effectsLeft = (pendingEffects(wf.effects).length > 0)
	// seenAt "" means a text surface never displayed this item: the owner is shown it first (review 085 P0-1).
	if ((a.verb === 'ok' || ((a.verb === 'edit' || a.verb === 'send') && effectsLeft)) && a.seenAt !== undefined && wf.revAt && (a.seenAt === '' || a.seenAt < wf.revAt) && (wf.state === 'needs_human' || wf.state === 'scheduled')) {
		store.markShown([wf])
		// The owner's own words already went: only the change they promised is left, with no reply to show (Slice 3).
		if (replied && !wf.draft?.text && effectsLeft) return reply(store, src, a, `${MARK} Here it is first. Nothing was changed. You said you'd ${effectLine(pendingEffects(wf.effects))}; ok will ${effectLine(pendingEffects(wf.effects))}. Say ok ${wf.code}.`)
		if (a.seenAt === '') return reply(store, src, a, `${MARK} Here it is first. Nothing was sent. ${wf.asker?.name ?? 'They'} asked: "${(wf.lastAsk ?? '').slice(0, 200)}". ${effectsLeft ? `ok will ${effectLine(pendingEffects(wf.effects))}, then reply` : 'Reply'}: "${wf.draft?.text ?? ''}". Say ok ${wf.code}.`)
		return reply(store, src, a, `${MARK} This changed after you looked. Nothing was sent or changed. It will now ${effectsLeft ? `${effectLine(pendingEffects(wf.effects))}, then reply: "${wf.draft?.text ?? ''}"` : wf.draft?.text ? `reply: "${wf.draft.text}"` : `ask: ${wf.question ?? wf.status}`}. Say more ${wf.code} to see it.`)
	}
	// The owner's own words went out and a check of what they promised failed: ok runs it once more (Slice 3).
	if (a.verb === 'ok' && wf.promise?.state === 'failed' && !wf.draft?.text) { const r = checkAgain(store, wf); commit(); return reply(store, src, a, `${MARK} ${r}`) }
	// The reply already went and the change it promised waits: new words would be a second reply, so they wait until it is settled.
	if ((a.verb === 'send' || a.verb === 'edit') && a.text && replied && wf.promise?.state === 'offered') return reply(store, src, a, `${MARK} ${wf.code}'s reply already went to ${wf.asker?.name?.split(/\s+/)[0] ?? 'them'}. Say "ok ${wf.code}" to ${doLine(pendingEffects(wf.effects))}, or "skip ${wf.code}".`)
	if (a.verb === 'ok' && ((wf.prs?.length ?? 0) <= 1 ||
		a.include === undefined && a.vote === undefined && !a.nums?.length && !a.except?.length)) {
		const r = okRelay(store, wf)
		if (r) { commit(); return reply(store, src, a, `${MARK} ${r}`) }
	}
	// New words on an item with changes are a preview that shows the changes again, never an approval of both (next action).
	if (a.verb === 'send' && a.text && effectsLeft) a = { ...a, verb: 'edit' }
	switch (a.verb) {
		case 'skip': {
			const blocked = cancelRetry(store, procs, wf)
			if (blocked) return reply(store, src, a, `${MARK} ${blocked}`, true)
			wf.needsMe = undefined
			wf.ownerSend = undefined; clearHold(wf)
			// A skipped draft's edit never went out, so it is not carried to the next draft (R-NEX-11).
			wf.learnAfter = undefined
			if (wf.kind !== 'tracker' && wf.draft && !wf.sent) store.log({ event: 'skipped', workflowId: wf.id, code: wf.code, chat: wf.chat.id, intent: wf.intent, asker: wf.asker, ask: wf.lastAsk?.slice(0, 400), draft: wf.draft.text })
			if (wf.kind !== 'tracker' && wf.draft && !wf.sent) outcome(store, wf, 'skipped')
			withdraw(store, procs, wf)
			dropPromise(store, wf)
			// Skipping a reply on open work drops only that reply (R-WRK-08).
			if (inWork(store, wf)) { const home = homeOf(store, wf); step(home, `${wf === home ? '' : `${wf.code}: `}You skipped a reply`); newTurn(wf, !!wf.sent); Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(home), pending: [] }); if (home !== wf) store.save(home); break }
			closeLeft(wf)
			if (wf.kind === 'tracker') stopTracker(store, procs, wf)
			close(wf, wf.kind === 'tracker' ? 'Stopped watching' : 'Skipped by you')
			if (wf.kind !== 'tracker') wf.closedBy = 'skipped'
			break
		}
		case 'more':
			if (a.surface === 'self') { await say(store, src, plain(`${MARK} ${renderMore(wf, store.thread(wf.id), new Date(), placeOf(store, wf.chat, wf.asker))}`).slice(0, 1800)); store.markShown([wf]) }
			return
		case 'pick': {
			const r = pick(store, cfg, wf, a)
			if (r) return reply(store, src, a, `${MARK} ${r}`, true)
			// A ready option is a preview now; it is shown where the owner picked, so their ok approves exactly it.
			if (wf.state === 'needs_human') { commit(); store.markShown([wf]); return reply(store, src, a, renderPreview(wf)) }
			break
		}
		case 'ask':
			// A question to Delegate about the item: answered in its own session, shown in the card, never sent (design-spec S12).
			wf.notes = [...(wf.notes ?? []), { q: a.text!, at: new Date().toISOString() }]
			commit()
			return reply(store, src, a, `${MARK} Asking about ${wf.code}. The answer comes back here; nothing is sent to ${wf.asker?.name ?? 'anyone'}.`)
		case 'answer':
			if (/^redraft[.!]?$/i.test(a.text?.trim() ?? '')) {
				const messages = holdReasons(wf).flatMap(reasonMessages), thread = store.thread(wf.id)
				for (const message of messages) if (!thread.some(m => m.id === message.id) && wf.asker)
					thread.push({ ...message, from: wf.asker, byOwner: false, contentKey: contentKey(message.text) })
				const newest = messages.at(-1)
				if (newest) {
					store.saveThread(wf.id, thread)
					wf.lastAsk = newest.text; wf.lastMsgId = newest.id
					wf.msgIds = [...new Set([...wf.msgIds, ...messages.map(m => m.id)])]; wf.pending = messages.map(m => m.id)
				}
			}
			wf.ownerSend = undefined; clearHold(wf)
			withdraw(store, procs, wf)
			// The reply already went and its promised change waits, or its check failed: the owner's answer is a new turn, whose own
			// reply can go; the promise is checked again once it rests (re-review P1-1, P1-2).
			if (wf.sent) reopenPromise(store, wf)
			// A tracker's question goes back to its own job, not to the reply worker.
			if (wf.kind === 'tracker' && wf.job && store.job(wf.job)) {
				const job = store.job(wf.job)!
				if (job.stopped) {
					const refusal = requestOneMore(store, cfg, wf, job, a.text)
					if (refusal) return reply(store, src, a, `${MARK} ${refusal}`, true)
				}
				// A live check keeps running; the answer is picked up by one more run right after it (tester 06-07 P1-3).
				else Object.assign(job, { asks: [...job.asks, `Owner: ${a.text}`], ...(job.state === 'running' ? {} : { state: 'queued', purpose: 'work' }) })
				store.saveJob(job)
				Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), statusReason: undefined, reviewAgain: undefined, question: undefined, questionHint: undefined, status: 'Checking again with your answer', waitingSince: new Date().toISOString() })
				break
			}
			// "tested" (or a time window), or a result from Report, on validate work: its job reads the results for that window and drafts
			// the report, held for ok (owned work, R-NEX-05).
			if (wf.job && store.job(wf.job) && isValidate(store.job(wf.job), wf) && (saysTested(a.text) || reportsResult(a.text))) {
				const job = store.job(wf.job)!
				if (job.stopped) {
					const refusal = requestOneMore(store, cfg, wf, job, testedAsk(homeOf(store, wf), a.text!))
					if (refusal) return reply(store, src, a, `${MARK} ${refusal}`, true)
				} else Object.assign(job, { asks: [...job.asks, testedAsk(homeOf(store, wf), a.text!)], ...(job.state === 'running' ? {} : { state: 'queued', purpose: 'work', error: undefined }) })
				store.saveJob(job)
				Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), statusReason: undefined, reviewAgain: undefined, question: undefined, questionHint: undefined, status: 'Reading the results of your test and drafting the report', waitingSince: new Date().toISOString() })
				break
			}
			clearReviewRequests(wf)
			Object.assign(wf, { ownerAnswer: a.text, ...stateFields(wf, 'running'), statusReason: undefined, reviewAgain: undefined, status: 'Redrafting with your answer' })
			store.addOutcome(a.id, 'Redrafting with your answer')
			store.completePageSubmission(a, 'Redrafting with your answer')
			break
		case 'edit': {
			// edit changes the draft and shows it; only ok or send makes it go out (persona test P0).
			if (wf.state === 'waiting_on_task' || wf.state === 'running') return reply(store, src, a, `${MARK} ${wf.code} is still working. I'll show the draft first.`)
			const original = wf.learnAfter?.draft ?? wf.draft?.text
			wf.ownerSend = undefined; clearHold(wf)
			// An edit is never approved: a scheduled automatic send is cancelled and waits for ok (final review P0-3).
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), sendAt: undefined, approved: undefined, runFailed: undefined, statusReason: undefined, reviewAgain: undefined, draft: { ...(wf.draft ?? { commitment: false, sources: [] }), text: a.text!, preview: true, byOwner: true, ownWords: ownWords(wf, a.text!) }, question: undefined, questionHint: undefined, revAt: new Date().toISOString(), status: 'Edited by you', learnAfter: original ? { draft: original, sent: a.text! } : undefined })
			commit()
			store.markShown([wf])
			const left = pendingEffects(wf.effects)
			return reply(store, src, a, `${MARK} Updated your reply: "${a.text}". Nothing sent. ${left.length ? `ok will also ${effectLine(left)}. Say ok ${wf.code} for both, or ok ${wf.code} except ${left.map((_, i) => i + 1).join(' ')} to send only the reply.` : `Say ok ${wf.code} to send it.`}`)
		}
		case 'ok':
			if (holdReplyGap(store, wf, wf.draft?.text)) return reply(store, src, a, `${MARK} ${REPLY_BLANK}`, true)
			// ok approves the draft the owner saw; a rewrite in progress has no such draft yet (review P1-1).
			// A draft with a blank or an open question is not ready to send (persona test P0).
			// The page's own Send, on the exact card the owner saw, sends the draft with a question still open (card state rules 10-11, #34);
			// a typed ok still waits for the answer, unless the draft is a holding reply, which is meant to go while the question is open (#41).
			if (wf.state === 'needs_human' && wf.question && !a.page && !wf.draft?.holding) return reply(store, src, a, `${MARK} ${wf.code} is not ready: ${wf.question}. Reply "${wf.code}: your answer", and I'll show the new draft.`)
			if (wf.state === 'running') return reply(store, src, a, `${MARK} ${wf.code} is being rewritten with your answer. I'll show the new draft first.`)
		// falls through
		case 'send': {
			if (wf.state === 'waiting_on_task') return reply(store, src, a, `${MARK} ${wf.code} is still working. I'll show the result first.`)
			const before = pendingEffects(wf.effects), legacy = legacySelection(wf, a)
			const { refuse, voteChecks } = okSendGate(store, cfg, wf, a)
			if (!refuse || !refuse.refused) recordSelection(store, cfg, wf, before)
			if (refuse) return reply(store, src, a, refuse.text, refuse.refused)
			// The owner's own words: learned from once they really go out (R-LRN-01).
			if (a.verb === 'send' && a.text) {
				// A typed chat "send" on a held item is refused before his text replaces the draft the hold is about (PE 0b review, B1).
				if (holdReasons(wf).length && !a.page && await heldSend(store, src, wf, a, { quick })) return
				const reviewed = reviewedReasons(wf, a.sendReview)
				const original = wf.learnAfter?.draft ?? wf.draft?.text
				if (original && original.trim() !== a.text.trim()) wf.learnAfter = { draft: original, sent: a.text }
				wf.draft = { ...(wf.draft ?? { commitment: false, sources: [] }), text: a.text, byOwner: true, ownWords: ownWords(wf, a.text) }
				// Editing rebinds only the reasons this intent actually reviewed, never a newly discovered hold.
				if (a.page && holdReasons(wf).length) a = { ...a, sendReview: restampReasons(wf, reviewed) }
			}
			if (holdReplyGap(store, wf, wf.draft?.text)) return reply(store, src, a, `${MARK} ${REPLY_BLANK}`, true)
			rememberSend(store, wf)
			if (wf.ownerSend && voteChecks.length) {
				wf.ownerSend.checks = [...new Set([...(wf.ownerSend.checks ?? []), ...voteChecks])]
				commit(false)
			}
			// An item with changes on other systems makes them first; the reply follows when all are done (R-HIL-21).
			// New messages are read first, so a "never mind" stops the changes too (tester P1-4).
			if (wf.job && (externalPending(wf.effects).length > 0)) {
				const t = await threadSince(store, src, cfg, wf, '')
				if (t.ownerUnknown && !t.ownerReplied) store.log({ event: 'owner-reply-fallback', code: wf.code, before: 'approved-changes', note: OWNER_REPLY_UNCHECKED })
				if (t.ownerReplied || await heldSend(store, src, wf, a, { messages: t.messages, quick })) {
					if (t.ownerReplied) { close(wf, t.ownerExact ? 'You sent it yourself' : 'You replied yourself'); wf.closedBy = 'replied' }
					commit(true, t.ownerReplied ? { askAt: askAtOf(store.thread(wf.id), wf.msgIds), replyAt: t.ownerAt } : undefined)
					if (t.ownerReplied) return reply(store, src, a, `${MARK} Not done ${wf.code}: you already replied in the chat.`)
					return
				}
			}
			// "ok A6 #1 #3" makes only those changes; the rest are unchecked on the item and its job alike (design-spec S6).
			if (legacy) {
				const keep: number[] = []
				// The gate may already have omitted self-chat votes; retain original numeric identities.
				for (const [index, effect] of pendingEffects(wf.effects).entries()) {
					const chosen = legacy.slots.get(pageChangeId(effect))?.shift()
					if (chosen === undefined) return reply(store, src, a, `${MARK} Changed since you looked. Nothing was sent or changed. Open the new version first.`, true)
					if (chosen) keep.push(index + 1)
				}
				const selected = only(store, wf, keep.length ? keep : [0])
				if (typeof selected === 'string') return reply(store, src, a, `${MARK} ${selected}`, true)
				const r = legacy.removed
				// Only the reply is left, and it was written counting on the changes left out: it is quoted, and a new ok sends it (review 10-21 P2-10).
				// The owner's own words too, when a change left out failed, may have been made, or was a vote dropped as not needed: they
				// still count on it ("Send reply only", review chui P1-1).
				// A change refused at ok (switched off in Settings, say) and then left out is not made either (re-review N3).
				const pr = prTarget(store, wf), unmade = r.some(e => e.error || e.maybe || !!refusal(cfg, e, pr)) || legacy.refused && legacy.offVote
				// Then the reply is quoted even with other changes still to make, whose run would send it by itself (re-review N2).
				// A change left out by choice, while others are made, stays one ok (design-spec S6).
				const rest = pendingEffects(wf.effects).length
				if (wf.draft?.text && (legacy.kept ? unmade : !wf.draft.byOwner || unmade)) {
					wf.revAt = new Date().toISOString()
					commit(); store.markShown([wf])
					return reply(store, src, a, `${MARK} ${rest ? `The reply was written counting on the changes you left out, and it says: "${wf.draft.text}" Say "ok ${wf.code}" to make the rest and send it as it is` : `Only the reply goes now, and it says: "${wf.draft.text}" It was written counting on the changes you left out. Say "ok ${wf.code}" to send it as it is`}, or "edit ${wf.code}: <text>" to change it.`)
				}
			}
			if (legacy && a.surface === 'self' && !a.page && voteChecks.length && !wf.draft?.text && !pendingEffects(wf.effects).length) {
				if (wf.promise && wf.sent) rest(store, wf)
				wf.status = `Nothing was changed. ${voteChecks.join(' ')}`
				commit()
				return reply(store, src, a, `${MARK} ${wf.status}`)
			}
			// A vote on a pull request is checked against the PR as it is now, after the owner's choice of changes.
			// A deploy is checked against its ring and PR as they are now; if either moved, it is drawn again, not run (owned work).
			const stale = await recheckPr(store, wf, probe) ?? await recheckDeploy(store, wf, probe)
			if (stale && wf.promise && wf.sent && !wf.draft?.text) {
				// The owner's own words already went (Slice 3). A closed PR leaves nothing to make, so the item rests; a PR that moved
				// asks to review again, as a new turn whose vote and reply both wait for ok (re-review P1-3, P2-2).
				if (!pendingEffects(wf.effects).length) { const why = wf.status; rest(store, wf); commit(); return reply(store, src, a, `${MARK} Not done ${wf.code}: ${why}. Nothing was changed; its reply already went.`) }
				if (wf.reviewAgain) { const keep = { question: wf.question, questionHint: wf.questionHint, status: wf.status, reviewAgain: wf.reviewAgain }; newTurn(wf); Object.assign(wf, { ...keep, promise: undefined, ...stateFields(wf, 'needs_human'), revAt: new Date().toISOString() }) }
			}
			if (stale) { commit(); store.markShown([wf]); return reply(store, src, a, `${MARK} ${stale}`, true) }
			const receipt = internalReceipt(wf)
			const held = approveEffects(store, cfg, wf, !!a.again)
			if (!held && wf.approved) { wf.approved.replyDigest = a.page?.replyDigest; wf.approved.sendReview = a.sendReview }
			if (held !== undefined) {
				const checks = wf.ownerSend?.checks ?? voteChecks
				if (checks.length) wf.status += ` ${checks.join(' ')}`
				commit()
				return reply(store, src, a, `${MARK} ${effectResultLine(wf, held ? wf.effects?.some(e => e.maybe) ? 'unsure' : 'held' : 'running', held, placeOf(store, wf.chat, wf.asker))}${checks.length ? ` ${checks.join(' ')}` : ''}`, !!held)
			}
			// The owner left out every change their own words promised, and the reply already went: nothing is left to do (Slice 3).
			if (wf.promise && wf.sent && !wf.draft?.text) {
				rest(store, wf)
				if (!wf.sent?.holding && receipt.items.length) {
					await makeInternalChanges(store, wf, receipt)
					saveInternalReceipts(store, wf)
				}
				commit()
				return reply(store, src, a, `${MARK} ${receipt.items.length ? wf.status : `Nothing was changed for ${wf.code}; its reply already went.`}`)
			}
			const sentDraft = a.verb === 'ok' && wf.sent && !wf.sent.holding && wf.sent.text !== undefined &&
				wf.sent.text === wf.draft?.text && wf.sent.askMsgId === wf.lastMsgId && !wf.pending.length
			if (receipt.items.length && !wf.sent?.holding && (!wf.draft?.text || sentDraft) && !wf.question) {
				rest(store, wf)
				await makeInternalChanges(store, wf, receipt)
				saveInternalReceipts(store, wf)
				const left = pendingEffects(wf.effects).filter(isInternal)
				const made = receipt.items.flatMap(item => {
					const effect = wf.effects?.[item.index]
					return effect?.done && isInternal(effect) ? [effect.summary] : []
				})
				if (!left.length) wf.status = made.length ? `Made: ${made.join('; ')}` : 'The internal changes changed before they could be made. Open the current item.'
				commit()
				return reply(store, src, a, `${MARK} ${wf.status}`, left.length > 0 || !made.length)
			}
			const sent = await send(store, src, cfg, wf, wf.draft?.text, { answer: a, quick }, probe)
			if (sent && !wf.sent?.holding && receipt.items.length) {
				await makeInternalChanges(store, wf, receipt)
				saveInternalReceipts(store, wf)
				commit()
			}
			break
		}
		case 'undo': {
			const wasOpen = wf.state === 'open'
			await undo(store, src, cfg, wf, a)
			if (wasOpen && !wf.sent) Object.assign(wf, { ...stateFields(wf, 'open'), status: statusOf(wf) })
			break
		}
	}
	wf.newCount = 0
	commit()
}

// ok on a W item drafts a follow-up as a normal reply item, so it is shown and approved like any other (design: Waiting on others).
async function followUp(store: Store, src: Source, cfg: Config, w: Waiting, a: Answer): Promise<string> {
	const set = (state: Waiting['state'], item?: string) => store.saveWaiting(store.waiting().map(x => (x.code === w.code ? { ...x, state, item, doneAt: new Date().toISOString() } : x)))
	if (a.verb === 'skip') { set('dismissed'); return `Dropped ${w.code}. I won't remind you about it.` }
	if (a.verb !== 'ok') return `${w.code} takes ok (draft a follow-up) or skip.`
	if (w.state !== 'waiting') return `${w.code} is already ${w.state}.`
	const open = w.item ? store.byCode(w.item) : undefined
	if (open && open.state !== 'done') return `${w.code} already has a follow-up: ${w.item}.`
	const now = new Date().toISOString(), who = w.to.join(', ')
	const wf: Workflow = {
		schema: WORKFLOW_SCHEMA, id: ulid(), code: store.nextCode(), kind: 'reply', ...stateFields(undefined, 'running'), key: { type: 'thread', id: w.chat.id },
		chat: { id: w.chat.id, name: w.chat.name, test: false, group: kindOf(w.chat.id) !== 'oneOnOne' }, asker: { id: `asked:${w.to[0].toLowerCase()}`, name: who },
		session: { agent: cfg.agent.flavor, id: chooseSession('item', { fresh: true }) }, lastMsgId: w.msgId, pending: [w.msgId], msgIds: [w.msgId], lastAsk: w.text,
		followUp: who, status: `Drafting a follow-up to ${who}`, newCount: 0, createdAt: now, updatedAt: now,
	}
	const recent = await src.recent(w.chat.id, 20).catch(() => [])
	store.saveThread(wf.id, recent.filter(r => r.from).map(r => ({ id: r.id, at: r.at, from: r.from!, text: r.html ? htmlToText(r.body) : r.body, byOwner: r.from!.id === cfg.owner.id })))
	store.save(wf)
	// The wait stays open until they answer; the follow-up item is linked so the page does not show both.
	store.saveWaiting(store.waiting().map(x => (x.code === w.code ? { ...x, item: wf.code } : x)))
	return `Drafting a follow-up to ${who} as ${wf.code}. You'll see it before anything is sent.`
}

function keepWaiting(store: Store, wf: Workflow, a: Answer) {
	const result = (text: string, refused = false) => store.addReceipt(recordAnswerResult(store, a, text, refused))
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	commit.refresh()
	if (!wf.followUp || wf.kind !== 'reply') return result('This item is not a follow-up reply. Nothing changed.', true)
	if (wf.sent) return result('This follow-up was already sent. Nothing changed.', true)
	const skipped = wf.state === 'done' && wf.closedBy === 'skipped'
	if (!skipped && wf.state !== 'needs_human' && wf.state !== 'scheduled') return result('This follow-up is not a resting draft. Nothing changed.', true)
	if (heldBy(store, wf) === 'window' || wf.partOf || pendingParts(store, wf)) return result('This follow-up is open elsewhere or part of ongoing work. Nothing changed.', true)
	const busy = freshRead(() => [wf.job, wf.work?.watch].some(id => {
		const job = id ? store.job(id) : undefined
		return job?.state === 'queued' || job?.state === 'running' || !!job?.parents.some(parentId => {
			const parent = store.workflow(parentId)
			return parent && parent.id !== wf.id && parent.state !== 'done'
		})
	}))
	if (busy) return result('This follow-up is still working or shared with another item. Nothing changed.', true)
	const linked = freshRead(() => store.waiting().filter(w => w.item === wf.code))
	if (!linked.length && skipped) return result('This follow-up is already closed. Nothing was sent.')
	if (linked.length !== 1 || linked[0].chat.id !== wf.chat.id || !wf.msgIds.includes(linked[0].msgId)) {
		store.log({ event: 'keep-waiting-refused', code: wf.code, reason: 'waiting-link' })
		return result("The original waiting entry isn't uniquely linked to this follow-up. Nothing changed.", true)
	}
	if (!skipped) {
		stopWatch(store, wf)
		if (wf.work) { wf.work.closed = { at: new Date().toISOString(), why: 'Kept waiting instead' }; wf.work.next = undefined; wf.work.waitingOn = undefined }
		close(wf, 'Skipped follow-up; kept waiting instead')
		Object.assign(wf, { closedBy: 'skipped', approved: undefined, sendAt: undefined, waitingSince: undefined,
			learnAfter: undefined, promise: undefined, needsMe: undefined, revAt: new Date().toISOString() })
		commit()
	}
	const state = freshRead(() => {
		const waits = store.waiting(), current = waits.find(w => w.code === linked[0].code && w.item === wf.code)
		if (!current) throw new Error('The waiting link changed before the follow-up could return')
		store.saveWaiting(waits.map(w => w === current ? { ...w, item: undefined, ...(w.state === 'waiting' ? { doneAt: undefined } : {}) } : w))
		return current.state
	})
	store.log({ event: 'kept-waiting', code: wf.code, waiting: linked[0].code, state })
	return result(state === 'waiting' ? `Kept waiting on ${linked[0].to.join(', ')}. Nothing was sent.` :
		`Follow-up skipped. The original wait is already ${state}. Nothing was sent.`)
}

// Persist the complete answer before the PR read; a failed reader must not bring the same question back.
async function groupAnswer(store: Store, src: Source, wf: Workflow, a: Answer, selected: string[], probe?: BuildProbe) {
	const ask = wf.groupAsk!, commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	const cfg = freshRead(() => {
		const cfg = store.config()
		const replace = (list: string[] | undefined, add: string[]) => {
			const names = [...new Set([...(list ?? []).filter(g => !ask.groups.some(x => reviewerGroupMatches(x, g))), ...add])]
			return names.length ? names : undefined
		}
		const owner = { ...cfg.owner, reviewerGroups: replace(cfg.owner.reviewerGroups, selected),
			notReviewerGroups: replace(cfg.owner.notReviewerGroups, ask.groups.filter(g => !selected.includes(g))) }
		const updated = { ...cfg, owner }
		store.saveConfig(updated)
		return updated
	})
	Object.assign(wf, { groupAsk: undefined, question: undefined, questionHint: undefined, revAt: new Date().toISOString() })
	commit()
	store.log({ event: 'group-answer', code: wf.code, pr: ask.pr, selected: selected.length, groups: ask.groups.length })
	const live = probe ?? adoProbe(cfg)
	try { if (live?.pr) await probePRs(store, cfg, live, Date.now(), true, [wf]) } finally { if (!probe) await live?.close?.() }
	commit.refresh()
	const groupLeft = openLeft(wf).filter(line => line.type === 'refusal' && line.kind === 'setting-off' &&
		line.setting === settingKey('reviewerGroups') && line.action.verb === 'vote' && line.action.pr === ask.pr)
	const legacyReview = wf.left === undefined && isReviewJob(wf.job ? store.job(wf.job)?.key ?? '' : '', wf.intent)
	if (selected.length && wf.state === 'needs_human' && live?.pr && wf.prRead && wf.prRole && MAY_REVIEW.includes(wf.prRole) && !wf.heldVotes && !pendingEffects(wf.effects).some(e => isVote(e.call)) && (groupLeft.length || legacyReview)) {
		clearLeft(wf, groupLeft.map(line => line.id), { at: new Date().toISOString(), by: 'engine', why: 'allowed-now' })
		Object.assign(wf, { ...stateFields(wf, 'running'), status: `Your reviewer groups are saved; reviewing PR ${ask.pr} again so it can propose your vote`, pending: wf.pending.length ? wf.pending : wf.msgIds.slice(-1) })
	}
	commit()
	await reply(store, src, a, `${MARK} ${NAME} remembers your answer.`)
}

// pick: an option with a ready reply becomes the draft at once, as a preview; several options, or one without a reply, rewrite like an answer.
function pick(store: Store, cfg: Config, wf: Workflow, a: Answer): string | undefined {
	const c = wf.choices
	if (!c || wf.state !== 'needs_human') return `${wf.code} has no options to pick from.`
	const nums = [...new Set(a.nums ?? [])]
	if (nums.some(n => n < 1 || n > c.options.length)) return `${wf.code} has options 1 to ${c.options.length}.`
	if (nums.length > 1 && !c.multi) return `Pick one option for ${wf.code}.`
	const chosen = nums.map(n => c.options[n - 1])
	const now = new Date().toISOString()
	if (chosen.length === 1 && chosen[0].reply) {
		const o = chosen[0]
		const job = wf.job ? store.job(wf.job) : undefined
		// The changes follow the option: switching to an option without changes drops the earlier option's (S5: from "meet at 3" to "async").
		const own = !job || job.key === `item:${wf.id}`
		// A picked option's changes are vetted as a report's are: allowed, on this item's PR, one deploy at a time (round 2 P2-4).
		const v = o.effects ? vet(cfg, o.effects.map(e => ({ ...e, done: undefined, error: undefined })), prTarget(store, wf)) : undefined
		const busy = v && deployRunning(homeOf(store, wf))
		if (v && busy) for (const e of v.effects.filter(e => isDeploy(e.call))) {
			v.todos.push(`${e.summary.replace(/[.\s]+$/, '')}. Not made for you: ${busy}`)
			v.left.push(deployBusyLeft(e, busy))
		}
		const effects = v ? proposalEffects(v.effects.filter(e => !busy || !isDeploy(e.call)), [wf]) : own ? undefined : wf.effects
		const candidate: Workflow = { ...wf, draft: { ...(wf.draft ?? { commitment: false, sources: [] }), text: o.reply ?? '', preview: true, byOwner: undefined, ownWords: undefined },
			learnAfter: undefined, effects, question: v?.todos.length ? refusedAsk(wf.code, v.todos.length) : undefined, questionHint: undefined,
			picked: nums, revAt: now, status: `You picked "${o.label}"` }
		if (job && effects !== wf.effects || !job && effects?.length) {
			const held = carry(store, cfg, candidate, effects ?? [])
			if (held) return held === 'busy' ? `${wf.code}'s approved changes are still running. Wait for their result before changing the option.` :
				`${wf.code} shares changes with another open item. Review that item before changing the option.`
		}
		Object.assign(wf, candidate)
		if (effects) allowLeft(wf, effects)
		if (v) leaveForYou(store, wf, v.left)
		return undefined
	}
	clearReviewRequests(wf)
	Object.assign(wf, { ownerAnswer: `The owner picked: ${chosen.map(o => o.label).join('; ')}`, picked: nums, ...stateFields(wf, 'running'), status: 'Rewriting with your choice' })
	return undefined
}

export function only(store: Store, wf: Workflow, nums: number[], offReason?: Effect['offReason']): string | Effect[] {
	const left = pendingEffects(wf.effects)
	// [0]: "except" named every change, so only the reply goes.
	const none = nums.length === 1 && nums[0] === 0
	if (!none && nums.some(n => n < 1 || n > left.length)) return `${wf.code} has changes 1 to ${left.length}.`
	const keep = new Set(nums.map(n => left[n - 1]))
	const job = wf.job ? store.job(wf.job) : undefined
	const offIdx = (wf.effects ?? []).map((e, i) => (left.includes(e) && !keep.has(e) ? i : -1)).filter(i => i >= 0)
	for (const i of offIdx) {
		wf.effects![i] = { ...wf.effects![i], off: true, ...(offReason ? { offReason } : {}) }
		// By change, not by place: the item and its job may list the same changes in another order (review 10-21d P2-3).
		const j = job?.result?.effects.findIndex(x => pendingEffects([x]).length && sameChange(x, wf.effects![i])) ?? -1
		if (j >= 0) job!.result!.effects[j] = { ...job!.result!.effects[j], off: true, ...(offReason ? { offReason } : {}) }
	}
	if (job) store.saveJob(job)
	return left.filter(e => !keep.has(e))
}

function recordAnswerResult(store: Store, a: Answer, text: string, refused = false, undo?: UndoReceipt): string {
	const detail = text.replace(new RegExp(`^${MARK}\\s*`), '')
	if (a.id) {
		store.addOutcome(a.id, detail, refused)
		store.completePageSubmission(a, detail, refused, undo)
	}
	return detail
}

export async function reply(store: Store, src: Source, a: Answer, text: string, refused = false, undo?: UndoReceipt) {
	// The surface that acted reads its own result, so a refusal is never shown as success (final review P1-2).
	const detail = recordAnswerResult(store, a, text, refused, undo)
	if (a.surface === 'chat' || a.surface === 'panel') { store.addReceipt(detail); return true }
	if (a.surface !== 'self') return
	try { await say(store, src, text); return true } catch (e) { store.log({ event: 'ack-failed', code: a.code, error: String(e) }); return false }
}

const CONTROL_REPLY = {
	'auto-on': 'Auto-send is on. Replies that your rules allow go out after the delay, with a marker, and you can undo them for a few minutes.',
	'auto-off': 'Auto-send is off. Every reply waits for your ok.',
	pause: 'Paused. Nothing will be sent. I will keep drafting. Say "resume" to restart.',
	resume: 'Resumed. Drafting and sending your approved replies again.',
	stop: `Stopped. I will not read your chats or draft until you say "resume", then I will catch up. I still check this self-chat for "resume". To turn off completely, run "${CMD} service uninstall".`,
}

// pause, resume, and stop work from every surface (R-SET-07). Only the runner writes control.json.
async function control(store: Store, src: Source, a: Answer, procs: Procs) {
	const v = a.verb as keyof typeof CONTROL_REPLY
	const c = store.control()
	if (v === 'auto-on' || v === 'auto-off') store.saveControl({ ...c, autoSend: v === 'auto-on' })
	else store.saveControl({ ...c, paused: v !== 'resume', stopped: v === 'stop' })
	// Paused means nothing is sent, even after resume: scheduled replies go back to the owner (review P1-5).
	if (v === 'pause' || v === 'stop') for (const w of store.workflows().filter(w => w.state === 'scheduled' || w.approved ||
		(w.state !== 'done' && w.prs?.some(unit => unit.review?.run?.phase === 'posting' && unit.review.run.approval)))) {
		// Pause withdraws every pending ok, and stops change runs nobody else approves (tester P1-2).
		withdraw(store, procs, w)
		Object.assign(w, { ...stateFields(w, 'needs_human'), sendAt: undefined, waitingSince: undefined, held: 'paused', ...statusFields('not-sent', w.job ? `Held: you paused. Some changes may be done; ok ${w.code} retries the rest` : 'Held: you paused') })
		store.save(w)
	}
	// Resume sends nothing; what was held waits for the owner's Send, no longer marked as held by the pause.
	if (v === 'resume') for (const w of store.workflows().filter(w => w.held)) { w.held = undefined; if (w.statusReason?.kind === 'not-sent') { w.status = 'Ready to send: held while you were paused'; w.statusReason = undefined }; store.save(w) }
	await reply(store, src, a, `${MARK} ${CONTROL_REPLY[v]}`)
}

async function watching(store: Store, src: Source, a: Answer, writer: string) {
	const c = freshRead(() => store.control()), now = new Date()
	const changed = `${MARK} Changed since you looked. Nothing was sent or changed. Open the new version first.`
	if (!a.page || a.code || a.page.expect !== pageDigest({ on: c.watching?.on !== false, since: c.watching?.since }))
		return reply(store, src, a, changed, true)
	if (a.verb === 'watch-off') {
		if (c.watching?.on === false) return reply(store, src, a, changed, true)
		store.saveControl({ ...c, watching: { on: false, since: now.toISOString(), machine: writer } })
		store.log({ event: 'watch-off', by: 'owner', machine: writer, at: now.toISOString() })
		return reply(store, src, a, `${MARK} Stopped checking Teams. Your setting is kept for when you start again.`)
	}
	const off = c.watching
	if (!off || off.on) return reply(store, src, a, changed, true)
	store.saveControl({ ...c, watching: { on: true, since: now.toISOString(), machine: writer } })
	store.saveKick()
	store.log({ event: 'watch-on', by: 'owner', machine: writer, at: now.toISOString(), offSince: off.since })
	return reply(store, src, a, `${MARK} Checking Teams again: next check now.`)
}

// After the undo window, the owner can still post a correction under the sent reply. The owner wrote it, so no marker.
// The owner says a sent reply was not right (dogfood). Wrong or incomplete: a follow-up that fixes it is drafted and held for their ok.
// Not needed: it is taken back while it still can be, and the rule that sent it asks first from now on.
async function mark(store: Store, src: Source, cfg: Config, wf: Workflow, a: Answer, procs: Procs) {
	if ((wf.state !== 'done' && wf.state !== 'open') || !wf.sent) return reply(store, src, a, `${MARK} ${wf.code} has not been sent. Edit or skip the draft instead.`)
	const kind = a.verb as 'wrong' | 'incomplete' | 'unneeded', sent = wf.sent.text ?? wf.draft?.text ?? '', rule = wf.sent.byRule
	const before = rule ? store.logs(30).filter(e => e.event === 'marked' && e.rule === rule).at(-1) : undefined
	store.log({ event: 'marked', workflowId: wf.id, code: wf.code, sentId: wf.sent.msgId, chat: wf.chat.id, kind, note: a.text, sent, rule, intent: wf.intent, asker: wf.asker, ask: wf.lastAsk?.slice(0, 400) })
	// A learned rule whose replies are marked wrong or incomplete twice in a row goes on hold (R-HAB-05).
	const learned = rule ? store.rules().find(r => r.id === rule && r.learned) : undefined
	if (learned && kind !== 'unneeded' && (before?.kind === 'wrong' || before?.kind === 'incomplete')) store.saveHeldRules({ ...store.heldRules(), [learned.id]: { code: wf.code, at: new Date().toISOString() } })
	if (kind === 'unneeded') {
		if (rule) store.saveHeldRules({ ...store.heldRules(), [rule]: { code: wf.code, at: new Date().toISOString() } })
		const held = rule ? ` Rule ${rule} now asks you first; save your rules again to let it send by itself.` : ''
		if (rule && Date.now() < Date.parse(wf.sent.undoUntil ?? '')) { await undo(store, src, cfg, wf, a); recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))(); return held ? reply(store, src, a, `${MARK}${held}`) : undefined }
		return reply(store, src, a, `${MARK} Noted: ${wf.code} needed no reply. It is too late to take it back, so it stays in the chat.${held}`)
	}
	const sentId = wf.sent.msgId, sentAt = wf.sent.at
	withdraw(store, procs, wf)
	Object.assign(wf, { correction: { kind, note: a.text, sent, at: new Date().toISOString() }, sent: undefined, sendAt: undefined, decision: undefined, approved: undefined, ...stateFields(wf, 'running'), status: kind === 'wrong' ? 'Drafting a correction' : 'Drafting what was missing' })
	recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))()
	let historyHeld = false
	try {
		const matches = readActions(store, { since: new Date(Date.parse(sentAt) - 24 * 3_600_000).toISOString() }).filter(action =>
			action.item?.wf === wf.id && action.parts.some(part => part.kind === 'message' && part.msgId === sentId) &&
			!action.amendments.some(change => change.kind === 'undone'))
		if (matches.length === 1) {
			const saved = amendAction(store, { v: 1, ref: matches[0].id, at: new Date().toISOString(), by: 'owner', kind: 'corrected', item: wf.code })
			historyHeld = saved === BUSY || saved === undefined
		}
	} catch { historyHeld = true }
	if (historyHeld) {
		try { store.log({ event: 'wdd-amend-held', kind: 'corrected' }) }
		catch { console.error(`${NAME}: could not record correction history or its diagnostic.`) }
	}
	return reply(store, src, a, `${MARK} Drafting a ${kind === 'wrong' ? 'correction' : 'follow-up with what was missing'} for ${wf.code}. It waits for your ok; nothing is sent.`)
}

// The owner changes how often a watch checks, or gives it 7 more days (B19).
async function retune(store: Store, src: Source, wf: Workflow, a: Answer) {
	const id = wf.work?.watch ?? wf.job, job = id ? store.job(id) : undefined
	if (!job?.every) return reply(store, src, a, `${MARK} ${wf.code} is not a watch, so nothing changed.`, true)
	if (a.verb === 'extend') {
		if (!job.endsAt) return reply(store, src, a, `${MARK} ${wf.code} has no end date, so there is nothing to extend.`, true)
		const from = Math.max(Date.now(), Date.parse(job.endsAt ?? '') || Date.now())
		job.endsAt = new Date(from + FOLLOW_DAYS * 86_400_000).toISOString()
		store.saveJob(job)
		return reply(store, src, a, `${MARK} ${wf.code} keeps watching until ${job.endsAt.slice(0, 10)}.`)
	}
	const m = /(\d+(?:\.\d+)?)\s*(m|min|minutes?|h|hrs?|hours?|d|days?)\b/i.exec(a.text ?? '')
	if (!m) return reply(store, src, a, `${MARK} Give an interval such as 15m or 2h. Nothing changed.`, true)
	const unit = m[2][0].toLowerCase(), minutes = Math.round(Number(m[1]) * (unit === 'd' ? 1440 : unit === 'h' ? 60 : 1))
	job.every = Math.min(1440, Math.max(5, minutes))
	store.saveJob(job)
	wf.status = wf.status.replace(/every \d+ min/, `every ${job.every} min`)
	store.save(wf)
	return reply(store, src, a, `${MARK} ${wf.code} now checks every ${job.every >= 60 ? `${+(job.every / 60).toFixed(1)} h` : `${job.every} min`}.`)
}

// close ends work for good; wait puts open work back in progress with a later check date (R-WRK-05, R-WRK-06).
async function workVerb(store: Store, src: Source, wf: Workflow, a: Answer, procs: Procs) {
	if (a.verb === 'wait' && wf.followUp && !a.text?.trim()) return keepWaiting(store, wf, a)
	if (a.verb === 'close') {
		// Mark done (R-NEX-07): open to-dos a sent reply left go first, and nothing else changes. A done item is never reopened,
		// and open work stays open, so the button can never end work; a second close does that.
		// From the page, only the to-dos the owner saw: one kept after they looked stays open, and when none they saw is still open
		// the close was for them, so the work never closes by it (review N2 P2-1).
		const tasks = [...openTodos(wf), ...openLeft(wf)]
		if (a.todos && !tasks.some(t => a.todos!.includes(t.id))) return reply(store, src, a, `${MARK} ${wf.code}: the ${a.todos.length === 1 ? 'to-do you marked is' : 'to-dos you marked are'} already done. ${wf.code} stays ${wf.state === 'done' ? 'done' : 'open'}. Nothing was sent.`)
		if (tasks.length) {
			const done = doneTodos(wf, undefined, a.todos)
			store.save(wf, a.page?.kind !== 'mark-todos')
			return reply(store, src, a, `${MARK} Marked ${done.length === 1 ? 'your to-do' : `your ${done.length} to-dos`} on ${wf.code} done: ${done.join('; ')}. ${wf.state === 'done' ? `${wf.code} stays done.` : a.page ? `${wf.code} stays open.` : `${wf.code} stays open; say "close ${wf.code}" again to close it.`} Nothing was sent.`)
		}
		if (wf.state === 'done') {
			closeLeft(wf)
			store.save(wf)
			return reply(store, src, a, `${MARK} ${wf.code} is already closed: ${wf.status}`)
		}
		const why = a.text?.trim() || 'Closed by you'
		const home = homeOf(store, wf)
		// A part closes only its own chat; closing the home closes every part (R-WRK-14).
		if (home !== wf) {
			withdraw(store, procs, wf)
			home.work!.parts = home.work!.parts?.filter(id => id !== wf.id)
			step(home, `${wf.code} closed: ${why}`)
			close(wf, why)
			closeLeft(wf)
			store.save(home); store.save(wf)
			return reply(store, src, a, `${MARK} Closed ${wf.code}: ${why}. ${home.code} stays in progress. Nothing was sent.`)
		}
		withdraw(store, procs, wf)
		stopWatch(store, wf)
		if (wf.work) closeFamily(store, procs, wf, why, true)
		else { if (wf.kind === 'tracker') stopTracker(store, procs, wf); close(wf, why); closeLeft(wf) }
		store.save(wf)
		return reply(store, src, a, `${MARK} Closed ${wf.code}: ${why}. Nothing was sent.`)
	}
	const home = homeOf(store, wf)
	if (!active(home) || (home.state !== 'open' && home.state !== 'needs_human')) return reply(store, src, a, `${MARK} ${wf.code} is not open work, so there is nothing to wait on.`)
	const m = /(\d+)\s*(d|days?|w|weeks?)?/i.exec(a.text ?? ''), days = m ? Math.min(60, Number(m[1]) * (m[2]?.[0].toLowerCase() === 'w' ? 7 : 1)) : 3
	withdraw(store, procs, home)
	wait(home, days)
	store.save(home)
	return reply(store, src, a, `${MARK} ${home.code} stays in progress. I'll ask again on ${home.work!.checkAt!.slice(0, 10)} if nothing happens.`)
}

// Closing work closes its parts too, withdrawing anything they were about to do.
export function closeFamily(store: Store, procs: Procs, home: Workflow, why: string, byOwner = false) {
	if (byOwner) closeLeft(home)
	stopWatch(store, home)
	if (!home.work?.closed) closeWork(home, why)
	else Object.assign(home, { ...stateFields(home, 'done'), status: `Closed: ${why}`, pending: [] })
	for (const id of home.work?.parts ?? []) {
		const p = store.workflow(id)
		if (!p) continue
		if (p.state === 'done') {
			if (byOwner) { closeLeft(p); store.save(p) }
			continue
		}
		withdraw(store, procs, p)
		newTurn(p, !!p.sent)
		close(p, `Closed with ${home.code}: ${why}`)
		if (byOwner) closeLeft(p)
		store.save(p)
	}
}

async function correct(store: Store, src: Source, wf: Workflow, a: Answer) {
	if (store.control().paused) return reply(store, src, a, `${MARK} Paused, so the correction for ${wf.code} was not posted. Say "resume", then send it again.`)
	const cfg = store.config(), text = authorize({ automatic: false, text: withMarker(a.text!, signatureOf(cfg), cfg.owner.name, false) }).text!
	const { msgId } = await src.send(wf.chat.id, text)
	store.addSent(msgId, text)
	store.log(telemetryEvent('marker', { code: wf.code, applied: false, why: 'owner-text' }))
	store.log({ event: 'correction', workflowId: wf.id, code: wf.code, msgId, sentId: wf.sent?.msgId, text: a.text })
	// A correction is the owner's words too; one sent while the last check waits joins it, so one run reads both (Slice 3).
	if (prTarget(store, wf)) { notePromise(store, wf, a.text!, { msgId, at: new Date().toISOString() }); store.save(wf) }
	await reply(store, src, a, `${MARK} Posted your correction for ${wf.code}.`)
}
