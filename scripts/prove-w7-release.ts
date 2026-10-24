// Manual W7 proof (#42, PE on db06346e), outside npm test/CI: a click saved in tab storage before #42 has no `intent`.
// After the release it must be released with "Not saved…" once /result answers 404 and the click is at least 60 s old,
// and must keep waiting while the server answers 202. Fictional temp root; nothing is posted.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-w7-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { reactProjection } = await import('../src/web/react-projection.ts')
const { seedNext, seedOwned, seedChanges } = await import('../test/fixture.ts')

const NOT_SAVED = "Not saved. Your click didn't reach Delegate; try again."
const pass = (what: string) => console.log(`PASS ${what}`)
const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function run(name: string, { ageMs, server }: { ageMs: number; server: 404 | 202 }) {
	const store = seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-w7-')), machine: 'test' }))))
	store.saveUi('react')
	const { server: http, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'))
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	await context.addInitScript(() => { (globalThis as { DELEGATE_POLL_MS?: number }).DELEGATE_POLL_MS = 80 })
	const page = await context.newPage(), errors: string[] = [], posts: string[] = [], results: number[] = []
	page.on('pageerror', error => errors.push(error.message))
	page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/v1/actions')) posts.push(r.url()) })
	page.on('response', r => { if (r.url().includes('/api/v1/result?')) results.push(r.status()) })
	if (server === 202) await page.route('**/api/v1/result?*', route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ working: true, text: 'Still working on it' }) }))
	try {
		const action = reactProjection(store).snapshot.entities.actions['A1/send-edit']
		await page.goto(url + '#now')
		await page.locator('[data-row-kind]').first().waitFor()
		// The pre-release shape: no `intent` (the W7 entry in the owner's tab storage looked like this).
		const id = crypto.randomUUID()
		await page.evaluate(entry => sessionStorage.setItem('delegate-react-pending-v1', JSON.stringify([entry])), { submissionId: id, item: action.item, rev: action.rev, action: action.id, at: Date.now() - ageMs })
		await page.reload()
		const row = page.locator('.now-row[data-code="A1"]')
		await row.getByRole('button', { name: 'Open', exact: true }).click()
		const stored = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('delegate-react-pending-v1') ?? '[]').length)
		if (server === 404 && ageMs >= 60_000) {
			await row.locator('p.error', { hasText: NOT_SAVED }).waitFor({ timeout: 10_000 })
			assert.equal(await stored(), 0, 'the released click is forgotten')
			assert.ok(results.includes(404), 'the server answered 404')
			assert.equal(await row.getByText('Do not send again').count(), 0, 'no "Do not send again" after release')
			assert.equal(await row.getByRole('button', { name: 'Check saved result' }).count(), 0)
		} else {
			await page.waitForTimeout(1500)
			assert.ok(results.filter(s => s === server).length >= 3, `the server answered ${server} repeatedly`)
			assert.equal(await stored(), 1, 'the click stays pending')
			assert.equal(await row.locator('p.error', { hasText: NOT_SAVED }).count(), 0, 'not released')
			await row.getByText('Checking the saved submission. Do not send again.').waitFor()
		}
		assert.deepEqual(posts, [], 'nothing is sent again (the old click kept no request)')
		assert.equal(store.byCode('A1')!.sent, undefined)
		assert.deepEqual(errors, [])
		pass(name)
	} finally {
		await page.unrouteAll({ behavior: 'wait' }); await context.close(); http.closeAllConnections()
		await new Promise<void>(resolve => http.close(() => resolve()))
	}
}

try {
	await run('a pre-release click 61 s old: 404 releases it with "Not saved…", storage cleared, nothing posted', { ageMs: 61_000, server: 404 })
	await run('a pre-release click 5 s old: 404 keeps it waiting (younger than a minute)', { ageMs: 5_000, server: 404 })
	await run('a pre-release click 61 s old: 202 keeps it waiting (the server is still handling it)', { ageMs: 61_000, server: 202 })
} finally { await browser.close() }
