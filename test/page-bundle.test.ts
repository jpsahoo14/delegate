// The page's bundle: what it may be built from, how it is served from source, and that every surface can parse it (B37 review).
import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Script } from 'node:vm'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-pblocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { ROOT } = await import('../src/paths.ts')
const { SHARED, bundlePage, pageInputs } = await import('../src/web/page-bundle.ts')
const { pageBuild, pageScript, renderApp } = await import('../src/web/shell.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { Store } = await import('../src/store/state.ts')
const { view } = await import('../src/web/view.ts')
const { seedInbox } = await import('./fixture.ts')

function project(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), 'delegate-pb-'))
	for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), text) }
	return root
}

test('page bundle: the browser code comes only from src/web/app and the named shared pure files', () => {
	// Windows gives back slashes.
	const inputs = pageInputs(ROOT).map(f => f.replaceAll('\\', '/'))
	assert.ok(inputs.includes('src/web/app/app.ts'))
	assert.deepEqual(inputs.filter(f => !f.startsWith('src/web/app/') && !SHARED.includes(f)), [])
})

test('page bundle: importing server code stops the build, and says what to do', () => {
	const root = project({ 'src/web/app/app.ts': "import { x } from '../../store/state.ts'\nconsole.log(x)\n", 'src/store/state.ts': 'export const x = 1\n' })
	assert.throws(() => bundlePage(root), /may only use src\/web\/app\/.*imports src\/store\/state\.ts\. Use import type/)
})

test('page bundle: from source, an edit to a shared file outside src/web/app shows on the next build', () => {
	const root = project({ 'src/web/app/app.ts': "import { whose } from '../../core/whose.ts'\nconsole.log(whose)\n", 'src/core/whose.ts': "export const whose = 'before'\n" })
	assert.match(bundlePage(root), /"before"/)
	writeFileSync(join(root, 'src/core/whose.ts'), "export const whose = 'after'\n")
	const later = new Date(Date.now() + 5000); utimesSync(join(root, 'src/core/whose.ts'), later, later)
	assert.match(bundlePage(root), /"after"/, 'the cache is keyed on every input, not only src/web/app')
})

test('shell: without esbuild, the page from source serves dist/web/app.js and says so once', () => {
	const said = mock.method(console, 'error', () => {})
	try {
		const fail = () => { throw Object.assign(new Error("Cannot find module 'esbuild'"), { code: 'MODULE_NOT_FOUND' }) }
		const dist = readFileSync(join(ROOT, 'dist', 'web', 'app.js'), 'utf8')
		assert.equal(pageScript(fail), dist)
		assert.equal(pageScript(fail), dist)
		assert.equal(said.mock.callCount(), 1)
		assert.match(String(said.mock.calls[0].arguments[0]), /uses dist\/web\/app\.js: Cannot find module 'esbuild'/)
	} finally { said.mock.restore() }
})

test('shell: a page that cannot be built is not hidden behind an old one; the page server answers 500 with why', async () => {
	const bad = () => { throw new Error('The page bundle may only use src/web/app/ and src/core/whose.ts; it imports src/store/state.ts.') }
	assert.throws(() => pageScript(bad), /may only use/)
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-pb500-')), machine: 'mac' }))
	const real = pageBuild.bundle
	pageBuild.bundle = bad
	const { url, server } = await serveInbox(() => store)
	try {
		const r = await fetch(url)
		assert.equal(r.status, 500)
		assert.match(await r.text(), /^The page could not be drawn: The page bundle may only use .* it imports src\/store\/state\.ts\.$/)
		pageBuild.bundle = real
		assert.equal((await fetch(url)).status, 200, 'the server kept running')
	} finally { pageBuild.bundle = real; (server.closeAllConnections?.(), server.close()) }
})

test('panel and page: the inlined page script parses where each surface runs it', () => {
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-pbroot-')), machine: 'mac' }))
	const v = view(store, undefined)
	// The chat panel runs the MCP Apps client, the boot data, the transport, and the page as one module script.
	const panel = /<script type="module">([\s\S]*)<\/script>/.exec(renderApp(v, 'panel', 'globalThis.McpExtApps = {};'))![1]
	const file = join(mkdtempSync(join(tmpdir(), 'delegate-pbm-')), 'panel.mjs')
	writeFileSync(file, panel)
	const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
	assert.equal(r.status, 0, r.stderr)
	// The page and the snapshot run classic scripts.
	for (const mode of ['page', 'snapshot'] as const) for (const [, code] of renderApp(v, mode).matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Script(code), mode)
})
