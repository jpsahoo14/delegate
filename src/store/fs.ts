import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

export function readJson<T>(path: string, fallback: T): T {
	try {
		// Windows tools often save UTF-8 with a byte-order mark; JSON.parse rejects it.
		return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
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
	mkdirSync(dirname(path), { recursive: true })
	appendFileSync(path, JSON.stringify(value) + '\n')
}

export function listJson(dir: string): string[] {
	if (!existsSync(dir)) return []
	return readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('.tmp-')).sort().map(f => join(dir, f))
}

// One record per file, named by its id. Any other file is not a second record: OneDrive names a conflict copy
// "<id>-<machine>.json" or "<id> 2.json" (restart audit R8). strays() lists those files so doctor can show them.
export function records<T extends { id: string }>(dir: string): T[] {
	return listJson(dir).flatMap(f => { const r = readJson<T | null>(f, null); return r && `${r.id}.json` === basename(f) ? [r] : [] })
}
export function strays(dir: string): string[] {
	return listJson(dir).filter(f => { const r = readJson<{ id?: string } | null>(f, null); return !r || `${r.id}.json` !== basename(f) })
}

export function moveTo(path: string, dir: string): void {
	mkdirSync(dir, { recursive: true })
	retry(() => renameSync(path, join(dir, basename(path))))
}
