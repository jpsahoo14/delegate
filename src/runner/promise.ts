// Slice 3 of next action (reviews/eng-next-action.md, case 6): the owner's own words that promise a change on the item's target.
// The reply has already gone; one short run in the item's session maps the words to changes, which wait for one ok on the same
// item, through the same vet, ok, and make_change as every other change. Nothing is made without that ok.
import { ulid } from '../core/ids.ts'
import { MARK } from '../core/render.ts'
import { isVote, prIdOf, proposalEffects, saidLine, vet, voteValue } from '../core/effects.ts'
import type { Config, Effect, Workflow } from '../core/types.ts'
import type { Source } from '../adapters/source.ts'
import type { Store } from '../store/state.ts'
import { buildPromisePrompt } from '../worker/prompt.ts'
import { readDirs, WORKER_TOOLS, workerMcp, type RunWorker } from './dispatch.ts'
import { agentSetupFailure } from '../core/agent-failure.ts'
import { blockedAgent, holdAgent } from './agent-health.ts'
import { prTarget, voteNow, type BuildProbe } from './probe.ts'
import { carry, executing } from './jobs.ts'
import { active, homeOf, keepTodos, newTurn, statusOf } from './work.ts'
import { close, say } from './intake.ts'
import { backupSession, restoreSession } from './own.ts'
import { startFollow, startWatch } from './track.ts'
import { takeRead } from './sharing.ts'
import { catalogInfo, workerTools } from './catalog.ts'
import { unsafeRead } from '../core/effects.ts'
import { toolServers } from '../adapters/mcp-client.ts'
import { shellInClone, shellTool } from './validate.ts'

type By = { ruleId?: string }

// Only the owner's own words, different from the draft or with none, on an item with a target a change can be made on (a PR today).
// A rule's send is never the owner's words, and a plain chat reply starts no run.
export const promiseDue = (store: Store, wf: Workflow, by: By) => !by.ruleId && !!wf.draft?.ownWords && !!prTarget(store, wf)

// The owner's words went out: the check waits for the next dispatch. A second send while it waits joins it, so one run reads both.
export function notePromise(store: Store, wf: Workflow, text: string) {
	const p = wf.promise
	wf.promise = p && (p.state === 'pending' || p.state === 'checking') ? { ...p, text: `${p.text}\n${text}`, state: 'pending' } : { text, at: new Date().toISOString(), state: 'pending' }
}

// Where a sent reply leaves its item: open work stays in progress; anything else is done.
export function rest(store: Store, wf: Workflow, status?: string) {
	const home = homeOf(store, wf)
	if (active(home)) Object.assign(wf, { state: 'open', status: status ?? statusOf(home), pending: [] })
	else close(wf, status ?? `Sent: "${(wf.sent?.text ?? '').slice(0, 80)}"`)
	Object.assign(wf, { promise: undefined, question: undefined })
}

// The offered changes are withdrawn, on the item and on its job, unless a change run is already making them.
function withdrawOffer(store: Store, wf: Workflow) {
	const off = (es: Effect[] = []) => es.map(e => (e.done || e.off ? e : { ...e, off: true }))
	const job = wf.job ? store.job(wf.job) : undefined
	if (job?.result && !executing(job)) { job.result = { ...job.result, effects: off(job.result.effects) }; store.saveJob(job) }
	wf.effects = off(wf.effects)
}
const settled = (wf: Workflow) => wf.promise?.state === 'offered' || wf.promise?.state === 'failed'
// skip: the owner chose not to make the promised change, or not to check again; nothing of it stays for a later turn.
export function dropPromise(store: Store, wf: Workflow) {
	if (!settled(wf)) return
	if (wf.promise!.state === 'offered') withdrawOffer(store, wf)
	wf.promise = undefined
}
// A new ask on an item whose change waits for ok, or whose check failed: the reply already went, so this is a new turn whose own reply
// can go. The offered change is withdrawn, and the owner's words are checked again once the item rests (review P1-2).
export function reopenPromise(store: Store, wf: Workflow) {
	if (!settled(wf)) return
	const p = wf.promise!
	if (p.state === 'offered') withdrawOffer(store, wf)
	newTurn(wf)
	wf.promise = { ...p, state: 'pending', why: undefined }
}
// The check could not finish: the reply already went; nothing is made. The owner sees that it failed and can run it again.
export function failPromise(store: Store, wf: Workflow, error?: string, said = wf.promise?.text ?? '') {
	Object.assign(wf, { state: 'needs_human', draft: undefined, promise: { ...wf.promise!, text: said, state: 'failed', why: error?.slice(0, 160) }, status: `Sent. Could not check what your reply promised${error ? `: ${error.slice(0, 120)}` : ''}`, question: undefined, revAt: new Date().toISOString() })
	store.save(wf)
	store.log({ event: 'promise-failed', workflowId: wf.id, code: wf.code, error: error?.slice(0, 200) })
}

// "Check again" on a check that failed: the item rests as the send left it, and the same short run goes once more.
export function checkAgain(store: Store, wf: Workflow): string {
	const p = wf.promise!
	rest(store, wf)
	wf.promise = { ...p, state: 'pending', why: undefined }
	return `Checking again what you told ${first(wf)}.`
}

const first = (wf: Workflow) => (wf.asker?.name ?? 'them').split(/\s+/)[0]

// The owner hears the result where they sent: the self-chat, or the AI chat's receipts. The page shows the row.
async function tell(store: Store, src: Source, wf: Workflow, text: string) {
	if (wf.answerSurface === 'self') { await say(store, src, `${MARK} ${text}`); store.markShown([wf]); return }
	if (wf.answerSurface === 'chat' || wf.answerSurface === 'panel') store.addReceipt(text)
}

// The items whose owner's words wait for a check, and may run now: never while paused, in a window, or while their job's session runs.
// An item that started a new turn since (new messages to redraft) waits until it rests again.
const resting = (w: Workflow) => w.state === 'done' || w.state === 'open'
const busy = (store: Store, w: Workflow) => { const j = w.job ? store.job(w.job) : undefined; return !!j && (j.state === 'running' || executing(j)) }
// Cycles never overlap, so a check still "checking" when dispatch starts was cut off by a crash: it runs again.
export const promisesDue = (store: Store, cfg: Config) => cfg.paused || store.control().paused ? [] : store.workflows().filter(w => (w.promise?.state === 'pending' || w.promise?.state === 'checking') && resting(w) && !store.openWindow(w.id) && !busy(store, w))

export async function checkPromise(store: Store, src: Source, cfg: Config, wf: Workflow, run: RunWorker, probe?: BuildProbe) {
	if (blockedAgent(store, cfg)) return
	const job = wf.job ? store.job(wf.job) : undefined
	// The item's own session: for a PR review, the job's, which read the commit a vote must name.
	const session = job?.session.id ?? wf.session.id, runId = ulid(), said = wf.promise!.text
	wf.promise = { ...wf.promise!, state: 'checking' }
	store.save(wf, false)
	let report, error: string | undefined
	try {
		const tools = workerTools(cfg, 'reply')
		const unsafe = unsafeRead(tools, Object.keys(toolServers(cfg)), catalogInfo(cfg))
		if (unsafe) throw new Error(unsafe)
		// Never in the owner's clone with a shell: it could run code from the PR outside the ok (review P1-3).
		const shell = job?.repo && shellTool(tools)
		if (shell) throw new Error(shellInClone(shell))
		const { cwd, mcpConfigPath } = workerMcp(store, wf.id, runId)
		store.addRun()
		restoreSession(store, session)
		const res = await run({ ...cfg.agent, tools }, { workflowId: wf.id, runId, sessionId: session, prompt: buildPromisePrompt(wf, store.thread(wf.id), cfg, store.root, prTarget(store, wf)), cwd: job?.repo ?? cwd, mcpConfigPath, extraTools: WORKER_TOOLS, dirs: readDirs(store, cfg) })
		takeRead(store.root, runId)
		backupSession(store, session)
		report = store.peekReport(wf.id, runId)
		store.archiveReport(wf.id, runId)
		const account = !report && (res.setup ?? agentSetupFailure(`${res.error ?? ''}\n${res.summary ?? ''}`))
		if (account) {
			holdAgent(store, cfg, account)
			const fresh = store.workflow(wf.id) ?? wf
			fresh.promise = { ...fresh.promise!, text: said, state: 'pending', why: account.text }
			store.save(fresh, false)
			return
		}
		error = res.error
	} catch (e) { error = String(e).replace(/^Error: /, '') }
	const fresh = store.workflow(wf.id) ?? wf
	const again = (why?: string) => { fresh.promise = { ...fresh.promise!, text: said, state: 'pending', why }; store.save(fresh, false) }
	if (!resting(fresh)) return again()
	if (!report) {
		failPromise(store, fresh, error, said)
		return tell(store, src, fresh, `${fresh.code} went to ${first(fresh)}, but I could not check what it promised. Nothing was changed. Say "ok ${fresh.code}" to check again, or "skip ${fresh.code}".`)
	}
	// The same rules as a reply's changes: only what the owner allows, on this item's PR; anything else is a to-do with its reason.
	const v = vet(cfg, report.effects, prTarget(store, fresh))
	// A change already made, or one the owner left out of this item ("ok A1 except 1"), is never offered again; nor a vote the owner
	// already cast there. A vote is the same vote on the same PR and commit however its call is written (a new commit is a new vote).
	const decided = (fresh.effects ?? []).filter(e => e.done || e.off)
	const same = (a: Effect, b: Effect) => isVote(a.call) && isVote(b.call) ? prIdOf(a.call) === prIdOf(b.call) && voteValue(a.call) === voteValue(b.call) && (a.head ?? null) === (b.head ?? null) : JSON.stringify(a.call) === JSON.stringify(b.call)
	const cast = (e: Effect) => isVote(e.call) && fresh.prVote !== undefined && fresh.prVote !== 0 && fresh.prVote === voteValue(e.call)
	const wanted = proposalEffects(v.effects.filter(e => !decided.some(m => same(m, e)) && !cast(e)).map(e => ({ ...e, done: undefined, error: undefined })), [fresh])
	// A vote is checked against the PR as it is now, as at ok.
	const now = await voteNow(store, cfg, fresh, wanted, probe)
	const left = [...(report.todos ?? []), ...v.todos]
	store.log({ event: 'promise-checked', workflowId: fresh.id, code: fresh.code, offered: now.effects.length, todos: left.length, ...(now.why ? { why: now.why } : {}), ...(now.again ? { again: true } : {}) })
	const lines: string[] = []
	let shared: ReturnType<typeof carry>
	if (now.again) {
		// The PR moved since the review: no vote, and the owner reviews again, as at ok. The reply already went, so that is a new turn
		// of the item, whose vote and reply both wait for ok.
		newTurn(fresh)
		Object.assign(fresh, { state: 'needs_human', promise: undefined, question: now.again, status: `PR ${prTarget(store, fresh)} changed since your review`, revAt: new Date().toISOString() })
		lines.push(`${fresh.code}: ${now.again}`)
	} else if (now.effects.length && (shared = carry(store, cfg, fresh, now.effects)) !== 'shared') {
		// A change run is making the list the owner already approved: this one is checked again after it.
		if (shared === 'busy') return again()
		const line = saidLine(now.effects), meaning = now.effects.map(e => e.pr).find(Boolean)
		Object.assign(fresh, { state: 'needs_human', draft: undefined, effects: now.effects, promised: undefined, approved: undefined, question: undefined, promise: { ...fresh.promise!, text: said, state: 'offered', why: undefined }, status: line, revAt: new Date().toISOString() })
		lines.push(`${fresh.code}: ${line.replace(/^You/, 'you')}${meaning ? ` ("${meaning.title}" by ${meaning.author}${meaning.autoComplete ? '; autocomplete is on: your approval may complete it' : ''})` : ''}. Say "ok ${fresh.code}" to do it, or "skip ${fresh.code}".`)
	} else {
		// Another open item on the same review shows its own changes, so this one's list cannot replace it: it is the owner's to do.
		if (shared) left.push(...now.effects.map(e => `${e.summary.replace(/[.\s]+$/, '')}. Not made for you: another open item on this review has changes waiting; ok or skip it first, then say it again, or make it by hand`))
		fresh.promise = undefined
	}
	if (left.length) {
		fresh.todos = [...new Set([...(fresh.todos ?? []), ...left])]
		keepTodos(fresh, wf.sent?.at ?? wf.promise!.at, left)
	}
	// A promise that waits on a condition can be watched, as a reply's check-back is.
	const home = homeOf(store, fresh)
	const watching = report.follow && !now.again ? (active(home) ? startWatch(store, home, report.follow) : startFollow(store, report.follow)) : undefined
	if (watching && home !== fresh) store.save(home)
	const yours = [left.length ? `still yours to do: ${left.join('; ')}.` : '', watching ? `Watching ${report.follow!.target} every ${report.follow!.everyHours ?? 4} h as ${watching}.` : ''].filter(Boolean)
	if (yours.length) lines.push(`${fresh.code}: ${yours.join(' ')}`)
	store.save(fresh)
	if (lines.length) await tell(store, src, fresh, lines.join('\n'))
}
