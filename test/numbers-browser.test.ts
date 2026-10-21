// The Numbers tab in the browser (R-NEX-11), in both experiences and the chat panel: no badge, the numbers asked for only when
// the tab opens and when its window changes, every number opening its rows, a summary with numbers only, and offline.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// One clock for the store, the server, and the page (review P2-4): a Tuesday midday UTC, so the seeded weeks never straddle
// a Monday and Node and the page count the same week.
process.env.TZ = 'UTC'
const NOW = Date.parse('2026-10-20T12:00:00.000Z')
mock.timers.enable({ apis: ['Date'], now: NOW })
process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-numblocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox, withUi } = await import('../src/web/server.ts')
const { renderApp } = await import('../src/web/shell.ts')
const { view } = await import('../src/web/view.ts')
const { numbersPage } = await import('../src/web/numbers.ts')
const { seedInbox, seedNext, seedNumbers } = await import('./fixture.ts')

const PW = process.env.PLAYWRIGHT_CORE ?? (() => { try { return createRequire(import.meta.url).resolve('playwright-core').replace(/index\.js$/, 'index.mjs') } catch { return '' } })()
const skip = existsSync(PW) ? false : 'playwright-core not found (set PLAYWRIGHT_CORE)'
// deno-lint-ignore no-explicit-any
type Page = any
// deno-lint-ignore no-explicit-any
let browser: any
type S = InstanceType<typeof Store>
type Route = { abort(): Promise<void>; continue(): Promise<void> }

before(async () => {
	if (skip) return
	const { chromium } = await import(pathToFileURL(PW).href)
	browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
})
after(async () => { await browser?.close(); mock.timers.reset() })

// Every made-up name in the seeds, and words from their messages: none may reach a copied summary.
const NAMES = /Kim|Rita|Dev Moss|Alex|Pete|Lin Brook|Priya|Ravi|Ana|Sam|Arun|Vikram|Meera|Tom|Lena|Robin|Acme|Globex|build 512|release notes/
const SEEDS: Record<'classic' | 'new', (s: S) => S> = { classic: s => seedNumbers(seedInbox(s), new Date(NOW)), new: s => seedNumbers(seedNext(s, 'new'), new Date(NOW)) }
const READY = '.numbers[data-state=ready]'

// A page on a seeded store, with every /numbers request it made (its window).
async function open(ui: 'classic' | 'new', hash = '', o: { viewport?: { width: number; height: number }; init?: string } = {}) {
	const store = SEEDS[ui](new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-numbroot-')), machine: 'mac' }))
	const { url, server } = await serveInbox(() => store)
	const ctx = await browser.newContext({ viewport: o.viewport ?? { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript(`window.DELEGATE_POLL_MS = 60;${o.init ?? ''}`)
	const page: Page = await ctx.newPage()
	const errors: string[] = [], asked: string[] = [], polls: string[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	page.on('request', (r: { url(): string }) => { const u = new URL(r.url()); if (u.pathname === '/numbers') asked.push(u.searchParams.get('window') ?? ''); if (u.pathname === '/data') polls.push(u.search) })
	await page.clock.setFixedTime(NOW)
	await page.goto(url + hash)
	await page.waitForSelector('#main :first-child')
	return { store, url, page, errors, asked, polls, close: async () => { await ctx.close(); server.close(); assert.deepEqual(errors, []) } }
}
const until = async (f: () => boolean, ms = 6000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise(r => setTimeout(r, 50)); assert.ok(f()) }
const codesShown = (p: Page) => p.$$eval('#main ul.rows > li[data-code]', (ls: HTMLElement[]) => ls.map(l => l.dataset.code))

// Each case runs in both experiences.
const CASE = {
	asks: async (ui: 'classic' | 'new') => {
		const t = await open(ui, ui === 'new' ? '#now' : '#home')
		try {
			assert.equal(await t.page.evaluate(() => document.getElementById('app')!.dataset.ui ?? 'classic'), ui === 'new' ? 'next' : 'classic')
			const tabs = await t.page.$$eval('#tabs a', (as: HTMLAnchorElement[]) => as.map(a => a.getAttribute('href')))
			assert.deepEqual(tabs.slice(-2), ['#numbers', '#settings'], 'last before Settings')
			assert.equal(await t.page.locator('#tabs a[href="#numbers"] .count').count(), 0, 'no count badge')
			assert.equal(await t.page.textContent('#tabs a[href="#numbers"]'), 'Numbers')
			// The page polls /data meanwhile; none of it asks for the numbers.
			await until(() => t.polls.length >= 3)
			assert.deepEqual(t.asked, [], 'not before the tab opens')
			await t.page.click('#tabs a[href="#numbers"]')
			await t.page.waitForSelector(READY)
			assert.deepEqual(t.asked, ['this'])
			const n = t.polls.length
			await until(() => t.polls.length >= n + 3)
			await t.page.click('#main .num-hero .num-big a')
			await t.page.waitForSelector('#num-list')
			await t.page.click('#main .num-back')
			await t.page.waitForSelector('#main .num-hero')
			assert.deepEqual(t.asked, ['this'], 'polling, a list, and coming back from it do not ask again')
			// Review P1-1: a real pick keeps focus on the select; the page must still redraw, and keep the focus there.
			await t.page.focus('#numwin')
			await t.page.$eval('#numwin', (s: HTMLSelectElement) => { s.value = '4w'; s.dispatchEvent(new Event('change', { bubbles: true })) })
			await t.page.waitForFunction(() => /in the last 4 weeks$/.test(document.querySelector('.num-big')?.textContent ?? ''), null, { timeout: 3000 })
			await t.page.waitForSelector(READY)
			assert.equal(await t.page.evaluate(() => document.activeElement?.id), 'numwin', 'the select keeps the focus across the redraw')
			assert.deepEqual(t.asked, ['this', '4w'], 'a new window asks again')
			assert.match(await t.page.textContent('.num-trend'), /▲ \d+ more than the 4 weeks before/)
			await t.page.click('#tabs a[href="#done"]')
			await t.page.waitForSelector('#main .filters')
			await t.page.click('#tabs a[href="#numbers"]')
			await t.page.waitForSelector(READY)
			assert.deepEqual(t.asked, ['this', '4w', '4w'], 'opening the tab again asks again, for the window it shows')
			assert.equal(await t.page.$eval('#numwin', (s: HTMLSelectElement) => s.value), '4w')
		} finally { await t.close() }
	},

	rows: async (ui: 'classic' | 'new') => {
		const t = await open(ui, '#numbers')
		try {
			await t.page.waitForSelector(READY)
			const d = numbersPage(t.store, 'this')
			assert.equal((await t.page.textContent('.num-hero .num-big')).trim(), `${d.handled.n} asks this week`)
			assert.match(await t.page.textContent('.num-trend'), /^Last week: \d+$/, 'a small week: no arrow')
			await t.page.click('.num-all')
			await t.page.waitForSelector('#num-list')
			assert.equal(await t.page.evaluate(() => location.hash), '#numbers/handled')
			assert.deepEqual(await codesShown(t.page), d.handled.codes)
			assert.match(await t.page.textContent('#main ul.rows'), /asked:.*You:/s, 'a reply reads as the exchange, as in Done')
			await t.page.goBack()
			await t.page.waitForSelector('.num-hero')
			// Missed: the item made from a pointed-at message, the message no item was made for, and the Catch up line moved to Needs me.
			await t.page.click('.num-card a[href="#numbers/missed"]')
			await t.page.waitForSelector('#num-list')
			assert.deepEqual(await codesShown(t.page), [...d.now.missed.pointed, ...d.now.missed.mine])
			const lost = t.page.locator('li[data-code="missed:1760000000001"]')
			assert.match(await lost.textContent(), /You pointed at this message\. No item was made for it\./)
			assert.equal(await lost.locator('a').getAttribute('href'), 'https://teams.microsoft.com/l/message/19%3Aglobexsync%40thread.v2/1760000000001')
			// A bar opens its week; replies as drafted open the replies divided by, by kind.
			await t.page.goto(`${t.url}#numbers`)
			await t.page.waitForSelector(READY)
			const bar = t.page.locator('.num-bars li').nth(6).locator('a')
			assert.match(await bar.getAttribute('aria-label'), /^Week of \w+ \d+: \d+ handled$/)
			await bar.click()
			await t.page.waitForSelector('#num-list')
			assert.deepEqual(await codesShown(t.page), d.bars[6].codes)
			await t.page.goto(`${t.url}#numbers/replies`)
			await t.page.waitForSelector('#num-list')
			assert.deepEqual(await t.page.$$eval('#main h3.section-h', (hs: HTMLElement[]) => hs.map(h => h.textContent!.replace(/ · \d+$/, ''))), ['As drafted', 'Edited before sending', 'You typed in Teams'])
			assert.equal((await codesShown(t.page)).length, new Set([...d.now.replies.drafted, ...d.now.replies.edited, ...d.now.replies.teams]).size)
			// Review P2-1: an address naming no list, even one every object has, says so instead of breaking the page.
			for (const k of ['constructor', '__proto__', 'toString', 'nowhere']) {
				await t.page.goto(`${t.url}#numbers/${k}`)
				await t.page.waitForFunction(() => /That list is not on this tab\./.test(document.getElementById('main')?.textContent ?? ''), null, { timeout: 3000 })
			}
		} finally { await t.close() }
	},

	copy: async (ui: 'classic' | 'new') => {
		const t = await open(ui, '#numbers', { init: "window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async s => { window.__copied.push(s) } } });" })
		try {
			await t.page.waitForSelector(READY)
			await t.page.click('[data-act=numcopy]')
			await t.page.waitForFunction(() => /Summary copied/.test(document.getElementById('toast')?.textContent ?? ''))
			const [s] = await t.page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)
			assert.match(s, /^Delegate numbers · This week \(/)
			assert.match(s, /Handled for you: \d+/)
			assert.doesNotMatch(s, NAMES)
			assert.doesNotMatch(s, /\bA\d+\b|missed:|https?:/)
			assert.equal(await t.page.textContent('.num-sum'), s, 'what is copied can be read first')
		} finally { await t.close() }
	},

	offline: async (ui: 'classic' | 'new') => {
		const t = await open(ui, ui === 'new' ? '#now' : '#home')
		try {
			await t.page.route('**/numbers?**', (r: Route) => r.abort())
			await t.page.click('#tabs a[href="#numbers"]')
			await t.page.waitForSelector('.numbers[data-state=failed]')
			assert.match(await t.page.textContent('.num-fail'), /Could not load the numbers\. .* could not be reached from this page/)
			assert.equal(await t.page.getAttribute('.num-fail', 'role'), 'alert')
			await t.page.selectOption('#numwin', 'last')
			await t.page.waitForSelector('.numbers[data-state=failed]')
			await t.page.unroute('**/numbers?**')
			await t.page.click('[data-act=numretry]')
			await t.page.waitForSelector(READY)
			assert.match(await t.page.textContent('.num-range'), /to Sun/)
		} finally { await t.close() }
	},
}
const both = (f: (ui: 'classic' | 'new') => Promise<void>) => async () => { await f('classic'); await f('new') }

test('numbers tab, both experiences: last before Settings with no badge; it asks for the numbers only when it opens and when its window changes', { skip }, both(CASE.asks))
test('numbers tab, both experiences: a number opens exactly the rows it counted, in Done\'s format; a message with no item says so', { skip }, both(CASE.rows))
test('numbers tab, both experiences: Copy a summary puts numbers only on the clipboard, with no names, message text, or codes', { skip }, both(CASE.copy))
test('numbers tab, both experiences: offline it says so clearly, nothing breaks, and Try again loads it', { skip }, both(CASE.offline))

test('numbers tab: the narrow layout stacks the cards, keeps all 8 bars, and the first week says so', { skip }, async () => {
	const store = seedNumbers(seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-numbroot-')), machine: 'mac' })), new Date(NOW), true)
	const { url, server } = await serveInbox(() => store)
	const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, reducedMotion: 'reduce', locale: 'en-US' })
	try {
		const page: Page = await ctx.newPage(), errors: string[] = []
		page.on('pageerror', (e: Error) => errors.push(e.message))
		await page.clock.setFixedTime(NOW)
		await page.goto(`${url}#numbers`)
		await page.waitForSelector(READY)
		assert.equal(await page.textContent('.num-trend'), 'Your first week. Trends start next week.')
		const xs = await page.$$eval('.num-cards > .num-card', (cs: HTMLElement[]) => cs.map(c => c.getBoundingClientRect().left))
		assert.equal(new Set(xs).size, 1, 'one column')
		const bars = await page.$$eval('.num-bars li', (ls: HTMLElement[]) => ls.map(l => l.getBoundingClientRect().right))
		assert.equal(bars.length, 8)
		assert.ok(Math.max(...bars) <= 400, 'no bar off the screen')
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 400), true, 'nothing scrolls sideways')
		assert.deepEqual(errors, [])
	} finally { await ctx.close(); server.close() }
})

// The chat panel asks through its own tool, numbers_view, with a stub MCP Apps host, the same as next-browser's panel test.
test('numbers tab: the chat panel shows it and asks through numbers_view, only when it opens and when its window changes', { skip }, async () => {
	const store = seedNumbers(seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-numbpanel-')), machine: 'mac' })), new Date(NOW))
	const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, reducedMotion: 'reduce', locale: 'en-US' })
	try {
		const page: Page = await ctx.newPage(), errors: string[] = [], calls: string[] = []
		page.on('pageerror', (e: Error) => errors.push(e.message))
		await page.exposeFunction('__tool', (name: string, args: { since?: string; ui?: string; window?: 'this' | 'last' | '4w' | 'all' }) => {
			calls.push(name === 'numbers_view' ? `numbers_view:${args.window}` : name)
			if (name === 'inbox_view') return { structuredContent: JSON.parse(JSON.stringify(withUi(store, view(store, args.since), args.ui === 'new'))) }
			if (name === 'numbers_view') return { structuredContent: JSON.parse(JSON.stringify(numbersPage(store, args.window))) }
			return { structuredContent: { ok: true } }
		})
		await page.clock.setFixedTime(NOW)
		await page.goto('about:blank')
		const host = 'window.DELEGATE_POLL_MS = 60; globalThis.McpExtApps = { App: class { async connect() {} async callServerTool(r) { return window.__tool(r.name, r.arguments) } } };'
		await page.setContent(renderApp(withUi(store, view(store, store.visitSince())), 'panel', host))
		await page.waitForSelector('#main :first-child')
		await page.click('#navbtn')
		await page.click('#tabs a[href="#numbers"]')
		await page.waitForSelector(READY)
		await until(() => calls.filter(c => c === 'inbox_view').length >= 3)
		await page.selectOption('#numwin', 'all')
		await page.waitForSelector(READY)
		assert.deepEqual(calls.filter(c => c.startsWith('numbers_view')), ['numbers_view:this', 'numbers_view:all'])
		assert.match(await page.textContent('.num-hero .num-big'), /^\d+ asks since you started$/)
		assert.deepEqual(errors, [])
	} finally { await ctx.close() }
})
