import { askWhatNext, due as dueWork } from './work.ts'
import { adoProbe, describeDeploys, probeBuilds, probePRs, type BuildProbe } from './probe.ts'
import { describeTargets } from './validate.ts'
import { cliServers } from '../adapters/mcp-client.ts'
import { noticeHabits } from './habits.ts'
import type { Source } from '../adapters/source.ts'
import { demoProcs, demoRun } from '../adapters/demo.ts'
import { historyFor, kindOf, sourceFor } from '../adapters/registry.ts'
import { planChats } from './bootstrap.ts'
import { saveLearned } from './proposals.ts'
import type { History } from '../adapters/history.ts'
import type { Store } from '../store/state.ts'
import { applyAnswers } from './apply.ts'
import { dispatch, nudge, type RunWorker } from './dispatch.ts'
import { intake, readOwnerCommands, say, takeMissed } from './intake.ts'
import { retryOwnerReplies } from './owner-reply.ts'
import { planSweep, sweep, sweeping } from './sweep.ts'
import { untold } from '../os/autoupdate.ts'
import { closeDead } from '../mesh/inbox.mjs'
import { MARK } from '../core/render.ts'
import { discover } from './discover.ts'
import { dueSends } from './autosend.ts'
import { daily } from './daily.ts'
import { dueAutomations } from './automations.ts'
import { checkJobs, legacyEffects, realProcs, settleCompleted, startJobs, type Procs } from './jobs.ts'
import { checkOpen } from './continue.ts'
import { stampPlaces } from './place.ts'
import { writeSnapshot } from '../web/server.ts'
import { notify } from '../os/notify.ts'
import { clock, DEFAULT_POLL, isDue, offNotice, plan, validTz } from '../core/schedule.ts'
import type { Config } from '../core/types.ts'
import { NAME, CMD } from '../brand.ts'

export type TickResult = { skipped?: string; commands: number; answers: number; asks: number; runs: number; nudged: boolean; ms: number }

// One tick converges on the end state in dev-spec/runner.md. Safe to run twice.
export const TAKEOVER_MIN = 30

export async function tick(store: Store, deps: { source?: Source; run?: RunWorker; procs?: Procs; force?: boolean; history?: History; probe?: BuildProbe; mono?: () => number } = {}): Promise<TickResult> {
	const t0 = Date.now()
	// A monotonic clock does not advance while the machine sleeps, so a sleep inside a cycle shows as the difference.
	const mono = deps.mono ?? (() => performance.now()), p0 = mono()
	const empty = { commands: 0, answers: 0, asks: 0, runs: 0, nudged: false }
	const cfg = store.config()
	if (!cfg) throw new Error(`No config.json in ${store.root}. Run "${CMD} init".`)
	// A check asked for on any machine, or an answer or missed link waiting, is due at once: the page may run on another machine than the runner.
	// Waiting answers never override a backoff or an outage: Teams is not called every minute while it is down (review 10-20).
	const waiting = (store.answers().length > 0 || store.missed().length > 0) && !store.schedule().backoff && !store.health().source
	const kicked = store.kickedAt() > (store.lease()?.at ?? '')
	const asked = kicked || waiting
	if (!deps.force && !asked && !isDue(store.schedule(), new Date())) return { skipped: 'not due', ...empty, ms: Date.now() - t0 }
	const pinned = store.config().runner
	if (pinned && pinned !== store.machine) {
		// A standby machine takes over only when no machine has run a cycle for TAKEOVER_MIN; a slow sync never causes two readers.
		const l = store.lease()
		if (l && Date.now() - Date.parse(l.at) < TAKEOVER_MIN * 60_000) return { skipped: `the runner is ${pinned}`, ...empty, ms: Date.now() - t0 }
		store.saveConfig({ ...store.config(), runner: store.machine })
		store.log({ event: 'runner-takeover', from: pinned, lastCycle: l?.at, lastBy: l?.machine })
		// Kept until a good read can tell it, so a failed first read does not lose it.
		store.saveChats({ ...store.chats(), notice: `${l ? `${pinned} ran no cycle after ${clock(new Date(l.at), cfg.tz)}, so` : `${pinned} has not read your chats yet, so`} ${store.machine} now reads them. To move it back, say "move ${NAME} here" to the AI on ${pinned}.` })
	}
	if (!store.acquireLease()) return { skipped: 'another machine holds the lease', ...empty, ms: Date.now() - t0 }
	// The demo swaps in a file chat, a canned worker, and instant jobs through the same interfaces.
	const demo = kindOf(cfg.source) === 'demo'
	const src = deps.source ?? sourceFor(cfg.source, cfg.owner.name, store.root)
	if (demo) deps = { ...deps, run: deps.run ?? demoRun(store), procs: deps.procs ?? demoProcs(store) }
	// Loudly off (Bet 1): the first cycle after the reading machine ran none for a while notes it, to tell after the catch-up.
	// Measured from the end of the last cycle, so a long cycle, a stop, or a Teams outage is never called asleep.
	store.setHealth('tz', cfg.tz && !validTz(cfg.tz) ? `The time zone "${cfg.tz}" in Settings is not known, so work hours use ${store.machine}'s clock.` : undefined)
	const c0 = store.chats()
	const off = c0.notice ? undefined : offNotice(c0.endAt, new Date(), store.machine, cfg.tz)
	if (off) store.saveChats({ ...c0, notice: off })
	try {
		const cursors = store.cursors()
		const procs = deps.procs ?? realProcs
		// Any source failure, at any stage, backs off the same way and still supervises runs (R-ING-06, final review P1-3).
		const down = async (e: unknown, answers: boolean) => {
			const throttled = /\b429\b|throttl|too many requests/i.test(String(e))
			const first = !store.health().source
			store.setHealth('source', throttled ? `Teams asked ${NAME} to slow down. It waits ${backoff(store)} minutes, then catches up in order.` : `Cannot reach chats from ${store.machine}: ${String(e).slice(0, 160)}. Check that "${cfg.source.command.join(' ')}" is signed in.`)
			// When chats are down, a system notification is the only surface left (R-HIL-18).
			if (first && !throttled) notify(NAME, `Cannot reach your chats: ${String(e).slice(0, 80)}`)
			if (throttled) store.saveSchedule({ ...store.schedule(), nextAt: new Date(Date.now() + backoff(store) * 60_000).toISOString(), backoff: backoff(store) })
			// Without chats, pause and stop from the AI chat still apply, and runs are still supervised (review 01-04 P1-7).
			if (answers) await applyAnswers(store, src, cfg, procs, true)
			checkOpen(store, procs, procs.bootMs?.())
			await checkJobs(store, src, cfg, procs, deps.probe)
			return { skipped: 'source unavailable', ...empty, ms: Date.now() - t0 }
		}
		let commands: number
		try { commands = await readOwnerCommands(store, src, cursors) } catch (e) { return await down(e, true) }
		// Saved at once: answers are queued, so a later failure must not re-read the same commands.
		store.saveCursors(cursors)
		// Finished reports land before the owner's answers, so an ok never acts on a turn that news already replaced (review P0.4).
		const jobsEarly = await checkJobs(store, src, cfg, procs, deps.probe)
		legacyEffects(store)
		settleCompleted(store, procs)
		// The owner's ok re-reads a pull request before voting on it, through the same read the PR checks use.
		// The AI CLI's tool list is read for it; one that cannot be read is named in Health and never stops the cycle (review 10-21b P1).
		const cli = cliServers(cfg.agent.flavor)
		store.setHealth('cli-config', cli.error ? `${NAME} could not read your AI CLI's tool list, ${cli.path} (${cli.error}). Changes through tool servers listed only there wait until it can.` : undefined)
		let probe: BuildProbe | undefined
		try { probe = deps.probe ?? adoProbe(cfg) } catch (e) { store.log({ event: 'probe-failed', error: String(e).slice(0, 300) }) }
		const answers = await applyAnswers(store, src, cfg, procs, false, probe)
		// An approval's change job starts in this pass, before any draft runs, never one pass later (latency a). Jobs run detached.
		const jobsMark = Date.now(), jobsNow = answers ? startJobs(store, cfg, procs, ['bootstrap:chats']) : 0
		const closeProbe = () => { if (!deps.probe) void probe?.close?.().catch(() => undefined) }
		// Stopped means no reading or drafting, but runs already started are still watched and their budgets enforced (tester P1-10).
		if (store.control().stopped) { closeProbe(); store.setHealth('source'); checkOpen(store, procs, procs.bootMs?.()); await checkJobs(store, src, cfg, procs, deps.probe); reschedule(store, cfg, false, t0); return { skipped: 'stopped', commands, answers, asks: 0, runs: 0, nudged: false, ms: Date.now() - t0 } }
		planSweep(store)
		let found: Awaited<ReturnType<typeof discover>>, asks: number
		const before = store.chats()
		// Chat cursors are saved only after a whole read, so a failure resumes in order.
		try { found = await discover(store, src, cfg); asks = await intake(store, src, cfg, cursors, found.chats) } catch (e) { closeProbe(); return await down(e, false) }
		await retryOwnerReplies(store, cfg, t0)
		store.setHealth('source')
		if (store.schedule().backoff) store.saveSchedule({ ...store.schedule(), backoff: undefined })
		store.saveCursors(cursors)
		found.commit()
		const after = store.chats()
		// Told only once the read left no gap open, so "caught up" is true.
		if (after.notice && after.readAt !== before.readAt) {
			// Cleared only once told; a failed send tries again next cycle.
			const told = await say(store, src, `${MARK} ${after.notice}`).then(() => true, e => { store.log({ event: 'notice-failed', error: String(e).slice(0, 200) }); return false })
			if (told) store.saveChats({ ...store.chats(), notice: undefined })
		}
		const missed = await takeMissed(store, src, cfg).catch(e => { store.log({ event: 'missed-failed', error: String(e).slice(0, 300) }); return 0 })
		await sweep(store, src, cfg).catch(e => store.log({ event: 'sweep-failed', error: String(e).slice(0, 300) }))
		const probed = await probeBuilds(store, probe).catch(e => { store.log({ event: 'probe-failed', error: String(e).slice(0, 300) }); return 0 })
		await describeDeploys(store, probe).catch(e => store.log({ event: 'probe-failed', error: String(e).slice(0, 300) }))
		await describeTargets(store, probe).catch(e => store.log({ event: 'probe-failed', error: String(e).slice(0, 300) }))
		await probePRs(store, cfg, probe, Date.now(), kicked).catch(e => store.log({ event: 'probe-failed', error: String(e).slice(0, 300) }))
		const due = store.workflows().filter(w => dueWork(w))
		for (const w of due) { askWhatNext(w); store.save(w) }
		// The owner's own words may promise a vote: its PR is read through the same probe, then closed (Slice 3).
		const runs = await dispatch(store, src, cfg, deps.run, probe).finally(closeProbe)
		// Jobs run detached: the tick starts and checks them, and never waits (R-LNG-02).
		const handedBack = checkOpen(store, procs, procs.bootMs?.())
		const jobsDone = await checkJobs(store, src, cfg, procs, deps.probe, jobsNow ? jobsMark : undefined)
		saveLearned(store)
		try { closeDead(store.root, store.machine) } catch (e) { store.log({ event: 'sessions-sweep-failed', error: String(e).slice(0, 200) }) }
		const h = deps.history ?? historyFor(cfg)
		try { if (!sweeping(store)) await planChats(store, h, new Date()) } catch (e) { store.log({ event: 'harvest-plan-failed', error: String(e).slice(0, 300) }) } finally { if (!deps.history) await h?.close() }
		// A plan that could not run this time waits for the next cycle; it never falls back to one run over 50 chats.
		const jobsStarted = startJobs(store, cfg, procs, h?.conversations ? ['bootstrap:chats'] : [])
		capHealth(store, cfg)
		// A pause or stop typed while drafts were being written applies before anything goes out (review 10-20 R1d).
		const now = Date.now()
		if (store.workflows().some(w => w.state === 'scheduled' && w.sendAt && Date.parse(w.sendAt) <= now) || store.automations().some(a => a.state === 'active' && a.next && Date.parse(a.next) <= now)) {
			try { await readOwnerCommands(store, src, cursors); store.saveCursors(cursors) } catch (e) { store.log({ event: 'controls-reread-failed', error: String(e).slice(0, 200) }) }
		}
		const lateAnswers = await applyAnswers(store, src, cfg, procs, true)
		const jobsLate = lateAnswers ? startJobs(store, cfg, procs, ['bootstrap:chats']) : 0
		const autoSent = await dueSends(store, src, cfg, deps.probe) + await dueAutomations(store, src, cfg)
		const nudged = await nudge(store, src, cfg)
		// Habit suggestions wait until nothing needs a reply, and are told once (R-HAB-01, review: not a second inbox).
		try {
			const mark = store.probeMark()
			if (!mark.habitsAt || Date.now() - Date.parse(mark.habitsAt) > 3_600_000) { noticeHabits(store, cfg); store.saveProbeMark({ ...store.probeMark(), habitsAt: new Date().toISOString() }) }
			const h = store.habits().find(x => x.state === 'suggested' && !x.told)
			if (h && !store.workflows().some(w => w.state === 'needs_human')) {
				await say(store, src, `${MARK} Suggestion ${h.code}: ${h.text} Say "ok ${h.code}" to turn it on, "skip ${h.code}" for not now, "never ${h.code}", or "more ${h.code}" for the evidence.`)
				store.saveHabits(store.habits().map(x => (x.code === h.code ? { ...x, told: true } : x)))
			}
		} catch (e) { store.log({ event: 'habits-failed', error: String(e).slice(0, 300) }) }
		try { await daily(store, src, cfg) } catch (e) { store.log({ event: 'daily-failed', error: String(e).slice(0, 300) }) }
		const up = untold()
		if (up) {
			store.log({ event: up.rolledBack ? 'update-rolled-back' : 'updated', ...up })
			await say(store, src, up.rolledBack ? `${MARK} A new version (${up.to}: ${up.subject}) did not start on ${store.machine}, so it stayed on ${up.from}. ${up.rolledBack}` : `${MARK} Updated ${store.machine} to ${up.to}: ${up.subject}. Open the page again to see page changes.`)
		}
		const r = { commands, answers, asks, runs, nudged, ms: Date.now() - t0 }
		const busy = store.workflows().some(w => w.state === 'scheduled') || store.jobs().some(j => j.state === 'running' || j.state === 'queued' && !(j.retry && (Date.parse(j.retry.at) > Date.now() || store.control().paused || store.control().stopped))) || store.openWindows().length > 0
		reschedule(store, cfg, commands + answers + asks + missed + probed + due.length + runs + autoSent + handedBack + jobsEarly + jobsDone + jobsStarted + jobsNow + jobsLate > 0 || nudged || busy, t0)
		writeSnapshot(store)
		store.log({ event: 'tick', ...r })
		return r
	} finally {
		// Every cycle that ran, even stopped or with Teams down, stamps where each item now stands for the new page (N1b).
		try { stampPlaces(store) } catch (e) { store.log({ event: 'place-failed', error: String(e).slice(0, 300) }) }
		// Any cycle that ran, even stopped or with Teams down, shows this machine was awake, unless it slept during the cycle.
		const now = new Date(), awakeMs = mono() - p0, c = store.chats()
		const slept = now.getTime() - t0 - awakeMs > 10 * 60_000 && !c.notice ? offNotice(new Date(t0 + awakeMs).toISOString(), now, store.machine, cfg.tz) : undefined
		store.saveChats({ ...c, endAt: now.toISOString(), ...(slept ? { notice: slept } : {}) })
		await src.close()
	}
}

// Latency (a, c): the scheduled runner stays up after its first pass, until shortly before the next one starts, and ticks again
// within a second or two when an answer or a check is asked for, a job's process ends, or the next check falls due. The OS starts a
// runner every minute and the tick lock keeps one at a time, so an approval no longer waits for the next minute, and a 30 s poll can happen.
export type Wake = 'kick' | 'answer' | 'job' | 'due'
export function wakeFor(store: Store, procs: Procs = realProcs, now = new Date()): Wake | undefined {
	if (store.kickedAt() > (store.lease()?.at ?? '')) return 'kick'
	if ((store.answers().length > 0 || store.missed().length > 0) && !store.schedule().backoff && !store.health().source) return 'answer'
	if (store.jobs().some(j => j.state === 'running' && !!j.run && j.run.pid > 0 && !j.run.relay && j.run.machine === store.machine && !procs.alive(j.run.pid))) return 'job'
	if (isDue(store.schedule(), now)) return 'due'
	return undefined
}
export const residentMs = () => { const s = Number(process.env.DELEGATE_RESIDENT_SEC ?? 50); return Number.isFinite(s) && s > 0 ? s * 1000 : 0 }
export async function stayAwake(store: Store, until: number, deps: Parameters<typeof tick>[1] = {}, everyMs = 1000): Promise<number> {
	let ticks = 0
	while (Date.now() + everyMs < until) {
		await new Promise(r => setTimeout(r, everyMs))
		const why = wakeFor(store, deps.procs ?? realProcs)
		if (!why) continue
		store.log({ event: 'resident-wake', why })
		await tick(store, { ...deps, force: why === 'job' })
		ticks++
	}
	return ticks
}

// Activity opens a fast window, so replies to replies are seen within a minute (dev-spec/runner.md#schedule).
// The cadence is anchored to when the tick started, so a slow worker never skips the next minute.
function reschedule(store: Store, cfg: Config, activity: boolean, startedMs: number) {
	const s = plan(store.schedule(), new Date(startedMs), cfg.poll ?? DEFAULT_POLL, activity, cfg.tz)
	// A reminder is due at its minute, not at the next idle poll.
	// So is a retry: "again in 2 minutes" means 2 minutes.
	const due = [...store.automations().filter(a => a.state === 'active' && a.next).map(a => a.next!), ...store.jobs().filter(j => j.retry && j.state === 'queued' && Date.parse(j.retry.at) > Date.now()).map(j => j.retry!.at)].sort()[0]
	store.saveSchedule(due && s.nextAt && due < s.nextAt ? { ...s, nextAt: due } : s)
}

// Health reflects the cap after every run admitted this tick (final review P2-2).
export function capHealth(store: Store, cfg: Config) {
	const cap = cfg.dailyRuns ?? 200
	store.setHealth('runs', store.runsToday() >= cap ? `Reached today's limit of ${cap} AI runs. New asks wait until tomorrow; raise dailyRuns in config.json to change it.` : undefined)
}

// Throttling backs off 2, 4, 8, then 15 minutes, and resets after a good read (R-ING-06).
function backoff(store: Store): number {
	return Math.min(15, (store.schedule().backoff ?? 1) * 2)
}
