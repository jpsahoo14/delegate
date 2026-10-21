import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'delegate-home-'))
process.env.HOME = home
process.env.USERPROFILE = home
process.env.COPILOT_HOME = join(home, '.copilot')
// Only system folders and git stay on PATH, so no real copilot or claude is found; git is needed by the update tests.
const gitDir = (process.env.PATH ?? '').split(delimiter).find(d => existsSync(join(d, process.platform === 'win32' ? 'git.exe' : 'git')))
process.env.PATH = [process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') : '/usr/bin:/bin', ...(gitDir ? [gitDir] : [])].join(delimiter)
process.env.DELEGATE_LOCAL = join(home, '.delegate')
mkdirSync(join(home, '.copilot', 'skills'), { recursive: true })
const { install, uninstall, migrate, SCHEMA } = await import('../src/admin.ts')
after(() => rmSync(home, { recursive: true, force: true }))

test('R-DST-01 install registers the tools with an absolute path and links the skill; uninstall removes only what it added', () => {
	mkdirSync(join(home, '.claude', 'skills', 'delegate'), { recursive: true })
	writeFileSync(join(home, '.claude', 'skills', 'delegate', 'SKILL.md'), 'someone else')
	const out = install()
	assert.equal(homedir(), home)
	const cfg = JSON.parse(readFileSync(join(home, '.copilot', 'mcp-config.json'), 'utf8'))
	assert.equal(cfg.mcpServers.delegate.args[1], 'mcp'); assert.ok(existsSync(cfg.mcpServers.delegate.args[0]))
	assert.ok(existsSync(join(home, '.copilot', 'skills', 'delegate', 'SKILL.md')))
	assert.ok(out.includes(`Left ${join(home, '.claude', 'skills', 'delegate')} alone: it is not Delegate's. Rename it to use Delegate there.`))
	uninstall(false)
	assert.equal(JSON.parse(readFileSync(join(home, '.copilot', 'mcp-config.json'), 'utf8')).mcpServers.delegate, undefined)
	assert.equal(existsSync(join(home, '.copilot', 'skills', 'delegate')), false)
	assert.equal(readFileSync(join(home, '.claude', 'skills', 'delegate', 'SKILL.md'), 'utf8'), 'someone else')
})

test('R-DST-04 data migrates only forward, refuses data from a newer version, and records the version', () => {
	const root = join(home, 'store')
	mkdirSync(join(home, '.delegate'), { recursive: true }); mkdirSync(join(root, 'state'), { recursive: true })
	writeFileSync(join(home, '.delegate', 'local.json'), JSON.stringify({ root, machine: 'mac' }))
	assert.deepEqual(migrate(), ['Data is up to date.'])
	assert.equal(JSON.parse(readFileSync(join(root, 'state', 'version.json'), 'utf8')).schema, SCHEMA)
	writeFileSync(join(root, 'state', 'version.json'), JSON.stringify({ schema: SCHEMA + 1 }))
	assert.match(migrate()[0], /from a newer Delegate/)
})

test('install adds a "delegate" launcher in a PATH folder, never replaces someone else\'s, and uninstall removes only its own', () => {
	const win = process.platform === 'win32'
	const bin = win ? join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps') : join(home, '.local', 'bin')
	const launcher = join(bin, win ? 'delegate.cmd' : 'delegate')
	mkdirSync(bin, { recursive: true })
	const path = process.env.PATH
	process.env.PATH = `${bin}${delimiter}${path}`
	try {
		assert.ok(install().includes(`Added the "delegate" command (${launcher}). Run "delegate" any time to open your inbox.`))
		assert.equal(readFileSync(launcher, 'utf8'), win
			? `@rem delegate launcher\r\n@"${process.execPath}" "${JSON.parse(readFileSync(join(home, '.copilot', 'mcp-config.json'), 'utf8')).mcpServers.delegate.args[0]}" %*\r\n`
			: `#!/bin/sh\n# delegate launcher\nexec "${process.execPath}" "${JSON.parse(readFileSync(join(home, '.copilot', 'mcp-config.json'), 'utf8')).mcpServers.delegate.args[0]}" "$@"\n`)
		uninstall(false)
		// On Windows the launcher is deleted a moment after the command ends (a running batch file cannot delete itself).
		for (let i = 0; i < 80 && existsSync(launcher); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
		assert.equal(existsSync(launcher), false)
		const ownLauncher = win ? '@echo mine\r\n' : '#!/bin/sh\necho mine\n'
		writeFileSync(launcher, ownLauncher)
		assert.ok(install().includes(`Left ${launcher} alone: it is not Delegate's.`))
		uninstall(false)
		assert.equal(readFileSync(launcher, 'utf8'), ownLauncher)
	} finally { process.env.PATH = path }
})

test('a release checked out with Windows line endings still matches its hashes; a real change does not', async () => {
	const { fileHash } = await import('../src/admin.ts')
	const d = mkdtempSync(join(tmpdir(), 'delegate-crlf-'))
	writeFileSync(join(d, 'lf.md'), '# Skill\nline two\n')
	writeFileSync(join(d, 'crlf.md'), '# Skill\r\nline two\r\n')
	writeFileSync(join(d, 'changed.md'), '# Skill\r\nline 2\r\n')
	assert.equal(fileHash(join(d, 'crlf.md')), fileHash(join(d, 'lf.md')))
	assert.notEqual(fileHash(join(d, 'changed.md')), fileHash(join(d, 'lf.md')))
})

test('uninstall finds a Delegate plugin in the Copilot plugin list, and only Delegate', async () => {
	const { pluginListed } = await import('../src/admin.ts')
	const list = (...names: string[]) => `Built-in plugins:\n  • computer-use (v0.1.94) [disabled]\n\nInstalled plugins:\n${names.map(n => `  • ${n} (v1.0.0)`).join('\n')}\n`
	assert.equal(pluginListed(list('feature-tools@corp-playground', 'delegate')), true)
	assert.equal(pluginListed(list('delegate@delegate')), true)
	assert.equal(pluginListed(list('delegate-tools@x', 'team-tools@corp-playground')), false)
	assert.equal(pluginListed(''), false)
})

test('mesh test: on Windows the launcher is deleted by one shell command line, so the path keeps its quotes', async () => {
	const { deleteAfterExit } = await import('../src/admin.ts')
	const d = deleteAfterExit('C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\delegate.cmd')
	assert.equal(d.command, 'ping -n 3 127.0.0.1 >nul & del /f /q "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\delegate.cmd"')
	assert.deepEqual([d.options.shell, d.options.detached, d.options.windowsHide], [true, true, true])
})

test('dogfood: after update pulls new code, the new code finishes the install, so its new steps are not skipped', async () => {
	const { update } = await import('../src/admin.ts')
	const { execFileSync } = await import('node:child_process')
	const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
	const base = mkdtempSync(join(tmpdir(), 'delegate-upd-')), dev = join(base, 'dev'), app = join(base, 'app')
	execFileSync('git', ['init', '-q', '-b', 'main', dev])
	writeFileSync(join(dev, 'cli.mjs'), 'console.log("v1 " + process.argv[2])\n'); git(dev, 'add', '-A'); git(dev, 'commit', '-qm', 'v1')
	execFileSync('git', ['clone', '-q', dev, app])
	writeFileSync(join(dev, 'cli.mjs'), 'console.log("v2 " + process.argv[2])\nif (process.argv[2] === "install") console.log("Added the session extension.")\n'); git(dev, 'commit', '-qam', 'v2')
	const out = update({ root: app, cli: join(app, 'cli.mjs') })
	assert.ok(out.includes('Pulled the newest code.'), out.join('|'))
	assert.deepEqual(out.filter(l => l.startsWith('v') || l.startsWith('Added')), ['v2 migrate', 'v2 install', 'Added the session extension.'])
})

test('update --from moves a clean clone to another source once, such as from the dogfood bundle to the public repo', async () => {
	const { update } = await import('../src/admin.ts')
	const { execFileSync } = await import('node:child_process')
	const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
	const base = mkdtempSync(join(tmpdir(), 'delegate-from-')), bundleSrc = join(base, 'private'), pub = join(base, 'public'), app = join(base, 'app')
	for (const [d, v] of [[bundleSrc, 'private'], [pub, 'public']]) { execFileSync('git', ['init', '-q', '-b', 'main', d]); writeFileSync(join(d, 'cli.mjs'), `console.log("${v} " + process.argv[2])\n`); git(d, 'add', '-A'); git(d, 'commit', '-qm', v) }
	execFileSync('git', ['clone', '-q', bundleSrc, app])
	writeFileSync(join(app, 'cli.mjs'), '// edited here\n')
	assert.match(update({ root: app, cli: join(app, 'cli.mjs'), from: pub }).join('\n'), /changes of its own, so it stays/)
	git(app, 'checkout', '--', 'cli.mjs')
	const out = update({ root: app, cli: join(app, 'cli.mjs'), from: pub })
	assert.ok(out.includes(`Now following ${pub}.`), out.join('|'))
	assert.deepEqual([git(app, 'remote', 'get-url', 'origin'), git(app, 'log', '-1', '--format=%s')], [pub, 'public'])
	assert.ok(out.includes('public install'), 'the new code finished the install')
})

test('restart audit: a process ID counts as ours only when its command line is ours; one that is not is never killed', async () => {
	const { aliveAs, commandOf } = await import('../src/os/process.ts')
	const { spawn } = await import('node:child_process')
	// Some Windows hosts cannot read command lines (CIM unavailable); then the old answer stands, which is tested below.
	const readable = commandOf(process.pid) !== undefined
	if (readable) assert.match(commandOf(process.pid)!, /node/i)
	assert.deepEqual([aliveAs(process.pid, /node/i), aliveAs(process.pid, /no-such-program-xyz/), aliveAs(2_000_000_011)], [true, !readable, false])
	const { realProcs } = await import('../src/runner/jobs.ts')
	const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore' })
	await new Promise(r => setTimeout(r, 200))
	try {
		if (readable) {
			assert.equal(realProcs.alive(other.pid!), false, 'someone else\'s process is not a run of ours')
			assert.equal(realProcs.kill(other.pid!), true)
			assert.equal(other.exitCode, null, 'and it was left running')
		}
	} finally { other.kill() }
})

test('restart audit: an OneDrive conflict copy is not a second record, and doctor can list it', async () => {
	const { Store } = await import('../src/store/state.ts')
	const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-r8-')), machine: 'mac' })
	const now = new Date().toISOString()
	store.saveJob({ schema: 1, id: 'J1', key: 'pr:1', goal: 'g', session: { agent: 'copilot', id: 's' }, state: 'done', purpose: 'work', parents: [], asks: [], createdAt: now, updatedAt: now } as never)
	writeFileSync(join(store.root, 'state', 'jobs', 'J1-LAPTOP.json'), readFileSync(join(store.root, 'state', 'jobs', 'J1.json')))
	assert.deepEqual(store.jobs().map(j => j.id), ['J1'])
	assert.deepEqual(store.conflictCopies().map(f => f.split(/[\\/]/).at(-1)), ['J1-LAPTOP.json'])
})

test('restart audit: doctor says when an installed runner has stopped running on this machine', async () => {
	const { runnerSilent } = await import('../src/admin.ts')
	const now = Date.parse('2026-10-20T12:00:00Z'), ago = (m: number) => new Date(now - m * 60_000).toISOString()
	const base = { installed: true, machine: 'mac', now }
	assert.equal(runnerSilent({ ...base, lease: { machine: 'mac', at: ago(20) } }), 0, 'a quiet poll is not a problem')
	assert.equal(runnerSilent({ ...base, lease: { machine: 'mac', at: ago(90) } }), 90)
	assert.equal(runnerSilent({ ...base, lease: { machine: 'vm', at: ago(90) } }), 0, 'another machine runs it')
	assert.equal(runnerSilent({ ...base, installed: false, lease: { machine: 'mac', at: ago(90) } }), 0)
})
