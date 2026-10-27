import { effectCapability, internalEffectProblem, isVote, sameChange, verifyOrigin, vet } from '../core/effects.ts'
import { isDeepStrictEqual } from 'node:util'
import type { Config, Effect, Report, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { cachedCatalogs } from './catalog.ts'
import { effectCallProblem, isInlineComment, prepareEffectCalls, type CommentRef } from './effect-calls.ts'
import { madeBefore, maybeOf } from './ledger.ts'
import { prOf, prTarget, type PrRef } from './probe.ts'
import { pageChangeId } from '../core/page-approval.ts'
import type { EffectCallRepair } from './effect-calls.ts'
import { recordCommit } from './commit.ts'
import { freshRead } from '../store/fs.ts'
import { stateFields } from '../core/upgrades.ts'
import type { LeftDraft } from '../core/left-lines.ts'
import { telemetryEvent } from '../core/telemetry.ts'
import { attributePromise } from '../core/action-claims.ts'
import { dismissKey, isDismissed } from './habits.ts'
import { suggestionOnTarget, suggestionScope } from '../core/suggestion-scope.ts'
import { unitForJob } from '../core/review.ts'

const reference = (candidates: (PrRef | undefined)[]): CommentRef | undefined => {
	const refs = candidates.filter(r => r !== undefined)
	if (!refs.length || refs.length !== candidates.length || refs.some(r => r.id !== refs[0].id || r.repo !== refs[0].repo || r.project !== refs[0].project)) return undefined
	return { project: refs[0].project, repositoryId: refs[0].repo, pullRequestId: refs[0].id }
}

// These go through their existing server-side builders and live PR gates, not the worker comment builder.
const deferred = (e: Effect) => isVote(e.call) || e.call?.args.action === 'update_reviewers'
const sameRepair = (a: Effect, b: Effect) => sameChange(a, b) && isDeepStrictEqual(a.payload, b.payload)

// The caller supplies code-built effects, never an unprepared worker proposal.
export function suggestionSelector(store: Store, cfg: Config, items: Workflow[], existing: Effect[] = []): (effect: Effect) => Effect | undefined {
	const scopes = items.flatMap(item => {
		if (item.prs === undefined) return [suggestionScope(item, prTarget(store, item))]
		const units = item.prs.filter(unit => unit.ref && !unit.skip)
		return units.map(unit => suggestionScope(item, unit.id))
	})
	const selected = [...existing], accepted = existing.filter(effect => effect.origin === 'suggested')
	return effect => {
		if (accepted.length >= 3) return undefined
		if (builtEffectProblem(cfg, effect)) {
			store.log({ event: 'effect-call-repaired', from: 'rebuilt', ok: false })
			return undefined
		}
		const scope = scopes.find(scope => suggestionOnTarget(effect, scope))
		if (!scope) return undefined
		const allowed = vet(cfg, [effect], scope.pr).effects[0]
		if (!allowed || !suggestionOnTarget(allowed, scope) ||
			selected.some(other => sameChange(other, allowed) || other.call && allowed.call && isDeepStrictEqual(other.call, allowed.call)) ||
			isDismissed(store, dismissKey(effectCapability(allowed), allowed.target), Date.now()) || isVote(allowed.call)) return undefined
		const suggestion = { ...allowed, origin: 'suggested' as const }
		accepted.push(suggestion)
		selected.push(suggestion)
		return suggestion
	}
}

export function prepareReportCalls(store: Store, cfg: Config, items: Workflow[], report: Report): { report: Report; problems: string[]; left: LeftDraft[] } {
	if (report.goalMet === false && !report.effects?.length && !report.choices?.options.some(option => option.effects?.length)) return { report: { ...report, suggested: [] }, problems: [], left: [] }
	const catalogs = cachedCatalogs(cfg), ref = reference(items.map(w =>
		w.intent === 'pr_review' && w.prs !== undefined ? unitForJob(w, report.workflowId)?.ref : prOf(store, w)))
	const asks = items.flatMap(item => store.thread(item.id).filter(message => !message.byOwner && item.msgIds.includes(message.id) &&
		item.asker?.id === message.from.id).map(message => message.text))
	const listed = new Set(Object.entries(catalogs).flatMap(([server, catalog]) => catalog.tools.map(tool => `${server}-${tool.name}`)))
	const proposals = [...(report.suggested ?? []), ...(report.effects ?? []).filter(effect => effect.origin === 'suggested')]
		.filter(effect => effect.system !== 'delegate')
	const optional = report.goalMet === false ? [] : prepareEffectCalls(proposals, ref, catalogs, entry => store.log(entry)).effects
	const verify = (effect: Effect) => verifyOrigin(effect, {
		askerMessages: asks, replyText: report.reply?.text,
		attributePromise: (text, proposed) => attributePromise(text, proposed, [
			...(report.effects ?? []), ...optional, ...(report.choices?.options.flatMap(option => option.effects ?? []) ?? []),
		]),
		downgraded: (proposal, why) => store.log(telemetryEvent('origin-downgraded', {
			code: items.find(item => item.id === report.workflowId)?.code ?? items[0]?.code ?? report.workflowId,
			capability: proposal.call && listed.has(proposal.call.tool) ? proposal.call.tool : 'unknown', why,
		})),
	})
	const verified = (): Report => ({ ...report, ...(report.effects ? { effects: report.effects.map(verify) } : {}),
		...(report.choices ? { choices: { ...report.choices, options: report.choices.options.map(option =>
			({ ...option, ...(option.effects ? { effects: option.effects.map(verify) } : {}) })) } } : {}) })
	if (report.goalMet === false) {
		const ready = verified()
		return { report: { ...ready, suggested: [], effects: ready.effects?.filter(effect => effect.origin !== 'suggested'),
			...(ready.choices ? { choices: { ...ready.choices, options: ready.choices.options.map(option =>
				({ ...option, effects: option.effects?.filter(effect => effect.origin !== 'suggested') })) } } : {}) }, problems: [], left: [] }
	}
	const prepare = (effects: Effect[] = []) => prepareEffectCalls(effects, ref, catalogs, entry => store.log(entry), deferred)
	const main = prepare(report.effects?.filter(effect => effect.origin !== 'suggested'))
	const failures: { effect: Effect; why: string; left: LeftDraft; option?: number }[] = [...main.failures]
	const choices = report.choices && { ...report.choices, options: report.choices.options.map((option, i) => {
		const ready = prepare(option.effects?.filter(effect => effect.origin !== 'suggested'))
		failures.push(...ready.failures.map(failure => ({ ...failure, option: i + 1 })))
		const optional = prepareEffectCalls((option.effects ?? []).filter(effect => effect.origin === 'suggested' && effect.system !== 'delegate'),
			ref, catalogs, entry => store.log(entry))
		return { ...option, effects: [...ready.effects, ...optional.effects] }
	}) }
	report = { ...report, effects: main.effects, ...(choices ? { choices } : {}) }
	const problems: string[] = [], left: LeftDraft[] = []
	for (const failure of failures) {
		if (verify(failure.effect).origin === 'suggested') continue
		const suffix = failure.option ? ` (option ${failure.option})` : ''
		problems.push(failure.why + suffix)
		left.push({ ...failure.left, why: failure.why + suffix })
	}
	const ready = verified(), effects = ready.effects ?? []
	const requested = effects.filter(effect => effect.origin !== 'suggested')
	const alternatives = ready.choices?.options.flatMap(option => option.effects ?? []) ?? []
	const mandatory = [...requested, ...alternatives.filter(effect => effect.origin !== 'suggested')]
	const suggestions = [...optional, ...effects.filter(effect => effect.origin === 'suggested')]
	const select = suggestionSelector(store, cfg, items, mandatory)
	const rule = store.job(report.workflowId)?.byRule || items.some(item => item.approved?.byRule)
	const accept = (effect: Effect): Effect | undefined => {
		if (rule || items.some(item => item.draft?.holding) && !report.reply || effect.system === 'delegate') return undefined
		return select(effect)
	}
	const selected = suggestions.flatMap(effect => { const kept = accept(effect); return kept ? [kept] : [] })
	const selectedChoices = ready.choices && { ...ready.choices, options: ready.choices.options.map(option => ({
		...option, effects: option.effects?.flatMap(effect => {
			if (effect.origin !== 'suggested') return [effect]
			const kept = accept(effect)
			return kept ? [kept] : []
		}),
	})) }
	return { report: { ...ready, effects: [...requested, ...selected], ...(selectedChoices ? { choices: selectedChoices } : {}), suggested: [],
		...(left.length ? { refused: [...(report.refused ?? []), ...left.filter(draft => draft.type === 'refusal')] } : {}),
		...(problems.length ? { state: 'needs_human' as const, question: report.question ?? problems.join('\n'), questionHint: undefined,
			todos: [...new Set([...(report.todos ?? []), ...problems])],
			work: report.work ? { ...report.work, closed: undefined } : undefined } : {}) }, problems, left }
}

export function builtEffectProblem(cfg: Config, effect: Effect): string | undefined {
	if (effect.system === 'delegate') return internalEffectProblem(effect)
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
			const ready = prepareEffectCalls([effect], reference([prOf(store, wf)]), catalogs, entry => notices.push(entry))
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
			question: effects.some(e => !e.done && !e.off) ? undefined : problems.join('\n') || undefined, questionHint: undefined,
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
