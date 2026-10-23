import { cliServers, clientFor, LostResponse, toolServers } from '../adapters/mcp-client.ts'
import { NAME } from '../brand.ts'
import { isVote, OLD_INVITE, pendingEffects, prIdOf, refusal, toolShape, voteValue } from '../core/effects.ts'
import type { CallRec, Config, Effect, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { parentsOf, stillApproved } from './jobs.ts'
import { deployMoved, prMoved, prOf, prTarget, sameVote, type BuildProbe } from './probe.ts'
import { MAY_REVIEW, roleOn, roleWhy } from './review-gate.ts'
import { isDeploy } from '../core/deploy.ts'
import { callKey, ledgerRec, madeBefore } from './ledger.ts'
export { madeBefore }

// Calls one tool on one of the owner's tool servers.
export type Caller = (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>

// The change run's only write: one approved change, exactly as approved, through the owner's own tool server (next action, R-HIL-21).
// "calling" is recorded before the call and the result after, so a run that dies mid-call is never taken for one that did nothing.
// probe: the PR read; a vote reads its PR again right before the call (review 10-21 P1-3).
export async function makeChange(store: Store, jobId: string, runId: string, index: number, call: Caller, probe?: BuildProbe): Promise<{ ref?: string; error?: string }> {
	const job = store.job(jobId), e = job?.result?.effects[index]
	if (!job || !e) return { error: `There is no change ${index}.` }
	if (e.done) return { ref: e.done.ref }
	const had = store.changes(jobId, runId)[index]
	if (had?.state === 'done') return { ref: had.ref }
	if (had?.state === 'failed') return { error: had.error }
	// A call still without an answer may land yet: never sent twice (review 10-21 P2-6).
	if (had?.state === 'calling') return { error: `Change ${index} may have been made already: its call has no answer yet, so it is not repeated.` }
	// One that may have been made in an earlier run waits until the owner says to make it again (P2-7).
	if (e.maybe) return { error: `Change ${index} may have been made already. The owner must check, then say to make it again.` }
	// The item whose ok covers this change: its PR is the one checked, whatever the order of the job's items (review 10-21b P2-4).
	const owner = parentsOf(store, job).find(p => stillApproved(p, job))
	if (!pendingEffects([e]).length || !owner) return { error: `Change ${index} was not approved by the owner.` }
	const cfg = store.config()
	const why = refusal(cfg, e, prTarget(store, owner))
	if (why) {
		const error = `Change ${index} cannot be made: ${why}.`
		// An old invite that cannot be converted is recorded, so the item offers a new draft instead of a retry that cannot work.
		if (why.startsWith(OLD_INVITE)) store.saveChange(jobId, runId, index, { call: JSON.stringify(e.call), state: 'failed', error, at: new Date().toISOString() })
		return { error }
	}
	const key = JSON.stringify(e.call), at = () => new Date().toISOString()
	// A server that is not there, or cannot be started from here, is a reason the item shows (review 10-21b P1, P2-2).
	const to = serverOf(cfg, e.call!.tool), spec = to && toolServers(cfg)[to[0]], cli = cliServers(cfg.agent.flavor)
	const unusable = !to ? `No tool server is set up for ${e.call!.tool}${cli.error ? `: ${cli.path} could not be read (${cli.error})` : ''}.`
		: !spec?.command ? `The ${to[0]} tool server is remote (${spec?.type ?? 'http'}); ${NAME} cannot call it yet.` : undefined
	if (unusable) { store.saveChange(jobId, runId, index, { call: key, state: 'failed', error: unusable, at: at() }); return { error: unusable } }
	// The ledger: a call made in any run is never made again, whatever the lists say (review 10-21e P1). A vote is a state, so the
	// PR read right before it decides instead: one the PR shows is never cast, and one reset by hand is cast again (re-review P2-4).
	const made = isVote(e.call) ? undefined : madeBefore(store, e)
	if (made) { store.saveChange(jobId, runId, index, { call: JSON.stringify(e.call), state: 'done', ref: made.ref, at: made.at }); return { ref: made.ref } }
	const open = store.callRec(callKey(e.call!))
	// Recorded in this run too, so the item shows it as may have been made and the owner's "again" can clear it.
	if (open?.state === 'calling' && !isVote(e.call)) { store.saveChange(jobId, runId, index, { call: key, state: 'calling', at: open.at }); return { error: `Change ${index} may have been made already: an earlier call has no answer. The owner must check, then say to make it again.` } }
	// A deploy reads its ring and PR again right before the call, as a vote reads its PR (owned work).
	const moved = isVote(e.call) ? await voteMoved(store, owner, e, probe) : isDeploy(e.call) ? await deployMoved(store, owner, e, probe).then(error => (error ? { error, stale: undefined } : undefined)) : undefined
	if (moved && 'cast' in moved) {
		const ref = 'already on the PR'
		store.saveChange(jobId, runId, index, { call: key, state: 'done', ref, at: at() })
		return { ref }
	}
	if (moved) { store.saveChange(jobId, runId, index, { call: key, state: 'failed', error: moved.error, at: at(), ...(moved.stale ? { stale: true as const } : {}) }); return { error: moved.error } }
	const ledger = (r: Omit<CallRec, 'call' | 'head' | 'vote' | 'at'>) => store.saveCallRec(ledgerRec(e, r))
	store.saveChange(jobId, runId, index, { call: key, state: 'calling', at: at() }); ledger({ state: 'calling' })
	try {
		const r = await call(to![0], to![1], toolShape(e.call)!.args) as { id?: unknown } | undefined
		const ref = String(r?.id ?? 'done')
		store.saveChange(jobId, runId, index, { call: key, state: 'done', ref, at: at() }); ledger({ state: 'done', ref })
		return { ref }
	} catch (err) {
		// The answer was lost after the call went out: never repeated, never taken as failed. A vote is a state, so the PR read
		// decides; anything else stays "may have been made" for the owner to check (bug 10-23 R4, as E32).
		if (err instanceof LostResponse) {
			const read = isVote(e.call) ? await voteMoved(store, owner, e, probe) : undefined
			if (read && 'cast' in read) { const ref = 'already on the PR'; store.saveChange(jobId, runId, index, { call: key, state: 'done', ref, at: at() }); ledger({ state: 'done', ref }); return { ref } }
			store.log({ event: 'change-uncertain', jobId, index, tool: e.call!.tool, error: err.message.slice(0, 300) })
			return { error: `Change ${index} may have been made already: its answer was lost, so it is not repeated. Check it, then say to make it again.` }
		}
		const error = String(err).slice(0, 300)
		store.saveChange(jobId, runId, index, { call: key, state: 'failed', error, at: at() }); ledger({ state: 'failed', error })
		return { error }
	}
}

// The PR as it is right before the vote: still active, at the commit reviewed, and what the owner was shown about it.
// A PR that cannot be read gets no vote; one that changed asks the owner to review again (stale).
// cast: the owner's vote there already says this one, so it is not cast again.
async function voteMoved(store: Store, wf: Workflow, e: Effect, probe?: BuildProbe): Promise<{ error: string; stale?: boolean } | { cast: true } | undefined> {
	const c = e.call!, ref = prOf(store, wf) ?? { project: String(c.args.project ?? ''), repo: String(c.args.repositoryId ?? ''), id: prIdOf(c)! }
	if (!probe?.pr) return { error: `PR ${ref.id} could not be read right before the vote: no Azure DevOps server is set up.` }
	try {
		const st = await probe.pr(ref.project, ref.repo, ref.id), why = prMoved(st, e)
		if (why.length) return { error: `PR ${ref.id} changed since your review (${why.join(', ')}).`, stale: true }
		const me = store.config().owner.name.trim().toLowerCase(), mine = st.votes.filter(v => v.name.trim().toLowerCase() === me)
		// An unset name matches no one: a vote the owner approved is never skipped for someone else's (re-review 3c P2-a).
		if (me && mine.length === 1 && sameVote(mine[0].vote, voteValue(c))) return { cast: true }
		// The last backstop of the review gate (G7): a vote by someone who is not a reviewer would add him to the PR.
		const role = await roleOn(store.config(), probe, ref, st)
		return MAY_REVIEW.includes(role) ? undefined : { error: `No vote was cast on PR ${ref.id}: ${roleWhy(store.config(), role)}.` }
	} catch (err) { return { error: `Could not read PR ${ref.id} right before the vote (${String(err).slice(0, 120)}).` } }
}

// "ado-repo_pull_request_write" is tool "repo_pull_request_write" on the owner's server "ado"; the longest server name wins.
// The servers are the ones setup saved, else the ones the AI CLI starts itself (review 10-21 P1-2).
export function serverOf(cfg: Config, tool: string): [string, string] | undefined {
	const s = Object.keys(toolServers(cfg)).filter(n => tool.startsWith(`${n}-`)).sort((a, b) => b.length - a.length)[0]
	return s ? [s, tool.slice(s.length + 1)] : undefined
}

// The owner's own tool server, started as setup saved it, as the PR check starts it.
export const mcpCaller = (cfg: Config): Caller => async (server, tool, args) => {
	const s = toolServers(cfg)[server]
	if (!s?.command) throw new Error(s ? `The ${server} tool server is remote (${s.type ?? 'http'}); ${NAME} cannot call it yet.` : `No command for the ${server} tool server`)
	const mcp = clientFor({ ...s, command: s.command })
	try {
		const bad = await mcp.argsProblem(tool, args)
		if (bad) throw new Error(bad)
		return await mcp.call(tool, args)
	} finally { await mcp.close().catch(() => undefined) }
}
