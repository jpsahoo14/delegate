// The new experience in the browser (N1a, R-NEX-01, 02, 04, 09, 13): the switch, every section and row kind on Now, each
// row kind's action sent and applied end to end, and the narrow panel.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-nblocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox, withUi } = await import('../src/web/server.ts')
const { renderApp } = await import('../src/web/shell.ts')
const { view } = await import('../src/web/view.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { propose: proposeAutomation } = await import('../src/runner/automations.ts')
const { seedNext, seedQuiet, seedPromise, stub, pauseNext } = await import('./fixture.ts')

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
// A page on a store, with a runner applying what it posts, the commands it posted, and its POST /ui calls.
async function open(hash = '', seed: (s: S) => S = s => seedNext(s), o: { viewport?: { width: number; height: number }; init?: string; store?: S; before?: (p: Page) => Promise<void> } = {}) {
	const store = o.store ?? seed(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-nbroot-')), machine: 'mac' }))
	const { url, server } = await serveInbox(() => store)
	let busy = false
	const runner = setInterval(async () => { if (busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), procs as never) } finally { busy = false } }, 50)
	const ctx = await browser.newContext({ viewport: o.viewport ?? { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript(`window.DELEGATE_POLL_MS = 60;${o.init ?? ''}`)
	const page: Page = await ctx.newPage()
	const errors: string[] = [], posted: string[] = [], uis: string[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	page.on('request', (r: Req) => { if (/\/act\?/.test(r.url())) posted.push(JSON.parse(r.postData() ?? '{}').command); if (/\/ui\?/.test(r.url())) uis.push(r.postData() ?? '') })
	await o.before?.(page)
	await page.goto(url + hash)
	await page.waitForSelector('#main :first-child')
	return { store, url, page, ctx, errors, posted, uis, close: async () => { clearInterval(runner); await ctx.close(); (server.closeAllConnections?.(), server.close()); assert.deepEqual(errors, []) } }
}
const until = async (f: () => boolean, ms = 6000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise(r => setTimeout(r, 50)); assert.ok(f()) }
const exp = (p: Page) => p.evaluate(() => document.getElementById('app')!.dataset.ui ?? 'classic')

test('next switch: flips this machine only, survives a reload, sends no command, and the address can set it', { skip }, async () => {
	const t = await open('#home', s => seedNext(s, 'classic'))
	try {
		assert.equal(await exp(t.page), 'classic')
		assert.equal(await t.page.getAttribute('.uisw-top', 'aria-checked'), 'false')
		assert.equal(await t.page.locator('.uisw-top .newdot').count(), 1, 'a New dot until first tried')
		await Promise.all([t.page.waitForEvent('load'), t.page.click('.uisw-top')])
		await t.page.waitForSelector('#app[data-ui=next] #now-move')
		assert.deepEqual([t.store.ui().ui, typeof t.store.ui().tried], ['new', 'string'])
		assert.equal(await t.page.getAttribute('.uisw-top', 'aria-checked'), 'true')
		assert.equal(await t.page.locator('.uisw-top .newdot').count(), 0, 'no dot once tried')
		const other = new Store({ root: t.store.root, machine: 'pc' })
		assert.equal(other.ui().ui, 'classic', 'the other machine keeps its own')
		await t.page.reload()
		await t.page.waitForSelector('#app[data-ui=next] #now-move')
		// Done reloads on the same tab, in the other experience.
		await t.page.goto(t.url + '#done/replies')
		await t.page.waitForSelector('#app[data-ui=next] .lh')
		await Promise.all([t.page.waitForEvent('load'), t.page.click('.uisw-top')])
		await t.page.waitForSelector('#app:not([data-ui=next]) #tabs a')
		assert.equal(await t.page.evaluate(() => location.hash), '#done/replies')
		assert.equal(t.store.ui().ui, 'classic')
		assert.deepEqual(t.posted, [], 'switching sends no command')
		assert.equal(t.store.answers().length, 0)
		assert.deepEqual(t.store.logs().filter(e => e.event === 'ui').map(e => [e.from, e.to]), [['classic', 'new'], ['new', 'classic']])
		// #ui=new in a link sets it and leaves the address.
		await t.page.goto(t.url + '#ui=new')
		await t.page.waitForSelector('#app[data-ui=next] #now-move')
		assert.equal(await t.page.evaluate(() => location.hash), '')
		await until(() => t.store.ui().ui === 'new')
	} finally { await t.close() }
})

test('next switch: a link with #ui=new opens a fresh page in the new experience and saves it for this machine', { skip }, async () => {
	const t = await open('#ui=new', s => seedNext(s, 'classic'))
	try {
		await t.page.waitForSelector('#app[data-ui=next] #now-move')
		await until(() => t.store.ui().ui === 'new')
		assert.equal(await t.page.evaluate(() => location.hash), '')
		await t.page.reload()
		await t.page.waitForSelector('#app[data-ui=next] #now-move')
		assert.deepEqual(t.posted, [])
	} finally { await t.close() }
})

// Review P2-4: the page flips only once the server has saved the choice; offline, it says so and nothing changes.
test('next switch: a save that fails switches nothing, says "Could not switch: offline", and leaves the cache', { skip }, async () => {
	const t = await open('#home', s => seedNext(s, 'classic'))
	try {
		await t.page.evaluate(() => { (window as unknown as { stay: number }).stay = 1 })
		await t.page.route(/\/ui\?/, (r: { abort(): Promise<void> }) => r.abort())
		await t.page.click('.uisw-top')
		await t.page.waitForFunction(() => /Could not switch: offline/.test(document.getElementById('toast')?.textContent ?? ''))
		assert.equal(await t.page.evaluate(() => (window as unknown as { stay?: number }).stay), 1, 'no reload')
		assert.equal(await exp(t.page), 'classic')
		assert.equal(await t.page.evaluate(() => localStorage.getItem('delegate-ui')), null, 'the cache is unchanged')
		assert.equal(t.store.ui().ui, 'classic')
		assert.equal(await t.page.getAttribute('.uisw-top', 'aria-checked'), 'false')
		await t.page.unroute(/\/ui\?/)
		await Promise.all([t.page.waitForEvent('load'), t.page.click('.uisw-top')])
		await t.page.waitForSelector('#app[data-ui=next] #now-move')
		assert.equal(JSON.parse(await t.page.evaluate(() => localStorage.getItem('delegate-ui')) ?? '{}').ui, 'new', 'cached once saved')
	} finally { await t.close() }
})

// Review P2-3: the AI-chat panel is not verified in a real host yet, so it offers no switch and never writes the setting;
// it follows this machine's setting as it is. Drawn here with a stub MCP Apps host.
test('next panel: no switch; it follows the machine setting read-only and ignores #ui=', { skip }, async () => {
	for (const ui of ['new', 'classic'] as const) {
		const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-nbpanel-')), machine: 'mac' }), ui)
		const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, reducedMotion: 'reduce', locale: 'en-US' })
		const page: Page = await ctx.newPage(), errors: string[] = [], calls: string[] = []
		page.on('pageerror', (e: Error) => errors.push(e.message))
		await page.exposeFunction('__tool', (name: string, args: { since?: string; ui?: string }) => {
			calls.push(name)
			if (name === 'inbox_view') return { structuredContent: JSON.parse(JSON.stringify(withUi(store, view(store, args.since), args.ui === 'new'))) }
			return { structuredContent: { ok: true } }
		})
		await page.goto('about:blank#ui=' + (ui === 'new' ? 'classic' : 'new'))
		// The MCP Apps client goes where the real one is inlined (src/mcp/server.ts appBundle); tool calls reach this test.
		const host = 'window.DELEGATE_POLL_MS = 60; globalThis.McpExtApps = { App: class { async connect() {} async callServerTool(r) { return window.__tool(r.name, r.arguments) } } };'
		await page.setContent(renderApp(withUi(store, view(store, store.visitSince())), 'panel', host))
		await page.waitForSelector('#main :first-child')
		assert.equal(await exp(page), ui === 'new' ? 'next' : 'classic', `the panel follows the machine (${ui})`)
		assert.equal(await page.locator('.uisw').count(), 0, 'no switch in the panel')
		if (ui === 'new') await page.waitForSelector('#now-move .nrow')
		await page.waitForTimeout(300)
		assert.equal(calls.includes('ui_save'), false, 'the panel never writes the setting')
		assert.equal(store.ui().ui, ui)
		assert.deepEqual(errors, [])
		await ctx.close()
	}
})

// Review round 2, P2-1: a #ui= link draws its choice only once the server saved it; offline it says so and keeps the old one.
test('next switch: a #ui= link whose save fails keeps the machine\'s experience and says "Could not switch: offline"', { skip }, async () => {
	const t = await open('#ui=new', s => seedNext(s, 'classic'), { before: p => p.route(/\/ui\?/, (r: { abort(): Promise<void> }) => r.abort()) })
	try {
		await t.page.waitForFunction(() => /Could not switch: offline/.test(document.getElementById('toast')?.textContent ?? ''))
		assert.equal(await exp(t.page), 'classic')
		assert.equal(t.store.ui().ui, 'classic')
		assert.equal(await t.page.evaluate(() => localStorage.getItem('delegate-ui')), null)
	} finally { await t.close() }
})

test('next switch: unsent text asks "Discard your edit?" first; Cancel keeps it; it works without storage', { skip }, async () => {
	// The AI-chat panel may not allow storage: every read and write of it throws here.
	const noStorage = "Object.defineProperty(window, 'localStorage', { get() { throw new Error('no storage') } });Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('no storage') } });"
	const t = await open('#now', s => seedNext(s), { init: noStorage })
	try {
		await t.page.fill('#tell-A23', 'Tried the form once')
		const asked: string[] = []
		t.page.once('dialog', async (d: { message(): string; dismiss(): Promise<void> }) => { asked.push(d.message()); await d.dismiss() })
		await t.page.click('.uisw-top')
		await until(() => asked.length === 1)
		assert.deepEqual(asked, ['Discard your edit?'])
		await t.page.waitForTimeout(300)
		assert.equal(await exp(t.page), 'next')
		assert.equal(await t.page.inputValue('#tell-A23'), 'Tried the form once', 'Cancel keeps the text')
		assert.equal(t.store.ui().ui, 'new')
		t.page.once('dialog', (d: { accept(): Promise<void> }) => d.accept())
		await Promise.all([t.page.waitForEvent('load'), t.page.click('.uisw-top')])
		await t.page.waitForSelector('#app:not([data-ui=next]) #tabs a')
		assert.equal(t.store.ui().ui, 'classic', 'saved on the server with no storage in the page')
		assert.deepEqual(t.posted, [], 'the text was never sent')
		// A card being answered counts too.
		await t.page.goto(t.url + '#focus/A2')
		await t.page.fill('#card-A2 textarea, #card-A2 input[data-input=answer]', 'Oct 24')
		const again: string[] = []
		t.page.once('dialog', async (d: { message(): string; dismiss(): Promise<void> }) => { again.push(d.message()); await d.dismiss() })
		await t.page.click('.uisw-top')
		await until(() => again.length === 1)
		assert.equal(await exp(t.page), 'classic')
	} finally { await t.close() }
})

test('next Now: the summary line, every row kind on its fixture, attributed words, markers, and Next', { skip }, async () => {
	const t = await open('#now')
	try {
		const flat = async (sel: string) => (await t.page.locator(sel).innerText()).replace(/\s+/g, ' ').trim()
		// N1b: the Since line leads the same one line (test/next-n1b-browser.test.ts).
		assert.match(await flat('#nsum'), /^Since (yesterday )?\d{1,2}:\d{2} [AP]M: replied to 3 \(1 by rule\) · 4 FYIs · Delegate is working on 3 · Waiting 8, 2 changed · Catch up 4, 1 worth a look$/)
		assert.deepEqual(await t.page.locator('#nsum a').evaluateAll((l: Element[]) => l.map(a => a.getAttribute('href'))), ['#done/replies', '#done/catchup', '#now/working', '#now/waiting', '#now/catchup'], 'each part opens its Done filter or its section')
		assert.deepEqual(await Promise.all(['move', 'working', 'waiting', 'catchup'].map(id => flat(`#now-${id} .nsh h2`))), ['YOUR MOVE · 13', 'DELEGATE IS WORKING · 3', 'WAITING · 8', 'CATCH UP · 4 UNREAD'])
		assert.deepEqual((await t.page.locator('#tabs a').allInnerTexts()).map((x: string) => x.replace(/\s+/g, ' ')), ['Now 13', 'Done 5', 'Numbers', 'Settings'])
		assert.match(await flat('#status'), /^Checked \d/)
		const kinds: Record<string, string> = { A20: 'reply', A21: 'holding', A2: 'question', A3: 'choice', A5: 'meeting', A6: 'review', A34: 'check-date', A37: 'track', A23: 'your-step', A22: 'stopped', A24: 'working', A36: 'scheduled', A29: 'watch', R1: 'reminder', A25: 'waiting-delegate', A28: 'waiting-person', W2: 'waiting-person', A26: 'nobody', A27: 'waiting-others', A30: 'catchup' }
		for (const [code, kind] of Object.entries(kinds)) assert.equal(await t.page.locator(`#now-${code}.k-${kind}`).count(), 1, `${code} draws as ${kind}`)
		const text = (c: string) => flat(`#now-${c}`)
		assert.match(await text('A20'), /Send reply to Kim: "Yes, the plan is final\. Launch stays on Oct 24\." From before setup Guests in chat Kim Lane · Spec review · asked .*: "Is the draft plan final\?"/)
		assert.doesNotMatch(await text('A21'), /Holding reply/, 'no Holding chip: the headline says it')
		assert.match(await text('W2'), /^DM You asked Dev: "Can you share the launch numbers before Friday\?"/)
		assert.match(await text('R1'), /Reminding Arun: "Please update the API design doc\."/)
		assert.match(await text('A37'), /You said .*: "I'd be the POC for the test plan" · Done when: the test plan is shared with the team/)
		assert.match(await text('A29'), /Last check (?:yesterday )?\d+:\d\d [AP]M: 1 of 2 approvals, build green · until \w+/)
		assert.match(await text('A28'), /Waiting for: Which deck Sam means/)
		assert.match(await text('A22'), /Couldn't finish reviewing PR 2204 for Dev: try again, or do it yourself .*Why: a tool is missing \(diff-tool\)/)
		assert.match(await text('A25'), /Retrying (?!\().*Next: Delegate tries again .+ \(1 of 3\)/)
		assert.match(await text('A29'), /Changed.*Next: Delegate checks every hour/)
		assert.match(await text('A36'), /Next: Delegate sends it at (?:tomorrow )?\d+:\d\d [AP]M Hold$/)
		assert.match(await text('A34'), /Waiting on: Lin Brook since \w+/)
		assert.doesNotMatch(await text('A34'), /last news|linked/)
		assert.match(await text('A23'), /\+1 chat/)
		assert.match(await text('A30'), /Worth a look/)
		assert.match(await text('A26'), /Next: nobody has started this; Do it now hands it to Delegate/)
		assert.doesNotMatch(await text('A27'), /Next:/, 'the headline names who it waits on')
		assert.match(await text('A6'), /Next: after your ok, Delegate posts them and replies/)
		assert.match(await text('A5'), /Conflict: You have "1:1 with Ana"/)
		assert.equal(await t.page.locator('#main [data-act=nact][data-v^="ok A"]').evaluateAll((l: Element[]) => l.filter(e => /^Send/.test(e.textContent ?? '')).length), 0, 'no row sends; replies open (owner 10-21)')
		assert.deepEqual([await t.page.locator('#now-A23 [data-act=nact]').count(), await t.page.locator('#now-A23 form[data-form=tell]').count()], [0, 1], 'your step is a field, without Wait 3 days')
		assert.equal(await t.page.getAttribute('#tell-A23', 'placeholder'), 'Tell Delegate what you did, or what to do next')
		assert.match(await flat('#now-move .nmin'), /When you have a minute: 1 fact to check/)
		assert.equal(await t.page.locator('#now-catchup .nmore').getAttribute('href'), '#done/catchup')
		// Row codes only on focus and in the open row.
		assert.equal(await t.page.locator('#now-A20 .nh .code').isVisible(), false)
		await t.page.focus('#now-A20 .nract a')
		assert.equal(await t.page.locator('#now-A20 .nh .code').isVisible(), true)
		// Classic links open the matching place in Now; the open card drops the row's header and ask.
		await t.page.evaluate(() => { location.hash = '#focus/A3' })
		await t.page.waitForSelector('#now-A3.open #card-A3')
		assert.deepEqual([await t.page.locator('#now-A3 .nh .code').isVisible(), await t.page.locator('#card-A3 .c-who').isVisible(), await t.page.locator('#now-A3 .nract a').innerText()], [true, false, 'Hide'])
	} finally { await t.close() }
})

test('next Now: Undo for a rule send, the quiet footer, and Settings in its own words', { skip }, async () => {
	const t = await open('#now', s => { seedNext(s); s.saveConfig({ ...s.config(), channels: [{ teamId: 'team-1', channelId: '19:abc@thread.tacv2', name: 'Release dev' }] } as never); return s })
	try {
		assert.match((await t.page.locator('.nundo').innerText()).replace(/\s+/g, ' '), /^Sent for you to Meera \(rule r1\): "The release notes are in the Release 26\.10 wiki page, section 3\." Undo \d:\d\d$/)
		await t.page.click('.nundo [data-act=undo]')
		await until(() => t.posted.includes('undo A9'))
		// N1b: Find takes a pasted link and offers to make it an item, so the footer has no second box for it.
		assert.equal(await t.page.locator('#missin').count(), 0)
		assert.match(await t.page.locator('#find').getAttribute('placeholder'), /paste a Teams link/)
		assert.match((await t.page.locator('.nfoot').innerText()).replace(/\s+/g, ' '), /\+ Remind someone · Channels you named \(1\) · Version .* · Check for updates · Report a problem/)
		// A redraw in the same task as the click, before its toggle event, keeps the list open (CI macOS 10-21).
		await t.page.evaluate(() => { document.querySelector<HTMLElement>('.nchan summary')!.click(); window.dispatchEvent(new HashChangeEvent('hashchange')) })
		await t.page.waitForTimeout(300)
		assert.equal(await t.page.locator('.nchan').getAttribute('open'), '', 'open after a redraw that beat the toggle event')
		await t.page.locator('.nchan').getByRole('button', { name: 'Stop', exact: true }).click()
		await until(() => t.posted.some(c => c.startsWith('unwatch https://teams.microsoft.com/l/channel/')))
		await t.page.click('.nfoot [data-act=tpl][data-v=remind]')
		await t.page.waitForSelector('.sheet [data-act=autocreate]')
		await t.page.click('[data-act=closesheet]')
		await t.page.click('.nfoot [data-act=reportopen]')
		await t.page.waitForSelector('#repin')
		await t.page.evaluate(() => { location.hash = '#settings' })
		await t.page.waitForSelector('[data-code="set:followUpHours"]')
		assert.match(await t.page.locator('[data-code="set:followUpHours"]').innerText(), /Your unanswered asks show under Waiting after/)
		assert.match(await t.page.locator('[data-code="set:updateEvery"]').innerText(), /Check for updates at the foot of Now/)
	} finally { await t.close() }
})

test('next Now: empty states, and paused drafting goes on while sends wait', { skip }, async () => {
	let t = await open('#now', s => seedQuiet(s))
	try { assert.match(await t.page.locator('.nquiet').innerText(), /Quiet\.\s+Nothing needs you, and nothing is waiting\./) } finally { await t.close() }
	t = await open('#now', s => seedQuiet(s, true))
	try {
		assert.equal(await t.page.locator('#now-move .nempty').innerText(), 'Nothing needs you. 1 thing is waiting on someone else.')
		assert.deepEqual([await t.page.locator('#now-working').count(), await t.page.locator('#now-catchup').count(), await t.page.locator('#now-waiting').count()], [0, 0, 1], 'empty sections other than Your move are not drawn')
	} finally { await t.close() }
	t = await open('#now', s => pauseNext(seedNext(s)))
	try {
		assert.equal(await t.page.locator('#now-working .nsh .tag').innerText(), 'Paused: drafts go on, nothing is sent')
		assert.deepEqual(await t.page.locator('#now-working .nrow').evaluateAll((l: Element[]) => l.map(e => e.id)), ['now-A24', 'now-A7'], 'the draft stays in Working')
		assert.match((await t.page.locator('#now-A36').innerText()).replace(/\s+/g, ' '), /Send reply to Alex: "Yes, build 512 is green\." Held: you paused .* Open$/)
		assert.equal(await t.page.locator('#now-A36').evaluate((e: Element) => e.closest('section')!.id), 'now-move', 'held for you, in Your move')
		assert.equal(await t.page.locator('#nsum .tag').count(), 0, 'the paused tag is only on Working\'s header')
		assert.doesNotMatch(await t.page.locator('#main').innerText(), /[Ss]ends?[^\n]{0,40}when you resume/)
		assert.equal(await t.page.locator('#now-A20 .nract').innerText(), 'Open', 'a row opens even when paused; sends wait for resume')
		assert.equal(await t.page.locator('.health [data-act=healthfix]').innerText(), 'Resume')
	} finally { await t.close() }
})

test('next actions: each row kind\'s action posts its existing command, and the runner applies it', { skip }, async () => {
	const t = await open('#now', s => { seedNext(s); proposeAutomation(s, { to: 'Arun Mehta', text: 'Please share the notes.', every: 'day', at: '16:00' }); return s })
	try {
		const press = async (code: string, label: string, cmd: string, done: () => boolean) => {
			await t.page.locator(`#now-${code} .nract`).getByRole('button', { name: label, exact: true }).click()
			await until(() => t.posted.includes(cmd))
			await until(done)
		}
		const s = t.store, w = (c: string) => s.byCode(c)!
		await press('A22', 'Try again', 'A22: try again', () => w('A22').state === 'running')
		await press('A34', 'Draft a nudge', 'A34: nudge them', () => w('A34').state === 'running')
		await press('A37', 'Track', 'ok A37', () => w('A37').state === 'open')
		await press('A36', 'Hold', 'later A36', () => w('A36').state === 'needs_human')
		await press('A29', 'Got it', 'ok A29', () => !!w('A29').ackAt)
		await press('R1', 'Pause', 'pause R1', () => s.automation('R1')!.state === 'paused')
		await press('R2', 'Start', 'ok R2', () => s.automation('R2')!.state === 'active')
		await press('W2', 'Draft a nudge', 'ok W2', () => !!s.waiting().find(x => x.code === 'W2')!.item)
		await press('A26', 'Do it now', 'A26: do the next step now', () => w('A26').state === 'running')
		await press('A27', 'Draft a nudge', 'A27: nudge them', () => w('A27').state === 'running')
		await press('A28', 'Draft a nudge', 'A28: nudge them', () => w('A28').state === 'running')
		await press('A30', 'Needs me', 'mine A30', () => w('A30').state === 'running')
		// Your step: what you did goes back through the answer path.
		await t.page.fill('#tell-A23', 'Tried it twice, it works')
		await t.page.click('[data-form=tell][data-code=A23] button[type=submit]')
		await until(() => t.posted.includes('A23: Tried it twice, it works'))
		await until(() => w('A23').state === 'running')
		// A row that opens: the card's own action, here a pick and then its Send.
		await t.page.click('#now-A3 .nract a')
		await t.page.waitForSelector('#now-A3.open #card-A3')
		await t.page.click('label:has(#o-A3-1)')
		await until(() => t.posted.includes('pick A3 1'))
		await t.page.waitForSelector('#pri-A3:not([disabled])')
		await t.page.click('#pri-A3')
		await until(() => t.posted.includes('ok A3'))
		await until(() => !!w('A3').sent)
		assert.equal(t.posted.filter(c => /^ok A3$/.test(c)).length, 1, 'each action is sent once')
	} finally { await t.close() }
})

test('next narrow panel: Your move leads, the summary line opens the other sections, and the menu holds the tabs, switch, theme, and Done\'s count', { skip }, async () => {
	const t = await open('#now', s => seedNext(s), { viewport: { width: 400, height: 860 } })
	try {
		const visible = (sel: string) => t.page.locator(sel).isVisible()
		await t.page.waitForSelector('#now-move .nrows', { state: 'visible' })
		assert.deepEqual(await Promise.all(['working', 'waiting', 'catchup'].map(id => visible(`#now-${id}`))), [false, false, false], 'the summary line replaces the other sections')
		assert.equal(await visible('#tabs'), false)
		assert.equal(await visible('.uisw-top'), false, 'below 560 px the switch is in the menu')
		assert.equal(await t.page.locator('#navbtn .count').innerText(), '5', "Done's count shows on the menu")
		assert.match(await t.page.locator('#status').innerText(), /Checked/, 'the status says a word, not only a dot')
		assert.equal(await visible('.nnote .narrow'), true, 'the note says where the switch is on a narrow page')
		const width = await t.page.evaluate(() => document.documentElement.scrollWidth)
		assert.ok(width <= 400, `no sideways scroll (${width})`)
		await t.page.click('#nsum a[href="#now/waiting"]')
		await t.page.waitForSelector('#now-waiting .nrows', { state: 'visible' })
		assert.equal(await visible('#now-working'), false)
		await t.page.click('#navbtn')
		await t.page.waitForSelector('#tabs.open .uisw-menu', { state: 'visible' })
		assert.deepEqual((await t.page.locator('#tabs a').allInnerTexts()).map((x: string) => x.replace(/\s+/g, ' ')), ['Now 13', 'Done 5', 'Numbers', 'Settings'])
		assert.equal(await visible('#tabs .themeitem'), true)
		await Promise.all([t.page.waitForEvent('load'), t.page.click('#tabs .uisw-menu')])
		await t.page.waitForSelector('#app:not([data-ui=next]) #main :first-child')
		assert.equal(t.store.ui().ui, 'classic')
	} finally { await t.close() }
})

// PM review P0-1: the five-second test runs on one screen. In real windows, the summary line and the first Your move rows are in
// view; at 1280×800 so is Vikram's review (the fixture's 6th), with what happens after the ok.
test('next first screen: at 1280×800 and 400×860 the summary line and the first Your move rows are in the window', { skip }, async () => {
	for (const [width, height, rows] of [[1280, 800, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']], [400, 860, ['A1']]] as const) {
		const t = await open('#now', s => seedNext(s), { viewport: { width, height } })
		try {
			const box = async (sel: string) => JSON.stringify(await t.page.locator(sel).boundingBox())
			const inside = async (sel: string) => { const b = await t.page.locator(sel).boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= height && b.x >= 0 && b.x + b.width <= width }
			// Measured once layout has settled: fonts loaded and two frames drawn (CI 10-21, one macOS run measured too early).
			await t.page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))))
			assert.equal(await t.page.evaluate(() => window.scrollY), 0)
			assert.equal(await inside('#nsum'), true, `${width}: the summary line is in the window: ${await box('#nsum')}`)
			for (const c of rows) assert.equal(await inside(`#now-${c} .nmain`), true, `${width}: ${c} is in the window`)
			if (width === 1280) assert.equal(await inside('#now-A6 .nn'), true, "Vikram's Next line is on the first screen")
		} finally { await t.close() }
	}
})

test('bug 10-21: in the new experience an Ask Delegate answer uses the card width, and its source chip names the PR', { skip }, async () => {
	const t = await open('#now/A1', s => {
		seedNext(s)
		const w = s.byCode('A1')!
		w.notes = [{ q: 'Why no vote?', a: 'Your words were read as a next step, not as an instruction to vote. Your vote is still none.', sources: [{ ref: 'https://dev.azure.com/acme/Globex/_git/web/pullrequest/4200001', tier: 'live', origin: 'extracted' }], at: new Date().toISOString() }]
		s.save(w)
		return s
	})
	try {
		await t.page.waitForSelector('#card-A1 .na .nb p')
		const [answer, list] = await t.page.evaluate(() => [document.querySelector('#card-A1 .na .nb')!.getBoundingClientRect().width, document.querySelector('#card-A1 .na')!.closest('ul,ol')!.getBoundingClientRect().width])
		assert.ok(answer > list * 0.6, `the answer is ${answer}px of a ${list}px list`)
		assert.equal(await t.page.locator('#card-A1 .na .bot').isVisible(), true, 'with its Delegate mark')
		assert.equal(await t.page.locator('#card-A1 .na .nsrc a').innerText(), 'PR 4200001')
	} finally { await t.close() }
})

// Slice 3: the owner's own words promised a vote. Both experiences show what they said, the vote and what it means, and one
// button that sends ok; a failed check offers Check again, which the runner applies.
test('slice 3 own words: the promise shows in both experiences with one button that sends ok', { skip }, async () => {
	for (const ui of ['new', 'classic'] as const) {
		const t = await open(ui === 'new' ? '#now' : '#focus', s => seedPromise(s, ui))
		try {
			if (ui === 'new') {
				await t.page.waitForSelector('#now-A60')
				const a60 = await t.page.textContent('#now-A60')
				for (const want of ["You said you'd approve PR 4200001", 'You said', "Looks good, I'll approve the PR.", 'PR:', 'Fix the banner on small screens', 'autocomplete is on: your approval may complete it']) assert.ok(a60.includes(want), `${want} in: ${a60}`)
				assert.match(await t.page.textContent('#now-A61'), /Couldn't check what you told Rita: check again[\s\S]*Why:\s*The AI run stopped after 5 minutes/)
				await t.page.click('#now-A60 .nract button.primary')
				await until(() => t.posted.includes('ok A60'))
				await t.page.click('#now-A61 .nract button.primary')
				await until(() => t.posted.includes('ok A61'))
			} else {
				await t.page.waitForSelector('#card-A60')
				const c60 = await t.page.textContent('#card-A60')
				for (const want of ['You said:', "Looks good, I'll approve the PR.", 'Approve PR 4200001', 'autocomplete is on: your approval may complete it']) assert.ok(c60.includes(want), `${want} in: ${c60}`)
				assert.equal((await t.page.textContent('#pri-A60')).trim(), 'Approve PR 4200001')
				await t.page.click('#pri-A60')
				await until(() => t.posted.includes('ok A60'))
				await t.page.evaluate(() => { location.hash = '#focus/A61' })
				await t.page.waitForSelector('#card-A61')
				assert.match(await t.page.textContent('#card-A61'), /Could not check what your reply promised: The AI run stopped after 5 minutes/)
				assert.equal((await t.page.textContent('#pri-A61')).trim(), 'Check again')
				await t.page.click('#pri-A61')
				await until(() => t.posted.includes('ok A61'))
			}
			await until(() => t.store.byCode('A61')!.promise?.state === 'pending', 8000)
			assert.equal(t.store.byCode('A61')!.state, 'done', `${ui}: Check again queues the check, and nothing is made`)
		} finally { await t.close() }
	}
})

test('owner 10-21: a short reply opens instead of sending; after Send in the card, Undo is on Now for a reply you approved', { skip }, async () => {
	const t = await open('#now')
	try {
		const row = t.page.locator('#now-A20 .nract a, #now-A20 .nract button').first()
		assert.equal(await row.innerText(), 'Open', 'the row opens; it never sends')
		await row.click()
		await t.page.waitForSelector('#pri-A20')
		assert.deepEqual(t.posted, [], 'opening sends nothing')
		await t.page.click('#pri-A20')
		await until(() => !!t.store.byCode('A20')!.sent)
		await t.page.waitForFunction(() => [...document.querySelectorAll('.nundo')].some(e => /^Sent to /.test((e as HTMLElement).innerText)))
		const strip = t.page.locator('.nundo', { hasText: /^Sent to / })
		assert.match((await strip.innerText()).replace(/\s+/g, ' '), /^Sent to \w+: ".+" Undo \d+:\d\d$/)
		await strip.locator('[data-act=undo]').click()
		await until(() => t.posted.includes('undo A20'))
	} finally { await t.close() }
})

test('owner 10-21 A33: after you tell Delegate something, the row\'s result clears once the item changes, and its button is back', { skip }, async () => {
	const t = await open('#now')
	try {
		await t.page.fill('#tell-A23', 'Deleted the message; please send that I approved the PR.')
		await t.page.press('#tell-A23', 'Enter')
		await until(() => t.posted.some(p => p.startsWith('A23: ')))
		await t.page.waitForFunction(() => !!document.querySelector('#now-A23 [role=status]')?.textContent)
		const w = t.store.byCode('A23')!
		t.store.save({ ...w, state: 'needs_human', work: undefined, draft: { text: "I've approved the PR.", commitment: true, sources: [], preview: true }, revAt: new Date(Date.now() + 1000).toISOString() })
		await t.page.waitForFunction(() => /Open/.test(document.querySelector('#now-A23 .nract')?.textContent ?? ''), undefined, { timeout: 6000 })
		assert.equal(await t.page.locator('#now-A23 [role=status]').count(), 0, 'the old result is gone')
	} finally { await t.close() }
})
