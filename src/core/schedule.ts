export type Poll = { idleMin: number; fastMin: number; fastForMin: number }
export type Schedule = { nextAt?: string; fastUntil?: string; backoff?: number }

export const DEFAULT_POLL: Poll = { idleMin: 15, fastMin: 1, fastForMin: 10 }
// During work hours a quiet spell is checked at least this often, so an answer never waits a quarter hour to be noticed (Bet 1).
export const WORK_IDLE_MIN = 5

type Local = { day: number; hour: number; label: string; date: string }
const fmt = new Map<string, Intl.DateTimeFormat>()
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// The owner's wall clock, not the runner's: an always-on machine often runs in UTC (review of Bet 1).
export const validTz = (tz: string | undefined): tz is string => { try { return !!tz && !!new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { return false } }

// An unknown zone falls back to this machine's, so a bad setting never stops a cycle.
function local(d: Date, tz?: string): Local {
	const key = validTz(tz) ? tz : ''
	if (!fmt.has(key)) fmt.set(key, new Intl.DateTimeFormat('en-US', { timeZone: key || undefined, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
	const p = Object.fromEntries(fmt.get(key)!.formatToParts(d).map(x => [x.type, x.value]))
	return { day: DAYS.indexOf(p.weekday), hour: Number(p.hour), label: `${p.weekday} ${p.hour}:${p.minute}`, date: `${p.day} ${p.month}` }
}

// Monday to Friday, 9:00 to 18:00, on the owner's clock.
export const isWorkHours = (d: Date, tz?: string) => { const l = local(d, tz); return l.day >= 1 && l.day <= 5 && l.hour >= 9 && l.hour < 18 }

// Loudly off (Bet 1): a spell with no cycle on the reading machine that swallowed half an hour of work hours.
export function offNotice(since: string | undefined, now: Date, machine: string, tz?: string): string | undefined {
	if (!since) return undefined
	const from = Date.parse(since)
	let work = 0
	for (let t = from; t < now.getTime() && work < 30; t += 5 * 60_000) if (isWorkHours(new Date(t), tz)) work += 5
	if (work < 30) return undefined
	const a = local(new Date(from), tz), b = local(now, tz)
	const long = now.getTime() - from > 86_400_000
	const at = (l: Local) => (long ? `${l.label.slice(0, 3)} ${l.date} ${l.label.slice(4)}` : l.label)
	return `I was not reading your chats from ${at(a)} to ${at(b)} (${machine} was asleep or off). I have caught up; anything new from that time is in your list.`
}

export const clock = (d: Date, tz?: string) => local(d, tz).label

// The owner's calendar day (YYYY-MM-DD) of a moment: weeks and days are counted on their clock (R-NEX-11).
const days = new Map<string, Intl.DateTimeFormat>()
export function dayIn(at: string | Date, tz?: string): string {
	const key = validTz(tz) ? tz : ''
	if (!days.has(key)) days.set(key, new Intl.DateTimeFormat('sv-SE', { timeZone: key || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }))
	return days.get(key)!.format(typeof at === 'string' ? new Date(at) : at)
}

// A tick is due when no next time is set or the next time has passed.
export function isDue(s: Schedule, now: Date): boolean {
	return !s.nextAt || Date.parse(s.nextAt) <= now.getTime()
}

// Activity opens or extends a fast window. The next tick comes sooner while the window is open.
export function plan(s: Schedule, now: Date, poll: Poll, activity: boolean, tz?: string): Schedule {
	const t = now.getTime()
	const fastUntil = activity ? new Date(t + poll.fastForMin * 60_000).toISOString() : s.fastUntil
	const fast = !!fastUntil && Date.parse(fastUntil) > t
	// Leave 10 s of slack so a scheduler that fires every minute never skips a fast tick; a gap under a minute
	// (only reached with a resident runner) keeps a tenth, so half a minute still waits about 30 s.
	// A longer quiet interval the owner chose on purpose is kept.
	const work = poll.idleMin <= DEFAULT_POLL.idleMin && isWorkHours(now, tz)
	const baseMs = (fast ? poll.fastMin : work ? Math.min(poll.idleMin, WORK_IDLE_MIN) : poll.idleMin) * 60_000
	const gapMs = baseMs - (baseMs < 60_000 ? baseMs / 10 : 10_000)
	return { fastUntil, nextAt: new Date(t + gapMs).toISOString() }
}
