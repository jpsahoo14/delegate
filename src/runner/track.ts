import { stateFields, WORKFLOW_SCHEMA } from '../core/upgrades.ts'
import { randomUUID } from 'node:crypto'
import type { Config, Follow, Job, Workflow } from '../core/types.ts'
import { activeAgentHold } from '../core/agent-failure.ts'
import { ulid } from '../core/ids.ts'
import type { Store } from '../store/state.ts'
import { slug } from '../knowledge/format.ts'
import { forkSession, sessionCwd } from './own.ts'
import { step, watchEnded } from './work.ts'
import { messageLink } from '../adapters/channels.ts'
import { parseWatch } from '../core/verbs.ts'

// A tracker is a job that runs again every N minutes until its condition holds, with one item the owner sees (R-TRK-01, R-ADP-01).
export const DEFAULT_UNTIL = 'it is done: merged, answered, decided, or resolved'

// A "by" date is a local calendar day; checking stops at the end of the day after it, then the owner is asked what next (design-spec/done-v2.md).
export function byEnd(by: string): string | undefined {
	const m = by.match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (!m) return undefined
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
	const day = new Date(y, mo - 1, d)
	if (day.getFullYear() !== y || day.getMonth() !== mo - 1 || day.getDate() !== d) return undefined
	return new Date(y, mo - 1, d + 1, 23, 59, 59, 999).toISOString()
}

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export type TrackInput = { target: string; everyMinutes?: number; until?: string; shepherd?: boolean; endsAt?: string; by?: string; from?: Workflow['watchFrom']; link?: string }

export function track(store: Store, t: TrackInput, session?: string, made?: (code: string) => void): string {
	const cfg = store.config()
	const now = new Date().toISOString()
	const every = Math.min(1440, Math.max(5, t.everyMinutes ?? 60))
	const until = t.until?.trim() || DEFAULT_UNTIL
	const by = t.by ? t.by.trim() : undefined
	const endsAt = by ? byEnd(by) : t.endsAt
	if (by && !endsAt) return `"${by}" is not a date. Say the "by" date as YYYY-MM-DD, for example ${localDay()}.`
	if (by && by < localDay()) return `${by} has passed. Say a "by" date from today on, or leave it out.`
	const goal = t.shepherd
		? `Shepherd ${t.target} to closure (${until}): find what still stands in the way, propose the changes that move it, and say what only someone else can move`
		: `Check ${t.target} and report its current state in one line`
	const told = t.link ? `${goal}. It came from this Teams message: ${t.link}` : goal
	const wf: Workflow = {
		schema: WORKFLOW_SCHEMA, id: ulid(), code: store.nextCode(), kind: 'tracker', ...stateFields(undefined, 'waiting_on_task'), key: { type: 'thread', id: '' },
		chat: { id: '', name: 'Watching', test: false }, asker: { id: cfg.owner.id, name: 'You' }, session: { agent: cfg.agent.flavor, id: session ?? randomUUID() },
		lastMsgId: '', pending: [], msgIds: [], lastAsk: `Watch ${t.target} until ${until}`, status: `Watching ${t.target} every ${every} min`, waitingSince: now, newCount: 0, createdAt: now, updatedAt: now,
		...(by ? { watchBy: by } : {}), ...(t.from ? { watchFrom: t.from } : {}),
	}
	// Started from a session (for example the one that made the PR), the tracker works in a fork of it, with its context.
	const fork = session ? forkSession(session) : undefined
	const job: Job = {
		schema: 1, id: ulid(), key: `track:${slug(t.target)}:${wf.id}`, goal, repo: fork ? sessionCwd(session!) : undefined, session: { agent: cfg.agent.flavor, id: fork ?? randomUUID() },
		state: 'queued', purpose: 'work', parents: [wf.id], asks: [told], every, until, endsAt, nextAt: now, createdAt: now, updatedAt: now,
	}
	wf.job = job.id
	store.save(wf)
	store.saveJob(job)
	made?.(wf.code)
	return `Watching ${t.target} every ${every} minutes until ${until}${by ? `, by ${by}` : ''}, as ${wf.code}. I'll tell you only when something changes${t.shepherd ? ', and ask before any fix or reply goes out' : ''}. Say "skip ${wf.code}" to stop.`
}

export type WatchResult = { text: string; accepted: boolean; code?: string }

const teamsLink = (wf: Workflow) => !wf.chat.id || !wf.lastMsgId || wf.chat.test ? undefined
	: messageLink(wf.chat.id, wf.lastMsgId)

function started(store: Store, t: TrackInput): WatchResult {
	let code = ''
	const text = track(store, t, undefined, c => { code = c })
	if (!code) return { text, accepted: false }
	return { text: `Watching ${t.target} as ${code}${t.by ? `, by ${t.by}` : ''}. I'll tell you when it is done or needs you.`, accepted: true, code }
}

// "watch A41" / "watch A41: <target> until <until> by YYYY-MM-DD push": a Catch up line becomes a watch (design-spec/done-v2.md).
// One watch per line: the same command twice points at the first watch.
export function watchItem(store: Store, wf: Workflow, body?: string): WatchResult {
	const input = parseWatch(body)
	return watchItemTarget(store, wf, { target: input.target, until: input.until, by: input.by, shepherd: input.push })
}

export function watchItemTarget(store: Store, wf: Workflow, input: { target?: string; until?: string; by?: string; shepherd?: boolean }): WatchResult {
	if (wf.state !== 'done' || !wf.fyi) return { text: `${wf.code} is not in Catch up, so there is nothing to watch from it. To watch something else, say "watch: <what should get done>".`, accepted: false }
	const live = wf.watchedAs ? store.byCode(wf.watchedAs) : undefined
	if (live && live.state !== 'done') return { text: `${wf.code} is already watched as ${live.code}.`, accepted: true, code: live.code }
	const link = teamsLink(wf)
	const target = input.target ?? wf.fyi.watch?.target ?? wf.fyi.line
	const r = started(store, { target, until: input.until ?? wf.fyi.watch?.until, by: input.by, endsAt: input.by ? undefined : weekOut(), shepherd: input.shepherd || undefined, from: 'catchup', link })
	// Not a new event: the row keeps its place and its seen state.
	if (r.code) { const src = store.byCode(wf.code)!; src.watchedAs = r.code; store.save(src, false) }
	return r
}

// "watch: <text> by YYYY-MM-DD push": the Ongoing form. The job works out what done means, or asks once (workflows/tracker.md).
export function watchSomething(store: Store, body?: string): WatchResult {
	const w = parseWatch(body)
	if (!w.target) return { text: 'Say what to watch, for example "watch: PR 1601234 merged by 2026-10-23".', accepted: false }
	return watchTarget(store, { target: w.target, until: w.until, by: w.by, shepherd: w.push || undefined })
}

export function watchTarget(store: Store, input: Pick<TrackInput, 'target' | 'until' | 'by' | 'shepherd'>): WatchResult {
	const until = input.until ?? DEFAULT_UNTIL
	const live = store.workflows().find(x => x.kind === 'tracker' && x.state !== 'done' && x.watchFrom === 'owner' && x.lastAsk === `Watch ${input.target} until ${until}`)
	if (live) return { text: `Already watching ${input.target} as ${live.code}.`, accepted: true, code: live.code }
	return started(store, { ...input, until, endsAt: input.by ? undefined : weekOut(), from: 'owner' })
}

export const watchCommand = (store: Store, p: { code?: string; text?: string }): WatchResult => {
	if (!p.code) return watchSomething(store, p.text)
	const wf = store.byCode(p.code)
	return wf ? watchItem(store, wf, p.text) : { text: `${p.code}: no such item.`, accepted: false }
}

export const FOLLOW_DAYS = 7
// A watch with no date checks for a week, then asks the owner what next, like a promised check-back.
const weekOut = () => new Date(Date.now() + FOLLOW_DAYS * 86_400_000).toISOString()

// The check-back a sent reply promised (B19): a tracker that stops by itself after FOLLOW_DAYS unless the owner extends it.
export function startFollow(store: Store, f: Follow, now = Date.now()): string {
	let code = ''
	track(store, { target: f.target, until: f.until, everyMinutes: Math.round((f.everyHours ?? 4) * 60), endsAt: new Date(now + FOLLOW_DAYS * 86_400_000).toISOString() }, undefined, c => { code = c })
	return code
}

// The check-back an open work item promised: a job whose only parent is that item, so its news comes back there (R-WRK-04).
// One live watch per item: a later promise about the same subject changes its interval and condition instead of starting another.
// A promise about another subject gets its own job, and never re-points the other subject's watch; a failed or stopped watch is
// replaced, never reused silently. Every watch it leaves has a next check (bug 10-23 E40).
export function startWatch(store: Store, wf: Workflow, f: Follow, now = Date.now()): string {
	const at = new Date(now).toISOString(), every = Math.min(1440, Math.max(5, Math.round((f.everyHours ?? 4) * 60)))
	const endsAt = new Date(now + FOLLOW_DAYS * 86_400_000).toISOString(), goal = `Check ${f.target} and report its current state in one line`
	const key = `watch:${slug(f.target)}:${wf.id}`
	const live = wf.work?.watch ? store.job(wf.work.watch) : undefined
	if (live?.every && live.state !== 'failed' && live.key === key) {
		const due = now + every * 60_000, next = live.nextAt && Date.parse(live.nextAt) <= due ? live.nextAt : new Date(due).toISOString()
		Object.assign(live, { every, until: f.until, goal, endsAt, nextAt: live.state === 'queued' ? live.nextAt ?? at : next })
		store.saveJob(live)
		return wf.code
	}
	if (live) {
		const was = watchSubject(live)
		if (live.state === 'failed') step(wf, `The check-back on ${was} had stopped: ${live.error ?? 'its last check failed'}. A new check-back starts now`, { ref: `watch-replaced:${live.id}` })
		else if (live.every) step(wf, `Stopped checking back on ${was}; the newer promise checks back on ${f.target}`, { ref: `watch-replaced:${live.id}` })
		if (live.every) { Object.assign(live, { every: undefined, nextAt: undefined, ...(live.state === 'queued' ? { state: 'done' as const } : {}) }); store.saveJob(live) }
	}
	const job: Job = {
		schema: 1, id: ulid(), key, goal, session: { agent: store.config().agent.flavor, id: randomUUID() },
		state: 'queued', purpose: 'work', parents: [wf.id], asks: [goal], every, until: f.until, endsAt, nextAt: at, createdAt: at, updatedAt: at,
	}
	store.saveJob(job)
	wf.work!.watch = job.id
	return wf.code
}
export const watchSubject = (job: Job) => job.goal.replace(/^Check (.*) and report.*$/, '$1')
export function stopWatch(store: Store, wf: Workflow) {
	const job = wf.work?.watch ? store.job(wf.work.watch) : undefined
	if (job?.every) { Object.assign(job, { every: undefined, nextAt: undefined }); store.saveJob(job) }
}

export const isTracker = (job: Job) => !!job.every

export function watchDeadline(store: Store, cfg: Config, job: Job, now: number): string | undefined {
	const at = Date.parse(job.nextAt ?? '')
	if (!job.every || job.state !== 'done' || job.relay || job.retry || !Number.isFinite(at) || at <= now) return undefined
	const item = job.parents.map(id => store.workflow(id)).find(w => w && w.state !== 'done')
	if (!item || item.work?.watch !== job.id && item.state !== 'waiting_on_task') return undefined
	if (store.control().stopped || activeAgentHold(store.agentHold(), cfg.agent, now) || store.runsToday() >= (cfg.dailyRuns ?? 200)) return undefined
	return job.nextAt
}

// Trackers whose next check is due go back in the queue; a tracker nobody watches any more stops (R-TRK-01).
export function dueTrackers(store: Store, now = Date.now()) {
	for (const job of store.jobs().filter(j => j.every && j.state === 'done' && j.nextAt && Date.parse(j.nextAt) <= now)) {
		const item = job.parents.map(id => store.workflow(id)).find(w => w && w.state !== 'done')
		if (!item) { Object.assign(job, { every: undefined, nextAt: undefined }); store.saveJob(job); continue }
		const work = item.work?.watch === job.id
		if (job.endsAt && Date.parse(job.endsAt) <= now) {
			Object.assign(job, { every: undefined, nextAt: undefined }); store.saveJob(job)
			// The end of a watch is not the end of the work: the owner decides what next (review P0.2).
			if (work) { watchEnded(item, `The watch on ${watchSubject(job)} ended after ${FOLLOW_DAYS} days`, store); store.save(item); continue }
			Object.assign(item, { ...stateFields(item, 'done'), status: item.watchBy ? `Stopped watching: it was due by ${item.watchBy}. Say "watch …" to start again.` : `Stopped watching after ${FOLLOW_DAYS} days. Say "watch …" to start again.` }); store.save(item)
			continue
		}
		if (!work && item.state !== 'waiting_on_task') continue
		Object.assign(job, { state: 'queued', purpose: 'work' })
		store.saveJob(job)
	}
}
