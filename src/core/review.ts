import type { Draft, Effect, PrFacts, Workflow } from './types.ts'
import { pageChangeId } from './page-approval.ts'

export type UnitReviewRun = { job: string; carrier: string; resultAt: string; rule: string; head: string; turn?: string; phase: 'posting' | 'held'; action?: { id: string; at: string }; approval: { byRule: string; effectIds: string[]; effects: string; epoch: number } }
export type UnitReviewDone = Omit<NonNullable<Workflow['reviewDone']>, 'pr'>
export type UnitReviewCompleted = { job: string; resultAt: string; head: string; verified: boolean; findings: number; clean?: true; facts?: PrFacts }
export type ReviewFrame = { epoch: number; basis?: { head: string; at: string }; run?: UnitReviewRun; done?: UnitReviewDone; completed?: UnitReviewCompleted }
export type ReviewReply = { rule: string; turn: string; phase: 'held' | 'replied'; units: number[]; reply?: Draft; sendText?: string }

export const frameOf = (wf: { prs?: { id: number; review?: ReviewFrame }[] }, pr: number): ReviewFrame | undefined =>
	wf.prs?.find(unit => unit.id === pr)?.review
export const unitForJob = <T extends { job?: string }>(wf: { prs?: T[] }, jobId: string): T | undefined =>
	wf.prs?.find(unit => unit.job === jobId)
export const reviewedUnits = <T extends { review?: ReviewFrame }>(wf: { prs?: T[] }): T[] =>
	wf.prs?.filter(unit => !!unit.review?.done) ?? []

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
