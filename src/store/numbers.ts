import { statSync } from 'node:fs'
import type { Store } from './state.ts'
import { readJson } from './fs.ts'
import { addDays, numbers, slim, weekOf, type Ev, type Item, type Numbers, type WindowKey } from '../core/numbers.ts'
import { dayIn } from '../core/schedule.ts'

// Where the Numbers tab's lines come from (R-NEX-11). A finished week is read from its file, one per machine and week,
// so the 8-week view never rescans every log; the week still going, and a week with no file yet, are read from the log.
// Files hold UTC weeks, the same weeks as the log's file names; the owner's zone applies only when counting, so a zone, or a change of it, never splits a line off.
// schema 2: UTC weeks, and sends that say whether they can still prove they were drafted. An older file is left alone and read from the log.
type WeekFile = { schema: 2; machine: string; week: string; at: string; events: Ev[] }
const SCHEMA = 2

function fromLog(store: Store, machine: string, week: string): Ev[] {
	const files = store.logFiles().filter(f => f.machine === machine && f.day >= week && f.day <= addDays(week, 6))
	// A line is in the file of its own UTC day, so the week's 7 files hold exactly its lines.
	return slim(files.flatMap(f => store.logOf(f.file)))
}

const split = (k: string) => [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)]

// from: the first week to read (a Monday), for a count that needs only recent weeks (the Since line, review P2-4).
export function counted(store: Store, from = ''): Ev[] {
	const saved = new Map(store.numberWeeks().filter(w => w.week >= from).map(w => [`${w.machine}|${w.week}`, w.file]))
	const pairs = new Set([...saved.keys(), ...store.logFiles().filter(f => weekOf(f.day) >= from).map(f => `${f.machine}|${weekOf(f.day)}`)])
	return [...pairs].flatMap(k => {
		const file = saved.get(k), w = file ? readJson<WeekFile | undefined>(file, undefined) : undefined
		return w?.schema === SCHEMA ? w.events : fromLog(store, ...split(k) as [string, string])
	})
}

// Once a day the runner writes each finished week that has no file yet, for every machine whose log it reads: its own once the
// week is over; another machine's a week later, and only once a later day of that machine's log shows it synced past the week. Each file is <machine>-<week>.json and is
// written once: a week's lines cannot change after it ends, so whichever runner writes it writes the same lines, and none ever rewrites one.
export function saveWeeks(store: Store, now = new Date()): number {
	const week = weekOf(now.toISOString().slice(0, 10)), have = new Map(store.numberWeeks().map(w => [`${w.machine}|${w.week}`, w.file]))
	// Another machine's week counts as complete only once a later day of its log has arrived here; until then it is read from the log.
	const files = store.logFiles(), last = new Map<string, string>()
	for (const f of files) if (f.day > (last.get(f.machine) ?? '')) last.set(f.machine, f.day)
	// OneDrive uploads files one by one and a day file is appended all day: the week's own files must also have stopped changing.
	const quiet = (m: string, w: string) => files.filter(f => f.machine === m && weekOf(f.day) === w).every(f => now.getTime() - statSync(f.file).mtimeMs > 6 * 3_600_000)
	const synced = (m: string, w: string) => (last.get(m) ?? '') > addDays(w, 6) && quiet(m, w)
	const done = [...new Set(files.map(f => `${f.machine}|${weekOf(f.day)}`))].filter(k => { const [m, w] = split(k); return m === store.machine ? w < week : w < addDays(week, -7) && synced(m, w) }).sort()
	const kept = done.filter(k => have.has(k) && readJson<{ schema?: number }>(have.get(k)!, {}).schema !== SCHEMA)
	let n = 0
	for (const k of done.filter(k => !have.has(k))) {
		const [m, w] = split(k)
		if (store.saveNumberWeek(m, w, { schema: SCHEMA, machine: m, week: w, at: now.toISOString(), events: fromLog(store, m, w) } satisfies WeekFile)) n++
		else kept.push(k)
	}
	if (kept.length) store.log({ event: 'numbers-weeks-kept', weeks: kept.map(k => k.replace('|', '-')), why: 'A week file is never rewritten; these are read from the log instead.' })
	return n
}

export function numbersOf(store: Store, key: WindowKey = 'this', now = new Date()): Numbers {
	return numbers(counted(store), store.workflows(), now, store.config()?.tz, key)
}

// The Since line's "handled" on the new page (N1b): this week's count, as the Numbers tab makes it, from this week and last
// only (last week covers the time zone's edge), so its cost does not grow with the history (review P2-4). /data is asked every
// 20 seconds, so the count is made again only when one of those weeks' log or week files changes, the items change, or the
// day turns. Per store, so tests and machines never share it.
const handledCache = new Map<string, { key: string; n: number }>()
export function handledThisWeek(store: Store, items: Item[], now = new Date()): number {
	const tz = store.config()?.tz, today = dayIn(now, tz), from = addDays(weekOf(today), -7)
	const key = [today, items.length, items.reduce((n, w) => n + w.msgIds.length, 0), ...store.numberWeeks().filter(w => w.week >= from).map(w => w.file),
		...store.logFiles().filter(f => weekOf(f.day) >= from).map(f => { try { const st = statSync(f.file); return `${f.file}:${st.size}:${st.mtimeMs}` } catch { return f.file } })].join('|')
	const had = handledCache.get(store.root)
	if (had?.key === key) return had.n
	const n = numbers(counted(store, from), items, now, tz, 'this').handled.n
	handledCache.set(store.root, { key, n })
	return n
}
