export const DONE_FILTER_KEYS = ['all', 'replies', 'reviews', 'changes', 'reminders', 'learned', 'catchup'] as const
export type DoneFilter = typeof DONE_FILTER_KEYS[number]
export const DONE_FILTERS: Record<DoneFilter, { label: string; kinds: readonly string[] }> = {
	all: { label: 'All', kinds: ['reply', 'review', 'change', 'reminder', 'learned', 'catchup'] },
	replies: { label: 'Replies', kinds: ['reply', 'review'] }, reviews: { label: 'Reviews', kinds: ['review'] },
	changes: { label: 'Changes', kinds: ['change'] }, reminders: { label: 'Reminders', kinds: ['reminder'] },
	learned: { label: 'Learned', kinds: ['learned'] }, catchup: { label: 'Catch up', kinds: ['catchup'] },
}

export function isDoneFilter(value: unknown): value is DoneFilter {
	return typeof value === 'string' && Object.hasOwn(DONE_FILTERS, value)
}

export function matchesDone(row: { kind: string; at: string }, filter: DoneFilter, since?: string): boolean {
	return DONE_FILTERS[filter].kinds.includes(row.kind) && (since === undefined || row.at > since)
}

export type ChangeKind = 'task' | 'pr' | 'invite' | 'other'
type HomeDoneRow = { kind: string; at: string; who: { name: string }; by: string; rule?: string; change?: ChangeKind; comments?: number; facts?: number }
export type HomeDoneTile = { key: string; filter: DoneFilter; since: string; count: number; label: string; sub?: string }

export function homeTiles(rows: readonly HomeDoneRow[], since: string): HomeDoneTile[] {
	const selected = (filter: DoneFilter) => rows.filter(row => matchesDone(row, filter, since))
	const replies = selected('replies'), reviews = selected('reviews'), changes = selected('changes')
	const reminders = selected('reminders'), learned = selected('learned')
	const people = new Set(replies.map(row => row.who.name)).size
	const byRule = replies.filter(row => !!row.rule).length
	const comments = reviews.reduce((count, row) => count + (row.comments ?? 0), 0)
	const facts = learned.reduce((count, row) => count + (row.facts ?? 0), 0)
	const breakdown = (['task', 'pr', 'invite', 'other'] as const).flatMap(kind => {
		const count = changes.filter(row => (row.change ?? 'other') === kind).length
		const label = kind === 'pr' ? count === 1 ? 'PR' : 'PRs' : kind === 'other' ? 'other' : `${kind}${count === 1 ? '' : 's'}`
		return count ? [`${count} ${label}`] : []
	})
	const tile = (filter: DoneFilter, count: number, sub?: string): HomeDoneTile => ({
		key: filter, filter, since, count, label: `${DONE_FILTERS[filter].label} ${count}`, ...(sub ? { sub } : {}),
	})
	return [
		tile('replies', replies.length, `${people} ${people === 1 ? 'person' : 'people'} \u00b7 ${replies.length - byRule} by you, ${byRule} by your rules`),
		tile('reviews', reviews.length, comments ? `${comments} comment${comments === 1 ? '' : 's'} posted` : undefined),
		tile('changes', changes.length, breakdown.join(' \u00b7 ')),
		{ ...tile('reminders', reminders.length), label: reminders.length === 1 ? 'Sent 1 reminder' : `Sent ${reminders.length} reminders` },
		tile('learned', learned.length, facts ? `${facts} ${facts === 1 ? 'fact' : 'facts'}` : undefined),
	].filter(value => value.count > 0)
}
