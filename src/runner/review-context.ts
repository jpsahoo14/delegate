import type { Fact, Job, Workflow } from '../core/types.ts'
import { isReviewJob } from './review-gate.ts'

// Keep review code facts, not CI/vote status or warning emphasis; author watches keep their original context (#8).
export const reviewNoise = (text: string) => /\b(?:builds?|pipelines?|CI|checks? (?:failed|passed|pending|running)|validation runs?)\b/i.test(text) || /\b(?:votes?|voted)\b/i.test(text)

export type ReviewContextTrim = { context: Fact[] | undefined; dropped: number; warns: number }
export function trimReviewContext(job: Pick<Job, 'key' | 'every'>, parents: readonly Pick<Workflow, 'prRole'>[],
	context: Fact[] | undefined, intent?: string): ReviewContextTrim {
	if (!context?.length || !isReviewJob(job.key, intent) || job.every || parents.some(w => w.prRole === 'author'))
		return { context, dropped: 0, warns: 0 }
	const kept = context.filter(f => !reviewNoise(`${f.label} ${f.text}`)).map(f => ({ ...f, tone: 'info' as const }))
	return { context: kept.length ? kept : undefined, dropped: context.length - kept.length,
		warns: context.filter(f => f.tone === 'warn').length }
}
