import type { Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'

// Who holds an item's session right now. One check for every path that sends, approves, or reruns (R-WF-07).
export function heldBy(store: Store, wf: Workflow): 'window' | 'work' | 'changes' | undefined {
	if (store.openWindow(wf.id) || (wf.job && store.openWindow(wf.job))) return 'window'
	const job = wf.job ? store.job(wf.job) : undefined
	if (job?.state === 'running') return job.purpose === 'execute' ? 'changes' : 'work'
	return undefined
}
