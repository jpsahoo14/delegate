import { CMD, NAME } from '../brand.ts'
import { blockerOf } from './retry.ts'
import { active, addPart, canCloseReport, hasDecisions, homeOf, joinWhy, mergeReportWork, settle, step } from './work.ts'
import { assertTestSafe, freshRead, readJson, readPhase, writeJson } from '../store/fs.ts'
import { z } from 'zod'
import { readActions, undoableAction, type FoldedAction } from '../store/actions.ts'
import { recordCommit } from './commit.ts'
import { stateFields, statusFields } from '../core/upgrades.ts'
import { normalizeQuestionHint } from '../core/normalize-report.ts'
import { closeFamily } from './apply.ts'
import { realProcs } from './jobs.ts'
import { stopWatch } from './track.ts'
import { draftUse, sharingHold } from './sharing.ts'
import { readsOf, type Reads } from './provenance.ts'
import { catalogInfo, scopeTools, sourceToolScope, workerTools, type ToolFamily, type ToolScope } from './catalog.ts'
import { existsSync, readFileSync } from 'node:fs'
import { backupSession, pruneReplySessions, restoreSession } from './own.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Automation, Config, Report, Workflow } from '../core/types.ts'
import { chooseSession } from './session-policy.ts'
import { clearHold, keepApprovedDraft } from '../core/owner-send.ts'
import { checkPreservedHold, refreshApprovedHolds } from './send-holds.ts'
import { describe } from './automations.ts'
import { ulid } from '../core/ids.ts'
import { actionNudge, MARK, plain, renderNudge, renderPreview } from '../core/render.ts'
import { runAgent, sessionLog, checkAgentTools, SetupError, type RunInput, type RunResult } from '../adapters/agent.ts'
import type { Source } from '../adapters/source.ts'
import { here, LOCAL_DIR, type Store } from '../store/state.ts'
import { buildAskPrompt, buildPrompt, replyFacts } from '../worker/prompt.ts'
import { corrections } from '../store/feedback.ts'
import { heldLevel } from '../core/levels.ts'
import { CLI } from '../paths.ts'
import { auditSkip, joinInto, say, splitOff } from './intake.ts'
import { ackJob, afterDraft, ownerActive } from './autosend.ts'
import { advanceReviewUnits, attachJob, carry, jobForRecheck, recheckJob } from './jobs.ts'
import { askedVote, asksInvite, isInvite, isVote, pendingEffects, proposalEffects, refusedAsk, sameHead, sameProposal, vet, voteName, voteValue } from '../core/effects.ts'
import { allowLeft, settleLeftRetry } from './left.ts'
import { leaveForYou, reportLeft } from './left-source.ts'
import { probePRs, prRefOf, prTarget, sameVote, voteNow, type BuildProbe } from './probe.ts'
import { decline, groupQuestion, isReviewJob, MAY_REVIEW, reviewAsked, reviewGate, voteGate } from './review-gate.ts'
import { checkPromise, failPromise, promisesDue } from './promise.ts'
import { heldBy } from './owner.ts'
import { knowledgeOf, resolveEvidence } from './proposals.ts'
import { inQuietHours } from '../core/policy.ts'
import { reportFromText } from '../core/report.ts'
import { scrubDeep } from '../core/secrets.ts'
import { intents } from '../core/intents.ts'
import { unsafeRead, SETUP_REFUSAL } from '../core/effects.ts'
import { shellInClone, shellTool } from './validate.ts'
import { toolServers } from '../adapters/mcp-client.ts'
import { ran, sessionUse, usageKey } from '../core/runinfo.ts'
import { agentSetupFailure, unavailableTools } from '../core/agent-failure.ts'
import { blockedAgent, holdAgent, waitingForAgent } from './agent-health.ts'
import { askRelation, freshAsk } from './same-ask.ts'
import { prepareReportCalls } from './effect-preparation.ts'
import { addInternalSuggestions } from './internal-effects.ts'
import { compileRule } from './rule-compile.ts'
import { lineNeedsCompile, ruleTextHash } from '../core/rule-lines.ts'
import { ruleLines, rulesToCompile } from '../store/rules.ts'
import { standingInstructions } from '../core/ways.ts'

export type RunWorker = (cfg: Config['agent'], input: RunInput & { workflowId: string; runId: string }) => Promise<RunResult>

const AUTH = /bad credentials|not logged in|please run \/login|authenticat|unauthori[sz]ed|sign[ -]?in/i
const CATALOG_CHANGED = /MCP tool catalog changed/i
const UNKNOWN_READ_HOLD = "It searched your chats and I couldn't tell which ones it read"

// Each queued workflow runs once, with all of its new messages together (R-WF-02, R-WF-06).
export async function dispatch(store: Store, src: Source, cfg: Config, run: RunWorker = runAgent, probe?: BuildProbe, only?: readonly string[]): Promise<number> {
	if (!store.upgrades()['reply-sessions-1']) pruneReplySessions(store)
	restoreApprovedDrafts(store)
	await refreshApprovedHolds(store, src)
	const held = blockedAgent(store, cfg)
	if (held) { waitingForAgent(store, held); return 0 }
	// An item open in a Continue window belongs to the owner until it closes (R-WF-07).
	const cap = cfg.dailyRuns ?? 200
	const room = cap - store.runsToday()
	const running = store.workflows().filter(w => (!only || only.includes(w.id)) && w.state === 'running' && heldBy(store, w) !== 'window').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
	// The first-setup backlog is drafted behind live asks, a few per check, within half of the day's runs (first-sweep.md).
	const paced = running.filter(w => w.paced).sort((a, b) => Number(!!a.startedBy) - Number(!!b.startedBy)).slice(0, store.runsToday() < cap / 2 ? cfg.maxParallel : 0)
	const queue = [...running.filter(w => !w.paced), ...paced].slice(0, Math.max(0, room))
	const defer = (items: Workflow[]) => {
		for (const item of items) {
			const w = freshRead(() => store.workflow(item.id))
			if (!w || w.state !== 'running' || w.intakeDeferred) continue
			for (const msgId of w.pending) auditSkip(store, w.chat.id, msgId, 'budget-deferred', w.id)
			w.intakeDeferred = true; store.save(w, false)
		}
	}
	defer(running.filter(w => !queue.includes(w)))
	let done = 0
	// The owner's questions about an item run after drafting, in the item's session, and never change it (design-spec S12).
	const asks = only ? [] : store.workflows().filter(w => w.notes?.some(n => n.a === undefined) && w.state !== 'running' && heldBy(store, w) !== 'window' && !(w.job && store.job(w.job)?.state === 'running'))
	queue.push(...asks.slice(0, Math.max(0, room - queue.length)))
	// A pool, not batches: a queued run starts as soon as any slot frees, so one slow draft never holds the others back (latency b).
	// Once the AI CLI is blocked (such as a 402), no further run starts; the waiting items stay queued.
	const slots = Math.max(1, cfg.maxParallel ?? 3)
	const attempted = new Set<string>(), compiling = new Set<string>(), compileFailures = new Map<string, string>()
	let compileBlocked = false, checkedCompiles = false
	let next = 0
	await Promise.all(Array.from({ length: Math.min(slots, Math.max(0, room)) }, async () => {
		for (;;) {
			if (blockedAgent(store, cfg) || store.runsToday() >= cap) break
			let line: ReturnType<typeof rulesToCompile>[number] | undefined
			const control = store.control()
			if (!compileBlocked && !control.paused && !control.stopped) {
				try {
					line = freshRead(() => rulesToCompile(store)).find(l => !compiling.has(l.id) && !attempted.has(`${l.id}:${ruleTextHash(l.text)}`))
					checkedCompiles = true
				} catch (error) {
					compileBlocked = true
					const why = `Could not queue rule reading: ${String(error).slice(0, 200)}`
					compileFailures.set('queue', why)
					store.setHealth('rule-compile', why)
					store.log({ event: 'rule-compile-failed', stage: 'queue', error: why })
				}
			}
			if (line) {
				const current = line, textHash = ruleTextHash(current.text)
				attempted.add(`${current.id}:${textHash}`); compiling.add(current.id)
				try {
					const result = await readPhase(`rule-compile:${current.id}`, () => compileRule(store, cfg, current, run))
					const pending = !result.ok && freshRead(() => ruleLines(store)).some(l => l.id === current.id && ruleTextHash(l.text) === textHash && lineNeedsCompile(l))
					if (!result.ok && pending) { compileFailures.set(current.id, result.why); store.setHealth('rule-compile', result.why) }
					else compileFailures.delete(current.id)
					store.log({ event: 'rule-compile-finished', id: current.id, textHash, ok: result.ok, ...(!result.ok ? { why: result.why } : {}) })
				} catch (error) {
					const why = `Could not read this rule; your text is kept. ${String(error).slice(0, 200)}`
					compileFailures.set(current.id, why)
					store.setHealth('rule-compile', why)
					store.log({ event: 'rule-compile-failed', id: current.id, textHash, error: why })
				} finally { compiling.delete(current.id) }
				done++
				continue
			}
			if (next >= queue.length) break
			const wf = queue[next++]
			const queued = freshRead(() => store.workflow(wf.id))
			if (queued?.paced || queued?.intakeDeferred) { queued.paced = undefined; queued.intakeDeferred = undefined; store.save(queued, false) }
			// One run that cannot start fails only its own item; sends, reminders, and the other drafts go on (review 10-20 R3).
			try { await readPhase(`draft:${wf.id}`, () => runOne(store, src, cfg, wf, run, probe)) } catch (e) { startFailed(store, wf, e); continue }
			const ran = freshRead(() => store.workflow(wf.id))
			if (ran?.startFails) { ran.startFails = undefined; store.save(ran, false) }
			done++
		}
	}))
	if (checkedCompiles || compileBlocked) store.setHealth('rule-compile', compileFailures.values().next().value)
	defer(queue.slice(next))
	pruneReplySessions(store)
	// The owner's own words that went out on a PR item: one short run each maps what they promise to changes held for ok (Slice 3).
	for (const w of (only ? [] : promisesDue(store, cfg)).slice(0, Math.max(0, room - done))) {
		if (blockedAgent(store, cfg)) break
		// Anything that breaks after the run started leaves the item where the owner can check again, never stuck checking.
		try { await checkPromise(store, src, cfg, w, run, probe) } catch (e) { const f = store.workflow(w.id); if (f?.promise?.state === 'checking') failPromise(store, f, String(e).replace(/^Error: /, '')) }
		done++
	}
	for (const a of (only ? [] : store.automations()).filter(a => a.heard && a.state === 'active').slice(0, Math.max(0, room - done))) { if (blockedAgent(store, cfg)) break; await judgeReply(store, cfg, a, run); done++ }
	return done
}

// The last legacy repair (#37): only the logged approval -> forced rerun -> no-reply sequence qualifies.
// Log evidence is scanned only once per store, recorded in the versioned upgrade markers.
export function restoreApprovedDrafts(store: Store): number {
	const upgrades = store.upgrades()
	if (upgrades['draft-restore-37']) return 0
	const candidates = store.workflows().filter(w => !w.draft && !w.ownerSend && !w.sent && !w.redacted && w.kind === 'reply' &&
		(w.state === 'open' || w.state === 'done' && w.closedBy === 'nothing') && !w.work?.closed)
	const logs = candidates.length ? store.logs(30).sort((a, b) => String(a.at).localeCompare(String(b.at))) : []
	let restored = 0
	for (const w of candidates) {
		const own = logs.filter(e => e.workflowId === w.id || e.code === w.code)
		const answer = own.filter(e => e.event === 'answer').at(-1)
		if (!answer || answer.verb !== 'ok' && answer.verb !== 'send') continue
		const approvalAt = Date.parse(String(answer.at))
		const rerun = own.find(e => e.event === 'state' && e.to === 'running' && e.status === 'New messages arrived. Redrafting.' &&
			// Applying an answer logs its state before its final "answer" receipt, often in the same second.
			Math.abs(Date.parse(String(e.at)) - approvalAt) <= 60_000)
		if (!rerun) continue
		const ended = own.filter(e => e.event === 'worker' && Date.parse(String(e.at)) >= Date.parse(String(rerun.at)) &&
			Date.parse(String(e.at)) <= approvalAt + 10 * 60_000 && typeof e.runId === 'string').at(-1)
		if (!ended) continue
		const empty = store.archivedReport(w.id, String(ended.runId))
		if (!empty || empty.reply) continue
		const previous = own.filter(e => e.event === 'worker' && typeof e.runId === 'string' && Date.parse(String(e.at)) <= approvalAt).reverse()
		const reply = previous.map(e => ({ event: e, report: store.archivedReport(w.id, String(e.runId)) })).find(e => !!e.report?.reply?.text.trim())
		if (!reply?.report?.reply) continue
		w.ownerSend = { draft: { ...reply.report.reply }, at: String(answer.at), askMsgId: w.lastMsgId }
		keepApprovedDraft(w, empty.summary || 'No reply needed')
		store.save(w)
		store.log({ event: 'draft-restored', code: w.code, workflowId: w.id, fromRunId: reply.event.runId, approvedAt: answer.at })
		restored++
	}
	store.saveUpgrades({ ...upgrades, 'draft-restore-37': new Date().toISOString() })
	return restored
}

// Versioned upgrade for preflight's first release. Only the latest failed host run is eligible; its log key prevents replay after
// a crash, and the upgrade marker avoids scanning history on subsequent ticks. Ordinary content failures are never requeued.
export function retryHostToolFailures(store: Store): number {
	if (store.probeMark().hostToolsUpgrade === 1) return 0
	const candidates = store.workflows().filter(w => w.state === 'needs_human' && !w.question && w.runFailed?.kind === 'other' && w.runFailed.why === 'the run stopped without a result')
	const logs = candidates.length ? store.logs(14).sort((a, b) => String(a.at).localeCompare(String(b.at))) : []
	const last = new Map(logs.filter(e => e.event === 'worker' && typeof e.workflowId === 'string').map(e => [e.workflowId, e]))
	const retried = new Set(logs.filter(e => e.event === 'host-tools-requeued').map(e => `${e.workflowId}:${e.runId}`))
	let n = 0
	for (const w of candidates) {
		const e = last.get(w.id), key = `${w.id}:${e?.runId}`
		if (!e || e.via !== 'host' || e.intent || e.summary || typeof e.runId !== 'string' || typeof e.ms !== 'number' || retried.has(key)) continue
		const ended = Date.parse(String(e.at)), started = ended - e.ms
		if (w.sent && Date.parse(w.sent.at) >= started || w.revAt && Date.parse(w.revAt) > ended) continue
		const file = join(store.root, 'sessions', w.session.id, 'events.jsonl')
		let answer: string | undefined
		try {
			if (!existsSync(file)) continue
			for (const line of readFileSync(file, 'utf8').split('\n').filter(l => /"type"\s*:\s*"assistant.message"/.test(l))) {
				const event = JSON.parse(line) as { timestamp?: string; data?: { content?: string } }
				const at = Date.parse(event.timestamp ?? '')
				if (at >= started && at <= ended && typeof event.data?.content === 'string') answer = event.data.content
			}
		} catch (error) { store.log({ event: 'host-tools-history-unreadable', workflowId: w.id, runId: e.runId, error: String(error).slice(0, 200) }); continue }
		const missing = unavailableTools(answer ?? '', [...WORKER_TOOLS, ...workerTools(store.config(), 'reply')])
		if (!missing.length) continue
		Object.assign(w, { ...stateFields(w, 'running'), question: undefined, questionHint: undefined, runFailed: undefined, status: 'Running again: the earlier AI host did not provide its tools.', pending: w.pending.length ? w.pending : w.msgIds.slice(-1) })
		store.save(w)
		store.log({ event: 'host-tools-requeued', workflowId: w.id, code: w.code, runId: e.runId, missing })
		n++
	}
	store.saveProbeMark({ ...store.probeMark(), hostToolsUpgrade: 1 })
	store.log({ event: 'host-tools-upgraded', version: 1, requeued: n })
	return n
}

// A person's message to the owner: anything in a 1:1, or in a group the message right after his own (within a day) (queue-new #18).
export const BOT = /\b(?:bot|app|notifications?|alerts?|no-?reply|azure devops|github|jira|pipelines?)\b/i
export function answersOwner(store: Store, wf: Workflow): boolean {
	if (!wf.asker?.name || BOT.test(wf.asker.name) || !wf.lastAsk?.trim()) return false
	if (!wf.chat.group) return true
	const thread = store.thread(wf.id), first = thread.findIndex(m => wf.msgIds.includes(m.id) && !m.byOwner)
	const before = first > 0 ? thread[first - 1] : undefined
	return !!before?.byOwner && Date.parse(thread[first].at) - Date.parse(before.at) < 86_400_000
}

// Why a run gave no result, in plain words for the card (queue-new #11).
const failWhy = (res: RunResult) => {
	const first = (res.error ?? '').split(/\r?\n/).map(l => l.trim()).find(Boolean)?.replace(/^Error: /, '')
	return res.exitCode === 0 || !first ? 'the run stopped without a result' : `the run failed (${first.slice(0, 140)})`
}

function startFailed(store: Store, wf: Workflow, e: unknown) {
	const typedSetup = e instanceof SetupError
	const raw = typedSetup ? e.message : String(e).replace(/^Error: /, '')
	const account = typedSetup ? undefined : agentSetupFailure(raw)
	if (account) { holdAgent(store, store.config(), account); return }
	// A setup refusal is kept whole: its tool name is the fix (bug 10-23 E33).
	const setup = typedSetup || SETUP_REFUSAL.test(raw), why = setup ? raw : String(e).slice(0, 160)
	store.log({ event: 'run-failed', workflowId: wf.id, code: wf.code, error: why })
	const fresh = store.workflow(wf.id)
	// A setup the owner must change stops the run for the owner at once, a question about the item too (round 2 P2-1, P2-2).
	if (fresh && setup) {
		const why2 = raw.replace(/^Could not start(?: [^\n]*?)?: (?:Error: )?(?=\S)/, '').replace(/^(?:Could not start: )+/, '')
		Object.assign(fresh, { startFails: undefined, ...(fresh.state === 'running' ? { state: 'needs_human' } : {}), ...statusFields('could-not-start', `Could not start: ${why2}`), notes: fresh.notes?.map(n => (n.a === undefined ? { ...n, a: `Not asked: ${why2}` } : n)) })
		store.save(fresh)
		store.log({ event: 'run-start-refused', workflowId: wf.id, code: wf.code, error: why2 })
		return
	}
	if (!fresh || fresh.state !== 'running') return
	const n = (fresh.startFails ?? 0) + 1
	Object.assign(fresh, n < 3 ? { startFails: n, ...statusFields('could-not-start', `Could not start the AI run: ${why}. Trying again on the next check.`) } : { startFails: undefined, ...stateFields(fresh, 'needs_human'), ...statusFields('could-not-start', `Could not start the AI run 3 times: ${why}. Check the AI CLI with "${CMD} doctor".`), runFailed: { at: new Date().toISOString(), kind: 'other' as const, why: `the AI run could not start 3 times (${why.slice(0, 120)})` } })
	store.save(fresh)
	store.log({ event: 'run-start-failed', workflowId: wf.id, code: wf.code, n, error: why })
}

// The reminded person replied: the AI reads it with the reminder in view and says done, a time, or keep (B4).
// No phrase is special-cased. If it cannot decide, the reminder pauses, as it did before, so it never nags by mistake.
export async function judgeReply(store: Store, cfg: Config, a: Automation, run: RunWorker = runAgent, now = new Date()) {
	if (blockedAgent(store, cfg)) return
	const runId = ulid(), heard = a.heard!
	const { cwd, mcpConfigPath } = workerMcp(store, a.id, runId)
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
	const prompt = [
		`You decide what one reminder does now that the person replied. Reminder ${a.code} to ${a.to.name}: ${JSON.stringify((a.texts ?? [a.text]).join(' / '))}. Schedule: ${describe(a).replace(/^R\d+ · /, '')}.`,
		`Their reply (${heard.at}): ${JSON.stringify(heard.text)}`,
		`Now: ${now.toISOString()} (the owner's time zone is ${tz}).`,
		'Decide one:',
		'- done: they did it, or say it no longer applies.',
		'- later <time>: they say when they will do it ("at 5", "tomorrow morning"). Give the time as ISO 8601 with its offset, in the owner\'s time zone.',
		'- keep: anything else, including questions and replies about other things.',
		`Call submit_report once with workflowId "${a.id}", intent "none", state "done", and summary exactly one of: "done", "keep", "later <time>".`,
	].join('\n')
	store.addRun()
	const sessionId = chooseSession('one-off', { fresh: true }), startedAt = new Date().toISOString()
	const res = await run(cfg.agent, { workflowId: a.id, runId, sessionId, prompt, cwd, mcpConfigPath, extraTools: [`${WORKER_SERVER}-submit_report`], dirs: [] })
	const endedAt = new Date().toISOString()
	const said = store.peekReport(a.id, runId)?.summary?.trim() ?? ''
	store.archiveReport(a.id, runId)
	const account = !said && (res.setup ?? agentSetupFailure(`${res.error ?? ''}\n${res.summary ?? ''}`))
	store.log({ event: 'automation-judged', code: a.code, said: said.slice(0, 80), ms: res.ms, runId, sessionId, startedAt, endedAt, tools: { offered: cfg.agent.tools.length, scoped: false },
		...ran('reminder', res.used, { ...sessionUse(sessionId, '', Date.parse(startedAt), { fresh: true }),
			key: usageKey('job', `job:${a.id}`), promptChars: prompt.length, outcome: said ? 'done' : 'failed' }) })
	if (account) {
		holdAgent(store, cfg, account)
		store.saveAutomation({ ...(store.automations().find(item => item.id === a.id) ?? a), why: account.text, updatedAt: now.toISOString() })
		return
	}
	const fresh = freshRead(() => store.automations().find(x => x.id === a.id)) ?? a, first = heard.from.split(/\s+/)[0]
	const later = /^later\s+(\S+)/i.exec(said), at = later ? new Date(later[1]) : undefined
	const change: Partial<Automation> =
		/^done\b/i.test(said) ? { state: 'ended', next: undefined, why: `${first} said it is done` }
		: at && !isNaN(at.getTime()) && at > now && at.getTime() - now.getTime() < 7 * 86_400_000 ? { next: at.toISOString(), why: `${first} said ${at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}; the next reminder moved` }
		: /^keep\b/i.test(said) ? { why: `${first} replied; reminders continue` }
		: { state: 'paused', next: undefined, why: `${first} replied` }
	store.saveAutomation({ ...fresh, ...change, heard: undefined, updatedAt: now.toISOString() })
}

// The folders a worker may open: the knowledge folders and card roots only, never the rest of the storage folder,
// which holds other people's threads (live card test: the knowledge index was unreadable).
// Only folders that exist: the AI CLI refuses to start when one is missing (a new store has no knowledge folder yet; found in the live Q3 run).
export const readDirs = (store: Store, cfg: Config): string[] => [...new Set([...(cfg.knowledge ?? []).map(f => here(store.root, f)), cfg.cards?.root ?? join(store.root, 'knowledge'), ...(cfg.cards?.team ? [cfg.cards.team] : [])])].filter(d => existsSync(d))

// What a run read, from its slice of the session log (#21). A Claude run writes no Copilot log; its reply runs never get Teams reads
// (workerTools keeps that filter for it), so only its draft's own sources count, as before.
export function runReads(store: Store, cfg: Config, session: string, logStart: number): Reads {
	if (cfg.agent.flavor !== 'copilot') return { chats: [], searches: [], unknown: false, calls: [], knowledge: 0 }
	return readsOf(sessionLog(cfg.agent.flavor, session).slice(logStart), knowledgeOf(store, cfg), readDirs(store, cfg), undefined, ref => store.documentChats(ref), cfg.orgVisibleProjects ?? [])
}

// Every agent run gets the delegate MCP server in worker mode, scoped to one target and run (R-SEC-02).
// Workers report once and open images or Office documents. Other reads use the owner's native tools (#21/#40).
// Its own server name: the owner's global "delegate" server (from install) would otherwise shadow it, and the worker would get no tools.
export const WORKER_SERVER = 'delegate_worker'
// Delegate's own report and decoding tools, shared by spawned and hosted runs.
export const WORKER_TOOLS = ['submit_report', 'image_read', 'doc_read'].map(t => `${WORKER_SERVER}-${t}`)

export function workerMcp(store: Store, targetId: string, runId: string, interactive = false): { cwd: string; mcpConfigPath: string } {
	const cwd = join(LOCAL_DIR, 'sessions')
	assertTestSafe(cwd)
	mkdirSync(cwd, { recursive: true })
	const mcpConfigPath = join(cwd, `mcp-${runId}.json`)
	// Extra servers the owner chose in setup (for example Azure DevOps) join every run, without touching the global agent config.
	writeFileSync(mcpConfigPath, JSON.stringify({
		mcpServers: {
			...store.config()?.agent.mcpServers,
			[WORKER_SERVER]: {
				type: 'local', command: process.execPath, args: [CLI, 'mcp'], tools: ['*'],
				env: { DELEGATE_MODE: 'worker', DELEGATE_WORKFLOW: targetId, DELEGATE_RUN: runId, DELEGATE_ROOT: store.root, DELEGATE_LOCAL: LOCAL_DIR, ...(interactive ? { DELEGATE_INTERACTIVE: '1' } : {}) },
			},
		},
	}))
	return { cwd, mcpConfigPath }
}

// A private chat's lessons stay in that chat; an off-the-record chat's are never used (round 3, per-chat level).
const lessonFits = (cfg: Config, chat: string | undefined, here: string) => { const l = heldLevel(cfg, chat); return !l || (l === 'private' && chat === here) }

// A setup error that stops a run before it starts, the same for every run: never retried (round 2 P2-1, P2-2).
// tools: the run's read tools (workerTools, #17).
function refuseStart(cfg: Config, offered: string[] | (() => string[]), folder?: string): string[] {
	const tools = typeof offered === 'function' ? offered() : offered
	const unsafe = unsafeRead(tools, Object.keys(toolServers(cfg)), catalogInfo(cfg))
	if (unsafe) throw new Error(unsafe)
	checkAgentTools({ ...cfg.agent, tools })
	const shell = folder && shellTool(tools)
	if (shell) throw new Error(shellInClone(shell))
	return tools
}

function workflowToolScope(store: Store, wf: Workflow, base?: readonly ToolFamily[]): ToolScope {
	const text = [wf.lastAsk ?? '', ...(wf.draft?.sources.map(source => source.ref) ?? []),
		...store.thread(wf.id).map(message => `${message.text}\n${JSON.stringify(message.attachments ?? [])}`)].join('\n')
	const scope = sourceToolScope(text, !!wf.meeting, base)
	if ((wf.key.type === 'pr' || wf.key.type === 'workItem' || wf.prs?.some(unit => unit.ref)) && !scope.includes('ado')) scope.push('ado')
	return scope
}

async function runOne(store: Store, src: Source, cfg: Config, wf: Workflow, run: RunWorker, probe?: BuildProbe, catalogRetried = false, separate = false, retrySession?: string, fullCatalog = false): Promise<void> {
	if (blockedAgent(store, cfg)) return
	const current = freshRead(() => store.workflow(wf.id))
	if (!current) throw new Error('The queued item disappeared before its run')
	if (wf.state === 'running' && current.state !== 'running') { store.log({ event: 'worker-skipped', code: wf.code, reason: 'state changed before start' }); return }
	wf = current
	const full = workerTools(cfg, 'reply')
	const tools = refuseStart(cfg, () => scopeTools(cfg, full,
		fullCatalog ? undefined : workflowToolScope(store, wf, cfg.agent.replyScope?.base), cfg.agent.replyScope?.fullOnly))
	const offered = { offered: tools.length, scoped: tools.length < full.length }
	if (wf.state !== 'running') return runAsk(store, src, cfg, wf, run, undefined, fullCatalog)
	const approvedDraft = wf.draft ?? (wf.approved?.text ? { text: wf.approved.text, commitment: false, sources: [] } : undefined)
	if (!wf.ownerSend && approvedDraft && wf.approved) {
		const at = wf.approved.at
		if (!wf.sent || wf.sent.at < at) {
			wf.ownerSend = { draft: structuredClone(approvedDraft), at, askMsgId: wf.lastMsgId }
			store.save(wf, false)
		}
	}
	const age = Date.now() - Date.parse(wf.prReadAt ?? '')
	if (!(wf.ownerAnswer && wf.prRead && !wf.prUnknown && age >= 0 && age < 10 * 60_000))
		await probePRs(store, cfg, probe, Date.now(), true, [wf])
	if (wf.state !== 'running' || blockedAgent(store, cfg)) return
	const runId = ulid(), sessionId = chooseSession('reply', retrySession != null ? { keep: retrySession } : { fresh: true }), startedAt = new Date().toISOString()
	const previousDrewOn = wf.draft ? wf.drewOn ?? [] : []
	const previousShareHold = wf.draft ? wf.shareHold : undefined
	const previousRecords = wf.draft ? wf.records ?? [] : []
	const completedJob = wf.job ? store.job(wf.job) : undefined
	const jobContext = completedJob?.state === 'done' ? replyFacts(completedJob.result?.context ?? wf.context) : []
	// Legacy completed jobs kept their findings only on the item. Snapshot once on read, without rerunning the job.
	if (completedJob?.state === 'done' && completedJob.result && completedJob.result.context === undefined) {
		completedJob.result.context = jobContext
		store.saveJob(completedJob)
	}
	const { cwd, mcpConfigPath } = workerMcp(store, wf.id, runId)
	const others = wf.code && !separate ? store.openInChat(wf.chat.id).filter(o => o.id !== wf.id && o.code && !o.followUp && !o.sent && freshAsk(store, o) && askRelation(store, o, wf.lastAsk ?? '') !== 'different') : []
	const home = homeOf(store, wf)
	const scopes = [{ workflow: wf, pr: prTarget(store, wf) }]
	// A new item may belong to work that started in another chat; the worker sees the open work to say so (R-WRK-10).
	const works = !wf.work && !wf.partOf ? store.workflows().filter(w => active(w) && !w.partOf && w.chat.id !== wf.chat.id && !heldLevel(cfg, w.chat.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8) : []
	const prompt = buildPrompt(wf, store.thread(wf.id), { ...cfg, agent: { ...cfg.agent, tools } }, store.root, store.owners(), others, corrections(store.lessons().filter(l => lessonFits(cfg, (l.detail as { chat?: string } | undefined)?.chat, wf.chat.id)), wf), { home: home === wf ? undefined : home, works, parts: home.work?.parts?.map(id => store.workflow(id)).filter((p): p is Workflow => !!p) ?? [], job: completedJob, scopes, instructions: standingInstructions(store, scopes), tools: offered })
	const usage = { ...sessionUse(sessionId, '', Date.parse(startedAt), { fresh: true, ...(retrySession ? { why: 'catalog' as const } : {}) }),
		key: usageKey('chat', `chat:${wf.chat.id}`), promptChars: prompt.length }
	store.addRun()
	const logStart = 0
	// What the run read is taken from the AI CLI's own session log (#21), so a reply may read Teams with Teams' own tools.
	const res = await run({ ...cfg.agent, tools }, { workflowId: wf.id, runId, sessionId, prompt, cwd, mcpConfigPath, extraTools: WORKER_TOOLS, dirs: readDirs(store, cfg) })
	const endedAt = new Date().toISOString()
	// The CLI never started: no session to keep and no report to read; it counts toward the start tries.
	if (res.error?.startsWith('Could not start')) {
		store.log({ event: 'worker', workflowId: wf.id, code: wf.code, runId, sessionId, startedAt, endedAt, ms: res.ms,
			exitCode: res.exitCode, error: res.error, tools: offered, ...ran('draft', res.used, { ...usage, outcome: 'failed' }) })
		throw new Error(res.error)
	}
	const read = runReads(store, cfg, sessionId, logStart)
	if (read.unknown) store.log({ event: 'reads-unknown', code: wf.code, why: [...new Set(read.calls.map(c => c.unknown).filter(Boolean))] })
	backupSession(store, sessionId)
	// A report salvaged from the run's last words is scrubbed as one written by submit_report is (review 10-21 P2-6).
	const raw = store.peekReport(wf.id, runId) ? undefined : reportFromText(res.summary, wf.id, intents(store.root).map(i => i.id))
	const salvaged = raw && scrubDeep(raw)
	let report = store.peekReport(wf.id, runId) ?? salvaged
	store.log({ event: 'worker', ...(salvaged ? { salvaged: true } : {}), workflowId: wf.id, code: wf.code, runId, sessionId, startedAt, endedAt, fresh: true, inputTokens: res.used?.tokensIn, calls: res.used?.modelCalls, exitCode: res.exitCode, ms: res.ms, tools: offered, ...(res.via ? { via: res.via } : {}), ...(res.via === 'host' ? { warm: !!res.warm } : {}), intent: report?.intent, summary: report?.summary, sources: report?.reply?.sources, commitment: report?.reply?.commitment, error: res.error, ...ran('draft', res.used, { ...usage, outcome: report && report.goalMet !== false ? 'done' : 'failed' }) })
	const fresh = freshRead(() => store.workflow(wf.id)) ?? wf
	const commit = recordCommit(fresh, () => store.workflow(fresh.id), store.save.bind(store))
	const oldSession = fresh.session
	fresh.session = { ...oldSession, id: sessionId, at: startedAt,
		previous: oldSession.at ? oldSession.id : oldSession.previous,
		retired: [...new Set([...(oldSession.retired ?? []), ...(oldSession.at && oldSession.previous ? [oldSession.previous] : [])])] }
	commit(false)
	const account = !report && (res.setup ?? agentSetupFailure(`${res.error ?? ''}\n${res.summary ?? ''}`))
	if (account) {
		holdAgent(store, cfg, account)
		if (fresh.state === 'running') { Object.assign(fresh, { status: account.text, startFails: undefined }); commit() }
		store.archiveReport(wf.id, runId)
		return
	}
	if (offered.scoped && report && (report.blocker?.kind === 'tool' || report.blocker?.kind === 'capability')) {
		if (fresh.state !== 'running' || heldBy(store, fresh) === 'window') return
		if (store.runsToday() < (cfg.dailyRuns ?? 200)) {
			store.archiveReport(wf.id, runId)
			store.log({ event: 'worker-catalog-escalated', workflowId: wf.id, runId })
			return runOne(store, src, cfg, fresh, run, probe, catalogRetried, separate, chooseSession('reply', { fresh: true }), true)
		}
		store.log({ event: 'worker-catalog-escalation-blocked', workflowId: wf.id, runId, reason: 'daily-run-limit' })
		report = { ...report, goalMet: false, blocker: { kind: 'budget', why: 'The daily AI run limit prevented the full-catalog check', tried: report.blocker.tried } }
	}
	if (!report && !catalogRetried && cfg.agent.flavor === 'copilot' && CATALOG_CHANGED.test(sessionLog(cfg.agent.flavor, sessionId).slice(logStart))) {
		if (fresh.state !== 'running' || heldBy(store, fresh) === 'window') return
		if (store.runsToday() < (cfg.dailyRuns ?? 200)) {
			const nextSessionId = chooseSession('reply', { fresh: true })
			store.log({ event: 'worker-catalog-retry', kind: 'draft', workflowId: wf.id, code: wf.code, runId, sessionId, nextSessionId })
			return runOne(store, src, cfg, fresh, run, probe, true, separate, nextSessionId, fullCatalog)
		}
		store.log({ event: 'worker-catalog-retry-blocked', kind: 'draft', workflowId: wf.id, code: wf.code, runId, reason: 'daily-run-limit' })
	}
	if (report) { fresh.runFailed = undefined; fresh.statusReason = undefined; fresh.reviewAgain = undefined; if (report.reply) fresh.returnedFrom = undefined }
	if (report && (fresh.pending.some(id => !wf.pending.includes(id)) || report.work?.closed && pendingEffects(fresh.effects).length)) {
		const newer = fresh.pending.some(id => !wf.pending.includes(id))
		Object.assign(fresh, { ...stateFields(fresh, newer ? 'running' : 'needs_human'), approved: undefined, status: newer ? 'New asks arrived during this run. Checking them next.' : 'Earlier changes are still unverified. Review them before closing this work.' })
		store.log({ event: 'report-held', workflowId: fresh.id, reason: newer ? 'newer-ask' : 'unverified-effects' })
		commit()
		store.archiveReport(wf.id, runId)
		return
	}
	if (report && !report.reply && fresh.ownerSend && (!fresh.sent || fresh.sent.at < fresh.ownerSend.at)) {
		leaveForYou(store, fresh, reportLeft(report))
		keepApprovedDraft(fresh, report.summary || 'No reply needed')
		fresh.pending = []
		await checkPreservedHold(store, src, fresh)
		commit()
		store.log({ event: 'approved-draft-kept', code: fresh.code, why: report.summary })
		store.archiveReport(wf.id, runId)
		return
	}
	const same = report?.same?.toUpperCase()
	const into = same ? others.find(o => o.code === same) : undefined
	if (into && report?.intent !== 'none' && !report?.fyi && joinInto(store, fresh, store.workflow(into.id) ?? into, true)) { store.archiveReport(wf.id, runId); return }
	if (report?.same && !report.reply && !report.job && report.intent !== 'none') {
		store.archiveReport(wf.id, runId)
		store.log({ event: 'report-join-refused', code: fresh.code, target: report.same, reason: 'no eligible same-ask target' })
		if (!separate && store.runsToday() < (cfg.dailyRuns ?? 200)) return runOne(store, src, cfg, fresh, run, probe, catalogRetried, true, undefined, fullCatalog)
		Object.assign(fresh, { ...stateFields(fresh, 'needs_human'), status: 'This is a separate ask. The AI did not draft its own answer.', question: 'What would you like to reply to this ask?', questionHint: undefined })
		commit()
		return
	}
	const auth = !report && AUTH.test(res.error ?? '')
	store.setHealth('agent-auth', auth ? `The AI CLI is not signed in on ${store.machine}. Run "${cfg.agent.command.join(' ')}" once and sign in.` : undefined)
	const normal = report && !report.reply && !hasDecisions(report) && (report.job ?? jobForRecheck(store, fresh, report))
	const forced = report && !normal ? recheckJob(store, fresh) : undefined
	if (forced && report) { store.log({ event: 'recheck-routed', workflowId: fresh.id, code: fresh.code, key: forced.key, workerIntent: report.intent, hadReply: !!report.reply }); report.intent = 'pr_review' }
	const job = normal || forced
	// The review gate (owner rule 10-23): a PR review starts only when someone asked the owner (his own ask counts) and he may
	// review it, on the role this run's PR read stored; otherwise the item says why, with Add me when that can fix it (G1-G13).
	const reviewRef = job && isReviewJob(job.key, report?.intent) ? prRefOf(store, fresh) : undefined
	const wantsReview = !!job && isReviewJob(job.key, report?.intent) ||
		report?.intent === 'pr_review' && !!fresh.prs?.some(unit => reviewAsked(store, fresh, unit.id, true))
	const gate = job && isReviewJob(job.key, report?.intent) && reviewRef && !fresh.prs?.length
		? reviewGate(store, cfg, wf, reviewRef, undefined, !!probe?.pr) : undefined
	const declined = gate && !gate.ok ? gate : undefined
	// A run with no result is an error shown as one, with its time and reason, never a question to answer (queue-new #11).
	if (!report) Object.assign(fresh, { ...stateFields(fresh, 'needs_human'), ...statusFields('not-finished', `${NAME} couldn't draft this: ${failWhy(res)}`), question: undefined, questionHint: undefined, runFailed: { at: new Date().toISOString(), kind: 'other', why: failWhy(res) } })
	else if (wantsReview && fresh.prs?.length) {
		fresh.intent = 'pr_review'
		const h = family(store, fresh, report)
		mergeReportWork(fresh, report, h, undefined, false)
		if (h !== fresh) store.save(h)
		advanceReviewUnits(store, cfg, fresh, { ...report, intent: 'pr_review', job })
	}
	else if (wantsReview && !reviewRef) {
		Object.assign(fresh, { ...stateFields(fresh, 'needs_human'), question: undefined, questionHint: undefined,
			status: "There's no link to it, so Delegate can't open it", runFailed: { at: new Date().toISOString(), kind: 'setup',
				why: "there's no link to it, so Delegate can't open it" } })
		store.log({ event: 'review-target-missing', code: fresh.code })
	}
	else if (declined) {
		fresh.intent = report.intent
		if (declined.addMe) fresh.job = undefined
		decline(store, cfg, fresh, reviewRef, declined)
		if (declined.addMe) {
			carry(store, cfg, fresh, fresh.effects ?? [])
			const carrier = fresh.job ? store.job(fresh.job) : undefined
			if (carrier) { carrier.goal = declined.addMe.summary; store.saveJob(carrier) }
		}
	}
	// A routed recheck keeps the reply run's goal and plan, never its claim of having checked: the review job reports what it found.
	else if (job) { fresh.intent = report.intent; const h = family(store, fresh, report); mergeReportWork(fresh, forced ? { ...report, work: report.work && { ...report.work, step: `Asked to recheck; running the review of ${forced.key}` } } : report, h, undefined, false); if (h !== fresh) store.save(h); attachJob(store, cfg, fresh, job) }
	else {
		// The home is read and written in one synchronous step, so a part's run and the home's run never overwrite each other (review part 2 #4).
		const h = family(store, fresh, report)
		fresh.intent = report.intent
		const todos = report.todos
		report = addInternalSuggestions(store, cfg, [fresh], { ...prepareReportCalls(store, cfg, [fresh], report).report, todos })
		leaveForYou(store, fresh, reportLeft(report))
		applyReport(fresh, checked(store, cfg, report), h, canCloseReport(store, h, fresh))
		if (completedJob?.state === 'done') fresh.context = replyFacts(jobContext, fresh.context)
		if (fresh.holdCheckPending) await checkPreservedHold(store, src, fresh)
		if (fresh.draft) fresh.prDraft = wf.prRead
		if (report.goalMet === false) store.log({ event: 'short-of-goal', workflowId: fresh.id, code: fresh.code, kind: blockerOf(report.blocker).kind, why: blockerOf(report.blocker).why, tried: blockerOf(report.blocker).tried })
		// Closed with a last reply: the family closes when that reply is sent; without one, now.
		if (h.work?.closed) { stopWatch(store, h); if (!fresh.draft && !fresh.question) closeFamily(store, realProcs, h, h.work.closed.why) }
		if (h !== fresh) store.save(h)
		// A reply's promised changes ride on a job that only carries them, so ok runs the same executor as a job's (B19).
		// A run short of its goal offers no changes, and its reply only says the answer is coming, on open work too.
		if (report.goalMet === false && fresh.draft && !fresh.draft.holding) fresh.draft = { ...fresh.draft, holding: true }
		// Each promised change must be one the owner allows, on this item's PR; any other becomes a to-do with the reason (next action).
		const v = vet(cfg, report.goalMet === false ? [] : report.effects, prTarget(store, fresh))
		// A vote only when he was asked and may review the PR (review gate G11); any other becomes a to-do with the reason.
		v.effects = voteGate(store, cfg, fresh, v.effects, v.todos, true, v.left)
		// A vote is read against its PR now, so the card shows what it means and the owner's first ok casts it (bug 10-21 A12).
		// Anything the read would change (a closed PR, new commits) is left to the check at ok, which says why.
		const read = v.effects.some(e => isVote(e.call)) ? await voteNow(store, cfg, fresh, v.effects, probe) : undefined
		commit.refresh()
		const effects = proposalEffects(read && !read.why && !read.again && read.effects.length === v.effects.length ? read.effects : v.effects, [fresh])
		settleLeftRetry(fresh, report, effects)
		allowLeft(fresh, effects)
		leaveForYou(store, fresh, v.left)
		if (v.todos.length) Object.assign(fresh, {
			// "Are you in <group>?" stays the question while it is open: its answer can bring the vote back (queue-new #7C).
			question: fresh.question ?? (wf.groupAsk ? groupQuestion(wf.groupAsk) : fresh.draft ? refusedAsk(fresh.code, v.todos.length) : `These changes need you: ${v.todos.join('; ')}`),
			questionHint: fresh.question ? fresh.questionHint : undefined })
		if (fresh.kind === 'reply' && effects.length) {
			// Only this turn's unfinished proposal can keep a receipt; a live reset invalidates a vote receipt.
			const made = (fresh.effects ?? []).filter(e => e.done)
			const list = () => effects.map(e => ({ ...e, done: made.find(m => sameProposal(m, e) &&
				(!isVote(e.call) || read !== undefined && read.vote !== undefined && sameVote(read.vote, voteValue(e.call)) && sameHead(read.head, e.head)))?.done }))
			// A redraft replaces the list ok will make, on a carrier or on the item's own work (a PR review), or ok would refuse it as out of date (A48).
			// Never while a change run is making the approved list, nor on a job another open item still shows its own changes from (review 10-21c P1-1).
			carry(store, cfg, fresh, list())
			Object.assign(fresh, { effects: list(), promised: !!fresh.draft })
		}
		else if (fresh.choices) {
			if (fresh.job) carry(store, cfg, fresh, [])
			Object.assign(fresh, { effects: undefined, promised: undefined })
		}
		else if (fresh.promised) Object.assign(fresh, { effects: undefined, promised: undefined })
		// An explicit ask to set the owner's vote never ends as a status-only draft: the vote is proposed, the run says why
		// it fell short, or the owner is asked here (bug 10-23 E28). A vote already in place needs no change.
		const asked = askedVote(store.thread(wf.id).filter(m => wf.pending.includes(m.id) && !m.byOwner).map(m => m.text).join('\n'))
		const live = (fresh.prRead ?? wf.prRead) ? JSON.parse((fresh.prRead ?? wf.prRead)!) as [number, string, string, number | null] : undefined
		if (asked !== undefined && live && /^active$/i.test(live[1]) && typeof live[3] === 'number' && !sameVote(live[3], asked) && report.goalMet !== false && !fresh.question && !fresh.choices && !(h.work?.closed && fresh.state === 'done')
			&& !(wf.prRole && !MAY_REVIEW.includes(wf.prRole))
			&& !pendingEffects(fresh.effects).some(e => isVote(e.call) && voteValue(e.call) === asked)) {
			Object.assign(fresh, { ...stateFields(fresh, 'needs_human'), question: `${fresh.asker?.name ?? 'They'} asked for your ${voteName(asked)} vote on PR ${live[0]}, but this draft proposes no vote. Answer ${fresh.code} to redo it with the vote, or skip it`, questionHint: undefined })
			store.log({ event: 'vote-ask-unmet', workflowId: fresh.id, code: fresh.code, pr: live[0], asked, live: live[3] })
		}
		// An explicit ask to book a meeting or send an invite, which the owner lets Delegate make, never ends with a reply that
		// only agrees: the invite is proposed (as on the clash path), the run says why not, or the owner is asked (bug 10-23 E16).
		const askText = store.thread(wf.id).filter(m => wf.pending.includes(m.id) && !m.byOwner).map(m => m.text).join('\n')
		const invites = (cfg.agent.effectTools ?? []).some(t => /CreateEvent/i.test(t))
		const offered = pendingEffects(fresh.effects).some(isInvite) || !!fresh.choices?.options.some(o => o.effects?.some(isInvite))
		if (invites && fresh.draft && asksInvite(askText) && !offered && report.goalMet !== false && !fresh.question && !(h.work?.closed && fresh.state === 'done')) {
			Object.assign(fresh, { ...stateFields(fresh, 'needs_human'), question: `${fresh.asker?.name ?? 'They'} asked you to book it, but this draft sends no invite. Answer ${fresh.code} to redo it with the invite, or skip it`, questionHint: undefined })
			store.log({ event: 'invite-ask-unmet', workflowId: fresh.id, code: fresh.code })
		}
	}
	if (report && job) leaveForYou(store, fresh, reportLeft(report))
	if (report?.split?.length) splitOff(store, cfg, fresh, report.split)
	// A draft that drew on another conversation not everyone here is in waits for the owner (R-SHR-01).
	// What the run searched stays on the item for Why (queries and counts, never results).
	fresh.looked = read.searches.length ? read.searches : undefined
	// What it drew on, by audience (#36): records it read and cites, the chats it cites or read, and record links it never read.
	// A redraft keeps what the draft it replaces drew on (#29): the new text may reuse its words without reading or citing them again.
	const records = [...new Map([...previousRecords, ...(read.records ?? [])].map(r => [r.id, r])).values()]
	const use = report && !job && fresh.draft ? draftUse(fresh, knowledgeOf(store, cfg), { ...read, records }) : undefined
	if (use) use.chats = [...new Set([...previousDrewOn, ...use.chats])].filter(c => c !== fresh.chat.id)
	fresh.drewOn = use?.chats.length ? use.chats : undefined
	fresh.records = records.length ? records : undefined
	// Unknown reads and earlier record-only holds persist. Customer names are transient, so their hold also survives a chat-backed redraft.
	const readsBefore = previousShareHold === UNKNOWN_READ_HOLD || (typeof previousShareHold === 'object' && previousShareHold.kind === 'reads')
	const kept = previousShareHold && (!previousDrewOn.length || typeof previousShareHold === 'object' && previousShareHold.kind === 'customer') ? (typeof previousShareHold === 'string' ? { kind: 'reads' as const } : previousShareHold) : undefined
	fresh.shareHold = use && (read.unknown || readsBefore) ? { kind: 'reads' } : use ? (await sharingHold(store, src, fresh, use)) ?? kept : undefined
	commit.refresh()
	if (report && !job) await afterDraft(store, src, cfg, fresh)
	// A person answering the owner (in a 1:1, or right after his own message) is never silent noise: with no reply needed it is a
	// Catch up line with their words (queue-new #18). Bots and group chatter not addressed to him stay silent.
	if (report && !job && fresh.state === 'done' && fresh.closedBy === 'nothing' && !fresh.fyi && answersOwner(store, fresh)) {
		const said = (fresh.lastAsk ?? '').replace(/^\[as [^\]]+\]\s*/i, '').replace(/\s+/g, ' ').trim()
		const first = (fresh.asker?.name ?? 'They').split(/\s+/)[0]
		fresh.fyi = { line: `${first} replied · no reply needed`, weight: 'normal', at: new Date().toISOString(), gist: said.slice(0, 400) }
		store.log({ event: 'fyi-kept', code: fresh.code, why: fresh.chat.group ? 'after the owner' : '1:1' })
	}
	if (report && !job && fresh.state === 'done' && fresh.closedBy === 'nothing') for (const msgId of wf.pending) auditSkip(store, wf.chat.id, msgId, fresh.fyi ? 'ai-fyi' : 'ai-noise', wf.id)
	if (job && !declined) await ackJob(store, src, cfg, fresh)
	const arrived = freshRead(() => store.workflow(fresh.id))?.pending.filter(id => !wf.pending.includes(id)) ?? []
	if (arrived.length) {
		fresh.pending = [...new Set([...fresh.pending, ...arrived])]
		Object.assign(fresh, { ...stateFields(fresh, 'running'), approved: undefined, sendAt: undefined, status: 'New asks arrived during this run. Checking them next.' })
		store.log({ event: 'report-held', workflowId: fresh.id, reason: 'newer-ask' })
	}
	fresh.session.at = new Date().toISOString()
	commit()
	store.archiveReport(wf.id, runId)
	// A missed link the owner asked about always gets an answer, even when there is nothing to track.
	if (report && fresh.missed && fresh.startedBy === 'owner' && fresh.state === 'done') await say(store, src, `${MARK} ${fresh.code}: ${fresh.status}`)
	if (report && fresh.draft?.preview && fresh.answerSurface) {
		const n = store.notify()
		const had = n.previews?.[fresh.answerSurface], list = Array.isArray(had) ? had : had ? [had] : []
		store.saveNotify({ ...n, previews: { ...n.previews, [fresh.answerSurface]: [...list, { code: fresh.code, at: new Date().toISOString() }].slice(-5) } })
		if (fresh.answerSurface === 'self') { await say(store, src, renderPreview(fresh)); store.markShown([fresh]) }
	}
}

async function runAsk(store: Store, src: Source, cfg: Config, wf: Workflow, run: RunWorker, retrySession?: string, fullCatalog = false): Promise<void> {
	if (blockedAgent(store, cfg)) return
	const runId = ulid()
	const job = wf.job ? store.job(wf.job) : undefined
	const session = chooseSession('ask', { keep: retrySession ?? job?.session.id ?? wf.session.id })
	const full = workerTools(cfg, 'job'), tools = scopeTools(cfg, full, fullCatalog ? undefined : workflowToolScope(store, wf))
	const offered = { offered: tools.length, scoped: tools.length < full.length }
	refuseStart(cfg, tools, job?.repo)
	const { cwd, mcpConfigPath } = workerMcp(store, wf.id, runId)
	store.addRun()
	restoreSession(store, session)
	const beforeLog = sessionLog(cfg.agent.flavor, session), logStart = beforeLog.length
	const prompt = buildAskPrompt(wf, store.thread(wf.id), { ...cfg, agent: { ...cfg.agent, tools } }, store.root, { tools: offered, instructions: standingInstructions(store, [{ workflow: wf, pr: prTarget(store, wf) }]) }), startedAt = new Date().toISOString()
	const usage = { ...sessionUse(session, beforeLog, Date.parse(startedAt), retrySession ? { fresh: true, why: 'catalog' } : {}),
		key: usageKey('ask', `ask:${wf.id}`), promptChars: prompt.length }
	const res = await run({ ...cfg.agent, tools }, { workflowId: wf.id, runId, sessionId: session, prompt, cwd: job?.repo ?? cwd, mcpConfigPath, extraTools: WORKER_TOOLS, dirs: readDirs(store, cfg) })
	const endedAt = new Date().toISOString()
	backupSession(store, session)
	const report = store.peekReport(wf.id, runId)
	store.log({ event: 'ask', workflowId: wf.id, code: wf.code, runId, sessionId: session, startedAt, endedAt, ms: res.ms,
		tools: offered, ...ran('ask', res.used, { ...usage, outcome: report?.answer ? 'done' : 'failed' }) })
	const fresh = freshRead(() => store.workflow(wf.id))
	if (!fresh) throw new Error('The item disappeared before its question could be answered')
	const commit = recordCommit(fresh, () => store.workflow(fresh.id), store.save.bind(store))
	const account = !report && (res.setup ?? agentSetupFailure(`${res.error ?? ''}\n${res.summary ?? ''}`))
	if (account) holdAgent(store, cfg, account)
	let scopeBlocked: string | undefined
	if (offered.scoped && report && (report.blocker?.kind === 'tool' || report.blocker?.kind === 'capability')) {
		if (fresh.state === 'running' || heldBy(store, fresh) === 'window' || fresh.job && store.job(fresh.job)?.state === 'running') return
		if (store.runsToday() < (cfg.dailyRuns ?? 200)) {
			store.archiveReport(wf.id, runId)
			store.log({ event: 'worker-catalog-escalated', workflowId: wf.id, runId })
			return runAsk(store, src, cfg, fresh, run, chooseSession('ask', { fresh: true }), true)
		}
		scopeBlocked = 'The daily AI run limit prevented the full-catalog check.'
		store.log({ event: 'worker-catalog-escalation-blocked', workflowId: wf.id, runId, reason: 'daily-run-limit' })
	}
	if (!report && !account && !retrySession && cfg.agent.flavor === 'copilot' && CATALOG_CHANGED.test(sessionLog(cfg.agent.flavor, session).slice(logStart))) {
		if (fresh.state === 'running' || heldBy(store, fresh) === 'window' || !fresh.notes?.some(note => note.a === undefined) || fresh.job && store.job(fresh.job)?.state === 'running') return
		if (store.runsToday() < (cfg.dailyRuns ?? 200)) {
			const sessionId = chooseSession('ask', { fresh: true })
			store.log({ event: 'worker-catalog-retry', kind: 'ask', workflowId: wf.id, code: wf.code, runId, sessionId: session, nextSessionId: sessionId })
			return runAsk(store, src, cfg, fresh, run, sessionId, fullCatalog)
		}
		store.log({ event: 'worker-catalog-retry-blocked', kind: 'ask', workflowId: wf.id, code: wf.code, runId, reason: 'daily-run-limit' })
	}
	const note = fresh.notes?.find(n => n.a === undefined)
	if (note) Object.assign(note, report?.answer ? { a: report.answer, sources: report.reply ? checked(store, cfg, report).reply!.sources : undefined } : { a: account ? account.text : scopeBlocked ?? `I could not answer that${res.error ? ` (${res.error.slice(0, 80)})` : ''}. Ask again, or open ${fresh.code} on your computer.` })
	commit()
	store.archiveReport(wf.id, runId)
	if (note && fresh.answerSurface === 'self') await say(store, src, plain(`${MARK} ${fresh.code} · ${note.q}\n${note.a}`).slice(0, 1800))
}

// Card citations are resolved against the knowledge before confidence is computed (R-ANS-02).
// A question that says there is none ("None.", "N/A") is no question: it would turn the card into one and hide Send (bug 10-23 E11).
const NO_QUESTION = /^\s*(?:none|n\/?a|no(?:ne)?\s*(?:question|questions)?|nothing|-+|—)\s*[.!]?\s*$/i
export function checked(store: Store, cfg: Config, r: Report): Report {
	const q = !r.question?.trim() || NO_QUESTION.test(r.question) ? { ...r, question: undefined, questionHint: undefined } : r
	return q.reply ? { ...q, reply: { ...q.reply, sources: resolveEvidence(knowledgeOf(store, cfg), cfg, q.reply.sources, store.root) } } : q
}

export function applyReport(wf: Workflow, r: Report, home = wf, allowClose = true, store?: Store) {
	if (store) {
		const todos = r.todos
		r = addInternalSuggestions(store, store.config(), [wf], { ...prepareReportCalls(store, store.config(), [wf], checked(store, store.config(), r)).report, todos })
		leaveForYou(store, wf, reportLeft(r))
	}
	wf.returnedFrom = undefined; wf.statusReason = undefined; wf.reviewAgain = undefined
	if (r.reply) wf.runFailed = undefined
	if (r.reply) { wf.ownerSend = undefined; clearHold(wf); wf.approved = undefined }
	if (!r.reply && !wf.ownerSend && wf.approved?.text)
		wf.ownerSend = { draft: wf.draft ?? { text: wf.approved.text, commitment: false, sources: [] }, at: wf.approved.at, askMsgId: wf.lastMsgId }
	if (wf.ownerSend && !r.reply && (!wf.sent || wf.sent.at < wf.ownerSend.at)) {
		keepApprovedDraft(wf, r.summary || 'No reply needed')
		wf.pending = []
		return
	}
	const changedAsk = home === wf && r.work?.changedAsk && wf.pending.includes(r.work.changedAsk) && wf.msgIds.includes(r.work.changedAsk) ? r.work.changedAsk : undefined
	if (!r.reply) { wf.draft = undefined; wf.learnAfter = undefined }
	wf.intent = r.intent
	wf.pending = []
	const fresh = !home.work
	mergeReportWork(wf, r, home, changedAsk, allowClose)
	// A candidate from the owner's own message is shown for ok before it is tracked (R-WRK-11).
	if (wf.startedBy === 'owner' && fresh && home.work && home === wf) {
		home.work.proposed = true
		const plan = home.work.plan?.length ? ` Plan: ${home.work.plan.map(p => p.what).join('; ')}.` : ''
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), draft: undefined, status: `Track this as work? ${home.work.goal}`, question: `Track this as work? Goal: ${home.work.goal}. Done when: ${home.work.doneWhen}.${plan} Say "ok ${wf.code}" to track it, or "skip ${wf.code}".`, questionHint: undefined })
		return
	}
	if (wf.startedBy === 'owner' && !home.work) { Object.assign(wf, { ...stateFields(wf, 'done'), status: wf.missed ? `Nothing to track: ${r.summary || 'it did not start work'}` : r.summary || 'Nothing to track', intent: 'none' }); return }
	// "Needs me" never quietly closes again: with nothing drafted, the owner is asked what to say (review 10-20).
	if (wf.needsMe && !home.work && !r.reply && !r.question && !hasDecisions(r)) { Object.assign(wf, { ...stateFields(wf, 'needs_human'), question: 'You said this needs you. What should I say?', questionHint: undefined, status: r.summary || 'Waiting for what you want to say' }); return }
	if (settle(wf, r, home)) return
	// Short of the goal: never closed as "no reply needed", never offered as the answer. The owner sees why and what was tried (design-spec/goal-retry.md).
	if (r.goalMet === false && !home.work) {
		const b = blockerOf(r.blocker)
		Object.assign(wf, { ...stateFields(wf, 'needs_human'), ...statusFields('not-finished', `Not finished: ${b.why}${b.tried.length ? `. Tried: ${b.tried.join('; ')}` : ''}`), learnAfter: r.reply ? undefined : wf.learnAfter, draft: r.reply ? { ...r.reply, text: greetBack(wf, r.reply.text), holding: true as const } : undefined, question: r.question, questionHint: r.question?.trim() && r.questionHint ? normalizeQuestionHint(r.questionHint) : undefined, effects: undefined, revAt: new Date().toISOString() })
		return
	}
	if ((!home.work && (r.intent === 'none' || r.state === 'done') || !r.reply && !r.question) && !hasDecisions(r)) {
		Object.assign(wf, { ...stateFields(wf, 'done'), status: r.summary || 'No reply needed', closedBy: 'nothing', fyi: r.fyi?.line.trim() && !wf.needsMe && (!wf.before || !!r.fyi.watch?.target) ? { line: r.fyi.line.trim(), weight: r.fyi.weight, at: new Date().toISOString(), ...(r.fyi.gist?.trim() ? { gist: r.fyi.gist.trim() } : {}), ...(r.fyi.watch?.target ? { watch: r.fyi.watch } : {}) } : undefined })
		return
	}
	const preview = !!wf.ownerAnswer || !!wf.correction
	wf.draft = r.reply ? { ...r.reply, text: greetBack(wf, r.reply.text), preview } : undefined
	// An edit of the draft this one replaces never went out (R-NEX-11).
	if (r.reply) wf.learnAfter = undefined
	// The new draft was written with every message so far: none is "new" since it, as when a job drafts (bug 10-23 E08).
	if (r.reply) wf.newCount = 0
	wf.revAt = new Date().toISOString()
	wf.question = preview ? undefined : r.question
	wf.questionHint = !preview && r.question?.trim() && r.questionHint ? normalizeQuestionHint(r.questionHint) : undefined
	wf.gaps = r.gaps?.length ? r.gaps : undefined
	// A run short of its goal promises nothing that something then does: no to-dos, no watch.
	wf.todos = r.todos?.length && r.goalMet !== false ? r.todos : undefined
	// A redraft that repeats the same check-back keeps the watch already running.
	wf.follow = r.goalMet === false ? wf.follow : r.follow && wf.follow?.code && wf.follow.target === r.follow.target ? { ...r.follow, code: wf.follow.code } : r.follow
	// The owner can always write their own answer instead of an option.
	Object.assign(wf, { choices: preview || !r.choices ? undefined : { ...r.choices, other: r.choices.other ?? true }, context: r.context, meeting: r.meeting, picked: undefined })
	wf.ownerAnswer = undefined
	wf.status = r.summary
	Object.assign(wf, stateFields(wf, 'needs_human'))
	if (store && r.goalMet !== false) {
		const cfg = store.config(), v = vet(cfg, r.effects, prTarget(store, wf))
		v.effects = voteGate(store, cfg, wf, v.effects, v.todos, true, v.left)
		wf.effects = proposalEffects(v.effects, [wf])
		settleLeftRetry(wf, r, wf.effects)
		allowLeft(wf, wf.effects)
		leaveForYou(store, wf, v.left)
		if (wf.effects.length) carry(store, cfg, wf, wf.effects)
		if (v.todos.length) {
			if (!wf.question) wf.questionHint = undefined
			wf.question ??= wf.draft ? refusedAsk(wf.code, v.todos.length) : v.todos.join('\n')
		}
	}
}

// Ledger reads use base at; this cursor tracks completion and keeps same-millisecond arrivals.
const actionNudgeCursorSchema = z.object({
	lastRecordAt: z.string().datetime({ offset: true }).transform(at => new Date(at).toISOString()),
	ids: z.array(z.string().uuid()),
})
type ActionNudgeCursor = z.infer<typeof actionNudgeCursorSchema>
type CompletedAction = FoldedAction & { completedAt: string }

function loadActionNudgeCursor(store: Store, now: Date): { cursor: ActionNudgeCursor; initial: boolean } {
	const file = join(store.root, 'state', 'wdd-nudge.json')
	try {
		const value = readJson<unknown>(file, undefined)
		if (value !== undefined) return { cursor: actionNudgeCursorSchema.parse(value), initial: false }
	} catch (error) {
		console.error(`${NAME}: could not read the automatic-action nudge cursor; restarting at the current time.`, scrubDeep(String(error)))
	}
	const cursor = { lastRecordAt: now.toISOString(), ids: [] }
	writeJson(file, cursor, store.machine)
	return { cursor, initial: true }
}

function advanceActionNudgeCursor(store: Store, cursor: ActionNudgeCursor, records: readonly CompletedAction[]): void {
	if (!records.length) return
	const lastRecordAt = records.reduce((latest, record) => record.completedAt > latest ? record.completedAt : latest, cursor.lastRecordAt)
	const ids = new Set(lastRecordAt === cursor.lastRecordAt ? cursor.ids : [])
	for (const record of records) if (record.completedAt === lastRecordAt) ids.add(record.id)
	writeJson(join(store.root, 'state', 'wdd-nudge.json'), { lastRecordAt, ids: [...ids] }, store.machine)
}

export async function nudge(store: Store, src: Source, cfg: Config): Promise<boolean> {
	const now = new Date()
	const { cursor, initial } = loadActionNudgeCursor(store, now)
	const n = store.notify()
	if (inQuietHours(now, cfg.quiet)) return false
	const all = store.workflows()
	const needs = all.filter(w => w.state === 'needs_human')
	const kp = store.proposals().filter(p => p.state === 'needs_human')
	const records = initial ? [] : readActions(store, {
		since: new Date(Date.parse(cursor.lastRecordAt) - 24 * 3_600_000).toISOString(), until: now.toISOString(),
	}).filter((record): record is CompletedAction => !!record.completedAt &&
		(record.completedAt > cursor.lastRecordAt || record.completedAt === cursor.lastRecordAt && !cursor.ids.includes(record.id)))
	const fresh = [...needs, ...kp].filter(w => !n.lastNudgeAt || w.updatedAt > n.lastNudgeAt)
	// An automatic send nudges at once, because its undo window is shorter than the nudge interval.
	const urgent = records.some(record => undoableAction(record, now.getTime()))
	const due = urgent || !n.lastNudgeAt || now.getTime() - Date.parse(n.lastNudgeAt) > cfg.nudgeEveryMin * 60_000
	if ((!fresh.length && !records.length) || !due) return false
	if ((await src.presence()).availability === 'DoNotDisturb' || await ownerActive(store, src)) return false
	const actionLine = actionNudge(records, undefined, now.getTime())
	const lines: string[] = []
	if (needs.length || kp.length) lines.push(renderNudge(needs, [], now, kp))
	if (actionLine) lines.push(lines.length ? actionLine : `${MARK} ${actionLine}`)
	if (!lines.length) { advanceActionNudgeCursor(store, cursor, records); return false }
	await say(store, src, lines.join('\n'))
	store.markShown(needs.slice(0, 6))
	store.saveNotify({ ...store.notify(), lastNudgeAt: new Date().toISOString() })
	advanceActionNudgeCursor(store, cursor, records)
	return true
}

// The home whose work a run's report updates: its own, the work it is a part of, or the open work it says it belongs to.
function family(store: Store, wf: Workflow, r: Report): Workflow {
	const home = homeOf(store, wf)
	if (home !== wf || wf.work || !r.partOf) return home.id === wf.id ? wf : store.workflow(home.id) ?? home
	const to = store.byCode(r.partOf.toUpperCase())
	if (!to || to.id === wf.id || !active(to) || to.partOf) return wf
	// The worker's join needs a shared subject: the same link, or the same chat and asker (queue-new #9).
	const why = joinWhy(store, to, wf, true)
	if (why) { store.log({ event: 'join-refused', code: wf.code, home: to.code, by: 'worker', reason: why }); return wf }
	addPart(to, wf)
	step(to, `${wf.asker?.name?.split(' ')[0] ?? 'Someone'} (${wf.chat.group ? wf.chat.name : '1:1'}, ${wf.code}): ${(wf.lastAsk ?? '').slice(0, 200)}`, { ref: `part:${wf.id}` })
	return to
}

// A message that opens with a greeting gets one back with the person's first name (R-PRO-05): "Hi Kim, left one comment."
const GREETING = /^\s*(hi|hello|hey|hii+|good (morning|afternoon|evening))\b/i
const OPENERS = /^(Yes|No|Sure|Thanks|Thank|The|It|It's|That|This|Not|Done|Good|Great|Ok|Okay|Will|We|You|Just|Let|Looks|Sounds|All|There|Left|Added|Fixed|Merged|Pushed|Checked|Updated|Replied|Shared|Sent|Got|Happy|Can|Could|Should|Here|Yep|Yeah|Nope)\b/

export function greetBack(wf: Workflow, text: string): string {
	const ask = wf.lastAsk ?? ''
	if (!GREETING.test(ask) || GREETING.test(text) || !wf.asker?.name || /^_{3,}/.test(text.trim())) return text
	const first = wf.asker.name.replace(/\s*\(.*\)\s*$/, '').trim().split(/\s+/)[0]
	if (text.startsWith('@')) return `Hi ${text}`
	if (text.toLowerCase().startsWith(first.toLowerCase())) return text
	// A greeting in another language ("Hola Ana,", "Namaste Ana") already greets them.
	if (new RegExp(`^\\S+\\s+${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,!:])`, 'iu').test(text.trim())) return text
	// Only common sentence openers lose their capital; a name, a day, or a product keeps it.
	const body = OPENERS.test(text) ? text[0].toLowerCase() + text.slice(1) : text
	return `Hi ${first}, ${body}`
}
