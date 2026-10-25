import { execFile, execFileSync as executeProcess, type ChildProcess } from 'node:child_process'
import { timedCall } from '../core/io-time.ts'
const execFileSync = timedCall(() => executeProcess)
import { assertTestSafe } from '../store/fs.ts'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLI, ROOT, VERSION } from '../paths.ts'
import { LOCAL_DIR } from '../store/state.ts'

export type Updated = { at: string; from: string; to: string; subject: string; told?: boolean; rolledBack?: string }
// Once a day by default: a new version mid-day is a surprise; Check for updates on Home takes one at once.
export const UPDATE_EVERY_MIN = 1440

// What a git install follows: every commit on its branch ("main", the dogfood bundle's default) or tagged releases
// ("release", the default for a clone of the public repo). false turns updating off.
export type Setting = boolean | 'main' | 'release' | undefined
export function channelOf(setting: Setting, origin: string): 'main' | 'release' | 'off' {
	if (setting === false) return 'off'
	if (setting === 'main' || setting === 'release') return setting
	return origin.endsWith('.bundle') ? 'main' : 'release'
}
const newestRelease = (git: (...a: string[]) => string) => git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').find(t => /^v\d+\.\d+\.\d+$/.test(t))
const updateListeners = new Set<(root: string) => void>()
export function onUpdateApplied(listener: (root: string) => void): () => void {
	updateListeners.add(listener)
	return () => { updateListeners.delete(listener) }
}

// A git install takes new versions by itself between ticks, from its channel.
// It only fast-forwards, starts the new code once through "migrate" (which loads every module and moves data forward),
// and goes back to the old commit if that fails, so a bad build never stops the runner.
export function autoUpdate(opt: { setting?: Setting; everyMin?: number; force?: boolean; root?: string; cli?: string; local?: string; now?: number } = {}): Updated | undefined {
	const root = opt.root ?? ROOT, cli = opt.cli ?? CLI, local = opt.local ?? LOCAL_DIR, now = opt.now ?? Date.now()
	if (!existsSync(join(root, '.git'))) return
	const git = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim()
	const mark = join(local, 'update.json')
	try {
		const channel = channelOf(opt.setting, git('remote', 'get-url', 'origin'))
		if (channel === 'off') return
		const last = readMark(mark)
		const every = Number.isFinite(opt.everyMin) && opt.everyMin! >= 10 ? opt.everyMin! : UPDATE_EVERY_MIN
		if (!opt.force && last.checkedAt && now - Date.parse(last.checkedAt) < every * 60_000) return
		writeMark(mark, { ...last, checkedAt: new Date(now).toISOString(), failed: undefined })
		if (git('status', '--porcelain', '--untracked-files=no')) { writeMark(mark, { ...readMark(mark), failed: 'this copy has local changes, so it does not update itself' }); return }
		let to: string
		if (channel === 'main') { git('fetch', '--quiet', 'origin', git('rev-parse', '--abbrev-ref', 'HEAD')); to = git('rev-parse', 'FETCH_HEAD') }
		else { git('fetch', '--quiet', '--tags', '--force', 'origin'); const tag = newestRelease(git); if (!tag) return; to = git('rev-parse', `${tag}^{commit}`) }
		const from = git('rev-parse', 'HEAD')
		if (from === to || git('merge-base', from, to) !== from) return
		// A commit that already failed to start waits for a newer one, so the owner hears about it once (review 10-19 #3).
		if (!opt.force && last.bad === to) return
		const deps = git('diff', '--name-only', from, to, '--', 'package-lock.json') !== ''
		git('merge', '--ff-only', '--quiet', to)
		const tag = git('tag', '--points-at', to).split('\n').find(t => /^v\d/.test(t))
		const u: Updated = { at: new Date(now).toISOString(), from: from.slice(0, 7), to: tag ?? to.slice(0, 7), subject: git('log', '-1', '--format=%s') }
		const npm = () => execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, stdio: 'pipe', shell: process.platform === 'win32', timeout: 300_000 })
		try {
			if (deps) npm()
			execFileSync(process.execPath, [cli, 'migrate'], { cwd: root, stdio: 'pipe', timeout: 120_000 })
		} catch (e) {
			git('reset', '--hard', '--quiet', from)
			if (deps) try { npm() } catch { /* the next check retries */ }
			const lines = String((e as { stderr?: Buffer }).stderr || e).split('\n').map(l => l.trim()).filter(Boolean)
			u.rolledBack = (lines.find(l => /\w*Error\b/.test(l)) ?? lines.at(-1) ?? 'it did not start').slice(0, 300)
		}
		writeMark(mark, { ...readMark(mark), last: u, bad: u.rolledBack ? to : undefined })
		if (!u.rolledBack) for (const listener of updateListeners) listener(root)
		return u
	} catch (e) { writeMark(mark, { ...readMark(mark), failed: String((e as { stderr?: Buffer }).stderr || e).trim().split('\n')[0].slice(0, 200) }); return }
}

// The update the owner has not been told about yet; telling them marks it.
export function untold(local = LOCAL_DIR): Updated | undefined {
	const mark = join(local, 'update.json'), m = readMark(mark)
	if (!m.last || m.last.told) return
	writeMark(mark, { ...m, last: { ...m.last, told: true } })
	return m.last
}

// The installed code's commit, read again on each call, so a long-running process can tell it is out of date.
export function installed(root = ROOT): string | undefined {
	try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim() } catch { return undefined }
}

// The page runs in a child process that exits with RESTART when the installed code changes; the parent starts it again
// on the same port and link, so an open page reconnects to the new version by itself and Ctrl+C still stops both.
export const RESTART = 75
// A child that crashes soon after starting may be on a commit an update is about to roll back, so it gets a few more tries.
export function supervise(start: (port: number, token: string) => ChildProcess, port: number, token: string, done: (code: number) => void = code => process.exit(code), retryMs = 10_000): () => ChildProcess {
	let cur: ChildProcess, tries = 0
	const run = () => {
		const at = Date.now()
		cur = start(port, token).on('exit', code => {
			if (code === RESTART) return run()
			if (Date.now() - at > 5 * 60_000) tries = 0
			if (code && tries++ < 5) return void setTimeout(run, retryMs)
			done(code ?? 0)
		})
	}
	run()
	return () => cur
}
export function exitWhenUpdated(close: () => void, root = ROOT, everyMs = 15_000): NodeJS.Timeout {
	const at = installed(root)
	return setInterval(() => { const now = installed(root); if (at && now && now !== at) { close(); process.exit(RESTART) } }, everyMs)
}

type Mark = { checkedAt?: string; last?: Updated; failed?: string; bad?: string }

export type VersionInfo = { version?: string; code?: string; fullCode?: string; tag?: string; auto: boolean; channel: 'main' | 'release' | 'off'; everyMin: number; checkedAt?: string; failed?: string; last?: Updated }
function savedVersion(root: string, stateRoot?: string): string {
	for (const file of [join(root, 'package.json'), ...(stateRoot ? [join(stateRoot, 'state', 'version.json')] : [])]) {
		try { const v: unknown = JSON.parse(readFileSync(file, 'utf8')).version; if (typeof v === 'string' && v.trim()) return v.trim() } catch { /* Try the next installed-version source. */ }
	}
	return VERSION
}
function identity(head: string, description: string, origin: string, root: string, stateRoot?: string): VersionInfo {
	const release = /^v(\d+\.\d+\.\d+)-(\d+)-g[0-9a-f]+$/.exec(description)
	return { version: release ? release[1] + (Number(release[2]) ? `+${release[2]}` : '') : savedVersion(root, stateRoot),
		code: head ? head.slice(0, 7) : undefined, fullCode: head || undefined, tag: release ? `v${release[1]}` : undefined,
		auto: !!head, channel: head ? channelOf(undefined, origin) : 'off', everyMin: UPDATE_EVERY_MIN }
}
// Update/check status can change without changing the running identity; this never invokes git.
export function versionStatus(info: VersionInfo, setting: Setting, local = LOCAL_DIR, everyMin = UPDATE_EVERY_MIN): VersionInfo {
	const m = readMark(join(local, 'update.json'))
	const channel = !info.fullCode || setting === false ? 'off' : setting === 'main' || setting === 'release' ? setting : info.channel
	return { ...info, auto: channel !== 'off', channel, everyMin, checkedAt: m.checkedAt, failed: m.failed, last: m.last }
}
// What the page shows: the running commit, whether it updates by itself, and the last check.
export function versionInfo(setting: Setting, root = ROOT, local = LOCAL_DIR, everyMin = UPDATE_EVERY_MIN, stateRoot = process.env.DELEGATE_ROOT): VersionInfo {
	const git = (...a: string[]) => { try { return execFileSync('git', a, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim() } catch { return '' } }
	const repo = existsSync(join(root, '.git'))
	return versionStatus(identity(repo ? git('rev-parse', 'HEAD') : '', repo ? git('describe', '--tags', '--match', 'v[0-9]*', '--long') : '', repo ? git('remote', 'get-url', 'origin') : '', root, stateRoot), setting, local, everyMin)
}
// The same, without stopping the page server while git answers (three git calls took 200 ms of a page request; bug 10-23 perf).
export async function versionInfoLater(setting: Setting, root = ROOT, local = LOCAL_DIR, everyMin = UPDATE_EVERY_MIN, stateRoot = process.env.DELEGATE_ROOT): Promise<VersionInfo> {
	const git = (...a: string[]) => new Promise<string>(done => execFile('git', a, { cwd: root, encoding: 'utf8', windowsHide: true }, (error, out) => done(error ? '' : String(out).trim())))
	const repo = existsSync(join(root, '.git'))
	const [head, origin, description] = repo ? await Promise.all([git('rev-parse', 'HEAD'), git('remote', 'get-url', 'origin'), git('describe', '--tags', '--match', 'v[0-9]*', '--long')]) : ['', '', '']
	return versionStatus(identity(head, description, origin, root, stateRoot), setting, local, everyMin)
}
function readMark(f: string): Mark { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return {} } }
function writeMark(f: string, m: Mark) { assertTestSafe(f); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, JSON.stringify(m, null, '\t') + '\n') }
