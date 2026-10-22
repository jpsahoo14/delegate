import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-browser-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { seedNext } = await import('./fixture.ts')

test('React preview browser: cold lazy assets, both themes and widths, safe switching and visible save failure', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-browser-')), machine: 'test' }))
	store.saveUi('react')
	const { url, server } = await serveInbox(() => store)
	const browser = await chromium.launch({ channel: 'chrome', headless: true })
	const shots = mkdtempSync(join(tmpdir(), 'delegate-react-shots-'))
	try {
		for (const theme of ['light', 'dark'] as const) for (const viewport of [{ width: 1280, height: 800 }, { width: 400, height: 860 }]) {
			const context = await browser.newContext({ viewport, colorScheme: theme })
			const page = await context.newPage()
			const errors: string[] = [], assets: string[] = []
			page.on('pageerror', error => errors.push(error.message))
			page.on('response', response => {
				if (response.url().includes('/web-react/')) {
					assets.push(response.url())
					if (response.status() !== 200) errors.push(`Asset ${response.status()}: ${response.url()}`)
				}
			})

			const response = await page.goto(url)
			assert.match(response!.headers()['content-security-policy'], /script-src 'self';/)
			assert.doesNotMatch(response!.headers()['content-security-policy'], /script-src[^;]*unsafe-inline/)
			assert.equal(response!.headers()['referrer-policy'], 'no-referrer')
			await page.getByRole('heading', { name: 'Now', exact: true }).waitFor({ timeout: 10_000 }).catch(error => {
				throw new Error(`${String(error)}\nBrowser errors: ${errors.join('; ')}\nAssets: ${assets.join('; ')}`)
			})
			assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
			assert.ok(assets.filter(a => /\.js\?/.test(a)).length >= 2, 'entry and cold lazy chunk loaded')
			assert.ok(assets.filter(a => /\.css\?/.test(a)).length >= 2, 'entry CSS and lazy preload CSS loaded')
			for (const asset of assets) {
				assert.equal(new URL(asset).searchParams.get('t'), new URL(url).searchParams.get('t'))
				const stripped = new URL(asset)
				stripped.searchParams.delete('t')
				assert.equal((await fetch(stripped)).status, 403)
			}
			await page.screenshot({ path: join(shots, `foundation-${viewport.width}-${theme}.png`), fullPage: true })
			if (viewport.width < 560) await page.getByRole('button', { name: 'Menu', exact: true }).click()
			await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme === 'dark' ? 'light' : 'dark')
			assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'dark' ? 'light' : 'dark')
			await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme)
			assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
			await page.route('**/ui?*', route => route.abort())
			await page.getByRole('combobox', { name: 'App version' }).selectOption('new')
			await page.getByRole('alert').waitFor()
			assert.equal(store.ui().ui, 'react')
			assert.equal(await page.getByRole('combobox', { name: 'App version' }).inputValue(), 'react')
			await page.unroute('**/ui?*')
			for (const version of ['new', 'classic'] as const) {
				if (viewport.width < 560 && !await page.getByRole('combobox', { name: 'App version' }).isVisible()) await page.getByRole('button', { name: 'Menu', exact: true }).click()
				await Promise.all([page.waitForEvent('load'), page.getByRole('combobox', { name: 'App version' }).selectOption(version)])
				await page.locator('#main > :first-child').waitFor()
				assert.equal(store.ui().ui, version)
				if (viewport.width < 560) await page.locator('#navbtn').click()
				const menu = page.locator('select[data-ui-choice]:visible')
				await Promise.all([page.waitForEvent('load'), menu.selectOption('react')])
				await page.getByRole('heading', { name: 'Now', exact: true }).waitFor()
			}
			assert.deepEqual(store.answers(), [], 'switching never queues an action')
			assert.deepEqual(errors, [])
			await context.close()
		}
		console.log(`React screenshots: ${shots}`)
	} finally {
		await browser.close()
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})
