// N1b in the browser: New and Back to you appear and clear once seen, Find by person, number, and words (a pasted Teams link that
// is not an item becomes one), the Since line opens each filter, and a redraw never loses Find's text. Made-up people only.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-n1bblocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { seedNext, stub } = await import('./fixture.ts')

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

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
// The owner last looked an hour ago; since then Kim's draft (A20) is new and Pete's step (A23) came back to the owner.
export function seedFresh(s: S): S {
	seedNext(s)
	mkdirSync(join(s.root, 'state', 'viewed'), { recursive: true })
	writeFileSync(join(s.root, 'state', 'viewed', 'mac.json'), JSON.stringify({ at: ago(60) }))
	s.save({ ...s.byCode('A20')!, changedAt: ago(5) }, false)
	s.save({ ...s.byCode('A23')!, changedAt: ago(3), place: { section: 'move', rule: 'your-step', since: ago(3) } }, false)
	return s
}

async function open(hash = '#now', seed: (s: S) => S = seedFresh, o: { viewport?: { width: number; height: number }; init?: string } = {}) {
	const store = seed(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-n1bbroot-')), machine: 'mac' }))
	const { url, server } = await serveInbox(() => store)
	let busy = false
	const runner = setInterval(async () => { if (busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), procs as never) } finally { busy = false } }, 50)
	const ctx = await browser.newContext({ viewport: o.viewport ?? { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript(`window.DELEGATE_POLL_MS = 60;${o.init ?? ''}`)
	const page: Page = await ctx.newPage()
	const errors: string[] = [], posted: string[] = [], seen: string[][] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	page.on('request', (r: Req) => {
		if (/\/act\?/.test(r.url())) posted.push(JSON.parse(r.postData() ?? '{}').command)
		if (/\/seen\?/.test(r.url())) seen.push(JSON.parse(r.postData() ?? '{}').filters)
	})
	await page.goto(url + hash)
	await page.waitForSelector('#app[data-ui=next] #main :first-child')
	return { store, url, page, posted, seen, close: async () => { clearInterval(runner); await ctx.close(); (server.closeAllConnections?.(), server.close()); assert.deepEqual(errors, []) } }
}
const until = async (f: () => boolean, ms = 6000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise(r => setTimeout(r, 50)); assert.ok(f()) }
const chips = (p: Page, code: string) => p.$$eval(`#now-${code} .nh .tag`, (els: Element[]) => els.map(e => e.textContent))

test('N1b New and Back to you: they show on what changed since the owner looked, are seen a moment later, and are gone on the next look', { skip }, async () => {
	const t = await open('#now')
	try {
		await t.page.waitForSelector('#now-A20 .fresh-new')
		assert.deepEqual((await chips(t.page, 'A20'))[0], 'New')
		assert.deepEqual((await chips(t.page, 'A23'))[0], 'Back to you')
		assert.equal((await chips(t.page, 'A21')).includes('New'), false, 'nothing changed there since the look')
		assert.equal(await t.page.locator('#tabs a[href="#now"] .count:not(.muted)').count(), 1, "the Now tab's count is in accent")
		// Seen a moment later, for the rows that were new only; the markers stay for this look.
		await until(() => !!t.store.seen()['item:A20'] && !!t.store.seen()['item:A23'])
		// The page's request event can reach the test after the server wrote the marks.
		await until(() => t.seen.flat().filter(k => k.startsWith('item:')).length >= 2)
		assert.deepEqual(t.seen.flat().filter(k => k.startsWith('item:')).sort(), ['item:A20', 'item:A23'])
		assert.equal(await t.page.locator('#now-A20 .fresh-new').count(), 1, 'still marked while the owner looks')
		// Leaving Now and coming back is a new look: nothing is new any more.
		await t.page.click('#tabs a[href="#done"]')
		await t.page.waitForSelector('#main .lh')
		await t.page.click('#tabs a[href="#now"]')
		await t.page.waitForSelector('#now-A20')
		assert.equal(await t.page.locator('#main .fresh-new, #main .fresh-back').count(), 0)
		await t.page.reload()
		await t.page.waitForSelector('#now-A20')
		assert.equal(await t.page.locator('#main .fresh-new, #main .fresh-back').count(), 0, 'and after a reload, from the marks on disk')
	} finally { await t.close() }
})

test('N1b New: opening a row marks it seen at once; a look that ends at once marks nothing', { skip }, async () => {
	// The moment is long here, so a slow machine still leaves before it passes (CI 10-21: macOS took over 1.5 s to get here).
	const t = await open('#now/A20', seedFresh, { init: 'window.DELEGATE_LOOK_MS = 4000;' })
	try {
		await until(() => !!t.store.seen()['item:A20'], 1200)
		assert.equal(t.store.seen()['item:A23'], undefined, 'the rest wait their moment')
		// Away before the moment passes: A23 was never really looked at.
		await t.page.click('#tabs a[href="#done"]')
		// Nothing to wait for: the check is that nothing is sent once the moment has passed.
		await new Promise(r => setTimeout(r, 4300))
		assert.equal(t.store.seen()['item:A23'], undefined)
	} finally { await t.close() }
	// Nor does a look that turns into a Find at once: the rows were never really looked at.
	const f = await open('#now')
	try {
		await f.page.fill('#find', 'kim')
		await new Promise(r => setTimeout(r, 1800))
		assert.deepEqual(f.seen, [])
	} finally { await f.close() }
})

const results = (p: Page) => p.$$eval('#nfound .nrow, #nfound li[data-code], #nfound li.row', (els: Element[]) => [...new Set(els.map(e => (e as HTMLElement).dataset.code ?? e.closest('[data-code]')?.getAttribute('data-code') ?? ''))].filter(Boolean))

test('N1b Find: "/" focuses it; a person, a number, and words find rows on Now and in Done; Escape clears it', { skip }, async () => {
	const t = await open('#now')
	try {
		await t.page.keyboard.press('/')
		assert.equal(await t.page.evaluate(() => document.activeElement?.id), 'find')
		await t.page.keyboard.type('kim')
		await t.page.waitForSelector('#nfound')
		assert.deepEqual((await results(t.page)).slice().sort(), ['A20', 'A30'], 'Kim on Now: her ask and her FYI')
		assert.equal(await t.page.locator('#now-move').count(), 0, 'the sections give way to the results')
		await t.page.fill('#find', '2204')
		await t.page.waitForFunction(() => document.querySelector('#nfound .nrow')?.getAttribute('data-code') === 'A22')
		assert.deepEqual(await results(t.page), ['A22'], 'a PR number in the ask')
		await t.page.fill('#find', 'release notes')
		await t.page.waitForFunction(() => document.querySelector('#nfound .nrow')?.getAttribute('data-code') === 'A35')
		assert.deepEqual(await results(t.page), ['A35'], 'words in the ask or the draft')
		// In Done: the reply sent for Meera by a rule.
		await t.page.fill('#find', 'meera')
		await t.page.waitForSelector('#nfound li[data-code=A9], #nfound .rows li')
		assert.match(await t.page.locator('#nfound').innerText(), /in Done/)
		await t.page.fill('#find', 'zebra crossing')
		await t.page.waitForSelector('#nfound .nfres')
		assert.equal(await t.page.locator('#nfound .nfres').innerText(), 'Nothing on Now or in Done matches "zebra crossing".')
		await t.page.keyboard.press('Escape')
		await t.page.waitForSelector('#now-move')
		assert.equal(await t.page.inputValue('#find'), '')
		assert.deepEqual(t.posted, [], 'finding sends nothing')
	} finally { await t.close() }
})

test('N1b Find: a pasted Teams link that is not an item offers "Make it an item", through the missed-message command, and then finds it', { skip }, async () => {
	const { takeMissed } = await import('../src/runner/intake.ts')
	const t = await open('#now')
	const link = 'https://teams.microsoft.com/l/message/19%3Akimchat%40thread.v2/1700000000123?context=x'
	try {
		await t.page.fill('#find', link)
		await t.page.waitForSelector('[data-act=findmissed]')
		assert.match(await t.page.locator('.nfl-make').innerText(), /This message is not an item yet/)
		await t.page.click('[data-act=findmissed]')
		await until(() => t.posted.includes(`missed ${link}`))
		await until(() => t.store.missed().length === 1 && !t.store.answers().length)
		await t.page.waitForFunction(() => (document.getElementById('find') as HTMLInputElement).value === '')
		// The runner's next cycle reads the message and makes it an item.
		const msg = { id: '1700000000123', from: { id: 'kim', name: 'Kim Lane' }, at: new Date().toISOString(), body: 'Robin, can you send the launch numbers?' }
		const src = { ...(stub as object), async recent() { return [msg] }, async chatName() { return 'Launch' } }
		// The fixture names its codes itself; the next one made is A50.
		writeFileSync(join(t.store.root, 'state', 'counter.json'), JSON.stringify({ next: 50 }))
		await takeMissed(t.store, src as never, t.store.config())
		const made = t.store.workflows().find(w => w.msgIds.includes('1700000000123'))!
		assert.ok(made, 'an item')
		await t.page.fill('#find', link)
		await t.page.waitForFunction((c: string) => !!document.querySelector(`#nfound .nrow[data-code=${c}]`), made.code)
		assert.equal(await t.page.locator('[data-act=findmissed]').count(), 0, 'already an item: nothing to make')
		await t.page.press('#find', 'Enter')
		await t.page.waitForFunction(() => document.activeElement?.id === 'find')
		assert.deepEqual(t.posted, [`missed ${link}`], 'and Enter makes nothing either')
	} finally { await t.close() }
})

test('N1b Find: a redraw from fresh data never loses its words, typed or left', { skip }, async () => {
	const { item } = await import('./fixture.ts')
	const t = await open('#now')
	try {
		await t.page.click('#find')
		await t.page.keyboard.type('ri')
		// New data arrives while the owner types.
		const fresh = t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		item(t.store, 'A40', 'Rita Vale', 'Launch', { createdAt: ago(2), lastAsk: 'Can you check the launch numbers?' })
		await fresh; await t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		await t.page.keyboard.type('ta')
		assert.equal(await t.page.inputValue('#find'), 'rita')
		// Still in the box: the next data redraws the results live, with the words and the caret where they were.
		item(t.store, 'A39', 'Rita Vale', 'Launch', { createdAt: ago(3), lastAsk: 'Is the launch on?' })
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A39]'))
		assert.deepEqual(await t.page.evaluate(() => { const f = document.getElementById('find') as HTMLInputElement; return [document.activeElement === f, f.value, f.selectionStart] }), [true, 'rita', 4])
		// Left in the box: the next redraw shows the new row, and keeps the words.
		await t.page.evaluate(() => (document.activeElement as HTMLElement).blur())
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A40]'))
		assert.equal(await t.page.inputValue('#find'), 'rita')
		item(t.store, 'A41', 'Rita Vale', 'Launch', { createdAt: ago(1), lastAsk: 'And the slides?' })
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A41]'))
		assert.equal(await t.page.inputValue('#find'), 'rita')
	} finally { await t.close() }
})

test('N1b Since line: it leads the one summary line, and each part opens its Done filter; handled opens Numbers', { skip }, async () => {
	const seed = (s: S) => {
		seedFresh(s)
		// This week, Delegate sent two replies by rule that count as handled.
		for (const c of ['A10', 'A11']) s.log({ event: 'sent', code: c, approvedBy: 'rule:R1', v: 2, unchanged: true, edited: false, text: 'Done.' })
		s.log({ event: 'tick' })
		return s
	}
	const t = await open('#now', seed)
	try {
		const line = (await t.page.locator('#nsum').innerText()).replace(/\s+/g, ' ')
		assert.match(line, /^Since (yesterday )?\d{1,2}:\d{2} [AP]M: replied to \d+( \(\d+ by rule\))?( · \d+ reviews?)?( · \d+ FYIs?)? · 2 handled › · Delegate is working on 3 · Waiting \d+/)
		assert.equal(await t.page.locator('.nsum').count(), 1, 'one summary line, not two')
		const parts: [string, string][] = await t.page.$$eval('.nsince a', (as: Element[]) => as.map(a => [a.textContent ?? '', a.getAttribute('href') ?? '']))
		const hrefs = parts.map(p => p[1])
		assert.deepEqual(hrefs.filter(h => !['#done/replies', '#done/reviews', '#done/catchup', '#numbers'].includes(h)), [], 'only Done filters and Numbers')
		for (const h of ['#done/replies', '#done/catchup', '#numbers']) assert.ok(hrefs.includes(h), `${h} is a part`)
		for (const [text, href] of parts) {
			await t.page.click(`.nsince a[href="${href}"]`)
			await t.page.waitForFunction((h: string) => location.hash === h, href)
			if (href === '#numbers') {
				// The Numbers tab opens, in the new experience, and its hero says the same count (main's R-NEX-11 tab).
				assert.match(text, /^2 handled/)
				await t.page.waitForSelector('#app[data-ui=next] .numbers[data-state=ready]')
				assert.equal(await t.page.locator('#tabs a[href="#numbers"][aria-current=page]').count(), 1, 'the Numbers tab is the one open')
				assert.match((await t.page.locator('.num-hero .num-big').innerText()).trim(), /^2\b/, 'Handled for you: the same 2')
			} else await t.page.waitForSelector(`.filters a[href="${href}"][aria-pressed=true]`)
			await t.page.goto(t.url + '#now')
			await t.page.waitForSelector('#nsum')
		}
		assert.deepEqual(t.posted, [], 'opening a filter sends nothing')
	} finally { await t.close() }
})

// PM verification of N1a (P2): at 400 px the banner, the Undo strip, and the first-time note pushed Your move halfway down.
test('N1b 400 px: paused, with the banner, Find, the Since line, the Undo strip, and the note, Your move starts on the first screen', { skip }, async () => {
	const { pauseNext } = await import('./fixture.ts')
	const t = await open('#now', s => { seedFresh(s); pauseNext(s); for (const c of ['A10', 'A11']) s.log({ event: 'sent', code: c, approvedBy: 'rule:R1', v: 2, unchanged: true, edited: false, text: 'Done.' }); return s }, { viewport: { width: 400, height: 860 } })
	try {
		await t.page.waitForSelector('.health')
		const box = async (sel: string) => (await t.page.locator(sel).first().boundingBox())!
		for (const sel of ['.health', '#find', '#nsum', '.nundo', '.nnote']) assert.ok(await t.page.locator(sel).count(), `${sel} is there`)
		// Each strip takes one line.
		for (const sel of ['.nundo', '.nnote']) assert.ok((await box(sel)).height <= 60, `${sel} is one line`)
		const move = await box('#now-move'), first = await box('#now-move .nrow .nmain')
		assert.ok(move.y < 860 / 2, `Your move starts in the top half (at ${Math.round(move.y)} px)`)
		assert.ok(first.y + first.height <= 860, 'and its first row is whole on the first screen')
		// No part of the one summary line breaks across two lines.
		const tall = await t.page.$$eval('#nsum a', (as: Element[]) => { const h = as.map(a => a.getBoundingClientRect().height), one = Math.min(...h); return as.filter((_, i) => h[i] > one * 1.5).map(a => a.textContent) })
		assert.deepEqual(tall, [])
	} finally { await t.close() }
})

// Review P1-4: a redraw cancels a composition in progress, so "José" came out "Jos´éé". Find never redraws while the owner
// composes (a dead key or an IME), neither from its own input nor from fresh data, and draws the result once it ends.
test('N1b Find: an accent or IME composition comes out intact, through a background redraw, and finds the row', { skip }, async () => {
	const { item } = await import('./fixture.ts')
	const t = await open('#now', s => { seedFresh(s); item(s, 'A45', 'José Ruiz', 'Launch', { createdAt: ago(4), lastAsk: 'Can you share the launch plan?' }); return s })
	try {
		const cdp = await t.page.context().newCDPSession(t.page)
		await t.page.click('#find')
		await t.page.keyboard.type('Jos')
		await t.page.waitForSelector('#nfound')
		// macOS dead-key style: the accent is composed first, then the letter replaces it.
		await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 })
		// Fresh data arrives mid-composition.
		const fresh = t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		item(t.store, 'A46', 'José Ruiz', 'Launch', { createdAt: ago(1), lastAsk: 'And the date?' })
		await fresh; await t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		await cdp.send('Input.insertText', { text: 'é' })
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A46]'))
		assert.equal(await t.page.inputValue('#find'), 'José')
		assert.deepEqual((await results(t.page)).slice().sort(), ['A45', 'A46'])
		assert.equal(await t.page.evaluate(() => (document.getElementById('find') as HTMLInputElement).selectionStart), 4)
		// A CJK IME: several updates, then the commit. No fresh data comes meanwhile, so the end of the composition is what
		// draws the result.
		await t.page.fill('#find', '')
		// Held open, not failed: once a poll is held no other is in flight (they run one after another), none can finish, and
		// none says "offline".
		await new Promise<void>(held => t.page.route(/\/data\?/, () => held()))
		await cdp.send('Input.imeSetComposition', { text: 'ｊ', selectionStart: 1, selectionEnd: 1 })
		await cdp.send('Input.imeSetComposition', { text: 'じょ', selectionStart: 2, selectionEnd: 2 })
		await cdp.send('Input.insertText', { text: 'ジョ' })
		await t.page.waitForFunction(() => /"ジョ"/.test(document.querySelector('#nfound .nfres')?.textContent ?? ''))
		assert.equal(await t.page.inputValue('#find'), 'ジョ')
		// Nothing left held open when the page closes.
		await t.page.unrouteAll({ behavior: 'ignoreErrors' })
	} finally { await t.close() }
})

// Review P2-1: an open row was marked again on every poll; it is marked once, and again only when it has newer news.
test('N1b New: an opened row is marked seen once, not on every poll, and again only after newer news', { skip }, async () => {
	const t = await open('#now/A20')
	try {
		const marks = () => t.seen.flat().filter(k => k === 'item:A20').length
		await until(() => marks() === 1)
		for (let i = 0; i < 3; i++) await t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		assert.equal(marks(), 1, 'polls do not mark it again')
		// Newer news on the open row: marked again.
		t.store.save({ ...t.store.byCode('A20')!, changedAt: new Date().toISOString() }, false)
		await until(() => marks() === 2)
		for (let i = 0; i < 3; i++) await t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		assert.equal(marks(), 2, 'and once only')
	} finally { await t.close() }
})

// Review P2-7: while Find has words, a rule send's Undo stays, so its window is not missed.
test('N1b Find: the Undo strip stays while Find has words', { skip }, async () => {
	const t = await open('#now')
	try {
		await t.page.fill('#find', 'kim')
		await t.page.waitForSelector('#nfound')
		assert.equal(await t.page.locator('.nundo [data-act=undo]').isVisible(), true)
	} finally { await t.close() }
})

// Review P2-7: at 400 px the health banner hid what its fix said, so "Try again" looked dead. Only "Since …" and "And N more" fold.
test('N1b 400 px: the health banner shows what its fix said, and folds only the extras', { skip }, async () => {
	const t = await open('#now', s => { seedFresh(s); s.setHealth('source', 'Delegate cannot reach Teams from this machine.'); s.setHealth('tz', 'The time zone is not known.'); return s }, { viewport: { width: 400, height: 860 } })
	try {
		assert.equal(await t.page.locator('.health p span:visible').count(), 0, '"Since …" and "And 1 more problem" fold')
		await t.page.click('.health [data-act=healthfix]')
		await t.page.waitForFunction(() => [...document.querySelectorAll('.health p span')].some(s => (s as HTMLElement).offsetParent !== null && !!s.textContent?.trim()))
	} finally { await t.close() }
})

// Review round 2, P2-A: a row action's result redraws the page directly (state/actions.ts act). Landing mid-composition, it
// cancelled the composition, compositionend never came, and the composing flag stuck, so polls stopped redrawing Now.
test('N1b Find: a composition survives a row action that finishes meanwhile, and the next poll still redraws', { skip }, async () => {
	const { item } = await import('./fixture.ts')
	const t = await open('#now')
	try {
		let release: (() => void) | undefined
		await t.page.route(/\/act\?/, async (r: { fulfill(o: object): Promise<void> }) => { await new Promise<void>(go => { release = go }); await r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ text: 'Nothing to hold now.', ids: [] }) }) })
		await t.page.click('#now-A36 [data-act=nact]')
		await until(() => !!release)
		const cdp = await t.page.context().newCDPSession(t.page)
		await t.page.click('#find')
		await t.page.keyboard.type('Jos')
		await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 })
		// The action is refused while the owner composes: its result redraws at once.
		const answered = t.page.waitForResponse((r: Req) => /\/act\?/.test(r.url()))
		release!()
		await answered
		await t.page.waitForResponse((r: Req) => /\/data\?/.test(r.url()))
		await cdp.send('Input.insertText', { text: 'é' })
		assert.equal(await t.page.inputValue('#find'), 'José')
		// Nothing stays stuck: fresh data still draws.
		item(t.store, 'A47', 'José Ruiz', 'Launch', { createdAt: ago(1), lastAsk: 'Can you share the launch plan?' })
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A47]'), undefined, { timeout: 8000 })
		// A composition whose end never comes (its field went away or lost focus): the next redraw clears it, so typing in Find
		// afterwards still shows its results.
		await t.page.evaluate(() => { const f = document.getElementById('find')!; f.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); f.blur() })
		item(t.store, 'A48', 'Rita Vale', 'Launch', { createdAt: ago(1), lastAsk: 'Is José on the launch call?' })
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A48]'), undefined, { timeout: 8000 })
		await t.page.fill('#find', 'rita')
		// Rita's own ask (A21) is not in José's results: only a fresh draw shows it, and José's row (A47) leaves.
		await t.page.waitForFunction(() => !!document.querySelector('#nfound .nrow[data-code=A21]') && !document.querySelector('#nfound .nrow[data-code=A47]'), undefined, { timeout: 8000 })
	} finally { await t.close() }
})
