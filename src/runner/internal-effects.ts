import { INTERNAL_ACTIONS, type InternalEffect } from '../core/effects.ts'
import { suggestionOnTarget, suggestionScope, type SuggestionScope } from '../core/suggestion-scope.ts'
import type { Config, Effect, Report, Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { suggestionSelector } from './effect-preparation.ts'
import { prTarget } from './probe.ts'
import { DEFAULT_UNTIL, FOLLOW_DAYS, watchingTarget, watchTarget } from './track.ts'
import { active, wait } from './work.ts'

export type InternalEffectResult = { ok: true; ref?: string } | { ok: false; error: string }

export async function runInternalEffect(store: Store, wf: Workflow, effect: Effect): Promise<InternalEffectResult> {
	const parsed = INTERNAL_ACTIONS.safeParse(effect)
	if (!parsed.success) return { ok: false, error: 'The internal change is invalid. Nothing was scheduled.' }
	const internal: InternalEffect = { ...effect, ...parsed.data, call: undefined }
	if (!suggestionOnTarget(internal, suggestionScope(wf, prTarget(store, wf))))
		return { ok: false, error: 'The internal change no longer matches this item. Nothing was scheduled.' }
	if (internal.action === 'watch') {
		const result = watchTarget(store, internal.payload)
		return result.accepted ? { ok: true, ref: result.code } : { ok: false, error: result.text }
	}
	if (!active(wf) || wf.partOf)
		return { ok: false, error: 'Check back is available on an open main work item. Nothing was scheduled.' }
	if (!Number.isFinite(new Date(Date.now() + internal.payload.days * 86_400_000).getTime()))
		return { ok: false, error: 'The check-back date is out of range. Nothing was scheduled.' }
	const next = structuredClone(wf)
	const sentDraft = next.sent && !next.sent.holding && next.sent.text === next.draft?.text ? next.draft : undefined
	// End the completed turn, but retain its actually-sent draft for the existing Undo path.
	wait(next, internal.payload.days)
	if (sentDraft) next.draft = sentDraft
	store.save(next)
	Object.assign(wf, next)
	return { ok: true, ref: wf.code }
}

function targets(scope: SuggestionScope): { key: string; text: string }[] {
	return [
		...(scope.pr ? [{ key: `pr:${scope.pr}`, text: `PR ${scope.pr}` }] : []),
		...scope.workItems.map(id => ({ key: `workitem:${id}`, text: `work item ${id}` })),
		...scope.incidents.map(id => ({ key: `incident:${id}`, text: `incident ${id}` })),
	]
}

function alreadyWatching(store: Store, item: Workflow): boolean {
	const job = item.work?.watch ? store.job(item.work.watch) : undefined
	if (job?.every && job.state !== 'failed') return true
	if (!item.follow) return false
	if (!item.follow.code) return true
	const follow = store.byCode(item.follow.code)
	return !!follow && follow.state !== 'done'
}

export function addInternalSuggestions(store: Store, cfg: Config, items: Workflow[], report: Report): Report {
	const job = store.job(report.workflowId)
	if (!items.length || report.goalMet === false || report.work?.closed || report.follow ||
		!report.reply && items.some(item => item.draft?.holding) ||
		job?.byRule || job?.purpose === 'execute' || items.some(item => item.approved?.byRule || item.kind === 'tracker') ||
		!report.reply?.text.trim() && !report.effects?.some(effect => effect.origin !== 'suggested')) return report
	const existing = [...(report.effects ?? []), ...(report.choices?.options.flatMap(option => option.effects ?? []) ?? [])]
	if (existing.filter(effect => effect.origin === 'suggested').length >= 3) return report
	const select = suggestionSelector(store, cfg, items, existing), added: Effect[] = []
	const scoped = items.map(item => targets(suggestionScope(item, prTarget(store, item))))
	const shared = scoped[0].filter(target => scoped.every(list => list.some(other => other.key === target.key)))
	for (const target of shared) {
		const payload = { target: target.text, until: DEFAULT_UNTIL }
		if (watchingTarget(store, payload) || items.some(item => alreadyWatching(store, item))) continue
		const candidate: InternalEffect = { system: 'delegate', action: 'watch', target: target.key, payload,
			summary: `Watch ${target.text} until it is done (up to ${FOLLOW_DAYS} days).`, origin: 'suggested',
			reason: { kind: 'open-item', text: 'This item names this target.' } }
		const kept = select(candidate)
		if (kept) added.push(kept)
	}
	const item = items[0]
	if (!shared.length && items.length === 1 && !item.partOf && active(item) && item.work?.waitingOn &&
		(!item.work.checkAt || Date.parse(item.work.checkAt) <= Date.now())) {
		const candidate: InternalEffect = { system: 'delegate', action: 'check-back', target: item.id, payload: { days: 3 },
			summary: 'Check back in 3 days.', origin: 'suggested',
			reason: { kind: 'open-item', text: 'This open item is waiting.' } }
		const kept = select(candidate)
		if (kept) added.push(kept)
	}
	return added.length ? { ...report, effects: [...(report.effects ?? []), ...added] } : report
}
