import { cliServers, clientFor, LostResponse, toolServers } from '../adapters/mcp-client.ts'
import { NAME } from '../brand.ts'
import { isInternal, isVote, OLD_INVITE, pendingEffects, prIdOf, refusal, sameHead, toolShape, voteValue } from '../core/effects.ts'
import { pageDigest } from '../core/page-approval.ts'
import type { CallRec, Config, Effect, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { parentsOf, stillApproved } from './jobs.ts'
import { deployMoved, prMoved, prOf, prTarget, sameVote, type BuildProbe } from './probe.ts'
import { MAY_REVIEW, roleOn, roleWhy } from './review-gate.ts'
import { isDeploy } from '../core/deploy.ts'
import { callKey, ledgerRec, madeBefore } from './ledger.ts'
import { staleCatalog } from './catalog.ts'
import { reviewPostCheck } from './review-autonomy.ts'
import { scrubDeep } from '../core/secrets.ts'
import { runInternalEffect } from './internal-effects.ts'
import { step } from './work.ts'
export { madeBefore }

export type InternalReceipt = { wfId: string; at: string; items: { index: number; key: string }[] }
const consumedInternalReceipts = new WeakSet<InternalReceipt>()
const internalKey = ({ done, error, ...identity }: Effect): string => pageDigest(identity)

// HOST takes this only where the owner's approval has just been verified.
export function internalReceipt(wf: Workflow): InternalReceipt {
	return { wfId: wf.id, at: wf.approved?.at ?? wf.updatedAt,
		items: wf.approved?.byRule ? [] : (wf.effects ?? []).flatMap((effect, index) =>
			isInternal(effect) && pendingEffects([effect]).length ? [{ index, key: internalKey(effect) }] : []) }
}

// HOST calls only after a successful send (or the approved no-reply rest), then commits.
export async function makeInternalChanges(store: Store, wf: Workflow, receipt: InternalReceipt): Promise<void> {
	if (receipt.wfId !== wf.id || consumedInternalReceipts.has(receipt)) {
		store.log({ event: 'internal-effects-skipped', code: wf.code, why: receipt.wfId !== wf.id ? 'wrong-item' : 'receipt-consumed' })
		return
	}
	consumedInternalReceipts.add(receipt)
	for (const item of receipt.items) {
		const effects = wf.effects, effect = effects?.[item.index]
		if (!effect || !isInternal(effect) || !pendingEffects([effect]).length || internalKey(effect) !== item.key) {
			store.log({ event: 'internal-effects-skipped', code: wf.code, index: item.index, why: 'effect-changed' })
			continue
		}
		let result: Awaited<ReturnType<typeof runInternalEffect>>
		if (effect.maybe) result = { ok: false, error: 'This change may have been made already. Check it before approving it again.' }
		else {
			try { result = await runInternalEffect(store, wf, effect) }
			catch (error) { result = { ok: false, error: String(error).slice(0, 300) } }
		}
		// Check-back ends the sent turn; keep its actual change receipt for HOST's commit.
		if (!wf.effects) wf.effects = effects
		const at = new Date().toISOString(), summary = effect.summary.replace(/[.\s]+$/, '')
		if (result.ok) {
			effect.done = { ref: result.ref, at }
			effect.error = undefined
			step(wf, `Made: ${summary}${result.ref && result.ref !== 'done' ? ` (${result.ref})` : ''}`, { at, ref: `internal:${receipt.at}:${item.index}:${item.key}` })
		} else {
			effect.error = result.error
			step(wf, `Not made: ${summary} (${result.error.replace(/^Error: /, '').replace(/\.$/, '')})`, { at, ref: `internal:${receipt.at}:${item.index}:${item.key}` })
		}
	}
}

// Calls one tool on one of the owner's tool servers.
export type Caller = (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>

function changeRefusal(store: Store, cfg: Config, wf: Workflow, effect: Effect): string | undefined {
	const id = prIdOf(effect.call)
	const unit = wf.prs?.find(unit => unit.id === id && unit.ref)
	const why = refusal(cfg, effect, wf.prs === undefined || id === undefined ? prTarget(store, wf) : unit?.id)
	if (why) return why
	if (wf.prs !== undefined && isVote(effect.call)) {
		if (!unit?.role || !MAY_REVIEW.includes(unit.role)) return `you are not an eligible reviewer on PR ${prIdOf(effect.call)}`
		const completed = unit.review?.completed
		if (!completed?.verified || !sameHead(completed.head, unit.head) || !sameHead(completed.head, effect.head))
			return `PR ${unit.id} needs a verified review at the commit being approved`
	}
	return undefined
}

// The change run's only write: one approved change, exactly as approved, through the owner's own tool server (next action, R-HIL-21).
// "calling" is recorded before the call and the result after, so a run that dies mid-call is never taken for one that did nothing.
// probe: the PR read; a vote reads its PR again right before the call (review 10-21 P1-3).
export async function makeChange(store: Store, jobId: string, runId: string, index: number, call: Caller, probe?: BuildProbe): Promise<{ ref?: string; error?: string }> {
	const job = store.job(jobId), e = job?.result?.effects[index]
	if (!job || !e) return { error: `There is no change ${index}.` }
	if (isInternal(e)) return { error: `Change ${index} is made by ${NAME} after the reply is sent, not by the change run.` }
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
	const why = changeRefusal(store, cfg, owner, e)
	if (why) {
		const error = `Change ${index} cannot be made: ${why}.`
		// An old invite that cannot be converted is recorded, so the item offers a new draft instead of a retry that cannot work.
		if (job.byRule || why.startsWith(OLD_INVITE)) store.saveChange(jobId, runId, index, { call: JSON.stringify(e.call), state: 'failed', error, at: new Date().toISOString() })
		return { error }
	}
	const key = JSON.stringify(e.call), at = () => new Date().toISOString()
	// A server that is not there, or cannot be started from here, is a reason the item shows (review 10-21b P1, P2-2).
	const to = serverOf(cfg, e.call!.tool), spec = to && toolServers(cfg)[to[0]], cli = cliServers(cfg.agent.flavor)
	const unusable = !to ? `No tool server is set up for ${e.call!.tool}${cli.error ? `: ${cli.path} could not be read (${cli.error})` : ''}.`
		: !spec?.command ? `The ${to[0]} tool server is remote (${spec?.type ?? 'http'}); ${NAME} cannot call it yet.` : undefined
	if (unusable) { store.saveChange(jobId, runId, index, { call: key, state: 'failed', error: unusable, at: at() }); return { error: unusable } }
	// Changes approved together were written assuming each other (a comment that says "this approval is for …"): when a vote in the
	// batch cannot be cast now, nothing else in it is made either, and the owner sees why (queue-new #7B, A50).
	if (!isVote(e.call)) {
		const blocked = await batchVoteBlocked(store, job, runId, owner, probe)
		if (blocked) {
			const error = `Not made: it was approved together with "${blocked.summary}", which cannot be made (${blocked.error.replace(/\.$/, '')}).`
			store.saveChange(jobId, runId, index, { call: key, state: 'failed', error, at: at() })
			return { error }
		}
	}
	// The ledger: a call made in any run is never made again, whatever the lists say (review 10-21e P1). A vote is a state, so the
	// PR read right before it decides instead: one the PR shows is never cast, and one reset by hand is cast again (re-review P2-4).
	const made = isVote(e.call) ? undefined : madeBefore(store, e)
	if (made) { store.saveChange(jobId, runId, index, { call: JSON.stringify(e.call), state: 'done', ref: made.ref, at: made.at, ...(job.byRule ? { skipped: true as const } : {}) }); return { ref: made.ref } }
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
	if (job.byRule) {
		const check = await reviewPostCheck(store, job, e, call, probe)
		if (check.error) {
			store.saveChange(jobId, runId, index, { call: key, state: 'failed', error: check.error, at: at() })
			return { error: check.error }
		}
		if (check.duplicate) {
			store.saveChange(jobId, runId, index, { call: key, state: 'done', ref: 'Already covered on the PR', skipped: true, at: at() })
			return { ref: 'Already covered on the PR' }
		}
	}
	const ledger = (r: Omit<CallRec, 'call' | 'head' | 'vote' | 'at'>) => store.saveCallRec(ledgerRec(e, r))
	store.saveChange(jobId, runId, index, { call: key, state: 'calling', at: at() }); ledger({ state: 'calling' })
	try {
		const r = await call(to![0], to![1], scrubDeep(toolShape(e.call)!.args)) as { id?: unknown } | undefined
		const pr = job.byRule ? owner.prs === undefined ? prOf(store, owner) : owner.prs.find(unit => unit.id === prIdOf(e.call))?.ref : undefined
		const ref = pr?.url && r?.id !== undefined ? `${pr.url}?discussionId=${encodeURIComponent(String(r.id))}` : String(r?.id ?? 'done')
		store.saveChange(jobId, runId, index, { call: key, state: 'done', ref, at: at(), ...(job.byRule ? { byRule: job.byRule, severity: e.severity } : {}) }); ledger({ state: 'done', ref })
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

// The first vote in a change run's batch that cannot be cast now, read once per vote and recorded, so its own call refuses the same.
async function batchVoteBlocked(store: Store, job: NonNullable<ReturnType<Store['job']>>, runId: string, owner: Workflow, probe?: BuildProbe): Promise<{ summary: string; error: string } | undefined> {
	const effects = job.result?.effects ?? []
	for (const [i, v] of effects.entries()) {
		if (!pendingEffects([v]).length || !isVote(v.call)) continue
		const had = store.changes(job.id, runId)[i]
		if (had?.state === 'failed') return { summary: v.summary, error: had.error ?? 'it failed' }
		if (had) continue
		const why = changeRefusal(store, store.config(), owner, v)
		const moved = why ? { error: why } : await voteMoved(store, owner, v, probe)
		if (moved && 'error' in moved) {
			store.saveChange(job.id, runId, i, { call: JSON.stringify(v.call), state: 'failed', error: moved.error, at: new Date().toISOString(), ...(moved.stale ? { stale: true as const } : {}) })
			store.log({ event: 'batch-vote-blocked', job: job.id, index: i, error: moved.error.slice(0, 200) })
			return { summary: v.summary, error: moved.error }
		}
	}
	return undefined
}

// The PR as it is right before the vote: still active, at the commit reviewed, and what the owner was shown about it.
// A PR that cannot be read gets no vote; one that changed asks the owner to review again (stale).
// cast: the owner's vote there already says this one, so it is not cast again.
async function voteMoved(store: Store, wf: Workflow, e: Effect, probe?: BuildProbe): Promise<{ error: string; stale?: boolean } | { cast: true } | undefined> {
	const c = e.call!, ref = wf.prs === undefined ? prOf(store, wf) ?? { project: String(c.args.project ?? ''), repo: String(c.args.repositoryId ?? ''), id: prIdOf(c)! }
		: wf.prs.find(unit => unit.id === prIdOf(c))?.ref
	if (!ref) return { error: `PR ${prIdOf(c)} is not a referenced PR in this item.` }
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
		// A tool the server no longer has: its list is read again before the next run is given tools (#17).
		if (bad?.includes('has no tool')) staleCatalog(server)
		if (bad) throw new Error(bad)
		return await mcp.call(tool, args)
	} finally { await mcp.close().catch(() => undefined) }
}
