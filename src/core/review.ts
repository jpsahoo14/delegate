import type { Effect, Workflow } from './types.ts'
import { pageChangeId } from './page-approval.ts'

export const reviewFrame = (pr: number, counts: NonNullable<Workflow['reviewDone']>['counts']) => {
	const n = counts.high + counts.medium + counts.low
	return n ? `Reviewed PR ${pr} and left ${n} comments (${counts.high} high, ${counts.medium} medium, ${counts.low} low).` : `Reviewed PR ${pr}; no comments from my side.`
}
export function reviewDoneFacts(basis: NonNullable<Workflow['reviewBasis']>, byRule: string, effects: Effect[]): NonNullable<Workflow['reviewDone']> {
	const posted = effects.filter(e => e.done && !e.off && !e.maybe && !e.error && e.done.byRule === byRule && e.done.severity).map(e => {
		const args = e.call?.args ?? {}, payload = e.payload && typeof e.payload === 'object' ? e.payload : {}
		return { severity: e.done!.severity!, text: String(args.content ?? args.text ?? args.body ?? e.summary),
			...('file' in payload && typeof payload.file === 'string' ? { file: payload.file } : {}),
			...('line' in payload && typeof payload.line === 'number' ? { line: payload.line } : {}),
			...(e.done!.ref && /^https?:\/\//i.test(e.done!.ref) ? { thread: e.done!.ref } : {}) }
	})
	return { pr: basis.pr, head: basis.head, byRule, reviewedAt: basis.at, posted,
		counts: { high: posted.filter(e => e.severity === 'High').length, medium: posted.filter(e => e.severity === 'Medium').length, low: posted.filter(e => e.severity === 'Low').length },
		waiting: effects.filter(e => !e.done && !e.off).map(pageChangeId) }
}
