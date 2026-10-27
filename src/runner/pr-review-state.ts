import type { ReviewFrame } from '../core/review.ts'
import type { PrUnit, Workflow } from '../core/types.ts'

export function bumpReviewEpoch(unit: PrUnit): ReviewFrame {
	const previous = unit.review
	if (previous && (!Number.isSafeInteger(previous.epoch) || previous.epoch < 0))
		throw new Error('The PR review has an invalid epoch')
	const epoch = previous ? previous.epoch + 1 : 1
	if (!Number.isSafeInteger(epoch)) throw new Error('The PR review epoch is exhausted')
	return unit.review = { ...previous, epoch }
}

export function resetUnitReview(unit: PrUnit): void {
	const { epoch } = bumpReviewEpoch(unit)
	unit.review = { epoch }
}

export function clearReviewRequests(wf: Pick<Workflow, 'prs'>): void {
	for (const unit of wf.prs ?? []) if (unit.requested) {
		unit.requested = undefined
		bumpReviewEpoch(unit)
	}
}
