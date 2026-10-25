import { DEFAULT_POLL } from '../core/schedule.ts'
import type { Store } from '../store/state.ts'

export function recordReplyActivity(store: Store, at: string): void {
	const replyAt = Date.parse(at), now = Date.now()
	if (!Number.isFinite(replyAt) || replyAt > now) {
		store.log({ event: 'reply-poll-skipped', reason: 'invalid or future reply time' })
		return
	}
	const poll = { ...DEFAULT_POLL, ...store.config().poll }, schedule = store.schedule()
	const until = replyAt + poll.fastForMin * 60_000
	if (until <= now || until <= Date.parse(schedule.fastUntil ?? '')) return
	store.saveSchedule({ ...schedule, fastUntil: new Date(until).toISOString() })
}

export function recordSentReplyActivity(store: Store): void {
	const latest = store.workflows().map(w => w.sent?.at).filter((at): at is string => !!at).sort().at(-1)
	if (latest) recordReplyActivity(store, latest)
}
