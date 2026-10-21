import type { State } from './types.ts'

// Whose move is it (design-spec/new-experience.md §3, dev-spec/new-experience.md §0). Code decides; the AI's words only place open work.
export type Section = 'move' | 'working' | 'waiting' | 'catchup' | 'done'

// Everything a rule reads about one subject, gathered once per request by web/next.ts.
export type Facts = {
	subject: 'item' | 'waiting' | 'reminder'
	state?: State
	// The item's job, if any. watch: a check that repeats (job.every); retryLater: a retry not due yet.
	// slot: a queued job that gets one of next cycle's run slots (jobs at once, and the day's runs).
	// retry: the job is a retry, which waits while Delegate is paused (runner/jobs.ts startJobs).
	job?: { state: 'queued' | 'running' | 'done' | 'failed'; watch: boolean; retryLater: boolean; slot?: boolean; retry?: boolean }
	// A draft queued for the AI: starts next cycle, waits in line behind live asks, waits for tomorrow's runs, or is held by the owner's open window.
	queue?: 'next' | 'line' | 'limit' | 'held'
	// Whether the runner will run anything next cycle. paused means a machine is reading and nothing is sent: when none
	// reads, the runner is off, whatever the pause (web/next.ts snapshot).
	runner: 'ok' | 'off' | 'paused' | 'stopped' | 'capped'
	work?: { open: boolean; next?: 'you' | 'them' | 'me' }
	// Open to-dos a sent reply left the owner, kept across turns (R-NEX-07).
	todos?: number
	fyiUnread: boolean
}

export type Rule = { id: string; section: Section; when: (f: Facts) => boolean }

// Delegate is working: a run going now, or one that starts next cycle (rule 6). Paused, drafts and new work runs go on and every
// send waits (runner/tick.ts drafts each cycle; core/gate.ts refuses sends; runner/jobs.ts holds retries), so a rule send and a
// retry wait while a queued draft or run still starts next cycle.
const running = (f: Facts) => f.job?.state === 'running' && !f.job.watch
const startsNext = (f: Facts) => {
	const draft = f.state === 'running' && f.queue === 'next', run = f.job?.state === 'queued' && !f.job.watch && !f.job.retryLater && !!f.job.slot
	return f.runner === 'ok' ? draft || f.state === 'scheduled' || run : f.runner === 'paused' && (draft || (run && !f.job!.retry))
}

// First match wins. Order is the point: needs_human beats anything the AI wrote, and nothing not done reaches Done.
export const RULES: Rule[] = [
	// An item with an open to-do is not done for the owner, whatever its state (rule 5).
	{ id: 'catchup', section: 'catchup', when: f => f.state === 'done' && f.fyiUnread && !f.todos },
	{ id: 'done', section: 'done', when: f => f.state === 'done' && !f.todos },
	{ id: 'needs-you', section: 'move', when: f => f.state === 'needs_human' },
	// A watch between checks is waiting_on_task with its job done: that is waiting, not stopped.
	{ id: 'stopped', section: 'move', when: f => f.state === 'waiting_on_task' && (!f.job || f.job.state === 'failed' || (f.job.state === 'done' && !f.job.watch)) },
	// Rule 5 (design §3), before Working as its number says. Only where rule 4 places the item (the owner's step, nothing running)
	// does it say that step instead; while Delegate runs, the to-do keeps the item in Your move (review N2 P2-3).
	// A rule send that is due places the item until it goes, with its time; then the to-do is back (re-review N2 P2-B).
	{ id: 'todo', section: 'move', when: f => !!f.todos && f.state !== 'scheduled' && !(f.work?.open && f.work.next === 'you' && !running(f) && !startsNext(f)) },
	{ id: 'job-running', section: 'working', when: running },
	{ id: 'starts-next', section: 'working', when: startsNext },
	{ id: 'your-step', section: 'move', when: f => !!f.work?.open && f.work.next === 'you' },
	{ id: 'waiting', section: 'waiting', when: () => true },
]

export function whoseMove(f: Facts): { section: Section; rule: string } {
	const r = RULES.find(r => r.when(f))!
	return { section: r.section, rule: r.id }
}

// When a thread has several subjects (a home, its parts, its W entries), the most urgent one places it.
export const URGENCY: Section[] = ['move', 'working', 'waiting', 'catchup', 'done']
// Within one section, the design's rule order (§3: 2, 2a, 4, 5, 6) picks the subject: a part's draft waiting for ok is not hidden
// behind its home's to-do (review N2 P1-1). RULES differs only because rule 4 must first know that nothing runs.
export const PRECEDENCE = ['needs-you', 'stopped', 'your-step', 'todo', 'job-running', 'starts-next', 'waiting', 'catchup', 'done']
// A rule missing from PRECEDENCE ranks last, so it never wins a tie by accident (re-review N2 P2-D).
export const rankOf = (id: string) => { const i = PRECEDENCE.indexOf(id); return i < 0 ? PRECEDENCE.length : i }
