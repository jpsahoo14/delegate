const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
const times = new Map<string, string>()
export function time(date: Date): string {
	const key = `${date.getTime()}|${date.getTimezoneOffset()}|${typeof navigator === 'undefined' ? '' : navigator.language}`
	const cached = times.get(key)
	if (cached !== undefined) return cached
	const value = date.toLocaleTimeString([], timeOptions)
	if (times.size >= 1024) times.delete(times.keys().next().value!)
	times.set(key, value)
	return value
}

export function when(iso: string | undefined): string {
	if (!iso) return ''
	const date = new Date(iso), day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
	const diff = Math.round((day(new Date()) - day(date)) / 86_400_000)
	if (diff === 0) return time(date)
	if (diff === 1) return `yesterday ${time(date)}`
	if (diff === -1) return `tomorrow ${time(date)}`
	if (Math.abs(diff) < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} ${time(date)}`
	return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// When a message was sent, like Teams' chat list (spec S8): compact in list rows, full on the card head and in hover text.
const dayOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
const daysAgo = (date: Date, now = new Date()) => Math.round((dayOf(now) - dayOf(date)) / 86_400_000)
export function sentCompact(iso: string, now = new Date()): string {
	const date = new Date(iso), d = daysAgo(date, now)
	if (d <= 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
	if (d === 1) return 'Yesterday'
	if (d < 7) return date.toLocaleDateString([], { weekday: 'short' })
	return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
export function sentFull(iso: string, now = new Date()): string {
	const date = new Date(iso), d = daysAgo(date, now)
	if (d <= 0) return `Today ${time(date)}`
	if (d === 1) return `Yesterday ${time(date)}`
	return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time(date)}`
}
// Waiting on the owner for more than 2 working days: the time is drawn in the warning color (spec S8).
export function overdue(iso: string, now = new Date()): number | undefined {
	let d = new Date(iso), work = 0
	const days = daysAgo(d, now)
	for (let i = 1; i <= days; i++) { d = new Date(dayOf(new Date(iso)) + i * 86_400_000); if (d.getDay() !== 0 && d.getDay() !== 6) work++ }
	return work > 2 ? days : undefined
}
