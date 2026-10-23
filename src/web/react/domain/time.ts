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
