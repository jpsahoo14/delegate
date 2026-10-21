// Dogfood: an install that follows a bundle updates itself, and a version that does not start is rolled back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-up-local-'))
const { autoUpdate, untold } = await import('../src/os/autoupdate.ts')

const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

function commit(dev: string, cli: string, msg: string, bundle: string) {
	writeFileSync(join(dev, 'cli.mjs'), cli)
	git(dev, 'add', '-A'); git(dev, 'commit', '-qm', msg)
	git(dev, 'bundle', 'create', bundle, '--all')
}

test('a bundle install fast-forwards to a version that starts, tells the owner once, and rolls back one that does not', async () => {
	const base = mkdtempSync(join(tmpdir(), 'delegate-up-')), dev = join(base, 'dev'), bundle = join(base, 'delegate.bundle'), app = join(base, 'app'), local = join(base, 'local')
	execFileSync('git', ['init', '-q', '-b', 'main', dev])
	commit(dev, 'process.exit(0)\n', 'v1', bundle)
	execFileSync('git', ['clone', '-q', bundle, app])
	const opt = (now: number) => ({ root: app, cli: join(app, 'cli.mjs'), local, now, everyMin: 10 })
	const t0 = Date.parse('2026-10-20T10:00:00Z')

	assert.equal(autoUpdate(opt(t0)), undefined, 'nothing new')
	commit(dev, 'console.log("v2")\n', 'v2: ask after send', bundle)
	assert.equal(autoUpdate(opt(t0 + 60_000)), undefined, 'checks at most every 10 minutes')
	const { versionInfo } = await import('../src/os/autoupdate.ts')
	assert.deepEqual([versionInfo(undefined, app, local).auto, versionInfo(undefined, app, local).checkedAt], [true, new Date(t0).toISOString()], 'a bundle install updates itself')
	const u = autoUpdate(opt(t0 + 11 * 60_000))!
	assert.deepEqual([u.subject, u.rolledBack], ['v2: ask after send', undefined])
	assert.equal(git(app, 'log', '-1', '--format=%s'), 'v2: ask after send')
	assert.equal(untold(local)?.subject, 'v2: ask after send')
	assert.equal(untold(local), undefined, 'told once')

	commit(dev, 'throw new Error("boom: bad build")\n', 'v3: broken', bundle)
	const bad = autoUpdate(opt(t0 + 22 * 60_000))!
	assert.match(bad.rolledBack!, /boom: bad build/)
	assert.equal(git(app, 'log', '-1', '--format=%s'), 'v2: ask after send', 'back on the version that starts')
	assert.match(untold(local)!.rolledBack!, /boom/)
	assert.equal(autoUpdate(opt(t0 + 33 * 60_000)), undefined, 'the same bad commit is not tried again')
	assert.equal(untold(local), undefined, 'so the owner is told once')
	commit(dev, 'process.exit(0)\n', 'v4: fixed', bundle)
	assert.equal(autoUpdate(opt(t0 + 44 * 60_000))?.subject, 'v4: fixed', 'a newer commit is tried')

	assert.equal(autoUpdate({ ...opt(t0 + 55 * 60_000), setting: false }), undefined, 'autoUpdate: false turns it off')

	commit(dev, 'process.exit(0) // v5\n', 'v5: daily', bundle)
	const daily = (now: number) => autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, now })
	assert.equal(daily(t0 + 66 * 60_000), undefined, 'by default it looks once a day')
	assert.equal(autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, now: t0 + 67 * 60_000, everyMin: 0 }), undefined, 'a hand-edited 0 still waits the default')
	assert.equal(daily(t0 + 44 * 60_000 + 23 * 3_600_000), undefined)
	assert.equal(daily(t0 + 44 * 60_000 + 24 * 3_600_000 + 60_000)?.subject, 'v5: daily', 'a day after the last look')
})

test('a clone of the public repo follows tagged releases; "main" follows every commit', () => {
	const base = mkdtempSync(join(tmpdir(), 'delegate-up2-')), dev = join(base, 'dev'), app = join(base, 'app'), local = join(base, 'local')
	const opt = (setting?: 'main' | 'release') => ({ root: app, cli: join(app, 'cli.mjs'), local, force: true, setting })
	execFileSync('git', ['init', '-q', '-b', 'main', dev])
	writeFileSync(join(dev, 'cli.mjs'), 'process.exit(0)\n'); git(dev, 'add', '-A'); git(dev, 'commit', '-qm', 'v0.1.0'); git(dev, 'tag', 'v0.1.0')
	execFileSync('git', ['clone', '-q', dev, app])
	writeFileSync(join(dev, 'cli.mjs'), '// v0.2.0\n'); git(dev, 'commit', '-qam', 'v0.2.0'); git(dev, 'tag', 'v0.2.0')
	writeFileSync(join(dev, 'cli.mjs'), '// work in progress\n'); git(dev, 'commit', '-qam', 'wip')
	assert.deepEqual([autoUpdate(opt())?.to, autoUpdate(opt())?.to], ['v0.2.0', undefined], 'the newest release, not the newest commit, and only once')
	assert.equal(git(app, 'log', '-1', '--format=%s'), 'v0.2.0')
	assert.equal(autoUpdate(opt('main'))?.subject, 'wip')
})

test('the page restarts on the same port and link when the installed code changes', async () => {
	const { supervise, RESTART } = await import('../src/os/autoupdate.ts')
	const { spawn } = await import('node:child_process')
	const repo = mkdtempSync(join(tmpdir(), 'delegate-page-'))
	execFileSync('git', ['init', '-q', '-b', 'main', repo])
	writeFileSync(join(repo, 'a'), '1'); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'v1')
	const child = join(repo, 'child.mjs')
	writeFileSync(child, `import { createServer } from 'node:http'
const { exitWhenUpdated } = await import(${JSON.stringify(new URL('../src/os/autoupdate.ts', import.meta.url).href)})
const [port, token] = process.env.PAGE.split(':')
const s = createServer((q, r) => r.end(token + ' ' + process.pid)).listen(Number(port), '127.0.0.1')
exitWhenUpdated(() => s.close(), ${JSON.stringify(repo)}, 50)
`)
	const net = await import('node:net')
	const port = await new Promise<number>(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)) }) })
	const get = async () => { for (let i = 0; i < 100; i++) { try { return await (await fetch(`http://127.0.0.1:${port}/`)).text() } catch { await new Promise(r => setTimeout(r, 50)) } } throw new Error('no page') }
	let ended = -1
	const cur = supervise((p, t) => spawn(process.execPath, [child], { env: { ...process.env, PAGE: `${p}:${t}` }, stdio: 'ignore' }), port, 'tok', c => { ended = c })
	try {
		const [tok1, pid1] = (await get()).split(' ')
		writeFileSync(join(repo, 'a'), '2'); git(repo, 'commit', '-qam', 'v2')
		let pid2 = pid1
		for (let i = 0; i < 100 && pid2 === pid1; i++) { await new Promise(r => setTimeout(r, 50)); pid2 = (await get()).split(' ')[1] }
		assert.notEqual(pid2, pid1, 'a new process serves the page')
		assert.equal(tok1, 'tok')
		assert.equal((await get()).split(' ')[0], 'tok', 'same link')
		assert.equal(ended, -1, 'the parent kept running')
		assert.equal(RESTART, 75)
	} finally { cur().kill() }
})

test('the page gets a few more tries when it crashes, then gives up', async () => {
	const { supervise } = await import('../src/os/autoupdate.ts')
	const { spawn } = await import('node:child_process')
	let starts = 0, ended = -1
	supervise(() => { starts++; return spawn(process.execPath, ['-e', 'process.exit(3)'], { stdio: 'ignore' }) }, 0, 't', c => { ended = c }, 5)
	for (let i = 0; i < 200 && ended === -1; i++) await new Promise(r => setTimeout(r, 25))
	assert.deepEqual([starts, ended], [6, 3])
})

test('Check now skips the 10-minute wait, and a check that cannot reach the bundle says why', async () => {
	const { versionInfo } = await import('../src/os/autoupdate.ts')
	const base = mkdtempSync(join(tmpdir(), 'delegate-up3-')), dev = join(base, 'dev'), bundle = join(base, 'delegate.bundle'), app = join(base, 'app'), local = join(base, 'local')
	execFileSync('git', ['init', '-q', '-b', 'main', dev])
	commit(dev, 'process.exit(0)\n', 'v1', bundle)
	execFileSync('git', ['clone', '-q', bundle, app])
	const now = Date.parse('2026-10-20T10:00:00Z')
	autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, now })
	commit(dev, 'process.exit(0)\n// v2\n', 'v2', bundle)
	assert.equal(autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, now: now + 1000 }), undefined)
	assert.equal(autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, now: now + 2000, force: true })?.subject, 'v2')
	writeFileSync(join(app, 'cli.mjs'), '// my local fix\n')
	assert.equal(autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, force: true }), undefined)
	assert.match(versionInfo(true, app, local).failed!, /local changes/)
	git(app, 'checkout', '--', 'cli.mjs')
	execFileSync('git', ['remote', 'set-url', 'origin', join(base, 'gone.bundle')], { cwd: app })
	assert.equal(autoUpdate({ root: app, cli: join(app, 'cli.mjs'), local, now: now + 3000, force: true, setting: 'main' }), undefined)
	assert.match(versionInfo(true, app, local).failed ?? '', /gone\.bundle|does not exist|not a valid|fatal/i)
	assert.equal(versionInfo(true, app, local).code, git(app, 'rev-parse', 'HEAD').slice(0, 7))
})
