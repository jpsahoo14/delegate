import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox, saveUiFrom } = await import('../src/web/server.ts')
const { seedNext } = await import('./fixture.ts')
const { settingsView } = await import('../src/web/settings.ts')

test('React preview: choice persists per machine without changing existing choices or queuing actions', () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-react-choice-'))
	const store = seedNext(new Store({ root, machine: 'test' }))
	for (const ui of ['react', 'classic', 'new'] as const) {
		assert.equal(saveUiFrom(store, { ui }).ok, true)
		assert.equal(new Store({ root, machine: 'test' }).ui().ui, ui)
		assert.equal(new Store({ root, machine: 'other' }).ui().ui, 'classic')
	}
	assert.equal(saveUiFrom(store, { ui: 'unknown' }).ok, false)
	assert.deepEqual(store.answers(), [])
	store.saveUi('react')
	assert.ok(settingsView(store).rows.every(row => !row.help.includes('Check for updates on Home')))
})

test('React preview: served build and all assets require the token; classic and new still serve the old shell', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-serve-')), machine: 'test' }))
	store.saveUi('react')
	const { server, url } = await serveInbox(() => store)
	try {
		const response = await fetch(url)
		assert.equal(response.status, 200)
		const html = await response.text()
		assert.match(html, /id="react-root"/)
		assert.doesNotMatch(html, /window\.DELEGATE_IO/)
		const script = /src="([^"]+\.js[^"]*)"/.exec(html)?.[1]
		assert.ok(script, 'production entry is included')
		const assetUrl = new URL(script.replaceAll('&amp;', '&'), url)
		assert.equal((await fetch(assetUrl)).status, 200)
		assetUrl.searchParams.delete('t')
		assert.equal((await fetch(assetUrl)).status, 403)
		assert.equal((await fetch(new URL('/web-react/not-owned.js' + new URL(url).search, url))).status, 404)
		for (const ui of ['classic', 'new'] as const) {
			store.saveUi(ui)
			assert.match(await (await fetch(url)).text(), /window\.DELEGATE_IO/)
		}
	} finally {
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})

test('React preview: build manifest includes every shipped asset', () => {
	const manifest = JSON.parse(readFileSync('INTEGRITY.json', 'utf8')) as { files: Record<string, string> }
	assert.ok(Object.keys(manifest.files).some(path => /^dist\/web-react\/assets\/.+\.js$/.test(path)))
	assert.ok(manifest.files['dist/web-react/index.html'])
})

test('React preview: the public lockfile has no non-public registry URLs', () => {
	const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { resolved?: string }> }
	for (const pkg of Object.values(lock.packages)) if (pkg.resolved) assert.ok(pkg.resolved.startsWith('https://registry.npmjs.org/'), 'all packages resolve from the public registry')
})

test('React preview: the full gate caps concurrent browser workers and includes component tests', () => {
	const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string } }
	assert.match(manifest.scripts.test, /--test-concurrency=4/)
	assert.match(manifest.scripts.test, /npm run test:react/)
})
