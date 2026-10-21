// The page side of next action and owned work in the browser: the meaning line with its warning, a Settings switch that saves
// (and the changes never offered), "Send reply only" that sends nothing until the second ok, and "Review again". Made-up names.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-chblocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { useSite } = await import('../src/core/site.ts')
const { seedChanges, stub } = await import('./fixture.ts')

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
async function open(hash: string, ui: 'new' | 'classic' = 'classic', more: (s: S) => void = () => {}) {
	const store = seedChanges(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-chbroot-')), machine: 'mac' }), ui)
	more(store)
	const { url, server } = await serveInbox(() => store)
	let busy = false
	const runner = setInterval(async () => { if (busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), procs as never) } finally { busy = false } }, 50)
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript('window.DELEGATE_POLL_MS = 60;')
	const page: Page = await ctx.newPage()
	const errors: string[] = [], posted: string[] = [], saved: { key: string; value: string }[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	page.on('request', (r: Req) => {
		if (/\/act\?/.test(r.url())) posted.push(JSON.parse(r.postData() ?? '{}').command)
		if (/\/settings\?/.test(r.url())) saved.push(JSON.parse(r.postData() ?? '{}'))
	})
	await page.goto(url + hash)
	await page.waitForFunction(() => !!document.getElementById('main')?.innerHTML)
	return { store, page, posted, saved, close: async () => { clearInterval(runner); await ctx.close(); (server.closeAllConnections?.(), server.close()); assert.deepEqual(errors, []) } }
}
const until = async (f: () => boolean, ms = 6000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise(r => setTimeout(r, 50)); assert.ok(f()) }
const text = (p: Page, sel: string) => p.$eval(sel, (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())

test('changes ui page: a vote says what its PR is, with "your approval may complete it" as a warning; a deploy says its ring', { skip }, async () => {
	const t = await open('#focus/A60')
	try {
		await t.page.waitForSelector('#card-A60 .mean')
		assert.equal(await text(t.page, '#card-A60 .cmts .mean'), '"Fix the banner" by Dev Rao · required reviewers: Web Team · autocomplete is on: your approval may complete it')
		assert.equal(await text(t.page, '#card-A60 .mean .warn'), 'autocomplete is on: your approval may complete it', 'only the autocomplete part warns')
		const [warn, quiet, want] = await t.page.$eval('#card-A60 .mean', (e: Element) => [getComputedStyle(e.querySelector('.warn')!).color, getComputedStyle(e).color, getComputedStyle(document.documentElement).getPropertyValue('--warn').trim()])
		assert.notEqual(warn, quiet, 'the warning has its own tone')
		assert.ok(want, 'the warn color is a theme token')
		await t.page.goto(t.page.url().replace(/#.*$/, '#focus/A61'))
		await t.page.waitForSelector('#card-A61 .mean')
		assert.match(await text(t.page, '#card-A61 .mean'), /^nothing running · last run 900 by Pete Ross at .+, succeeded$/)
		assert.equal(await t.page.$('#card-A61 .mean .warn'), null)
		assert.equal(await t.page.$('#card-A6 .mean'), null, 'a change without facts has no line')
	} finally { await t.close() }
})

test('changes ui page: the new page shows the meaning line on the card a row opens', { skip }, async () => {
	const t = await open('#now/A60', 'new')
	try {
		await t.page.waitForSelector('.ncard #card-A60 .mean .warn')
		assert.equal(await text(t.page, '.ncard #card-A60 .mean .warn'), 'autocomplete is on: your approval may complete it')
	} finally { await t.close() }
})

test('changes ui page: a Settings switch saves as it flips, and a forbidden change never appears', { skip }, async () => {
	useSite({ write: { ado: ['repo_pull_request_write:abandon', 'repo_pull_request_write:complete', 'pipelines_write:run_pipeline', 'repo_pull_request_write'] }, actions: { 'ado-wit_work_item_write:delete': ['Delete', 'delete a work item'], 'ado-repo_pull_request_write:bypass_policy': ['Bypass', 'merge past policies'] } })
	const t = await open('#settings/you')
	try {
		const sw = '[data-act=setswitch][data-v="change:ado-wit_work_item_write:update"]'
		await t.page.waitForSelector(sw)
		const keys: string[] = await t.page.$$eval('[data-act=setswitch]', (els: HTMLElement[]) => els.map(e => e.dataset.v!))
		assert.deepEqual(keys, ['change:ado-repo_pull_request_thread_write', 'change:ado-repo_pull_request_write:vote', 'change:ado-wit_work_item_write:update', 'change:calendar-CreateEvent'])
		assert.doesNotMatch(await text(t.page, '#setsec-you'), /abandon|complete it|merge|bypass|delete|pipelines_write|run_pipeline/i, 'never offered, not even named')
		assert.equal(await t.page.getAttribute(sw, 'aria-checked'), 'false')
		await t.page.click(sw)
		await t.page.waitForSelector(`${sw}[aria-checked=true]:not([disabled])`)
		await until(() => t.store.config().agent.effectTools!.includes('ado-wit_work_item_write:update'))
		assert.deepEqual(t.saved, [{ key: 'change:ado-wit_work_item_write:update', value: 'true' }], 'through the settings save path')
		await t.page.waitForFunction(() => /Work item update is on/.test(document.querySelector('[data-code="set:change:ado-wit_work_item_write:update"]')?.textContent ?? ''))
		// Off again: the same save, and the list shrinks.
		const vote = '[data-act=setswitch][data-v="change:ado-repo_pull_request_write:vote"]'
		await t.page.click(vote)
		await t.page.waitForSelector(`${vote}[aria-checked=false]:not([disabled])`)
		await until(() => !t.store.config().agent.effectTools!.includes('ado-repo_pull_request_write:vote'))
		// A switch the server refuses goes back to what is saved.
		const cal = '[data-act=setswitch][data-v="change:calendar-CreateEvent"]'
		t.store.saveConfig({ ...t.store.config(), agent: { ...t.store.config().agent, tools: [...t.store.config().agent.tools, 'calendar-CreateEvent'] } })
		await t.page.click(cal)
		await t.page.waitForFunction(() => /read tools workers hold/.test(document.querySelector('[data-code="set:change:calendar-CreateEvent"]')?.textContent ?? ''))
		assert.equal(await t.page.getAttribute(cal, 'aria-checked'), 'false')
		assert.equal(t.store.config().agent.effectTools!.includes('calendar-CreateEvent'), false)
	} finally { await t.close(); useSite(undefined) }
})

test('changes ui page: "Send reply only" quotes the reply and sends nothing until the second ok', { skip }, async () => {
	const t = await open('#focus/A62')
	try {
		await t.page.waitForSelector('#card-A62 [data-act=replyonly]')
		assert.equal(await t.page.$('#card-A60 [data-act=replyonly]'), null)
		await t.page.click('#card-A62 [data-act=replyonly]')
		await t.page.waitForFunction(() => /Only the reply goes now/.test(document.querySelector('#card-A62 .state')?.textContent ?? ''))
		assert.match(await text(t.page, '#card-A62 .state'), /Only the reply goes now, and it says: "Left one comment on PR 4200004: the retry limit should come from config\." It was written counting on the changes you left out\. Say "ok A62" to send it as it is/)
		assert.ok(await t.page.$('#card-A62 .state.info'), 'a result line, not "Not done"')
		assert.deepEqual(t.posted, ['ok A62 except 1'])
		assert.deepEqual([t.store.byCode('A62')!.sent, t.store.byCode('A62')!.state], [undefined, 'needs_human'], 'nothing sent on the first ok')
		assert.equal(await t.page.$('#card-A62 [data-act=replyonly]'), null, 'the change is left out now; the main button sends the reply')
		await t.page.click('#pri-A62')
		await until(() => !!t.store.byCode('A62')!.sent)
		assert.deepEqual(t.posted, ['ok A62 except 1', 'ok A62'], 'the second ok sends it')
	} finally { await t.close() }
})

test('changes ui page: "Review again" sends the stale flow\'s own command', { skip }, async () => {
	const t = await open('#focus/A64')
	try {
		await t.page.waitForSelector('#pri-A64')
		assert.equal(await text(t.page, '#pri-A64'), 'Review again')
		assert.match(await text(t.page, '#card-A64 .q'), /PR 4200005 changed since your review \(new commits\)\. Review again\?/)
		await t.page.click('#pri-A64')
		await until(() => t.store.byCode('A64')!.state === 'running')
		assert.deepEqual(t.posted, ['A64: review again'])
		assert.equal(t.store.byCode('A64')!.ownerAnswer, 'review again')
	} finally { await t.close() }
})

// review P2-2: on a reply card, each change under "Also:" has its own line with its meaning under it, in valid markup.
test('changes ui page: a reply card says what each change means under "Also:", each on its own line', { skip }, async () => {
	const t = await open('#focus/A60', 'classic', s => {
		const w = s.byCode('A60')!, c = { ...w.effects![0], summary: 'Thanks for the fix.', pr: undefined, call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', repositoryId: 'web', pullRequestId: 4200001, content: 'Thanks for the fix.' } } }
		s.save({ ...w, promised: true, effects: [...w.effects!, c] }, false)
		const j = s.job('j-A60')!; s.saveJob({ ...j, result: { ...j.result!, effects: [...j.result!.effects, c] } })
	})
	try {
		await t.page.waitForSelector('#card-A60 .also-line')
		const lines = await t.page.$$eval('#card-A60 .also-line li', (els: Element[]) => els.map(e => [e.firstChild?.textContent?.trim(), e.querySelector('.mean')?.textContent?.replace(/\s+/g, ' ').trim() ?? null]))
		assert.deepEqual(lines, [['Approve PR 4200001', '"Fix the banner" by Dev Rao · required reviewers: Web Team · autocomplete is on: your approval may complete it'], ['Thanks for the fix.', null]])
		assert.equal(await t.page.$$eval('#card-A60 .also-line .mean .warn', (e: Element[]) => e.length), 1, 'the meaning sits inside its also-line')
		assert.equal(await t.page.$$eval('#card-A60 .c-sec p:empty', (e: Element[]) => e.length), 0, 'no stray empty paragraph')
	} finally { await t.close() }
})
