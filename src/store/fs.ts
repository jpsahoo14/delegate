import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// Time this process spent in the store's file calls, for the page server's slow-request log (#27): reads, writes, sleeps while
// OneDrive or antivirus held a file, and waits for a receipt lock (state.ts). Counted always; read as before-and-after differences.
export const fsTime = { read: 0, reads: 0, write: 0, writes: 0, wait: 0, lock: 0 }
const since = (t: number) => performance.now() - t

// Under the test runner nothing is written outside the temp folder: on 10-20 a broken test wrote fixture values into the owner's real config.
const TMP = [tmpdir(), '/tmp', '/private/tmp', '/private/var/folders', '/var/folders'].map(p => resolve(p))
export const inTemp = (path: string) => { const p = resolve(path); return TMP.some(t => p === t || p.startsWith(t + '/') || p.startsWith(t + '\\')) }
export function assertTestSafe(path: string): void {
	if (!process.env.NODE_TEST_CONTEXT) return
	if (!inTemp(path)) throw new Error(`A test tried to write outside the temp folder: ${resolve(path)}`)
}

// Inside one request each file is read and parsed once, however often it is asked for (bug 10-23 perf: every proposal was read
// once per proposal, 7 s a page on the owner's store). A write updates what it wrote, its folder's listing and records, and drops
// only what was derived from that folder; it never throws the rest away (#27 step 1: one log line used to clear it all).
// Lists come back as copies, so a caller that sorts one never changes what the next caller sees.
let scope: Map<string, unknown> | undefined
// A scope that writes (a page action, a receipt) hands out its own copy of each value, so a caller that changes what it read
// without saving it never changes what the next reader sees. A read-only scope (a page view) shares one parsed value.
let fresh = false
const MISSING = Symbol('missing')
export function readScope<T>(fn: () => T, opts: { writes?: boolean } = {}): T {
	if (scope) return fn()
	scope = new Map(); fresh = !!opts.writes
	try { return fn() } finally { scope = undefined; fresh = false }
}
const copy = <T>(v: T): T => (fresh && v && typeof v === 'object' ? structuredClone(v) : Array.isArray(v) ? [...v] as T : v)
// One value per request for anything derived from files (knowledge cards), computed once however often it is asked for. Its key
// ends with the folder it is derived from ("cards:<dir>"), so a write under that folder drops it.
export function scoped<T>(key: string, make: () => T): T {
	// A key that names no folder would never be dropped by a write (PE review of #27 step 1).
	if (!/^[a-z]+:.+[\\/]/.test(key)) throw new Error(`A derived value's key must be <kind>:<folder>, not "${key}".`)
	if (!scope) return make()
	if (scope.has(key)) return copy(scope.get(key) as T)
	const v = make()
	scope.set(key, v)
	return copy(v)
}
// Between page requests a file is read again only when it changed: every write replaces the file (a new name, time,
// and size), so its signature changes. Outside a page request nothing is kept.
const texts = new Map<string, { sig: string; text: string }>()
export function readText(path: string): string {
	const t = performance.now()
	try { return readTextNow(path) } finally { fsTime.read += since(t); fsTime.reads++ }
}
function readTextNow(path: string): string {
	if (!scope) return readFileSync(path, 'utf8')
	const st = statSync(path)
	const sig = `${st.mtimeMs}:${st.size}:${st.ino}`, hit = texts.get(path)
	if (hit?.sig === sig) return hit.text
	const text = readFileSync(path, 'utf8')
	texts.delete(path)
	texts.set(path, { sig, text })
	if (texts.size > 5000) texts.delete(texts.keys().next().value!)
	return text
}

export function readJson<T>(path: string, fallback: T): T {
	if (scope?.has(path)) { const v = scope.get(path); return v === MISSING ? fallback : copy(v as T) }
	try {
		// Windows tools often save UTF-8 with a byte-order mark; JSON.parse rejects it.
		const v = JSON.parse(readText(path).replace(/^\uFEFF/, '')) as T
		scope?.set(path, v)
		return copy(v)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') { scope?.set(path, MISSING); return fallback }
		throw error
	}
}

// Write a temp file, then rename, so a sync client never uploads half a file.
export function writeJson(path: string, value: unknown, machine: string): void {
	writeText(path, JSON.stringify(value, null, '\t') + '\n', machine)
}

export function writeText(path: string, text: string, machine: string): void {
	assertTestSafe(path)
	mkdirSync(dirname(path), { recursive: true })
	const tmp = `${path}.tmp-${machine}-${process.pid}-${randomUUID()}`, t = performance.now()
	const fd = openSync(tmp, 'wx')
	try {
		try { writeFileSync(fd, text) } finally { closeSync(fd) }
		retry(() => renameSync(tmp, path))
	} finally {
		rmSync(tmp, { force: true })
		fsTime.write += since(t); fsTime.writes++
	}
	wrote(path, true)
	// The next read in this scope parses what was written instead of reading it back from disk.
	if (scope && path.endsWith('.json')) { try { scope.set(path, JSON.parse(text.replace(/^\uFEFF/, ''))) } catch { /* read back when asked */ } }
}

// What a write, a move or a delete changes in this scope: the file's own value, its folder's listing, the folder's records, and
// anything derived from that folder or one above it. Other entries stay.
function wrote(path: string, exists: boolean) {
	if (!scope) return
	const dir = dirname(path), name = basename(path)
	scope.delete(path); scope.delete(`records:${dir}`)
	const listed = scope.get(`dir:${dir}`) as string[] | undefined
	if (listed && name.endsWith('.json') && !name.includes('.tmp-')) {
		const rest = listed.filter(f => f !== path)
		scope.set(`dir:${dir}`, exists ? [...rest, path].sort() : rest)
	}
	for (const key of [...scope.keys()]) {
		if (typeof key !== 'string' || key.startsWith('dir:') || key.startsWith('records:')) continue
		const from = /^[a-z]+:(.+)$/.exec(key)?.[1]
		if (from && (path.startsWith(from + '\\') || path.startsWith(from + '/'))) scope.delete(key)
	}
}

// Delete a store file, keeping this scope's view of its folder right.
export function removeFile(path: string): void {
	assertTestSafe(path)
	rmSync(path, { force: true })
	wrote(path, false)
}

// On Windows, OneDrive or antivirus can hold a file for a moment, so a rename may fail with EPERM or EBUSY.
function retry(fn: () => void, tries = 5) {
	for (let i = 1; ; i++) {
		try { return fn() } catch (e) {
			const code = (e as NodeJS.ErrnoException).code
			if (i >= tries || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
			const t = performance.now()
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * i)
			fsTime.wait += since(t)
		}
	}
}

export function appendLine(path: string, value: unknown): void {
	assertTestSafe(path)
	mkdirSync(dirname(path), { recursive: true })
	appendFileSync(path, JSON.stringify(value) + '\n')
	// Logs are read straight from disk, never through the scope, so an append changes nothing cached.
}

export function listJson(dir: string): string[] {
	const key = `dir:${dir}`
	if (scope?.has(key)) return [...scope.get(key) as string[]]
	const t = performance.now()
	const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('.tmp-')).sort().map(f => join(dir, f)) : []
	fsTime.read += since(t)
	scope?.set(key, files)
	return [...files]
}

// One record per file, named by its id. Any other file is not a second record: OneDrive names a conflict copy
// "<id>-<machine>.json" or "<id> 2.json" (restart audit R8). strays() lists those files so doctor can show them.
export function records<T extends { id: string }>(dir: string): T[] {
	const key = `records:${dir}`
	if (scope?.has(key)) return (scope.get(key) as T[]).map(copy)
	const out = listJson(dir).flatMap(f => { const r = readJson<T | null>(f, null); return r && `${r.id}.json` === basename(f) ? [r] : [] })
	scope?.set(key, out)
	return out.map(copy)
}
export function strays(dir: string): string[] {
	return listJson(dir).filter(f => { const r = readJson<{ id?: string } | null>(f, null); return !r || `${r.id}.json` !== basename(f) })
}

export function moveTo(path: string, dir: string): void {
	mkdirSync(dir, { recursive: true })
	const to = join(dir, basename(path)), had = scope?.get(path)
	retry(() => renameSync(path, to))
	wrote(path, false); wrote(to, true)
	if (had !== undefined && had !== MISSING) scope?.set(to, had)
}
