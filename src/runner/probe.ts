import type { BuildFacts, Config, Effect, PrFacts, RingFacts, RunFact, Workflow } from '../core/types.ts'
import { buildCheck, buildOf, deployLine, isDeploy, pipelineOf, ringMeaning, ringMoved, targetOf } from '../core/deploy.ts'
import { remoteOf } from './repos.ts'
import { isVote, pendingEffects, prIdOf, reviewAgain, sameHead, voteValue } from '../core/effects.ts'
import { effectLine } from '../core/render.ts'
import type { Store } from '../store/state.ts'
import { clientFor, toolServers } from '../adapters/mcp-client.ts'
import { NAME } from '../brand.ts'
import { active, approvalAsk, approvalMention, approvalReplyMatches, canCloseApproval, homeOf, linksIn, newTurn, pendingParts, reReviewAsk, statusOf, step, wake } from './work.ts'
import { closeFamily } from './apply.ts'
import { realProcs } from './jobs.ts'
import { close } from './intake.ts'
import { stopWatch } from './track.ts'
import { addMeEffect, isAddMe, liveOwnerVote, MAY_REVIEW, groupQuestion, reviewerGroups, roleOn, roleWhy, unknownGroups } from './review-gate.ts'
import { freshRead } from '../store/fs.ts'
import { recordCommit } from './commit.ts'
import { stateFields, statusFields } from '../core/upgrades.ts'

// Checklist steps that wait on a build are checked by the runner, not the AI (R-WRK-13).
// branch, version, repo: where the build is from, for a deploy's build check (review 10-21 P1-3).
export type BuildState = { status: string; result?: string; branch?: string; version?: string; repo?: string }
// head: the newest commit; required: required reviewers; autoComplete: an approval may complete it.
// branch: the PR's source branch, so a machine with several clones picks the one on it (owned work).
// merge: the PR's merge commit, which its PR builds are from; repo, repoId: its repository (review 10-21 P1-3).
export type PrState = { status: string; closedAt?: string; votes: { name: string; vote: number }[]; head?: string; title?: string; author?: string; required?: string[]; autoComplete?: boolean; branch?: string; merge?: string; repo?: string; repoId?: string
	// Every reviewer as Azure DevOps lists them, and the author's sign-in name, for the review gate (owner rule 10-23).
	reviewers?: Reviewer[]; authorUnique?: string }
export type Reviewer = { name: string; unique?: string; vote: number; required: boolean; group: boolean; declined: boolean }
// runs: a pipeline's newest runs, newest first, for the ring table and the overwrite check (owned work).
// myTeams: the teams the owner is a member of in a project, so a team reviewer can count as the owner (review gate).
export type BuildProbe = { builds(project: string, ids: number[]): Promise<Map<number, BuildState>>; pr?(project: string, repo: string, id: number): Promise<PrState>; runs?(project: string, pipelineId: number): Promise<RunFact[]>; definition?(project: string, id: number): Promise<{ name: string; path?: string } | undefined>; myTeams?(project: string): Promise<string[]>; close?(): Promise<void> }

const EVERY_MS = 10 * 60_000

// The owner's Azure DevOps tool server, read only: pipelines_build with action "list" and buildIds.
export function adoProbe(cfg: Config): BuildProbe | undefined {
	const s = toolServers(cfg).ado
	if (!s?.command) return undefined
	const mcp = clientFor({ ...s, command: s.command })
	return {
		async builds(project, ids) {
			const r = await mcp.call<{ items?: { id: number; status?: string; result?: string; sourceBranch?: string; sourceVersion?: string; repository?: { name?: string; id?: string } }[] }>('pipelines_build', { action: 'list', project, buildIds: ids })
			return new Map((r.items ?? []).map(b => [b.id, { status: String(b.status ?? 'unknown'), result: b.result ? String(b.result) : undefined, ...(b.sourceBranch ? { branch: String(b.sourceBranch) } : {}), ...(b.sourceVersion ? { version: String(b.sourceVersion) } : {}), ...(b.repository?.name ?? b.repository?.id ? { repo: String(b.repository.name ?? b.repository.id) } : {}) }]))
		},
		async pr(project, repo, id) {
			type Rev = { displayName?: string; uniqueName?: string; vote?: number; isRequired?: boolean; isContainer?: boolean; hasDeclined?: boolean }
			const r = await mcp.call<{ status?: string; closedDate?: string; title?: string; createdBy?: { displayName?: string; uniqueName?: string }; autoCompleteSetBy?: unknown; lastMergeSourceCommit?: { commitId?: string }; sourceRefName?: string; lastMergeCommit?: { commitId?: string }; repository?: { name?: string; id?: string }; reviewers?: Rev[] }>('repo_pull_request', { action: 'get', project, repositoryId: repo, pullRequestId: id })
			const reviewers = r.reviewers ?? []
			return {
				status: String(r.status ?? 'unknown'), ...(r.closedDate ? { closedAt: String(r.closedDate) } : {}), votes: reviewers.map(v => ({ name: String(v.displayName ?? ''), vote: Number(v.vote ?? 0) })),
				head: r.lastMergeSourceCommit?.commitId, title: r.title, author: r.createdBy?.displayName, required: reviewers.filter(v => v.isRequired).map(v => String(v.displayName ?? '')), autoComplete: !!r.autoCompleteSetBy,
				...(r.sourceRefName ? { branch: String(r.sourceRefName) } : {}), ...(r.lastMergeCommit?.commitId ? { merge: r.lastMergeCommit.commitId } : {}),
				...(r.repository?.name ? { repo: r.repository.name } : {}), ...(r.repository?.id ? { repoId: r.repository.id } : {}),
				reviewers: reviewers.map(v => ({ name: String(v.displayName ?? ''), ...(v.uniqueName ? { unique: String(v.uniqueName) } : {}), vote: Number(v.vote ?? 0), required: !!v.isRequired, group: !!v.isContainer, declined: !!v.hasDeclined })),
				...(r.createdBy?.uniqueName ? { authorUnique: String(r.createdBy.uniqueName) } : {}),
			}
		},
		async myTeams(project) {
			const r = await mcp.call<unknown>('core_list_project_teams', { project, mine: true, top: 200 })
			const list = Array.isArray(r) ? r : (r as { value?: unknown[]; items?: unknown[] }).value ?? (r as { items?: unknown[] }).items ?? []
			return list.map(t => String((t as { name?: string }).name ?? '')).filter(Boolean)
		},
		async runs(project, pipelineId) {
			// The owner's server lists the starter flat, in requestedForDisplayName (dry run 10-21); the REST shape nests it.
			type Run = { id: number; status?: string; result?: string; queueTime?: string; startTime?: string; requestedForDisplayName?: string; requestedFor?: { displayName?: string }; requestedBy?: { displayName?: string } }
			const r = await mcp.call<{ items?: Run[] }>('pipelines_build', { action: 'list', project, definitions: [pipelineId], top: 10, queryOrder: 'QueueTimeDescending' })
			return (r.items ?? []).map(b => ({ id: b.id, by: String(b.requestedForDisplayName ?? b.requestedFor?.displayName ?? b.requestedBy?.displayName ?? ''), at: String(b.queueTime ?? b.startTime ?? ''), status: String(b.status ?? 'unknown'), ...(b.result ? { result: String(b.result) } : {}) })).sort((a, b) => b.id - a.id)
		},
		async definition(project, id) {
			const r = await mcp.call<{ items?: { id: number; name?: string; path?: string }[] }>('pipelines_definition', { action: 'list', project, definitionIds: [id] })
			const d = (r.items ?? []).find(x => x.id === id)
			return d?.name ? { name: String(d.name), ...(d.path ? { path: String(d.path) } : {}) } : undefined
		},
		close: () => mcp.close(),
	}
}

// Every 10 minutes, the open steps with a build are checked in one call per project. A change is a news step on the work,
// added once, and the item where the step happens runs. A failed check changes nothing and says so under Health.
export async function probeBuilds(store: Store, probe: BuildProbe | undefined, now = Date.now()): Promise<number> {
	// A deploy Delegate made keeps its ring watched while the work is open, after its own run finished (owned work).
	const homes = store.workflows().filter(w => active(w) && w.work!.plan?.some(p => p.probe && !p.done || p.ring && !p.ring.over))
	if (!homes.length || !probe) return 0
	const mark = store.probeMark()
	if (mark.checkedAt && now - Date.parse(mark.checkedAt) < EVERY_MS) return 0
	store.saveProbeMark({ ...mark, checkedAt: new Date(now).toISOString() })
	const want = new Map<string, Set<number>>()
	for (const h of homes) for (const p of h.work!.plan!) if (p.probe && !p.done) want.set(p.probe.project, (want.get(p.probe.project) ?? new Set()).add(p.probe.build))
	if (!want.size) want.set('', new Set())
	const seen = new Map<number, BuildState>()
	try {
		for (const [project, ids] of want) if (ids.size) for (const [id, b] of await probe.builds(project, [...ids])) seen.set(id, b)
		store.setHealth('build-check')
		await overwrites(store, homes, probe, now)
	} catch (e) {
		store.setHealth('build-check', `Build checks could not reach Azure DevOps: ${String(e).slice(0, 160)}. Steps keep their last state.`)
		return 0
	}
	let n = 0
	for (const h of homes) {
		let woke: Workflow | undefined
		for (const p of h.work!.plan!) {
			const b = p.probe && !p.done ? seen.get(p.probe.build) : undefined
			if (!b) continue
			const key = `${b.status}${b.result ? `:${b.result}` : ''}`
			if (key === p.seen) continue
			const first = p.seen === undefined
			p.seen = key
			const finished = /completed/i.test(b.status)
			if (finished && /succeeded/i.test(b.result ?? '')) p.done = new Date(now).toISOString()
			// A first look at a build still running is a baseline, not news.
			if (first && !finished) continue
			if (!step(h, `Build ${p.probe!.build} ${finished ? (b.result ?? 'finished').toLowerCase() : b.status.toLowerCase()} (${p.what})`, { ref: `probe:${p.probe!.build}:${key}`, news: true })) continue
			n++
			woke = (p.in && store.byCode(p.in)) || h
		}
		store.save(h)
		if (woke && woke.id !== h.id && woke.partOf === h.id) { wake(woke, `News: ${h.work!.steps.at(-1)!.what}`); store.save(woke) }
		else if (woke) { wake(h, `News: ${h.work!.steps.at(-1)!.what}`); store.save(h) }
	}
	return n
}

// A pull request link in an item: its project, repository, and number (Azure DevOps needs all three to read it).
const PR_LINK = /https?:\/\/(?:[\w-]+\.visualstudio\.com|dev\.azure\.com\/[\w-]+)\/([^/\s]+)\/_git\/([^/\s?#]+)\/pullrequest\/(\d+)/i
// remote: the repo by its remote, from the PR's own link, never the AI's key (owned work).
// url: the PR's own web link, as the item has it.
export type PrRef = { project: string; repo: string; id: number; remote?: string; url?: string }
// The ask's own PR wins over an old job. A pronoun follow-up can use the asker's earlier link, never another sender's PR.
export function prTarget(store: Store, w: Workflow): number | undefined {
	const job = w.job ? store.job(w.job) : undefined
	const inText = (text = '') => linksIn(text).filter(l => l.startsWith('pr:')).map(l => l.slice(3))
	const linked = [...new Set((w.work?.links ?? []).filter(l => /^pr:/i.test(l)).map(l => l.split(/[:/]/).at(-1)))]
	const thread = store.thread(w.id), ask = inText(w.lastAsk), owned = new Set(thread.filter(m => !m.byOwner && w.msgIds.includes(m.id)).flatMap(m => inText(m.text)))
	const prior = inText(thread.filter(m => !m.byOwner && m.from.id === w.asker?.id && inText(m.text).length).at(-1)?.text)
	const effects = [...new Set((w.effects ?? []).filter(e => !e.off && isVote(e.call)).map(e => prIdOf(e.call)).filter((id): id is number => id !== undefined))]
	if (ask.length > 1 || owned.size > 1 || !ask.length && !owned.size && prior.length > 1) return undefined
	return Number(ask[0] ?? [...owned][0] ?? /^pr:.*?(\d+)$/.exec(job?.key ?? '')?.[1] ?? (linked.length === 1 ? linked[0] : undefined) ?? prior[0] ?? (effects.length === 1 ? effects[0] : 0)) || undefined
}

export function prOf(store: Store, w: Workflow): PrRef | undefined {
	const target = prTarget(store, w)
	return target ? prRefFor(store, w, target) : undefined
}
// Every place an item keeps a PR's full link: the ask, the job, work links, the thread, and the draft's and job reply's sources;
// only a link with this number counts, never another PR's (queue-new #6, #12).
export function prRefFor(store: Store, w: Workflow, target: number): PrRef | undefined {
	const job = w.job ? store.job(w.job) : undefined
	const sources = [...(w.draft?.sources ?? []), ...(job?.result?.reply?.sources ?? [])].map(s => s.ref)
	const texts = [w.lastAsk, job?.goal, ...(job?.asks ?? []), ...(w.work?.links ?? []), ...store.thread(w.id).map(m => m.text), ...sources]
	for (const t of texts) for (const m of (t ?? '').matchAll(new RegExp(PR_LINK.source, 'gi'))) if (Number(m[3]) === target) return { project: decodeURIComponent(m[1]), repo: decodeURIComponent(m[2]), id: target, remote: remoteOf(m[0]), url: m[0] }
	const c = (w.effects ?? []).find(e => isVote(e.call) && prIdOf(e.call) === target)?.call
	return c?.args.project && c.args.repositoryId ? { project: String(c.args.project), repo: String(c.args.repositoryId), id: target } : undefined
}
// The PR numbers the ask (and the asker's messages in the item) name, in order.
export function askPrs(store: Store, w: Workflow): number[] {
	const thread = store.thread(w.id).filter(m => !m.byOwner && w.msgIds.includes(m.id)).map(m => m.text)
	return [...new Set([w.lastAsk ?? '', ...thread].flatMap(t => linksIn(t).filter(l => l.startsWith('pr:')).map(l => Number(l.slice(3)))))]
}

const VOTE: Record<string, (id: number) => string> = { '10': id => `approved PR ${id}`, '5': id => `approved PR ${id} with suggestions`, '-5': id => `voted "Waiting for author" on PR ${id}`, '-10': id => `rejected PR ${id}` }
// Items waiting on the owner about a pull request are checked against Azure DevOps every 10 minutes, or at once on Check now:
// a PR completed or abandoned, or the owner's own vote there, takes the item out of Needs you (dogfood 10-20: A12).
export async function probePRs(store: Store, cfg: Config, probe: BuildProbe | undefined, now = Date.now(), force = false, subjects?: Workflow[]): Promise<number> {
	const commits = new Map((subjects ?? []).map(w => [w, recordCommit(w, () => store.workflow(w.id), store.save.bind(store))]))
	const commitFor = (w: Workflow) => {
		const old = commits.get(w)
		if (old) return old
		const commit = recordCommit(w, () => store.workflow(w.id), store.save.bind(store))
		commits.set(w, commit)
		return commit
	}
	if (!probe?.pr) {
		const unknown = subjects ?? store.workflows().filter(w => w.state !== 'done' && w.prGroups !== undefined)
		for (const w of unknown.filter(w => w.prRead || w.prGroups !== undefined || prRefOf(store, w))) {
			const commit = commitFor(w)
			w.prRead = undefined; w.prUnknown = true; w.prGroups = undefined; commit(false)
		}
		return 0
	}
	const mark = store.probeMark()
	const candidates = (subjects ?? store.workflows()).filter(w => w.kind !== 'tracker' && (w.state === 'needs_human' || !!subjects)).map(w => ({ w, ref: prRefOf(store, w) }))
	for (const { w } of candidates.filter(x => !x.ref && x.w.prGroups !== undefined)) {
		const commit = commitFor(w)
		w.prGroups = undefined; commit(false)
	}
	const items = candidates.filter((x): x is { w: Workflow; ref: PrRef } => !!x.ref)
	// A PR change not yet described is read at once, so the owner sees what it means before the ok.
	if (!force && mark.prAt && now - Date.parse(mark.prAt) < EVERY_MS && !items.some(x => prChanges(x.w).some(e => !e.pr))) return 0
	if (!items.length) return 0
	store.saveProbeMark({ ...store.probeMark(), prAt: new Date(now).toISOString() })
	// One read per PR, a few at a time.
	const byPr = new Map<string, PrRef>(items.map(x => [`${x.ref.project}/${x.ref.repo}/${x.ref.id}`, x.ref]))
	const states = new Map<string, PrState | undefined>()
	const keys = [...byPr.keys()]
	for (let i = 0; i < keys.length; i += 4) await Promise.all(keys.slice(i, i + 4).map(async k => {
		const ref = byPr.get(k)!
		try { states.set(k, await probe.pr!(ref.project, ref.repo, ref.id)) } catch (e) { states.set(k, undefined); store.log({ event: 'pr-check-failed', pr: ref.id, error: String(e).slice(0, 200) }) }
	}))
	// An answer the owner gave while the PRs were read is applied next tick; the item is theirs until then.
	const queued = freshRead(() => new Set(store.answers().map(a => a.answer.code)))
	let n = 0
	for (const { w: was, ref } of items) {
		const w = subjects ? was : freshRead(() => store.workflow(was.id))
		if (!w || !subjects && (w.state !== 'needs_human' || queued.has(w.code))) continue
		const commit = commitFor(w)
		const st = states.get(`${ref.project}/${ref.repo}/${ref.id}`)
		// A reply without a status or reviewers says nothing; it never moves an item or its baseline.
		if (!st || !/^(active|completed|abandoned)$/i.test(st.status) || !st.votes.length && !/completed|abandoned/i.test(st.status)) {
			w.prRead = undefined; w.prUnknown = true; w.prRole = undefined; w.prGroups = undefined; commitFor(w)(false)
			continue
		}
		const role = await roleOn(cfg, probe, ref, st)
		commit.refresh()
		if (!subjects && (w.state !== 'needs_human' || freshRead(() => store.answers().some(a => a.answer.code === w.code)))) continue
		w.prRole = role
		w.prGroups = reviewerGroups(st)
		if (st.author) w.prAuthor = st.author
		const mine = liveOwnerVote(cfg, st), jobId = w.job, job = jobId ? freshRead(() => store.job(jobId)) : undefined
		const compoundAsk = /\b(?:and|then|also|after|before|plus)\b|[;&]/i.test(w.lastAsk ?? '')
		const standaloneReview = w.intent === 'pr_review' && !w.partOf && !pendingParts(store, w) && (!compoundAsk || canCloseApproval(store, w))
		const ownerItem = standaloneReview && w.state === 'needs_human' && !w.pending.length && job?.state !== 'running' && job?.state !== 'queued'
		// A close that predates the ask is context, not news.
		const asked = Date.parse(store.thread(w.id).filter(m => !m.byOwner).at(-1)?.at ?? w.createdAt)
		const closedNow = /completed|abandoned/i.test(st.status) && (st.closedAt ? Date.parse(st.closedAt) > asked : w.prStatus !== undefined && !/completed|abandoned/i.test(w.prStatus))
		const voteNews = mine !== undefined && mine !== 0 && w.prVote !== undefined && mine !== w.prVote
		if (ownerItem && (closedNow || voteNews)) {
			const reason = closedNow ? `PR ${ref.id} closed` : mine === 10 ? `You approved PR ${ref.id}`
				: mine === 5 ? `You voted "Approved with suggestions" on PR ${ref.id}`
				: mine === -5 ? `You voted "Waiting for author" on PR ${ref.id}` : `You voted "Rejected" on PR ${ref.id}`
			w.prRead = JSON.stringify([ref.id, st.status, st.head, mine]); w.prReadAt = new Date(now).toISOString()
			w.prUnknown = mine === undefined ? true : undefined; w.prVote = mine; w.prStatus = st.status
			closeReviewItem(store, w, reason, now)
			store.log({ event: 'pr-moved', code: w.code, pr: ref.id, reason })
			commit()
			n++
			continue
		}
		w.prRead = JSON.stringify([ref.id, st.status, st.head, mine])
		w.prReadAt = new Date(now).toISOString()
		w.prUnknown = mine === undefined ? true : undefined
		const basis = w.reviewBasis, liveHead = st.head
		const reviewHeadMoved = w.intent === 'pr_review' && basis?.pr === ref.id && !!basis.head?.trim() && !!liveHead?.trim() && !sameHead(liveHead, basis.head)
		let reviewMarked = false
		if (reviewHeadMoved && liveHead) {
			const marked = w.reviewAgain?.pr === ref.id && sameHead(w.reviewAgain.head, liveHead)
			if (!marked) {
				w.reviewAgain = { pr: ref.id, head: liveHead, at: new Date(now).toISOString() }
				w.revAt = new Date(Math.max(now, (Date.parse(w.revAt ?? w.updatedAt) || 0) + 1)).toISOString()
				store.log({ event: 'pr-moved', code: w.code, pr: ref.id, reason: `PR ${ref.id} changed since your review` })
				reviewMarked = true
			}
		}
		regateVotes(store, cfg, w, ref, st)
		// A review declined by the gate starts by itself once the owner is a reviewer (added in Azure DevOps, or by Add me), within
		// a week of the ask; a PR that could not be read is decided again now that it can be (review gate G6, G13).
		const declined = w.reviewDecline
		if (!subjects && declined && declined.pr === ref.id && declined.role !== 'not-asked' && (MAY_REVIEW.includes(w.prRole) || declined.role === 'unread') && /^active$/i.test(st.status) && now - Date.parse(declined.at) < 7 * 86_400_000) {
			Object.assign(w, { ...stateFields(w, 'running'), status: MAY_REVIEW.includes(w.prRole) ? `You're a reviewer on PR ${ref.id} now; starting the review` : `PR ${ref.id} can be read again; checking whether you are a reviewer`,
				reviewDecline: undefined, question: undefined, context: w.context?.filter(c => c.label !== 'Not reviewing'), effects: (w.effects ?? []).filter(e => !isAddMe(e)), pending: w.pending.length ? w.pending : w.msgIds.slice(-1) })
			store.log({ event: 'review-gate-reopened', code: w.code, pr: ref.id, role: w.prRole, was: declined.role })
			commitFor(w)()
			n++
			continue
		}
		clearResetVotes(store, w, ref.id, st, mine)
		describe(store, w, st)
		const changed = mine !== undefined && w.prVote !== undefined && mine !== w.prVote && mine !== 0
		// Already approved when the ask came in counts only when the ask was for approval (A12: "approve kardo"); a re-review ask keeps waiting.
		const receipt = (w.effects ?? []).find(e => e.done && isVote(e.call) && prIdOf(e.call) === ref.id)
		const madeHere = !!receipt && sameVote(mine ?? 0, voteValue(receipt.call))
		const approvedNow = mine !== undefined && mine >= 5 && !madeHere && (changed || approvalAsk(w.lastAsk ?? ''))
		const stale = !reviewHeadMoved && !!w.draft && w.prDraft !== w.prRead && (!!w.prDraft || !receipt && mine !== undefined && mine >= 5 && approvalMention(w.draft.text))
		const ownerWriting = w.draft?.byOwner && mine !== undefined && mine < 5 && !closedNow && (!approvalMention(w.draft.text) || approvalReplyMatches(w.draft.text, mine, ref.id))
		const reason = receipt && !w.sent || w.draft && w.prDraft === w.prRead || ownerWriting ? undefined
			: closedNow ? `PR ${ref.id} was ${/completed/i.test(st.status) ? 'completed' : 'abandoned'}`
			: approvedNow || changed ? `You ${(VOTE[String(mine)] ?? (id => `voted on PR ${id}`))(ref.id)} in Azure DevOps`
			: stale ? `PR ${ref.id} changed since this draft` : undefined
		if (!standaloneReview && mine !== undefined && mine !== w.prVote) w.prVote = mine
		w.prStatus = st.status
		if (!reason) { commitFor(w)(reviewMarked); if (reviewMarked) n++; continue }
		const home = homeOf(store, w)
		newTurn(w, !!w.sent)
		if (active(home)) {
			step(home, reason, { ref: `pr:${ref.id}:${st.status}:${mine}`, news: true })
			if (home === w && canCloseApproval(store, home) && (approvedNow || closedNow)) closeFamily(store, realProcs, home, reason)
			else Object.assign(w, { ...stateFields(w, 'running'), status: `PR checked: ${reason}; checking the remaining ask`, pending: w.pending.length ? w.pending : w.msgIds.slice(-1) })
			if (home !== w) store.save(home)
		} else if (stale && !approvedNow && !closedNow || reReviewAsk(w.lastAsk ?? '') || !approvalAsk(w.lastAsk ?? '') && !closedNow || compoundAsk) Object.assign(w, { ...stateFields(w, 'running'), status: `PR checked: ${reason}; checking the remaining ask`, pending: w.pending.length ? w.pending : w.msgIds.slice(-1) })
		else Object.assign(w, { ...stateFields(w, 'done'), status: `Nothing needed: ${reason}`, pending: [], closedBy: 'nothing' })
		store.log({ event: 'pr-moved', code: w.code, pr: ref.id, reason })
		commitFor(w)()
		n++
	}
	return n
}

function closeReviewItem(store: Store, w: Workflow, reason: string, now: number) {
	const at = new Date(now).toISOString()
	stopWatch(store, w)
	if (w.work) {
		w.work.closed = { at, why: reason }; w.work.next = undefined; w.work.waitingOn = undefined
		step(w, reason, { at, news: true })
	}
	// Keep the sent reply, comment receipts and proposal history for the Done card.
	close(w, reason)
	Object.assign(w, { closedBy: 'nothing', question: undefined, groupAsk: undefined, heldVotes: undefined, reviewDecline: undefined,
		reviewAgain: undefined, statusReason: undefined, approved: undefined, sendAt: undefined, waitingSince: undefined,
		runFailed: undefined, promise: undefined, revAt: at })
}


// A pending vote on the item's pull request, and how to read that PR: from the thread's link, else from the vote's own call.
// Only a vote needs the PR as it is now; a comment means the same on any iteration.
const prChanges = (w: Workflow) => pendingEffects(w.effects).filter(e => isVote(e.call) && prIdOf(e.call) !== undefined)
export function prRefOf(store: Store, w: Workflow): PrRef | undefined {
	const target = prTarget(store, w)
	if (!target) return undefined
	const c = prChanges(w).find(e => prIdOf(e.call) === target)?.call
	return prOf(store, w) ?? (c ? { project: String(c.args.project ?? ''), repo: String(c.args.repositoryId ?? ''), id: prIdOf(c)! } : undefined)
}

// What a PR change means, from Azure DevOps, on the item and its job alike. New facts are a new revision, so an ok never approves unseen ones.
const factsOf = (st: PrState): PrFacts => ({ title: st.title ?? '', author: st.author ?? '', required: st.required ?? [], autoComplete: !!st.autoComplete })
function describe(store: Store, w: Workflow, st: PrState): boolean {
	const facts = factsOf(st)
	if (prChanges(w).every(e => JSON.stringify(e.pr) === JSON.stringify(facts))) return false
	const set = (es: Effect[] = []) => es.map(e => (isVote(e.call) && prIdOf(e.call) !== undefined && !e.done ? { ...e, pr: facts } : e))
	setEffects(store, w, set)
	return true
}

function setEffects(store: Store, w: Workflow, f: (es?: Effect[]) => Effect[]) {
	w.effects = f(w.effects)
	const job = w.job ? store.job(w.job) : undefined
	if (job?.result) { job.result = { ...job.result, effects: f(job.result.effects) }; store.saveJob(job) }
	w.revAt = new Date().toISOString()
}

// A vote already on the card is re-gated each time the owner's role on its PR is read: one he may not cast (a role outside
// MAY_REVIEW) leaves the card for a to-do with the reason, so ok never offers what the last backstop would refuse; a group the
// runner cannot match is asked about once; and the vote comes back once he may vote (queue-new #7A, #7C).
const NOT_MADE = 'Not made for you: '
function regateVotes(store: Store, cfg: Config, w: Workflow, ref: PrRef, st: PrState) {
	if (w.state !== 'needs_human' || !w.prRole) return
	if (w.groupAsk?.pr === ref.id) {
		const groups = w.prRole === 'group-unknown' ? unknownGroups(cfg, st) : []
		if (JSON.stringify(groups) !== JSON.stringify(w.groupAsk.groups)) {
			const at = new Date().toISOString()
			w.revAt = at === w.revAt ? new Date(Date.parse(at) + 1).toISOString() : at
		}
		w.groupAsk = groups.length ? { pr: ref.id, groups } : undefined
		w.question = w.groupAsk ? groupQuestion(w.groupAsk) : undefined
	}
	const ours = (e: Effect) => !!pendingEffects([e]).length && isVote(e.call) && prIdOf(e.call) === ref.id
	const votes = (w.effects ?? []).filter(ours)
	if (!MAY_REVIEW.includes(w.prRole)) {
		const why = roleWhy(cfg, w.prRole)
		const gated = w.todos?.some(t => t.endsWith(`${NOT_MADE}${why}`))
		if (!votes.length && !gated) return
		const addMe = w.prRole === 'none' && votes.length ? addMeEffect(cfg, w, ref) : undefined
		if (votes.length) {
			setEffects(store, w, es => [...(es ?? []).filter(e => !ours(e)), ...(addMe && !es?.some(isAddMe) ? [addMe] : [])])
			w.heldVotes = { pr: ref.id, effects: [...(w.heldVotes?.pr === ref.id ? w.heldVotes.effects : []), ...votes], why }
			w.todos = [...new Set([...(w.todos ?? []), ...votes.map(e => `${e.summary.replace(/[.\s]+$/, '')}. ${NOT_MADE}${why}`)])]
		}
		const groups = w.prRole === 'group-unknown' ? unknownGroups(cfg, st) : []
		// The group question comes before the generic "the reply counts on a change" one: its answer can bring the vote back.
		const ask = groups.length > 0 && w.groupAsk?.pr !== ref.id && (!w.question || w.question.startsWith('The reply counts on '))
		if (ask) {
			w.groupAsk = { pr: ref.id, groups }
			w.question = groupQuestion(w.groupAsk)
		}
		if (votes.length || ask) store.log({ event: 'vote-regated', code: w.code, pr: ref.id, role: w.prRole, votes: votes.length, asked: ask ? groups.length : 0 })
		return
	}
	// A held vote is restored only to the item it was taken from, and only while the item still shows the same review.
	const held = w.heldVotes
	if (held?.pr !== ref.id) return
	setEffects(store, w, es => [...(es ?? []).filter(e => !isAddMe(e) && !ours(e)), ...held.effects])
	w.todos = w.todos?.filter(t => !held.effects.some(e => t === `${e.summary.replace(/[.\s]+$/, '')}. ${NOT_MADE}${held.why}`))
	if (!w.todos?.length) w.todos = undefined
	if (w.groupAsk?.pr === ref.id) { w.groupAsk = undefined; w.question = undefined }
	w.heldVotes = undefined
	store.log({ event: 'vote-restored', code: w.code, pr: ref.id, role: w.prRole, votes: held.effects.length })
}

function clearResetVotes(store: Store, w: Workflow, id: number, state: PrState, vote: number | undefined) {
	if (vote === undefined || !/^active$/i.test(state.status)) return
	const stale = (e: Effect) => e.done && isVote(e.call) && prIdOf(e.call) === id &&
		(!sameVote(vote, voteValue(e.call)) || !!e.head && !!state.head && !sameHead(e.head, state.head))
	const job = w.job ? store.job(w.job) : undefined
	if (!w.effects?.some(stale) && !job?.result?.effects?.some(stale)) return
	setEffects(store, w, (effects = []) => effects.map(e => stale(e) ? { ...e, done: undefined } : e))
	store.log({ event: 'vote-receipt-reset', workflowId: w.id, code: w.code, pr: id, vote })
}

// At ok, a vote on a pull request is checked against the PR as it is now: still the item's, still open, and at the commit the review read.
// Returns why nothing was done, or undefined to go ahead (next action, R-HIL-21).
// The status of an item whose vote was dropped because its PR is completed or abandoned; the page offers "Send reply only" on it.
export const noVoteNeeded = (id: number, state: string) => `PR ${id} is ${state}, so no vote is needed`
export const voteDropped = (status = '') => /^PR \d+ is \w+, so no vote is needed$/.test(status)
export async function recheckPr(store: Store, w: Workflow, probe?: BuildProbe): Promise<string | undefined> {
	const before = prChanges(w)
	const votes = (w.effects ?? []).filter(e => !e.off && isVote(e.call) && prIdOf(e.call) !== undefined)
	if (!votes.length) return undefined
	const ref = prRefOf(store, w), code = w.code, id = prIdOf(votes[0].call)!
	if (!ref || ref.id !== id || id !== prTarget(store, w)) { w.prGroups = undefined; return `Not done ${code}: PR ${id} is not this item's PR. Nothing was changed.` }
	if (!probe?.pr) { w.prGroups = undefined; return `Not done ${code}: PR ${id} must be checked first, and no Azure DevOps server is set up. Nothing was changed.` }
	let st: PrState
	try { st = await probe.pr(ref.project, ref.repo, id) } catch (e) { w.prGroups = undefined; return `Not done ${code}: could not read PR ${id} first (${String(e).slice(0, 120)}). Nothing was changed. Say "ok ${code}" to try again.` }
	if (!/^(active|completed|abandoned)$/i.test(st.status)) { w.prGroups = undefined; return `Not done ${code}: Azure DevOps did not say what state PR ${id} is in. Nothing was changed. Say "ok ${code}" to try again.` }
	w.prGroups = reviewerGroups(st)
	const mine = liveOwnerVote(store.config(), st)
	w.prRead = JSON.stringify([id, st.status, st.head, mine])
	w.prUnknown = mine === undefined ? true : undefined
	clearResetVotes(store, w, id, st, mine)
	const left = prChanges(w)
	if (!left.length) return /^active$/i.test(st.status) && mine === undefined
		? `Not done ${code}: the current owner vote on PR ${id} could not be verified. Nothing was changed or sent.` : undefined
	if (/completed|abandoned/i.test(st.status)) {
		setEffects(store, w, (es = []) => es.map(e => (isVote(e.call) && !e.done ? { ...e, off: true } : e)))
		const rest = pendingEffects(w.effects).length, state = st.status.toLowerCase()
		Object.assign(w, statusFields('refused', noVoteNeeded(id, state)))
		// The reply was written counting on the vote, so it is quoted before it goes without it (review 10-21 P2-10).
		return `Not done ${code}: PR ${id} is ${state}, so no vote is needed. The reply was written counting on the vote; it says: "${w.draft?.text ?? ''}". Say "ok ${code}" to ${rest ? 'make the other changes and send it as it is' : 'send it as it is'}, "edit ${code}: <text>" to change it, or "skip ${code}".`
	}
	const head = left.find(e => isVote(e.call))?.head
	if (head && !sameHead(st.head, head)) {
		Object.assign(w, { question: reviewAgain(code, `PR ${id} changed since your review (new commits).`), status: `PR ${id} changed since your review`, reviewAgain: { pr: id, head: st.head ?? head, at: new Date().toISOString() }, revAt: new Date().toISOString() })
		return `Not done ${code}: ${reviewAgain(code, `PR ${id} changed since your review (new commits).`)} Nothing was changed or sent.`
	}
	if (!before.length) {
		describe(store, w, st)
		w.status = `The recorded vote on PR ${id} is no longer in place. Review the newly required change.`
		return `Not done ${code}: ${w.status} Nothing was changed or sent.`
	}
	if (describe(store, w, st)) return `Before you ok ${code}: ${effectLine(pendingEffects(w.effects))}. Say "ok ${code}" to go ahead.`
	return undefined
}

// The owner's own words promised a vote: the PR as it is now decides whether one is offered (Slice 3). Closed, or the owner's vote
// there already says the same: none is needed. New commits since the review: none, and the owner reviews again. A PR that cannot
// be read keeps the vote, since ok reads it again before any vote.
export const sameVote = (a: number, b?: number) => a === b || (a >= 5 && (b ?? 0) >= 5)
export async function voteNow(store: Store, cfg: Config, w: Workflow, effects: Effect[], probe?: BuildProbe): Promise<{ effects: Effect[]; why?: string; again?: string; vote?: number; head?: string }> {
	const votes = effects.filter(e => isVote(e.call))
	if (!votes.length) return { effects }
	if (!probe?.pr) { w.prGroups = undefined; return { effects } }
	const c = votes[0].call!, ref = prOf(store, w) ?? { project: String(c.args.project ?? ''), repo: String(c.args.repositoryId ?? ''), id: prIdOf(c)! }
	let st: PrState
	try { st = await probe.pr(ref.project, ref.repo, ref.id) } catch (e) { w.prGroups = undefined; store.log({ event: 'pr-check-failed', pr: ref.id, error: String(e).slice(0, 200) }); return { effects } }
	if (!/^(active|completed|abandoned)$/i.test(st.status)) { w.prGroups = undefined; return { effects } }
	w.prGroups = reviewerGroups(st)
	const rest = effects.filter(e => !isVote(e.call))
	if (/completed|abandoned/i.test(st.status)) return { effects: rest, why: `PR ${ref.id} is ${st.status.toLowerCase()}` }
	const vote = liveOwnerVote(cfg, st)
	clearResetVotes(store, w, ref.id, st, vote)
	const current = { vote, head: st.head }
	if (vote !== undefined && votes.every(e => sameVote(vote, voteValue(e.call)))) return { effects: rest, why: `you already voted on PR ${ref.id}`, ...current }
	if (votes.some(e => !sameHead(st.head, e.head))) return { effects: rest, again: reviewAgain(w.code, `PR ${ref.id} changed since your review (new commits).`), ...current }
	const facts = factsOf(st)
	return { effects: effects.map(e => (isVote(e.call) ? { ...e, pr: facts } : e)), ...current }
}

// What changed on a PR since the owner was shown its vote: its state, its commit, or what an approval would do (review 10-21 P1-3).
export function prMoved(st: PrState, e: Effect): string[] {
	const was = e.pr, now = factsOf(st)
	return [
		...(/^active$/i.test(st.status) ? [] : [`it is ${st.status.toLowerCase()}`]),
		...(sameHead(st.head, e.head) ? [] : ['new commits']),
		...(!was ? ['what it means was never shown to you'] : [
			...(was.autoComplete === now.autoComplete ? [] : [`autocomplete was turned ${now.autoComplete ? 'on' : 'off'}`]),
			...(JSON.stringify([...was.required].sort()) === JSON.stringify([...now.required].sort()) ? [] : ['required reviewers changed']),
			...(was.title === now.title ? [] : ['title changed']),
		]),
	]
}

// A deploy Delegate made: each build check also reads its ring's newest run. A newer run by someone else is news on the work,
// once, and the item runs so the plan is redrawn; results after it are not ours (eng-owned-work.md §e). Never a redeploy by itself.
async function overwrites(store: Store, homes: Workflow[], probe: BuildProbe, now: number) {
	if (!probe.runs) return
	const me = store.config().owner.name.trim().toLowerCase()
	for (const h of homes) {
		let news: string | undefined
		for (const p of h.work!.plan!.filter(p => p.ring && !p.ring.over)) {
			const r = p.ring!
			let runs: RunFact[]
			try { runs = await probe.runs(r.project, r.pipelineId) } catch (e) { store.log({ event: 'ring-check-failed', pipeline: r.pipelineId, error: String(e).slice(0, 200) }); continue }
			const newer = runs.find(x => x.id > r.run && x.by.trim().toLowerCase() !== me)
			if (!newer) continue
			r.over = newer.id
			const what = `${r.name} redeployed by ${newer.by || 'someone'} at ${clock(newer.at, store.config().tz)} (run ${newer.id}); results after that are not ours`
			if (step(h, what, { ref: `ring:${r.pipelineId}:${newer.id}`, news: true, at: new Date(now).toISOString() })) news = what
		}
		store.save(h)
		if (news) { wake(h, `News: ${news}`); store.save(h) }
	}
}
const clock = (iso: string, tz?: string) => { try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(tz ? { timeZone: tz } : {}) }) } catch { return iso.slice(11, 16) } }

// A ring as it is: its newest run, and the runs still going.
async function ringNow(probe: BuildProbe, project: string, pipelineId: number): Promise<RingFacts> {
	const runs = await probe.runs!(project, pipelineId)
	return { last: runs[0], running: runs.filter(r => /inprogress|notstarted|cancelling|postponed/i.test(r.status)), readAt: new Date().toISOString() }
}
const deploys = (w: Workflow) => pendingEffects(w.effects).filter(e => isDeploy(e.call))
const projectOf = (store: Store, e: Effect) => String(e.call!.args.project ?? targetOf(store.config(), pipelineOf(e.call))?.project ?? '')
const sameCall = (x: Effect, e: Effect) => !x.done && JSON.stringify(x.call) === JSON.stringify(e.call)

// What a deploy depends on, read now: its ring, the PR, and its build, which must be that PR's build at its head (review 10-21 P1-3).
// The PR builds live with the PR, so the build is read in the PR's project.
type Now = { ring: RingFacts; head?: string; build: { facts: BuildFacts } | { why: string } }
async function readNow(store: Store, w: Workflow, e: Effect, probe: BuildProbe): Promise<Now> {
	const ref = prOf(store, w), id = buildOf(e.call)!
	const ring = await ringNow(probe, projectOf(store, e), pipelineOf(e.call)!)
	if (!ref) return { ring, build: { why: `the PR's link is not in the thread, so build ${id} cannot be checked against it` } }
	const pr = await probe.pr!(ref.project, ref.repo, ref.id)
	const b = (await probe.builds(ref.project, [id])).get(id)
	return { ring, head: pr.head, build: buildCheck(id, b, { id: ref.id, head: pr.head, merge: pr.merge, branch: pr.branch, repo: pr.repo ?? ref.repo, repoId: pr.repoId }) }
}

// A proposed deploy is shown with its ring and its build as Azure DevOps lists them, read by code, so an ok never approves what it
// did not see. New facts are a new revision, as for a PR vote. A build that is not the PR's at its head is the owner's to-do, never offered.
export async function describeDeploys(store: Store, probe: BuildProbe | undefined): Promise<number> {
	if (!probe?.runs || !probe.pr) return 0
	let n = 0
	for (const w of store.workflows().filter(w => w.state === 'needs_human' && deploys(w).some(e => !e.ring || !e.build))) {
		for (const e of deploys(w).filter(e => !e.ring || !e.build)) {
			let now: Now
			try { now = await readNow(store, w, e, probe) } catch (err) { store.log({ event: 'ring-check-failed', pipeline: pipelineOf(e.call), error: String(err).slice(0, 200) }); continue }
			if ('why' in now.build) {
				const why = now.build.why
				setEffects(store, w, (es = []) => es.map(x => (isDeploy(x.call) && sameCall(x, e) ? { ...x, off: true } : x)))
				w.todos = [...new Set([...(w.todos ?? []), `${e.summary.replace(/[.\s]+$/, '')}. Not made for you: ${why}`])]
				store.log({ event: 'deploy-build-refused', code: w.code, why })
			} else { const facts = now.build.facts; setEffects(store, w, (es = []) => es.map(x => (sameCall(x, e) ? { ...x, ring: now.ring, build: facts } : x))) }
			n++
		}
		store.save(w)
	}
	return n
}

// At ok, a deploy is checked against the ring, the PR, and its build as they are now. If any moved since the owner saw the proposal,
// or the build is not the PR's at its head, it is not run: the job draws the proposal again (eng-owned-work.md §e, a late ok).
export async function recheckDeploy(store: Store, w: Workflow, probe?: BuildProbe): Promise<string | undefined> {
	const e = deploys(w)[0]
	if (!e) return undefined
	const code = w.code, ring = e.deploy?.ring ?? `pipeline ${pipelineOf(e.call)}`
	if (!probe?.runs || !probe.pr) return `Not done ${code}: ${ring} and PR ${e.deploy?.pr} must be read first, and no Azure DevOps server is set up. Nothing was deployed.`
	let now: Now
	try { now = await readNow(store, w, e, probe) } catch (err) { return `Not done ${code}: could not read ${ring}, PR ${e.deploy?.pr}, and its build first (${String(err).slice(0, 120)}). Nothing was deployed. Say "ok ${code}" to try again.` }
	if (!now.head) return `Not done ${code}: could not read the head of PR ${e.deploy?.pr} first. Nothing was deployed. Say "ok ${code}" to try again.`
	const moved = [...(sameHead(now.head, e.head) ? [] : [`PR ${e.deploy?.pr} has new commits`]), ...(e.ring ? [ringMoved(e.ring, now.ring)].filter((x): x is string => !!x).map(x => `${ring}: ${x}`) : [])]
	if (!moved.length && 'why' in now.build) moved.push(now.build.why)
	if (moved.length) {
		redraw(store, w, `${moved.join('; ')}, since the proposal`)
		return `Not done ${code}: ${moved.join('; ')}, since you saw it. Nothing was deployed. Drawing the proposal again from what is there now.`
	}
	if (!e.ring || !e.build) {
		const facts = (now.build as { facts: BuildFacts }).facts
		setEffects(store, w, (es = []) => es.map(x => (sameCall(x, e) ? { ...x, ring: now.ring, build: facts } : x)))
		const shown = { ...e, build: facts }
		return `Before you ok ${code}: ${deployLine(shown)} (${ringMeaning(now.ring)}). Say "ok ${code}" to go ahead.`
	}
	return undefined
}

// The proposal is withdrawn and its job runs again with why, so the next proposal starts from the ring and PR as they are.
function redraw(store: Store, w: Workflow, why: string) {
	const job = w.job ? store.job(w.job) : undefined
	setEffects(store, w, (es = []) => es.map(x => (isDeploy(x.call) && !x.done ? { ...x, off: true } : x)))
	if (job) { Object.assign(job, { asks: [...job.asks, `${NAME}: not deployed: ${why}. Read the rings, the PR, and its build again, and propose again.`], state: 'queued', purpose: 'work', error: undefined }); store.saveJob(job) }
	Object.assign(w, { ...stateFields(w, job ? 'waiting_on_task' : 'needs_human'), status: `Not deployed: ${why}. Drawing it again`, waitingSince: new Date().toISOString(), approved: undefined })
	const home = homeOf(store, w)
	if (home.work && step(home, `Not deployed: ${why}`) && home !== w) store.save(home)
}

// Right before the call: the same check, for a run that started after the ok (make_change).
export async function deployMoved(store: Store, w: Workflow, e: Effect, probe?: BuildProbe): Promise<string | undefined> {
	const ring = e.deploy?.ring ?? `pipeline ${pipelineOf(e.call)}`
	if (!probe?.runs || !probe.pr || !prOf(store, w)) return `${ring}, the PR, and its build could not be read right before the deploy: no Azure DevOps server is set up.`
	try {
		const now = await readNow(store, w, e, probe)
		const why = [...(sameHead(now.head, e.head) ? [] : [`PR ${e.deploy?.pr} has new commits`]), ...(e.ring ? [ringMoved(e.ring, now.ring)].filter(Boolean).map(x => `${ring}: ${x}`) : ['the ring was never shown to you']),
			...('why' in now.build ? [now.build.why] : e.build && now.build.facts.version !== e.build.version ? ['the build is not the one shown to you'] : !e.build ? ['the build was never shown to you'] : [])]
		return why.length ? `Not deployed: ${why.join('; ')}, since you saw it. Say "ok ${w.code}" to draw it again.` : undefined
	} catch (err) { return `Could not read ${ring} right before the deploy (${String(err).slice(0, 120)}).` }
}
