// The new experience in the browser, N2 (R-NEX-05, R-NEX-07): the opened item with work (its checklist with owners, your move,
// Report your result), and a to-do from a sent reply that stays on Now until Mark done.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-n2blocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { seedNext, seedOwned, stub } = await import('./fixture.ts')

const PW = process.env.PLAYWRIGHT_CORE ?? (() => { try { return createRequire(import.meta.url).resolve('playwright-core').replace(/index\.js$/, 'index.mjs') } catch { return '' } })()
const skip = existsSync(PW) ? false : 'playwright-core not found (set PLAYWRIGHT_CORE)'
// deno-lint-ignore no-explicit-any
type Page = any
// deno-lint-ignore no-explicit-any
let browser: any
type Req = { url(): string; postData(): string | null }
type S = InstanceType<typeof Store>

before(async () => {
	if (skip) return
	const { chromium } = await import(pathToFileURL(PW).href)
	browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
})
after(async () => { await browser?.close() })

const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
// A page on the N2 store, with a runner applying what it posts, and the commands it posted.
async function open(hash: string, viewport = { width: 1280, height: 900 }) {
	const store = seedOwned(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-n2broot-')), machine: 'mac' })))
	const { url, server } = await serveInbox(() => store)
	let busy = false
	const runner = setInterval(async () => { if (busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), procs as never) } finally { busy = false } }, 50)
	const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript('window.DELEGATE_POLL_MS = 60;')
	const page: Page = await ctx.newPage()
	const errors: string[] = [], posted: string[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	page.on('request', (r: Req) => { if (/\/act\?/.test(r.url())) posted.push(JSON.parse(r.postData() ?? '{}').command) })
	await page.goto(url + hash)
	await page.waitForSelector('#main :first-child')
	return { store, url, page, errors, posted, close: async () => { clearInterval(runner); await ctx.close(); (server.closeAllConnections?.(), server.close()); assert.deepEqual(errors, []) } }
}
const until = async (f: () => boolean, ms = 6000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise(r => setTimeout(r, 50)); assert.ok(f()) }
const flat = async (p: Page, sel: string) => (await p.locator(sel).innerText()).replace(/\s+/g, ' ').trim()
const sends = (s: S) => s.workflows().filter(w => w.sent).map(w => `${w.code}:${w.sent!.msgId}`).sort()

test('N2 checklist: the opened item shows each step with its owner, done steps ticked, the current step marked, and your move', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.waitForSelector('#now-A40.open .iown')
		assert.match(await flat(t.page, '#now-A40 .imove'), /^YOUR MOVE Test checkout flows 1 and 2 on staging2\. Deploy done \d{1,2}:\d\d [AP]M \(build 991\)$/)
		const steps = await t.page.locator('#now-A40 .icheck li').evaluateAll((l: Element[]) => l.map(li => [li.className, li.querySelector('.iw')!.textContent!.replace(/\s+/g, ' ').trim(), li.querySelector('.io')!.textContent]))
		assert.deepEqual(steps, [
			['done', 'Route the staging ring to the dev instance (PR 4200002) (done)', 'You'],
			['done', 'Deploy build 991 to staging2 (done)', 'Delegate · build 991'],
			['now', 'Test checkout flow 1 (current step)', 'You'],
			['todo', 'Test checkout flow 2', 'You'],
			['todo', 'Report the result in Checkout sync', 'You'],
		])
		assert.equal(await t.page.locator('#now-A40 .icheck li[aria-current=step]').count(), 1)
		assert.match(await flat(t.page, '#now-A40 .ireport'), /Both work Issues found Blocked .*Draft my report Nothing is sent\. You see the draft first\./)
		assert.equal(await t.page.locator('#now-A40 form[data-form=tell]').count(), 0, 'one way to report in the opened item')
		assert.match(await flat(t.page, '#now-A40 .iown'), /WHAT HAPPENED, NEWEST FIRST \d{1,2}:\d\d [AP]M Build 991 succeeded/)
		// Someone else's step: who it waits on, then yours. No Report.
		await t.page.evaluate(() => { location.hash = '#now/A41' })
		await t.page.waitForSelector('#now-A41.open .iown')
		assert.equal(await flat(t.page, '#now-A41 .imove'), 'NEXT Waiting on Dev: Deploy build 992 to staging3 · Then you: Test both, report by Fri')
		assert.deepEqual(await t.page.locator('#now-A41 .icheck .io').allInnerTexts(), ['Dev', 'You'])
		assert.equal(await t.page.locator('#now-A41 .ireport').count(), 0)
		assert.deepEqual(t.posted, [], 'opening sends nothing')
		// Delegate drafted the report: the card asks for the ok, the checklist stays above it once, and Report waits.
		const w = t.store.byCode('A40')!
		t.store.save({ ...w, state: 'needs_human', draft: { text: 'Tested flows 1 and 2 on staging2: flow 1 returns 403.', commitment: false, sources: [] }, revAt: new Date().toISOString() })
		await t.page.evaluate(() => { location.hash = '#now/A40' })
		await t.page.waitForSelector('#now-A40.open #card-A40')
		assert.deepEqual([await t.page.locator('#now-A40 .icheck').count(), await t.page.locator('#now-A40 .plan').count(), await t.page.locator('#now-A40 .ireport').count()], [1, 0, 0])
		// Work with no plan and nothing for the owner draws the card alone, with its own work line.
		await t.page.evaluate(() => { location.hash = '#now/A34' })
		await t.page.waitForSelector('#now-A34.open #card-A34')
		assert.deepEqual([await t.page.locator('#now-A34 .iown').count(), await t.page.locator('#card-A34 .work').count()], [0, 1])
	} finally { await t.close() }
})

test('N2 Report: Draft my report sends one answer for a draft, and nothing goes to anyone', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.waitForSelector('#now-A40 .ireport')
		const before = sends(t.store)
		assert.equal(await t.page.locator('#now-A40 .ireport button[type=submit]').isDisabled(), true, 'a result first')
		await t.page.click('#now-A40 .ichoice:has-text("Issues found")')
		await t.page.fill('#saw-A40', '403 on checkout')
		await t.page.click('#now-A40 .ireport button[type=submit]')
		await until(() => t.store.byCode('A40')!.state === 'waiting_on_task')
		assert.deepEqual(t.posted, ['A40: Issues found: 403 on checkout'])
		assert.match(t.store.job('j-a40')!.asks.at(-1)!, /^Owner: "Issues found: 403 on checkout"\. The owner tested\. Read the results .* and draft the report\.$/)
		assert.deepEqual(sends(t.store), before, 'nothing sent')
		// The row now waits for Delegate's draft: no second Report while it works.
		await t.page.waitForFunction(() => !document.querySelector('#now-A40 .ireport'))
	} finally { await t.close() }
})

test('N2 400 px: an item opened in a folded section shows, with its checklist', { skip }, async () => {
	const t = await open('#now/A41', { width: 400, height: 860 })
	try {
		await t.page.waitForSelector('#now-A41.open .iown')
		assert.equal(await t.page.locator('#now-A41 .imove').isVisible(), true)
		assert.equal(await t.page.locator('#now-working').isVisible(), false, 'the other folded sections stay folded')
	} finally { await t.close() }
})

test('N2 Report: Both work with nothing typed sends the result alone', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.click('#now-A40 .ichoice:has-text("Both work")')
		await t.page.click('#now-A40 .ireport button[type=submit]')
		await until(() => t.posted.length === 1)
		assert.deepEqual(t.posted, ['A40: Both work'])
	} finally { await t.close() }
})

test('N2 to-do: a sent reply\'s to-do shows in Your move, and Mark done clears it without reopening the item', { skip }, async () => {
	const t = await open('#now')
	try {
		assert.match(await flat(t.page, '#now-A42'), /^RV To do: Update the release checklist in the wiki You promised Rita on \w+ · no tool can do it · Release sync .*Mark done/)
		await t.page.click('#now-A42 [data-act=nact][data-v="close A42"]')
		await t.page.waitForFunction(() => !document.getElementById('now-A42'))
		assert.deepEqual(t.posted, ['close A42'])
		const a42 = t.store.byCode('A42')!
		assert.deepEqual([a42.state, a42.kept!.every(x => !!x.done)], ['done', true], 'done, and still done')
	} finally { await t.close() }
})

test('N2 Report form: a redraw keeps its text and its choice', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.waitForSelector('#now-A40 .ireport')
		await t.page.fill('#saw-A40', 'Flow 2 timed out at 14:12')
		// Picking a result draws the page again.
		await t.page.click('#now-A40 .ichoice:has-text("Blocked")')
		await t.page.click('#now-A40 .ichoice:has-text("Issues found")')
		const state = async () => [await t.page.inputValue('#saw-A40'), await t.page.locator('#now-A40 .ichoice input:checked').evaluate((e: HTMLInputElement) => e.value), await t.page.locator('#now-A40 .ireport button[type=submit]').isDisabled()]
		assert.deepEqual(await state(), ['Flow 2 timed out at 14:12', '1', false])
		// New data from the server draws it again too.
		await t.page.evaluate(() => { (window as unknown as { n: number }).n = 0; new MutationObserver(() => { (window as unknown as { n: number }).n++ }).observe(document.getElementById('main')!, { childList: true }) })
		const w = t.store.byCode('A41')!
		t.store.save({ ...w, status: 'Changed', updatedAt: new Date().toISOString(), changedAt: new Date().toISOString() })
		await t.page.locator('body').click({ position: { x: 5, y: 5 } })
		await t.page.waitForFunction(() => (window as unknown as { n: number }).n > 0)
		assert.deepEqual(await state(), ['Flow 2 timed out at 14:12', '1', false])
		assert.deepEqual(t.posted, [], 'nothing sent')
	} finally { await t.close() }
})

// Review N2 (/tmp/review-n2.md): the Report form's words go out exactly, keep focus, and survive a failed send.
test('review N2 P2-4: a $ in what you saw goes out exactly as typed', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.click('#now-A40 .ichoice:has-text("Issues found")')
		await t.page.fill('#saw-A40', "got $& and $` back, cost $5")
		await t.page.click('#now-A40 .ireport button[type=submit]')
		await until(() => t.posted.length === 1)
		assert.deepEqual(t.posted, ["A40: Issues found: got $& and $` back, cost $5"])
	} finally { await t.close() }
})

test('review N2 P2-5: arrow keys move the Report choice and keep focus on it', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.focus('#now-A40 .ichoice input[value="0"]')
		await t.page.keyboard.press('ArrowRight')
		await t.page.waitForFunction(() => (document.querySelector('#now-A40 .ichoice input:checked') as HTMLInputElement | null)?.value === '1')
		assert.equal(await t.page.evaluate(() => (document.activeElement as HTMLInputElement).value), '1', 'focus on the choice, not the page')
		await t.page.keyboard.press('ArrowRight')
		await t.page.waitForFunction(() => (document.activeElement as HTMLInputElement).value === '2')
		assert.equal(await t.page.locator('#now-A40 .ichoice input:checked').evaluate((e: HTMLInputElement) => e.value), '2')
	} finally { await t.close() }
})

test('review N2 P2-6: a Report that cannot be sent keeps the choice and what you saw', { skip }, async () => {
	const t = await open('#now/A40')
	try {
		await t.page.route(/\/act\?/, (r: { abort(): Promise<void> }) => r.abort())
		await t.page.click('#now-A40 .ichoice:has-text("Blocked")')
		await t.page.fill('#saw-A40', 'staging2 returns 502 since 14:00, request 7f3a')
		await t.page.click('#now-A40 .ireport button[type=submit]')
		await t.page.waitForFunction(() => /Nothing was sent/.test(document.getElementById('now-A40')?.textContent ?? ''))
		assert.deepEqual([await t.page.inputValue('#saw-A40'), await t.page.locator('#now-A40 .ichoice input:checked').evaluate((e: HTMLInputElement) => e.value)], ['staging2 returns 502 since 14:00, request 7f3a', '2'])
		assert.equal(t.store.byCode('A40')!.state, 'open')
	} finally { await t.close() }
})

test('review N2 P1-1: a thread shows a part\'s draft, and the home\'s to-do in it has its own Mark done', { skip }, async () => {
	const t = await open('#now')
	try {
		const { item } = await import('./fixture.ts')
		const home = t.store.byCode('A41')!, at = new Date().toISOString()
		t.store.save({ ...home, kept: [{ id: 't1', text: 'Book the test account', at }], work: { ...home.work!, parts: ['w-A43'] } }, false)
		item(t.store, 'A43', 'Dev Moss', 'Dev Moss', { createdAt: at, partOf: 'w-A41', lastAsk: 'Deploying now, ok?', draft: { text: 'Sounds good.', commitment: false, sources: [] } })
		await t.page.goto(t.url + '#now/A43')
		await t.page.waitForSelector('#now-A43.open .itodos')
		assert.equal(await t.page.locator('#now-A41').count(), 0, 'one row for the thread: the part that needs the ok')
		await t.page.click('#now-A43 .iown [data-act=rowact][data-v="close A41"]')
		await until(() => t.store.byCode('A41')!.kept!.every(x => !!x.done))
		assert.deepEqual(t.posted, ['close A41'])
		assert.deepEqual([t.store.byCode('A41')!.state, t.store.byCode('A43')!.state], ['open', 'needs_human'], 'the part\'s draft still waits')
	} finally { await t.close() }
})

test('review N2 P1-1: Mark done shows once: on a to-do row only as its button, on another row in the opened item', { skip }, async () => {
	const t = await open('#now/A42')
	try {
		await t.page.waitForSelector('#now-A42.open .itodos')
		assert.equal(await t.page.locator('#now-A42 [data-act=nact][data-v="close A42"]').count(), 1, 'the row\'s own button, not a second one')
		const w = t.store.byCode('A40')!
		t.store.save({ ...w, kept: [{ id: 't1', text: 'Book the staging2 slot', at: new Date().toISOString() }] }, false)
		await t.page.goto(t.url + '#now/A40')
		await t.page.waitForSelector('#now-A40.open .itodos')
		assert.deepEqual([await t.page.locator('#now-A40').getAttribute('class'), await t.page.locator('#now-A40 .iown [data-act=rowact][data-v="close A40"]').count()], ['nrow k-your-step open', 1])
	} finally { await t.close() }
})

test('re-review N2 P2-A: Mark done on another item\'s to-do keeps the row\'s own buttons and every other Mark done', { skip }, async () => {
	const t = await open('#now')
	try {
		const { item } = await import('./fixture.ts')
		const home = t.store.byCode('A41')!, at = new Date(Date.now() - 60_000).toISOString()
		t.store.save({ ...home, kept: [{ id: 't1', text: 'Book the test account', at }], work: { ...home.work!, parts: ['w-A43'] } }, false)
		item(t.store, 'A43', 'Dev Moss', 'Dev Moss', { createdAt: at, partOf: 'w-A41', lastAsk: 'Deploying now, ok?', draft: { text: 'Sounds good.', commitment: false, sources: [] }, kept: [{ id: 't1', text: 'Send Dev the ring name', at }] })
		await t.page.goto(t.url + '#now/A43')
		await t.page.waitForSelector('#now-A43.open .itodos')
		assert.equal(await t.page.getAttribute('#now-A43 .iown [data-v="close A41"]', 'data-seen'), at, 'it carries the newest to-do it drew')
		await t.page.click('#now-A43 .iown [data-v="close A41"]')
		await until(() => t.store.byCode('A41')!.kept!.every(x => !!x.done))
		// A41 has no open to-do left, so its list goes; the toast says what was marked.
		await t.page.waitForFunction(() => !document.querySelector('#now-A43 .iown [data-v="close A41"]') && /Marked your to-do on A41 done/.test(document.getElementById('toast')?.textContent ?? ''))
		assert.equal(await t.page.locator('#now-A43 .nract').innerText(), 'Hide', 'the row keeps its own button')
		assert.equal(await t.page.locator('#now-A43 .iown [data-v="close A43"]').isDisabled(), false, 'the other Mark done stays')
		assert.deepEqual(t.posted, ['close A41'])
	} finally { await t.close() }
})

test('re-review N2 P2-C: Mark done from the page leaves a to-do kept after the page drew', { skip }, async () => {
	const t = await open('#now')
	try {
		const { item } = await import('./fixture.ts')
		const home = t.store.byCode('A41')!, at = new Date(Date.now() - 60_000).toISOString()
		t.store.save({ ...home, kept: [{ id: 't1', text: 'Book the test account', at }], work: { ...home.work!, parts: ['w-A43'] } }, false)
		item(t.store, 'A43', 'Dev Moss', 'Dev Moss', { createdAt: at, partOf: 'w-A41', lastAsk: 'Deploying now, ok?', draft: { text: 'Sounds good.', commitment: false, sources: [] } })
		await t.page.goto(t.url + '#now/A43')
		await t.page.waitForSelector('#now-A43.open .iown [data-v="close A41"]')
		// The page draws no more: a send in Teams keeps a new to-do the page never shows.
		await t.page.route(/\/data\?/, (r: { abort(): Promise<void> }) => r.abort())
		t.store.save({ ...t.store.byCode('A41')!, kept: [{ id: 't1', text: 'Book the test account', at }, { id: 't2', text: 'Send Kim the refund numbers', at: new Date().toISOString() }] }, false)
		await t.page.click('#now-A43 .iown [data-v="close A41"]')
		await until(() => !!t.store.byCode('A41')!.kept![0].done)
		assert.deepEqual(t.store.byCode('A41')!.kept!.map(x => [x.id, !!x.done]), [['t1', true], ['t2', false]])
	} finally { await t.close() }
})
