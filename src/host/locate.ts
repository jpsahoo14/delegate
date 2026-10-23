// The owner's installed Copilot CLI package, which carries the SDK that speaks its own protocol (copilot-sdk/), so the resident host
// (#19) needs no SDK of its own: the runtime and the SDK always match. Only the plain `copilot` command uses it; a workplace wrapper
// (site.json agents) may add sign-in or proxies the host would skip, so it keeps one process per run.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../core/types.ts'

export type CliPackage = { dir: string; version: string; runtime: string; sdk: string }

const versionKey = (v: string) => v.split(/[.-]/).map(p => (/^\d+$/.test(p) ? p.padStart(6, '0') : p)).join('.')
function packageAt(dir: string, version = ''): CliPackage | undefined {
	const runtime = join(dir, 'index.js'), sdk = join(dir, 'copilot-sdk', 'index.js')
	return existsSync(runtime) && existsSync(sdk) ? { dir, version: version || dir.split(/[\\/]/).pop()!, runtime, sdk } : undefined
}
function newestIn(root: string): CliPackage | undefined {
	if (!existsSync(root)) return undefined
	const dirs = readdirSync(root).filter(v => /^\d+\.\d+\.\d+/.test(v)).sort((a, b) => versionKey(b).localeCompare(versionKey(a)))
	for (const v of dirs) { const p = packageAt(join(root, v), v); if (p) return p }
	return undefined
}
function npmGlobal(): string | undefined {
	try { return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', timeout: 10_000, windowsHide: true, shell: process.platform === 'win32' }).trim() } catch { return undefined }
}

let cached: { at: number; pkg?: CliPackage } | undefined
export function cliPackage(now = Date.now()): CliPackage | undefined {
	if (cached && now - cached.at < 600_000) return cached.pkg
	const plat = `${process.platform}-${process.arch}`
	const roots = [
		process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'copilot', 'pkg', plat),
		join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'copilot', 'pkg', plat),
		join(homedir(), 'Library', 'Caches', 'copilot', 'pkg', plat),
	].filter((r): r is string => !!r)
	const own = process.env.DELEGATE_COPILOT_PKG ? packageAt(process.env.DELEGATE_COPILOT_PKG) : undefined
	let pkg = own ?? roots.map(newestIn).find(Boolean)
	if (!pkg) { const g = npmGlobal(); pkg = g ? packageAt(join(g, '@github', 'copilot')) : undefined }
	cached = { at: now, pkg }
	return pkg
}

// Why the host is not used for these runs, or undefined when it may be.
export function hostOff(cfg: Config): string | undefined {
	const a = cfg.agent
	if (a.host === false) return 'turned off in config'
	if (a.flavor !== 'copilot') return 'only the Copilot CLI can host runs'
	const plain = a.command.length === 1 && /^copilot(?:\.exe|\.cmd)?$/i.test(a.command[0].split(/[\\/]/).pop()!)
	const direct = a.command.length === 2 && a.command[0] === process.execPath && /index\.js$/.test(a.command[1])
	if (!plain && !direct) return 'a custom AI command runs one process per run'
	if (!cliPackage()) return "the Copilot CLI's own SDK was not found"
	return undefined
}
