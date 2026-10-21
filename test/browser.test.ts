// The real client in a real browser: serveInbox over a seeded store, with the runner applying actions as they arrive (design-spec/client-contract.md).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-blocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox, writeSnapshot } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { seedInbox, stub } = await import('./fixture.ts')

// playwright-core is a dev dependency; PLAYWRIGHT_CORE can point at another copy. Without it these tests are skipped.
const PW = process.env.PLAYWRIGHT_CORE ?? (() => { try { return createRequire(import.meta.url).resolve('playwright-core').replace(/index\.js$/, 'index.mjs') } catch { return '' } })()
const skip = existsSync(PW) ? false : 'playwright-core not found (set PLAYWRIGHT_CORE)'
// Loaded from a path at run time, so typed loosely here.
// deno-lint-ignore no-explicit-any
type Page = any
// deno-lint-ignore no-explicit-any
let browser: any
type Req = { url(): string; postData(): string | null }
type Route = { abort(): Promise<void>; continue(): Promise<void> }

before(async () => {
	if (skip) return
	const { chromium } = await import(pathToFileURL(PW).href)
	browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
})
after(async () => { await browser?.close() })

// One seeded store, its page server, a runner applying answers every 50 ms, and a fresh page polling fast.
// The page's commands run with fake processes: "continue A1" from the card menu must never open a real window (bug 10-21 windows).
const noProcs = { start: () => ({ pid: 0 }), alive: () => false, kill: () => true, openWindow: () => {}, bootMs: () => 0 }
async function open(hash = '', prep?: (s: InstanceType<typeof Store>) => void) {
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-broot-')), machine: 'mac' }))
	prep?.(store)
	const { url, server } = await serveInbox(() => store)
	let busy = false
	const runner = setInterval(async () => { if (busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), noProcs) } finally { busy = false } }, 50)
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript('window.DELEGATE_POLL_MS = 60')
	const page = await ctx.newPage()
	const errors: string[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	await page.goto(url + hash)
	return { store, page, errors, close: async () => { clearInterval(runner); await ctx.close(); server.close(); assert.deepEqual(errors, []) } }
}
const text = (p: Page, sel: string) => p.locator(sel).first().innerText()
const answered = (store: InstanceType<typeof Store>) => { const d = join(store.root, 'state', 'done', 'answers'); return existsSync(d) ? readdirSync(d).length : 0 }

test('page: Home shows the need-you tile, done tiles, the also row, and health, with no done message text', { skip }, async () => {
	const t = await open()
	try {
		assert.equal(await text(t.page, '.tile.need .big'), '6')
		const tiles = await t.page.locator('a.tile').allInnerTexts()
		assert.ok(tiles.some((x: string) => /Replied to 3 people/.test(x.replace(/\s+/g, ' '))), tiles.join('|'))
		assert.ok(tiles.some((x: string) => /Reviewed 1 PR/.test(x.replace(/\s+/g, ' '))))
		assert.match(await text(t.page, '.health'), /cannot reach Teams/)
		assert.match(await text(t.page, '.also'), /1 to learn/)
		assert.doesNotMatch(await t.page.locator('main').innerText(), /Debounce is 250 ms/, 'a done reply\'s text is not on Home')
		await t.page.click('.tile.need .btn.primary')
		assert.match(t.page.url(), /#focus\/A1$/)
	} finally { await t.close() }
})

test('first setup: a card from the week before says so, with when it was sent', { skip }, async () => {
	const t = await open('#focus/A1', s => { const w = s.byCode('A1')!; s.save({ ...w, before: true }, false) })
	try {
		assert.match(await text(t.page, '.card .c-right .tag'), /^From before setup · /)
		const t2 = await t.page.$$eval('.card .c-right .tag', (e: Element[]) => e.length)
		assert.equal(t2, 1)
		await t.page.click('[data-act=next]')
		assert.equal(await t.page.locator('.card .c-right .tag:has-text("From before setup")').count(), 0, 'live items carry no tag')
	} finally { await t.close() }
})

test('goal-retry: a holding reply says it is not the answer, and its button says what it sends', { skip }, async () => {
	const t = await open('#focus/A1', s => { const w = s.byCode('A1')!; s.save({ ...w, status: 'Tried 3 times; No diff tool', draft: { ...w.draft!, text: 'Thanks, rechecking now.', holding: true } }, false) })
	try {
		assert.match(await t.page.textContent('.card .lbl-row') ?? '', /^Holding reply/)
		assert.match(await t.page.textContent('.card') ?? '', /Not the answer: the work did not finish/)
		assert.equal(await t.page.locator('.card button:has-text("Send holding reply")').count(), 1)
	} finally { await t.close() }
})

test('page: Previous and Next move through the queue without acting, and say where you are', { skip }, async () => {
	const t = await open('#focus/A1')
	try {
		assert.equal(await text(t.page, '.pager .of'), '1 of 6')
		await t.page.click('[data-act=next]')
		assert.equal(await text(t.page, '.pager .of'), '2 of 6')
		assert.equal(await text(t.page, '.card .c-name'), 'Ravi Kumar')
		await t.page.keyboard.press('k')
		assert.equal(await text(t.page, '.card .c-name'), 'Priya Shah')
		await t.page.click('.qrow >> text=Vikram')
		assert.equal(await text(t.page, '.pager .of'), '6 of 6')
		assert.equal(answered(t.store), 0, 'moving is free')
	} finally { await t.close() }
})

test('page: picking an option asks the server for its reply; Send then sends exactly that, with the card\'s revision', { skip }, async () => {
	const t = await open('#focus/A3')
	try {
		const sent: { command: string; seenAt: string }[] = []
		t.page.on('request', (r: Req) => { if (r.url().includes('/act')) sent.push(JSON.parse(r.postData() ?? '{}')) })
		assert.equal(await t.page.locator('#pri-A3').isDisabled(), true)
		await t.page.click('label:has(#o-A3-2)')
		await t.page.waitForSelector('.draft:has-text("Let’s use flag B")')
		assert.equal(await text(t.page, '#pri-A3'), 'Send')
		const rev = t.store.byCode('A3')!.revAt
		await t.page.click('#pri-A3')
		await t.page.waitForSelector('.applied')
		assert.deepEqual(sent.map(s => s.command), ['pick A3 2', 'ok A3'])
		assert.equal(sent[1].seenAt, rev)
		assert.equal(t.store.byCode('A3')!.state, 'done')
		await t.page.waitForSelector('#card-A4', { timeout: 3000 })
		assert.equal(await text(t.page, '.card .c-name'), 'Sam Lee', 'it moved on to the next item')
	} finally { await t.close() }
})

test('page: unchecking a review comment changes the button, and only the checked change is approved', { skip }, async () => {
	const t = await open('#focus/A6')
	try {
		assert.equal(await text(t.page, '#pri-A6'), 'Post 2 comments and reply')
		await t.page.click('label:has(#cm-A6-2)')
		assert.equal(await text(t.page, '#pri-A6'), 'Post 1 comment and reply')
		const req = t.page.waitForRequest((r: Req) => r.url().includes('/act'))
		await t.page.click('#pri-A6')
		assert.equal(JSON.parse((await req).postData()!).command, 'ok A6 except 2')
		await t.page.waitForSelector('.applied')
		const wf = t.store.byCode('A6')!
		assert.deepEqual(wf.effects!.map(e => !!e.off), [false, true])
		assert.notEqual(wf.state, 'needs_human')
	} finally { await t.close() }
})

test('page: a question to Delegate shows in the card while it runs, then its answer, and nothing is sent', { skip }, async () => {
	const t = await open('#focus/A2')
	try {
		await t.page.fill('#askin-A2', 'What is the earliest safe date?')
		await t.page.press('#askin-A2', 'Enter')
		await t.page.waitForSelector('.nq:has-text("earliest safe date") + .na .typing')
		const wf = t.store.byCode('A2')!
		wf.notes = wf.notes!.map(n => ({ ...n, a: 'Oct 24 at the earliest: ring 1 needs one clean week.' }))
		t.store.save(wf)
		await t.page.waitForSelector('.na p:has-text("Oct 24 at the earliest")')
		assert.equal(t.store.byCode('A2')!.state, 'needs_human')
		assert.ok(await t.page.locator('[data-act=usenote]').count() > 0)
	} finally { await t.close() }
})

test('page: an automation in three clicks, created and started from the form', { skip }, async () => {
	const t = await open('#automations')
	try {
		await t.page.click('[data-act=newauto]')
		await t.page.click('[data-act=tpl][data-v=remind]')
		assert.match(await text(t.page, '#au-prev'), /Every weekday at 4:00 PM, send Arun: “Reminder: please send me an update\.” \(sent by my assistant\)/)
		await t.page.click('[data-act=autocreate]')
		await t.page.waitForSelector('.arow.new')
		const a = t.store.automations().find(x => x.text === 'Reminder: please send me an update.')!
		assert.deepEqual([a.state, a.text, a.schedule.every, 'at' in a.schedule ? a.schedule.at : ''], ['active', 'Reminder: please send me an update.', 'weekday', '16:00'])
	} finally { await t.close() }
})

test('dogfood 10-20: one click sends after editing, even when fresh data arrived while typing', { skip }, async () => {
	const t = await open('#focus')
	try {
		await t.page.waitForSelector('[data-act=primary]')
		const code = await t.page.$eval('article.card[data-code]', (a: Element) => a.getAttribute('data-code'))
		const posts: string[] = []; t.page.on('request', (r: Req) => { if (/\/act(\?|$)/.test(r.url())) posts.push(r.postData() ?? '') })
		await t.page.click(`#card-${code} .lbl-row [data-act=edit]`)
		await t.page.fill(`#ed-${code}`, 'My own words, typed slowly.')
		t.store.save({ ...t.store.workflows().find(w => w.code === 'A8')!, status: 'Checks still passing' })
		await t.page.waitForTimeout(1500)
		await t.page.click('[data-act=primary]', { delay: 120 })
		await t.page.waitForTimeout(2500)
		assert.equal(posts.length, 1, 'the click reached the server')
		assert.equal(t.store.byCode(code!)?.sent?.text?.startsWith('My own words, typed slowly.'), true, 'sent with one click')
	} finally { await t.close() }
})

test('dogfood 10-20: holding Send while fresh data arrives still sends on release', { skip }, async () => {
	const t = await open('#focus/A1')
	try {
		const posts: string[] = []; t.page.on('request', (r: Req) => { if (/\/act(\?|$)/.test(r.url())) posts.push(r.postData() ?? '') })
		await t.page.waitForSelector('#card-A1 [data-act=primary]:not([disabled])')
		const box = await t.page.$eval('#card-A1 [data-act=primary]', (b: Element) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
		await t.page.mouse.move(box.x, box.y); await t.page.mouse.down()
		t.store.save({ ...t.store.byCode('A8')!, status: 'Checks still passing' })
		await t.page.waitForTimeout(1500); await t.page.mouse.up(); await t.page.waitForTimeout(800)
		assert.deepEqual(posts.map(p => JSON.parse(p).command), ['ok A1'])
		await t.page.mouse.up()
		await t.page.goto(t.page.url().replace(/#.*$/, '#ongoing')); await t.page.waitForSelector('#main h1')
		const tab = await t.page.$eval('[data-act=newauto]', (b: Element) => { const r = b.getBoundingClientRect(); return { x: r.x + 4, y: r.y + r.height / 2 } })
		await t.page.mouse.move(tab.x, tab.y); await t.page.mouse.down()
		t.store.save({ ...t.store.byCode('A8')!, status: 'Merged' })
		await t.page.waitForFunction(() => /Merged/.test(document.getElementById('main')?.textContent ?? ''), null, { timeout: 5000 })
		await t.page.mouse.up()
	} finally { await t.close() }
})

test('dogfood 10-20: the theme switch goes Auto, Light, Dark, and the choice stays after a reload', { skip }, async () => {
	const t = await open('#home')
	try {
		const th = () => t.page.evaluate(() => [document.documentElement.dataset.theme ?? 'auto', document.getElementById('themebtn')!.getAttribute('aria-label')])
		assert.deepEqual(await th(), ['auto', 'Theme: same as your system. Change theme'])
		await t.page.click('#themebtn'); assert.deepEqual(await th(), ['light', 'Theme: light. Change theme'])
		await t.page.click('#themebtn'); assert.deepEqual(await th(), ['dark', 'Theme: dark. Change theme'])
		await t.page.reload(); await t.page.waitForSelector('#themebtn svg')
		assert.deepEqual((await th())[0], 'dark')
		assert.notEqual(await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)')
		await t.page.click('#themebtn'); assert.deepEqual((await th())[0], 'auto')
		await t.page.click('#themebtn'); await t.page.click('#themebtn')
		const html = await (await fetch(t.page.url().replace(/#.*$/, ''))).text()
		assert.match(html, /<\/style><script>try\{var t=localStorage\.getItem\('delegate-theme'\)/, 'the theme is set in <head>, before the first paint')
	} finally { await t.close() }
})

test('Done v2: Catch up rows read on their own and open Teams; Home shows what is new; Done and its filters count what is new until seen; Watch starts from a row', { skip }, async () => {
	const t = await open('#home', s => {
		const base = s.workflows().find(w => w.code === 'A10')!
		const now = Date.now()
		for (const [i, line, weight, gist] of [[1, 'Shared the v5 spec as a pre-read', 'high', 'Free-text locations allowed; ring 1 stays Oct 24. Nothing asked of you.'], [2, 'Posted the config PR', 'normal', 'Raises the event size limit to 10k.'], [3, 'Moved standup to 10:30', 'normal', ''], [4, 'Thanked the team', 'normal', '']] as const)
			s.save({ ...base, id: `f${i}`, code: `A${40 + i}`, intent: 'none', sent: undefined, draft: undefined, status: 'cc', lastMsgId: `17000000000${i}`, chat: { ...base.chat, id: '19:spec@thread.v2', test: false }, fyi: { line, weight, ...(gist ? { gist } : {}), ...(i === 2 ? { watch: { target: 'config PR 4200003', until: 'it merges' } } : {}) }, asker: { id: `p${i}`, name: ['Dev Rao', 'Pia Lin', 'Kim Ito', 'Sam Lee'][i - 1] }, updatedAt: new Date(now - i * 60_000).toISOString() } as never, false)
		s.save({ ...base, id: 'sk', code: 'A50', intent: 'status_next_step', sent: undefined, status: 'Skipped by you', closedBy: 'skipped', asker: { id: 'z', name: 'Zed' }, updatedAt: new Date(now).toISOString() } as never, false)
		s.save({ ...base, id: 'no', code: 'A51', intent: 'other', sent: undefined, status: 'No reply needed', closedBy: 'nothing', asker: { id: 'y', name: 'Yan' }, updatedAt: new Date(now).toISOString() } as never, false)
	})
	try {
		await t.page.waitForSelector('.catchup')
		assert.match(await text(t.page, '.also-hrow .also-h'), /^Catch up · 4 new$/i)
		assert.deepEqual(await t.page.$$eval('.catchup .rt b', (e: Element[]) => e.map(x => x.textContent)), ['Shared the v5 spec as a pre-read', 'Posted the config PR', 'Moved standup to 10:30'])
		assert.equal(await t.page.$eval('.catchup .rt .gist', (e: Element) => e.textContent), 'Free-text locations allowed; ring 1 stays Oct 24. Nothing asked of you.', 'a second line says what changed')
		assert.match(await t.page.$eval('.catchup a.rlink', (e: Element) => e.getAttribute('href')!), /^https:\/\/teams\.microsoft\.com\/l\/message\/19%3Aspec%40thread\.v2\/170000000001$/, 'the row opens Teams')
		const doneCount = () => t.page.$eval('#tabs a[href="#done"]', (a: Element) => a.querySelector('.count')?.textContent ?? '')
		assert.ok(Number(await doneCount()) >= 4, 'Done shows how much is new')
		await t.page.click('.catchup .mini-more')
		await t.page.waitForSelector('.chip[aria-pressed="true"] .newpill')
		assert.equal(await text(t.page, '.chip[aria-pressed="true"] .newpill'), '4 new')
		assert.equal(await t.page.locator('li[data-code="A50"], li[data-code="A51"]').count(), 0, 'skipped and nothing-to-know rows are not listed')
		assert.match(await text(t.page, 'details.quiet summary'), /^Also closed 1 with nothing to know · Show$/)
		await t.page.waitForFunction(() => !document.querySelector('.chip[aria-pressed="true"] .newpill'), null, { timeout: 5000 })
		assert.ok(t.store.seen().catchup, 'looking at the filter for a moment marks it seen')
		assert.equal(await t.page.locator('li[data-code="A41"]').count(), 1, 'the rows stay for this visit')
		await t.page.hover('li[data-code="A42"]')
		await t.page.click('li[data-code="A42"] [data-act=watchopen]')
		assert.deepEqual([await t.page.inputValue('#wt-A42'), await t.page.inputValue('#wu-A42')], ['config PR 4200003', 'it merges'], 'prefilled from what the AI suggested')
		const posts: string[] = []; t.page.on('request', (r: Req) => { if (/\/act(\?|$)/.test(r.url())) posts.push(JSON.parse(r.postData() ?? '{}').command) })
		await t.page.click('.wform [data-act=wby][data-v="fri"]')
		await t.page.click('.wform [data-act=watchgo]')
		await t.page.waitForTimeout(300)
		assert.match(posts[0] ?? '', /^watch A42: "config PR 4200003" until "it merges" by \d{4}-\d{2}-\d{2}$/)
		await t.page.reload(); await t.page.waitForSelector('#tabs')
		assert.equal(await t.page.locator('.catchup').count(), 0, 'seen stays seen after a reload: nothing new on Home')
	} finally { await t.close() }
})

test('Done v2 Mark all read: Home Catch up empties at once and stays empty, though the lines are newer than the visit', { skip }, async () => {
	const t = await open('#home')
	try {
		const base = t.store.workflows().find(w => w.code === 'A10')!
		for (const i of [1, 2]) t.store.save({ ...base, id: `m${i}`, code: `A${60 + i}`, intent: 'none', sent: undefined, draft: undefined, status: 'cc', chat: { ...base.chat, test: false }, fyi: { line: `Line ${i}`, weight: 'normal' }, asker: { id: `q${i}`, name: 'Dev Rao' }, updatedAt: new Date().toISOString() } as never, false)
		await t.page.waitForSelector('.catchup', { timeout: 30_000 })
		assert.match(await text(t.page, '.also-hrow .also-h'), /^Catch up · 2 new$/i)
		await t.page.click('[data-act=seenall]')
		await t.page.waitForFunction(() => !document.querySelector('.catchup'), null, { timeout: 5000 })
		assert.ok(t.store.seen().catchup, 'read is kept for this machine')
		await t.page.reload(); await t.page.waitForSelector('#tabs')
		assert.equal(await t.page.locator('.catchup').count(), 0)
	} finally { await t.close() }
})

test('Done v2 coming back: what arrived while the owner was away from Done is new on return, then seen', { skip }, async () => {
	const t = await open('#done/catchup')
	try {
		const base = t.store.workflows().find(w => w.code === 'A10')!
		const add = (i: number) => t.store.save({ ...base, id: `r${i}`, code: `A${70 + i}`, intent: 'none', sent: undefined, draft: undefined, status: 'cc', chat: { ...base.chat, test: false }, fyi: { line: `Line ${i}`, weight: 'normal' }, asker: { id: `q${i}`, name: 'Dev Rao' }, updatedAt: new Date().toISOString() } as never, false)
		await t.page.waitForTimeout(1800)
		await t.page.goto(t.page.url().replace(/#.*$/, '#home'))
		add(1)
		await t.page.waitForSelector('.catchup', { timeout: 30_000 })
		await t.page.goto(t.page.url().replace(/#.*$/, '#done/catchup'))
		await t.page.waitForSelector('.chip[aria-pressed="true"] .newpill')
		assert.equal(await text(t.page, '.chip[aria-pressed="true"] .newpill'), '1 new')
		await t.page.waitForTimeout(2000)
		assert.ok(t.store.seen().catchup >= t.store.byCode('A71')!.updatedAt, 'looked at again, so seen again')
	} finally { await t.close() }
})

test('Done v2 Watch something: the Ongoing sheet starts a watch with a done-by date and push, and Ongoing says when it is due', { skip }, async () => {
	const t = await open('#automations/new')
	try {
		await t.page.click('.sheet [data-act=tpl][data-v="watch"]')
		await t.page.waitForSelector('#ws-text')
		assert.equal(await text(t.page, '#sh-h'), 'Watch something')
		assert.ok(await t.page.$eval('[data-act=wscreate]', (b: Element) => (b as HTMLButtonElement).disabled), 'nothing to watch yet, so it cannot start')
		await t.page.fill('#ws-text', 'PR 1601234 merged until the ring 1 cut')
		assert.equal(await t.page.$eval('[data-act=wscreate]', (b: Element) => (b as HTMLButtonElement).disabled), false, 'typing what to watch enables Start')
		await t.page.click('.sheet [data-act=wsby][data-v="fri"]')
		await t.page.check('.sheet [data-ws=push]')
		await t.page.click('[data-act=wscreate]')
		await t.page.waitForFunction(() => !document.getElementById('ws-text'), null, { timeout: 5000 })
		const w = t.store.workflows().find(x => x.watchFrom === 'owner')!
		assert.ok(w, 'the watch is an item at once')
		assert.match(w.watchBy ?? '', /^\d{4}-\d{2}-\d{2}$/)
		assert.equal(new Date(`${w.watchBy}T12:00:00`).getDay(), 5, 'Friday is the done-by day')
		assert.equal(w.lastAsk, 'Watch PR 1601234 merged until the ring 1 cut until it is done: merged, answered, decided, or resolved', 'what the owner typed stays whole')
		const job = t.store.jobs().find(j => j.parents.includes(w.id))!
		assert.match(job.goal, /^Shepherd PR 1601234 merged until the ring 1 cut to closure/, 'push asks the job to drive it, not only report')
		await t.page.goto(t.page.url().replace(/#.*$/, '#ongoing'))
		await t.page.waitForFunction((c: string) => document.body.textContent!.includes(c), w.code, { timeout: 5000 })
		assert.match(await t.page.textContent('#main') ?? '', /By (Fri|Friday)/, 'Ongoing says when it is due')
		assert.ok(!(await t.page.textContent('#main'))!.includes('merged until it is done'), 'the default condition is not repeated in the title')
	} finally { await t.close() }
})

test('round 3 #4 five tabs: Running, Watching, and Automations are sections of Ongoing, old addresses land there, and To learn shows only while a fact waits', { skip }, async () => {
	const t = await open('#running')
	try {
		const tabs = () => t.page.$$eval('#tabs a', (as: Element[]) => as.map(a => `${a.firstChild?.textContent}${a.getAttribute('aria-current') ? '*' : ''}`))
		assert.deepEqual(await tabs(), ['Home', 'Needs you', 'Done', 'Ongoing*', 'To learn', 'Numbers', 'Settings'], 'a fact waits for an ok in the fixture; Numbers is last before Settings (R-NEX-11)')
		assert.deepEqual(await t.page.$$eval('#main h2.section-h', (hs: Element[]) => hs.map(h => h.id || h.textContent)), ['1 update', 'running', 'automations'], 'watches, then Running and Automations as sections')
		assert.ok(await t.page.evaluate(() => { const r = document.getElementById('running')!.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight }), '#running lands on its section')
		await t.page.goto(t.page.url().replace(/#.*$/, '#automations/new'))
		await t.page.waitForSelector('.sheet [data-act=tpl]')
		assert.equal(await t.page.$eval('#tabs a[aria-current]', (a: Element) => a.firstChild?.textContent), 'Ongoing', '#automations/new opens the form on Ongoing')
		for (const p of t.store.proposals()) t.store.saveProposal({ ...p, state: 'dropped' })
		await t.page.waitForFunction(() => ![...document.querySelectorAll('#tabs a')].some(a => a.firstChild?.textContent === 'To learn'))
		assert.deepEqual(await tabs(), ['Home', 'Needs you', 'Done', 'Ongoing*', 'Numbers', 'Settings'], 'nothing waits: no To learn tab')
	} finally { await t.close() }
})

test('page: a reminder to a chosen person is three clicks: New automation, the person, Create', { skip }, async () => {
	const t = await open('#automations')
	try {
		await t.page.click('[data-act=newauto]')
		const chips = await t.page.$$eval('[data-act=tplto]', (bs: Element[]) => bs.map(b => b.getAttribute('data-v')))
		assert.ok(chips.length >= 2, 'people to pick on step 1')
		await t.page.click(`[data-act=tplto][data-v="${chips[1]}"]`)
		await t.page.click('[data-act=autocreate]')
		await t.page.waitForSelector('.arow.new')
		assert.equal(t.store.automations().find(x => x.to.name === chips[1])?.state, 'active')
	} finally { await t.close() }
})

test('final P1-2 a refused approval keeps the card, refreshed, and says why', { skip }, async () => {
	const t = await open('#focus/A1')
	try {
		// The page must still be behind the newer draft when Send is clicked: hold its data refresh while the draft changes (CI 10-21).
		// Held, not aborted: an aborted refresh reads as offline and disables Send.
		const held: Route[] = []
		await t.page.route('**/data?**', (r: Route) => { held.push(r) })
		// A refresh already on its way finishes first, on the older data.
		await new Promise(r => setTimeout(r, 300))
		// As on a slow runner, a refresh starts inside the window; it is held until after the click.
		await t.page.evaluate(() => { void fetch(`${location.origin}/data?since=`).catch(() => undefined) })
		const newer = 'Newer draft.'
		const wf = t.store.byCode('A1')!
		t.store.save({ ...wf, draft: { ...wf.draft!, text: newer }, revAt: new Date(Date.now() + 5000).toISOString() })
		await t.page.click('#pri-A1')
		assert.ok(held.length >= 1, 'a refresh was held across the click')
		for (const r of held) await r.continue().catch(() => undefined)
		await t.page.unroute('**/data?**')
		await t.page.waitForSelector('.state.refused')
		assert.match(await text(t.page, '.state.refused'), /A1 changed after you looked\. Nothing was sent or changed\./)
		assert.equal(await text(t.page, '#card-A1 .draft'), newer)
		assert.equal(t.store.byCode('A1')!.state, 'needs_human')
	} finally { await t.close() }
})

test('final P1-1 Answer keeps the card until the new draft is ready; Later keeps it too', { skip }, async () => {
	const t = await open('#focus/A2')
	try {
		await t.page.fill('#ans-A2', 'Fri Oct 24')
		await t.page.click('#pri-A2')
		await t.page.waitForFunction(() => document.querySelector('#pri-A2')?.textContent === 'Drafting…')
		// Long enough for a background data refresh, which no longer lists the item while it is redrafted.
		await new Promise(r => setTimeout(r, 1500))
		assert.equal(await t.page.locator('#card-A2 .state.pending').count(), 1, 'still waiting while the draft is rewritten')
		const wf = t.store.byCode('A2')!
		assert.equal(wf.state, 'running')
		t.store.save({ ...wf, state: 'needs_human', question: undefined, draft: { text: 'It ships Fri Oct 24.', commitment: true, sources: [], preview: true }, revAt: new Date(Date.now() + 1000).toISOString() })
		await t.page.waitForSelector('#card-A2 .draft:has-text("It ships Fri Oct 24.")')
		assert.match(await text(t.page, '#card-A2 .draft-note'), /New draft from your answer\. Not sent yet\./)
		// The pending label clears on the result poll, which can land one render after the new draft (CI ubuntu 10-21).
		await t.page.waitForFunction(() => document.querySelector('#pri-A2')?.textContent?.trim() === 'Send', undefined, { timeout: 10_000 })
		assert.equal(await text(t.page, '#pri-A2'), 'Send')
		await t.page.click('#card-A2 .acts [data-act=later]')
		await t.page.waitForSelector('#card-A3')
		assert.equal(t.store.byCode('A2')!.state, 'needs_human')
		assert.match(await text(t.page, '.queue li:last-child'), /Ravi/, 'Later moves it to the end and keeps it')
	} finally { await t.close() }
})

test('review 085 P2-1 a lost connection keeps the action and the edits, retries the result, and never resends', { skip }, async () => {
	const t = await open('#focus/A1', s => s.setHealth('source', undefined))
	try {
		await t.page.route('**/result?**', (r: Route) => r.abort())
		await t.page.click('#card-A1 .lbl-row [data-act=edit]')
		await t.page.fill('#ed-A1', 'My own words.')
		await t.page.click('#pri-A1')
		await t.page.waitForSelector('.state.lost')
		await t.page.route('**/data?**', (r: Route) => r.abort())
		await t.page.waitForSelector('.health.off')
		await t.page.unroute('**/result?**'); await t.page.unroute('**/data?**')
		await t.page.waitForSelector('.applied')
		await t.page.waitForSelector('.health.off', { state: 'detached' })
		assert.equal(answered(t.store), 1, 'sent once')
		assert.equal(t.store.byCode('A1')!.draft!.text, 'My own words.')
	} finally { await t.close() }
})

test('tester 06-07 P2-2 watched things can be acknowledged or stopped; undo is offered while it works', { skip }, async () => {
	const t = await open('#watching')
	try {
		await t.page.click('[data-act=rowact][data-v="ok A8"]')
		await t.page.waitForSelector('main [role=status]:has-text("Got it")')
		await t.page.goto(t.page.url().replace(/#.*$/, '#done/replies'))
		assert.match(await text(t.page, '.undo-row'), /Replied to Meera[\s\S]*Undo \d:\d\d/)
		const code = await t.page.locator('.undo-row [data-act=undo]').getAttribute('data-v')
		await t.page.click('.undo-row [data-act=undo]')
		await t.page.waitForSelector('#toast:has-text("is back in your inbox as a draft")')
		assert.equal(t.store.byCode(code)!.state, 'needs_human')
	} finally { await t.close() }
})

test('R-HIL-09 the snapshot shows the words to type and has no working buttons', { skip }, async () => {
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-bsnap-')), machine: 'mac' }))
	writeSnapshot(store)
	const ctx = await browser.newContext()
	const page = await ctx.newPage()
	try {
		await page.goto(pathToFileURL(join(store.root, 'inbox.html')).href)
		const verbs = await page.locator('.verb').allInnerTexts()
		for (const v of ['ok A1', 'later A1', 'A2: your answer', 'pick A3 1', 'ok A6', 'ok K1']) assert.ok(verbs.includes(v), `${v} in ${verbs.join(', ')}`)
		assert.equal(await page.locator('button[data-act]').count(), 0, 'no buttons anywhere, the theme switch included')
		assert.equal(await page.evaluate(() => (window as unknown as { DELEGATE_IO: unknown }).DELEGATE_IO), null)
		assert.match(await text(page, '.snapnote'), /This is a snapshot/)
	} finally { await ctx.close() }
})

test('page: keyboard only. Entering the queue focuses a card; ? and Escape keep the item; Escape leaves a field back to its card; Ctrl+Enter sends and moves on', { skip }, async () => {
	const t = await open('#focus')
	try {
		const focused = () => t.page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
		await t.page.waitForTimeout(100)
		assert.equal(await focused(), 'card-A1')
		await t.page.keyboard.press('j')
		assert.equal(await focused(), 'card-A2')
		await t.page.keyboard.press('k')
		await t.page.keyboard.press('?')
		assert.equal(await t.page.evaluate(() => (document.getElementById('keys') as HTMLDialogElement).open), true)
		await t.page.keyboard.press('Escape')
		assert.deepEqual(await t.page.evaluate(() => [(document.getElementById('keys') as HTMLDialogElement).open, location.hash]), [false, '#focus/A1'])
		await t.page.keyboard.press('a')
		assert.equal(await focused(), 'askin-A1')
		await t.page.keyboard.press('Escape')
		assert.equal(await focused(), 'card-A1')
		await t.page.goto(t.page.url().replace(/#.*/, '#focus/A3'))
		await t.page.waitForTimeout(100)
		await t.page.keyboard.press('1')
		await t.page.waitForFunction(() => document.querySelector('#pri-A3')?.textContent === 'Send')
		await t.page.keyboard.press('Control+Enter')
		await t.page.waitForFunction(() => location.hash === '#focus/A4')
		assert.match(t.store.byCode('A3')!.status, /^Sent/)
	} finally { await t.close() }
})

test('page: Dismiss says it is dismissing; the send button never shows "Sending…" for it', { skip }, async () => {
	const t = await open('#focus/A2')
	try {
		await t.page.click('#focus-card [data-act=more], .card [data-act=more]').catch(() => {})
		await t.page.evaluate(() => (document.querySelector('[data-act=dismiss]') as HTMLElement | null)?.click())
		await t.page.waitForSelector('.state.pending:has-text("Dismissing.")')
		assert.equal(await t.page.locator('#pri-A2 .spin').count(), 0, 'the main button is not busy')
		assert.equal(await t.page.locator('text=Sending…').count(), 0)
	} finally { await t.close() }
})

test('page: Edit in Teams copies the reply and opens the chat, sending nothing', { skip }, async () => {
	const t = await open('#focus/A1')
	try {
		await t.page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
		await t.page.evaluate(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((u: string) => { (window as unknown as { opened: string[] }).opened.push(u); return null }) as typeof window.open })
		const draft = await t.page.locator('#card-A1 .draft').innerText()
		await t.page.click('#card-A1 [data-act=menu]')
		await t.page.click('#card-A1 [data-act=teamsdraft]')
		await t.page.waitForFunction(() => (window as unknown as { opened: string[] }).opened.length === 1)
		assert.equal((await t.page.evaluate(() => navigator.clipboard.readText())).trim(), draft.trim())
		assert.match(await t.page.evaluate(() => (window as unknown as { opened: string[] }).opened[0]), /^https:\/\/teams\.microsoft\.com\/l\/message\//)
		assert.equal(t.store.byCode('A1')!.state, 'needs_human', 'nothing sent')
	} finally { await t.close() }
})

test('page: a sent reply can still be asked about from Done; the answer shows there and nothing more is sent', { skip }, async () => {
	const t = await open('#done/replies')
	try {
		const sends = t.store.logs(7).filter(e => e.event === 'sent').length
		await t.page.click('li[data-code=A10] summary')
		await t.page.fill('#askin-A10', 'Did Tom confirm he got it?')
		await t.page.press('#askin-A10', 'Enter')
		await t.page.waitForSelector('li[data-code=A10] .nq:has-text("confirm he got it") + .na .typing')
		const wf = t.store.byCode('A10')!
		assert.equal(wf.notes!.at(-1)!.q, 'Did Tom confirm he got it?')
		wf.notes = wf.notes!.map(n => ({ ...n, a: 'Not yet. He has not replied since.' }))
		t.store.save(wf)
		await t.page.waitForSelector('li[data-code=A10] .na p:has-text("Not yet. He has not replied since.")')
		assert.equal(t.store.byCode('A10')!.state, 'done')
		assert.equal(await t.page.locator('li[data-code=A10] [data-act=usenote]').count(), 0)
		assert.equal(t.store.logs(7).filter(e => e.event === 'sent').length, sends, 'nothing more was sent')
	} finally { await t.close() }
})

test('page: "Not right?" on a sent reply asks what was wrong, then drafts a follow-up for your ok and sends nothing', { skip }, async () => {
	const t = await open('#done/replies', s => {
		const w = s.byCode('A10')!
		Object.assign(w, { decision: { action: 'draft', reason: 'The design wiki says the tokens are final.', confidence: 'high' }, draft: { ...w.draft!, sources: [{ ref: 'https://acme.sharepoint.com/wiki/spacing', tier: 'live', label: 'Design wiki', origin: 'extracted' }] } })
		s.save(w)
	})
	try {
		const sends = t.store.logs(7).filter(e => e.event === 'sent').length
		await t.page.click('li[data-code=A10] summary')
		// A slow runner can read the row before it opens: innerText of a hidden element is empty (CI macOS 10-21).
		await t.page.locator('li[data-code=A10] .why summary').waitFor({ state: 'visible' })
		assert.match(await t.page.locator('li[data-code=A10] .why summary').innerText(), /Why: The design wiki says the tokens are final\./)
		await t.page.click('li[data-code=A10] [data-act=markopen]')
		await t.page.click('li[data-code=A10] [data-act=markkind][data-v=incomplete]')
		assert.equal(await t.page.locator('li[data-code=A10] .markf button[type=submit] .bl').innerText(), 'Draft what was missing')
		await t.page.fill('#mk-A10', 'say which tokens changed')
		await t.page.click('li[data-code=A10] .markf button[type=submit]')
		await t.page.waitForFunction(() => document.querySelector('.toast, [role=status]')?.textContent?.includes('Drafting a follow-up'))
		const wf = t.store.byCode('A10')!
		assert.deepEqual([wf.state, wf.correction?.kind, wf.correction?.note, wf.correction?.sent], ['running', 'incomplete', 'say which tokens changed', 'Yes, the spacing tokens are final.'])
		assert.equal(t.store.logs(7).filter(e => e.event === 'sent').length, sends, 'nothing sent')
	} finally { await t.close() }
})

test('page: Home shows the running version and Check now asks the server to check', { skip }, async () => {
	const t = await open('#home')
	try {
		const posted: string[] = []
		t.page.on('request', (r: Req) => { if (r.url().includes('/act')) posted.push(r.postData() ?? '') })
		await t.page.waitForSelector('.ver')
		assert.match(await t.page.locator('.ver').innerText(), /Version (?:v\d+\.\d+\.\d+ \()?[0-9a-f]{7}/, 'a commit, or a release and its commit')
		await t.page.click('[data-act=checkupdate]')
		await t.page.waitForFunction(() => document.querySelector('[data-act=checkupdate]')?.textContent?.includes('Checking'))
		assert.ok(posted.some(p => JSON.parse(p).command === 'check update'), posted.join('|'))
	} finally { await t.close() }
})

test('page: pasting a missed message link on Home queues it and says nothing is sent', { skip }, async () => {
	const t = await open('#home')
	try {
		const link = 'https://teams.microsoft.com/l/message/19%3Ateam%40thread.v2/1792405146070?context=%7B%7D'
		await t.page.fill('#missin', link)
		await t.page.click('.missf button[type=submit]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('It becomes an item in a minute'))
		assert.deepEqual(t.store.missed().map(m => m.link), [link])
		assert.equal(await t.page.inputValue('#missin'), '')
	} finally { await t.close() }
})

test('page: Report a problem on Home writes the owner\'s words to the feedback log', { skip }, async () => {
	const t = await open('#home')
	try {
		await t.page.click('[data-act=reportopen]')
		await t.page.fill('#repin', 'The nudge came twice for A2.')
		await t.page.click('form[data-form=report] button[type=submit]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('It is in your feedback log'))
		assert.ok(t.store.lessons().some(l => l.kind === 'report' && l.what === 'The nudge came twice for A2.'))
		assert.equal(await t.page.locator('#repin').count(), 0, 'the form closes')
	} finally { await t.close() }
})

test('page: Watching lists the channels you named, and Stop watching removes one from the shared config', { skip }, async () => {
	const t = await open('#watching', s => s.saveConfig({ ...s.config(), channels: [{ teamId: 'team-1', channelId: '19:abc@thread.tacv2', name: 'Events dev' }] }))
	try {
		await t.page.waitForSelector('li.row:has-text("Events dev")')
		await t.page.click('li.row:has-text("Events dev") [data-act=rowact]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('Stopped watching Events dev.'))
		assert.deepEqual(t.store.config().channels, [])
	} finally { await t.close() }
})

test('page: after a restart, sent replies are still under Done, and only new ones are counted on Home', { skip }, async () => {
	const t = await open('#done', s => {
		const now = new Date().toISOString()
		s.markViewed()
		writeFileSync(join(s.root, 'state', 'visit.json'), JSON.stringify({ since: now, started: now }))
	})
	try {
		await t.page.waitForSelector('li[data-code=A10]')
		assert.equal(await t.page.locator('li[data-code=A11]').count() > 0, true)
		await t.page.goto(t.page.url().replace(/#.*$/, '#home'))
		assert.equal(await t.page.locator('a.tile:has-text("Replied to")').count(), 0, 'nothing new since this visit started')
	} finally { await t.close() }
})

test('page: a reply shows what stays yours and the check-back it promises; Watching changes how often and for how long', { skip }, async () => {
	const ends = new Date(Date.now() + 3 * 86_400_000).toISOString()
	const t = await open('#focus/A1', s => {
		const w = s.byCode('A1')!
		Object.assign(w, { todos: ['Ping the partner PM'], follow: { target: 'incident 2100', until: 'the partner team responds', everyHours: 2 } })
		s.save(w)
		const tr = s.byCode('A8')!, now = new Date().toISOString()
		s.saveJob({ schema: 1, id: 'jw', key: 'track:x', goal: 'Check', session: { agent: 'copilot', id: 's' }, state: 'done', purpose: 'work', parents: [tr.id], asks: [], every: 240, endsAt: ends, createdAt: now, updatedAt: now } as never)
		s.save({ ...tr, job: 'jw' })
	})
	try {
		await t.page.waitForSelector('#card-A1 .also-line:has-text("Yours to do: Ping the partner PM")')
		assert.match(await text(t.page, '#card-A1 .also-line:has-text("Then:")'), /watch incident 2100 every 2 h until the partner team responds, for up to 7 days/)
		await t.page.goto(t.page.url().replace(/#.*$/, '#watching'))
		await t.page.selectOption('select[data-every=A8]', '60m')
		await t.page.waitForFunction(() => document.body.textContent?.includes('now checks every 1 h'))
		assert.equal(t.store.job('jw')!.every, 60)
		await t.page.click('[data-act=rowact][data-v="extend A8"]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('keeps watching until'))
		assert.equal(Math.round((Date.parse(t.store.job('jw')!.endsAt!) - Date.parse(ends)) / 86_400_000), 7)
	} finally { await t.close() }
})

test('page: open work shows on its card, under Watching as in progress, and in Done; Wait and Close act on it', { skip }, async () => {
	const t = await open('#focus/A1', s => {
		const w = s.byCode('A1')!, at = new Date(Date.now() - 4 * 86_400_000).toISOString()
		Object.assign(w, {
			draft: undefined, choices: undefined, effects: undefined, question: 'No news on "Mail delivery fixed" since 2026-10-16. Answer "A1: nudge them", "wait A1: 3d", or "close A1".', status: 'No news since 2026-10-16',
			sent: { msgId: 'm1', at, text: 'I reactivated incident 2100.' },
			work: { goal: 'Mail delivery fixed by the partner team', doneWhen: 'the customer confirms', waitingOn: { who: 'Partner MTA team', where: 'incident 2100', since: at }, steps: [{ at, what: 'Replied: I reactivated incident 2100.' }, { at, what: 'incident 2100: partner asks for trace IDs', news: true }], links: ['incident:2100'], plan: [{ id: 'p1', what: 'Partner posts a fix', who: 'them', done: at }, { id: 'p2', what: 'CI build 52000001 passes', who: 'them', in: 'A2', probe: { build: 52000001, project: 'T' }, seen: 'InProgress' }] },
		})
		s.save(w)
	})
	try {
		await t.page.waitForSelector('#card-A1 [aria-label="This work"]')
		assert.match(await text(t.page, '#card-A1 [aria-label="This work"]'), /This work: Mail delivery fixed by the partner team · waiting on Partner MTA team \(incident 2100\)[\s\S]*Replied: I reactivated incident 2100\.[\s\S]*partner asks for trace IDs/)
		assert.match(await text(t.page, '#card-A1 [aria-label="Plan"]'), /✓ Partner posts a fix them\s*○ CI build 52000001 passes them · A2 · build 52000001 · InProgress/)
		await t.page.click('#card-A1 [data-act=rowact][data-v="wait A1: 3d"]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('stays in progress'))
		const w = t.store.byCode('A1')!
		assert.deepEqual([w.state, Math.round((Date.parse(w.work!.checkAt!) - Date.now()) / 86_400_000)], ['open', 3])
		await t.page.goto(t.page.url().replace(/#.*$/, '#done'))
		await t.page.waitForSelector('text=In progress · waiting on Partner MTA team')
		await t.page.goto(t.page.url().replace(/#.*$/, '#watching'))
		await t.page.waitForSelector('h2:has-text("In progress")')
		assert.match(await text(t.page, 'li[data-code=A1]'), /Mail delivery fixed by the partner team[\s\S]*Last: You chose to wait 3 days/)
		await t.page.click('li[data-code=A1] [data-act=rowact][data-v="close A1"]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('Closed A1'))
		assert.deepEqual([t.store.byCode('A1')!.state, t.store.byCode('A1')!.status], ['done', 'Closed: Closed by you'])
	} finally { await t.close() }
})

test('page: Settings shows what Delegate knows about you; a habit suggestion turns on with one click and its rule can be removed', { skip }, async () => {
	const t = await open('#settings', s => {
		s.saveHabits([{ key: 'send:sri:status_next_step:direct', code: 'H1', kind: 'send', text: 'You sent your last 6 replies to Alex (status next step) without changes. Let those go by themselves?', does: 'Replies to Alex in your 1:1 about status next step go out by themselves.', evidence: { count: 6, days: 4, total: 6, links: [] }, rule: { id: 'learned-sri', text: 'Learned: replies to Alex in 1:1 about status next step go by themselves', who: { accounts: [{ id: 'sri', name: 'Alex' }] }, when: { chat: 'direct', intent: 'status_next_step' }, then: 'send' }, state: 'suggested', at: new Date().toISOString() }])
	})
	try {
		await t.page.waitForSelector('#setsec-learned')
		assert.match(await text(t.page, '[data-code=H1]'), /You sent your last 6 replies to Alex[\s\S]*Evidence: 6 unedited replies on 4 days, out of 6/)
		await t.page.click('[data-code=H1] [data-act=rowact][data-v="ok H1"]')
		for (let i = 0; i < 100 && !t.store.rules().some(r => r.id === 'learned-sri'); i++) await new Promise(r => setTimeout(r, 50))
		assert.equal(t.store.rules().find(r => r.id === 'learned-sri')?.learned?.evidence, '6 unedited replies on 4 days')
		await t.page.reload(); await t.page.waitForSelector('#setsec-learned')
		assert.match(await t.page.locator('.setrows').nth(0).innerText(), /replies to Alex in 1:1 about status next step go by themselves\s*For: Alex\s*Learned [\d-]+ from 6 unedited replies on 4 days/)
		await t.page.click('[data-act=rowact][data-v="never H1"]')
		for (let i = 0; i < 100 && t.store.rules().some(r => r.id === 'learned-sri'); i++) await new Promise(r => setTimeout(r, 50))
		assert.equal(t.store.rules().some(r => r.id === 'learned-sri'), false)
	} finally { await t.close() }
})

test('Settings v2: one page by job with a sticky index; links go to a section or a row; More holds only the technical rows; an unsaved edit is marked', { skip }, async () => {
	const t = await open('#settings')
	try {
		await t.page.waitForSelector('.setnav')
		assert.deepEqual(await t.page.$$eval('.setnav a', (as: Element[]) => as.map(a => [a.textContent, a.getAttribute('href')])), [['What it knows', '#settings/learned'], ['You and your replies', '#settings/you'], ['Automatic replies', '#settings/replies'], ['Reminders and summary', '#settings/timing'], ['Updates and system', '#settings/system']])
		assert.deepEqual(await t.page.$$eval('details.adv .setrow[data-code^="set:"]', (e: Element[]) => e.map(x => x.getAttribute('data-code'))), ['set:pollIdle', 'set:maxParallel', 'set:retentionDays', 'set:model', 'set:showDetails'])
		assert.equal(await t.page.$eval('details.adv', (d: Element) => (d as HTMLDetailsElement).open), false, 'More is closed at first')
		assert.equal(await t.page.locator('#setsec-replies [data-code="set:delayMin"]').count(), 1, 'the wait before an automatic reply sits with automatic replies, not under More')
		assert.equal(await t.page.locator('#tabs a[aria-current]').first().textContent(), 'Settings')
		await t.page.click('.setnav a[href="#settings/timing"]')
		await t.page.waitForFunction(() => { const r = document.getElementById('setsec-timing')!.getBoundingClientRect(); return r.top >= 0 && r.top < 200 })
		await t.page.goto(t.page.url().replace(/#.*$/, '#settings/model'))
		await t.page.waitForFunction(() => document.activeElement?.id === 'set-model')
		assert.equal(await t.page.$eval('details.adv', (d: Element) => (d as HTMLDetailsElement).open), true, 'a link to a row under More opens it')
		await t.page.goto(t.page.url().replace(/#.*$/, '#settings/nope'))
		await t.page.waitForSelector('.setnav')
		await t.page.fill('#set-signature', 'Sent by my assistant')
		await t.page.waitForSelector('.setnav a[href="#settings/you"] .dot', { timeout: 2000 })
		assert.equal(await t.page.locator('.setnav .dot').count(), 1, 'only the section with the unsaved edit, as it is typed')
		await t.page.goto(t.page.url().replace(/#.*$/, '#settings/timing'))
		await t.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
		await t.page.click('.setnav a[href="#settings/timing"]')
		await t.page.waitForFunction(() => { const r = document.getElementById('setsec-timing')!.getBoundingClientRect(); return r.top >= 0 && r.top < 200 })
		assert.equal(await t.page.getAttribute('.setnav a[href="#settings/timing"]', 'aria-current'), 'location')
		await t.page.setViewportSize({ width: 480, height: 800 })
		assert.ok(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on a narrow window')
	} finally { await t.close() }
})

test('page: Settings changes a setting in the shared config, and says why when a value is not right', { skip }, async () => {
	const t = await open('#settings')
	try {
		await t.page.fill('#set-aliases', 'JP')
		await t.page.click('[data-code="set:aliases"] [data-act=saveset]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('Saved names people call you'))
		assert.deepEqual(t.store.config().aliases, ['JP'])
		await t.page.fill('#set-quietHours', '0')
		await t.page.click('[data-code="set:quietHours"] [data-act=saveset]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('Give a whole number from 1 to 336.'))
		assert.equal(t.store.config().quietHours, undefined)
		await t.page.selectOption('#set-reviewLearning', 'true')
		await t.page.click('[data-code="set:reviewLearning"] [data-act=saveset]')
		await t.page.waitForFunction(() => document.body.textContent?.includes('Saved approve learned facts first'))
		assert.equal(t.store.config().reviewLearning, true)
	} finally { await t.close() }
})
