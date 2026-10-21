import { createHash } from 'node:crypto'
import { assertTestSafe } from '../store/fs.ts'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MESH_DIR } from '../paths.ts'
import { LOCAL_DIR, type Store } from '../store/state.ts'
import { addr, closeDead, dirs, listSessions, readInbox, readReceipt, settle, subdirs, writeJsonAtomic, writeMessage, type Message, type Receipt, type SessionEntry } from './inbox.mjs'
import { NAME, CMD } from '../brand.ts'

// The Copilot CLI loads <copilot home>/extensions/<name>/extension.mjs into every session it starts or resumes (docs: about-cli-extensions).
// In CLI 1.0.98 extensions are an experimental feature: measured, none load until enabledFeatureFlags.EXTENSIONS (or "experimental") is on.
export const EXTENSION = 'delegate-inbox'
const FILES = ['extension.mjs', 'inbox.mjs']
const MARK = 'delegate.json'
const hash = (f: string) => createHash('sha256').update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
export const extensionDir = (copilotHome: string) => join(copilotHome, 'extensions', EXTENSION)
const ours = (dir: string) => existsSync(join(dir, MARK))
type Mark = { by: 'delegate'; local: string; setFlag?: boolean; createdSettings?: boolean }

// settings.json may carry // comments. Delegate reads such a file but never rewrites it, so no comment is lost.
type Settings = { enabledFeatureFlags?: Record<string, boolean>; experimental?: boolean }
function readSettings(copilotHome: string, forWriting = false): Settings | undefined {
	const f = join(copilotHome, 'settings.json')
	if (!existsSync(f)) return {}
	const text = readFileSync(f, 'utf8').replace(/^\uFEFF/, '')
	if (forWriting && /^\s*\/\//m.test(text)) return undefined
	try { return JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) } catch { return undefined }
}
export const extensionsOn = (copilotHome: string) => { const s = readSettings(copilotHome); return !!s && (s.enabledFeatureFlags?.EXTENSIONS ?? s.experimental) === true }

// Safe to rerun. A folder of the same name that Delegate did not make is left alone; an owner's explicit "off" is respected.
export function installExtension(copilotHome: string, from = MESH_DIR, local = LOCAL_DIR): string {
	const dir = extensionDir(copilotHome)
	if (existsSync(dir) && !ours(dir)) return `Left ${dir} alone: it is not ${NAME}'s.`
	const before = ours(dir) ? (JSON.parse(readFileSync(join(dir, MARK), 'utf8')) as Mark) : undefined
	assertTestSafe(dir)
	mkdirSync(dir, { recursive: true })
	for (const f of FILES) copyFileSync(join(from, f), join(dir, f))
	const createdSettings = before?.createdSettings ?? !existsSync(join(copilotHome, 'settings.json'))
	const s = readSettings(copilotHome, true)
	let setFlag = before?.setFlag ?? false, note = ''
	if (extensionsOn(copilotHome)) { /* already on */ }
	else if (!s) note = ` Turn on extensions yourself: add "enabledFeatureFlags": { "EXTENSIONS": true } to ${join(copilotHome, 'settings.json')}.`
	else if (s.enabledFeatureFlags?.EXTENSIONS === false) note = ' Extensions are turned off in your Copilot settings, so it will not load until you turn them on.'
	else {
		writeJsonAtomic(join(copilotHome, 'settings.json'), { ...s, enabledFeatureFlags: { ...s.enabledFeatureFlags, EXTENSIONS: true } }, 'delegate')
		setFlag = true
	}
	writeFileSync(join(dir, MARK), JSON.stringify({ by: 'delegate', local, setFlag, createdSettings } satisfies Mark, null, '\t') + '\n')
	return `Added the session extension (${dir}). Copilot CLI sessions started or resumed from now on can receive ${NAME}'s messages.${note}`
}

export function uninstallExtension(copilotHome: string): string | undefined {
	const dir = extensionDir(copilotHome)
	if (!ours(dir)) return undefined
	const mark = JSON.parse(readFileSync(join(dir, MARK), 'utf8')) as Mark
	assertTestSafe(dir)
	rmSync(dir, { recursive: true, force: true })
	// Only the flag Delegate turned on is turned off again.
	const s = mark.setFlag ? readSettings(copilotHome, true) : undefined
	if (s?.enabledFeatureFlags?.EXTENSIONS === true) {
		const { EXTENSIONS: _, ...rest } = s.enabledFeatureFlags
		const { enabledFeatureFlags: __, ...others } = s
		const left = Object.keys(rest).length ? { ...others, enabledFeatureFlags: rest } : others
		if (mark.createdSettings && !Object.keys(left).length) rmSync(join(copilotHome, 'settings.json'), { force: true })
		else writeJsonAtomic(join(copilotHome, 'settings.json'), left, 'delegate')
	}
	return `Removed ${dir}.`
}

export function extensionCheck(copilotHome: string, from = MESH_DIR): { ok: boolean; what: string; fix: string } {
	const dir = extensionDir(copilotHome)
	const fix = `Run "${CMD} install".`
	if (!ours(dir)) return { ok: false, what: `The session extension is not installed, so ${NAME} cannot reach your open sessions`, fix }
	const stale = FILES.filter(f => !existsSync(join(dir, f)) || hash(join(dir, f)) !== hash(join(from, f)))
	if (stale.length) return { ok: false, what: `The session extension is out of date (${stale.join(', ')})`, fix }
	if (!extensionsOn(copilotHome)) return { ok: false, what: 'Copilot CLI extensions are turned off, so the session extension never loads', fix: `Set "enabledFeatureFlags": { "EXTENSIONS": true } in ${join(copilotHome, 'settings.json')}, then start or resume the session.` }
	return { ok: true, what: `Session extension installed in ${dir}`, fix }
}

const prId = (k: string) => /^pr:(?:.*\/)?(\d+)$/.exec(k.toLowerCase().replace(/\s+/g, ''))?.[1]

// A session by its ID (or the first 8 characters), its name, or a PR it works on. Open sessions first, then the most recent.
export function findSession(store: Store, target: string, now = Date.now()): SessionEntry | undefined {
	const t = target.trim().toLowerCase()
	closeDead(store.root, store.machine)
	const all = listSessions(store.root, now)
	const byOpen = (xs: SessionEntry[]) => xs.find(s => s.open) ?? xs[0]
	const id = all.filter(s => s.session.toLowerCase() === t || (t.length >= 8 && s.session.toLowerCase().startsWith(t)))
	if (id.length) return byOpen(id)
	const named = all.filter(s => s.name?.toLowerCase() === t)
	if (named.length) return byOpen(named)
	const pr = prId(t) ?? (/^\d{3,}$/.test(t) ? t : undefined)
	return pr ? byOpen(all.filter(s => s.keys.some(k => prId(k) === pr))) : undefined
}

export type Sent = { msg: Message; to: SessionEntry }
// One new file in the storage folder, which the session's machine syncs and its extension delivers.
export function sendToSession(store: Store, target: string, text: string): Sent | string {
	const to = findSession(store, target)
	if (!to) return `No session matches "${target}". Run "${CMD} sessions" to see them.`
	const msg = writeMessage(store.root, { to: { machine: to.machine, session: to.session }, from: store.machine, text })
	store.log({ event: 'session-message', id: msg.id, to: addr(to.machine, to.session), open: to.open })
	return { msg, to }
}

export type Settled = { msg: Message; receipt: Pick<Receipt, 'state' | 'why' | 'reply'>; to: string }
// Messages this machine wrote that are final: refused, delivered with the session's reply, or expired before any session took them.
// Each is reported once; Delegate wrote the inbox file, so Delegate removes it.
export function collectReceipts(store: Store, now = Date.now()): Settled[] {
	const out: Settled[] = []
	const box = dirs(store.root).inbox
	for (const a of subdirs(box)) {
		for (const msg of readInbox(store.root, a).filter(m => m.from === store.machine)) {
			const r = readReceipt(store.root, a, msg.id)
			const late = Date.parse(msg.expiresAt) < now
			const receipt = r ?? (late ? { state: 'refused' as const, why: 'the session did not open before the message expired' } : undefined)
			// Delivered with no answer is final when the session ended or recovered it, or once the message has expired.
			const silent = receipt?.state === 'delivered' && !receipt.reply
			if (!receipt || (silent && !r?.ended && !r?.recovered && !late)) continue
			if (silent) Object.assign(receipt, { why: r?.ended ?? 'delivered; no answer was recorded' })
			out.push({ msg, receipt, to: a })
			settle(store.root, a, msg.id)
			store.log({ event: 'session-receipt', id: msg.id, to: a, state: receipt.state, why: receipt.why })
		}
	}
	return out
}

const ago = (iso: string, now: number) => { const m = Math.round((now - Date.parse(iso)) / 60_000); return m < 1 ? 'now' : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }
export function sessionsText(store: Store, now = Date.now()): string {
	closeDead(store.root, store.machine)
	const all = listSessions(store.root, now)
	if (!all.length) return `No sessions have registered yet. Start or resume a Copilot CLI session after "${CMD} install".`
	return all.map(s => `${s.open ? (s.busy ? 'working' : 'open   ') : 'closed '}  ${s.session.slice(0, 8)}  ${s.machine}  ${s.name ?? ''}  ${s.cwd}${s.branch ? ` (${s.branch})` : ''}${s.keys.length ? `  ${s.keys.join(' ')}` : ''}  seen ${ago(s.beatAt, now)}`).join('\n')
}
