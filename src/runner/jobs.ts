import { blockerOf, planRetry, retryStatus } from './retry.ts'
import { NAME } from '../brand.ts'
import { active, afterSend, canCloseApproval, canCloseReport, hasDecisions, homeOf, linksIn, mergeReportWork, newTurn, pendingParts, reReviewAsk, step, watchEnded, watchNews } from './work.ts'
import { confidence, reviewRuleFor } from '../core/policy.ts'
import { clearHold, keepApprovedDraft } from '../core/owner-send.ts'
import { refreshApprovedHolds } from './send-holds.ts'
import { PAGE_REPLY_CHANGED } from '../core/page-approval.ts'
import { uptime } from 'node:os'
import { allows, changeName, changeSays, deployBusyLeft, effectLeftAction, externalPending, INTERNAL_ACTIONS, inviteShapeProblem, isInternal, isVote, prIdOf, unsafeRead, pendingEffects, proposalEffects, refusal, refusedAsk, reviewAgain, sameHead, sameProposal, carryMarks, shown, vet, voteValue, SETUP_REFUSAL, OLD_INVITE, OLD_INVITE_ASK } from '../core/effects.ts'
import { leftRefusal, type LeftDraft } from '../core/left-lines.ts'
import { allowLeft, settleLeftRetry } from './left.ts'
import { leaveForYou, leftContext, reportLeft } from './left-source.ts'
import { adoProbe, prOf, prRefFor, prRefForJob, prTarget, prTargetForEffect, prTargetForJob, type BuildProbe } from './probe.ts'
import { reviewFrame, unitForJob } from '../core/review.ts'
import { decline, isAddMe, isReviewJob, liveOwnerVote, MAY_REVIEW, requestedReviewPrs, reviewAsked, reviewUnitGate, unitOutcome, voteGate } from './review-gate.ts'
import { noticeHabits } from './habits.ts'
import { cloneFor, cloneTodo, repoRef, visibleCloneTodos } from './repos.ts'
import { deployed, deployRunning, findingNotBlocker, isValidate, proposeTargets, shellInClone, shellTool, telemetryNote, telemetryTools } from './validate.ts'
import { toolServers } from '../adapters/mcp-client.ts'
import { isDeploy } from '../core/deploy.ts'
import { intents } from '../core/intents.ts'
import { chooseSession } from './session-policy.ts'
import { existsSync, readFileSync } from 'node:fs'
import { scrub } from '../core/secrets.ts'
import { freshRead, readPhase, writeText } from '../store/fs.ts'
import { recordCommit } from './commit.ts'
import { stateFields, statusFields } from '../core/upgrades.ts'
import { normalizeQuestionHint } from '../core/normalize-report.ts'
import { isAbsolute, join } from 'node:path'
import type { Call, Config, Effect, Job, PrUnit, Report, Retry, Workflow } from '../core/types.ts'
import { ulid } from '../core/ids.ts'
import { ran, readRun, sessionUse, type RunOutcome } from '../core/runinfo.ts'
import { jobUsageKey, rememberUsage, takeUsageContext } from './usage-backfill.ts'
import { agentProcessLog, sessionLog, startAgent, SetupError, type RunInput } from '../adapters/agent.ts'
import type { Source } from '../adapters/source.ts'
import { alive, aliveAs, killTree } from '../os/process.ts'
import { openWindow } from '../os/window.ts'
import { LOCAL_DIR, type Store } from '../store/state.ts'
import { buildJobPrompt, standingInstructionsBlock } from '../worker/prompt.ts'
import { standingInstructions } from '../core/ways.ts'
import { checked, WORKER_SERVER, WORKER_TOOLS, workerMcp, readDirs, runReads } from './dispatch.ts'
import { catalogInfo, jobToolScope, scopeTools, workerTools } from './catalog.ts'
import { isBootstrap, YOURS, type BootSource } from './bootstrap.ts'
import { knowledgeOf, propose } from './proposals.ts'
import { learnedClaims } from './learn.ts'
import { closeFamily, send } from './apply.ts'
import { reopenPromise, rest } from './promise.ts'
import { forkSession, ownerFor, sessionBytes, backupSession, restoreSession } from './own.ts'
import { dueTrackers, watchSubject } from './track.ts'
import { close } from './intake.ts'
import { hashOf } from '../knowledge/format.ts'
import { findSession, sendToSession } from '../mesh/route.ts'
import { addr, MAX_TEXT, readReceipt, settle, TTL_MS } from '../mesh/inbox.mjs'
import { clearCalling, maybeOf } from './ledger.ts'
import { removeRunFiles } from '../adapters/run-files.ts'
import { agentSetupFailure, type AgentSetupFailure } from '../core/agent-failure.ts'
import { blockedAgent, holdAgent, waitingForAgent } from './agent-health.ts'
import { internalReceipt, makeChange, makeInternalChanges, mcpCaller, serverOf, type Caller } from './change.ts'
import { builtEffectProblem, prepareReportCalls, repairPendingEffectCalls, suggestionSelector } from './effect-preparation.ts'
import { addInternalSuggestions } from './internal-effects.ts'
import { legacyEffectOrigins } from '../core/normalize-report.ts'
import { checkReviewCompletion, reviewCommentHook, type ReviewCompletion } from './review-autonomy.ts'
import { pageChangeId } from '../core/page-approval.ts'
import { trimReviewContext } from './review-context.ts'
import { workflowJobIds } from './owner.ts'
import { bumpReviewEpoch, resetUnitReview } from './pr-review-state.ts'
export { reviewNoise } from './review-context.ts'

export type Procs = {
	start: (cfg: Config['agent'], i: RunInput & { workflowId: string; runId: string }) => { pid: number }
	alive: (pid: number) => boolean
	kill: (pid: number) => boolean
	openWindow: (title: string, argv: string[], env: Record<string, string>) => void
	// Whether a local terminal's process is still that window (continue.ts windowProcess); a test may stand in for it.
	windowAlive?: (pid: number, since: string) => boolean
	// When this machine started; a test machine may have started minutes ago.
	bootMs?: () => number
}

export const realProcs: Procs = {
	start: (cfg, i) => startAgent(cfg, i, join(LOCAL_DIR, 'sessions', `${i.runId}.log`)),
	alive: pid => aliveAs(pid),
	// A process ID that is not ours any more is never killed; its run is already gone.
	kill: pid => (aliveAs(pid) ? killTree(pid) : true),
	openWindow,
	bootMs: () => Date.now() - uptime() * 1000,
}

// The worker writes the key; the same PR asked about a day later must reach the same job even if it spells it differently.
// Azure DevOps numbers pull requests uniquely within an organization, so a PR is its organization and number.
export function canonicalKey(key: string): string {
	const k = key.trim().toLowerCase().replace(/\s+/g, '')
	const pr = /^pr:([^/]+)\/(?:.*\/)?(\d+)$/.exec(k)
	return pr ? `pr:${pr[1]}/${pr[2]}` : k
}

// An explicit ask to recheck or re-review a PR, or to approve it if ready, runs that PR's review job, whatever intent or reply the
// reply run gave (bug 10-23 E36: a status-only draft claimed a recheck no review job made). "Do not re-review" asks for none.
const RECHECK = /\b(?:re[ -]?check(?:ed|ing)?|re[ -]?review(?:ed|ing)?|review (?:it |this |the PR )?again|check (?:it )?again)\b|\bif (?:it(?:'s| is) )?ready\b[^.?!]*\bapprov|\bapprov\w*\b[^.?!]*\bif (?:it(?:'s| is) )?ready\b/i
export const asksRecheck = (text: string) => text.split(/(?<=[.!?;])\s+|\n+/).some(s => {
	const m = RECHECK.exec(s)
	return !!m && !/\b(?:do not|don't|dont|without|no need to|not|never)\b/i.test(s.slice(0, m.index))
})
export function recheckJob(store: Store, wf: Workflow): Report['job'] {
	const asks = store.thread(wf.id).filter(m => wf.pending.includes(m.id)).map(m => m.text).join('\n')
	if (!asks || !asksRecheck(asks)) return undefined
	const ref = prOf(store, wf)
	if (!ref) return undefined
	const key = canonicalKey(`pr:${ref.remote ? ref.remote.split('/')[1] : ref.project}/${ref.id}`)
	const job = store.jobs().find(j => canonicalKey(j.key) === key && (j.parents.includes(wf.id) || j.intent === 'pr_review'))
	// A change run making approved changes is left to finish; its item takes the new ask after it.
	if (job && executing(job)) return undefined
	return { key: job?.key ?? key, goal: wf.lastAsk ?? job?.goal ?? `Recheck PR ${ref.id}` }
}

export function jobForRecheck(store: Store, wf: Workflow, report: Report): Report['job'] {
	if (report.reply || hasDecisions(report) || report.intent !== 'pr_review' || !wf.pending.length || !reReviewAsk(wf.lastAsk ?? '')) return undefined
	const ref = prOf(store, wf)
	if (!ref?.remote) return undefined
	const key = canonicalKey(`pr:${ref.remote.split('/')[1]}/${ref.id}`)
	const job = store.jobs().find(j => j.parents.includes(wf.id) && canonicalKey(j.key) === key)
	if (!job || job.intent !== 'pr_review' || job.state !== 'done' && job.state !== 'failed') return undefined
	return { key: job.key, goal: wf.lastAsk ?? job.goal, branch: job.branch }
}

export function requestOneMore(store: Store, cfg: Config, wf: Workflow, job: Job, words?: string): string | undefined {
	if (!job.stopped || !job.parents.includes(wf.id) || job.carrier || job.byRule || job.purpose !== 'work')
		return 'This job no longer has a stopped work run. Open the current item.'
	if (job.state === 'running' || job.run || job.state === 'queued' && job.oneMore)
		return 'This job is already working or queued. Nothing more was started.'
	if (store.openWindow(wf.id) || workflowJobIds(wf).some(id => store.openWindow(id)) || store.openWindow(job.id))
		return 'This job is open in a window. Close it before trying again.'
	if (store.runsToday() >= (cfg.dailyRuns ?? 200))
		return `Daily AI run limit reached (${cfg.dailyRuns ?? 200}). New AI work starts tomorrow. Change the limit in Settings.`
	if (words?.trim()) job.asks.push(`Owner: ${words.trim()}`)
	Object.assign(job, { state: 'queued', purpose: 'work', oneMore: true, nextAt: undefined, error: undefined, wrapUp: undefined })
	store.saveJob(job)
	return undefined
}

// A reply worker found real work. The same key always reaches the same job and session (R-LNG-01, R-WF-11).
export function attachJob(store: Store, cfg: Config, wf: Workflow, raw: NonNullable<Report['job']>, unit?: PrUnit) {
	if (unit && (!wf.prs?.includes(unit) || !unit.ref || unit.ref.id !== unit.id))
		throw new Error('The review job has no current unit reference')
	const now = new Date().toISOString()
	const want = raw
	let job = store.jobs().find(j => canonicalKey(j.key) === canonicalKey(want.key))
	// A job for an owned kind of ask runs in a fork of that session; each job forks once (R-ADP-03).
	const { owner, why, open } = job ? {} : ownerFor(store, want.owner)
	const relay = owner && open ? { machine: open.machine, session: open.session, what: owner.what } : undefined
	const fork = owner && !relay ? forkSession(owner.session) : undefined
	// The repo is named by its remote: from the PR's own link first, else what the AI named; never a folder the AI wrote (owned work).
	const remote = unit ? unit.ref?.remote : prOf(store, wf)?.remote ?? repoRef(cfg, want.repo)
	if (job && remote && !job.remote) Object.assign(job, { remote, ...(want.branch ? { branch: want.branch } : {}) })
	job ??= { schema: 1, id: ulid(), key: want.key, goal: want.goal, intent: wf.intent, repo: owner?.cwd, ...(remote ? { remote } : {}), ...(want.branch ? { branch: want.branch } : {}), session: { agent: cfg.agent.flavor, id: chooseSession('job', relay?.session != null ? { keep: relay.session } : fork != null ? { keep: fork } : { fresh: true }) }, state: 'queued', purpose: 'work', parents: [], asks: [], relay, label: relay ? `your open session for ${relay.what} on ${relay.machine}` : owner && fork ? `your session for ${owner.what}` : why, createdAt: now, updatedAt: now }
	// A recheck of finished work resumes the same session with the new ask (scenario 04 step 5).
	if (!job.stopped && (job.state === 'done' || job.state === 'failed')) Object.assign(job, { state: 'queued', purpose: 'work', error: undefined })
	if (!job.parents.includes(wf.id)) job.parents.push(wf.id)
	const ask = `${wf.asker?.name ?? 'Someone'}: ${wf.lastAsk ?? want.goal}`, repeated = job.asks.includes(ask)
	job.asks.push(ask)
	if (want.needsCheckout !== undefined) job.needsCheckout = want.needsCheckout
	store.saveJob(job)
	const ownerMessage = store.thread(wf.id).findLast(message => message.byOwner && wf.pending.includes(message.id))
	const ownerWords = wf.ownerAnswer?.trim() || ownerMessage?.text.trim()
	const ownerRefusal = job.stopped && ownerWords ? requestOneMore(store, cfg, wf, job, ownerWords) : undefined
	if (job.stopped) {
		if (unit) unit.job = job.id
		else wf.job = job.id
		const name = wf.asker?.name.split(/\s+/)[0] ?? 'Someone'
		if (!ownerWords) step(wf, `${name} ${repeated ? 'asked again' : 'added something'}`, { ref: wf.lastMsgId })
		Object.assign(wf, { ...stateFields(wf, job.oneMore ? 'waiting_on_task' : 'needs_human'), pending: [], approved: undefined, sendAt: undefined,
			status: ownerRefusal ?? (job.oneMore ? 'Queued one more AI run; nothing is sent' : stopStatusText(job)) })
		return
	}
	// A fresh review supersedes the old turn, not unresolved non-vote writes.
	if (!unit && wf.intent === 'pr_review' && wf.pending.length && reReviewAsk(wf.lastAsk ?? '') && !executing(job)) {
		const effects = wf.effects?.filter(e => !isVote(e.call))
		newTurn(wf)
		wf.effects = effects
	}
	if (unit) {
		unit.job = job.id
		resetUnitReview(unit)
	} else {
		if (wf.intent === 'pr_review') wf.reviewAsk = { job: job.id, ids: [...wf.pending], lastMsgId: wf.lastMsgId, ownerAnswer: wf.ownerAnswer }
		if (wf.prs?.length === 1 && isReviewJob(job.key, wf.intent)) wf.prs[0].job = job.id
		Object.assign(wf, { job: job.id, ...stateFields(wf, 'waiting_on_task'), status: `Working: ${want.goal}${job.label ? ` (${job.label})` : ''}`, waitingSince: now, pending: [], question: undefined, questionHint: undefined, draft: undefined, learnAfter: undefined, approved: undefined })
	}
	// Other people's words reach the owner's own session, which has the owner's tools, only after the owner's ok (review 10-19 #5).
	// People the owner already lets the assistant answer by itself are trusted to reach the owner's own session too,
	// unless the chat has guests; anyone else waits for ok (owner, 10-20: relay should be automatic where it can be).
	// A sign-off ask always waits: the owner's session could vote or approve with the owner's own tools (next action).
	// So does a validate ask: the owner's session could run a pipeline with none of the deploy gates (review 10-21 P1-4).
	const trusted = !!wf.asker && !wf.chat.guests && !NEVER_RELAY.includes(wf.intent ?? '') && store.rules().some(r => !r.off && r.then === 'send' && r.who.accounts?.some(a => a.id === wf.asker!.id))
	if (job.relay && trusted) { job.relay = { ...job.relay, ok: job.asks.length }; store.saveJob(job) }
	if (job.relay && (job.relay.ok ?? 0) < job.asks.length) {
		const current = wf.job ? store.job(wf.job) : undefined
		if (!unit || !current?.relay || (current.relay.ok ?? 0) >= current.asks.length) {
			Object.assign(wf, { job: job.id, ...stateFields(wf, 'needs_human'), status: `Waiting for your ok to send it to your open session for ${job.relay.what} on ${job.relay.machine}`, question: `This goes to your open session for ${job.relay.what} on ${job.relay.machine}, which works with your own tools. Say "ok ${wf.code}" to send it there, or "skip ${wf.code}".`, questionHint: undefined, questionOf: undefined })
			if (unit) wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
		}
	}
}

// Intents whose asks reach the owner's own session only after the owner's ok, whoever asks.
const NEVER_RELAY = ['commitment_decision', 'validate']

const finalUnit = (unit: PrUnit) => ['reviewed', 'not-reviewing'].includes(unitOutcome(unit).outcome)
const settledUnit = (unit: PrUnit) => finalUnit(unit) || unitOutcome(unit).outcome === 'gave-up'
const reviewJobId = (unit: PrUnit) => unit.review?.completed?.job ?? unit.review?.run?.carrier ?? unit.job
const unitMayVote = (unit: PrUnit) => !!unit.requested && !unit.skip && !unit.decline && unit.read === 'ok' && !!unit.role && MAY_REVIEW.includes(unit.role) && /^active$/i.test(unit.status ?? '')

function reviewJobsFor(store: Store, wf: Workflow, unit: PrUnit) {
	const id = reviewJobId(unit), previous = id ? store.job(id) : undefined
	const legacyRun = !unit.review?.completed && wf.reviewRun?.pr === unit.id && wf.reviewRun.job === id ? wf.reviewRun : undefined
	const candidate = legacyRun ? store.job(legacyRun.carrier) : previous
	const existing = candidate && !candidate.carrier && candidate.parents.includes(wf.id) ? candidate :
		store.jobs().find(job => !job.carrier && job.parents.includes(wf.id) && isReviewJob(job.key, job.intent) &&
			(job.reviewStart?.pr === unit.id || Number(/^pr:.*?(\d+)$/i.exec(job.key)?.[1]) === unit.id))
	const window = [unit.job, unit.review?.run?.job, id, legacyRun?.carrier, existing?.id].some(id => id && store.openWindow(id))
	return { id, previous, existing, window }
}

export function advanceReviewUnits(store: Store, cfg: Config, wf: Workflow, source?: Report): boolean {
	const units = wf.prs
	if (!units?.length || wf.state === 'done' || wf.redacted || wf.kind === 'tracker' ||
		!source && wf.state === 'running' || store.openWindow(wf.id)) return false
	if (wf.intent !== 'pr_review') return false
	if (!source && units.length === 1 && units[0].requested && units[0].decline && wf.reviewDecline) return false
	const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
	const before = JSON.stringify(wf)
	const replied = wf.reviewReply?.phase === 'replied' || !!wf.sent && !wf.sent.holding && wf.sent.askMsgId === wf.lastMsgId
	const pending = new Set(wf.pending)
	const messages = store.thread(wf.id).filter(message => pending.has(message.id)).map(message => message.text).join('\n')
	const input = wf.ownerAnswer || messages || wf.lastAsk || ''
	const selected = source ? requestedReviewPrs(store, wf, source, input) : undefined
	const recheck = !!source && asksRecheck(input)
	const fresh = !!source && (wf.ownerAnswer !== undefined || wf.reviewAsk?.lastMsgId !== wf.lastMsgId)
	if (source && units.some(unit => reviewJobsFor(store, wf, unit).window ||
		fresh && selected?.has(unit.id) && unit.review?.run?.phase === 'posting')) {
		wf.status = 'The new request waits for the current PR review step'
		commit(false)
		return true
	}
	const ownedChanges = wf.job ? store.job(wf.job) : undefined
	const manual = !!ownedChanges && !ownedChanges.byRule && executing(ownedChanges)
	const additions: Effect[] = []
	let queued = 0
	for (const unit of units) {
		const wasRequested = !!unit.requested
		if (selected) {
			const next = selected.has(unit.id) ? true : undefined
			if (unit.requested !== next) {
				unit.requested = next
				bumpReviewEpoch(unit)
				wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
			}
		}
		if (!unit.requested) {
			if (source && wf.job === unit.job) {
				const current = wf.job ? store.job(wf.job) : undefined
				if (!current || !executing(current)) {
					wf.job = undefined
					if (current?.relay && (current.relay.ok ?? 0) < current.asks.length && !wf.questionOf) {
						wf.question = undefined
						wf.questionHint = undefined
					}
				}
			}
			if (source && wf.reviewDecline?.pr === unit.id) {
				wf.reviewDecline = undefined
				if (!wf.questionOf) { wf.question = undefined; wf.questionHint = undefined }
			}
			continue
		}
		if (unit.skip) continue
		const requested = !!source && (fresh || !wasRequested)
		if (requested && (finalUnit(unit) || recheck)) {
			resetUnitReview(unit)
			unit.job = undefined
		}
		if (requested && unit.decline) { unit.decline = undefined; bumpReviewEpoch(unit) }
		if (unit.decline && !requested) {
			const gate = reviewUnitGate(store, cfg, wf, unit)
			if (!gate.ok && gate.reason === 'declined' && gate.gate.addMe) additions.push(gate.gate.addMe)
			continue
		}
		if (finalUnit(unit) || replied && !requested) continue
		const gate = reviewUnitGate(store, cfg, wf, unit)
		if (!gate.ok) {
			if (gate.reason === 'declined') {
				if (!unit.decline || unit.decline.role !== gate.gate.role) {
					unit.decline = { role: gate.gate.role, at: new Date().toISOString() }
					bumpReviewEpoch(unit)
					store.log({ event: 'review-declined', workflowId: wf.id, code: wf.code, pr: unit.id, role: gate.gate.role })
				}
				if (gate.gate.addMe) additions.push(gate.gate.addMe)
				if (units.length === 1 && unit.ref) {
					if (gate.gate.addMe) wf.job = undefined
					decline(store, cfg, wf, unit.ref, gate.gate)
					if (gate.gate.addMe) carry(store, cfg, wf, wf.effects ?? [])
					commit()
					return true
				}
			}
			continue
		}
		const { id, previous, existing, window } = reviewJobsFor(store, wf, unit)
		if (unit.review?.run?.phase === 'posting' || previous && executing(previous) || window) continue
		const legacyResult = !source && existing?.state === 'done' && existing.purpose === 'work' && existing.result?.state === undefined &&
			!wf.question && !wf.ownerSend && !wf.draft?.byOwner
		if (existing && !requested && (existing.state === 'running' || existing.state === 'queued' || id !== undefined && !legacyResult)) continue
		if (id && !existing) store.log({ event: 'review-job-missing', code: wf.code, pr: unit.id, job: id })
		if (!unit.ref) continue
		const key = existing?.key ?? canonicalKey(`pr:${unit.ref.remote ? unit.ref.remote.split('/')[1] : unit.ref.project}/${unit.id}`)
		const raw = units.length === 1 && source?.job ? source.job :
			{ key, goal: `Review PR ${unit.id}. Request: ${wf.lastAsk ?? `Review PR ${unit.id}`}` }
		attachJob(store, cfg, wf, raw, units.length > 1 ? unit : undefined)
		const job = unit.job ? store.job(unit.job) : undefined
		if (job && wf.ownerAnswer) { job.asks.push(`Owner: ${wf.ownerAnswer}`); store.saveJob(job) }
		queued++
	}
	if (source) {
		const first = units.find(unit => unit.requested && unit.job)
		if (units.length > 1 && first?.job) wf.reviewAsk = { job: first.job, ids: [...wf.pending], lastMsgId: wf.lastMsgId, ownerAnswer: wf.ownerAnswer }
		wf.pending = []
		if (units.length > 1 || !units[0].requested) wf.ownerAnswer = undefined
	}
	if (units.length === 1 && queued) { wf.ownerAnswer = undefined; commit(); return true }
	const jobs = new Map<string, Job>()
	for (const unit of units) {
		if (!unit.requested) continue
		const id = reviewJobId(unit), job = id ? store.job(id) : undefined
		if (job?.parents.includes(wf.id)) jobs.set(job.id, job)
	}
	const relay = units.filter(unit => unit.requested).map(unit => unit.job ? store.job(unit.job) : undefined)
		.find(job => job?.relay && (job.relay.ok ?? 0) < job.asks.length)
	if (source && !relay) {
		wf.questionOf = undefined
		wf.question = source.question?.trim() || undefined
		wf.questionHint = wf.question && source.questionHint ? normalizeQuestionHint(source.questionHint) : undefined
	}
	if (!manual && !relay) {
		const proposed: Effect[] = []
		for (const unit of units) {
			if (!unit.requested) continue
			const id = reviewJobId(unit), job = id ? jobs.get(id) : undefined
			if (!job?.result || !['done', 'failed'].includes(job.state)) continue
			for (const effect of job.result.effects) {
				if (isVote(effect.call) && !unitMayVote(unit)) continue
				if (!proposed.some(prior => sameProposal(prior, effect))) proposed.push({ ...effect })
			}
		}
		const select = suggestionSelector(store, cfg, [wf], proposed)
		for (const effect of additions) {
			const selected = select({ ...effect, origin: 'suggested', reason: { kind: 'open-item', text: 'You are not a reviewer on this PR.' } })
			if (selected) proposed.push(...proposalEffects([selected], [wf]))
		}
		const previous = wf.effects ?? []
		const next = carryMarks(proposed, previous).map(effect => {
			const prior = previous.find(prior => sameProposal(prior, effect))
			return prior?.off && !isVote(effect.call) ? { ...effect, off: true } : effect
		})
		next.push(...previous.filter(effect => (effect.done || effect.maybe || effect.error) && !next.some(current => sameProposal(current, effect)))
			.map(effect => effect.done ? effect : { ...effect, off: true }))
		if (JSON.stringify(next) !== JSON.stringify(wf.effects ?? [])) {
			wf.effects = next
			wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
			if (!replied) wf.reviewReply = undefined
		}
		if (next.length && units.length > 1) {
			const current = wf.job ? store.job(wf.job) : undefined
			if (!current || units.some(unit => [unit.job, unit.review?.run?.job, reviewJobId(unit)].includes(current.id))) changesJob(store, cfg, wf, next)
			else if (!executing(current) && (keyOf(current.result?.effects) !== keyOf(next) || current.result?.reply?.text !== wf.draft?.text)) carry(store, cfg, wf, next)
		}
	}
	refreshReviewQuestions(store, wf)
	const allSettled = units.every(settledUnit)
	const executors = workflowJobIds(wf).map(id => store.job(id)).some(job => job && executing(job))
	const running = units.some(unit => { const id = reviewJobId(unit), job = id ? jobs.get(id) : undefined; return job?.state === 'running' || job?.state === 'queued' })
	const failed = units.flatMap(unit => { const id = reviewJobId(unit), job = id ? jobs.get(id) : undefined; return job ? [{ unit, job }] : [] })
		.find(({ unit, job }) => !settledUnit(unit) && (job.state === 'failed' || job.state === 'done' && !job.retry && !job.result?.question &&
			(job.result?.goalMet === false || job.result?.state === 'done' && !unit.review?.completed && !unit.review?.done)))
	const failedJobId = wf.runFailed?.job
	if (failed && !wf.questionOf) {
		const why = failed.job.error ?? failed.job.result?.blocker?.why ?? (failed.job.result?.state === 'done' &&
			failed.job.result.goalMet !== false ? 'The review returned no completion facts; ask to review this PR again' : 'The review job did not finish')
		wf.runFailed = { at: failed.job.updatedAt, kind: 'content', why: `PR ${failed.unit.id}: ${why}`, job: failed.job.id }
	} else if (failedJobId && units.some(unit => [unit.job, reviewJobId(unit)].includes(failedJobId))) wf.runFailed = undefined
	if (replied) {
		if (!executors && pendingEffects(wf.effects).length) Object.assign(wf, stateFields(wf, 'needs_human'))
	} else if (!allSettled || wf.question || relay || manual) {
		if (!manual && !wf.ownerSend && !wf.draft?.byOwner) wf.draft = undefined
		wf.reviewReply = undefined
		wf.sendAt = undefined
		if (!relay && !manual) Object.assign(wf, { ...stateFields(wf, executors || running && !wf.questionOf && !wf.runFailed && !pendingEffects(wf.effects).length ? 'waiting_on_task' : 'needs_human'),
			status: wf.questionOf ? `PR ${wf.questionOf.pr} needs your answer` : wf.question ? 'Your answer is needed' : wf.runFailed ? `Couldn't finish: ${wf.runFailed.why}` :
				running ? 'Reviewing the PRs in this ask' : 'Checking the PRs in this ask' })
	} else if (units.length > 1 || units.some(unit => !unit.requested || unit.skip || unit.read === 'gave-up' || unit.review?.done)) {
		const reviewed = units.filter(unit => unitOutcome(unit).outcome === 'reviewed')
		if (!reviewed.length && units.every(unit => unitOutcome(unit).outcome === 'not-reviewing') && wf.startedBy === 'room') {
			close(wf, 'Not reviewing the PRs in this room ask')
			wf.closedBy = 'nothing'
		} else if (!wf.ownerSend && !wf.draft?.byOwner) {
			const text = units.map(unit => unitOutcome(unit).outcome !== 'reviewed' ? `I didn't review PR ${unit.id}.` :
				unit.review?.done ? reviewFrame(unit.id, unit.review.done.counts) : `Reviewed PR ${unit.id}.`).join(' ')
			const sources = reviewed.flatMap(unit => { const id = reviewJobId(unit); return id ? jobs.get(id)?.result?.reply?.sources ?? [] : [] })
			const draft = { text, commitment: false, sources: [...new Map(sources.map(source => [source.ref, source])).values()] }
			const todos = [...new Set(reviewed.flatMap(unit => { const id = reviewJobId(unit); return id ? jobs.get(id)?.result?.todos ?? [] : [] }))]
			if (JSON.stringify([wf.draft, wf.todos]) !== JSON.stringify([draft, todos])) {
				wf.draft = draft
				wf.todos = todos
				wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
			}
			Object.assign(wf, { ...stateFields(wf, executors ? 'waiting_on_task' : 'needs_human'), ...(!wf.statusReason ? { status: 'The PR reviews are ready' } : {}) })
			const rule = reviewed[0]?.review?.done?.byRule
			const ready = !!rule && !wf.question && !todos.length && units.every(finalUnit) &&
				reviewed.every(unit => unit.read === 'ok' && unit.review?.completed?.verified && unit.review.done?.byRule === rule &&
					sameHead(unit.head, unit.review.completed.head) && sameHead(unit.head, unit.review.done.head))
			wf.reviewReply = ready && wf.revAt ? { rule, turn: wf.revAt, phase: 'held', units: reviewed.map(unit => unit.id), reply: draft, sendText: text } : undefined
		} else Object.assign(wf, stateFields(wf, executors ? 'waiting_on_task' : 'needs_human'))
	}
	if (JSON.stringify(wf) !== before) commit(false)
	return true
}

// ok on an item waiting to be relayed lets its asks into the owner's session.
export function okRelay(store: Store, wf: Workflow): string | undefined {
	const job = wf.job ? store.job(wf.job) : undefined
	if (!job?.relay || (job.relay.ok ?? 0) >= job.asks.length || wf.state !== 'needs_human') return undefined
	if (wf.intent === 'pr_review' && wf.prs && !unitForJob(wf, job.id)?.requested)
		return 'That PR review request changed. Open the current item. Nothing was relayed.'
	job.relay = { ...job.relay, ok: job.asks.length }
	store.saveJob(job)
	Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), question: undefined, questionHint: undefined, status: `Working in your open session for ${job.relay.what} on ${job.relay.machine}`, waitingSince: new Date().toISOString() })
	if ((wf.prs?.length ?? 0) > 1) {
		wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
		const next = wf.prs?.flatMap(unit => { const job = unit.requested && unit.job ? store.job(unit.job) : undefined; return job ? [job] : [] })
			.find(job => job.relay && (job.relay.ok ?? 0) < job.asks.length)
		if (next?.relay) Object.assign(wf, { job: next.id, ...stateFields(wf, 'needs_human'),
			status: `Waiting for your ok to send it to your open session for ${next.relay.what} on ${next.relay.machine}`,
			question: `This goes to your open session for ${next.relay.what} on ${next.relay.machine}, which works with your own tools. Say "ok ${wf.code}" to send it there, or "skip ${wf.code}".`,
			questionHint: undefined, questionOf: undefined })
		else refreshReviewQuestions(store, wf)
	}
	return `Sending ${wf.code} to your open session for ${job.relay.what} on ${job.relay.machine}. Its answer comes back here.${(wf.prs?.length ?? 0) > 1 && wf.question ? ` ${wf.question}` : ''}`
}

// The approval an ok creates: the exact reply text and the exact changes the owner saw, down to each change's call (tester P0, next action).
export const keyOf = (effects: Effect[] = []) => JSON.stringify(pendingEffects(effects).map(e => [e.system, e.action, e.target, e.payload, e.call, e.head]))
export const effectsKey = (wf: Workflow) => keyOf(wf.effects)
// Valid only if the item still shows what was approved, and the job would run exactly that (review 01-04 P0-2).
export const stillApproved = (wf: Workflow, job?: Job) => {
	if (job?.byRule) {
		if (wf.state === 'done') return false
		const unit = unitForJob(wf, job.id), frame = unit?.review, run = frame?.run, approval = run?.approval
		if (!unit?.requested || !frame || !run || !approval || run.phase !== 'posting' || run.job !== job.id || approval.byRule !== job.byRule ||
			run.rule !== job.byRule || !Number.isSafeInteger(frame.epoch) || frame.epoch < 0 || approval.epoch !== frame.epoch ||
			!Array.isArray(approval.effectIds) || !approval.effectIds.length || new Set(approval.effectIds).size !== approval.effectIds.length) return false
		const pending = pendingEffects(wf.effects).filter(effect => prIdOf(effect.call) === unit.id)
		const subset = approval.effectIds.flatMap(id => { const effect = pending.find(effect => pageChangeId(effect) === id); return effect ? [effect] : [] })
		return subset.length === approval.effectIds.length && subset.every(effect => !isVote(effect.call)) &&
			keyOf(subset) === approval.effects && approval.effects === keyOf(job.result?.effects)
	}
	const approval = wf.approved
	if (!approval || wf.state === 'done' || approval.text !== (wf.draft?.text ?? '')) return false
	if (approval.byRule !== undefined) return false
	return approval.effects === effectsKey(wf) && (!job || !job.byRule && approval.effects === keyOf(job.result?.effects))
}
export const executing = (job: Job) => job.purpose === 'execute' && (job.state === 'queued' || job.state === 'running')

// Start every queued job as a detached run. A change run starts only while some item still holds a valid ok (R-HIL-21, R-SET-07).
export async function startJobs(store: Store, cfg: Config, procs: Procs, hold: string[] = [], probe?: BuildProbe): Promise<number> {
	dueTrackers(store)
	const held = blockedAgent(store, cfg)
	if (held) { waitingForAgent(store, held); return 0 }
	let n = 0
	// A cap on runs at once, so many due trackers or bootstrap sources cannot start together (tester 06-07 P2-4).
	let room = Math.min((cfg.jobs?.parallel ?? 3) - store.jobs().filter(j => j.state === 'running' && !j.run?.relay).length, (cfg.dailyRuns ?? 200) - store.runsToday())
	const control = store.control(), now = Date.now()
	for (const was of store.jobs().filter(j => j.state === 'queued' && !store.openWindow(j.id) && !hold.includes(j.key) && (j.oneMore || !j.retry || Date.parse(j.retry.at) <= now))) {
		const job = freshRead(() => store.job(was.id))
		if (!job || job.state !== 'queued') continue
		if (job.byRule) continue
		if (job.stopped && !job.oneMore && job.purpose === 'work') continue
		const commit = recordCommit(job, () => store.job(job.id), store.saveJob.bind(store))
		const review = job.purpose === 'work' && (job.intent === 'pr_review' || !job.every && isReviewJob(job.key))
		const prepareReview = async () => {
			const key = job.key, session = job.session.id, wrapUp = job.wrapUp, intent = job.intent, relay = JSON.stringify(job.relay)
			const start = await reviewStart(store, cfg, job, probe)
			commit.refresh()
			if (job.state !== 'queued' || job.purpose !== 'work' || job.key !== key || job.session.id !== session || job.wrapUp !== wrapUp || job.intent !== intent || JSON.stringify(job.relay) !== relay) return false
			cfg = freshRead(() => store.config())
			const control = freshRead(() => store.control())
			if (control.paused || control.stopped || blockedAgent(store, cfg)) return false
			if (!freshRead(() => parentsOf(store, job).length)) return false
			if (freshRead(() => store.runsToday()) >= (cfg.dailyRuns ?? 200)) return false
			if (!job.relay && freshRead(() => store.jobs().filter(j => j.state === 'running' && !j.run?.relay).length) >= (cfg.jobs?.parallel ?? 3)) return false
			job.reviewStart = start.stamp
			if (!wrapUp) for (const parent of freshRead(() => parentsOf(store, job))) {
				const save = recordCommit(parent, () => store.workflow(parent.id), store.save.bind(store))
				if ((parent.prs?.length ?? 0) <= 1) parent.prVote = start.vote
				const unit = unitForJob(parent, job.id)
				if (unit) resetUnitReview(unit)
				save(false)
			}
			return true
		}
		if (blockedAgent(store, cfg)) break
		if (job.retry) {
			// Retries wait while paused or stopped, and end when every item they were for has closed.
			if (control.paused || control.stopped) continue
			if (!parentsOf(store, job).length) { Object.assign(job, { state: 'done', retry: undefined, nextAt: undefined }); commit(); store.log({ event: 'retry-stopped', job: job.id, why: 'its items closed' }); continue }
		}
		if (job.relay && job.purpose === 'work') {
			if ((job.relay.ok ?? 0) >= job.asks.length && (!review || await prepareReview()) && withinJobBudget(store, cfg, job)) { relayJob(store, job); n++ }
			continue
		}
		if (room <= 0) break
		if (job.purpose === 'execute') {
			if (store.control().paused) continue
			if (!parentsOf(store, job).some(p => stillApproved(p, job))) {
				Object.assign(job, { state: 'done', purpose: 'work' })
				adoptList(store, job)
				commit()
				store.log({ event: 'job-execute-dropped', job: job.id, why: 'no valid ok' })
				continue
			}
		}
		// A repo that is not a folder (a web link) is a remote, never a path: one job failed "It needs the repo https://…" (owned work).
		if (job.repo && !isAbsolute(job.repo)) { Object.assign(job, { remote: job.remote ?? repoRef(cfg, job.repo), repo: undefined }); commit() }
		if (job.repo && !existsSync(job.repo)) { fail(store, job, `It needs the repo ${job.repo} on ${store.machine}`); continue }
		// Reviews can read through Azure DevOps; only local test/build work needs a clone task.
		const work = job.purpose === 'work' && !job.repo && !!job.remote
		const clone = work ? cloneFor(job.remote!, job.branch) : undefined
		for (const wf of parentsOf(store, job)) {
			const todos = visibleCloneTodos(cfg, wf, job, store.machine)
			if (todos?.length !== wf.todos?.length) { wf.todos = todos; store.save(wf) }
			if (work && !clone && job.needsCheckout) { const t = cloneTodo(cfg, job.remote!, store.machine); if (!wf.todos?.includes(t)) { wf.todos = [...(wf.todos ?? []), t]; store.save(wf) } }
		}
		if (review && !await prepareReview()) continue
		if (!withinJobBudget(store, cfg, job)) continue
		// The executor gets the read-only tools, so it can check a change was not already made (live Q3 run: it refused without one),
		// and no write tool: it makes changes only through make_change, which runs exactly the approved call (next action).
		// A validate job reads telemetry only when the owner has a telemetry server (owned work).
		// No worker holds a write tool among its read tools (round 2 P2-1), and none works in the owner's clone, or the folder an owned
		// session runs in, with a shell: it could run a pipeline or a deploy script outside make_change (review 10-21 P2-9, round 2 P2-2).
		const scope = job.purpose === 'work' && !job.every && !isBootstrap(job) && !job.key.startsWith('learn:') &&
			!job.fullCatalog && !job.oneMore ? jobToolScope(canonicalKey(job.key)) : undefined
		const allReads = workerTools(cfg, 'job'), reads = scopeTools(cfg, allReads, scope)
		const unsafe = unsafeRead(reads, Object.keys(toolServers(cfg)), catalogInfo(cfg))
		if (unsafe) { fail(store, job, unsafe); continue }
		const shell = shellTool(reads)
		if (shell && isValidate(job)) { fail(store, job, `A validate job never runs with a shell tool (${shell}): it could run a pipeline outside your ok. Remove ${shell} from the read tools in setup`); continue }
		if (shell && (clone || job.repo)) { fail(store, job, shellInClone(shell)); continue }
		const telemetry = job.purpose === 'work' && isValidate(job) ? telemetryTools(cfg) : []
		const full = job.purpose === 'execute' ? allReads : [...new Set([...allReads, ...(intents(store.root).find(i => i.id === job.intent)?.tools ?? []), ...telemetry])]
		const tools = scopeTools(cfg, full, scope), offered = { offered: tools.length, scoped: tools.length < full.length }
		const agent = { ...cfg.agent, tools, maxCredits: cfg.jobs?.credits ?? cfg.agent.maxCredits }
		// A long-lived tracker starts a fresh session from its last result once its history is large (R-TRK-03).
		let rotated = false
		if (job.every && sessionBytes(job.session.id) > TRACKER_SESSION_LIMIT) { job.session = { ...job.session, id: chooseSession('job', { fresh: true }) }; rotated = true; store.log({ event: 'tracker-rotated', job: job.id }) }
		const runId = ulid()
		const { cwd, mcpConfigPath } = workerMcp(store, job.id, runId)
		let pid: number | undefined
		try {
			restoreSession(store, job.session.id)
			const startedAt = new Date().toISOString()
			const scopes = parentsOf(store, job).map(wf => ({ workflow: wf, pr: prTargetForJob(store, wf, job) }))
			const instructions = standingInstructions(store, scopes, 'result')
			const prompt = job.wrapUp ? scrub([WRAP_UP(job.id), ...standingInstructionsBlock(instructions)].join('\n')) : buildJobPrompt(job, { ...cfg, agent }, store.root, { clone, telemetry, scopes, instructions, tools: offered })
			const usage = { ...sessionUse(job.session.id, sessionLog(job.session.agent, job.session.id), Date.parse(startedAt),
				rotated ? { fresh: true, why: 'cap' } : {}), key: jobUsageKey(canonicalKey(job.key)), promptChars: prompt.length }
			pid = procs.start(agent, { workflowId: job.id, runId, sessionId: job.session.id, prompt, cwd: job.repo ?? clone ?? cwd, mcpConfigPath, extraTools: job.purpose === 'execute' ? [`${WORKER_SERVER}-submit_report`, `${WORKER_SERVER}-make_change`] : WORKER_TOOLS, dirs: readDirs(store, cfg) }).pid
			rememberUsage(runId, usage)
			const waiting = job.error, oneMore = job.oneMore
			Object.assign(job, { state: 'running', error: undefined, ...(job.purpose === 'work' ? { carrier: undefined } : {}),
				run: { id: runId, pid, startedAt, machine: store.machine, purpose: job.purpose, asks: job.asks.length, tools: offered, ...(job.wrapUp ? { wrapUp: true } : {}), ...(oneMore ? { oneMore: true } : {}) }, oneMore: undefined, wrapUp: undefined })
			commit()
			for (const item of parentsOf(store, job)) if (waiting && item.statusReason?.kind === 'could-not-start') { item.status = `Working on ${job.goal}`; item.statusReason = undefined; store.save(item) }
			store.addRun()
			store.log({ event: 'job-start', job: job.id, key: job.key, purpose: job.purpose, runId, pid, sessionId: job.session.id, startedAt, usage, tools: offered, ...(clone || job.repo ? { clone: job.repo ?? clone } : {}) })
			n++
			room--
		} catch (e) {
			const setup = e instanceof SetupError
			// A run we cannot track must not keep running.
			if (!pid || procs.kill(pid)) {
				try { removeRunFiles(mcpConfigPath) } catch (error) { store.log({ event: 'worker-files-cleanup-failed', runId, error: String(error).slice(0, 300) }); store.setHealth(`worker-files:${runId}`, `Could not remove files for failed worker ${runId}: ${String(error).slice(0, 160)}`) }
			}
			const account = setup ? undefined : agentSetupFailure(String(e))
			if (account) holdJob(store, cfg, job, account)
			else failOrRetry(store, job, `Could not start: ${setup ? e.message : String(e).slice(0, 120)}`, setup)
		}
	}
	return n
}

async function reviewStart(store: Store, cfg: Config, job: Job, probe?: BuildProbe): Promise<{ stamp?: Job['reviewStart']; vote?: number }> {
	let live = probe, pr: number | undefined
	try {
		const refs = parentsOf(store, job).map(w => prRefForJob(store, w, job)), ref = refs[0]
		pr = ref?.id
		if (!ref || refs.some(r => !r || r.id !== ref.id || r.project !== ref.project || r.repo !== ref.repo)) throw new Error('The review job has no single readable PR target')
		const id = /^pr:.*?(\d+)$/.exec(job.key)?.[1]
		if (id && Number(id) !== ref.id) throw new Error('The current item and review job name different PRs')
		live ??= adoProbe(cfg)
		if (!live?.pr) throw new Error('No PR reader is configured')
		const state = await live.pr(ref.project, ref.repo, ref.id)
		if (!/^(active|completed|abandoned)$/i.test(state.status) || !state.head?.trim()) throw new Error('The PR read returned no valid status or head')
		// A report-only continuation cannot claim it reviewed changes made after the original run.
		if (job.wrapUp) {
			if (job.reviewStart?.pr !== ref.id || !sameHead(job.reviewStart.head, state.head)) throw new Error('The report-only continuation has no verified original review head')
			return { stamp: job.reviewStart }
		}
		return { stamp: { pr: ref.id, head: state.head, at: new Date().toISOString() }, vote: liveOwnerVote(cfg, state) }
	} catch (error) {
		store.log({ event: 'pr-check-failed', job: job.id, pr, phase: 'review-start', error: String(error).slice(0, 200) })
		return {}
	} finally {
		if (!probe) try { await live?.close?.() } catch (error) { store.log({ event: 'probe-close-failed', job: job.id, error: String(error).slice(0, 200) }) }
	}
}

const WRAP_UP_MINUTES = 3
const WRAP_UP = (id: string) => `Your time for this job is up. Stop looking further. Call submit_report now with workflowId "${id}": what you found, with sources, and a question for the owner if they must decide something. If the goal is not met yet, set goalMet to false and blocker with kind "budget", what is left, and what you tried, so the next run continues; any reply is then only a holding reply.`

// Apply finished runs; stop runs that died or ran past their budget (R-LNG-03, R-LNG-04).
// Items are updated before the job, and the report is archived last, so a crash in between repeats the hand-off safely.
export async function checkJobs(store: Store, src: Source, cfg: Config, procs: Procs, probe?: BuildProbe, startedBefore?: number): Promise<number> {
	let n = 0
	const minutes = cfg.jobs?.minutes ?? 30
	// startedBefore: a pass leaves the runs it started itself to the next pass (the resident runner checks within a second).
	for (const was of store.jobs().filter(j => j.state === 'running' && j.run && !(startedBefore !== undefined && Date.parse(j.run.startedAt) >= startedBefore))) {
		const job = freshRead(() => store.job(was.id))
		if (!job?.run || job.state !== 'running') continue
		const run = job.run!
		if (run.relay) { n += checkRelay(store, job) ? 1 : 0; continue }
		const r = store.peekReport(job.id, run.id)
		const over = Date.now() - Date.parse(run.startedAt) > (run.wrapUp ? WRAP_UP_MINUTES : minutes) * 60_000
		// After a restart the recorded process ID can belong to an unrelated program, and a run from another machine is not ours to stop.
		const rebooted = Date.parse(run.startedAt) < (procs.bootMs?.() ?? Date.now() - uptime() * 1000)
		const live = !run.direct && run.machine === store.machine && !rebooted && procs.alive(run.pid)
		if (run.machine !== store.machine && !r) {
			if (over) fail(store, job, `Stopped after ${minutes} minutes on ${run.machine}, with no result`)
			continue
		}
		if (rebooted && !r && run.purpose === 'work') {
			if (run.oneMore) {
				ended.set(job.id, readUse(store, job))
				cleanJobFiles(store, run)
				fail(store, job, "The extra run didn't finish: its machine restarted", 'stopped')
				continue
			}
			const used = readUse(store, job)
			cleanJobFiles(store, run)
			Object.assign(job, { state: 'queued', run: undefined })
			store.saveJob(job)
			store.log({ event: 'job-resumed-after-restart', job: job.id, key: job.key, ...used, ...(used.runKind ? { outcome: 'retry' } : {}) })
			continue
		}
		// A change run nobody still approves (a new ask, the owner's own reply, skip) stops before it does more (review 01-04 P1-6).
		if (run.purpose === 'execute' && !r && live && !parentsOf(store, job).some(p => stillApproved(p, job))) { stopRun(store, procs, job, 'its ok was withdrawn'); continue }
		// The session is not free until its process exits, even after it reported.
		if (r && live && !over) continue
		if (live && over) {
			if (!procs.kill(run.pid)) { store.setHealth(`job:${job.id}`, `Could not stop the job for ${job.key} (process ${run.pid}). Stop it by hand.`); continue }
			store.setHealth(`job:${job.id}`)
		}
		if (!live) { backupSession(store, job.session.id); if (run.machine === store.machine) scrubLog(store, run.id) }
		// The run has ended: what it used goes on the event that ends it.
		ended.set(job.id, readUse(store, job))
		try {
			const f = join(LOCAL_DIR, 'sessions', `${run.id}.log`)
			const account = !r && !live ? agentSetupFailure(`${existsSync(f) ? readFileSync(f, 'utf8') : ''}\n${agentProcessLog(job.session.agent, join(LOCAL_DIR, 'sessions', `mcp-${run.id}.json`))}`) : undefined
			if (account) holdJob(store, cfg, job, account)
			else if (r) {
				if (run.purpose === 'execute') await finishExecute(store, src, cfg, job, procs, probe)
				else {
					const review = await checkReviewCompletion(store, job, probe)
					freshRead(() => {
						const current = store.job(job.id)
						if (current?.state === 'running' && current.run?.id === run.id) finishWork(store, current, r, run.asks, review)
					})
					await refreshApprovedHolds(store, src)
				}
				store.archiveReport(job.id, run.id)
				n++
			} else if (run.oneMore) fail(store, job, `The extra run didn't finish: ${over ? 'it reached its time budget' : 'it stopped without a result'}`, 'stopped')
			else if (over && run.purpose === 'work' && !run.wrapUp) {
				// Out of time with nothing reported: one short turn in the same session keeps what it found (live R01 and R18 runs lost 10 minutes of work).
				Object.assign(job, { state: 'queued', wrapUp: true, run: undefined })
				store.saveJob(job)
				store.log({ event: 'job-wrap-up', job: job.id, key: job.key, ...usedBy(job, 'retry') })
			} else if (over) (job.every ? missedCheck : fail)(store, job, `Stopped after ${run.wrapUp ? minutes + WRAP_UP_MINUTES : minutes} minutes, its time budget`, 'budget-stopped')
			else if (!live) failOrRetry(store, job, 'It stopped without a result')
		} finally {
			if (!live || over) cleanJobFiles(store, run)
			// An end that logs nothing of its own (asks came in during the run, so it runs again) still records what the run used.
			const state = store.job(job.id)?.state
			const left = usedBy(job, state === 'queued' ? 'retry' : state === 'failed' ? 'failed' : state === 'done' ? 'done' : undefined)
			if (Object.keys(left).length) store.log({ event: 'job-run', job: job.id, key: job.key, ...left })
		}
	}
	return n
}

function holdJob(store: Store, cfg: Config, job: Job, failure: AgentSetupFailure) {
	holdAgent(store, cfg, failure)
	tallyRun(store, job, ended.get(job.id))
	if (job.run?.oneMore) { fail(store, job, `The extra run didn't finish: ${failure.text}`, 'stopped'); return }
	// A change run without a report still needs the owner's review, not an automatic replay.
	if (job.purpose === 'execute') { fail(store, job, failure.text); return }
	Object.assign(job, { state: 'queued', error: failure.text, run: undefined, retry: undefined, wrapUp: undefined })
	store.saveJob(job)
	for (const item of parentsOf(store, job)) { item.status = failure.text; store.save(item) }
	store.log({ event: 'job-agent-held', job: job.id, key: job.key, kind: failure.kind, retryAt: failure.retryAt, reason: failure.text, ...usedBy(job, 'retry') })
}

function cleanJobFiles(store: Store, run: NonNullable<Job['run']>) {
	if (run.relay || run.machine !== store.machine) return
	try {
		removeRunFiles(join(LOCAL_DIR, 'sessions', `mcp-${run.id}.json`))
		store.setHealth(`worker-files:${run.id}`)
	} catch (error) {
		const text = `Could not remove files for ended worker ${run.id}: ${String(error).slice(0, 160)}`
		store.log({ event: 'worker-files-cleanup-failed', runId: run.id, error: String(error).slice(0, 300) })
		store.setHealth(`worker-files:${run.id}`, text)
	}
}

// What each run that ended here used, read once from its log, for the event that ends it (R-SET-14).
const ended = new Map<string, Record<string, unknown>>()
const usedBy = (job: Job, outcome: RunOutcome | undefined) => {
	const use = ended.get(job.id) ?? {}
	ended.delete(job.id)
	return use.runKind && outcome ? { ...use, outcome } : use
}
const countOf = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
const initialSpend = (now = Date.now()): NonNullable<Job['spent']> => ({ runs: 0, tokensIn: 0, tokensOut: 0, unknownRuns: 0, since: new Date(now).toISOString() })
function validSpend(value: unknown): value is NonNullable<Job['spent']> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const spent = value as Record<string, unknown>, runs = countOf(spent.runs), unknown = countOf(spent.unknownRuns)
	return runs !== undefined && unknown !== undefined && unknown <= runs &&
		[spent.tokensIn, spent.tokensOut].every(value => countOf(value) !== undefined) &&
		(spent.creditsNano === undefined || countOf(spent.creditsNano) !== undefined) &&
		typeof spent.since === 'string' && Number.isFinite(Date.parse(spent.since))
}
function budgetStopText(job: Job): string {
	const limit = job.stopped?.limit, spent = job.spent
	return limit && spent ? (job.stopped?.basis ?? (spent.runs >= limit.runs ? 'runs' : 'tokens')) === 'runs' ? `Stopped: it reached its limit of ${limit.runs} AI runs` :
		`Stopped: it reached its limit of ${limit.tokens} tokens` : 'Stopped at its AI limit'
}
export function stopStatusText(job: Job): string | undefined {
	if (!job.stopped) return undefined
	return job.stopped.kind === 'budget' ? budgetStopText(job) :
		job.stopped.need ? `Can't do: no tool can ${job.stopped.need}` : "Can't do: no tool for this step"
}
function withinJobBudget(store: Store, cfg: Config, job: Job, now = Date.now()): boolean {
	const previous = job.spent === undefined ? initialSpend(now) : job.spent, limit = cfg.agent.jobLimit
	if (!validSpend(previous)) { fail(store, job, 'The recorded AI usage for this job is invalid. It was not started.'); return false }
	const scheduled = job.every && job.nextAt && !job.retry && !job.missed && !job.wrapUp && !job.oneMore &&
		Date.parse(job.nextAt) <= now && Date.parse(job.nextAt) > Date.parse(previous.since)
	const spent = scheduled ? initialSpend(now) : previous
	if (job.spent === undefined || scheduled) { job.spent = spent; store.saveJob(job) }
	if (limit !== undefined && (!limit || typeof limit !== 'object' || !Number.isSafeInteger(limit.runs) || limit.runs <= 0 ||
		!Number.isSafeInteger(limit.tokens) || limit.tokens <= 0)) {
		fail(store, job, 'The AI limit per job must have positive whole-number run and token limits.')
		return false
	}
	if (!limit || job.oneMore || spent.runs < limit.runs && spent.tokensIn + spent.tokensOut < limit.tokens) return true
	job.stopped = { kind: 'budget', at: new Date(now).toISOString(), limit: { ...limit }, basis: spent.runs >= limit.runs ? 'runs' : 'tokens' }
	const why = budgetStopText(job)
	Object.assign(job, { state: 'done', purpose: 'work', nextAt: undefined, retry: undefined, wrapUp: undefined })
	store.saveJob(job)
	for (const wf of parentsOf(store, job)) {
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), status: why, waitingSince: undefined, approved: undefined, sendAt: undefined,
			...(wf.draft ? { draft: { ...wf.draft, holding: true } } : {}) })
		store.save(wf)
	}
	store.log({ event: 'job-stopped', job: job.id, kind: 'budget' })
	return false
}
function tallyRun(store: Store, job: Job, use: Record<string, unknown> = {}): void {
	const run = job.run
	if (!run || run.direct || run.spent) return
	const previous = job.spent === undefined ? initialSpend() : job.spent
	if (!validSpend(previous)) throw new Error("This job's AI usage could not be recorded safely")
	const input = countOf(use.tokensIn), output = countOf(use.tokensOut)
	const credit = use.creditsStatus === 'complete' || use.creditsStatus === 'byok' ? countOf(use.creditsNano) : undefined
	const next = { runs: previous.runs + 1, tokensIn: previous.tokensIn + (input ?? 0), tokensOut: previous.tokensOut + (output ?? 0),
		unknownRuns: previous.unknownRuns + (input === undefined || output === undefined ? 1 : 0), since: previous.since,
		...(credit !== undefined && (previous.runs === 0 || previous.creditsNano !== undefined)
			? { creditsNano: (previous.creditsNano ?? 0) + credit } : {}) }
	if (!validSpend(next)) throw new Error("This job's AI usage could not be recorded safely")
	job.spent = next
	run.spent = true
	store.saveJob(job)
	store.log({ event: 'job-spend', job: job.id, runId: run.id, unknown: input === undefined || output === undefined })
}
// Another machine's run, or a relay, has no log here.
function readUse(store: Store, job: Job): Record<string, unknown> {
	const run = job.run, f = run && !run.relay && run.machine === store.machine ? join(LOCAL_DIR, 'sessions', `${run.id}.log`) : undefined
	if (!run || run.direct) return {}
	if (!f) { tallyRun(store, job); return {} }
	let text = ''
	if (existsSync(f)) try { text = readFileSync(f, 'utf8') } catch (error) {
		store.log({ event: 'usage-read-failed', runId: run.id, error: String(error).slice(0, 200) })
	}
	const started = Date.parse(run.startedAt), { use, lastAt } = readRun(text, started, process.env, sessionLog(job.session.agent, job.session.id), Date.now())
	tallyRun(store, job, use)
	// A review is what the Done tab counts as one: a PR review job (view.ts).
	const context = takeUsageContext(store, run.id, run.startedAt)
	const out = ran(run.purpose === 'execute' ? 'change' : job.intent === 'pr_review' || canonicalKey(job.key).startsWith('pr:') ? 'review' : 'job',
		use, { ...context, key: context.key ?? jobUsageKey(canonicalKey(job.key)), session: context.session ?? { id: job.session.id } })
	return { ...out, runId: run.id, sessionId: job.session.id, startedAt: run.startedAt, ...(run.tools ? { tools: run.tools } : {}),
		endedAt: new Date(lastAt !== undefined && lastAt >= started ? lastAt : Date.now()).toISOString(),
		...(lastAt !== undefined && lastAt >= started ? { ms: lastAt - started } : {}) }
}

// A choice between options that is not the owner's own (no "approve", "vote", "you"): a spec or product question (queue-new #10).
export const specChoice = (q: string) => /\?/.test(q) && /\b(?:or|versus|vs\.?)\b/i.test(q) && !/\b(?:you|your|approv\w*|vote|review it|sign[ -]?off|merge)\b/i.test(q)
// The question as a comment to the PR's author, on the review's PR; undefined when the PR cannot be placed.
export function authorAsk(store: Store, parents: Workflow[], job: Job, question: string): Effect | undefined {
	const id = Number(/(\d+)\s*$/.exec(canonicalKey(job.key))?.[1] ?? 0) || parents.map(w => prTarget(store, w)).find(Boolean)
	const owner = parents.find(w => id && prRefFor(store, w, id))
	const refs = parents.filter(w => w.prs !== undefined).map(w => prRefForJob(store, w, job))
	const first = refs[0]
	if (refs.length && (!first || refs.some(ref => !ref || ref.id !== first.id || ref.project !== first.project || ref.repo !== first.repo))) return undefined
	const ref = first ?? (owner && id ? prRefFor(store, owner, id) : undefined)
	if (!ref) return undefined
	const author = parents.map(w => w.prs ? unitForJob(w, job.id)?.author : w.prAuthor).find(Boolean)?.split(/\s+/)[0]
	// Addressed to the author, so the card and the PR both say who is asked.
	const content = author ? `${author}, ${/^[A-Z][a-z]/.test(question) ? question[0].toLowerCase() + question.slice(1) : question}` : question
	return { system: 'azure devops', action: 'comment', target: `PR ${ref.id}`, summary: `Ask ${author ?? 'the author'} on PR ${ref.id}: ${question}`.slice(0, 300),
		call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', project: ref.project, repositoryId: ref.repo, pullRequestId: ref.id, content } } }
}

function recordUnitCompletion(wf: Workflow, job: Job, r: Report, result: NonNullable<Job['result']>, current: ReviewCompletion | undefined, resultAt: string) {
	const unit = isReviewJob(job.key, job.intent ?? wf.intent) ? unitForJob(wf, job.id) : undefined
	if (!unit || r.state !== 'done' || r.goalMet === false || result.findings === undefined && !result.reviewClean || !current?.head?.trim()) return
	const verified = !!current.basis
	const frame = bumpReviewEpoch(unit)
	const facts = current.facts ? { ...current.facts, required: [...current.facts.required] } : undefined
	unit.review = { ...frame,
		basis: current.basis ? { head: current.basis.head, at: current.basis.at } : undefined,
		completed: { job: job.id, resultAt, head: current.head, verified, findings: result.findings?.length ?? 0,
			...(result.reviewClean ? { clean: true } : {}), ...(facts ? { facts } : {}) } }
	if (facts) {
		unit.title = facts.title
		for (const effect of result.effects) if (isVote(effect.call) && prIdOf(effect.call) === unit.id) effect.pr = facts
	}
	unit.again = verified ? undefined : { head: current.head, at: current.at }
	wf.reviewReply = undefined
}

function retainedWorkFields(r: Report, todos = r.todos) {
	const question = r.question?.trim() || undefined
	return { state: r.state, question, questionHint: question && r.questionHint ? normalizeQuestionHint(r.questionHint) : undefined,
		goalMet: r.goalMet, blocker: r.blocker, todos }
}

function reviewQuestionView(wf: Workflow, jobs: ReadonlyMap<string, Job>): Pick<Workflow, 'questionOf' | 'question' | 'questionHint'> | undefined {
	const relay = wf.job ? jobs.get(wf.job) : undefined
	if (relay?.relay && (relay.relay.ok ?? 0) < relay.asks.length) return undefined
	const entries = (wf.prs ?? []).flatMap(unit => {
		if (!unit.requested) return []
		const id = unit.review?.completed?.job ?? unit.job
		const job = id ? jobs.get(id) : undefined
		return job ? [{ unit, job }] : []
	})
	if (!entries.some(({ job }) => job.result?.state !== undefined) && !wf.questionOf) return undefined
	const current = entries.find(({ job }) => job.state !== 'queued' && job.state !== 'running' && !!job.result?.question?.trim())
	if (!current && !wf.questionOf) return undefined
	const questionOf = current ? { job: current.job.id, pr: current.unit.id } : undefined
	const question = current?.job.result?.question?.trim() || undefined
	const questionHint = question ? current?.job.result?.questionHint : undefined
	return { questionOf, question, questionHint }
}

export function refreshReviewQuestions(store: Store, wf: Workflow): boolean {
	if (!wf.prs?.length || wf.state === 'done' || wf.state === 'running') return false
	if (wf.question && !wf.questionOf) return false
	const jobs = new Map<string, Job>()
	for (const unit of wf.prs) {
		if (!unit.requested) continue
		const id = unit.review?.completed?.job ?? unit.job
		const job = id ? store.job(id) : undefined
		if (job?.parents.includes(wf.id)) jobs.set(job.id, job)
	}
	const view = reviewQuestionView(wf, jobs)
	if (!view) return false
	const { questionOf, question, questionHint } = view
	if (JSON.stringify([wf.questionOf, wf.question, wf.questionHint]) === JSON.stringify([questionOf, question, questionHint])) return false
	wf.questionOf = questionOf
	wf.question = question
	wf.questionHint = questionHint
	wf.revAt = new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString()
	wf.reviewReply = undefined
	return true
}

export function finishWork(store: Store, job: Job, r: Report, asksAtStart: number, review?: ReviewCompletion) {
	tallyRun(store, job, ended.get(job.id))
	if (job.run?.tools?.scoped && !job.run.oneMore && (r.blocker?.kind === 'tool' || r.blocker?.kind === 'capability')) {
		const report = checked(store, store.config(), r)
		Object.assign(job, { state: 'queued', purpose: 'work', fullCatalog: true, run: undefined, nextAt: undefined, wrapUp: undefined,
			result: { summary: report.summary, reply: report.reply ? { ...report.reply, holding: true } : undefined, effects: [],
				context: report.context, findings: report.findings, refused: report.refused,
				...retainedWorkFields({ ...report, goalMet: false }) } })
		store.saveJob(job)
		for (const wf of parentsOf(store, job)) {
			Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), status: 'Checking once with all available read tools', approved: undefined, sendAt: undefined })
			store.save(wf)
		}
		store.log({ event: 'job-catalog-escalated', job: job.id, ...usedBy(job, 'retry') })
		return
	}
	if (r.blocker?.kind === 'capability')
		return shortOfGoal(store, job, checked(store, store.config(), { ...r, goalMet: false }))
	if (job.run?.oneMore) {
		if (job.asks.length > asksAtStart) return shortOfGoal(store, job, checked(store, store.config(), { ...r, goalMet: false,
			reply: undefined, question: 'New requests arrived during the extra run. Review them before trying again.',
			blocker: { kind: 'asker', why: 'New requests arrived during the extra run', tried: [] } }))
		if (isBootstrap(job) || job.key.startsWith('learn:') || job.every && !r.effects?.length && !r.question && !r.refused?.length) {
			if (r.goalMet === false) return shortOfGoal(store, job, checked(store, store.config(), r))
			job.stopped = undefined
		}
	}
	if (isBootstrap(job) || job.key.startsWith('learn:')) return finishBootstrap(store, job, r)
	if (job.every && !r.effects?.length && !r.question && !r.refused?.length) return finishCheck(store, job, r, asksAtStart)
	// A tracker that reports done stops, even when it also proposes changes or asks something (tester 06-07 P1-5).
	if (job.every && r.done) Object.assign(job, { every: undefined, nextAt: undefined })
	// A validate run's proposed test rings are saved for the owner to confirm, and its report says when telemetry was not read (owned work).
	if (isValidate(job)) { proposeTargets(store, r); r = telemetryNote(store.config(), r) }
	const cfg = store.config()
	r = checked(store, cfg, r)
	// Each proposed change must be one the owner allows, on this item's PR; any other becomes a to-do with the reason (owner, 2026-10-20).
	const parents = parentsOf(store, job)
	const todos = r.todos, extra: LeftDraft[] = []
	const prepared = prepareReportCalls(store, cfg, parents, r)
	r = addInternalSuggestions(store, cfg, parents, { ...prepared.report, todos })
	// In a PR review, a product or spec choice belongs to the PR's author: it becomes a proposed comment to them, never the owner's
	// question (queue-new #10). A question for the owner alone (approve with a thread open, review at all) stays one.
	if (r.question && isReviewJob(job.key, r.intent) && specChoice(r.question)) {
		const ask = authorAsk(store, parents, job, r.question)
		if (ask) {
			const problem = builtEffectProblem(cfg, ask)
			if (problem) {
				const why = `Couldn't prepare question for the author: ${problem}`
				prepared.problems.push(why)
				extra.push(leftRefusal(effectLeftAction(ask), 'incomplete', { why }))
				r = { ...r, question: why, questionHint: undefined }
				store.log({ event: 'effect-call-repaired', from: 'rebuilt', ok: false })
			} else {
				r = { ...r, question: undefined, questionHint: undefined, effects: [...(r.effects ?? []), ask] }
				store.log({ event: 'question-to-author', job: job.id, key: job.key, pr: ask.call?.args.pullRequestId })
			}
		}
	}
	// A review of someone else's PR shows the code facts only, never as warnings: no builds, checks or CI, and no vote of the owner
	// or his reviewer group, which is what he is about to decide (queue-new #8). A watch on his own PR keeps them.
	const trimmed = trimReviewContext(job, parents, r.context, r.intent)
	const contextTrimmed = trimmed.context !== r.context
	if (trimmed.dropped || trimmed.warns) store.log({ event: 'review-context-trimmed', job: job.id, dropped: trimmed.dropped, warns: trimmed.warns })
	if (contextTrimmed) r = { ...r, context: trimmed.context }
	const v = vet(cfg, r.effects, parents.map(w => prTargetForJob(store, w, job)).find(Boolean))
	v.todos.push(...prepared.problems)
	// A review's vote only while the owner may review the PR, at its last read (review gate G7).
	const reader = parents.find(w => unitForJob(w, job.id) || w.prRole)
	if (reader) v.effects = voteGate(store, cfg, reader, v.effects, v.todos, false, v.left)
	// A deploy while our last one is still running waits: one change at a time, never stacked on a ring (owned work).
	const busy = parents.map(w => deployRunning(homeOf(store, w))).find(Boolean)
	if (busy) for (const e of v.effects.filter(e => isDeploy(e.call))) {
		v.todos.push(`${e.summary.replace(/[.\s]+$/, '')}. Not made for you: ${busy}`)
		v.left.push(deployBusyLeft(e, busy))
	}
	const effects = proposalEffects(v.effects.filter(e => !busy || !isDeploy(e.call)).map(e => ({ ...e, done: undefined, error: undefined })), parents)
	const again = job.asks.length > asksAtStart
	// A failure of the system under test is a finding in the report, not a blocker (owned work).
	const finding = findingNotBlocker(job, r)
	if (finding) r = { ...r, context: [...(r.context ?? []), { label: 'Not reached', text: r.blocker!.why, tone: 'warn' as const }] }
	// Short of the goal, and no new ask to run for: try again another way, or say honestly why it stopped (design-spec/goal-retry.md).
	const resultTodos = [...new Set([...(r.todos ?? []), ...v.todos])]
	if (r.goalMet === false && !again && !finding) return shortOfGoal(store, job, r, resultTodos)
	if (job.run?.oneMore) job.stopped = undefined
	// A tracker keeps its next check; a work job's wait for a retry is over.
	Object.assign(job, job.every ? { retry: undefined, missed: undefined } : { retry: undefined, nextAt: undefined })
	// The job found nothing for the owner (a PR already merged, or approved by others): no card, a Done row, and a step on open work (dogfood 10-20).
	const rules = store.rules()
	const cleanReview = !!review?.basis && /^active$/i.test(review.status ?? '') && r.findings?.length === 0 &&
		parents.some(w => w.intent === 'pr_review' && prTargetForJob(store, w, job) === review.pr && reviewRuleFor(w, rules)) &&
		r.state !== 'waiting_on_sender' && r.goalMet !== false && !r.effects?.length && !effects.length && !v.todos.length && !r.refused?.length && !r.question && !r.blocker
	const resultAt = new Date().toISOString()
	const reads = r.findings ? runReads(store, cfg, job.session.id, 0) : undefined
	const targets = parents.map(w => prTargetForJob(store, w, job))
	const reviewSources = reads ? { unknown: cfg.agent.flavor !== 'copilot' || reads.unknown, chats: reads.chats,
		restricted: !!reads.knowledge || !!reads.customerNames?.length || !!reads.records?.some(record => !targets.some(id => record.id === `pr:${id}`)) } : undefined
	const result: NonNullable<Job['result']> = { summary: r.summary, reply: r.reply ? { ...r.reply } : undefined, effects,
		context: (r.context ?? []).slice(0, 12), refused: r.refused, findings: r.findings, reviewHead: review?.basis?.head,
		reviewClean: cleanReview ? true : undefined, reviewSources, voteRecommendation: r.voteRecommendation, at: resultAt,
		...retainedWorkFields(r, resultTodos) }
	if (!again) for (const wf of parentsOf(store, job)) {
		const reviewRule = wf.intent === 'pr_review' ? reviewRuleFor(wf, rules) : undefined
		const nothing = !(cleanReview && reviewRule) && r.state === 'done' && !r.reply && !r.question && !effects.length && !prepared.problems.length
		const scoped = unitForJob(wf, job.id)
		if ((wf.prs?.length ?? 0) > 1 && scoped) {
			const current = review?.pr === scoped.id ? review : undefined
			recordUnitCompletion(wf, job, r, result, current, resultAt)
			const context = leftContext(store, wf)
			context.source = { kind: 'review', at: resultAt, pr: scoped.id,
				...(context.source.who ? { who: context.source.who } : {}), ...(scoped.ref?.url ? { href: scoped.ref.url } : {}) }
			context.reviewHead = current?.basis?.head
			settleLeftRetry(wf, r, effects)
			allowLeft(wf, effects)
			leaveForYou(store, wf, [...reportLeft(r), ...v.left, ...extra], context)
			store.save(wf, false)
			continue
		}
		if (wf.pending.length) {
			Object.assign(wf, { ...stateFields(wf, 'running'), waitingSince: undefined, status: 'New asks arrived after this job started. Checking them next.' })
			store.save(wf)
			continue
		}
		if (wf.effects?.some(e => !e.off && !e.done && (r.work?.closed || e.maybe || e.error))) {
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, approved: undefined, status: 'Earlier changes are still failed or unverified. Review them before closing this work.' })
			store.save(wf)
			continue
		}
		const currentReview = review?.pr === prTargetForJob(store, wf, job) ? review : undefined
		const context = leftContext(store, wf)
		context.reviewHead = currentReview?.basis?.head
		if (context.source.kind === 'review') context.source.at = currentReview?.at ?? job.reviewStart?.at ?? context.source.at
		settleLeftRetry(wf, r, effects)
		allowLeft(wf, effects)
		leaveForYou(store, wf, [...reportLeft(r), ...v.left, ...extra], context)
		wf.statusReason = undefined; wf.reviewAgain = undefined; wf.runFailed = undefined
		if (r.reply) { wf.ownerSend = undefined; clearHold(wf); wf.returnedFrom = undefined }
		else if (wf.ownerSend && (!wf.sent || wf.sent.at < wf.ownerSend.at)) {
			recordUnitCompletion(wf, job, r, result, currentReview, resultAt)
			keepApprovedDraft(wf, r.summary || 'No reply needed')
			wf.waitingSince = undefined
			store.save(wf)
			store.log({ event: 'approved-draft-kept', code: wf.code, why: r.summary })
			continue
		}
		// The reply already went and its promised change waits, or its check failed: a new result is a new turn, whose own reply can
		// go; the owner's words are checked again once it rests (Slice 3, re-review).
		if (wf.sent) reopenPromise(store, wf)
		// Rules never send a review's or an investigation's result; the card says so, so the owner is not left guessing (dogfood 10-20, A34).
		const decision = r.reply ? { action: 'draft', reason: 'A review or investigation result always waits for you', confidence: confidence(r.reply.sources ?? []) } : wf.decision
		Object.assign(wf, { ...stateFields(wf, nothing ? (wf.work || wf.partOf ? 'open' : 'done') : 'needs_human'), closedBy: nothing && !(wf.work || wf.partOf) ? 'job' : undefined, learnAfter: undefined, status: nothing ? `Nothing needed: ${r.summary}` : r.summary, question: result.question, questionHint: result.questionHint, draft: r.reply ? { ...r.reply } : undefined, effects, decision, waitingSince: undefined, approved: undefined, newCount: 0, revAt: new Date().toISOString(), ...(r.context || contextTrimmed ? { context: r.context } : {}) })
		if (r.reply) wf.todos = r.todos
		if (wf.intent === 'pr_review') {
			const current = currentReview
			wf.reviewBasis = current?.basis
			wf.reviewDone = undefined
			wf.reviewAgain = !current?.basis && current?.head && job.reviewStart?.pr === current.pr && !sameHead(job.reviewStart.head, current.head) ? { pr: current.pr, head: current.head, at: current.at } : undefined
			if (reviewRule && !current?.basis && !nothing) wf.status = 'The reviewed revision could not be verified. Findings stay proposed for your OK; review again before posting by rule.'
		}
		if (v.todos.length) wf.question ??= wf.draft ? refusedAsk(wf.code, v.todos.length) : undefined
		// A job's finding is a step on the work its item belongs to, the home or a part's home (review part 2 #5).
		const home = homeOf(store, wf)
		mergeReportWork(wf, r, home, undefined, canCloseReport(store, home, wf))
		if (nothing) wf.completionSeen = `job:${job.id}:${hashOf(r.summary)}`
		if (nothing && home === wf && (home.work?.closed || canCloseApproval(store, home))) {
			closeFamily(store, realProcs, home, home.work?.closed?.why ?? r.summary)
			wf.closedBy = 'job'
		} else if (nothing && home !== wf) {
			Object.assign(wf, { ...stateFields(wf, 'done'), closedBy: 'job' })
		}
		if (home.work && step(home, `${home === wf ? '' : `${wf.code}: `}Found: ${r.summary}`, { ref: `job:${job.id}:${hashOf(r.summary)}` }) && home !== wf) store.save(home)
		recordUnitCompletion(wf, job, r, result, currentReview, resultAt)
		store.save(wf)
	}
	// Asks that arrived during the run get one more run in the same session.
	Object.assign(job, { result, state: again ? 'queued' : 'done', purpose: 'work', run: undefined })
	store.saveJob(job)
	for (const wf of parentsOf(store, job)) {
		if ((wf.prs?.length ?? 0) > 1) advanceReviewUnits(store, cfg, wf)
		else if (refreshReviewQuestions(store, wf)) store.save(wf, false)
	}
	if (!again) store.log({ event: 'job-done', job: job.id, key: job.key, summary: r.summary, effects: effects.length, ...usedBy(job, 'done') })
}

// Repair receipts written before completion closed approval work. No new work or external writes.
export function settleCompleted(store: Store, procs: Procs = realProcs) {
	for (const wf of store.workflows().filter(w => w.state === 'open' || w.state === 'done' || !!w.sent)) {
		if (wf.sent && wf.closeWorkAfterSend && !wf.pending.length && !wf.question) {
			const home = homeOf(store, wf)
			if (active(home) && !home.pending.length && !pendingParts(store, home, wf.id) && !pendingEffects(home.effects).length && !pendingEffects(wf.effects).length) {
				afterSend(wf, wf.sent.text ?? '', wf.sent.msgId, home, false)
				if (home.work?.closed) closeFamily(store, procs, home, home.work.closed.why)
				if (home !== wf) store.save(home)
				store.save(wf)
				continue
			}
		}
		if (wf.work?.closed) {
			if (wf.state !== 'done') { closeFamily(store, procs, wf, wf.work.closed.why); store.save(wf) }
			continue
		}
		if (!active(wf) || wf.pending.length || wf.follow) continue
		if (wf.intent === 'pr_review' && (wf.prs?.length ?? 0) > 1 && !wf.sent) continue
		const job = wf.job ? store.job(wf.job) : undefined
		if (!canCloseApproval(store, wf)) {
			const effects = (wf.effects ?? []).filter(e => !e.off)
			const receipt = wf.sent && effects.length && effects.every(e => e.done) ? `sent:${wf.sent.msgId}` : !wf.draft && !wf.question && job?.state === 'done' && job.result && !job.result.reply && !job.result.effects.length ? `job:${job.id}:${hashOf(job.result.summary)}` : undefined
			if (wf.state === 'open' && receipt && wf.completionSeen !== receipt && step(wf, 'Completed step recorded; checking what remains of the original ask', { ref: `completion:${receipt}` })) {
				wf.completionSeen = receipt
				Object.assign(wf, { ...stateFields(wf, 'running'), status: 'Checking remaining work after a completed step' })
				store.save(wf)
			}
			continue
		}
		if (wf.sent) afterSend(wf, wf.sent.text ?? '', wf.sent.msgId, wf, canCloseApproval(store, wf))
		else if (!wf.draft && !wf.question && job?.state === 'done' && job.result && !job.result.reply && !job.result.effects.length) closeFamily(store, procs, wf, job.result.summary)
		if (!wf.work?.closed) continue
		closeFamily(store, procs, wf, wf.work.closed.why)
		store.save(wf)
		store.log({ event: 'work-completed', code: wf.code, reason: 'persisted completion receipt' })
	}
}

// The approved changes ran. The reply goes out only to items whose ok still matches what they approved.
// An approved change that carries its exact call needs no AI run: each is made through make_change's own path (the owner's tool
// server, the ledger, the PR read right before a vote), in this pass, and the batch is finished at once (queue-new #7E: a change run
// spent 42 s starting and 1.5 min of model time on two fully specified calls). A batch with any change lacking a call keeps the run.
export const directCall = (cfg: Config, e: Effect) => !isInternal(e) && !!e.call?.tool && !!e.call.args && !!serverOf(cfg, e.call.tool)
export async function executeDirect(store: Store, src: Source, cfg: Config, procs: Procs, probe?: BuildProbe, call: Caller = mcpCaller(cfg)): Promise<number> {
	await reviewCommentHook(store, src, cfg, { probe, call })
	let n = 0
	for (const was of store.jobs().filter(j => j.state === 'queued' && j.purpose === 'execute' && !store.openWindow(j.id))) {
		const job = freshRead(() => store.job(was.id))
		if (!job || job.state !== 'queued' || job.purpose !== 'execute') continue
		if (store.control().paused || store.control().stopped) break
		if (!parentsOf(store, job).some(p => stillApproved(p, job))) {
			if (job.byRule) {
				await reviewCommentHook(store, src, cfg, { probe, call, completed: { job, effects: job.result?.effects ?? [] } })
				Object.assign(job, { state: 'done', purpose: 'work' })
				store.saveJob(job)
			}
			continue
		}
		const effects = job.result?.effects ?? []
		const todo = effects.map((e, i) => (externalPending([e]).length ? i : -1)).filter(i => i >= 0)
		if (!todo.length || todo.some(i => !directCall(cfg, effects[i]))) continue
		const runId = ulid(), t0 = Date.now()
		Object.assign(job, { state: 'running', error: undefined, retry: undefined, run: { id: runId, pid: 0, startedAt: new Date().toISOString(), machine: store.machine, purpose: 'execute', asks: job.asks.length, direct: true } })
		store.saveJob(job)
		store.log({ event: 'job-start', job: job.id, key: job.key, purpose: 'execute', runId, direct: true })
		for (const i of todo) await readPhase(`change:${job.id}:${i}`, () => makeChange(store, job.id, runId, i, call, probe))
		store.writeReport({ workflowId: job.id, intent: 'other', state: 'done', summary: 'Made the approved changes' }, runId)
		const current = freshRead(() => store.job(job.id))
		if (!current) throw new Error('The executed job disappeared before its result could be saved')
		await finishExecute(store, src, cfg, current, procs, probe)
		store.archiveReport(job.id, runId)
		store.log({ event: 'job-direct', job: job.id, changes: todo.length, ms: Date.now() - t0 })
		n++
	}
	return n
}

function carryInternalReceipts(effects: Effect[], from: Effect[]): Effect[] {
	const receipts = from.filter(isInternal)
	return effects.map(effect => {
		if (!isInternal(effect) || effect.done) return effect
		const [marked] = carryMarks([effect], receipts)
		const failure = receipts.find(receipt => sameProposal(effect, receipt) && receipt.error !== undefined)
		return !marked.done && failure ? { ...marked, error: failure.error } : marked
	})
}

function internalFailureStatus(wf: Workflow) {
	const left = pendingEffects(wf.effects).filter(isInternal)
	if (left.length) Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined,
		status: `Not made: ${left.map(effect => `${effect.summary.replace(/[.\s]+$/, '')}${effect.error ? ` (${effect.error.slice(0, 160)})` : ''}`).join('; ')}. Review the internal changes, then ok again.` })
}

export function saveInternalReceipts(store: Store, wf: Workflow) {
	internalFailureStatus(wf)
	const job = wf.job ? store.job(wf.job) : undefined
	if (!job?.result || !wf.effects) return
	const result = job.result, effects = carryInternalReceipts(result.effects, wf.effects)
	if (effects.some((effect, index) => effect !== result.effects[index])) {
		job.result = { ...result, effects }
		store.saveJob(job)
	}
}

export function saveUnitReceipts(store: Store, wf: Workflow, effects: Effect[]) {
	if ((wf.prs?.length ?? 0) < 2) return
	for (const unit of wf.prs ?? []) {
		const id = reviewJobId(unit), job = id ? store.job(id) : undefined
		if (!job?.result || !job.parents.includes(wf.id)) continue
		const next = job.result.effects.map(effect => {
			const receipt = effects.find(made => prIdOf(made.call) === unit.id && sameProposal(effect, made) &&
				(made.done || made.maybe || made.error))
			if (!receipt || isVote(effect.call) && (!receipt.head || !sameHead(receipt.head, unit.head))) return effect
			return { ...effect, done: receipt.done, maybe: receipt.maybe, error: receipt.error }
		})
		if (JSON.stringify(next) !== JSON.stringify(job.result.effects)) {
			job.result.effects = next
			store.saveJob(job)
		}
	}
}

async function finishExecute(store: Store, src: Source, cfg: Config, job: Job, procs: Procs, probe?: BuildProbe) {
	const commitJob = recordCommit(job, () => store.job(job.id), store.saveJob.bind(store))
	// A change counts as made only when make_change recorded it, never because the run says so (next action).
	let effects = foldChanges(store, job)
	if (job.byRule) {
		await reviewCommentHook(store, src, cfg, { probe, call: mcpCaller(cfg), completed: { job, effects } })
		Object.assign(job, { result: { ...job.result!, effects }, state: 'done', purpose: 'work', run: undefined })
		commitJob()
		return
	}
	// A vote refused because the PR changed since the review: the owner reviews again; nothing is sent (review 10-21 P1-3).
	const stale = Object.values(store.changes(job.id, job.run!.id)).find(c => c.stale)
	// Delegate's own vote is recorded on its items, so the PR check does not take it for the owner acting outside Delegate.
	const vote = voteValue(effects.find(e => e.done && isVote(e.call))?.call)
	const left = externalPending(effects), external = effects.filter(effect => !isInternal(effect))
	// Asks that arrived during the change run get a work run next, in the same session (tester P1-8).
	const again = job.asks.length > (job.run?.asks ?? job.asks.length)
	const before = { ...job, result: { ...job.result!, effects: job.result?.effects ?? [] } }
	const parents = freshRead(() => parentsOf(store, job))
	const commits = new Map(parents.map(wf => [wf, recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))]))
	// Kept and removed say whether the changes went as proposed (removed: left out by the owner, or dropped as no longer needed).
	// Logged before the replies go out, so the changes come first in the log, as they did in the chat (R-NEX-11).
	store.log({ event: 'job-executed', job: job.id, items: parents.map(w => w.code), kept: external.filter(e => !e.off).length, removed: external.filter(e => e.off).length, done: external.length - left.length, left: left.length, ...usedBy(job, left.length ? 'failed' : 'done') })
	// Each change this run made or refused is a step in the item's history, so Details says what happened (queue-new #7D).
	const ranNow = Object.entries(store.changes(job.id, job.run!.id))
	for (const home of new Set(parents.filter(wf => stillApproved(wf, before)).map(wf => homeOf(store, wf)))) {
		let moved = false
		for (const [i, c] of ranNow) {
			const e = effects[Number(i)]
			if (!e || isInternal(e) || c.state === 'calling') continue
			moved = step(home, c.state === 'done' ? `Made: ${e.summary.replace(/[.\s]+$/, '')}${c.ref && c.ref !== 'done' ? ` (${c.ref})` : ''}` : `Not made: ${e.summary.replace(/[.\s]+$/, '')} (${(c.error ?? 'it failed').replace(/^Error: /, '').replace(/\.$/, '').slice(0, 160)})`, { ref: `change:${job.run!.id}:${i}` }) || moved
		}
		if (moved && !parents.some(p => p.id === home.id)) store.save(home)
		else if (moved) for (const p of parents.filter(p => p.id === home.id)) p.work = home.work
	}
	for (const wf of parents) {
		const commit = commits.get(wf)
		if (!commit) throw new Error('The execution parent has no commit context')
		commit.refresh()
		const ok = stillApproved(wf, before)
		const replyDigest = wf.approved?.replyDigest
		const sendReview = wf.approved?.sendReview
		// An item whose list was not the one made keeps its own, with what was made marked (review 10-21c P1-1).
		wf.effects = ok ? effects : wf.effects && carryMarks(wf.effects, effects)
		saveUnitReceipts(store, wf, effects)
		const receipt = ok ? internalReceipt(wf) : undefined
		if (vote !== undefined && (wf.prs?.length ?? 0) < 2) wf.prVote = vote
		wf.approved = undefined
		if (!ok) {
			if (wf.state === 'waiting_on_task' && !again) Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: `The reply changed after your ok, so it was not sent. Review ${wf.code} and ok again` })
			commit()
			continue
		}
		if (stale?.error) {
			const changed = effects.find(e => isVote(e.call) && e.head), pr = changed && prTargetForEffect(store, wf, changed)
			if (changed?.head && pr) wf.reviewAgain = { pr, head: changed.head, at: new Date().toISOString() }
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, question: reviewAgain(wf.code, stale.error), questionHint: undefined, status: stale.error.replace(/\.$/, '') })
			commit()
			continue
		}
		// A deploy made is a plan step with a build check, and its ring is watched after it (owned work).
		const moving = effects.filter(e => e.done && isDeploy(e.call)).map(e => deployed(store, wf, e, e.done!.ref, job.goal)).filter((x): x is string => !!x)
		if (left.length) {
			// An old invite that cannot be made: a retry cannot work, so the owner is offered a new draft (legacy E16).
			const old = left.map(effect => ({ effect, why: inviteShapeProblem(effect.call) })).find(item => item.why !== undefined)
			if (old?.why) {
				const { effect, why } = old
				leaveForYou(store, wf, [leftRefusal(effectLeftAction(effect, prTarget(store, wf)), 'old-invite', { why })])
				Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: `Not made: ${changeText(effect)}. ${why.replace(/^./, c => c.toUpperCase())} Nothing was created, and the reply was not sent`,
					question: OLD_INVITE_ASK, questionHint: undefined })
				commit()
				continue
			}
			const legacy = legacyEffectOrigins(wf)
			const how = legacy
				? left.some(e => e.maybe) ? `Check whether it was made, then reply "ok ${wf.code} again" to make it once more` : `Reply "ok ${wf.code}" to retry`
				: left.some(e => e.maybe) ? 'Check whether it was made, then re-approve the selected changes on the current page' : 'Select the changes to retry on the current page'
			// The owner's own words already went, so there is no reply left to send on its own (Slice 3).
			const or = wf.promise && wf.sent && !wf.draft?.text ? `, or "skip ${wf.code}"` : legacy
				? `, or "ok ${wf.code} except ${left.map((_, i) => i + 1).join(' ')}" to send only the reply`
				: ', or leave out the unfinished changes on the current page'
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, status: `Made ${external.length - left.length} of ${external.length} changes. Not done: ${left.map(e => `${changeText(e)}${e.error ? ` (${e.error.slice(0, 80)})` : ''}`).join('; ')}. ${how}${or}` })
			commit()
			continue
		}
		// Added as a reviewer by Add me: the declined review starts now, on the ask that asked for it (review gate).
		const multiUnits = wf.intent === 'pr_review' && wf.prs && wf.prs.length > 1 ? wf.prs : undefined
		const addedUnits = multiUnits?.filter(unit => unit.decline &&
			effects.some(effect => effect.done && isAddMe(effect) && prIdOf(effect.call) === unit.id)) ?? []
		if (addedUnits.length) {
			for (const unit of addedUnits) {
				Object.assign(unit, { decline: undefined, read: 'pending', tries: 0, readAt: undefined, failure: undefined })
				bumpReviewEpoch(unit)
				store.log({ event: 'review-gate-added', code: wf.code, pr: unit.id })
			}
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined,
				status: `Added you as an optional reviewer; checking PR ${addedUnits.map(unit => unit.id).join(', ')}` })
			commit()
			continue
		}
		const added = effects.find(e => e.done && isAddMe(e))
		if (added && wf.reviewDecline) {
			Object.assign(wf, { ...stateFields(wf, 'running'), waitingSince: undefined, question: undefined, questionHint: undefined, reviewDecline: undefined, context: wf.context?.filter(c => c.label !== 'Not reviewing'), status: `Added you as an optional reviewer on PR ${wf.reviewDecline.pr}; starting the review`, pending: wf.msgIds.slice(-1) })
			store.log({ event: 'review-gate-added', code: wf.code, pr: added.call?.args.pullRequestId })
			commit()
			continue
		}
		const otherVotes = multiUnits?.some(unit => {
			const id = reviewJobId(unit), original = id ? store.job(id) : undefined
			return unitMayVote(unit) && original?.parents.includes(wf.id) &&
				pendingEffects(original.result?.effects).some(effect => isVote(effect.call) && prIdOf(effect.call) === unit.id)
		})
		if (multiUnits && (!multiUnits.every(settledUnit) || !wf.draft?.text || otherVotes)) {
			Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined,
				status: !multiUnits.every(settledUnit) ? 'Changes made; the remaining PR reviews stay open' :
					otherVotes ? 'Changes made; the other PR votes still need separate approval' : 'Changes made; preparing the shared PR review reply' })
			commit()
			continue
		}
		// A tracker goes back to watching once its changes are made, or closes if it already reported done; there is no chat reply to send.
		if (wf.kind === 'tracker') {
			if (job.every) Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), waitingSince: new Date().toISOString(), status: `Made ${external.length} change(s); watching again` })
			else close(wf, `Made ${external.length} change(s); stopped watching`)
			commit()
			continue
		}
		// A deploy with no reply to send: the work goes on, and the build check watches the run.
		if (moving.length && !wf.draft?.text) {
			Object.assign(wf, { ...stateFields(wf, 'open'), status: moving.join('; '), waitingSince: undefined, pending: [] })
			commit()
			continue
		}
		// The owner's own words went out before the change they promised: once it is made, the item rests where the send left it (Slice 3).
		if (wf.promise && wf.sent && !wf.draft?.text) {
			rest(store, wf, `Made: ${effects.filter(e => e.done).map(changeText).join('; ')}`)
			if (!wf.sent?.holding && receipt?.items.length) {
				await makeInternalChanges(store, wf, receipt)
				internalFailureStatus(wf)
				if (wf.effects) effects = carryInternalReceipts(effects, wf.effects)
			}
			commit()
			continue
		}
		if (!wf.draft?.text && !wf.question) {
			const home = homeOf(store, wf), closed = wf.closeWorkAfterSend
			wf.closeWorkAfterSend = undefined
			if (closed && canCloseReport(store, home, wf)) closeFamily(store, procs, home, closed)
			else rest(store, wf, `Made: ${effects.filter(e => e.done).map(changeText).join('; ')}`)
			if (!wf.sent?.holding && receipt?.items.length) {
				await makeInternalChanges(store, wf, receipt)
				internalFailureStatus(wf)
				if (wf.effects) effects = carryInternalReceipts(effects, wf.effects)
			}
			commit()
			continue
		}
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined })
		commit()
		let sent = false
		try {
			sent = await send(store, src, cfg, wf, wf.draft?.text, { replyDigest, sendReview }, probe)
			if (!sent && wf.state === 'needs_human' && wf.status !== PAGE_REPLY_CHANGED) wf.status = `Changes made. The reply was not sent. Reply "ok ${wf.code}" to send it`
		} catch (e) {
			wf.status = `Changes made. Could not send the reply: ${String(e).slice(0, 100)}. Reply "ok ${wf.code}" to retry`
		}
		if (sent && !wf.sent?.holding && receipt?.items.length) {
			await makeInternalChanges(store, wf, receipt)
			internalFailureStatus(wf)
			if (wf.effects) effects = carryInternalReceipts(effects, wf.effects)
		}
		commit()
	}
	commitJob.refresh()
	const pendingAsk = job.asks.length > (job.run?.asks ?? job.asks.length)
	Object.assign(job, { result: { ...job.result!, effects }, state: pendingAsk ? 'queued' : 'done', purpose: 'work', run: undefined, nextAt: job.every ? new Date(Date.now() + job.every * 60_000).toISOString() : job.nextAt })
	adoptList(store, job)
	commitJob()
}

// What a change run recorded, folded into the job's list: a change counts as made only when make_change recorded it,
// never because the run says so (next action). Read before a run is finished or stopped, so nothing made is forgotten (review 10-21d P1).
function foldChanges(store: Store, job: Job): Effect[] {
	const effects = (job.result?.effects ?? []).map(e => ({ ...e }))
	for (const [i, c] of Object.entries(job.run ? store.changes(job.id, job.run.id) : {})) {
		const e = effects[Number(i)]
		if (!e || isInternal(e)) continue
		if (c.state === 'done') Object.assign(e, c.skipped ? { off: true, error: undefined } : { done: { ref: c.ref, at: c.at, ...(c.byRule ? { byRule: c.byRule, severity: c.severity } : {}) }, error: undefined })
		else if (c.state === 'failed') e.error = c.error
		// A call with no answer may have happened: it is never repeated by itself (decision A3). A vote only sets a state, so it
		// may be tried again; anything else waits for the owner to check and say "again" (review 10-21 P2-7).
		else Object.assign(e, { error: 'No answer from the tool, so it may have been made', ...(isVote(e.call) ? {} : { maybe: true }) })
	}
	return effects
}

// When no change run is under way, the list its open items show is the one ok makes, when they agree (review 10-21c P2-1).
// What is known as made carries over, and the items get it too, so each still shows exactly what ok makes.
function adoptList(store: Store, job: Job) {
	if (job.byRule) return
	const parents = parentsOf(store, job).filter(p => pendingEffects(p.effects).length)
	if (!parents.length || !parents.every(p => effectsKey(p) === effectsKey(parents[0]))) return
	const list = carryMarks(parents[0].effects!.map(e => ({ ...e })), job.result?.effects)
	for (const p of parents) { const mine = carryMarks(p.effects!, list); if (keyOf(mine) !== effectsKey(p)) { p.effects = mine; store.save(p) } }
	if (JSON.stringify(list) !== JSON.stringify(job.result?.effects)) job.result = { ...job.result!, effects: list }
}

// A picked option that makes changes, on an item with no job: a job that only carries them, so ok runs the same executor (design-spec S5).
export function createChangeCarrier(store: Store, cfg: Config, wf: Workflow, effects: Effect[], unit?: PrUnit): Job {
	if (unit && !wf.prs?.includes(unit)) throw new Error('The change carrier has no current PR unit')
	const now = new Date().toISOString()
	const job: Job = { schema: 1, id: ulid(), key: `item:${wf.id}`, goal: 'Make the chosen changes', intent: wf.intent, session: { agent: cfg.agent.flavor, id: chooseSession('job', { fresh: true }) }, state: 'done', purpose: 'work', carrier: true, parents: [wf.id], asks: [], result: { summary: 'Chosen by the owner', reply: wf.draft, effects, at: now }, createdAt: now, updatedAt: now }
	store.saveJob(job)
	if (unit) unit.job = job.id
	return job
}

export function changesJob(store: Store, cfg: Config, wf: Workflow, effects: Effect[]) {
	wf.job = createChangeCarrier(store, cfg, wf, effects).id
}

// The changes ok will make ride on the item's own job (a PR review), or on one that only carries them, so ok runs the same executor.
// A new list replaces the old one, or ok would refuse it as out of date (A48). Never while a change run is making the approved list
// ('busy'), nor on a job another open item still shows its own changes from ('shared', review 10-21c P1-1). Returns why it did not.
export function carry(store: Store, cfg: Config, wf: Workflow, effects: Effect[]): 'busy' | 'shared' | undefined {
	const own = wf.job ? store.job(wf.job) : undefined
	if (!own) { changesJob(store, cfg, wf, effects); return undefined }
	if (executing(own)) return 'busy'
	if (parentsOf(store, own).some(p => p.id !== wf.id && pendingEffects(p.effects).length)) return 'shared'
	if (own.purpose === 'work' && own.state === 'queued' && !own.every) {
		// A complete answer replaces queued work, but not another item's review.
		if (parentsOf(store, own).some(p => p.id !== wf.id)) { changesJob(store, cfg, wf, effects); return undefined }
		Object.assign(own, { state: 'done', retry: undefined, nextAt: undefined, wrapUp: undefined, error: undefined })
	}
	own.result = { ...own.result, summary: own.result?.summary ?? 'Chosen by the owner', reply: wf.draft, effects, at: new Date().toISOString() }
	store.saveJob(own)
	return undefined
}

// ok on an item with changes: approve exactly what the owner saw. One change run per job; later oks join it.
// The Settings switch that allows a call, by its label: its action's ("PR vote"), else its tool's, else the tool's name.
const switchOf = (c: Call) => { const one = `${c.tool}:${String(c.args.action ?? '')}`; return changeName(one) !== one ? changeName(one) : changeName(c.tool) }
export function approveEffects(store: Store, cfg: Config, wf: Workflow, again = false): string | undefined {
	let job = wf.job ? store.job(wf.job) : undefined
	if (job?.byRule && executing(job)) return `Review comments for ${wf.code} are being posted. Wait for their receipts before approving other changes.`
	// Recover an already-saved reply proposal whose carrier was left queued as work.
	if (job?.state === 'queued' && job.purpose === 'work' && !job.every && wf.state === 'needs_human' && wf.promised && wf.draft && !wf.pending.length && pendingEffects(wf.effects).length && keyOf(job.result?.effects) === effectsKey(wf)) {
		carry(store, cfg, wf, wf.effects ?? [])
		job = wf.job ? store.job(wf.job) : undefined
	}
	// No change run and no new result under way: the list the open items agree on is the one ok makes (review 10-21d P2-1).
	if (job && !executing(job) && !(job.purpose === 'work' && (job.state === 'running' || job.state === 'queued'))) { store.save(wf); adoptList(store, job); store.saveJob(job); wf.effects = store.workflow(wf.id)?.effects ?? wf.effects }
	const pending = pendingEffects(wf.effects), left = externalPending(wf.effects), legacy = legacyEffectOrigins(wf)
	if (!left.length && pending.length && store.control().paused)
		return `Paused, so ${wf.code}'s changes were not made. Say "resume", then ok again.`
	if (!job || !pending.length) return undefined
	// A change that may have been made is made again only when the owner says so, after checking (review 10-21 P2-7).
	const maybe = left.find(e => maybeOf(store, e))
	if (maybe && !again) return legacy
		? `${wf.code}'s ${shown(maybe).line} may already have been made. Check it, then say "ok ${wf.code} again" to make it once more, or "ok ${wf.code} except ${pending.indexOf(maybe) + 1}" to leave it out.`
		: `${wf.code}'s ${shown(maybe).line} may already have been made. Check it, then re-approve it or leave it out on the current page.`
	// A new result is being worked out; the shown changes may be replaced (review 01-04 P1-4).
	if (job.purpose === 'work' && (job.state === 'running' || job.state === 'queued')) return `${wf.code} is still working on a new result. I'll show it first.`
	if (keyOf(job.result?.effects) !== effectsKey(wf)) {
		// The job holds another open item's changes on the same review: this one waits on that one, so say which (re-review P2-1).
		const first = parentsOf(store, job).find(p => p.id !== wf.id && pendingEffects(p.effects).length && effectsKey(p) === keyOf(job.result?.effects))
		return first ? `${wf.code} waits on ${first.code}'s change on this review: ok or skip ${first.code} first.` : `${wf.code}'s changes are out of date. Ask for a fresh review, or skip ${wf.code}.`
	}
	if (!left.length) return undefined
	// A change refused now, such as one switched off in Settings after it was shown, is never queued (review chui P2-3). It runs before
	// the empty-list check, so with every switch off the owner is sent to the switch, not to setup (re-review N1).
	for (const e of left) {
		const why = refusal(cfg, e, prTargetForEffect(store, wf, e))
		if (why) {
			if (!legacy) return `${wf.code}'s ${shown(e).line} cannot be made: ${why}. Review its setting or leave it out on the current page.`
			return `${wf.code}'s ${shown(e).line} cannot be made: ${why}. ${e.call && !isDeploy(e.call) && !allows(cfg.agent.effectTools, e.call) ? `Turn on "${switchOf(e.call)}" in Settings, or say` : 'Say'} "ok ${wf.code} except ${pending.indexOf(e) + 1}" to ${pending.length === 1 && !(wf.sent && !wf.draft?.text) ? 'send only the reply' : 'leave it out'}.`
		}
	}
	// A deploy is allowed by "Where Delegate may deploy", not by the write tools (owned work).
	if (!cfg.agent.effectTools?.length && !left.every(e => isDeploy(e.call) && cfg.deploy?.allowed.length)) return `${wf.code} has ${left.length} change(s) to make, but no write tools are set. Add them in setup (the "tools" step, as effectTools), or skip ${wf.code}.`
	if (store.control().paused) return `Paused, so ${wf.code}'s changes were not made. Say "resume", then ok again.`
	// "again" counts only once the change run is queued; a refused ok leaves it unsaid (review 10-21b P2-5).
	if (maybe) {
		for (const e of left.filter(x => maybeOf(store, x))) clearCalling(store, e)
		const clear = (es: Effect[] = []) => es.map(e => ({ ...e, maybe: undefined }))
		wf.effects = clear(wf.effects)
		job.result = { ...job.result!, effects: clear(job.result?.effects) }
	}
	const now = new Date().toISOString()
	if (!executing(job)) Object.assign(job, { state: 'queued', purpose: 'execute' })
	store.saveJob(job)
	Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), approved: { text: wf.draft?.text ?? '', effects: effectsKey(wf), at: now }, waitingSince: now, status: `Making ${left.length} change(s)${wf.draft?.text ? ', then sending the reply' : ''}` })
	store.save(wf)
	return ''
}

// A change proposed before exact calls existed can never be made: it becomes the owner's to-do once, with a note,
// and the reply waits to be changed, since it counted on it (review 10-21 P2-11).
export function legacyEffects(store: Store) {
	repairPendingEffectCalls(store, (wf, drafts) => { leaveForYou(store, wf, drafts) })
	const legacyNoCall = (effect: Effect) => !effect.call && !(effect.origin === 'suggested' && INTERNAL_ACTIONS.safeParse(effect).success)
	for (const wf of store.workflows().filter(w => w.state === 'needs_human' && pendingEffects(w.effects).some(legacyNoCall))) {
		const old = pendingEffects(wf.effects).filter(legacyNoCall)
		const keep = (es: Effect[] = []) => es.filter(e => !legacyNoCall(e) || e.done || e.off)
		const job = wf.job ? store.job(wf.job) : undefined
		if (job?.result) { job.result = { ...job.result, effects: keep(job.result.effects) }; store.saveJob(job) }
		const why = 'it was proposed before this update, without the exact call needed to make it'
		leaveForYou(store, wf, old.map(effect => leftRefusal(effectLeftAction(effect, prTarget(store, wf)), 'incomplete', { why })))
		Object.assign(wf, { effects: keep(wf.effects), question: wf.question ?? (wf.draft ? refusedAsk(wf.code, old.length) : undefined), questionHint: wf.question ? wf.questionHint : undefined, revAt: new Date().toISOString() })
		store.save(wf)
		store.log({ event: 'legacy-changes', code: wf.code, n: old.length })
	}
}

// skip on a tracker: no more checks, and a check in progress is stopped (tester 06-07 P1-4).
export function stopTracker(store: Store, procs: Procs, wf: Workflow) {
	const job = wf.job ? store.job(wf.job) : undefined
	if (!job?.every) return
	Object.assign(job, { every: undefined, nextAt: undefined })
	if (job.state === 'running' && job.run && job.run.purpose === 'work') {
		if (!procs.kill(job.run.pid)) { store.saveJob(job); store.setHealth(`job:${job.id}`, `Could not stop the check for ${job.key} (process ${job.run.pid}). Stop it by hand.`); return }
		cleanJobFiles(store, job.run)
		Object.assign(job, { state: 'done', run: undefined })
	}
	if (job.state === 'queued') job.state = 'done'
	store.saveJob(job)
}

export function cancelRetry(store: Store, procs: Procs, wf: Workflow): string | undefined {
	const job = wf.job ? store.job(wf.job) : undefined
	if (!job?.retry || job.purpose !== 'work' || !['queued', 'running'].includes(job.state) || parentsOf(store, job).some(parent => parent.id !== wf.id)) return
	if (job.state === 'running' && job.run) {
		if (!procs.kill(job.run.pid)) {
			const text = `Could not stop the retry for ${wf.code}. Stop process ${job.run.pid} by hand before dismissing it.`
			store.setHealth(`job:${job.id}`, text)
			return text
		}
		cleanJobFiles(store, job.run)
	}
	Object.assign(job, { state: 'done', run: undefined, retry: undefined, nextAt: undefined, wrapUp: undefined })
	store.saveJob(job)
	store.log({ event: 'job-retry-cancelled', job: job.id, code: wf.code })
}

export function stopPromisedWatch(store: Store, procs: Procs, wf: Workflow): string | undefined {
	const home = homeOf(store, wf), job = home.work?.watch ? store.job(home.work.watch) : undefined
	if (!job?.every) return `${wf.code} has no active check-back. Nothing changed.`
	if (job.purpose !== 'work') return `This check-back is making approved changes. Wait for its result before stopping it.`
	if (parentsOf(store, job).some(parent => parent.id !== home.id && parent.partOf !== home.id)) return `This check-back is shared with another item. Nothing changed.`
	if (job.state === 'running' && job.run) {
		if (job.run.machine !== store.machine) return `The check-back is running on ${job.run.machine}. Wait for its result before stopping it.`
		if (!procs.kill(job.run.pid)) {
			const why = `Could not stop the check-back for ${home.code}. Work stays open; stop process ${job.run.pid} by hand.`
			store.setHealth(`job:${job.id}`, why)
			return why
		}
		cleanJobFiles(store, job.run)
	}
	Object.assign(job, { state: 'done', every: undefined, nextAt: undefined, retry: undefined, run: undefined, wrapUp: undefined })
	store.saveJob(job)
	home.work!.watch = undefined
	step(home, 'You stopped the check-back; work stays open', { ref: `watch-stop:${job.id}` })
	store.save(home)
	store.setHealth(`job:${job.id}`)
	store.log({ event: 'work-watch-stopped', job: job.id, code: home.code })
}

// skip, answer, or pause: withdraw this item's ok. A change run nobody still approves is stopped before it does more.
export function withdraw(store: Store, procs: Procs, wf: Workflow) {
	wf.approved = undefined
	for (const unit of wf.prs ?? []) if (unit.review?.run?.approval) bumpReviewEpoch(unit)
	for (const id of workflowJobIds(wf)) {
		const job = store.job(id)
		if (!job || !executing(job) || parentsOf(store, job).some(p => p.id !== wf.id && stillApproved(p, job))) continue
		stopRun(store, procs, job, `${wf.code} withdrew its ok`)
	}
}

// A run is forgotten only once it is confirmed gone; otherwise it stays tracked and the owner is told (review 01-04 P1-5).
function stopRun(store: Store, procs: Procs, job: Job, why: string) {
	if (job.state === 'running' && job.run && !procs.kill(job.run.pid)) {
		store.setHealth(`job:${job.id}`, `Could not stop the changes for ${job.key} (process ${job.run.pid}): ${why}. Stop it by hand.`)
		return
	}
	// Asks that arrived during the stopped run get a work run in the same session.
	const again = !!job.run && job.asks.length > job.run.asks, used = readUse(store, job)
	if (job.run) cleanJobFiles(store, job.run)
	Object.assign(job, { result: { ...job.result!, effects: foldChanges(store, job) }, state: again ? 'queued' : 'done', purpose: 'work', run: undefined })
	adoptList(store, job)
	store.saveJob(job)
	store.log({ event: 'job-execute-stopped', job: job.id, why, ...used, ...(used.runKind ? { outcome: 'stopped' } : {}) })
}

// A tracker check: quiet when the result repeats, one update when it changes, done when its condition holds (R-TRK-02).
function finishCheck(store: Store, job: Job, r: Report, asksAtStart: number) {
	// A check that could not see the target is not news: the last result stands, and the next check comes as usual.
	if (r.goalMet === false && !r.done) {
		Object.assign(job, { state: 'done', run: undefined, missed: undefined, nextAt: new Date(Date.now() + job.every! * 60_000).toISOString() })
		store.saveJob(job)
		store.log({ event: 'track-check-short', job: job.id, why: r.blocker?.why, ...usedBy(job, 'failed') })
		return
	}
	const key = hashOf(r.summary.trim().toLowerCase())
	const changed = key !== job.last
	const now = new Date().toISOString()
	for (const wf of parentsOf(store, job)) {
		if (wf.work?.watch === job.id) {
			const first = job.last === undefined, news = watchNews(wf, r, `watch:${job.id}:${key}`, first)
			if (news || first) store.save(wf, news)
			continue
		}
		if (r.done) { close(wf, `Stopped watching: ${r.summary}`); store.save(wf); continue }
		if (changed) { Object.assign(wf, { status: r.summary, changedAt: now }); store.save(wf) }
	}
	// An answer that arrived during the check gets one more run now, in the same session.
	const again = !r.done && job.asks.length > asksAtStart
	Object.assign(job, { result: { summary: r.summary, effects: [], at: now }, last: key, missed: undefined, state: again ? 'queued' : 'done', run: undefined, nextAt: r.done ? undefined : new Date(Date.now() + job.every! * 60_000).toISOString(), every: r.done ? undefined : job.every })
	store.saveJob(job)
	store.log({ event: 'track-check', job: job.id, changed, done: !!r.done, summary: r.summary, ...usedBy(job, 'done') })
}

// A bootstrap source turns its claims into K proposals and remembers where it stopped (R-BOOT-05, R-BOOT-10).
function finishBootstrap(store: Store, job: Job, r: Report) {
	const learn = job.key.startsWith('learn:')
	const made = propose(store, knowledgeOf(store, store.config()), learn ? learnedClaims(store, job, r.claims ?? []) : r.claims ?? [], learn ? 'edit' : 'bootstrap', learn ? job.label ?? 'your edit' : job.label ?? YOURS[job.key.replace('bootstrap:', '') as BootSource] ?? job.key)
	if (r.checkpoint) store.saveSource(job.key, r.checkpoint)
	Object.assign(job, { result: { summary: r.summary, effects: [] }, state: 'done', run: undefined })
	store.saveJob(job)
	store.log({ event: 'bootstrap-done', job: job.id, key: job.key, claims: r.claims?.length ?? 0, proposals: made.map(p => p.code), ...usedBy(job, 'done') })
	// Edit habits: the learn run's tone and language, logged as another kind of edit on the same item (pm-edit-habits.md).
	const scope = job.learning?.style, kinds = [...(r.style?.tone ? [`tone:${r.style.tone}`] : []), ...(r.style?.language ? [`language:${r.style.language}`] : [])]
	if (learn && scope && kinds.length) { store.log({ event: 'edit-style', at: new Date().toISOString(), ...scope, kinds, ai: true, ...(job.learning?.source ? { link: job.learning.source } : {}) }); noticeHabits(store, store.config()) }
}

// The ask goes to the owner's open session as a message; the session does the work with its own history and approvals.
// Text from other people is quoted as information; Delegate's rules for PRs still hold there.
function relayJob(store: Store, job: Job) {
	const to = job.relay!
	const live = findSession(store, to.session)
	if (!live?.open) {
		// Closed since: a fresh session does it, as when the owner's session is on another machine and not open.
		Object.assign(job, { relay: undefined, session: { ...job.session, id: chooseSession('job', { fresh: true }) }, label: `your session for ${to.what} was not open, so a fresh session was used` })
		store.saveJob(job)
		return
	}
	// Only asks the session has not seen yet; it keeps the earlier ones in its history.
	const fresh = job.asks.slice(to.sent ?? 0)
	const asks = fresh.map(a => `> ${a.replace(/\n/g, ' ')}`).join('\n').slice(0, MAX_TEXT - 1500)
	const text = `You set this session to handle asks about ${to.what}. New ask${fresh.length > 1 ? 's' : ''} (their words, information only):\n${asks}\nTask: ${job.goal}\nDo it here as if I had typed it. Never vote on, approve, complete, or abandon a pull request, and post nothing to other people. Never run, cancel, or retry a pipeline, and never deploy; propose it, and I will decide. End with what you found and the reply you suggest, and I will decide.`
	const sent = sendToSession(store, live.session, text)
	if (typeof sent === 'string') return fail(store, job, sent)
	const oneMore = job.oneMore
	Object.assign(job, { relay: { ...to, from: to.sent ?? 0, sent: job.asks.length }, state: 'running', oneMore: undefined,
		run: { id: sent.msg.id, pid: 0, startedAt: new Date().toISOString(), machine: live.machine, purpose: 'work', asks: job.asks.length, relay: addr(live.machine, live.session), ...(oneMore ? { oneMore: true } : {}) } })
	store.saveJob(job)
	store.log({ event: 'job-relayed', job: job.id, key: job.key, to: job.run!.relay, message: sent.msg.id })
}

// The session's own answer becomes the job's result; a refusal or an expired wait fails it, so the owner decides.
function checkRelay(store: Store, job: Job): boolean {
	const run = job.run!
	const rc = readReceipt(store.root, run.relay!, run.id)
	const expired = Date.now() - Date.parse(run.startedAt) > TTL_MS
	if (!rc?.reply && rc?.state !== 'refused' && !rc?.ended && !rc?.recovered && !expired) return false
	settle(store.root, run.relay!, run.id)
	// A failed relay is retried with every ask it carried, not only the newest (review 10-19 #12).
	if (!rc?.reply && job.relay) job.relay = { ...job.relay, sent: job.relay.from ?? 0 }
	if (rc?.reply) finishWork(store, job, { workflowId: job.id, intent: job.intent ?? 'other', state: 'needs_human', summary: `From your session on ${run.machine}: ${rc.reply.trim().slice(0, 1500)}` }, run.asks)
	else fail(store, job, rc?.state === 'refused' ? `Your session on ${run.machine} did not take it: ${rc.why}` : rc?.ended || rc?.recovered ? `Your session on ${run.machine} took it but recorded no answer (${rc.ended ?? 'it restarted'}); look there` : `Your session on ${run.machine} did not answer within a day`)
	return true
}

// A work run with no report (it crashed, or could not start) is a busy moment, not an answer: it tries again a few times first.
function failOrRetry(store: Store, job: Job, why: string, setup = false) {
	if (job.run?.oneMore) return fail(store, job, `The extra run didn't finish: ${why}`, 'stopped')
	const permanent = setup || SETUP_REFUSAL.test(why)
	if (job.every && job.purpose === 'work' && !job.relay && !permanent) return missedCheck(store, job, why)
	// A setup error (a tool the AI CLI cannot name) will not pass by trying again.
	if (job.purpose !== 'work' || job.relay || job.every || isBootstrap(job) || job.key.startsWith('learn:') || permanent) return fail(store, job, why)
	const p = planRetry(job.retry, { kind: 'transient', why, tried: [] })
	if ('stop' in p) return fail(store, job, p.stop)
	queueRetry(store, job, p.retry, p.fresh)
}

// A tracker check that ends without a result is a missed check, not the end of the watch: it checks again soon, and open work
// says so in a step. Only MISSES in a row stop it, and then the owner sees why (bug 10-23 E40: one worker that ended in the
// middle of a tool call failed a check-back for good, and a later promise re-pointed the failed job with no next check).
const MISSES = 3, MISS_RETRY_MINUTES = 15
function missedCheck(store: Store, job: Job, why: string, outcome: RunOutcome = 'failed') {
	tallyRun(store, job, ended.get(job.id))
	const n = (job.missed ?? 0) + 1, ref = `watch-miss:${job.id}:${job.run?.id ?? n}`
	const work = parentsOf(store, job).filter(w => w.work?.watch === job.id)
	if (n >= MISSES) {
		const reason = `${why} (${n} checks in a row)`
		if (work.length < parentsOf(store, job).length) return fail(store, job, reason, outcome)
		for (const wf of work) { watchEnded(wf, `The check-back on ${watchSubject(job)} stopped: ${reason}. Promise a check-back again to restart it`, store); store.save(wf) }
		Object.assign(job, { state: 'failed', error: reason, run: undefined, every: undefined, nextAt: undefined, missed: undefined, retry: undefined })
		store.saveJob(job)
		store.log({ event: 'job-failed', job: job.id, key: job.key, error: reason, ...usedBy(job, outcome) })
		return
	}
	const next = new Date(Date.now() + Math.min(job.every!, MISS_RETRY_MINUTES) * 60_000).toISOString()
	Object.assign(job, { state: 'done', run: undefined, missed: n, nextAt: next, wrapUp: undefined })
	store.saveJob(job)
	for (const wf of work) if (step(wf, `The check-back on ${watchSubject(job)} did not finish: ${why}. It checks again at ${hhmm(next)}`, { ref })) store.save(wf)
	store.log({ event: 'track-check-missed', job: job.id, key: job.key, n, why, at: next, ...usedBy(job, outcome) })
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function queueRetry(store: Store, job: Job, retry: Retry, fresh: boolean) {
	for (const wf of parentsOf(store, job)) { Object.assign(wf, { ...stateFields(wf, 'waiting_on_task'), status: retryStatus(retry, hhmm), waitingSince: wf.waitingSince ?? new Date().toISOString() }); store.save(wf) }
	Object.assign(job, { state: 'queued', purpose: 'work', retry, nextAt: retry.at, run: undefined, error: undefined, ...(fresh ? { session: { ...job.session, id: chooseSession('job', { fresh: true }) } } : {}) })
	store.saveJob(job)
	store.log({ event: 'retry-planned', job: job.id, key: job.key, n: retry.n, kind: retry.last.kind, why: retry.last.why, at: retry.at, fresh, ...usedBy(job, 'retry') })
}

function shortOfGoal(store: Store, job: Job, r: Report, todos = r.todos) {
	job.result = { ...(job.result ?? { summary: r.summary, effects: [] }), ...retainedWorkFields(r, todos) }
	if (r.refused !== undefined || job.result?.refused !== undefined) job.result = { ...(job.result ?? { summary: r.summary, effects: [] }), refused: r.refused }
	const extra = !!job.run?.oneMore, b = blockerOf(r.blocker)
	const p = extra ? { stop: `The extra run didn't finish: ${b.why}` } : planRetry(job.retry, r.blocker)
	// The earlier result stays, so a fresh try knows what was found before; what fell short is in the retry.
	if (!('stop' in p)) {
		queueRetry(store, job, p.retry, p.fresh)
		for (const wf of parentsOf(store, job)) if ((wf.prs?.length ?? 0) > 1) advanceReviewUnits(store, store.config(), wf)
		return
	}
	// Out of tries, or blocked: the owner sees why, what was tried, and a reply that only says the answer is coming. No changes are offered.
	// With no question and no reply to show, the item is a failed run (#17 b): one plain line, Try again queues the job again, and the
	// routes it tried go in Details, never the whole blocker as its status.
	const draft = r.reply ? { ...r.reply, holding: true as const } : undefined
	const now = new Date().toISOString()
	const tried = [...new Set([...(job.retry?.tried ?? []), ...b.tried])]
	const capability = !extra && 'capability' in p && p.capability
	if (capability) {
		job.stopped = { kind: 'capability', ...(b.need ? { need: b.need } : {}), at: now }
		job.oneMore = undefined
	}
	for (const wf of parentsOf(store, job)) {
		if ((wf.prs?.length ?? 0) > 1 && unitForJob(wf, job.id)) {
			if (!wf.pending.length) leaveForYou(store, wf, reportLeft(r))
			store.save(wf, false)
			continue
		}
		if (!wf.pending.length) {
			const context = leftContext(store, wf)
			context.reviewHead = undefined
			if (context.source.kind === 'review') context.source.at = job.reviewStart?.at ?? context.source.at
			leaveForYou(store, wf, reportLeft(r), context)
		}
		if (r.reply) { wf.ownerSend = undefined; clearHold(wf); wf.returnedFrom = undefined; wf.statusReason = undefined; wf.reviewAgain = undefined }
		else if (wf.ownerSend && (!wf.sent || wf.sent.at < wf.ownerSend.at)) {
			keepApprovedDraft(wf, r.summary || 'No reply needed')
			wf.waitingSince = undefined
			store.save(wf)
			store.log({ event: 'approved-draft-kept', code: wf.code, why: r.summary })
			continue
		}
		const failed = !job.stopped && !r.question && !draft ? { at: now, kind: 'content' as const, why: b.why.replace(/[.\s]+$/, ''), ...(tried.length ? { tried } : {}), job: job.id } : undefined
		// Never an older ask's draft: only this run's holding reply, or none.
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, ...statusFields('not-finished', failed ? `Couldn't finish: ${failed.why}` : p.stop), question: r.question, questionHint: r.question?.trim() && r.questionHint ? normalizeQuestionHint(r.questionHint) : undefined, draft, runFailed: failed, learnAfter: undefined, effects: [], approved: undefined, newCount: 0, revAt: now, decision: { action: 'draft', reason: 'The work is not finished', confidence: 'low' } })
		const home = homeOf(store, wf)
		if (home.work && step(home, `${home === wf ? '' : `${wf.code}: `}Not finished: ${p.stop}`, { ref: `job:${job.id}:${hashOf(p.stop)}` }) && home !== wf) store.save(home)
		store.save(wf)
	}
	Object.assign(job, { result: { summary: r.summary, reply: draft, effects: [], refused: r.refused, ...retainedWorkFields(r, todos) }, state: 'done', purpose: 'work', run: undefined, retry: undefined, nextAt: undefined, ...(extra ? { error: p.stop } : {}) })
	store.saveJob(job)
	for (const wf of parentsOf(store, job)) {
		if ((wf.prs?.length ?? 0) > 1) advanceReviewUnits(store, store.config(), wf)
		else if (refreshReviewQuestions(store, wf)) store.save(wf, false)
	}
	store.log({ event: 'retry-stopped', job: job.id, ...(job.stopped ? { kind: job.stopped.kind } : { key: job.key, why: p.stop }), ...usedBy(job, 'stopped') })
}

function fail(store: Store, job: Job, why: string, outcome: RunOutcome = 'failed') {
	tallyRun(store, job, ended.get(job.id))
	for (const wf of parentsOf(store, job)) {
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), waitingSince: undefined, approved: undefined, ...statusFields('not-finished', `The job did not finish: ${why}`), question: `Answer ${wf.code} to retry with directions, or skip it`, questionHint: undefined })
		store.save(wf)
	}
	Object.assign(job, { state: 'failed', error: why, run: undefined, purpose: 'work', retry: undefined, nextAt: undefined })
	store.saveJob(job)
	store.log({ event: 'job-failed', job: job.id, ...(job.stopped ? { kind: job.stopped.kind } : { key: job.key, error: why }), ...usedBy(job, outcome) })
}

// A run's log holds the AI CLI's raw output; once the run is over, any secret in it is hidden (review 10-21 P2-6).
function scrubLog(store: Store, runId: string) {
	const f = join(LOCAL_DIR, 'sessions', `${runId}.log`)
	if (!existsSync(f)) return
	const text = readFileSync(f, 'utf8'), clean = scrub(text)
	if (clean !== text) writeText(f, clean, store.machine)
}

// A change in a status line: what its call does, and its arguments, short.
const changeText = (e: Effect) => changeSays(e).slice(0, 120)

const TRACKER_SESSION_LIMIT = 2 * 1024 * 1024

export function parentsOf(store: Store, job: Job): Workflow[] {
	const review = job.purpose === 'work' && !job.carrier && isReviewJob(job.key, job.intent)
	return job.parents.map(id => store.workflow(id)).filter((w): w is Workflow => !!w && w.state !== 'done' &&
		(w.prs && review ? !!unitForJob(w, job.id)?.requested : workflowJobIds(w).includes(job.id) || w.work?.watch === job.id))
}
