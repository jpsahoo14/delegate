import { appendFileSync as fsAppend, closeSync as fsClose, mkdirSync as fsMkdir, openSync as fsOpen, readdirSync as fsReadDir, readFileSync as fsRead, renameSync as fsRename, rmSync as fsRemove, statSync as fsStat, writeFileSync as fsWrite } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

// Time this process spent in the store's file calls, for the page server's slow-request log (#27): reads, writes, sleeps while
// OneDrive or antivirus held a file, and waits for a receipt lock (state.ts). Counted always; read as before-and-after differences.
export const fsTime = { read: 0, reads: 0, write: 0, writes: 0, wait: 0, lock: 0, stats: 0, opens: 0, lists: 0, hits: 0, io: 0 }
const since = (t: number) => performance.now() - t

function fileCall<T extends Function>(get: () => T): T {
	return new Proxy(get(), { apply(_target, receiver, args: unknown[]) {
		const started = performance.now()
		try { return Reflect.apply(get(), receiver, args) } finally { fsTime.io += since(started) }
	} })
}
const appendFileSync = fileCall(() => fsAppend), closeSync = fileCall(() => fsClose), mkdirSync = fileCall(() => fsMkdir)
const openSync = fileCall(() => fsOpen), readdirSync = fileCall(() => fsReadDir), readFileSync = fileCall(() => fsRead)
const renameSync = fileCall(() => fsRename), rmSync = fileCall(() => fsRemove), statSync = fileCall(() => fsStat), writeFileSync = fileCall(() => fsWrite)

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
type Entry = { value: unknown; path: string; kind: 'file' | 'list' | 'derived'; version: number; epoch: number; sig?: string }
type Listing = { dir: string; names: string[]; files: string[] }
type Signature = { epoch: number; version: number; sig: string }
type Scope = { name: string; entries: Map<string, Entry>; signatures: Map<string, Signature>; writes: boolean; phase: boolean; verifyAll: boolean; epoch: number; until: number; closed: boolean }
const scopes = new AsyncLocalStorage<Scope>()
const versions = new Map<string, number>()
let version = 0
const EPOCH_MS = 1000
const pathKeys = new Map<string, string>()
function canonical(path: string): string {
	if (!isAbsolute(path)) return process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
	const hit = pathKeys.get(path)
	if (hit) return hit
	const key = process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
	pathKeys.set(path, key)
	if (pathKeys.size > 5000) pathKeys.delete(pathKeys.keys().next().value!)
	return key
}
const versionOf = (path: string) => versions.get(canonical(path)) ?? 0
const makeScope = (name: string, writes: boolean, phase = false): Scope => ({
	name, writes, phase, verifyAll: false, entries: new Map(), signatures: new Map(), epoch: 0, until: performance.now() + EPOCH_MS, closed: false,
})
function current(): Scope | undefined {
	const s = scopes.getStore()
	if (!s || s.closed) return undefined
	if (s.phase && performance.now() >= s.until) { s.epoch++; s.until = performance.now() + EPOCH_MS; s.signatures.clear() }
	return s
}
function closeScope(s: Scope) { s.closed = true; s.entries.clear(); s.signatures.clear() }
const MISSING = Symbol('missing')
export function readScope<T>(fn: () => T, opts: { writes?: boolean } = {}): T {
	if (current()) return fn()
	const s = makeScope('sync', !!opts.writes)
	return scopes.run(s, () => { try { return fn() } finally { closeScope(s) } })
}
export async function readPhase<T>(name: string, work: () => Promise<T>, opts: { writes?: boolean } = {}): Promise<T> {
	const s = makeScope(name, opts.writes !== false, true)
	try { return await scopes.run(s, work) } finally { closeScope(s) }
}
export function freshRead<T>(work: () => T): T {
	const s = makeScope('fresh', true, true)
	s.verifyAll = true
	return scopes.run(s, () => { try { return work() } finally { closeScope(s) } })
}
const copy = <T>(v: T): T => (current()?.writes && v && typeof v === 'object' ? structuredClone(v) : Array.isArray(v) ? [...v] as T : v)
function signature(path: string, s: Scope): string {
	const key = canonical(path), v = versionOf(path), old = s.signatures.get(key)
	if (old?.epoch === s.epoch && old.version === v) return old.sig
	fsTime.stats++
	let sig: string
	try { const st = statSync(path); sig = `${st.mtimeMs}:${st.size}:${st.ino}` }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; sig = '' }
	s.signatures.set(key, { epoch: s.epoch, version: v, sig })
	return sig
}
function cached(s: Scope, key: string): Entry | undefined {
	const e = s.entries.get(key)
	if (!e) return undefined
	if (e.version !== versionOf(e.path)) { s.entries.delete(key); return undefined }
	if (s.phase && e.epoch !== s.epoch) {
		const sig = signature(e.path, s)
		// A derived value can depend on descendants whose parent's mtime does not change.
		if (e.kind === 'derived' || e.sig !== sig) { s.entries.delete(key); return undefined }
		e.epoch = s.epoch
	}
	fsTime.hits++
	return e
}
function remember(s: Scope, key: string, value: unknown, path: string, kind: Entry['kind'], sig?: string) {
	s.entries.set(key, { value, path: canonical(path), kind, version: versionOf(path), epoch: s.epoch, sig })
}
// One value per request for anything derived from files (knowledge cards), computed once however often it is asked for. Its key
// ends with the folder it is derived from ("cards:<dir>"), so a write under that folder drops it.
export function scoped<T>(key: string, make: () => T): T {
	// A key that names no folder would never be dropped by a write (PE review of #27 step 1).
	if (!/^[a-z]+:.+[\\/]/.test(key)) throw new Error(`A derived value's key must be <kind>:<folder>, not "${key}".`)
	const s = current(), folder = key.slice(key.indexOf(':') + 1)
	if (!s) return make()
	const e = cached(s, key)
	if (e) return copy(e.value as T)
	const v = make()
	remember(s, key, v, folder, 'derived', signature(folder, s))
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
	const s = current()
	if (!s) { fsTime.opens++; return readFileSync(path, 'utf8') }
	const key = `text:${canonical(path)}`, e = cached(s, key)
	if (e) return e.value as string
	const sig = signature(path, s), hit = texts.get(canonical(path))
	if (hit?.sig === sig) {
		fsTime.hits++
		remember(s, key, hit.text, path, 'file', sig)
		return hit.text
	}
	fsTime.opens++
	const text = readFileSync(path, 'utf8')
	texts.delete(canonical(path))
	texts.set(canonical(path), { sig, text })
	if (texts.size > 5000) texts.delete(texts.keys().next().value!)
	remember(s, key, text, path, 'file', sig)
	return text
}

export function readJson<T>(path: string, fallback: T): T {
	return readJsonNow(path, fallback, true)
}
function readJsonNow<T>(path: string, fallback: T, copies: boolean): T {
	const s = current(), key = canonical(path), e = s && cached(s, key)
	if (e) return e.value === MISSING ? fallback : copies ? copy(e.value as T) : e.value as T
	try {
		// Windows tools often save UTF-8 with a byte-order mark; JSON.parse rejects it.
		const v = JSON.parse(readText(path).replace(/^\uFEFF/, '')) as T
		if (s) remember(s, key, v, path, 'file', signature(path, s))
		return copies ? copy(v) : v
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') { if (s) remember(s, key, MISSING, path, 'file', ''); return fallback }
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
	const s = current()
	if (s && path.endsWith('.json')) { try { remember(s, canonical(path), JSON.parse(text.replace(/^\uFEFF/, '')), path, 'file') } catch { /* read back when asked */ } }
}

// What a write, a move or a delete changes in this scope: the file's own value, its folder's listing, the folder's records, and
// anything derived from that folder or one above it. Other entries stay.
function wrote(path: string, exists: boolean) {
	const s = current(), dir = dirname(path), name = basename(path), key = `dir:${canonical(dir)}`
	const oldList = s?.entries.get(key)
	const listed = oldList && oldList.version === versionOf(dir) && (!s?.phase || oldList.epoch === s.epoch) ? oldList.value as Listing : undefined
	const v = ++version
	for (let p = canonical(path); ; p = dirname(p)) {
		versions.set(p, v)
		if (dirname(p) === p) break
	}
	texts.delete(canonical(path))
	if (!s) return
	s.entries.delete(canonical(path)); s.entries.delete(`text:${canonical(path)}`); s.entries.delete(`records:${canonical(dir)}`)
	s.entries.delete(key)
	if (listed && name.endsWith('.json') && !name.includes('.tmp-')) {
		const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
		const rest = listed.names.filter(f => !same(f, name)), names = exists ? [...rest, name].sort() : rest
		remember(s, key, { dir: listed.dir, names, files: names.map(f => join(listed.dir, f)) }, dir, 'list')
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
			const waited = since(t)
			fsTime.wait += waited; fsTime.io += waited
		}
	}
}

export function appendLine(path: string, value: unknown): void {
	assertTestSafe(path)
	mkdirSync(dirname(path), { recursive: true })
	appendFileSync(path, JSON.stringify(value) + '\n')
	wrote(path, true)
}

export function listJson(dir: string): string[] {
	const key = `dir:${canonical(dir)}`, s = current(), e = s && cached(s, key)
	if (e) {
		const listed = e.value as Listing
		return listed.dir === dir ? [...listed.files] : listed.names.map(name => join(dir, name))
	}
	const t = performance.now()
	const sig = s ? signature(dir, s) : undefined
	let names: string[]
	try {
		fsTime.lists++
		names = readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('.tmp-')).sort()
	} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; names = [] }
	fsTime.read += since(t)
	const files = names.map(name => join(dir, name))
	if (s) remember(s, key, { dir, names, files }, dir, 'list', sig)
	return [...files]
}

// One record per file, named by its id. Any other file is not a second record: OneDrive names a conflict copy
// "<id>-<machine>.json" or "<id> 2.json" (restart audit R8). strays() lists those files so doctor can show them.
type RecordSnapshot = { value: { id: string }[]; sig: string; version: number; until: number }
const recordSnapshots = new Map<string, RecordSnapshot>()
let snapshotRecords = 0
function keepRecords(path: string, snapshot: RecordSnapshot) {
	snapshotRecords -= recordSnapshots.get(path)?.value.length ?? 0
	recordSnapshots.delete(path); recordSnapshots.set(path, snapshot)
	snapshotRecords += snapshot.value.length
	while (snapshotRecords > 5000 || recordSnapshots.size > 1000) {
		const oldest = recordSnapshots.keys().next().value!
		snapshotRecords -= recordSnapshots.get(oldest)!.value.length
		recordSnapshots.delete(oldest)
	}
}
export function records<T extends { id: string }>(dir: string): T[] {
	const key = `records:${canonical(dir)}`, s = current(), e = s && cached(s, key)
	if (e) return copy(e.value as T[])
	const started = performance.now(), sig = s && signature(dir, s), v = versionOf(dir)
	const snapshot = s?.phase && !s.verifyAll ? recordSnapshots.get(canonical(dir)) : undefined
	if (s && snapshot && snapshot.sig === sig && snapshot.version === v && started < snapshot.until) {
		const value = s.writes ? snapshot.value : structuredClone(snapshot.value)
		s.until = Math.min(s.until, snapshot.until)
		remember(s, key, value, dir, 'derived', sig)
		fsTime.hits++
		return copy(value as T[])
	}
	const out = listJson(dir).flatMap(f => { const r = readJsonNow<T | null>(f, null, false); return r && `${r.id}.json` === basename(f) ? [r] : [] })
	if (s) {
		remember(s, key, out, dir, 'derived', sig)
		if (s.phase && out.length <= 5000) {
			const until = Math.min(s.until, started + EPOCH_MS)
			keepRecords(canonical(dir), { value: structuredClone(out), sig: sig ?? '', version: v, until })
			s.until = until
		}
	}
	return copy(out)
}
export function strays(dir: string): string[] {
	return listJson(dir).filter(f => { const r = readJson<{ id?: string } | null>(f, null); return !r || `${r.id}.json` !== basename(f) })
}

export function moveTo(path: string, dir: string): void {
	mkdirSync(dir, { recursive: true })
	const to = join(dir, basename(path)), s = current(), had = s && cached(s, canonical(path))
	retry(() => renameSync(path, to))
	wrote(path, false); wrote(to, true)
	if (s && had && had.value !== MISSING) remember(s, canonical(to), had.value, to, 'file')
}
