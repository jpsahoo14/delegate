import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { CLI, ROOT, SKILL_DIR, VERSION } from './paths.ts'
import { LOCAL_DIR, loadLocal, Store } from './store/state.ts'
import { readJson, writeJson, assertTestSafe } from './store/fs.ts'
import * as scheduler from './os/scheduler.ts'
import { signedIn } from './mcp/setup.ts'
import { NAME, CMD } from './brand.ts'
import { extensionCheck, installExtension, uninstallExtension } from './mesh/route.ts'
import { migrateTools, toolsSaid } from './runner/tools-migrate.ts'

const COPILOT = process.env.COPILOT_HOME ?? join(homedir(), '.copilot')
const has = (cmd: string) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0
const paths = () => ({ node: process.execPath, cli: CLI, local: LOCAL_DIR, pathEnv: process.env.PATH ?? '' })

// How this copy was installed decides how it updates: the agent's plugin manager, git, or nothing (learning 02).
function installKind(root = ROOT): 'copilot-plugin' | 'claude-plugin' | 'git' | 'other' {
	if (root.includes(join('.copilot', 'installed-plugins'))) return 'copilot-plugin'
	if (root.includes(join('.claude', 'plugins'))) return 'claude-plugin'
	return existsSync(join(root, '.git')) ? 'git' : 'other'
}

// Registers the MCP server with an absolute path and links the skill, for agents that did not load the plugin. Safe to rerun.
export function install(): string[] {
	const out: string[] = []
	const cfgFile = join(COPILOT, 'mcp-config.json')
	const cfg = readJson<{ mcpServers?: Record<string, unknown> }>(cfgFile, {})
	cfg.mcpServers = { ...cfg.mcpServers, delegate: { type: 'local', command: process.execPath, args: [CLI, 'mcp'], tools: ['*'] } }
	writeJson(cfgFile, cfg, 'install')
	out.push(`Registered the ${NAME} tools for Copilot in ${cfgFile}.`)
	if (has('claude')) {
		spawnSync('claude', ['mcp', 'remove', '--scope', 'user', 'delegate'], { stdio: 'ignore' })
		const r = spawnSync('claude', ['mcp', 'add', '--scope', 'user', 'delegate', '--', process.execPath, CLI, 'mcp'], { stdio: 'pipe' })
		out.push(r.status === 0 ? `Registered the ${NAME} tools for Claude.` : `Could not register for Claude: ${String(r.stderr).slice(0, 120)}`)
	}
	for (const dir of [join(COPILOT, 'skills'), join(homedir(), '.claude', 'skills')]) {
		if (!existsSync(dirname(dir))) continue
		const link = join(dir, 'delegate')
		assertTestSafe(dir)
		mkdirSync(dir, { recursive: true })
		// Only a link or copy Delegate made is replaced; someone else's skill of the same name is left alone.
		if ((existsSync(link) || isLink(link)) && !ours(link)) { out.push(`Left ${link} alone: it is not ${NAME}'s. Rename it to use ${NAME} there.`); continue }
		if (existsSync(link) || isLink(link)) rmSync(link, { recursive: true, force: true })
		try { symlinkSync(SKILL_DIR, link, 'junction') } catch { cpSync(SKILL_DIR, link, { recursive: true }) }
		out.push(`Linked the skill into ${dir}.`)
	}
	out.push(installExtension(COPILOT))
	const l = launcher()
	if (l) out.push(l)
	return out
}

// cmd.exe reads a batch file line by line while it runs, so the launcher that started this uninstall cannot be deleted now
// ("The batch file cannot be found", exit 1). A detached cmd deletes it a moment after this process exits. It runs as one
// command line through the shell: passed as an argument, Node escapes the path's quotes as \" and del silently fails (mesh test).
export function deleteAfterExit(path: string) {
	return { command: `ping -n 3 127.0.0.1 >nul & del /f /q "${path}"`, options: { shell: true, detached: true, stdio: 'ignore' as const, windowsHide: true } }
}

// A "delegate" command for the daily look, in a folder already on PATH. Only Delegate's own launcher is ever replaced or removed.
const MARKER = 'delegate launcher'
function launcherPath(): string | undefined {
	const onPath = new Set((process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').map(p => p.replace(/[\\/]+$/, '')))
	const dirs = process.platform === 'win32' ? [join(homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps')] : [join(homedir(), '.local', 'bin'), join(homedir(), 'bin')]
	const dir = dirs.find(d => onPath.has(d) && existsSync(d))
	return dir && join(dir, process.platform === 'win32' ? 'delegate.cmd' : 'delegate')
}
function launcher(): string | undefined {
	const p = launcherPath()
	if (!p) return undefined
	if (existsSync(p) && !readFileSync(p, 'utf8').includes(MARKER)) return `Left ${p} alone: it is not ${NAME}'s.`
	const body = process.platform === 'win32' ? `@rem ${MARKER}\r\n@"${process.execPath}" "${CLI}" %*\r\n` : `#!/bin/sh\n# ${MARKER}\nexec "${process.execPath}" "${CLI}" "$@"\n`
	assertTestSafe(p)
	writeFileSync(p, body, { mode: 0o755 })
	return `Added the "delegate" command (${p}). Run "delegate" any time to open your inbox.`
}

const isLink = (p: string) => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }
const ours = (p: string) => (isLink(p) ? readlinkSync(p) === SKILL_DIR : existsSync(join(p, 'workflows', 'reply.md')) && /^name: delegate$/m.test(readFileSync(join(p, 'SKILL.md'), 'utf8')))
const dirname = (p: string) => join(p, '..')

type Check = { ok: boolean; what: string; fix?: string; optional?: boolean }

// Every check says what is wrong and the one thing to do about it (R-SET-02).
// Minutes since this machine's runner last ran, when it should have run by now; 0 when all is well (restart audit R9).
export function runnerSilent(o: { installed: boolean; lease: { machine: string; at: string } | null; machine: string; runner?: string; idleMin?: number; now?: number }): number {
	if (!o.installed || !o.lease || o.lease.machine !== o.machine || (o.runner && o.runner !== o.machine)) return 0
	const quiet = Math.round(((o.now ?? Date.now()) - Date.parse(o.lease.at)) / 60_000)
	return quiet > 3 * (o.idleMin ?? 15) ? quiet : 0
}

export function doctor(): Check[] {
	const out: Check[] = []
	const node = Number(process.versions.node.split('.')[0])
	out.push({ ok: node >= 22, what: `Node ${process.versions.node}`, fix: 'Install Node 22 or newer.' })
	const integrity = readJson<{ version: string; files: Record<string, string> } | null>(join(ROOT, 'INTEGRITY.json'), null)
	if (integrity) {
		const bad = Object.entries(integrity.files).filter(([f, h]) => !existsSync(join(ROOT, f)) || fileHash(join(ROOT, f)) !== h).map(([f]) => f)
		out.push({ ok: !bad.length, what: bad.length ? `${bad.length} shipped file(s) changed: ${bad.slice(0, 3).join(', ')}` : `Files match release ${integrity.version}`, fix: `Run "${CMD} update" to restore them.` })
	}
	let store: Store | undefined
	try { store = new Store(loadLocal()) } catch { out.push({ ok: false, what: 'No storage folder yet', fix: 'In your AI chat, say "set up delegate".' }) }
	if (store) {
		const cfg = store.config()
		out.push({ ok: !!cfg, what: cfg ? `Storage: ${store.root}` : `No config.json in ${store.root}`, fix: 'In your AI chat, say "set up delegate".' })
		if (cfg) {
			const runner = cfg.runner ?? '(not pinned)'
			out.push({ ok: !cfg.runner || cfg.runner === store.machine, what: `Runner machine: ${runner}; this machine: ${store.machine}`, fix: 'To run it here, finish setup with "start" on this machine.' })
			out.push({ ok: has(cfg.agent.command[0]) && signedIn(cfg.agent.flavor, cfg.agent.command), what: `AI CLI "${cfg.agent.command.join(' ')}" answers`, fix: `Run "${cfg.agent.command.join(' ')}" once and sign in.` })
			for (const h of Object.values(store.health())) out.push({ ok: false, what: h.text })
			const copies = store.conflictCopies()
			if (copies.length) out.push({ ok: false, what: `${copies.length} file(s) OneDrive copied after a sync conflict: ${copies.slice(0, 3).map(f => basename(f)).join(', ')}. They are ignored.`, fix: `Delete them from ${join(store.root, 'state')} once you have looked at them.` })
			// Installed is not running: macOS can switch the runner off in Login Items without a sign (restart audit R9).
			const quiet = runnerSilent({ installed: scheduler.status(), lease: store.lease(), machine: store.machine, runner: cfg.runner, idleMin: cfg.poll?.idleMin })
			if (quiet)
				out.push({ ok: false, what: `The background runner is installed but has not run for ${quiet} minutes`, fix: process.platform === 'darwin' ? `Turn it on in System Settings > General > Login Items > Allow in the Background, then run "${CMD} service install".` : process.platform === 'win32' ? `In Task Scheduler, check that the "${scheduler.TASK}" task is enabled, then run "${CMD} service install".` : `Run "${CMD} service install".` })
		}
	}
	const mcp = readJson<{ mcpServers?: Record<string, { args?: string[] }> }>(join(COPILOT, 'mcp-config.json'), {}).mcpServers?.delegate
	out.push({ ok: !!mcp && existsSync(mcp.args?.[0] ?? ''), what: mcp ? `Copilot tools point to ${mcp.args?.[0]}` : `Copilot does not know the ${NAME} tools`, fix: `Run "${CMD} install".` })
	out.push(extensionCheck(COPILOT))
	out.push({ ok: scheduler.status(), optional: true, what: scheduler.status() ? 'Background runner installed' : 'Background runner not installed', fix: `Run "${CMD} service install" for replies while you are away.` })
	return out
}

// Converges to the newest version: new code, migrated data, fresh registrations, a passing doctor. Safe to rerun.
export function update(o: { root: string; cli: string; from?: string } = { root: ROOT, cli: CLI }): string[] {
	const kind = installKind(o.root)
	const out: string[] = [`${NAME} ${VERSION} (${kind})`]
	const head = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: o.root, encoding: 'utf8', stdio: 'pipe' }).trim() } catch { return '' } }
	const run = (cmd: string, args: string[]) => { try { execFileSync(cmd, args, { stdio: 'pipe', cwd: o.root }); return true } catch (e) { out.push(`${cmd} ${args.join(' ')} failed: ${String(e).slice(0, 160)}`); return false } }
	if (kind === 'copilot-plugin' && has('copilot')) run('copilot', ['plugin', 'update', 'delegate']) && out.push('Updated the Copilot plugin.')
	if (kind === 'claude-plugin' && has('claude')) run('claude', ['plugin', 'update', 'delegate']) && out.push('Updated the Claude plugin.')
	const before = head()
	// "update --from <url>" moves a clone to another source once, such as from the dogfood bundle to the public repo.
	// The histories are unrelated, so it takes that source's main as it is, and only when this copy has no changes of its own.
	if (kind === 'git' && o.from) {
		const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: o.root, encoding: 'utf8', stdio: 'pipe' }).trim()
		if (dirty) return [...out, `This copy has changes of its own, so it stays on ${before.slice(0, 7)}. Nothing changed.`]
		if (run('git', ['remote', 'set-url', 'origin', o.from]) && run('git', ['fetch', '--quiet', '--tags', 'origin', 'main']) && run('git', ['reset', '--hard', '--quiet', 'FETCH_HEAD'])) {
			run('git', ['branch', '--quiet', '--set-upstream-to=origin/main']) 
			out.push(`Now following ${o.from}.`)
		}
	} else if (kind === 'git') run('git', ['pull', '--ff-only']) && out.push('Pulled the newest code.')
	// This process still runs the code it started with, so after a pull the new code finishes the update itself:
	// an install step added by the new version would otherwise be skipped (dogfood: the session extension).
	if (kind === 'git' && head() !== before) {
		try { for (const c of ['migrate', 'install']) out.push(...execFileSync(process.execPath, [o.cli, c], { cwd: o.root, encoding: 'utf8', stdio: 'pipe', timeout: 120_000 }).split('\n').map(l => l.trim()).filter(Boolean)) }
		catch (e) { out.push(`The new version did not finish installing: ${String((e as { stderr?: string }).stderr || e).trim().split('\n')[0].slice(0, 200)}. Run "${CMD} install".`) }
	} else out.push(...migrate(), ...install())
	if (scheduler.status()) { scheduler.install(paths()); out.push('Restarted the background runner on the new version.') }
	return out
}

// Owner data only moves forward, after a backup; only the runner machine migrates (R-DST-04, distribution.md).
// Schema 2: the read tools list becomes a deny list over every read tool the servers list (#17).
export const SCHEMA = 2
export function migrate(): string[] {
	let store: Store
	try { store = new Store(loadLocal()) } catch { return [] }
	const file = join(store.root, 'state', 'version.json')
	const at = readJson<{ schema: number }>(file, { schema: 1 }).schema
	if (at > SCHEMA) return [`Your data is from a newer ${NAME} (schema ${at}). Update this machine too.`]
	if (at === SCHEMA) { writeJson(file, { schema: SCHEMA, version: VERSION }, store.machine); return ['Data is up to date.'] }
	const pinned = store.config()?.runner
	if (pinned && pinned !== store.machine) return [`Data migration waits for the runner machine (${pinned}).`]
	cpSync(join(store.root, 'state'), join(store.root, 'backups', `schema-${at}`), { recursive: true })
	const tools = at < 2 ? migrateTools(store, 'schema 2') : undefined
	writeJson(file, { schema: SCHEMA, version: VERSION }, store.machine)
	return [`Migrated your data from schema ${at} to ${SCHEMA}; a backup is in backups/schema-${at}.`, ...(tools ? [toolsSaid(tools)] : [])]
}

// Removes what Delegate added to this machine. Owner data stays, unless --purge also removes this machine's local folder.
export function uninstall(purge: boolean): string[] {
	const out: string[] = []
	if (scheduler.status()) out.push(scheduler.uninstall(paths()))
	const cfgFile = join(COPILOT, 'mcp-config.json')
	const cfg = readJson<{ mcpServers?: Record<string, unknown> }>(cfgFile, {})
	if (cfg.mcpServers?.delegate) { delete cfg.mcpServers.delegate; writeJson(cfgFile, cfg, 'uninstall'); out.push(`Removed the ${NAME} tools from Copilot.`) }
	const ext = uninstallExtension(COPILOT)
	if (ext) out.push(ext)
	if (has('claude')) spawnSync('claude', ['mcp', 'remove', '--scope', 'user', 'delegate'], { stdio: 'ignore' })
	const lp = launcherPath()
	if (lp && existsSync(lp) && readFileSync(lp, 'utf8').includes(MARKER)) {
		if (process.platform === 'win32') { const d = deleteAfterExit(lp); spawn(d.command, d.options).unref(); out.push(`Removing ${lp} as soon as this command ends.`) }
		else { assertTestSafe(lp); rmSync(lp, { force: true }); out.push(`Removed ${lp}.`) }
	}
	for (const link of [join(COPILOT, 'skills', 'delegate'), join(homedir(), '.claude', 'skills', 'delegate')]) if ((existsSync(link) || isLink(link)) && ours(link)) { assertTestSafe(link); rmSync(link, { recursive: true, force: true }); out.push(`Removed ${link}.`) }
	// A plugin copy can exist next to a clone install (Windows setup test), so it is removed whichever one runs uninstall.
	if (has('copilot') && pluginListed()) { spawnSync('copilot', ['plugin', 'uninstall', 'delegate'], { stdio: 'ignore', windowsHide: true }); out.push('Removed the Copilot plugin.') }
	if (installKind() === 'claude-plugin' && has('claude')) spawnSync('claude', ['plugin', 'uninstall', 'delegate'], { stdio: 'ignore' })
	let root = ''
	try { root = loadLocal().root } catch { /* never set up */ }
	if (purge) { assertTestSafe(LOCAL_DIR); rmSync(LOCAL_DIR, { recursive: true, force: true }); out.push(`Removed ${LOCAL_DIR}.`) }
	out.push(root ? `Your data is still in ${root}. Delete that folder yourself if you want it gone.` : 'Done.')
	return out
}

// Git on Windows may check text files out with CRLF line endings; the release is the same either way.
export const fileHash = (f: string) => createHash('sha256').update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex')

// Measured output: "Installed plugins:" then lines like "  • delegate (v0.1.0)" or "  • name@marketplace (v1.2.0)".
export const pluginListed = (out = spawnSync('copilot', ['plugin', 'list'], { encoding: 'utf8', windowsHide: true }).stdout ?? '') => /^\s*\W?\s*delegate(@\S+)?\s+\(v/m.test(out)

export const version = () => VERSION
