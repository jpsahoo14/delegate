import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { assertTestSafe } from '../store/fs.ts'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Owner } from '../core/types.ts'
import type { Store } from '../store/state.ts'
import { findSession } from '../mesh/route.ts'
import type { SessionEntry } from '../mesh/inbox.mjs'
import { scrub } from '../core/secrets.ts'

const sessions = () => join(process.env.COPILOT_HOME ?? join(homedir(), '.copilot'), 'session-state')
export const sessionExists = (id: string) => existsSync(join(sessions(), id, 'events.jsonl'))
export const sessionBytes = (id: string) => { try { return statSync(join(sessions(), id, 'events.jsonl')).size } catch { return 0 } }

// The folder a session works in, from its own settings file.
export function sessionCwd(id: string): string | undefined {
	const f = join(sessions(), id, 'workspace.yaml')
	return existsSync(f) ? readFileSync(f, 'utf8').match(/^cwd:\s*(.+)$/m)?.[1].trim() : undefined
}

// A fork is a copy under a new ID, so the owner's session never changes (R-ADP-03; measured in dev-spec slice 07).
// Cloud-sync fields are dropped so the copy does not report as the original.
export function forkSession(id: string): string | undefined {
	if (!sessionExists(id)) return undefined
	const copy = randomUUID()
	// Links are not copied: one could point back into the original, and the fork must never write there (tester 06-07 P1-2).
	assertTestSafe(sessions())
	cpSync(join(sessions(), id), join(sessions(), copy), { recursive: true, filter: s => !s.endsWith('.lock') && !lstatSync(s).isSymbolicLink() })
	const f = join(sessions(), copy, 'workspace.yaml')
	if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace(/^id:.*$/m, `id: ${copy}`).replace(/^mc_[a-z_]+:.*\n/gm, ''))
	return copy
}

const plain = (s: string) => !s.endsWith('.lock') && !lstatSync(s).isSymbolicLink()

// After each run the session's history is copied to the storage folder, so another machine can continue it (R-STO-07).
// Only the files a resume reads: a session folder can hold thousands of others, and each copy syncs.
// events.jsonl only grows, so a copy may move forward only when one history starts with the other. Diverged copies are both kept (review 085 P0-3).
const isPrefix = (a: Buffer, b: Buffer) => a.length <= b.length && b.subarray(0, a.length).equals(a)
const read = (p: string) => (existsSync(p) && plain(p) ? readFileSync(p) : undefined)
function put(p: string, data: Buffer | string) {
	assertTestSafe(p)
	mkdirSync(dirname(p), { recursive: true })
	const tmp = `${p}.tmp-${process.pid}`
	writeFileSync(tmp, data)
	renameSync(tmp, p)
}
function move(from: string, to: string, events: Buffer) {
	if (existsSync(join(from, 'workspace.yaml'))) put(join(to, 'workspace.yaml'), readFileSync(join(from, 'workspace.yaml')))
	put(join(to, 'events.jsonl'), events)
}
function diverged(store: Store, id: string, dir: string, events: Buffer) {
	put(join(dir, `events.conflict-${store.machine}-${Date.now()}.jsonl`), events)
	store.setHealth(`session:${id}`, `The AI session ${id.slice(0, 8)} was changed on two machines. Both copies are kept in ${dir}; the newest work here continues.`)
}

// The session holds raw tool output (telemetry, pipeline logs). Secrets are hidden in the copy that is synced, and the prefix check
// compares it with a scrubbed copy of this machine's file, so one history stays one history (review 10-21 P2-6).
export function backupSession(store: Store, id: string): boolean {
	const from = join(sessions(), id), to = join(store.root, 'sessions', id)
	const raw = read(join(from, 'events.jsonl')), shared = read(join(to, 'events.jsonl'))
	// The AI CLI's live file is never rewritten (it may be open in a window or a relay); only the synced copy is scrubbed (round 2 P2-5).
	const local = raw && scrubbed(raw)
	if (!local) return false
	if (shared && !isPrefix(shared, local)) {
		if (!isPrefix(local, shared)) diverged(store, id, to, local)
		return false
	}
	move(from, to, local)
	return true
}

export function restoreSession(store: Store, id: string): boolean {
	const from = join(store.root, 'sessions', id), to = join(sessions(), id)
	// The synced copy is scrubbed, so this machine's file is compared as it would be synced; it is replaced only when another machine
	// took the session further (round 2 P2-5).
	const shared = read(join(from, 'events.jsonl')), raw = read(join(to, 'events.jsonl')), local = raw && scrubbed(raw)
	if (!shared || (local && isPrefix(shared, local))) return false
	if (local && !isPrefix(local, shared)) { diverged(store, id, to, shared); return false }
	move(from, to, shared)
	return true
}

export function own(store: Store, what: string, session: string | undefined): string {
	if (!session) return 'Say this inside the session you want to keep for these asks.'
	const owners = store.owners().filter(o => o.session !== session)
	const id = `o${Math.max(0, ...store.owners().map(o => Number(o.id.slice(1)) || 0)) + 1}`
	owners.push({ id, what: what.trim(), session, cwd: sessionCwd(session) ?? process.cwd(), machine: store.machine, at: new Date().toISOString() })
	store.saveOwners(owners)
	return `Asks about ${what.trim()} will be answered in a copy of this session, so this chat stays as it is. Each answer costs more than a fresh session, because it carries this session's history. Results show in your inbox. Say "disown" here to stop.`
}

export function disown(store: Store, session: string | undefined): string {
	const mine = store.owners().filter(o => o.session === session)
	if (!mine.length) return 'This session does not own any asks.'
	store.saveOwners(store.owners().filter(o => o.session !== session))
	return `Stopped: asks about ${mine.map(o => o.what).join(', ')} go to fresh sessions again.`
}

// The owner session a worker picked, if it can be used here; otherwise why not (R-ADP-05).
// When that session is open on any machine, the ask goes into it as a message instead (research/cross-session-opus.md).
export function ownerFor(store: Store, id: string | undefined): { owner?: Owner; why?: string; open?: SessionEntry } {
	const owner = id ? store.owners().find(o => o.id === id) : undefined
	if (!owner) return {}
	const open = findSession(store, owner.session)
	if (open?.open) return { owner, open }
	if (owner.machine !== store.machine) return { why: `your session for ${owner.what} is on ${owner.machine} and not open, so a fresh session was used` }
	if (!sessionExists(owner.session)) {
		store.saveOwners(store.owners().filter(o => o.id !== owner.id))
		return { why: `your session for ${owner.what} no longer exists, so it was released and a fresh session was used` }
	}
	return { owner }
}

function scrubbed(raw: Buffer): Buffer {
	const text = raw.toString('utf8'), clean = scrub(text)
	return clean === text ? raw : Buffer.from(clean, 'utf8')
}
