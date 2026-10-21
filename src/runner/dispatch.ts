import { CMD } from '../brand.ts'
import { blockerOf } from './retry.ts'
import { active, addPart, homeOf, label, mergeWork, settle, step } from './work.ts'
import { assertTestSafe } from '../store/fs.ts'
import { closeFamily } from './apply.ts'
import { realProcs } from './jobs.ts'
import { stopWatch } from './track.ts'
import { sharingHold, sourceChats, takeRead, UNTRACKED } from './sharing.ts'
import { existsSync } from 'node:fs'
import { backupSession, restoreSession } from './own.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Automation, Config, Report, Workflow } from '../core/types.ts'
import { randomUUID } from 'node:crypto'
import { describe } from './automations.ts'
import { ulid } from '../core/ids.ts'
import { MARK, plain, renderNudge, renderPreview } from '../core/render.ts'
import { runAgent, type RunInput, type RunResult } from '../adapters/agent.ts'
import type { Source } from '../adapters/source.ts'
import { here, LOCAL_DIR, type Store } from '../store/state.ts'
import { buildAskPrompt, buildPrompt } from '../worker/prompt.ts'
import { corrections } from '../store/feedback.ts'
import { levelOf } from '../core/levels.ts'
import { CLI } from '../paths.ts'
import { joinInto, say, splitOff } from './intake.ts'
import { ackJob, afterDraft, ownerActive } from './autosend.ts'
import { attachJob, changesJob } from './jobs.ts'
import { refusedAsk, vet } from '../core/effects.ts'
import { prTarget } from './probe.ts'
import { heldBy } from './owner.ts'
import { knowledgeOf, resolveEvidence } from './proposals.ts'
import { inQuietHours } from '../core/policy.ts'
import { reportFromText } from '../core/report.ts'
import { scrubDeep } from '../core/secrets.ts'
import { intents } from '../core/intents.ts'
import { unsafeRead } from '../core/effects.ts'
import { shellInClone, shellTool } from './validate.ts'
import { toolServers } from '../adapters/mcp-client.ts'

export type RunWorker = (cfg: Config['agent'], input: RunInput & { workflowId: string; runId: string }) => Promise<RunResult>

const AUTH = /bad credentials|not logged in|please run \/login|authenticat|unauthori[sz]ed|sign[ -]?in/i

// Each queued workflow runs once, with all of its new messages together (R-WF-02, R-WF-06).
export async function dispatch(store: Store, src: Source, cfg: Config, run: RunWorker = runAgent): Promise<number> {
	// An item open in a Continue window belongs to the owner until it closes (R-WF-07).
	const cap = cfg.dailyRuns ?? 200
	const room = cap - store.runsToday()
	const running = store.workflows().filter(w => w.state === 'running' && heldBy(store, w) !== 'window').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
	// The week before setup is drafted behind live asks, a few per check, within half of the day's runs (first-sweep.md).
	const paced = running.filter(w => w.paced).slice(0, store.runsToday() < cap / 2 ? cfg.maxParallel : 0)
	const queue = [...running.filter(w => !w.paced), ...paced].slice(0, Math.max(0, room))
	for (const w of queue) if (w.paced) { w.paced = undefined; store.save(w, false) }
	let done = 0
	// The owner's questions about an item run after drafting, in the item's session, and never change it (design-spec S12).
	const asks = store.workflows().filter(w => w.notes?.some(n => n.a === undefined) && w.state !== 'running' && heldBy(store, w) !== 'window' && !(w.job && store.job(w.job)?.state === 'running'))
	queue.push(...asks.slice(0, Math.max(0, room - queue.length)))
	for (let i = 0; i < queue.length; i += cfg.maxParallel) {
		await Promise.all(queue.slice(i, i + cfg.maxParallel).map(async wf => {
			// One run that cannot start fails only its own item; sends, reminders, and the other drafts go on (review 10-20 R3).
			try { await runOne(store, src, cfg, wf, run) } catch (e) { startFailed(store, wf, e); return }
			const ran = store.workflow(wf.id)
			if (ran?.startFails) { ran.startFails = undefined; store.save(ran, false) }
			done++
		}))
	}
	for (const a of store.automations().filter(a => a.heard && a.state === 'active').slice(0, Math.max(0, room - done))) { await judgeReply(store, cfg, a, run); done++ }
	return done
}

const UNSAFE = /is never a read tool|never runs in your clone with a shell/
function startFailed(store: Store, wf: Workflow, e: unknown) {
	const why = String(e).slice(0, 160)
	store.log({ event: 'run-failed', workflowId: wf.id, code: wf.code, error: why })
	const fresh = store.workflow(wf.id)
	// A tool that must never reach a worker stops the run for the owner at once, a question about the item too (round 2 P2-1, P2-2).
	if (fresh && UNSAFE.test(why)) {
		const why2 = why.replace(/^Error: /, '')
		Object.assign(fresh, { startFails: undefined, ...(fresh.state === 'running' ? { state: 'needs_human' } : {}), status: `Could not start: ${why2}`, notes: fresh.notes?.map(n => (n.a === undefined ? { ...n, a: `Not asked: ${why2}` } : n)) })
		store.save(fresh)
		store.log({ event: 'run-start-refused', workflowId: wf.id, code: wf.code, error: why2 })
		return
	}
	if (!fresh || fresh.state !== 'running') return
	// A setup error (a tool the AI CLI cannot name) will not pass by trying again.
	const n = /no known Claude Code name/.test(why) ? 3 : (fresh.startFails ?? 0) + 1
	Object.assign(fresh, n < 3 ? { startFails: n, status: `Could not start the AI run: ${why}. Trying again on the next check.` } : { startFails: undefined, state: 'needs_human', status: `Could not start the AI run 3 times: ${why}. Check the AI CLI with "${CMD} doctor".` })
	store.save(fresh)
	store.log({ event: 'run-start-failed', workflowId: wf.id, code: wf.code, n, error: why })
}

// The reminded person replied: the AI reads it with the reminder in view and says done, a time, or keep (B4).
// No phrase is special-cased. If it cannot decide, the reminder pauses, as it did before, so it never nags by mistake.
export async function judgeReply(store: Store, cfg: Config, a: Automation, run: RunWorker = runAgent, now = new Date()) {
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
	const res = await run(cfg.agent, { workflowId: a.id, runId, sessionId: randomUUID(), prompt, cwd, mcpConfigPath, extraTools: [`${WORKER_SERVER}-submit_report`], dirs: [] })
	const said = store.peekReport(a.id, runId)?.summary?.trim() ?? ''
	store.archiveReport(a.id, runId)
	const fresh = store.automations().find(x => x.id === a.id) ?? a, first = heard.from.split(/\s+/)[0]
	const later = /^later\s+(\S+)/i.exec(said), at = later ? new Date(later[1]) : undefined
	const change: Partial<Automation> =
		/^done\b/i.test(said) ? { state: 'ended', next: undefined, why: `${first} said it is done` }
		: at && !isNaN(at.getTime()) && at > now && at.getTime() - now.getTime() < 7 * 86_400_000 ? { next: at.toISOString(), why: `${first} said ${at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}; the next reminder moved` }
		: /^keep\b/i.test(said) ? { why: `${first} replied; reminders continue` }
		: { state: 'paused', next: undefined, why: `${first} replied` }
	store.saveAutomation({ ...fresh, ...change, heard: undefined, updatedAt: now.toISOString() })
	store.log({ event: 'automation-judged', code: a.code, said: said.slice(0, 80), ms: res.ms })
}

// The folders a worker may open: the knowledge folders and card roots only, never the rest of the storage folder,
// which holds other people's threads (live card test: the knowledge index was unreadable).
// Only folders that exist: the AI CLI refuses to start when one is missing (a new store has no knowledge folder yet; found in the live Q3 run).
export const readDirs = (store: Store, cfg: Config): string[] => [...new Set([...(cfg.knowledge ?? []).map(f => here(store.root, f)), cfg.cards?.root ?? join(store.root, 'knowledge'), ...(cfg.cards?.team ? [cfg.cards.team] : [])])].filter(d => existsSync(d))

// Every agent run gets the delegate MCP server in worker mode, scoped to one target and run (R-SEC-02).
// What every worker may call on the delegate server: read the knowledge, and report once.
// Its own server name: the owner's global "delegate" server (from install) would otherwise shadow it, and the worker would get no tools.
export const WORKER_SERVER = 'delegate_worker'
export const WORKER_TOOLS = ['submit_report', 'knowledge_search', 'knowledge_read', 'history_search', 'doc_read', 'image_read'].map(t => `${WORKER_SERVER}-${t}`)

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
const lessonFits = (cfg: Config, chat: string | undefined, here: string) => { const l = levelOf(cfg, chat); return !l || (l === 'private' && chat === here) }

// A setup error that stops a run before it starts, the same for every run: never retried (round 2 P2-1, P2-2).
function refuseStart(cfg: Config, folder?: string) {
	const unsafe = unsafeRead(cfg.agent.tools, Object.keys(toolServers(cfg)))
	if (unsafe) throw new Error(unsafe)
	const shell = folder && shellTool(cfg.agent.tools)
	if (shell) throw new Error(shellInClone(shell))
}

async function runOne(store: Store, src: Source, cfg: Config, wf: Workflow, run: RunWorker) {
	refuseStart(cfg)
	if (wf.state !== 'running') return runAsk(store, src, cfg, wf, run)
	const runId = ulid()
	const { cwd, mcpConfigPath } = workerMcp(store, wf.id, runId)
	const others = wf.code ? store.openInChat(wf.chat.id).filter(o => o.id !== wf.id && o.code && !o.followUp) : []
	const home = homeOf(store, wf)
	// A new item may belong to work that started in another chat; the worker sees the open work to say so (R-WRK-10).
	const works = !wf.work && !wf.partOf ? store.workflows().filter(w => active(w) && !w.partOf && w.chat.id !== wf.chat.id && !levelOf(cfg, w.chat.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8) : []
	const prompt = buildPrompt(wf, store.thread(wf.id), cfg, store.root, store.owners(), others, corrections(store.lessons().filter(l => lessonFits(cfg, (l.detail as { chat?: string } | undefined)?.chat, wf.chat.id)), wf), { home: home === wf ? undefined : home, works, parts: home.work?.parts?.map(id => store.workflow(id)).filter((p): p is Workflow => !!p) ?? [] })
	store.addRun()
	restoreSession(store, wf.session.id)
	// Reply runs read other chats only through history_search, which records them (need to know).
	const res = await run({ ...cfg.agent, tools: cfg.agent.tools.filter(t => !UNTRACKED.test(t)) }, { workflowId: wf.id, runId, sessionId: wf.session.id, prompt, cwd, mcpConfigPath, extraTools: WORKER_TOOLS, dirs: readDirs(store, cfg) })
	// The CLI never started: no session to keep and no report to read; it counts toward the start tries.
	if (res.error?.startsWith('Could not start')) { takeRead(store.root, runId); throw new Error(res.error) }
	const read = takeRead(store.root, runId)
	backupSession(store, wf.session.id)
	// A report salvaged from the run's last words is scrubbed as one written by submit_report is (review 10-21 P2-6).
	const raw = store.peekReport(wf.id, runId) ? undefined : reportFromText(res.summary, wf.id, intents(store.root).map(i => i.id))
	const salvaged = raw && scrubDeep(raw)
	const report = store.peekReport(wf.id, runId) ?? salvaged
	store.log({ event: 'worker', ...(salvaged ? { salvaged: true } : {}), workflowId: wf.id, code: wf.code, runId, exitCode: res.exitCode, ms: res.ms, intent: report?.intent, summary: report?.summary, sources: report?.reply?.sources, commitment: report?.reply?.commitment, error: res.error })
	const fresh = store.workflow(wf.id) ?? wf
	const into = report?.same ? others.find(o => o.code === report.same!.toUpperCase()) : undefined
	if (into && joinInto(store, fresh, store.workflow(into.id) ?? into)) { store.archiveReport(wf.id, runId); return }
	const auth = !report && AUTH.test(res.error ?? '')
	store.setHealth('agent-auth', auth ? `The AI CLI is not signed in on ${store.machine}. Run "${cfg.agent.command.join(' ')}" once and sign in.` : undefined)
	if (!report) Object.assign(fresh, { state: 'needs_human', status: auth ? 'Waiting for the AI CLI sign-in' : 'The worker did not finish', question: auth ? 'Sign in, then answer or skip this item' : 'Check this item, then answer or skip it' })
	else if (report.job) { fresh.intent = report.intent; const h = family(store, fresh, report); mergeWork(h, report.work); if (h !== fresh) store.save(h); attachJob(store, cfg, fresh, report.job) }
	else {
		// The home is read and written in one synchronous step, so a part's run and the home's run never overwrite each other (review part 2 #4).
		const h = family(store, fresh, report)
		applyReport(fresh, checked(store, cfg, report), h)
		if (report.goalMet === false) store.log({ event: 'short-of-goal', workflowId: fresh.id, code: fresh.code, kind: blockerOf(report.blocker).kind, why: blockerOf(report.blocker).why, tried: blockerOf(report.blocker).tried })
		// Closed with a last reply: the family closes when that reply is sent; without one, now.
		if (h.work?.closed) { stopWatch(store, h); if (!fresh.draft && !fresh.question) closeFamily(store, realProcs, h, h.work.closed.why) }
		if (h !== fresh) store.save(h)
		// A reply's promised changes ride on a job that only carries them, so ok runs the same executor as a job's (B19).
		// A run short of its goal offers no changes, and its reply only says the answer is coming, on open work too.
		if (report.goalMet === false && fresh.draft && !fresh.draft.holding) fresh.draft = { ...fresh.draft, holding: true }
		// Each promised change must be one the owner allows, on this item's PR; any other becomes a to-do with the reason (next action).
		const v = vet(cfg, report.goalMet === false ? [] : report.effects, prTarget(store, fresh))
		const effects = v.effects
		if (v.todos.length && fresh.draft) Object.assign(fresh, { todos: [...new Set([...(fresh.todos ?? []), ...v.todos])], question: fresh.question ?? refusedAsk(fresh.code, v.todos.length) })
		if (fresh.kind === 'reply' && effects.length && fresh.draft) {
			const own = fresh.job ? store.job(fresh.job) : undefined
			// A change already made stays made when a redraft lists it again.
			const made = [...(own?.result?.effects ?? []), ...(fresh.effects ?? [])].filter(e => e.done)
			const list = () => effects.map(e => ({ ...e, done: made.find(m => m.system === e.system && m.action === e.action && m.target === e.target)?.done }))
			if (!own) changesJob(store, cfg, fresh, list())
			// A redraft replaces the carrier's list, or ok would refuse it as out of date.
			else if (own.key === `item:${fresh.id}`) { own.result = { summary: own.result?.summary ?? 'Chosen by the owner', effects: list() }; store.saveJob(own) }
			Object.assign(fresh, { effects: list(), promised: true })
		}
		else if (fresh.promised) Object.assign(fresh, { effects: undefined, promised: undefined })
	}
	if (report?.split?.length) splitOff(store, cfg, fresh, report.split)
	// A draft that drew on another conversation not everyone here is in waits for the owner (R-SHR-01).
	// What the run searched stays on the item for Why (queries and counts, never results).
	fresh.looked = read.searches.length ? read.searches : undefined
	const drewOn = report && !report.job && fresh.draft ? sourceChats(fresh, knowledgeOf(store, cfg), read.chats) : []
	fresh.drewOn = drewOn.length ? drewOn : undefined
	fresh.shareHold = drewOn.length ? await sharingHold(store, src, fresh, drewOn) : undefined
	if (report && !report.job) await afterDraft(store, src, cfg, fresh)
	if (report?.job) await ackJob(store, src, cfg, fresh)
	store.save(fresh)
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

async function runAsk(store: Store, src: Source, cfg: Config, wf: Workflow, run: RunWorker) {
	const runId = ulid()
	const job = wf.job ? store.job(wf.job) : undefined
	const session = job?.session.id ?? wf.session.id
	refuseStart(cfg, job?.repo)
	const { cwd, mcpConfigPath } = workerMcp(store, wf.id, runId)
	store.addRun()
	restoreSession(store, session)
	const res = await run(cfg.agent, { workflowId: wf.id, runId, sessionId: session, prompt: buildAskPrompt(wf, store.thread(wf.id), cfg, store.root), cwd: job?.repo ?? cwd, mcpConfigPath, extraTools: WORKER_TOOLS, dirs: readDirs(store, cfg) })
	backupSession(store, session)
	const report = store.peekReport(wf.id, runId)
	const fresh = store.workflow(wf.id)!
	const note = fresh.notes?.find(n => n.a === undefined)
	if (note) Object.assign(note, report?.answer ? { a: report.answer, sources: report.reply ? checked(store, cfg, report).reply!.sources : undefined } : { a: `I could not answer that${res.error ? ` (${res.error.slice(0, 80)})` : ''}. Ask again, or open ${fresh.code} on your computer.` })
	store.save(fresh)
	store.archiveReport(wf.id, runId)
	store.log({ event: 'ask', workflowId: wf.id, code: wf.code, runId, ms: res.ms })
	if (note && fresh.answerSurface === 'self') await say(store, src, plain(`${MARK} ${fresh.code} · ${note.q}\n${note.a}`).slice(0, 1800))
}

// Card citations are resolved against the knowledge before confidence is computed (R-ANS-02).
export function checked(store: Store, cfg: Config, r: Report): Report {
	return r.reply ? { ...r, reply: { ...r.reply, sources: resolveEvidence(knowledgeOf(store, cfg), cfg, r.reply.sources, store.root) } } : r
}

export function applyReport(wf: Workflow, r: Report, home = wf) {
	wf.intent = r.intent
	wf.pending = []
	const fresh = !home.work
	mergeWork(home, r.work, undefined, home === wf ? '' : label(wf, home))
	// A candidate from the owner's own message is shown for ok before it is tracked (R-WRK-11).
	if (wf.startedBy === 'owner' && fresh && home.work && home === wf) {
		home.work.proposed = true
		const plan = home.work.plan?.length ? ` Plan: ${home.work.plan.map(p => p.what).join('; ')}.` : ''
		Object.assign(wf, { state: 'needs_human', draft: undefined, status: `Track this as work? ${home.work.goal}`, question: `Track this as work? Goal: ${home.work.goal}. Done when: ${home.work.doneWhen}.${plan} Say "ok ${wf.code}" to track it, or "skip ${wf.code}".` })
		return
	}
	if (wf.startedBy === 'owner' && !home.work) { Object.assign(wf, { state: 'done', status: wf.missed ? `Nothing to track: ${r.summary || 'it did not start work'}` : r.summary || 'Nothing to track', intent: 'none' }); return }
	// "Needs me" never quietly closes again: with nothing drafted, the owner is asked what to say (review 10-20).
	if (wf.needsMe && !home.work && !r.reply && !r.question) { Object.assign(wf, { state: 'needs_human', question: 'You said this needs you. What should I say?', status: r.summary || 'Waiting for what you want to say' }); return }
	if (settle(wf, r, home)) return
	// Short of the goal: never closed as "no reply needed", never offered as the answer. The owner sees why and what was tried (design-spec/goal-retry.md).
	if (r.goalMet === false && !home.work) {
		const b = blockerOf(r.blocker)
		Object.assign(wf, { state: 'needs_human', status: `Not finished: ${b.why}${b.tried.length ? `. Tried: ${b.tried.join('; ')}` : ''}`, learnAfter: r.reply ? undefined : wf.learnAfter, draft: r.reply ? { ...r.reply, text: greetBack(wf, r.reply.text), holding: true as const } : undefined, question: r.question, effects: undefined, revAt: new Date().toISOString() })
		return
	}
	if (!home.work && (r.intent === 'none' || r.state === 'done') || !r.reply && !r.question) {
		// A guess about a message to the whole group is never listed: busy groups would flood Catch up (review 10-20).
		Object.assign(wf, { state: 'done', status: r.summary || 'No reply needed', closedBy: 'nothing', fyi: r.fyi?.line.trim() && wf.startedBy !== 'room' && !wf.needsMe && (!wf.before || !!r.fyi.watch?.target) ? { line: r.fyi.line.trim(), weight: r.fyi.weight, at: new Date().toISOString(), ...(r.fyi.gist?.trim() ? { gist: r.fyi.gist.trim() } : {}), ...(r.fyi.watch?.target ? { watch: r.fyi.watch } : {}) } : undefined })
		return
	}
	const preview = !!wf.ownerAnswer || !!wf.correction
	wf.draft = r.reply ? { ...r.reply, text: greetBack(wf, r.reply.text), preview } : wf.draft
	// An edit of the draft this one replaces never went out (R-NEX-11).
	if (r.reply) wf.learnAfter = undefined
	wf.revAt = new Date().toISOString()
	wf.question = preview ? undefined : r.question
	wf.gaps = r.gaps?.length ? r.gaps : undefined
	// A run short of its goal promises nothing that something then does: no to-dos, no watch.
	wf.todos = r.todos?.length && r.goalMet !== false ? r.todos : undefined
	// A redraft that repeats the same check-back keeps the watch already running.
	wf.follow = r.goalMet === false ? wf.follow : r.follow && wf.follow?.code && wf.follow.target === r.follow.target ? { ...r.follow, code: wf.follow.code } : r.follow
	// The owner can always write their own answer instead of an option.
	Object.assign(wf, { choices: preview || !r.choices ? undefined : { ...r.choices, other: r.choices.other ?? true }, context: r.context, meeting: r.meeting, picked: undefined })
	wf.ownerAnswer = undefined
	wf.status = r.summary
	wf.state = 'needs_human'
}

export async function nudge(store: Store, src: Source, cfg: Config): Promise<boolean> {
	const n = store.notify()
	if (inQuietHours(new Date(), cfg.quiet)) return false
	const all = store.workflows()
	const needs = all.filter(w => w.state === 'needs_human')
	const undoable = all.filter(w => w.sent?.undoUntil && Date.parse(w.sent.undoUntil) > Date.now())
	const kp = store.proposals().filter(p => p.state === 'needs_human')
	const fresh = [...needs, ...undoable, ...kp].filter(w => !n.lastNudgeAt || w.updatedAt > n.lastNudgeAt)
	// An automatic send nudges at once, because its undo window is shorter than the nudge interval.
	const urgent = undoable.some(w => fresh.includes(w))
	const due = urgent || !n.lastNudgeAt || Date.now() - Date.parse(n.lastNudgeAt) > cfg.nudgeEveryMin * 60_000
	if (!fresh.length || !due) return false
	if ((await src.presence()).availability === 'DoNotDisturb' || await ownerActive(store, src)) return false
	await say(store, src, renderNudge(needs, undoable, new Date(), kp))
	store.markShown(needs.slice(0, 6))
	store.saveNotify({ ...store.notify(), lastNudgeAt: new Date().toISOString() })
	return true
}

// The home whose work a run's report updates: its own, the work it is a part of, or the open work it says it belongs to.
function family(store: Store, wf: Workflow, r: Report): Workflow {
	const home = homeOf(store, wf)
	if (home !== wf || wf.work || !r.partOf) return home.id === wf.id ? wf : store.workflow(home.id) ?? home
	const to = store.byCode(r.partOf.toUpperCase())
	if (!to || to.id === wf.id || !active(to) || to.partOf) return wf
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
