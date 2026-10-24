// Fictional git installs and the real page/update paths; not part of the unit-test suite.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Config } from '../src/core/types.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-version-proof-'))
for (const dir of ['local', 'copilot', 'config', 'cache', 'data', 'empty-bin', 'source', 'plain']) mkdirSync(join(root, dir))
Object.assign(process.env, { DELEGATE_LOCAL: join(root, 'local'), DELEGATE_ROOT: join(root, 'fictional'),
	COPILOT_HOME: join(root, 'copilot'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'),
	NODE_TEST_CONTEXT: 'fictional-proof', GIT_TRACE: join(root, 'git-trace.log') })
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { versionInfo, versionInfoLater, autoUpdate } = await import('../src/os/autoupdate.ts')
const { versionLabel, versionTitle } = await import('../src/web/react/domain/version.ts')
const { snapshotSchema } = await import('../src/web/react/domain/contracts.ts')
const { ROOT, VERSION } = await import('../src/paths.ts')
const store = new Store({ root: join(root, 'fictional'), machine: 'fictional' })
const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
	agent: { flavor: 'copilot', command: ['fictional-worker-never-launched'], tools: [], host: false }, maxParallel: 3, nudgeEveryMin: 10, dailyRuns: 100, autoUpdate: 'main' }
store.saveConfig(cfg)
writeFileSync(join(root, 'local', 'local.json'), JSON.stringify({ code: [] }))
const stateVersion = join(store.root, 'state', 'version.json')
mkdirSync(join(store.root, 'state'), { recursive: true })
writeFileSync(stateVersion, JSON.stringify({ schema: 1, version: '0.2.39' }))
const source = join(root, 'source'), install = join(root, 'install'), remote = join(root, 'origin.git'), plain = join(root, 'plain')
let inbox: Awaited<ReturnType<typeof serveInbox>> | undefined, passed = 0
function proof(text: string) { passed++; console.log(`PASS ${text}`) }
function git(cwd: string, ...args: string[]) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim() }
function commit(n: number) {
	writeFileSync(join(source, 'fictional.txt'), `Aurora change ${n}\n`)
	git(source, 'add', 'fictional.txt'); git(source, 'commit', '--quiet', '-m', `Aurora change ${n}`)
}
const trace = () => existsSync(process.env.GIT_TRACE!) ? readFileSync(process.env.GIT_TRACE!, 'utf8') : ''
const descriptions = () => trace().split('\n').filter(line => line.includes('built-in: git describe')).length
const readVersion = (path: string) => versionInfoLater('main', path, join(root, 'local'), 1440, store.root)
async function close() {
	if (!inbox) return
	await new Promise<void>((resolve, reject) => inbox!.server.close(error => error ? reject(error) : resolve()))
	inbox = undefined
}
const url = (path: string) => { const u = new URL(path, inbox!.url); u.search = new URL(inbox!.url).search; return u }
async function pageVersion() {
	const response = await fetch(url('/api/v1/page'))
	assert.equal(response.status, 200)
	return snapshotSchema.parse(await response.json()).version!
}
async function save(value: string) {
	const response = await fetch(url('/settings'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'autoUpdate', value }) })
	assert.equal(response.status, 200)
}
async function browserProof(expected: string, full: string) {
	if (!process.argv.includes('--browser')) return
	const { chromium } = await import('playwright-core')
	const browser = await chromium.launch({ channel: 'msedge', headless: true })
	try {
		for (const classic of [false, true]) for (const width of [1280, 400]) for (const colorScheme of ['light', 'dark'] as const) {
			store.saveUi('react', false, classic ? 'classic' : 'new')
			const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 800 : 860 }, colorScheme })
			try {
				const page = await context.newPage(), errors: string[] = []
				page.on('pageerror', error => errors.push(error.message))
				await page.goto(inbox!.url + (classic ? '#classic/home' : '#now'))
				const footer = page.locator(classic ? '.classic-home-tools' : 'footer')
				const label = footer.getByText(expected, { exact: true })
				await label.waitFor({ state: 'visible' })
				assert.equal(await label.getAttribute('title'), `${full} · Channel: main`)
				assert.equal(await label.count(), 1)
				await footer.getByRole('button', { name: 'Report a problem', exact: true }).click()
				const sheet = page.getByRole('dialog', { name: 'Report a problem', exact: true })
				await sheet.waitFor({ state: 'visible' })
				assert.equal(await sheet.getByText(expected, { exact: true }).getAttribute('title'), `${full} · Channel: main`)
				assert.deepEqual(errors, [])
				assert.equal(descriptions(), browserDescriptions)
			} finally { await context.close() }
		}
		proof(`${expected}: New/Classic footers and Report a problem, desktop/mobile, light/dark, full commit/channel hover; no git reads`)
	} finally { await browser.close() }
}
let browserDescriptions = 0
try {
	git(source, 'init', '--quiet', '-b', 'main')
	git(source, 'config', 'core.autocrlf', 'false')
	git(source, 'config', 'user.name', 'Robin'); git(source, 'config', 'user.email', 'robin@example.test')
	writeFileSync(join(source, 'package.json'), JSON.stringify({ version: '0.2.37', type: 'module' }))
	writeFileSync(join(source, 'migrate.cjs'), "if(process.argv[2]!=='migrate')throw Error('Expected migrate');require('node:fs').writeFileSync(require('node:path').join(process.env.DELEGATE_ROOT,'state','migration-ran'),'Aurora');\n")
	git(source, 'add', 'package.json', 'migrate.cjs'); commit(0); git(source, 'tag', 'v0.2.37')
	const releaseHead = git(source, 'rev-parse', 'HEAD'), releaseLabel = `Version 0.2.37 (${releaseHead.slice(0, 7)})`
	assert.equal(versionLabel(await readVersion(source)), releaseLabel)
	assert.equal(versionLabel(versionInfo('main', source, join(root, 'local'), 1440, store.root)), releaseLabel)
	proof('real release tag: app version first, short commit second, sync and async readers agree')

	commit(1); commit(2); commit(3); git(source, 'tag', 'aurora-preview')
	const head = git(source, 'rev-parse', 'HEAD'), expected = `Version 0.2.37+3 (${head.slice(0, 7)})`
	const info = await readVersion(source)
	assert.equal(versionLabel(info), expected); assert.equal(versionTitle(info), `${head} · Channel: main`)
	proof('three real commits after the release: +3 and full commit/channel; unrelated exact-match tag ignored')

	const plainPackage = join(plain, 'package.json')
	writeFileSync(plainPackage, JSON.stringify({ version: '0.2.41' }))
	assert.equal(versionLabel(await readVersion(plain)), 'Version 0.2.41')
	assert.equal(versionLabel(versionInfo('main', plain, join(root, 'local'), 1440, store.root)), 'Version 0.2.41')
	proof('non-git install: package 0.2.41 wins over stale state 0.2.39 in sync and async readers')
	const oldPath = process.env.PATH
	try {
		process.env.PATH = join(root, 'empty-bin')
		assert.equal(versionLabel(await readVersion(source)), 'Version 0.2.37')
		assert.equal(versionLabel(versionInfo('main', source, join(root, 'local'), 1440, store.root)), 'Version 0.2.37')
	} finally { process.env.PATH = oldPath }
	proof('unavailable git also uses installed package before stale state, in sync and async readers')
	rmSync(plainPackage)
	assert.equal(versionLabel(await readVersion(plain)), 'Version 0.2.39')
	assert.equal(versionLabel(versionInfo('main', plain, join(root, 'local'), 1440, store.root)), 'Version 0.2.39')
	writeFileSync(plainPackage, JSON.stringify({ version: '' }))
	assert.equal(versionLabel(await readVersion(plain)), 'Version 0.2.39')
	rmSync(stateVersion)
	assert.equal(versionLabel(await readVersion(plain)), `Version ${VERSION}`)
	writeFileSync(plainPackage, JSON.stringify({ version: '0.2.41' }))
	assert.equal(versionLabel(await readVersion(plain)), 'Version 0.2.41')
	proof('missing or empty package version falls back to saved state, then running version; package works without saved state')

	git(root, 'init', '--quiet', '--bare', '-b', 'main', remote)
	git(source, 'remote', 'add', 'origin', remote); git(source, 'push', '--quiet', '--tags', 'origin', 'main')
	git(root, 'clone', '--quiet', '--config', 'core.autocrlf=false', remote, install)
	if (process.argv.includes('--browser')) cpSync(join(ROOT, 'dist', 'web-react'), join(install, 'dist', 'web-react'), { recursive: true })
	git(install, 'checkout', '--quiet', '--detach', 'v0.2.37')
	inbox = await serveInbox(() => store, 0, 'fictional-version-token', undefined, install)
	assert.equal(versionLabel(await pageVersion()), releaseLabel)
	await close()
	git(install, 'checkout', '--quiet', 'main')
	proof('real release-tag page-server response retains the app version and exact installed commit through the client schema')
	const beforeStart = descriptions()
	inbox = await serveInbox(() => store, 0, 'fictional-version-token', undefined, install)
	assert.equal(descriptions() - beforeStart, 1)
	let beforeRequests = trace()
	for (let n = 0; n < 5; n++) assert.equal(versionLabel(await pageVersion()), expected)
	const now = Date.now
	try {
		Date.now = () => now() + 31_000
		for (let n = 0; n < 5; n++) assert.equal(versionLabel(await pageVersion()), expected)
	} finally { Date.now = now }
	await save('off'); assert.equal((await pageVersion()).channel, 'off')
	await save('default'); assert.equal((await pageVersion()).channel, 'release')
	await save('main'); assert.equal((await pageVersion()).channel, 'main')
	assert.equal(trace(), beforeRequests)
	browserDescriptions = descriptions()
	await browserProof(expected, head)
	assert.equal(trace(), beforeRequests)
	proof('server resolves identity once before listening; repeated real HTTP requests and setting saves spawn no git; channel remains current')

	commit(4); git(source, 'push', '--quiet', 'origin', 'main')
	const updatedHead = git(source, 'rev-parse', 'HEAD'), beforeUpdate = descriptions()
	const updated = autoUpdate({ setting: 'main', force: true, root: install, cli: join(install, 'migrate.cjs'), local: join(root, 'local') })
	assert.ok(updated); assert.equal(updated.rolledBack, undefined)
	assert.equal(readFileSync(join(store.root, 'state', 'migration-ran'), 'utf8'), 'Aurora')
	const deadline = Date.now() + 10_000
	let after = await pageVersion()
	while (after.fullCode !== updatedHead && Date.now() < deadline) { await delay(20); after = await pageVersion() }
	assert.equal(after.fullCode, updatedHead); assert.equal(versionLabel(after), `Version 0.2.37+4 (${updatedHead.slice(0, 7)})`)
	assert.equal(after.last?.to, updated.to); assert.ok(after.checkedAt)
	assert.equal(descriptions() - beforeUpdate, 1)
	beforeRequests = trace()
	for (let n = 0; n < 5; n++) assert.equal((await pageVersion()).fullCode, updatedHead)
	assert.equal(trace(), beforeRequests)
	proof('real autoUpdate fast-forward and fictional migrate refresh identity exactly once; later requests spawn no git and update status is preserved')

	await close()
	const afterClose = descriptions()
	commit(5); git(source, 'push', '--quiet', 'origin', 'main')
	assert.ok(autoUpdate({ setting: 'main', force: true, root: install, cli: join(install, 'migrate.cjs'), local: join(root, 'local') }))
	await delay(0)
	assert.equal(descriptions(), afterClose)
	proof('closing the server removes its update listener')

	writeFileSync(stateVersion, JSON.stringify({ schema: 1, version: '0.2.39' }))
	let beforeFallback = trace()
	inbox = await serveInbox(() => store, 0, 'fictional-version-token', undefined, plain)
	assert.equal(versionLabel(await pageVersion()), 'Version 0.2.41')
	assert.equal((await pageVersion()).code, undefined)
	await close()
	rmSync(plainPackage)
	inbox = await serveInbox(() => store, 0, 'fictional-version-token', undefined, plain)
	assert.equal(versionLabel(await pageVersion()), 'Version 0.2.39')
	await close()
	rmSync(stateVersion)
	writeFileSync(plainPackage, JSON.stringify({ version: '0.2.41' }))
	inbox = await serveInbox(() => store, 0, 'fictional-version-token', undefined, plain)
	assert.equal(versionLabel(await pageVersion()), 'Version 0.2.41')
	assert.equal(trace(), beforeFallback)
	proof('real non-git page servers show package 0.2.41 over stale state 0.2.39, retain state-only fallback and spawn no git')
	console.log(`VERSION PROOF: ${passed} fictional git/update/HTTP/browser journeys passed.`)
} finally {
	await close()
	delete process.env.GIT_TRACE
	rmSync(root, { recursive: true, force: true })
}
