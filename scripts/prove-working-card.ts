// Manual #48 proof, outside npm test/CI: a row Delegate is still working on never looks done. Try again (the A76 shape) gives a clock
// and the working line in Classic's queue, with no strike, and the card shows one status strip; a Send that went is ticked and struck.
// A working item opened directly is never blank. New's Now places it under Delegate's work. Fictional temp root, real page server in
// Edge, stub source and runner (no model). PROOF_SHOTS=<folder> keeps 1280-light screenshots.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium, type Locator, type Page } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-48-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { seedNext, seedOwned, seedChanges, stub } = await import('../test/fixture.ts')
type Store = InstanceType<typeof Store>

const pass = (what: string) => console.log(`PASS ${what}`)
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const WORKING = "Delegate is working on it · back to you when there's something to send"
const shot = async (page: Page, name: string) => { if (process.env.PROOF_SHOTS) await page.screenshot({ path: join(process.env.PROOF_SHOTS, `48-${name}.png`) }) }

async function open(hash: string) {
	const store = seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-48-')), machine: 'test' }))))
	// A24 as the runner leaves a review job it started (jobs.ts): its status says what it is doing.
	store.save({ ...store.byCode('A24')!, status: 'Working: Reviewing PR 1301 for Dev' }, false)
	store.saveUi('react')
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'))
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
	await context.addInitScript(() => { (globalThis as { DELEGATE_POLL_MS?: number }).DELEGATE_POLL_MS = 80 })
	const page = await context.newPage(), errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(url + hash)
	await page.locator('main').waitFor()
	return { store, page, close: async () => {
		await context.close(); server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		assert.deepEqual(errors, [])
	} }
}
async function click(page: Page, button: Locator) {
	const posted = page.waitForResponse(r => r.url().includes('/api/v1/actions?') && r.request().method() === 'POST')
	await button.click(); await posted
}
const runner = (store: Store) => applyAnswers(store, stub, store.config(), procs as never)
// own: Write the reply yourself is offered (a redraft he can answer himself); long: the 3-minute line (PM 19:50).
async function strip(card: Locator, own: boolean, long = false) {
	const s = card.locator('.card-working')
	await s.waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`No working strip; the card says: ${await card.innerText()}`, { cause: error }) })
	if (long) assert.match(await s.innerText(), /^Still working · taking longer than usual · started \d/)
	else assert.match(await s.innerText(), /Delegate is working on it · back to you when there's something to send/)
	assert.match(await s.innerText(), /started /)
	assert.doesNotMatch(await s.innerText(), /Needs you|usually under a minute/)
	assert.equal(await card.locator('button[data-primary=true]').count(), 0, 'no button leads while Delegate works')
	assert.equal(await card.getByRole('button', { name: /^(Send|Try again)$/ }).count(), 0, 'nothing to send or retry')
	assert.equal(await card.getByRole('button', { name: 'Write the reply yourself', exact: true }).count(), own ? 1 : 0, own ? 'Write the reply yourself is visible' : 'not offered while a job runs')
	await card.locator('.card-more-menu summary').click()
	await card.getByRole('button', { name: 'Dismiss', exact: true }).waitFor()
	await card.locator('.card-more-menu summary').click()
	return (await s.innerText()).replace(/\s+/g, ' ').trim()
}

// Classic: Try again on a stopped item (A22, the A76 shape) → clock row, no strike; card strip. Then Kim's Send → ticked and struck.
{
	const t = await open('#classic/focus/A22')
	try {
		const card = t.page.locator('.classic-open-card')
		const row = (code: string) => t.page.locator(`.classic-queue a[data-classic-code="${code}"]`)
		await click(t.page, card.locator('button[data-primary=true]', { hasText: 'Try again' }))
		await runner(t.store)
		const wf = t.store.byCode('A22')!
		assert.ok(wf.state === 'running' || wf.state === 'waiting_on_task', `Try again started the work again (${wf.state}: ${wf.status})`)
		await row('A22').and(t.page.locator('[data-look="working"]')).waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`A22 row: ${await row('A22').getAttribute('data-look')}`, { cause: error }) })
		assert.equal(await row('A22').locator('.classic-queue-clock').count(), 1, 'a clock, not a tick')
		assert.equal(await row('A22').locator('.classic-queue-check').count(), 0)
		assert.equal(await row('A22').locator('.classic-queue-preview').evaluate(e => (globalThis as unknown as { getComputedStyle: (e: unknown) => { textDecorationLine: string } }).getComputedStyle(e).textDecorationLine), 'none', 'no strike')
		assert.equal((await row('A22').locator('.classic-queue-preview').innerText()).trim(), WORKING)
		const line = await strip(card, true)
		await shot(t.page, 'classic-try-again')
		pass(`classic: Try again on a stopped item → the row shows a clock and "${WORKING}", no strike; the card shows "${line}"`)
		await t.page.goto(t.page.url().replace(/#.*$/, '#classic/focus/A20'))
		const kim = t.page.locator('.classic-open-card')
		await kim.locator('button[data-primary=true]', { hasText: 'Send' }).waitFor()
		await click(t.page, kim.locator('button[data-primary=true]', { hasText: 'Send' }))
		await runner(t.store)
		assert.ok(t.store.byCode('A20')!.sent, 'Kim\'s reply was sent')
		await row('A20').and(t.page.locator('[data-look="done"]')).waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`A20 row: ${await row('A20').getAttribute('data-look')}`, { cause: error }) })
		assert.equal(await row('A20').locator('.classic-queue-check').count(), 1, 'a tick')
		assert.equal(await row('A20').locator('.classic-queue-preview').evaluate(e => (globalThis as unknown as { getComputedStyle: (e: unknown) => { textDecorationLine: string } }).getComputedStyle(e).textDecorationLine), 'line-through', 'struck')
		assert.equal(await row('A22').getAttribute('data-look'), 'working', 'the working row is still working, not struck')
		await shot(t.page, 'classic-queue')
		pass('classic: a Send that went is ticked and struck; the Try-again row next to it keeps its clock')
	} finally { await t.close() }
}
// Classic: a working item opened directly (A24, a review job running) is never blank.
{
	const t = await open('#classic/focus/A24')
	try {
		const line = await strip(t.page.locator('.classic-open-card'), false, true)
		pass(`classic: a working item opened directly, 4 minutes in, shows "${line}"`)
	} finally { await t.close() }
}
// New: Try again on A22 moves it under Delegate's work; its card shows the strip. A working item opened from Now is never blank.
{
	const t = await open('#now')
	try {
		const row = t.page.locator('.now-row[data-code="A22"]')
		const tryAgain = row.getByRole('button', { name: 'Try again', exact: true }).first()
		await click(t.page, tryAgain)
		await runner(t.store)
		await t.page.locator('section[aria-labelledby=\"section-working\"] .now-row[data-code="A22"]').waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`A22 is not under Delegate's work: ${await t.page.locator('.now-row[data-code="A22"]').evaluateAll(rows => rows.map(r => r.closest('section')?.getAttribute('aria-labelledby')))}`, { cause: error }) })
		const moved = t.page.locator('section[aria-labelledby=\"section-working\"] .now-row[data-code="A22"]')
		assert.equal(await moved.locator('.row-message, .row-line3').evaluateAll(els => els.some(e => (globalThis as unknown as { getComputedStyle: (e: unknown) => { textDecorationLine: string } }).getComputedStyle(e).textDecorationLine.includes('line-through'))), false, 'no strike')
		assert.match(await moved.locator('.row-title').innerText(), /^Trying again · started \d/)
		await moved.locator('.row-title').click()
		const line = await strip(moved.locator('.item-card').first(), true)
		await shot(t.page, 'new-try-again')
		pass(`new: Try again moves the row under Delegate's work, unstruck; its card shows "${line}"`)
		const a24 = t.page.locator('section[aria-labelledby=\"section-working\"] .now-row[data-code="A24"]')
		assert.match(await a24.locator('.row-title').innerText(), /^Still trying · started \d/)
		await a24.locator('.row-title').click()
		await strip(a24.locator('.item-card').first(), false, true)
		pass('new: a working item 4 minutes in reads "Still trying · started …" on its row and "Still working · taking longer than usual" on its card')
		// Write the reply yourself during the redraft: his own words go once.
		await moved.locator('.row-title').click()
		const card = moved.locator('.item-card').first()
		await card.getByRole('button', { name: 'Write the reply yourself', exact: true }).click()
		await card.getByRole('textbox').first().fill('I will review PR 2204 myself this afternoon.')
		await click(t.page, card.getByRole('button', { name: 'Send your reply', exact: true }))
		await runner(t.store)
		assert.equal(t.store.byCode('A22')!.sent?.text, 'I will review PR 2204 myself this afternoon.')
		pass('new: Write the reply yourself during the redraft sends his own words once')
	} finally { await t.close() }
}
// PE 20:02: the redraft lands while he is typing his own reply. His text survives, and his Send either goes once or is refused visibly
// with the text kept; it is never dropped silently.
for (const experience of ['new', 'classic'] as const) {
	const t = await open(experience === 'new' ? '#now' : '#classic/focus/A22')
	try {
		const posts: unknown[] = []
		t.page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/v1/actions')) posts.push(r.postDataJSON()) })
		const first = experience === 'new' ? t.page.locator('.now-row[data-code="A22"]') : t.page.locator('.classic-open-card')
		await click(t.page, first.getByRole('button', { name: 'Try again', exact: true }).first())
		await runner(t.store)
		if (experience === 'new') { await t.page.goto(t.page.url().replace(/#.*$/, '#now/working')); await t.page.locator('section[aria-labelledby="section-working"] .now-row[data-code="A22"] .row-title').click() }
		const card = experience === 'new' ? t.page.locator('section[aria-labelledby="section-working"] .now-row[data-code="A22"] .item-card').first() : t.page.locator('.classic-open-card')
		await card.getByRole('button', { name: 'Write the reply yourself', exact: true }).click()
		const words = 'I will look at PR 2204 myself after lunch.'
		await card.getByRole('textbox').first().fill(words)
		// The redraft lands now: Delegate's new draft is waiting for him.
		const wf = t.store.byCode('A22')!
		t.store.save({ ...wf, state: 'needs_human', status: 'Ready', draft: { text: 'Delegate reviewed PR 2204: two comments.', commitment: false, sources: [] }, revAt: new Date().toISOString() })
		await card.getByText('Changed since you looked. Your current text is kept.').waitFor({ timeout: 10_000 })
		assert.equal(await card.getByRole('textbox').first().inputValue(), words, 'his text survives the redraft')
		const before = posts.length
		const sendOwn = card.getByRole('button', { name: 'Send your reply', exact: true })
		const answered = t.page.waitForResponse(r => r.url().includes('/api/v1/actions?'), { timeout: 10_000 })
		await sendOwn.click()
		await answered
		await runner(t.store)
		const sent = t.store.byCode('A22')!.sent?.text
		if (sent) {
			assert.equal(sent, words, 'his words went, not the redraft')
			assert.equal(posts.length - before, 1, 'once')
			pass(`${experience}: a redraft landed while he typed; his text survived and his Send went once`)
		} else {
			const refusal = card.getByRole('alert').filter({ hasText: /no longer offered|Changed since you looked/ }).first()
			await refusal.waitFor({ timeout: 10_000 })
			assert.equal(await card.getByRole('textbox').first().inputValue(), words, 'the text is kept after the refusal')
			assert.equal(t.store.byCode('A22')!.sent, undefined, 'nothing went')
			pass(`${experience}: a redraft landed while he typed; his text survived and his Send was refused visibly ("${(await refusal.innerText()).trim()}"), text kept`)
		}
	} finally { await t.close() }
}
await browser.close()
