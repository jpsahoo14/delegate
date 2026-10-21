import { answerHabit, outcome } from './habits.ts'
import { membersOf } from './sharing.ts'
import { active, afterSend, closeWork, doneTodos, homeOf, inWork, keepTodos, newTurn, openTodos, statusOf, step, wait } from './work.ts'
import { asksReviewAgain, doLine, pendingEffects, refusal, saidLine, sameChange, vet } from '../core/effects.ts'
import type { Answer, Config, Effect, Person, Workflow } from '../core/types.ts'
import { sendGate } from '../core/gate.ts'
import { classify, htmlToText } from '../core/intake.ts'
import { mdToHtml } from '../core/format.ts'
import { DEFAULT_POLICY, signatureOf, signsApproved, withMarker, reopenable } from '../core/policy.ts'
import { effectLine, MARK, plain, renderMore, renderPreview } from '../core/render.ts'
import type { SendOpts, Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { close, isControl, ownerAnswered, say } from './intake.ts'
import { approveEffects, changesJob, okRelay, realProcs, stopTracker, withdraw, type Procs } from './jobs.ts'
import { openContinue } from './continue.ts'
import { heldBy } from './owner.ts'
import { learnFrom } from './learn.ts'
import { answerAutomation } from './automations.ts'
import type { Waiting } from '../core/waiting.ts'
import { kindOf } from './discover.ts'
import { ulid } from '../core/ids.ts'
import { randomUUID } from 'node:crypto'
import { answerProposal, knowledgeOf, nextProposal } from './proposals.ts'
import { CMD } from '../brand.ts'
import { askAtOf } from '../core/numbers.ts'
import { FOLLOW_DAYS, startFollow, startWatch, stopWatch, watchCommand } from './track.ts'
import { prTarget, recheckDeploy, recheckPr, voteDropped, type BuildProbe } from './probe.ts'
import { deployRunning, isValidate, reportsResult, saysTested, testedAsk } from './validate.ts'
import { checkAgain, dropPromise, notePromise, promiseDue, reopenPromise, rest } from './promise.ts'
import { isDeploy } from '../core/deploy.ts'

// Apply owner answers in time order. Effects run here and nowhere else.
export async function applyAnswers(store: Store, src: Source, cfg: Config, procs: Procs = realProcs, controlsOnly = false, probe?: BuildProbe): Promise<number> {
	let n = 0
	for (const { file, answer } of store.answers()) {
		if (controlsOnly && !isControl(answer.verb)) continue
		const wf = answer.code ? store.byCode(answer.code) : undefined
		try {
			const kp = answer.code?.startsWith('K') ? store.proposal(answer.code) : undefined
			// "except" names what to leave out; it becomes the list of what to keep.
			if (answer.except?.length) {
				const total = kp ? kp.ops.length : wf ? pendingEffects(wf.effects).length : 0
				answer.nums = Array.from({ length: total }, (_, i) => i + 1).filter(n => !answer.except!.includes(n))
				if (!answer.nums.length) answer.nums = [0]
			}
			// "A14: 2" on an item with options picks option 2.
			if (wf?.choices && answer.verb === 'answer' && /^\s*#?\d+(\s*,\s*#?\d+)*\s*$/.test(answer.text ?? '')) Object.assign(answer, { verb: 'pick', nums: answer.text!.match(/\d+/g)!.map(Number), text: undefined })
			const auto = answer.code?.startsWith('R') ? store.automation(answer.code) : undefined
			const wt = answer.code?.startsWith('W') ? store.waiting().find(w => w.code === answer.code) : undefined
			const hb = answer.code?.startsWith('H') ? store.habit(answer.code) : undefined
			if (hb) await reply(store, src, answer, `${MARK} ${answerHabit(store, hb, answer.verb)}`)
			else if (wt) await reply(store, src, answer, `${MARK} ${await followUp(store, src, cfg, wt, answer)}`)
			else if (auto) await reply(store, src, answer, `${MARK} ${answerAutomation(store, auto, answer)}`)
			else if (isControl(answer.verb)) await control(store, src, answer, procs)
			// Knowledge proposals are not chat replies: their own handler, never the send path (review 01-04 entry condition).
			else if (kp) await reply(store, src, answer, plain(`${MARK} ${answerProposal(store, knowledgeOf(store, cfg), kp, answer)}${answer.verb === 'more' || answer.verb === 'undo' ? '' : `\n\n${nextProposal(store, kp.code, answer.surface === 'self' ? 6 : Infinity)}`}`).slice(0, 1800))
			else if (!wf) await reply(store, src, answer, `${MARK} I can't find item ${answer.code}.`)
			else await applyOne(store, src, cfg, wf, answer, procs, probe)
		} catch (e) {
			const why = String(e).slice(0, 160)
			store.log({ event: 'answer-failed', code: answer.code, verb: answer.verb, error: String(e).slice(0, 300) })
			// A failed action stays on the item, with the owner's words, so it can be retried (review P1-8).
			if (wf && (answer.verb === 'ok' || answer.verb === 'send') && wf.state !== 'done') {
				if (answer.verb === 'send' && answer.text && wf.draft) wf.draft = { ...wf.draft, text: answer.text }
				Object.assign(wf, { state: 'needs_human', status: `Could not send: ${why}. Reply "ok ${wf.code}" to retry` })
				store.save(wf)
			}
			await reply(store, src, answer, `${MARK} ${answer.verb} ${answer.code} failed: ${why}`)
		}
		store.doneAnswer(file)
		store.addOutcome(answer.id, '')
		store.log({ event: 'answer', workflowId: wf?.id, code: answer.code, verb: answer.verb, surface: answer.surface, text: answer.text })
		n++
	}
	return n
}

async function applyOne(store: Store, src: Source, cfg: Config, wf: Workflow, a: Answer, procs: Procs, probe?: BuildProbe) {
	wf.answerSurface = a.surface
	// "watch A41" from the self-chat: the same as from the AI chat or the page.
	if (a.verb === 'watch') return reply(store, src, a, `${MARK} ${watchCommand(store, { code: wf.code, text: a.text }).text}`)
	if (a.verb === 'close' || a.verb === 'wait') return workVerb(store, src, wf, a, procs)
	// A candidate from the owner's own message: ok starts tracking it, skip drops it (R-WRK-11).
	if (wf.work?.proposed && wf.state === 'needs_human' && a.verb !== 'skip' && a.verb !== 'more' && a.verb !== 'ask') {
		if (a.verb !== 'ok' && a.verb !== 'answer') return reply(store, src, a, `${MARK} ${wf.code} asks whether to track work: "${wf.work.goal}". Say "ok ${wf.code}" to track it, or "skip ${wf.code}".`)
		if (a.verb === 'ok') {
			wf.work.proposed = undefined
			wf.work.checkAt = new Date(Date.now() + 3 * 86_400_000).toISOString()
			step(wf, 'You chose to track this')
			newTurn(wf)
			Object.assign(wf, { state: 'open', status: statusOf(wf), pending: [] })
			store.save(wf)
			return reply(store, src, a, `${MARK} Tracking ${wf.code}: ${wf.work.goal}. Messages about it in any chat come back to it.`)
		}
	}
	// Open work has no draft: its next reply starts from the owner's words or the next news (dev-spec/work.md).
	if (wf.state === 'open') {
		if ((a.verb === 'edit' || a.verb === 'send') && a.text) { newTurn(wf); wf.state = 'needs_human' }
		else if (a.verb === 'answer') newTurn(wf)
		else if (['ok', 'pick', 'later', 'undo'].includes(a.verb)) return reply(store, src, a, `${MARK} ${wf.code} is in progress (${wf.status}) and has no draft. Say "${wf.code}: what to do next", "wait ${wf.code}: 3d", or "close ${wf.code}".`)
	}
	if (wf.state === 'done' && a.verb === 'send' && wf.sent && a.text) return correct(store, src, wf, a)
	if (wf.state === 'done' && a.verb === 'edit' && wf.sent) return reply(store, src, a, `${MARK} ${wf.code} was already sent. To post a correction under it, say "send ${wf.code}: <text>".`)
	// Later is a hold: an automatic send waiting on its delay is cancelled too (final review P1-5).
	if (a.verb === 'later') {
		if (wf.state !== 'scheduled') return reply(store, src, a, `${MARK} Left ${wf.code} for later. It stays in your inbox.`)
		Object.assign(wf, { state: 'needs_human', sendAt: undefined, status: 'Held for later by you' })
		store.save(wf)
		return reply(store, src, a, `${MARK} Held ${wf.code}: it will not send on its own. It stays in your inbox.`)
	}
	if (a.verb === 'continue') return openContinue(store, src, wf, a, procs)
	// ok on a watched thing means "got it": the update leaves the list, the watching goes on (design-spec S9).
	if (a.verb === 'ok' && wf.kind === 'tracker' && !pendingEffects(wf.effects).length && !wf.draft?.text && !wf.question) { wf.ackAt = new Date().toISOString(); store.save(wf); return reply(store, src, a, `${MARK} Got it. Still watching ${wf.code}.`) }
	if (a.verb === 'wrong' || a.verb === 'incomplete' || a.verb === 'unneeded') return mark(store, src, cfg, wf, a, procs)
	if (a.verb === 'every' || a.verb === 'extend') return retune(store, src, wf, a)
	// A finished item can still be asked about: the answer runs in its own session and nothing is sent (dogfood: keep talking after the reply).
	// "Needs me" on a Catch up line: the FYI call was wrong. It is drafted for the owner, and the next run learns from it.
	if (a.verb === 'mine') {
		if (wf.state !== 'done' || !wf.fyi || wf.sent) return reply(store, src, a, `${MARK} ${wf.code} is not in Catch up, so nothing changed.`)
		store.log({ event: 'notfyi', workflowId: wf.id, code: wf.code, chat: wf.chat.id, asker: wf.asker, intent: wf.intent, ask: wf.lastAsk?.slice(0, 400), text: wf.fyi.line })
		Object.assign(wf, { state: 'running', needsMe: true, fyi: undefined, intent: undefined, startedBy: wf.startedBy === 'room' ? undefined : wf.startedBy, status: 'Drafting: you said this one needs you' })
		store.save(wf)
		return reply(store, src, a, `${MARK} Drafting a reply to ${wf.asker?.name ?? 'them'} (${wf.code}). It waits for your ok.`)
	}
	if (reopenable(wf, a.verb)) Object.assign(wf, { state: 'needs_human', startedBy: wf.startedBy === 'room' ? undefined : wf.startedBy, intent: undefined })
	if (wf.state === 'done' && a.verb !== 'more' && a.verb !== 'undo' && a.verb !== 'ask') return reply(store, src, a, `${MARK} ${wf.code} is already done: ${wf.status}`)
	// While its session is open in a window, the owner works there; nothing here acts on it (R-WF-07).
	if (a.verb !== 'more' && heldBy(store, wf) === 'window') return reply(store, src, a, `${MARK} ${wf.code} is open in a window. Close the window first.`)
	// An ok, or a send that also makes changes, older than the item's last change approves something the owner has not seen (review 01-04 P0, final review P0-1).
	const effectsLeft = (pendingEffects(wf.effects).length > 0)
	// seenAt "" means a text surface never displayed this item: the owner is shown it first (review 085 P0-1).
	if ((a.verb === 'ok' || ((a.verb === 'edit' || a.verb === 'send') && effectsLeft)) && a.seenAt !== undefined && wf.revAt && (a.seenAt === '' || a.seenAt < wf.revAt) && (wf.state === 'needs_human' || wf.state === 'scheduled')) {
		store.markShown([wf])
		// The owner's own words already went: only the change they promised is left, with no reply to show (Slice 3).
		if (wf.sent && !wf.draft?.text && effectsLeft) return reply(store, src, a, `${MARK} Here is ${wf.code} first. Nothing was changed. ${saidLine(pendingEffects(wf.effects))}: ok will ${effectLine(pendingEffects(wf.effects))}. Say "ok ${wf.code}" to do it.`)
		if (a.seenAt === '') return reply(store, src, a, `${MARK} Here is ${wf.code} first. Nothing was sent. ${wf.asker?.name ?? 'They'} asked: "${(wf.lastAsk ?? '').slice(0, 200)}". ${effectsLeft ? `ok will ${effectLine(pendingEffects(wf.effects))}, then reply` : 'Reply'}: "${wf.draft?.text ?? ''}". Say "ok ${wf.code}" to send it.`)
		return reply(store, src, a, `${MARK} ${wf.code} changed after you looked. Nothing was sent or changed. It now ${effectsLeft ? `will ${effectLine(pendingEffects(wf.effects))}, then reply: "${wf.draft?.text ?? ''}"` : wf.draft?.text ? `says: "${wf.draft.text}"` : `asks: ${wf.question ?? wf.status}`}. Say "more ${wf.code}" to see it, then "ok ${wf.code}".`)
	}
	// The owner's own words went out and a check of what they promised failed: ok runs it once more (Slice 3).
	if (a.verb === 'ok' && wf.promise?.state === 'failed' && !wf.draft?.text) { const r = checkAgain(store, wf); store.save(wf); return reply(store, src, a, `${MARK} ${r}`) }
	// The reply already went and the change it promised waits: new words would be a second reply, so they wait until it is settled.
	if ((a.verb === 'send' || a.verb === 'edit') && a.text && wf.sent && wf.promise?.state === 'offered') return reply(store, src, a, `${MARK} ${wf.code}'s reply already went to ${wf.asker?.name?.split(/\s+/)[0] ?? 'them'}. Say "ok ${wf.code}" to ${doLine(pendingEffects(wf.effects))}, or "skip ${wf.code}".`)
	if (a.verb === 'ok') { const r = okRelay(store, wf); if (r) { store.save(wf); return reply(store, src, a, `${MARK} ${r}`) } }
	// New words on an item with changes are a preview that shows the changes again, never an approval of both (next action).
	if (a.verb === 'send' && a.text && effectsLeft) a = { ...a, verb: 'edit' }
	switch (a.verb) {
		case 'skip':
			wf.needsMe = undefined
			// A skipped draft's edit never went out, so it is not carried to the next draft (R-NEX-11).
			wf.learnAfter = undefined
			if (wf.kind !== 'tracker' && wf.draft && !wf.sent) store.log({ event: 'skipped', workflowId: wf.id, code: wf.code, chat: wf.chat.id, intent: wf.intent, asker: wf.asker, ask: wf.lastAsk?.slice(0, 400), draft: wf.draft.text })
			if (wf.kind !== 'tracker' && wf.draft && !wf.sent) outcome(store, wf, 'skipped')
			withdraw(store, procs, wf)
			dropPromise(store, wf)
			// Skipping a reply on open work drops only that reply (R-WRK-08).
			if (inWork(store, wf)) { const home = homeOf(store, wf); step(home, `${wf === home ? '' : `${wf.code}: `}You skipped a reply`); newTurn(wf, !!wf.sent); Object.assign(wf, { state: 'open', status: statusOf(home), pending: [] }); if (home !== wf) store.save(home); break }
			if (wf.kind === 'tracker') stopTracker(store, procs, wf)
			close(wf, wf.kind === 'tracker' ? 'Stopped watching' : 'Skipped by you')
			if (wf.kind !== 'tracker') wf.closedBy = 'skipped'
			break
		case 'more':
			if (a.surface === 'self') { await say(store, src, plain(`${MARK} ${renderMore(wf, store.thread(wf.id), new Date())}`).slice(0, 1800)); store.markShown([wf]) }
			return
		case 'pick': {
			const r = pick(store, cfg, wf, a)
			if (r) return reply(store, src, a, `${MARK} ${r}`)
			// A ready option is a preview now; it is shown where the owner picked, so their ok approves exactly it.
			if (wf.state === 'needs_human') { store.save(wf); store.markShown([wf]); return reply(store, src, a, renderPreview(wf)) }
			break
		}
		case 'ask':
			// A question to Delegate about the item: answered in its own session, shown in the card, never sent (design-spec S12).
			wf.notes = [...(wf.notes ?? []), { q: a.text!, at: new Date().toISOString() }]
			store.save(wf)
			return reply(store, src, a, `${MARK} Asking about ${wf.code}. The answer comes back here; nothing is sent to ${wf.asker?.name ?? 'anyone'}.`)
		case 'answer':
			withdraw(store, procs, wf)
			// The reply already went and its promised change waits, or its check failed: the owner's answer is a new turn, whose own
			// reply can go; the promise is checked again once it rests (re-review P1-1, P1-2).
			if (wf.sent) reopenPromise(store, wf)
			// A tracker's question goes back to its own job, not to the reply worker.
			if (wf.kind === 'tracker' && wf.job && store.job(wf.job)) {
				const job = store.job(wf.job)!
				// A live check keeps running; the answer is picked up by one more run right after it (tester 06-07 P1-3).
				Object.assign(job, { asks: [...job.asks, `Owner: ${a.text}`], ...(job.state === 'running' ? {} : { state: 'queued', purpose: 'work' }) })
				store.saveJob(job)
				Object.assign(wf, { state: 'waiting_on_task', question: undefined, status: 'Checking again with your answer', waitingSince: new Date().toISOString() })
				break
			}
			// "tested" (or a time window), or a result from Report, on validate work: its job reads the results for that window and drafts
			// the report, held for ok (owned work, R-NEX-05).
			if (wf.job && store.job(wf.job) && isValidate(store.job(wf.job), wf) && (saysTested(a.text) || reportsResult(a.text))) {
				const job = store.job(wf.job)!
				Object.assign(job, { asks: [...job.asks, testedAsk(homeOf(store, wf), a.text!)], ...(job.state === 'running' ? {} : { state: 'queued', purpose: 'work', error: undefined }) })
				store.saveJob(job)
				Object.assign(wf, { state: 'waiting_on_task', question: undefined, status: 'Reading the results of your test and drafting the report', waitingSince: new Date().toISOString() })
				break
			}
			Object.assign(wf, { ownerAnswer: a.text, state: 'running', status: 'Rewriting with your answer' })
			break
		case 'edit': {
			// edit changes the draft and shows it; only ok or send makes it go out (persona test P0).
			if (wf.state === 'waiting_on_task' || wf.state === 'running') return reply(store, src, a, `${MARK} ${wf.code} is still working. I'll show the draft first.`)
			const original = wf.learnAfter?.draft ?? wf.draft?.text
			// An edit is never approved: a scheduled automatic send is cancelled and waits for ok (final review P0-3).
			Object.assign(wf, { state: 'needs_human', sendAt: undefined, approved: undefined, draft: { ...(wf.draft ?? { commitment: false, sources: [] }), text: a.text!, preview: true, byOwner: true, ownWords: ownWords(wf, a.text!) }, question: undefined, revAt: new Date().toISOString(), status: 'Edited by you', learnAfter: original ? { draft: original, sent: a.text! } : undefined })
			store.save(wf)
			store.markShown([wf])
			const left = pendingEffects(wf.effects)
			return reply(store, src, a, `${MARK} Updated ${wf.code}: "${a.text}". Nothing sent. ${left.length ? `ok will also: ${effectLine(left)}. Say "ok ${wf.code}" to do both, or "ok ${wf.code} except ${left.map((_, i) => i + 1).join(' ')}" to send only the reply.` : `Say "ok ${wf.code}" to send it.`}`)
		}
		case 'ok':
			// ok approves the draft the owner saw; a rewrite in progress has no such draft yet (review P1-1).
			// A draft with a blank or an open question is not ready to send (persona test P0).
			if (wf.state === 'needs_human' && (wf.question || /_{3,}/.test(wf.draft?.text ?? ''))) return reply(store, src, a, `${MARK} ${wf.code} is not ready: ${wf.question ?? 'the draft has a blank to fill'}. Reply "${wf.code}: your answer", and I'll show the new draft.`)
			if (wf.state === 'running') return reply(store, src, a, `${MARK} ${wf.code} is being rewritten with your answer. I'll show the new draft first.`)
		// falls through
		case 'send': {
			if (wf.state === 'waiting_on_task') return reply(store, src, a, `${MARK} ${wf.code} is still working. I'll show the result first.`)
			// The owner's own words: learned from once they really go out (R-LRN-01).
			if (a.verb === 'send' && a.text) {
				const original = wf.learnAfter?.draft ?? wf.draft?.text
				if (original && original.trim() !== a.text.trim()) wf.learnAfter = { draft: original, sent: a.text }
				wf.draft = { ...(wf.draft ?? { commitment: false, sources: [] }), text: a.text, byOwner: true, ownWords: ownWords(wf, a.text) }
			}
			// An item with changes on other systems makes them first; the reply follows when all are done (R-HIL-21).
			// New messages are read first, so a "never mind" stops the changes too (tester P1-4).
			if (wf.job && (pendingEffects(wf.effects).length > 0)) {
				if (await askGone(store, src, cfg, wf, a)) { store.save(wf); return }
				const t = await threadSince(store, src, cfg, wf, '')
				if (t.ownerReplied || t.asker) {
					if (t.ownerReplied) { close(wf, 'You replied yourself'); wf.closedBy = 'replied' }
					else Object.assign(wf, { state: 'running', status: 'New messages arrived. Redrafting.' })
					store.save(wf, true, t.ownerReplied ? { askAt: askAtOf(store.thread(wf.id), wf.msgIds), replyAt: t.ownerAt } : undefined)
					return reply(store, src, a, `${MARK} Not done ${wf.code}: ${t.ownerReplied ? 'you already replied in the chat' : 'new messages since the draft. I will redraft first'}.`)
				}
			}
			// "ok A6 #1 #3" makes only those changes; the rest are unchecked on the item and its job alike (design-spec S6).
			if (a.nums?.length) {
				const r = only(store, wf, a.nums)
				if (typeof r === 'string') return reply(store, src, a, `${MARK} ${r}`)
				// Only the reply is left, and it was written counting on the changes left out: it is quoted, and a new ok sends it (review 10-21 P2-10).
				// The owner's own words too, when a change left out failed, may have been made, or was a vote dropped as not needed: they
				// still count on it ("Send reply only", review chui P1-1).
				// A change refused at ok (switched off in Settings, say) and then left out is not made either (re-review N3).
				const pr = prTarget(store, wf), unmade = r.some(e => e.error || e.maybe || !!refusal(cfg, e, pr)) || voteDropped(wf.status)
				// Then the reply is quoted even with other changes still to make, whose run would send it by itself (re-review N2).
				// A change left out by choice, while others are made, stays one ok (design-spec S6).
				const rest = pendingEffects(wf.effects).length
				if (wf.draft?.text && (rest ? unmade : !wf.draft.byOwner || unmade)) {
					wf.revAt = new Date().toISOString()
					store.save(wf); store.markShown([wf])
					return reply(store, src, a, `${MARK} ${rest ? `The reply was written counting on the changes you left out, and it says: "${wf.draft.text}" Say "ok ${wf.code}" to make the rest and send it as it is` : `Only the reply goes now, and it says: "${wf.draft.text}" It was written counting on the changes you left out. Say "ok ${wf.code}" to send it as it is`}, or "edit ${wf.code}: <text>" to change it.`)
				}
			}
			// A vote on a pull request is checked against the PR as it is now, after the owner's choice of changes.
			// A deploy is checked against its ring and PR as they are now; if either moved, it is drawn again, not run (owned work).
			const stale = await recheckPr(store, wf, probe) ?? await recheckDeploy(store, wf, probe)
			if (stale && wf.promise && wf.sent && !wf.draft?.text) {
				// The owner's own words already went (Slice 3). A closed PR leaves nothing to make, so the item rests; a PR that moved
				// asks to review again, as a new turn whose vote and reply both wait for ok (re-review P1-3, P2-2).
				if (!pendingEffects(wf.effects).length) { const why = wf.status; rest(store, wf); store.save(wf); return reply(store, src, a, `${MARK} Not done ${wf.code}: ${why}. Nothing was changed; its reply already went.`) }
				if (asksReviewAgain(wf.code, wf.question)) { const keep = { question: wf.question, status: wf.status }; newTurn(wf); Object.assign(wf, { ...keep, promise: undefined, state: 'needs_human', revAt: new Date().toISOString() }) }
			}
			if (stale) { store.save(wf); store.markShown([wf]); return reply(store, src, a, `${MARK} ${stale}`) }
			const held = approveEffects(store, cfg, wf, !!a.again)
			if (held !== undefined) { store.save(wf); return reply(store, src, a, `${MARK} ${held || `Posting ${wf.code}'s ${effectLine(pendingEffects(wf.effects))} now${wf.draft?.text ? ', then sending the reply' : ''}.`}`) }
			// The owner left out every change their own words promised, and the reply already went: nothing is left to do (Slice 3).
			if (wf.promise && wf.sent && !wf.draft?.text) { rest(store, wf); store.save(wf); return reply(store, src, a, `${MARK} Nothing was changed for ${wf.code}; its reply already went.`) }
			await send(store, src, cfg, wf, wf.draft?.text, { answer: a })
			break
		}
		case 'undo':
			await undo(store, src, cfg, wf, a)
			break
	}
	wf.newCount = 0
	store.save(wf)
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
		schema: 1, id: ulid(), code: store.nextCode(), kind: 'reply', state: 'running', key: { type: 'thread', id: w.chat.id },
		chat: { id: w.chat.id, name: w.chat.name, test: false, group: kindOf(w.chat.id) !== 'oneOnOne' }, asker: { id: `asked:${w.to[0].toLowerCase()}`, name: who },
		session: { agent: cfg.agent.flavor, id: randomUUID() }, lastMsgId: w.msgId, pending: [w.msgId], msgIds: [w.msgId], lastAsk: w.text,
		followUp: who, status: `Drafting a follow-up to ${who}`, newCount: 0, createdAt: now, updatedAt: now,
	}
	const recent = await src.recent(w.chat.id, 20).catch(() => [])
	store.saveThread(wf.id, recent.filter(r => r.from).map(r => ({ id: r.id, at: r.at, from: r.from!, text: r.html ? htmlToText(r.body) : r.body, byOwner: r.from!.id === cfg.owner.id })))
	store.save(wf)
	// The wait stays open until they answer; the follow-up item is linked so the page does not show both.
	store.saveWaiting(store.waiting().map(x => (x.code === w.code ? { ...x, item: wf.code } : x)))
	return `Drafting a follow-up to ${who} as ${wf.code}. You'll see it before anything is sent.`
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
		if (v && busy) for (const e of v.effects.filter(e => isDeploy(e.call))) v.todos.push(`${e.summary.replace(/[.\s]+$/, '')}. Not made for you: ${busy}`)
		if (v?.todos.length) wf.todos = [...new Set([...(wf.todos ?? []), ...v.todos])]
		const effects = v ? v.effects.filter(e => !busy || !isDeploy(e.call)) : own ? undefined : wf.effects
		if (job && effects !== wf.effects) { job.result = { summary: job.result?.summary ?? 'Chosen by the owner', effects: effects ?? [] }; store.saveJob(job) }
		else if (!job && effects?.length) changesJob(store, cfg, wf, effects.map(e => ({ ...e })))
		Object.assign(wf, { draft: { ...(wf.draft ?? { commitment: false, sources: [] }), text: o.reply, preview: true, byOwner: undefined, ownWords: undefined }, learnAfter: undefined, effects, question: undefined, picked: nums, revAt: now, status: `You picked "${o.label}"` })
		return undefined
	}
	Object.assign(wf, { ownerAnswer: `The owner picked: ${chosen.map(o => o.label).join('; ')}`, picked: nums, state: 'running', status: 'Rewriting with your choice' })
	return undefined
}

// The numbers are the order the changes are shown in: only those still to make.
// Returns why the numbers are refused, or the changes it left out.
function only(store: Store, wf: Workflow, nums: number[]): string | Effect[] {
	const left = pendingEffects(wf.effects)
	// [0]: "except" named every change, so only the reply goes.
	const none = nums.length === 1 && nums[0] === 0
	if (!none && nums.some(n => n < 1 || n > left.length)) return `${wf.code} has changes 1 to ${left.length}.`
	const keep = new Set(nums.map(n => left[n - 1]))
	const job = wf.job ? store.job(wf.job) : undefined
	const offIdx = (wf.effects ?? []).map((e, i) => (left.includes(e) && !keep.has(e) ? i : -1)).filter(i => i >= 0)
	for (const i of offIdx) {
		wf.effects![i] = { ...wf.effects![i], off: true }
		// By change, not by place: the item and its job may list the same changes in another order (review 10-21d P2-3).
		const j = job?.result?.effects.findIndex(x => pendingEffects([x]).length && sameChange(x, wf.effects![i])) ?? -1
		if (j >= 0) job!.result!.effects[j] = { ...job!.result!.effects[j], off: true }
	}
	if (job) store.saveJob(job)
	return left.filter(e => !keep.has(e))
}

const norm = (t: string) => htmlToText(t).replace(/\s+/g, ' ').trim()
// The owner's words differ from what Delegate drafted, or it drafted nothing: they may promise something new (Slice 3).
const flat = (t: string) => t.replace(/\s+/g, ' ').trim()
function ownWords(wf: Workflow, text: string): true | undefined {
	const theirs = wf.learnAfter?.draft ?? (wf.draft?.byOwner ? undefined : wf.draft?.text)
	return !theirs || flat(theirs) !== flat(text) ? true : undefined
}
// Letters and digits only: a post carries our text after the quote it answers, with tags and mentions in between (review 10-20 R1c).
const squash = (t: string) => norm(t).replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

export type SendBy = { answer?: Answer; ruleId?: string }

// The ask a reply answers must still be there as it was: deleted closes the item, edited redrafts it (scenario 09C, tester 06-07 P1-7).
async function askGone(store: Store, src: Source, cfg: Config, wf: Workflow, a: Answer): Promise<boolean> {
	const id = wf.msgIds.at(-1)
	if (!id || !wf.chat.id) return false
	const m = (await src.recent(wf.chat.id, 30)).find(x => x.id === id)
	if (!m) return false
	if (m.deleted || !m.body.trim()) {
		close(wf, 'The message was deleted')
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${wf.asker?.name ?? 'they'} deleted the message.`)
		return true
	}
	const now = classify(m, { ownerId: cfg.owner.id, ownerName: cfg.owner.name, aliases: cfg.aliases, test: wf.chat.test, group: !!wf.chat.group, sentIds: new Set() })
	const thread = store.thread(wf.id)
	const was = thread.find(x => x.id === id)
	if (!was || now.kind === 'skip' || norm(now.text) === norm(was.text)) return false
	store.saveThread(wf.id, thread.map(x => (x.id === id ? { ...x, text: now.text } : x)))
	Object.assign(wf, { state: 'running', lastAsk: now.text, pending: [id], approved: undefined, status: 'The message was edited. Redrafting.' })
	await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${wf.asker?.name ?? 'they'} edited the message. I will redraft first.`)
	return true
}

// What happened in the thread since the item's last ask: a newer ask from the asker, the owner's own reply, or our exact text.
async function threadSince(store: Store, src: Source, cfg: Config, wf: Workflow, want: string, signed = false) {
	const fresh = await src.newMessages(wf.chat.id, wf.lastMsgId)
	const c = { ownerId: cfg.owner.id, ownerName: cfg.owner.name, aliases: cfg.aliases, test: wf.chat.test, group: !!wf.chat.group, sentIds: store.sentIds() }
	const openHere = store.openInChat(wf.chat.id)
	const claimed = new Set(openHere.filter(o => o.id !== wf.id).flatMap(o => o.msgIds))
	let asker: string | undefined, ours = false, ownerReplied = false, ownerAt: string | undefined
	for (const m of fresh.msgs) {
		// Reconcile before sending: our earlier send may have landed even if we never recorded it (R-STO-06).
		// Checked before classify, which skips marked text.
		// Only a post never recorded can be ours landing late: another item's recorded reply, even with the same words, never counts (review 10-20).
		// Ending the same way counts only for a signed reply: the signature is in the post. Unsigned, only the exact text is ours.
		if (m.from?.id === cfg.owner.id && want && !c.sentIds.has(m.id) && (norm(m.body) === want || signed && squash(m.body).endsWith(squash(want)))) { ours = true; continue }
		const k = classify(m, c)
		if (k.kind === 'ask' && k.from.id === wf.asker?.id && !claimed.has(m.id)) asker = m.id
		if (k.kind !== 'owner') continue
		// A message open work already took as a step belongs to an earlier turn.
		if (homeOf(store, wf).work?.steps.some(s => s.ref === `owner:${m.id}`)) continue
		if (ownerAnswered(k.text, wf, openHere.length)) { ownerReplied = true; ownerAt ??= m.at }
	}
	return { asker, ours, ownerReplied, ownerAt }
}

export async function send(store: Store, src: Source, cfg: Config, wf: Workflow, text: string | undefined, by: SendBy): Promise<boolean> {
	// After approved changes the reply goes out later; the result goes back to where the owner said ok.
	const a = by.answer ?? { id: '', code: wf.code, verb: 'ok', surface: wf.answerSurface ?? 'chat', at: '' } as Answer
	const p = { ...DEFAULT_POLICY, ...cfg.policy }
	// Only text no human approved carries the disclosure marker (R-POL-10).
	// Automatic sends always carry the signature (R-POL-10); approved ones too when the owner asks, unless they wrote the words.
	const out = text && (by.ruleId || (signsApproved(cfg) && !wf.learnAfter && !wf.draft?.byOwner)) ? withMarker(text, signatureOf(cfg), cfg.owner.name) : text
	if (heldBy(store, wf) === 'window') {
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: it is open in a window.`)
		return false
	}
	if (await askGone(store, src, cfg, wf, a)) return false
	const { asker, ours, ownerReplied, ownerAt } = await threadSince(store, src, cfg, wf, out ? norm(mdToHtml(out)) : '', !!out && out !== text)
	if (ownerReplied) {
		if (inWork(store, wf)) { const home = homeOf(store, wf); Object.assign(wf, { state: 'open', status: statusOf(home), pending: [] }); step(home, `${wf === home ? '' : `${wf.code}: `}You replied in the chat yourself`); newTurn(wf, !!wf.sent); if (home !== wf) store.save(home) }
		else { const askAt = askAtOf(store.thread(wf.id), wf.msgIds); close(wf, 'You replied yourself'); wf.closedBy = 'replied'; store.save(wf, true, { askAt, replyAt: ownerAt }) }
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: you already replied in the chat.`)
		return false
	}
	// Membership can change after drafting. An automatic send that quotes labeled content asks again first; a failed read holds it (review 085 P0-2).
	if (by.ruleId && wf.draft?.sources.some(s => s.label)) wf.chat.guests = await src.members?.(wf.chat.id).then(m => m.guests, () => undefined)
	const gate = sendGate(wf, text, {
		paused: !!cfg.paused || store.control().paused, ownerApproved: !by.ruleId, draftOnly: !by.ruleId,
		newestThreadMsgId: asker ?? wf.lastMsgId, alreadyReplied: !!wf.sent || ours, ruleAllows: !!by.ruleId,
	})
	if (!gate.send) {
		if (gate.rerun) Object.assign(wf, { state: 'running', status: 'New messages arrived. Redrafting.' })
		if (ours) close(wf, 'Sent earlier')
		if (by.ruleId && !gate.rerun && !ours) Object.assign(wf, { state: 'needs_human', sendAt: undefined, status: `Not sent automatically: ${gate.reason}` })
		await reply(store, src, a, `${MARK} Not sent ${wf.code}: ${gate.reason}.`)
		return false
	}
	// Anyone in the chat the reply names with "@" is tagged, not only the asker (dogfood 10-20: "@Christian" stayed plain text).
	const named = /@\p{L}/u.test(out!) && (wf.chat.group || kindOf(wf.chat.id) !== 'oneOnOne') ? (await membersOf(store, src, wf.chat.id), store.members()[wf.chat.id]?.names) : undefined
	const { msgId } = await src.send(wf.chat.id, out!, replyContext(wf, out!, named, cfg.owner.id))
	// Persist the send before anything else can fail, so a retry never sends twice.
	store.addSent(msgId, out!)
	// Edited: the words going out are the owner's, from an edit or their own text; a new draft drops the mark (R-NEX-11).
	// learnAfter is not proof: it is learning state, and a correction a rule sent leaves it set.
	const askAt = askAtOf(store.thread(wf.id), wf.msgIds), edited = !!wf.draft?.byOwner
	// Changes left out before this reply: removed by the owner, or dropped as no longer needed (a vote on a PR that closed). Either way the reply
	// counted on them and needed a second look, so it is not "handled as proposed" (R-NEX-11).
	// Every new draft replaces effects, so an off change here belongs to this reply's turn.
	const changesOff = (wf.effects ?? []).filter(e => e.off).length
	wf.needsMe = undefined
	wf.sent = { msgId, at: new Date().toISOString(), text, byRule: by.ruleId, undoUntil: by.ruleId ? new Date(Date.now() + p.undoMin * 60_000).toISOString() : undefined }
	keepTodos(wf, wf.sent.at)
	const home = homeOf(store, wf)
	if (home.work) { afterSend(wf, out!, msgId, home); if (!active(home)) { stopWatch(store, home); closeFamily(store, realProcs, home, home.work.closed?.why ?? 'closed') } if (home !== wf) store.save(home) }
	else close(wf, by.ruleId ? `Sent by rule ${by.ruleId}: "${text!.slice(0, 70)}"` : `Sent: "${text!.slice(0, 80)}"`)
	// The owner's own words may promise what the draft did not: a short run checks, after the reply is out (Slice 3).
	if (promiseDue(store, wf, by)) notePromise(store, wf, text!)
	wf.sendAt = undefined
	wf.newCount = 0
	store.save(wf)
	store.log({ event: 'sent', workflowId: wf.id, code: wf.code, chat: wf.chat.id, asker: wf.asker, intent: wf.intent, unchanged: !by.ruleId && a.verb === 'ok' && !edited, v: 2, edited, ...(changesOff ? { changesOff } : {}), ...(wf.draft?.holding ? { holding: true } : {}), ...(askAt ? { askAt } : {}), msgId, approvedBy: by.ruleId ? `rule:${by.ruleId}` : 'owner', surface: a.surface, verb: a.verb, text: out, draft: wf.learnAfter?.draft, sources: wf.draft?.sources ?? [], confidence: wf.decision?.confidence })
	outcome(store, wf, 'sent', { draft: wf.learnAfter?.draft ?? text, sent: text, approvedBy: by.ruleId ? `rule:${by.ruleId}` : 'owner', msgId })
	// A correction that went out teaches what the first reply got wrong, the same way an edit does.
	if (wf.correction) { wf.learnAfter = { draft: wf.correction.sent, sent: `${out}${wf.correction.note ? `\n(The owner's note: ${wf.correction.note})` : ''}` }; wf.correction = undefined }
	// The owner changed the draft before it went out: a short background run checks whether the facts changed (R-LRN-01).
	// The check-back the reply promised starts once the reply is out (B19).
	// On open work the watch belongs to the item itself: its news comes back here, with no second code (R-WRK-04).
	const watching = wf.follow && !wf.follow.code ? (active(home) ? startWatch(store, home, wf.follow) : startFollow(store, wf.follow)) : undefined
	if (watching && home !== wf) store.save(home)
	if (watching) { wf.follow = { ...wf.follow!, code: watching }; store.save(wf) }
	if (wf.learnAfter && !by.ruleId) { learnFrom(store, cfg, wf, wf.learnAfter.draft, wf.learnAfter.sent); wf.learnAfter = undefined; store.save(wf) }
	if (!by.ruleId) await reply(store, src, a, `${MARK} Sent ${wf.code} to ${wf.asker?.name ?? wf.chat.name}.${watching ? ` Watching ${wf.follow!.target} every ${wf.follow!.everyHours ?? 4} h as ${watching}; it stops after 7 days unless you extend it.` : ''}${wf.todos?.length ? ` Still yours to do: ${wf.todos.join('; ')}.` : ''}`)
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

async function reply(store: Store, src: Source, a: Answer, text: string) {
	// The surface that acted reads its own result, so a refusal is never shown as success (final review P1-2).
	if (a.id) store.addOutcome(a.id, text.replace(new RegExp(`^${MARK}\\s*`), ''))
	if (a.surface === 'chat' || a.surface === 'panel') return store.addReceipt(text.replace(new RegExp(`^${MARK}\\s*`), ''))
	if (a.surface !== 'self') return
	try { await say(store, src, text) } catch (e) { store.log({ event: 'ack-failed', code: a.code, error: String(e) }) }
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
	if (v === 'pause' || v === 'stop') for (const w of store.workflows().filter(w => w.state === 'scheduled' || w.approved)) {
		// Pause withdraws every pending ok, and stops change runs nobody else approves (tester P1-2).
		if (w.approved) withdraw(store, procs, w)
		Object.assign(w, { state: 'needs_human', sendAt: undefined, waitingSince: undefined, held: 'paused', status: w.job ? `Held: you paused. Some changes may be done; ok ${w.code} retries the rest` : 'Held: you paused' })
		store.save(w)
	}
	// Resume sends nothing; what was held waits for the owner's Send, no longer marked as held by the pause.
	if (v === 'resume') for (const w of store.workflows().filter(w => w.held)) { w.held = undefined; if (/^Held: you paused/.test(w.status)) w.status = 'Ready to send: held while you were paused'; store.save(w) }
	await reply(store, src, a, `${MARK} ${CONTROL_REPLY[v]}`)
}

// Undo deletes an automatic reply during its window and turns the item back into a draft (R-POL-04).
async function undo(store: Store, src: Source, cfg: Config, wf: Workflow, a: Answer) {
	if (!wf.sent?.byRule) return reply(store, src, a, `${MARK} I can't unsend a reply you approved yourself. Nothing changed. To add a correction, say "send ${wf.code}: <text>".`)
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
	Object.assign(wf, { state: 'needs_human', sent: undefined, status: 'Undone by you. The draft is kept.' })
	await reply(store, src, a, `${MARK} Undid ${wf.code} (message ${how}). It is back in your inbox as a draft.`)
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
		if (rule && Date.now() < Date.parse(wf.sent.undoUntil ?? '')) { await undo(store, src, cfg, wf, a); store.save(wf); return held ? reply(store, src, a, `${MARK}${held}`) : undefined }
		return reply(store, src, a, `${MARK} Noted: ${wf.code} needed no reply. It is too late to take it back, so it stays in the chat.${held}`)
	}
	withdraw(store, procs, wf)
	Object.assign(wf, { correction: { kind, note: a.text, sent, at: new Date().toISOString() }, sent: undefined, sendAt: undefined, decision: undefined, approved: undefined, state: 'running', status: kind === 'wrong' ? 'Drafting a correction' : 'Drafting what was missing' })
	store.save(wf)
	return reply(store, src, a, `${MARK} Drafting a ${kind === 'wrong' ? 'correction' : 'follow-up with what was missing'} for ${wf.code}. It waits for your ok; nothing is sent.`)
}

// The owner changes how often a watch checks, or gives it 7 more days (B19).
async function retune(store: Store, src: Source, wf: Workflow, a: Answer) {
	const id = wf.work?.watch ?? wf.job, job = id ? store.job(id) : undefined
	if (!job?.every) return reply(store, src, a, `${MARK} ${wf.code} is not a watch, so nothing changed.`)
	if (a.verb === 'extend') {
		if (!job.endsAt) return reply(store, src, a, `${MARK} ${wf.code} has no end date, so there is nothing to extend.`)
		const from = Math.max(Date.now(), Date.parse(job.endsAt ?? '') || Date.now())
		job.endsAt = new Date(from + FOLLOW_DAYS * 86_400_000).toISOString()
		store.saveJob(job)
		return reply(store, src, a, `${MARK} ${wf.code} keeps watching until ${job.endsAt.slice(0, 10)}.`)
	}
	const m = /(\d+(?:\.\d+)?)\s*(m|min|minutes?|h|hrs?|hours?|d|days?)\b/i.exec(a.text ?? '')
	if (!m) return reply(store, src, a, `${MARK} Say how often, for example "every ${wf.code}: 2h". Nothing changed.`)
	const unit = m[2][0].toLowerCase(), minutes = Math.round(Number(m[1]) * (unit === 'd' ? 1440 : unit === 'h' ? 60 : 1))
	job.every = Math.min(1440, Math.max(5, minutes))
	store.saveJob(job)
	wf.status = wf.status.replace(/every \d+ min/, `every ${job.every} min`)
	store.save(wf)
	return reply(store, src, a, `${MARK} ${wf.code} now checks every ${job.every >= 60 ? `${+(job.every / 60).toFixed(1)} h` : `${job.every} min`}.`)
}

// close ends work for good; wait puts open work back in progress with a later check date (R-WRK-05, R-WRK-06).
async function workVerb(store: Store, src: Source, wf: Workflow, a: Answer, procs: Procs) {
	if (a.verb === 'close') {
		// Mark done (R-NEX-07): open to-dos a sent reply left go first, and nothing else changes. A done item is never reopened,
		// and open work stays open, so the button can never end work; a second close does that.
		// From the page, only the to-dos the owner saw: one kept after they looked stays open, and when none they saw is still open
		// the close was for them, so the work never closes by it (review N2 P2-1).
		if (a.todos && !openTodos(wf).some(t => a.todos!.includes(t.id))) return reply(store, src, a, `${MARK} ${wf.code}: the ${a.todos.length === 1 ? 'to-do you marked is' : 'to-dos you marked are'} already done. ${wf.code} stays ${wf.state === 'done' ? 'done' : 'open'}. Nothing was sent.`)
		if (openTodos(wf).length) {
			const done = doneTodos(wf, undefined, a.todos)
			store.save(wf)
			return reply(store, src, a, `${MARK} Marked ${done.length === 1 ? 'your to-do' : `your ${done.length} to-dos`} on ${wf.code} done: ${done.join('; ')}. ${wf.state === 'done' ? `${wf.code} stays done.` : `${wf.code} stays open; say "close ${wf.code}" again to close it.`} Nothing was sent.`)
		}
		if (wf.state === 'done') return reply(store, src, a, `${MARK} ${wf.code} is already closed: ${wf.status}`)
		const why = a.text?.trim() || 'Closed by you'
		const home = homeOf(store, wf)
		// A part closes only its own chat; closing the home closes every part (R-WRK-14).
		if (home !== wf) {
			withdraw(store, procs, wf)
			home.work!.parts = home.work!.parts?.filter(id => id !== wf.id)
			step(home, `${wf.code} closed: ${why}`)
			close(wf, why)
			store.save(home); store.save(wf)
			return reply(store, src, a, `${MARK} Closed ${wf.code}: ${why}. ${home.code} stays in progress. Nothing was sent.`)
		}
		withdraw(store, procs, wf)
		stopWatch(store, wf)
		if (wf.work) closeFamily(store, procs, wf, why)
		else { if (wf.kind === 'tracker') stopTracker(store, procs, wf); close(wf, why) }
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
export function closeFamily(store: Store, procs: Procs, home: Workflow, why: string) {
	if (!home.work?.closed) closeWork(home, why)
	else Object.assign(home, { state: 'done', status: `Closed: ${why}`, pending: [] })
	for (const id of home.work?.parts ?? []) {
		const p = store.workflow(id)
		if (!p || p.state === 'done') continue
		withdraw(store, procs, p)
		newTurn(p, !!p.sent)
		close(p, `Closed with ${home.code}: ${why}`)
		store.save(p)
	}
}

async function correct(store: Store, src: Source, wf: Workflow, a: Answer) {
	if (store.control().paused) return reply(store, src, a, `${MARK} Paused, so the correction for ${wf.code} was not posted. Say "resume", then send it again.`)
	const { msgId } = await src.send(wf.chat.id, a.text!)
	store.addSent(msgId, a.text!)
	store.log({ event: 'correction', workflowId: wf.id, code: wf.code, msgId, sentId: wf.sent?.msgId, text: a.text })
	// A correction is the owner's words too; one sent while the last check waits joins it, so one run reads both (Slice 3).
	if (prTarget(store, wf)) { notePromise(store, wf, a.text!); store.save(wf) }
	await reply(store, src, a, `${MARK} Posted your correction for ${wf.code}.`)
}
