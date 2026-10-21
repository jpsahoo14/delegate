import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-recovery-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox, writeSnapshot } = await import('../src/web/server.ts')
const { seedNext } = await import('./fixture.ts')

test('React preview recovery: a failed lazy chunk and disabled JavaScript both offer a working exit', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-recovery-')), machine: 'test' }))
	const { server, url } = await serveInbox(() => store)
	const browser = await chromium.launch({ channel: 'chrome', headless: true })
	try {
		for (const javaScriptEnabled of [true, false]) {
			store.saveUi('react')
			const context = await browser.newContext({ javaScriptEnabled })
			const page = await context.newPage()
			if (javaScriptEnabled) await page.route('**/assets/App-*.js?*', route => route.abort())
			await page.goto(url)
			if (javaScriptEnabled) await page.getByRole('heading', { name: 'Could not load the React preview' }).waitFor()
			const exit = page.getByRole('link', { name: /continue in New/i })
			await exit.click()
			await page.waitForURL(u => !u.searchParams.has('ui'))
			assert.equal(store.ui().ui, 'new')
			assert.deepEqual(store.answers(), [])
			await context.close()
		}
	} finally {
		await browser.close()
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})

test('React preview snapshot: a saved React choice still draws Classic without a version menu', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-snapshot-')), machine: 'test' }))
	store.saveUi('react')
	writeSnapshot(store)
	const html = readFileSync(join(store.root, 'inbox.html'), 'utf8')
	assert.equal(html.includes('id="react-root"'), false)
	const browser = await chromium.launch({ channel: 'chrome', headless: true })
	try {
		const page = await browser.newPage()
		await page.setContent(html)
		await page.locator('#app #main > :first-child').waitFor()
		assert.equal(await page.locator('#app').getAttribute('data-ui'), null)
		assert.equal(await page.getByRole('combobox', { name: 'App version' }).count(), 0)
		assert.equal(await page.locator('#tabs a[href="#home"]').count(), 1)
		assert.equal(store.ui().ui, 'react')
	} finally { await browser.close() }
})
