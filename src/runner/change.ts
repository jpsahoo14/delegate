import { cliServers, clientFor, toolServers } from '../adapters/mcp-client.ts'
import { NAME } from '../brand.ts'
import { isVote, pendingEffects, prIdOf, refusal } from '../core/effects.ts'
import type { CallRec, Config, Effect, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { parentsOf, stillApproved } from './jobs.ts'
import { deployMoved, prMoved, prOf, prTarget, type BuildProbe } from './probe.ts'
import { isDeploy } from '../core/deploy.ts'
import { callKey, madeBefore } from './ledger.ts'
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
	if (why) return { error: `Change ${index} cannot be made: ${why}.` }
	const key = JSON.stringify(e.call), at = () => new Date().toISOString()
	// A server that is not there, or cannot be started from here, is a reason the item shows (review 10-21b P1, P2-2).
	const to = serverOf(cfg, e.call!.tool), spec = to && toolServers(cfg)[to[0]], cli = cliServers(cfg.agent.flavor)
	const unusable = !to ? `No tool server is set up for ${e.call!.tool}${cli.error ? `: ${cli.path} could not be read (${cli.error})` : ''}.`
		: !spec?.command ? `The ${to[0]} tool server is remote (${spec?.type ?? 'http'}); ${NAME} cannot call it yet.` : undefined
	if (unusable) { store.saveChange(jobId, runId, index, { call: key, state: 'failed', error: unusable, at: at() }); return { error: unusable } }
	// The ledger: a call made in any run is never made again, whatever the lists say (review 10-21e P1).
	const made = madeBefore(store, e)
	if (made) { store.saveChange(jobId, runId, index, { call: JSON.stringify(e.call), state: 'done', ref: made.ref, at: made.at }); return { ref: made.ref } }
	const open = store.callRec(callKey(e.call!))
	if (open?.state === 'calling' && !isVote(e.call)) return { error: `Change ${index} may have been made already: an earlier call has no answer. The owner must check, then say to make it again.` }
	// A deploy reads its ring and PR again right before the call, as a vote reads its PR (owned work).
	const moved = isVote(e.call) ? await voteMoved(store, owner, e, probe) : isDeploy(e.call) ? await deployMoved(store, owner, e, probe).then(error => (error ? { error, stale: undefined } : undefined)) : undefined
	if (moved) { store.saveChange(jobId, runId, index, { call: key, state: 'failed', error: moved.error, at: at(), ...(moved.stale ? { stale: true as const } : {}) }); return { error: moved.error } }
	const ledger = (r: Omit<CallRec, 'call' | 'head' | 'at'>) => store.saveCallRec({ call: callKey(e.call!), head: e.head, at: at(), ...r })
	store.saveChange(jobId, runId, index, { call: key, state: 'calling', at: at() }); ledger({ state: 'calling' })
	try {
		const r = await call(to![0], to![1], e.call!.args) as { id?: unknown } | undefined
		const ref = String(r?.id ?? 'done')
		store.saveChange(jobId, runId, index, { call: key, state: 'done', ref, at: at() }); ledger({ state: 'done', ref })
		return { ref }
	} catch (err) {
		const error = String(err).slice(0, 300)
		store.saveChange(jobId, runId, index, { call: key, state: 'failed', error, at: at() }); ledger({ state: 'failed', error })
		return { error }
	}
}

// The PR as it is right before the vote: still active, at the commit reviewed, and what the owner was shown about it.
// A PR that cannot be read gets no vote; one that changed asks the owner to review again (stale).
async function voteMoved(store: Store, wf: Workflow, e: Effect, probe?: BuildProbe): Promise<{ error: string; stale?: boolean } | undefined> {
	const c = e.call!, ref = prOf(store, wf) ?? { project: String(c.args.project ?? ''), repo: String(c.args.repositoryId ?? ''), id: prIdOf(c)! }
	if (!probe?.pr) return { error: `PR ${ref.id} could not be read right before the vote: no Azure DevOps server is set up.` }
	try {
		const why = prMoved(await probe.pr(ref.project, ref.repo, ref.id), e)
		return why.length ? { error: `PR ${ref.id} changed since your review (${why.join(', ')}).`, stale: true } : undefined
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
	try { return await mcp.call(tool, args) } finally { await mcp.close().catch(() => undefined) }
}
