import { pendingEffects, shown } from '../core/effects.ts'
import { spawnSync } from 'node:child_process'
import { uptime } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Answer, Config, Workflow } from '../core/types.ts'
import { ulid } from '../core/ids.ts'
import { MARK } from '../core/render.ts'
import { cleanEnv, interactiveCommand } from '../adapters/agent.ts'
import { removeRunFiles } from '../adapters/run-files.ts'
import type { Source } from '../adapters/source.ts'
import { LOCAL_DIR, type Store } from '../store/state.ts'
import { CLI } from '../paths.ts'
import { orientation } from '../worker/prompt.ts'
import { applyReport, workerMcp } from './dispatch.ts'
import { finishWork, parentsOf, type Procs } from './jobs.ts'
import { say } from './intake.ts'
import { backupSession, restoreSession } from './own.ts'
import { NAME } from '../brand.ts'
import { alive, commandOf, ours } from '../os/process.ts'


// Old items keep their job target; a newer reply run becomes the continuation target.
function target(store: Store, wf: Workflow) {
	const job = wf.job ? store.job(wf.job) : undefined
	if (wf.session.at && (!job || (job.state === 'done' || job.state === 'failed') && !job.relay && wf.session.at >= job.updatedAt))
		return { id: wf.id, session: wf.session.id, repo: wf.session.repo, job: undefined }
	return { id: job?.id ?? wf.id, session: job?.session.id ?? wf.session.id, repo: job?.repo, job }
}

// continue A9: open the item's session in a window on the runner machine (R-HIL-08, scenario 06).
export async function openContinue(store: Store, src: Source, wf: Workflow, a: Answer, procs: Procs) {
	const t = target(store, wf)
	const tell = (text: string) => (a.surface === 'self' ? say(store, src, `${MARK} ${text}`) : Promise.resolve(store.log({ event: 'continue', code: wf.code, text })))
	if (store.openWindow(t.id)) return tell(`${wf.code} is already open in a window on ${store.machine}.`)
	// Never a second window on the owner's own session: it is already open where they left it.
	if (t.job?.relay) return tell(`${wf.code} runs in your own session for ${t.job.relay.what} on ${t.job.relay.machine}. Continue it there.`)
	if (t.job?.state === 'running') return tell(`${wf.code} is still working. Say "continue ${wf.code}" again when it finishes.`)
	if (t.repo && !existsSync(t.repo)) return tell(`${wf.code} needs the repo ${t.repo} on ${store.machine}, so nothing was opened.`)
	// Reserved before the window exists, so a second continue or an ok in the same batch cannot slip in (tester P1-5).
	store.setOpenWindow(t.id, { machine: store.machine, pid: 0, runId: '', since: new Date().toISOString() })
	// A scheduled automatic reply waits for the owner instead (review 01-04 P1-3).
	if (wf.state === 'scheduled') { Object.assign(wf, { state: 'needs_human', sendAt: undefined, status: 'Held: you opened it in a window' }); store.save(wf) }
	procs.openWindow(`${NAME} ${wf.code}`, [process.execPath, CLI, 'continue', wf.code], { DELEGATE_LOCAL: LOCAL_DIR, DELEGATE_ROOT: store.root })
	store.log({ event: 'continue-open', code: wf.code, target: t.id })
	return tell(`Opening ${wf.code} in a new window on ${store.machine}. If it asks whether you trust the folder, answer it once, then it will summarize where ${wf.code} stands. I'll leave ${wf.code} alone until you close the window.`)
}

// Runs inside the window: claims the session, runs the agent interactively, and hands back on exit (R-HIL-17).
export function runWindow(store: Store, cfg: Config, code: string): number {
	const wf = store.byCode(code)
	if (!wf) { console.error(`No item ${code}.`); return 1 }
	const t = target(store, wf)
	// Every way in follows the same rules as "continue A7" from chat: one window per session, and not while its job runs (review 085 P0-4).
	// A synced file cannot give a true cross-machine lock; the claim is checked and released by its own run id.
	const held = store.openWindow(t.id)
	const ownReservation = held && !held.pid && held.machine === store.machine
	if (held && !held.closed && !ownReservation) { console.error(`${code} is already open on ${held.machine}. Close that window first.`); return 1 }
	if (t.job?.state === 'running') { console.error(`${code} is still working. Try again when it finishes.`); return 1 }
	const runId = ulid()
	const { cwd, mcpConfigPath } = workerMcp(store, t.id, runId, true)
	const open = { machine: store.machine, pid: process.pid, runId, since: new Date().toISOString() }
	store.setOpenWindow(t.id, open)
	const effects = pendingEffects(wf.effects).map(e => shown(e).line)
	try {
		const [cmd, ...args] = interactiveCommand(cfg.agent, t.session, orientation(wf.code, t.id, wf.status, wf.draft?.text, effects), mcpConfigPath)
		// On a machine other than the runner, the session comes from the storage folder and goes back there on close (R-STO-07).
		restoreSession(store, t.session)
		const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: t.repo ?? cwd, env: cleanEnv(process.env) })
		backupSession(store, t.session)
		return r.status ?? 0
	} finally {
		if (store.openWindow(t.id)?.runId === runId) store.setOpenWindow(t.id, { ...open, closed: true })
		removeRunFiles(mcpConfigPath)
	}
}

// A terminal counts as open at most 12 hours, on this machine as on another (#43, PE 16:50).
const WINDOW_MS = 12 * 3_600_000
// Whether a local window's process is still that window: alive, and running `delegate continue` (the process that marks the window
// closed when it ends). A bare pid check also held for any program that later got the pid, or for another Delegate process such
// as the page server. The process table is asked once per pid and start, for the life of this process; an unreadable command line
// keeps the old answer, as aliveAs does.
const asked = new Map<string, boolean>()
export function windowProcess(pid: number, since: string): boolean {
	if (!alive(pid)) return false
	const key = `${pid}:${since}`
	if (!asked.has(key)) { const cmd = commandOf(pid); asked.set(key, cmd === undefined || ours().test(cmd) && /\bcontinue\b/i.test(cmd)) }
	return asked.get(key)!
}

// Each tick: mark open items, and take back closed windows with whatever the owner decided.
export function checkOpen(store: Store, procs: Procs, bootMs = Date.now() - uptime() * 1000): number {
	let n = 0
	const isWindow = procs.windowAlive ?? windowProcess
	for (const { id, o } of store.openWindows()) {
		const job = store.job(id)
		const items = job ? parentsOf(store, job) : [store.workflow(id)].filter((w): w is Workflow => !!w)
		// A reservation without a window yet counts as open for two minutes; then the window never came.
		const reserved = !o.pid && Date.now() - Date.parse(o.since) < 2 * 60_000
		// A window on another machine cannot be checked from here: it is open until it says closed, for at most 12 hours.
		const age = Date.now() - Date.parse(o.since)
		const remote = o.machine !== store.machine && !!o.pid && age < WINDOW_MS
		// A window from before this machine last started is gone, even if its process ID now belongs to another program.
		const here = !!o.pid && o.machine === store.machine && Date.parse(o.since) > bootMs && age < WINDOW_MS && isWindow(o.pid, o.since)
		if (!o.closed && (reserved || remote || here)) {
			for (const wf of items.filter(w => w.openOn !== o.machine)) { wf.openOn = o.machine; store.save(wf) }
			continue
		}
		const r = store.peekReport(id, o.runId)
		if (r && job) finishWork(store, job, r, job.asks.length)
		for (const wf of job ? parentsOf(store, job) : items) {
			const fresh = store.workflow(wf.id)!
			if (r && !job) applyReport(fresh, r)
			// What the owner decided in the window comes back as a preview: nothing leaves without an ok outside it.
			if (r && fresh.draft) fresh.draft.preview = true
			fresh.openOn = undefined
			if (!r && !fresh.status.startsWith('Back from')) fresh.status = `Back from your window, nothing decided. ${fresh.status}`.slice(0, 200)
			store.save(fresh)
		}
		store.archiveReport(id, o.runId)
		if (o.machine === store.machine && o.runId) removeRunFiles(join(LOCAL_DIR, 'sessions', `mcp-${o.runId}.json`))
		store.setOpenWindow(id, undefined)
		// Why the item came back: the window said closed, the owner took it back, or the window is gone, not ours, or over 12 hours.
		const why = o.takenBack ? 'taken-back' : o.closed ? 'closed' : !(age < WINDOW_MS) ? 'over-12h' : !o.pid || o.machine !== store.machine || Date.parse(o.since) <= bootMs || !alive(o.pid) ? 'gone' : 'not-ours'
		store.log({ event: 'continue-closed', target: id, report: !!r, why })
		n++
	}
	return n
}
