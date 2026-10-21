// Flows the browser tests did not drive yet: the rest of the keys, Check now, Try again, Catch up's Needs me, the card menu,
// the automation sheet's ways out, the narrow-screen tab menu, To learn's picks, and Copy details (B37 safety net).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-slocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { seedInbox, stub } = await import('./fixture.ts')

const PW = process.env.PLAYWRIGHT_CORE ?? (() => { try { return createRequire(import.meta.url).resolve('playwright-core').replace(/index\.js$/, 'index.mjs') } catch { return '' } })()
const skip = existsSync(PW) ? false : 'playwright-core not found (set PLAYWRIGHT_CORE)'
// deno-lint-ignore no-explicit-any
type Page = any
// deno-lint-ignore no-explicit-any
let browser: any
type Req = { url(): string; postData(): string | null }

before(async () => {
	if (skip) return
	const { chromium } = await import(pathToFileURL(PW).href)
	browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
})
after(async () => { await browser?.close() })

// The page's commands run with fake processes: "continue A1" from the card menu must never open a real window (bug 10-21 windows).
const noProcs = { start: () => ({ pid: 0 }), alive: () => false, kill: () => true, openWindow: () => {}, bootMs: () => 0 }
// The same harness as browser.test.ts, plus the commands the page posts, in order.
async function open(hash = '', prep?: (s: InstanceType<typeof Store>) => void, viewport = { width: 1280, height: 900 }) {
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-sroot-')), machine: 'mac' }))
	prep?.(store)
	const { url, server } = await serveInbox(() => store)
	let busy = false
	const runner = setInterval(async () => { if (busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), noProcs) } finally { busy = false } }, 50)
	const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript('window.DELEGATE_POLL_MS = 60')
	const page: Page = await ctx.newPage()
	const errors: string[] = [], posted: string[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	page.on('request', (r: Req) => { if (/\/act\?/.test(r.url())) posted.push(JSON.parse(r.postData() ?? '{}').command) })
	await page.goto(url + hash)
	await page.waitForSelector('#main :first-child')
	return { store, page, errors, posted, close: async () => { clearInterval(runner); await ctx.close(); server.close(); assert.deepEqual(errors, []) } }
}
const until = async (f: () => boolean, ms = 5000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise(r => setTimeout(r, 50)); assert.ok(f()) }
const focused = (p: Page) => p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)

test('smoke keys: arrows move, e edits, l moves the item to later, g h goes Home', { skip }, async () => {
	const t = await open('#focus')
	try {
		await t.page.waitForFunction(() => document.activeElement?.id === 'card-A1')
		await t.page.keyboard.press('ArrowRight')
		assert.equal(await focused(t.page), 'card-A2')
		await t.page.keyboard.press('ArrowLeft')
		assert.equal(await focused(t.page), 'card-A1')
		await t.page.keyboard.press('e')
		assert.equal(await focused(t.page), 'ed-A1', 'e opens the reply for editing')
		await t.page.keyboard.press('Escape')
		assert.equal(await focused(t.page), 'card-A1')
		await t.page.click('[data-act=canceledit]')
		await t.page.focus('#card-A1')
		await t.page.keyboard.press('l')
		await until(() => t.posted.includes('later A1'))
		await t.page.waitForFunction(() => location.hash === '#focus/A2')
		assert.match(await t.page.locator('.queue li:last-child').innerText(), /Priya/, 'Later moves it to the end of the queue')
		await t.page.keyboard.press('g')
		await t.page.keyboard.press('h')
		await t.page.waitForFunction(() => location.hash === '#home')
	} finally { await t.close() }
})

test('smoke keys: u takes back the last automatic reply from anywhere', { skip }, async () => {
	const t = await open('#home')
	try {
		await t.page.keyboard.press('u')
		await t.page.waitForFunction(() => location.hash === '#done/replies')
		await until(() => t.posted.some(c => /^undo A\d+$/.test(c)))
	} finally { await t.close() }
})

test('smoke: Check now in Settings and Try again on the health banner ask the runner to retry', { skip }, async () => {
	const t = await open('#settings/system')
	try {
		await t.page.click('details.adv summary')
		await t.page.click('details.adv [data-act=rowact][data-v=retry]')
		await until(() => t.posted.includes('retry'))
		await t.page.goto(t.page.url().replace(/#.*$/, '#home'))
		await t.page.click('.health [data-act=healthfix]')
		await until(() => t.posted.filter(c => c === 'retry').length === 2)
	} finally { await t.close() }
})

test('smoke: a Catch up row\'s Needs me makes it an item', { skip }, async () => {
	const t = await open('#home', s => {
		const base = s.workflows().find(w => w.code === 'A10')!
		s.save({ ...base, id: 'f1', code: 'A41', intent: 'none', sent: undefined, draft: undefined, status: 'cc', chat: { ...base.chat, test: false }, fyi: { line: 'Shared the v5 spec', weight: 'normal' }, asker: { id: 'p1', name: 'Dev Rao' }, updatedAt: new Date().toISOString() } as never, false)
	})
	try {
		await t.page.hover('li[data-code=A41]')
		await t.page.click('li[data-code=A41] [data-act=rowact]')
		await until(() => t.posted.includes('mine A41'))
		await t.page.waitForFunction(() => !document.querySelector('li[data-code=A41] [data-act=rowact]'))
	} finally { await t.close() }
})

test('smoke: the card menu shows and hides the thread, asks to open on the computer, and closes on a click elsewhere', { skip }, async () => {
	const t = await open('#focus/A1')
	try {
		await t.page.click('#card-A1 [data-act=menu]')
		assert.equal(await t.page.getAttribute('#card-A1 [data-act=menu]', 'aria-expanded'), 'true')
		await t.page.click('#card-A1 .menu-pop [data-act=thread]')
		await t.page.waitForSelector('#card-A1 ol.thread')
		await t.page.click('#card-A1 .ask [data-act=thread]')
		await t.page.waitForSelector('#card-A1 ol.thread', { state: 'detached' })
		await t.page.click('#card-A1 [data-act=menu]')
		await t.page.click('#main h2.c-name')
		assert.equal(await t.page.locator('#card-A1 .menu.open').count(), 0, 'a click elsewhere closes the menu')
		await t.page.click('#card-A1 [data-act=menu]')
		await t.page.click('#card-A1 .menu-pop [data-act=continue]')
		await until(() => t.posted.includes('continue A1'))
		await t.page.click('#card-A1 .notes [data-act=askmore]')
		assert.equal(await focused(t.page), 'askin-A1', 'Ask more puts the cursor in the Ask box')
	} finally { await t.close() }
})

test('smoke: the automation sheet closes with Close, Escape, and a click outside; Back returns to step 1', { skip }, async () => {
	const t = await open('#ongoing')
	try {
		await t.page.click('[data-act=newauto]')
		await t.page.click('.sheet [data-act=closesheet]')
		await t.page.waitForSelector('.sheet', { state: 'detached' })
		await t.page.click('[data-act=newauto]')
		await t.page.keyboard.press('Escape')
		await t.page.waitForSelector('.sheet', { state: 'detached' })
		await t.page.click('[data-act=newauto]')
		await t.page.click('.sheet [data-act=tpl][data-v=remind]')
		assert.equal(await t.page.innerText('#sh-h'), 'Remind someone')
		await t.page.click('.sheet [data-act=every][data-v=day]')
		assert.match(await t.page.innerText('#au-prev'), /^Every day at 4:00 PM/)
		await t.page.fill('#au-text', 'Status please')
		assert.match(await t.page.innerText('#au-prev'), /“Status please”/)
		await t.page.click('.sheet [data-act=autoback]')
		assert.equal(await t.page.innerText('#sh-h'), 'New automation')
		await t.page.mouse.click(5, 450)
		await t.page.waitForSelector('.sheet', { state: 'detached' })
	} finally { await t.close() }
})

test('smoke: on a narrow screen the tab menu opens and closes, and a tab takes you there', { skip }, async () => {
	const t = await open('#home', undefined, { width: 420, height: 800 })
	try {
		await t.page.click('#navbtn')
		assert.deepEqual([await t.page.getAttribute('#navbtn', 'aria-expanded'), await t.page.evaluate(() => document.getElementById('tabs')!.classList.contains('open'))], ['true', true])
		await t.page.click('#tabs a[href="#ongoing"]')
		await t.page.waitForFunction(() => location.hash === '#ongoing')
		assert.deepEqual([await t.page.getAttribute('#navbtn', 'aria-expanded'), await t.page.evaluate(() => document.getElementById('tabs')!.classList.contains('open'))], ['false', false])
	} finally { await t.close() }
})

test('smoke: To learn saves only the checked facts, and Skip skips', { skip }, async () => {
	const t = await open('#knowledge')
	try {
		await t.page.click('label:has([data-fact="1"])')
		assert.equal(await t.page.innerText('#pri-K1'), 'Save 1 fact')
		await t.page.click('#pri-K1')
		await until(() => t.posted.includes('ok K1 #2'))
	} finally { await t.close() }
	const s = await open('#knowledge')
	try {
		await s.page.click('[data-code=K1] [data-act=skipk]')
		await until(() => s.posted.includes('skip K1'))
	} finally { await s.close() }
})

test('smoke: Details on a card copies its lines for a bug report', { skip }, async () => {
	const t = await open('#focus/A1', s => s.saveConfig({ ...s.config(), showDetails: true }))
	try {
		await t.page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
		await t.page.click('#card-A1 details.why:not([data-why]) summary')
		const lines = await t.page.innerText('#card-A1 pre.dbg')
		await t.page.click('#card-A1 [data-act=copydebug]')
		await t.page.waitForSelector('#toast:has-text("Details copied.")')
		// The Windows clipboard hands text back with CRLF line ends.
		assert.equal((await t.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), lines)
	} finally { await t.close() }
})
