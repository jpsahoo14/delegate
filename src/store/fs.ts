import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// Under the test runner nothing is written outside the temp folder: on 10-20 a broken test wrote fixture values into the owner's real config.
const TMP = [tmpdir(), '/tmp', '/private/tmp', '/private/var/folders', '/var/folders'].map(p => resolve(p))
export const inTemp = (path: string) => { const p = resolve(path); return TMP.some(t => p === t || p.startsWith(t + '/') || p.startsWith(t + '\\')) }
export function assertTestSafe(path: string): void {
	if (!process.env.NODE_TEST_CONTEXT) return
	if (!inTemp(path)) throw new Error(`A test tried to write outside the temp folder: ${resolve(path)}`)
}

// Inside one page request each file is read and parsed once, however often the page asks for it (bug 10-23 perf: every
// proposal was read once per proposal, 7 s a page on the owner's store). Any write clears it. Lists come back as copies,
// so a caller that sorts one never changes what the next caller sees.
let scope: Map<string, unknown> | undefined
const MISSING = Symbol('missing')
export function readScope<T>(fn: () => T): T {
	if (scope) return fn()
	scope = new Map()
	try { return fn() } finally { scope = undefined }
}
const copy = <T>(v: T): T => (Array.isArray(v) ? [...v] as T : v)
// One value per request for anything derived from files (knowledge cards), computed once however often it is asked for.
export function scoped<T>(key: string, make: () => T): T {
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
	scope?.clear()
	mkdirSync(dirname(path), { recursive: true })
	const tmp = `${path}.tmp-${machine}-${process.pid}-${randomUUID()}`
	const fd = openSync(tmp, 'wx')
	try {
		try { writeFileSync(fd, text) } finally { closeSync(fd) }
		retry(() => renameSync(tmp, path))
	} finally {
		rmSync(tmp, { force: true })
	}
}

// On Windows, OneDrive or antivirus can hold a file for a moment, so a rename may fail with EPERM or EBUSY.
function retry(fn: () => void, tries = 5) {
	for (let i = 1; ; i++) {
		try { return fn() } catch (e) {
			const code = (e as NodeJS.ErrnoException).code
			if (i >= tries || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * i)
		}
	}
}

export function appendLine(path: string, value: unknown): void {
	assertTestSafe(path)
	scope?.clear()
	mkdirSync(dirname(path), { recursive: true })
	appendFileSync(path, JSON.stringify(value) + '\n')
}

export function listJson(dir: string): string[] {
	const key = `dir:${dir}`
	if (scope?.has(key)) return [...scope.get(key) as string[]]
	const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('.tmp-')).sort().map(f => join(dir, f)) : []
	scope?.set(key, files)
	return [...files]
}

// One record per file, named by its id. Any other file is not a second record: OneDrive names a conflict copy
// "<id>-<machine>.json" or "<id> 2.json" (restart audit R8). strays() lists those files so doctor can show them.
export function records<T extends { id: string }>(dir: string): T[] {
	const key = `records:${dir}`
	if (scope?.has(key)) return [...scope.get(key) as T[]]
	const out = listJson(dir).flatMap(f => { const r = readJson<T | null>(f, null); return r && `${r.id}.json` === basename(f) ? [r] : [] })
	scope?.set(key, out)
	return [...out]
}
export function strays(dir: string): string[] {
	return listJson(dir).filter(f => { const r = readJson<{ id?: string } | null>(f, null); return !r || `${r.id}.json` !== basename(f) })
}

export function moveTo(path: string, dir: string): void {
	scope?.clear()
	mkdirSync(dir, { recursive: true })
	retry(() => renameSync(path, join(dir, basename(path))))
}
