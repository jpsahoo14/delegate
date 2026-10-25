import { isVote, sameChange } from '../core/effects.ts'
import { isDeepStrictEqual } from 'node:util'
import type { Config, Effect, Report, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { cachedCatalogs } from './catalog.ts'
import { effectCallProblem, isInlineComment, prepareEffectCalls, type CommentRef } from './effect-calls.ts'
import { madeBefore, maybeOf } from './ledger.ts'
import { prOf } from './probe.ts'
import { pageChangeId } from '../core/page-approval.ts'
import type { EffectCallRepair } from './effect-calls.ts'
import { recordCommit } from './commit.ts'
import { freshRead } from '../store/fs.ts'
import { stateFields } from '../core/upgrades.ts'
import type { LeftDraft } from '../core/left-lines.ts'

const reference = (store: Store, items: Workflow[]): CommentRef | undefined => {
	const refs = items.map(w => prOf(store, w)).filter(r => r !== undefined)
	if (!refs.length || refs.length !== items.length || refs.some(r => r.id !== refs[0].id || r.repo !== refs[0].repo || r.project !== refs[0].project)) return undefined
	return { project: refs[0].project, repositoryId: refs[0].repo, pullRequestId: refs[0].id }
}

// These go through their existing server-side builders and live PR gates, not the worker comment builder.
const deferred = (e: Effect) => isVote(e.call) || e.call?.args.action === 'update_reviewers'
const sameRepair = (a: Effect, b: Effect) => sameChange(a, b) && isDeepStrictEqual(a.payload, b.payload)

export function prepareReportCalls(store: Store, cfg: Config, items: Workflow[], report: Report): { report: Report; problems: string[]; left: LeftDraft[] } {
	if (report.goalMet === false) return { report, problems: [], left: [] }
	const catalogs = cachedCatalogs(cfg), ref = reference(store, items)
	const prepare = (effects: Effect[] = []) => prepareEffectCalls(effects, ref, catalogs, entry => store.log(entry), deferred)
	const main = prepare(report.effects), problems = [...main.problems], left = [...main.left]
	const choices = report.choices && { ...report.choices, options: report.choices.options.map((option, i) => {
		const ready = prepare(option.effects)
		problems.push(...ready.problems.map(p => `${p} (option ${i + 1})`))
		left.push(...ready.left.map(draft => ({ ...draft, ...(draft.why ? { why: `${draft.why} (option ${i + 1})` } : {}) })))
		return { ...option, effects: ready.effects }
	}) }
	return { report: { ...report, effects: main.effects, ...(choices ? { choices } : {}),
		...(left.length ? { refused: [...(report.refused ?? []), ...left.filter(draft => draft.type === 'refusal')] } : {}),
		...(problems.length ? { state: 'needs_human' as const, question: report.question ?? problems.join('\n'),
			todos: [...new Set([...(report.todos ?? []), ...problems])],
			work: report.work ? { ...report.work, closed: undefined } : undefined } : {}) }, problems, left }
}

export function builtEffectProblem(cfg: Config, effect: Effect): string | undefined {
	const tool = Object.entries(cachedCatalogs(cfg)).flatMap(([server, c]) => c.tools.map(t => ({ name: `${server}-${t.name}`, info: t.info })))
		.find(t => t.name === effect.call?.tool)
	return !effect.call ? 'no exact call was provided' : !tool ? 'the tool is not in the cached catalog' : effectCallProblem(effect.call, tool.info)
}

// effect-call-shape-1 is an idempotent validity rule, including after a catalog changes, not a once-only schema upgrade.
export function repairPendingEffectCalls(store: Store, consume?: (wf: Workflow, drafts: LeftDraft[]) => void): number {
	const cfg = store.config(), catalogs = cachedCatalogs(cfg)
	if (!Object.values(catalogs).some(c => c.tools.some(t => /pull_request_thread_write$/i.test(t.name)))) return 0
	const items = store.workflows(), jobs = new Map(store.jobs().map(job => [job.id, job]))
	const changes = new Map<string, { before: Effect; after?: Effect }[]>()
	const logged = new Set<string>()
	let repaired = 0
	for (const wf of items) {
		if (!['needs_human', 'waiting_on_task', 'open'].includes(wf.state) || wf.work?.closed) continue
		const job = wf.job ? jobs.get(wf.job) : undefined
		if (job?.state === 'running') continue
		const updates: { before: Effect; after?: Effect }[] = [], problems: string[] = [], left: LeftDraft[] = []
		const events: { entry: EffectCallRepair; id: string }[] = []
		const effects = (wf.effects ?? []).flatMap(effect => {
			const copyMade = job?.result?.effects.some(e => sameChange(e, effect) && (e.done || e.off || maybeOf(store, e) || madeBefore(store, e)))
			if (!isInlineComment(effect) || effect.done || effect.off || maybeOf(store, effect) || madeBefore(store, effect) ||
				copyMade || !builtEffectProblem(cfg, effect)) return [effect]
			const notices: EffectCallRepair[] = []
			const ready = prepareEffectCalls([effect], reference(store, [wf]), catalogs, entry => notices.push(entry))
			const after = ready.effects[0] && { ...ready.effects[0], error: undefined }
			for (const entry of notices) events.push({ entry, id: pageChangeId(after ?? effect) })
			updates.push({ before: effect, after })
			problems.push(...ready.problems)
			left.push(...ready.left)
			if (after) repaired++
			return after ? [after] : []
		})
		if (!updates.length) continue
		const commit = recordCommit(wf, () => store.workflow(wf.id), store.save.bind(store))
		if (wf.job) changes.set(wf.job, [...(changes.get(wf.job) ?? []), ...updates])
		Object.assign(wf, { effects, ...stateFields(wf, 'needs_human'), approved: undefined, sendAt: undefined, waitingSince: undefined,
			question: effects.some(e => !e.done && !e.off) ? undefined : problems.join('\n') || undefined,
			status: updates.some(u => u.after) ? 'The comment format was wrong and is fixed. Post them now?' : problems.join('\n'),
			todos: consume ? wf.todos : [...new Set([...(wf.todos ?? []), ...problems])],
			revAt: new Date(Math.max(Date.now(), (Date.parse(wf.revAt ?? wf.updatedAt) || 0) + 1)).toISOString() })
		if (consume && left.length) consume(wf, left)
		commit()
		for (const { entry, id } of events) if (!logged.has(id)) {
			store.log({ ...entry, pageChangeId: id, code: wf.code })
			logged.add(id)
		}
	}
	for (const [id, updates] of changes) freshRead(() => {
		const job = store.job(id)
		if (!job?.result || job.state === 'running') return
		job.result.effects = job.result.effects.flatMap(effect => {
			if (effect.done || effect.off || maybeOf(store, effect) || madeBefore(store, effect)) return [effect]
			const update = updates.find(u => sameRepair(u.before, effect))
			return update ? update.after ? [{ ...effect, ...update.after }] : [] : [effect]
		})
		if (job.purpose === 'execute') Object.assign(job, { state: 'done', purpose: 'work', run: undefined, error: undefined })
		store.saveJob(job)
	})
	return repaired
}
