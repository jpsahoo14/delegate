import type { Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'

export function workflowJobIds(wf: Workflow): string[] {
	return [...new Set([wf.job, ...(wf.prs ?? []).flatMap(unit =>
		[unit.job, unit.review?.run?.job, unit.review?.run?.carrier, unit.review?.completed?.job])]
		.filter((id): id is string => !!id))]
}

// Who holds an item's session right now. One check for every path that sends, approves, or reruns (R-WF-07).
export function heldBy(store: Store, wf: Workflow): 'window' | 'work' | 'changes' | undefined {
	const ids = workflowJobIds(wf)
	if (store.openWindow(wf.id) || ids.some(id => store.openWindow(id))) return 'window'
	const jobs = ids.map(id => store.job(id)).filter(job => job?.state === 'running')
	if (jobs.some(job => job?.purpose === 'execute')) return 'changes'
	if (jobs.length) return 'work'
	return undefined
}
