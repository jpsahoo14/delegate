import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page, type Request } from 'playwright-core'
import type { Store as StoreType } from '../src/store/state.ts'
import { randomBytes } from 'node:crypto'
import { assertTestSafe } from '../src/store/fs.ts'
import type { Source } from '../src/adapters/source.ts'
import type { Receipt, Snapshot } from '../src/web/react/domain/contracts.ts'
import { ulid } from '../src/core/ids.ts'
import type { BuildProbe } from '../src/runner/probe.ts'
import { freezeClock } from './browser-clock.ts'
import { readLayout } from './browser-layout.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-ui-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { seedNext, seedOwned, seedChanges, seedPromise, seedNumbers, stub, item } = await import('./fixture.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
let browser: Browser
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }) })
after(async () => { await browser?.close() })
async function open({ width = 1280, theme = 'light', run = true, seed = (s: StoreType) => seedOwned(seedChanges(seedNext(s))), probe }: {
	width?: number; theme?: 'light' | 'dark'; run?: boolean; seed?: (s: StoreType) => StoreType; probe?: BuildProbe
} = {}) {
	const store = seed(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-ui-')), machine: 'test' }))
	store.saveUi('react')
	const previewRoot = process.env.DELEGATE_PREVIEW_BUILD
	if (previewRoot) assertTestSafe(previewRoot)
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'), probe ? () => probe : undefined, previewRoot)
	const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 800 : 860 }, colorScheme: theme, reducedMotion: 'reduce' })
	if (previewRoot) context.setDefaultTimeout(5000)
	await context.addInitScript(() => { window.DELEGATE_POLL_MS = 80 })
	const page = await context.newPage(), errors: string[] = [], posts: unknown[] = []
	page.on('pageerror', error => errors.push(error.message))
	page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/v1/actions')) posts.push(request.postDataJSON()) })
	let busy = false
	const runner = setInterval(async () => { if (!run || busy) return; busy = true; try { await applyAnswers(store, stub, store.config(), procs as never) } finally { busy = false } }, 40)
	await page.goto(url + '#now')
	await page.getByRole('heading', { name: 'Now', exact: true }).waitFor()
	await page.locator('[data-row-kind]').first().waitFor()
	return { store, page, posts, errors, url, close: async () => {
		clearInterval(runner); await page.unrouteAll({ behavior: 'wait' }); await context.close(); server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		assert.deepEqual(errors, [])
	} }
}
async function openCard(page: Page, code: string) {
	const row = page.locator(`.now-row[data-code="${code}"]`)
	await row.getByRole('button', { name: 'Open', exact: true }).click()
	await row.locator('.item-card').first().waitFor()
	return row
}
async function act(page: Page, item: string, click: () => Promise<unknown>): Promise<Receipt> {
	let id: string | undefined
	const track = (request: Request) => {
		if (request.method() !== 'POST' || !request.url().includes('/api/v1/actions?')) return
		const body = request.postDataJSON()
		if (body.item === item) id ??= body.submissionId
	}

	page.on('request', track)
	try {
		const [response] = await Promise.all([page.waitForResponse(async response => {
			if (!/\/api\/v1\/(?:actions|result)\?/.test(response.url())) return false
			const result = await response.json()
			return !!id && result.submissionId === id && result.item === item && result.applied === true
		}, { timeout: 10_000 }), click()])
		return response.json()
	} finally { page.off('request', track) }
}

test('React G8: both footers match today on the same server and retain tag plus code', async () => {
	const t = await open({ run: false })
	try {
		const dataUrl = new URL(t.url), apiUrl = new URL(t.url)
		dataUrl.pathname = '/data'
		apiUrl.pathname = '/api/v1/page'
		const legacy = await (await t.page.request.get(dataUrl.href)).json()
		const snapshot = await (await t.page.request.get(apiUrl.href)).json()
		assert.deepEqual(snapshot.version, legacy.version)
		const expected = `Version ${legacy.version.tag ? `${legacy.version.tag} (${legacy.version.code})` : legacy.version.code}`
		for (const route of ['now', 'classic/home']) {
			await t.page.goto(t.url + '#' + route)
			await t.page.reload()
			await t.page.locator('footer').getByText(expected, { exact: true }).waitFor()
			await t.page.route('**/api/v1/page?*', async request => {
				const response = await request.fetch({ headers: { ...request.request().headers(), 'if-none-match': '' } })
				const body = await response.json()
				await request.fulfill({ response, json: { ...body, version: { ...body.version, tag: 'v1.2.3' } } })
			})
			await t.page.reload()
			await t.page.locator('footer').getByText(`Version v1.2.3 (${legacy.version.code})`, { exact: true }).waitFor()
			await t.page.unrouteAll({ behavior: 'wait' })
		}
		assert.equal(t.posts.length, 0)
	} finally { await t.close() }
})

test('React G6: Waiting keeps keyboard inspection and local actions without redundant Open', async () => {
	const t = await open()
	try {
		const waiting = t.page.locator('.now-section[aria-labelledby="section-waiting"]')
		assert.equal(await waiting.getByRole('button', { name: 'Open', exact: true }).count(), 0)
		const row = t.page.locator('.now-row[data-code="W2"]'), title = row.locator('.row-title')
		await title.focus()
		await title.press('Enter')
		await row.locator('.item-card').waitFor()
		assert.equal(await title.getAttribute('aria-expanded'), 'true')
		await row.getByRole('button', { name: 'Draft a nudge', exact: true }).waitFor()
		await title.press('Space')
		assert.equal(await title.getAttribute('aria-expanded'), 'false')
		assert.equal(await row.locator('.item-card').count(), 0)
		assert.ok(await t.page.locator('.now-row[data-code="A34"]').getByRole('button', { name: 'Draft a nudge', exact: true }).count())
	} finally { await t.close() }
})

test('React G4: quiet footer retains reminder and report while system tools remain reachable', async () => {
	const t = await open()
	try {
		assert.equal(await t.page.getByRole('heading', { name: 'More you can do' }).count(), 0)
		const footer = t.page.locator('footer')
		await footer.getByRole('button', { name: '+ Remind someone', exact: true }).click()
		await t.page.getByRole('dialog').getByRole('textbox', { name: 'Exact reminder text' }).waitFor()
		await t.page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
		await footer.getByRole('button', { name: 'Report a problem', exact: true }).click()
		await t.page.getByRole('dialog').getByRole('textbox', { name: 'What went wrong?' }).waitFor()
		await t.page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
		assert.equal(await footer.getByRole('button', { name: 'Pause', exact: true }).count(), 0)
		assert.equal(await footer.getByRole('button', { name: 'Watch something', exact: true }).count(), 0)
		await t.page.evaluate(() => { location.hash = 'settings/system' })
		await t.page.getByRole('heading', { name: 'Reading and watches', exact: true }).waitFor()
		await t.page.getByRole('button', { name: 'Watch something', exact: true }).click()
		await t.page.getByRole('dialog').getByRole('textbox', { name: 'What should I make sure gets done?' }).waitFor()
		await t.page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
		await t.page.getByRole('button', { name: 'Pause', exact: true }).waitFor()
		await t.page.getByText('Watch details', { exact: true }).waitFor()
	} finally { await t.close() }
})

test('React app browser: Now contains every server row, rows never act, and all four screens load in both themes and widths', async () => {
	const shots = mkdtempSync(join(tmpdir(), 'delegate-react-app-shots-'))
	for (const width of [1280, 400]) for (const theme of ['light', 'dark'] as const) {
		const t = await open({ width, theme })
		try {
			assert.ok(await t.page.locator('.now-row').count() > 20)
			assert.equal(await t.page.locator('.row-content button[data-primary]').count(), 0)
			assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
			await t.page.screenshot({ path: join(shots, `now-${width}-${theme}.png`) })
			await openCard(t.page, 'A1')
			await t.page.getByRole('heading', { name: 'Your reply' }).waitFor()
			const navigation = await t.page.locator('[data-code="A1"] .item-navigation').boundingBox(), header = await t.page.locator('.preview-header').boundingBox()
			assert.ok(navigation && header && navigation.y >= header.y + header.height, 'item navigation must not hide under the sticky header')
			await t.page.screenshot({ path: join(shots, `card-${width}-${theme}.png`) })
			for (const [route, heading] of [['done', 'Done'], ['numbers', 'Numbers'], ['settings', 'Settings']]) {
				if (width < 560) await t.page.getByRole('button', { name: 'Menu', exact: true }).click()
				await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: new RegExp(`^${heading}`) }).click()
				await t.page.getByRole('heading', { level: 1, name: heading }).waitFor()
				if (route === 'settings') await t.page.getByRole('heading', { name: 'AI models', exact: true }).waitFor()
				if (route === 'numbers') await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
				if (route === 'numbers') {
					const tops = await t.page.locator('.bar-track').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
					assert.equal(tops.length, 8)
					assert.ok(Math.max(...tops) - Math.min(...tops) < 1, 'all eight bars share the same baseline despite wrapped date labels')
				}
				if (route === 'done') {
					const contrast = await t.page.locator('[data-variant="default"] small').first().evaluate(element => ({ child: getComputedStyle(element).color, parent: getComputedStyle(element.closest('button')!).color }))
					assert.equal(contrast.child, contrast.parent, 'new counts use the selected button foreground')
					assert.equal(await t.page.locator('.code').first().evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap')
				}
				await t.page.screenshot({ path: join(shots, `${route}-${width}-${theme}.png`) })
				assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
			}
			assert.deepEqual(t.posts, [])
		} finally { await t.close() }
	}
	console.log(`React app screenshots: ${shots}`)
})

test('React app browser: a stale click reaches the real gate and keeps the edited words without sending', async () => {
	const t = await open({ run: false })
	try {
		const row = await openCard(t.page, 'A20')
		await row.getByRole('button', { name: 'Edit', exact: true }).click()
		await row.getByRole('textbox', { name: 'Edit your reply' }).fill('Keep my unfinished wording')
		await t.page.route('**/api/v1/actions?*', async route => {
			const workflow = t.store.byCode('A20')!
			workflow.draft!.text = 'A revised reply.'
			t.store.save(workflow)
			await route.continue()
		})
		await row.getByRole('button', { name: 'Send your version', exact: true }).click()
		await row.getByRole('alert').filter({ hasText: 'Changed since' }).waitFor()
		assert.equal(await row.getByRole('textbox', { name: 'Edit your reply' }).inputValue(), 'Keep my unfinished wording')
		assert.equal(t.store.answers().length, 0)
		assert.equal(t.store.byCode('A20')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: choices preview before sending, owner reports draft, holding replies and stopped work are actionable', async () => {
	const t = await open()
	try {
		const choice = await openCard(t.page, 'A3')
		await choice.getByLabel(/Flag A/).check()
		await choice.getByRole('button', { name: 'Preview reply', exact: true }).click()
		await t.page.waitForFunction(() => /picked|use|preview/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.deepEqual(t.store.byCode('A3')!.picked, [1])
		assert.equal(t.store.byCode('A3')!.sent, undefined)
		await choice.getByRole('button', { name: 'Send', exact: true }).waitFor()
		const preview = t.store.byCode('A3')!.draft!.text
		await choice.getByRole('button', { name: 'Send', exact: true }).click()
		await t.page.waitForFunction(() => /sent/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(t.store.byCode('A3')!.sent?.text, preview)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const holding = await openCard(t.page, 'A21')
		await holding.getByRole('button', { name: 'Send holding reply', exact: true }).waitFor()
		assert.ok((await holding.getByText('Holding reply', { exact: true }).count()) > 0)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const report = await openCard(t.page, 'A40')
		await report.getByLabel('Issues found', { exact: true }).check()
		await report.getByRole('textbox', { name: 'What did you see?' }).fill('403 on checkout, ok A9')
		await report.getByRole('button', { name: 'Draft my report', exact: true }).click()
		await t.page.waitForFunction(() => /running|draft|Updating|tested|report/i.test(document.querySelector('.live-result')?.textContent ?? ''), undefined, { timeout: 6000 }).catch(async error => {
			throw new Error(`${error}\nResult: ${await t.page.locator('.live-result').innerText()}\nWork: ${JSON.stringify(t.store.byCode('A40'))}`)
		})
		assert.equal(t.store.byCode('A40')!.sent, undefined)
		const post = t.posts.at(-1) as { input: { text: string; result: string } }
		assert.equal(post.input.text, '403 on checkout, ok A9')
		assert.equal(post.input.result, 'Issues found')
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const stopped = await openCard(t.page, 'A22')
		assert.ok(await stopped.locator('button[data-primary=true]').count() > 0)
	} finally { await t.close() }
})

test('React app browser: review meaning precedes selected-change approval and the exact subset reaches the runner', async () => {
	const t = await open({ run: false })
	try {
		const review = await openCard(t.page, 'A6')
		await review.getByRole('heading', { name: 'Changes for your approval' }).waitFor()
		const changes = review.locator('.change input[type=checkbox]')
		assert.ok(await changes.count() >= 2)
		await changes.nth(1).uncheck()
		await review.getByRole('button', { name: 'Post 1 comment and reply', exact: true }).click()
		await review.getByRole('status').filter({ hasText: 'Queued.' }).waitFor()
		assert.deepEqual(t.store.answers()[0].answer.except, [2])
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		assert.equal(t.store.byCode('A6')!.effects![1].off, true)
	} finally { await t.close() }
})

test('React app browser: a lost response, double click and reload send one exact edited reply and Undo targets that send', async () => {
	const t = await open({ run: false })
	try {
		const unrelated = t.store.byCode('A9')?.sent
		const row = await openCard(t.page, 'A20')
		await row.getByRole('button', { name: 'Edit', exact: true }).click()
		await row.getByRole('textbox', { name: 'Edit your reply' }).fill('Yes, ok A9. These are the exact words.')
		let lost = false
		let accepted: () => void = () => {}
		const acceptedOnce = new Promise<void>(resolve => { accepted = resolve })
		await t.page.route('**/api/v1/result?*', route => route.abort())
		await t.page.route('**/api/v1/actions?*', async route => {
			if (!lost) { lost = true; await route.fetch(); await route.abort(); accepted() } else await route.continue()
		})
		await row.getByRole('button', { name: 'Send your version', exact: true }).dblclick()
		await acceptedOnce
		assert.equal(t.posts.length, 1)
		assert.equal(await t.page.evaluate(() => JSON.parse(sessionStorage.getItem('delegate-react-pending-v1') ?? '[]').length), 1, 'reload happens while the result is still unknown')
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		const answerId = t.store.pageSubmission((t.posts[0] as { submissionId: string }).submissionId)!.ids[0]
		for (let index = 0; index < 200; index++) t.store.addOutcome(`other-action-${index}`, 'Other activity')
		assert.equal(t.store.outcome(answerId), undefined, 'the bounded runner outcome log has already rotated')
		await t.page.reload()
		await t.page.getByRole('heading', { name: 'Now', exact: true }).waitFor()
		assert.equal(await t.page.evaluate(() => JSON.parse(sessionStorage.getItem('delegate-react-pending-v1') ?? '[]').length), 1, 'the result must still be unknown after reload')
		await t.page.unroute('**/api/v1/result?*')
		await t.page.waitForFunction(() => {
			const result = document.querySelector('.live-result')
			return result?.getAttribute('role') === 'status' && /\bsent\b/i.test(result.textContent ?? '')
		}).catch(async error => { throw new Error(`Saved result: ${JSON.stringify(t.store.pageSubmission((t.posts[0] as { submissionId: string }).submissionId))}; visible: ${JSON.stringify(t.page.isClosed() ? '' : await t.page.locator('.live-result').textContent())}`, { cause: error }) })
		assert.equal(t.store.byCode('A20')!.sent?.text, 'Yes, ok A9. These are the exact words.')
		assert.deepEqual(t.store.byCode('A9')?.sent, unrelated)
		assert.equal(t.posts.length, 1)
		const undo = t.page.getByRole('region', { name: 'Replies you can undo' }).locator('[data-code="A20"]').getByRole('button', { name: 'Undo', exact: true })
		const undoQueued = t.page.waitForResponse(response => response.url().includes('/api/v1/actions?'))
		await undo.click()
		await undoQueued
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		await t.page.waitForFunction(() => /back|deleted|taken back|undone/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(t.store.byCode('A20')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: refresh preserves focus, text, selection, composition and folds; stale approval refuses', async () => {
	const t = await open()
	try {
		const row = await openCard(t.page, 'A1')
		await row.getByText(/^Why -/).click()
		await row.getByRole('button', { name: 'Edit', exact: true }).click()
		const field = row.getByRole('textbox', { name: 'Edit your reply' })
		await field.fill('An unfinished answer')
		await field.evaluate((element: HTMLTextAreaElement) => { element.setSelectionRange(3, 9); element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'x' })) })
		const wf = t.store.byCode('A1')!
		wf.draft!.text = 'A completely new draft.'
		wf.revAt = new Date().toISOString()
		t.store.save(wf)
		await row.getByRole('button', { name: 'Show new version' }).waitFor()
		assert.equal(await field.inputValue(), 'An unfinished answer')
		assert.equal(await field.evaluate(element => document.activeElement === element), true)
		assert.deepEqual(await field.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]), [3, 9])
		assert.equal(await row.locator('details').filter({ hasText: 'Why -' }).getAttribute('open'), '')
		await field.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'x' })))
		assert.equal(await row.getByRole('button', { name: 'Send your version' }).isDisabled(), true)
		t.page.once('dialog', dialog => dialog.accept())
		await row.getByRole('button', { name: 'Show new version' }).click()
		await row.getByText('A completely new draft.', { exact: true }).waitFor()
		assert.equal(await row.getByRole('textbox', { name: 'Edit your reply' }).count(), 0)
	} finally { await t.close() }
})

test('React app browser: crosscheck headlines are buttons-only, ask times come from messages, and separate approvals remain visible', async () => {
	const askAt = new Date(Date.now() - 15 * 60_000).toISOString()
	const t = await open({ seed: store => {
		seedNext(store)
		const workflow = store.byCode('A2')!
		workflow.question = 'Answer A2 to retry with directions, or skip it.'
		workflow.lastAsk = 'Please review PR 2204.'
		store.save(workflow, false)
		store.saveThread(workflow.id, [{ id: workflow.lastMsgId, from: { id: 'kim', name: 'Kim' }, text: workflow.lastAsk, at: askAt, byOwner: false }])
		item(store, 'A600', 'Kim Lane', 'Spec review', { lastAsk: 'The comments on PR 3305 are addressed. Please approve it.', draft: { text: 'I will review PR 3305 now.', sources: [], commitment: false } })
		return store
	} })
	try {
		const row = t.page.locator('.now-row[data-code="A2"]')
		assert.doesNotMatch(await row.locator('.row-title').innerText(), /\b(?:answer|skip|edit|ok)\s+A\d+/i)
		assert.equal(await row.locator('time').first().getAttribute('datetime'), askAt)
		const { nextView } = await import('../src/web/next.ts'), { pageText } = await import('../src/web/page-text.ts')
		assert.equal(await row.locator('.row-title').innerText(), pageText(nextView(t.store).move.find(row => row.code === 'A2')!.headline) || 'Review this item')
		await t.page.locator('.now-row[data-code="A600"]').waitFor()
		assert.match(await t.page.locator('.now-row[data-code="A600"]').innerText(), /3305/)
	} finally { await t.close() }
})

test('React app browser: 500-row redraw with every headline changed remains below one frame', async () => {
	const t = await open({ seed: store => {
		seedNext(store)
		for (const workflow of store.workflows()) { workflow.state = 'done'; workflow.fyi = undefined; workflow.kept = []; store.save(workflow, false) }
		for (let n = 0; n < 500; n++) item(store, `A${1000 + n}`, 'Kim Lane', 'Acme reviews', { lastAsk: `Please check review ${n}.`, draft: { text: 'I will check the review.', commitment: false, sources: [] } })
		return store
	} })
	try {
		await t.page.waitForFunction(() => document.querySelectorAll('.now-row').length >= 500)
		let revision = 0
		await t.page.route('**/api/v1/page?*', async route => {
			const response = await route.fetch({ headers: { ...route.request().headers(), 'if-none-match': '' } }), snapshot = await response.json() as Snapshot
			const suffix = ++revision % 2 ? 'Updated' : 'Checked'
			for (const placement of Object.values(snapshot.entities.placements)) if (Number(placement.code.slice(1)) >= 1000) placement.headline += ` - ${suffix}`
			await route.fulfill({ response, json: snapshot })
		})
		await t.page.evaluate(() => performance.clearMeasures('delegate-react-redraw'))
		await t.page.waitForFunction(() => performance.getEntriesByName('delegate-react-redraw').length >= 15, undefined, { timeout: 60_000 })
		const times = await t.page.evaluate(() => performance.getEntriesByName('delegate-react-redraw').map(entry => entry.duration).sort((a, b) => a - b))
		const median = times[Math.floor(times.length / 2)]
		console.log(`500 changed-row redraw: median ${median.toFixed(2)} ms; p95 ${times[Math.floor(times.length * .95)].toFixed(2)} ms; ${times.length} samples. Every headline changes. Includes normalized-index reconciliation and React commit, excludes network and paint.`)
		const response = await t.page.request.get(new URL('/api/v1/page?t=' + new URL(t.url).searchParams.get('t'), t.url).href)
		console.log(`500-row server ${response.headers()['server-timing']}; JSON payload ${(await response.body()).length} bytes (uncompressed).`)
		assert.ok(times.at(-1)! < 16, `500 changed-row redraw reached ${times.at(-1)!.toFixed(2)} ms, exceeding 16 ms`)
	} finally { await t.close() }
})

test('React app browser: every setting is editable, invalid values stay unsaved and AI models are visible', async () => {
	const t = await open()
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Settings', exact: true }).click()
		await t.page.getByRole('heading', { name: 'AI models', exact: true }).waitFor()
		const row = t.page.locator('#setting-dailyRuns')
		await row.locator('input').fill('not a number')
		await row.getByRole('button', { name: 'Save', exact: true }).click()
		await row.getByRole('alert').waitFor()
		assert.notEqual(t.store.config().dailyRuns, 'not a number')
		await row.locator('input').fill('150')
		await row.getByRole('button', { name: 'Save', exact: true }).click()
		await row.getByRole('status').filter({ hasText: /saved|150/i }).waitFor()
		assert.equal(t.store.config().dailyRuns, 150)
		assert.equal(await row.locator('input').inputValue(), '150')
	} finally { await t.close() }
})

test('React app browser: Numbers opens the exact counted records and copies only its displayed anonymous summary', async () => {
	const t = await open({ seed: store => seedNumbers(seedNext(store), new Date()) })
	try {
		await t.page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Numbers', exact: true }).click()
		await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
		const response = await t.page.request.get(new URL('/api/v1/numbers?window=this&t=' + new URL(t.url).searchParams.get('t'), t.url).href)
		const expected = await response.json() as { model: { summary: string; handled: { main: { text: string } } }; lists: { handled: { groups: { codes: string[] }[] } } }
		await t.page.locator('.number-card').first().getByRole('button', { name: expected.model.handled.main.text, exact: true }).click()
		await t.page.locator('[data-number-code]').first().waitFor()
		assert.deepEqual(await t.page.locator('[data-number-code]').evaluateAll(elements => elements.map(element => element.getAttribute('data-number-code'))), expected.lists.handled.groups.flatMap(group => group.codes))
		await t.page.getByRole('button', { name: 'Back to Numbers', exact: true }).click()
		await t.page.getByRole('button', { name: 'Copy a summary', exact: true }).click()
		await t.page.getByRole('status').filter({ hasText: 'Numbers-only summary copied.' }).waitFor()
		const copied = await t.page.evaluate(() => navigator.clipboard.readText())
		assert.equal(copied, expected.model.summary)
		assert.doesNotMatch(copied, /Kim|Rita|Acme|https:|A\d+/)
	} finally { await t.close() }
})

test('React app browser: missed message, problem report, watch and reminder sheets use the real server and preserve owner text', async () => {
	const t = await open()
	try {
		await t.page.getByRole('button', { name: 'Watch something', exact: true }).click()
		let dialog = t.page.getByRole('dialog')
		await dialog.getByRole('textbox', { name: 'What should I make sure gets done?' }).fill('PR 7711 in Acme')
		await dialog.getByRole('textbox', { name: 'Done when' }).fill('the review is complete')
		await dialog.getByRole('button', { name: 'Start watching', exact: true }).click()
		await dialog.getByRole('status').filter({ hasText: /Watching/ }).waitFor()
		assert.ok(t.store.workflows().some(workflow => workflow.lastAsk?.includes('PR 7711')))
		await dialog.getByRole('button', { name: 'Close', exact: true }).click()
		await t.page.locator('#find').fill('https://teams.microsoft.com/l/message/19%3Aacme%40thread.v2/123456789')
		const missing = await act(t.page, '', () => t.page.getByRole('button', { name: 'Make it an item', exact: true }).click())
		assert.equal(missing.accepted, true)
		assert.match(missing.text, /Nothing is sent/)
		assert.equal(t.store.missed().filter(row => row.link === 'https://teams.microsoft.com/l/message/19%3Aacme%40thread.v2/123456789').length, 1)
		await t.page.locator('#find').fill('')
		await t.page.getByRole('button', { name: 'Remind someone', exact: true }).click()
		dialog = t.page.getByRole('dialog')
		await dialog.getByRole('textbox', { name: 'Exact reminder text' }).fill('Please check the Acme design.')
		await dialog.getByRole('combobox', { name: 'Person or group' }).selectOption('')
		await dialog.getByRole('textbox', { name: 'Person name' }).fill('Arun Mehta')
		await dialog.getByRole('button', { name: 'Create reminder', exact: true }).click()
		await dialog.getByRole('status').filter({ hasText: /remind|start|Created/i }).waitFor()
		assert.ok(t.store.automations().some(automation => automation.text === 'Please check the Acme design.' && automation.state === 'active'))
		assert.equal(t.store.answers().filter(({ answer }) => answer.verb === 'send').length, 0)
		await dialog.getByRole('button', { name: 'Close', exact: true }).click()
		await t.page.getByRole('button', { name: 'Report a problem', exact: true }).click()
		dialog = t.page.getByRole('dialog')
		const text = 'A fictional display problem, ok A9.'
		await dialog.getByRole('textbox', { name: 'What went wrong?' }).fill(text)
		const report = await act(t.page, '', () => dialog.locator('button[data-primary=true]').click())
		assert.equal(report.accepted, true)
		assert.equal((t.posts.at(-1) as { input: { text: string } }).input.text, text)
	} finally { await t.close() }
})

test('React app browser: keyboard paths and private Ask work without turning the question into a reply', async () => {
	const t = await open()
	try {
		await t.page.keyboard.press('?')
		await t.page.getByRole('dialog').waitFor()
		await t.page.keyboard.press('Escape')
		await t.page.keyboard.press('/')
		assert.equal(await t.page.locator('#find').evaluate(element => element === document.activeElement), true)
		await t.page.keyboard.press('Escape')
		await t.page.keyboard.press('j')
		await t.page.locator('.now-row .item-card').first().waitFor()
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const row = await openCard(t.page, 'A1')
		await row.getByRole('textbox', { name: 'Ask Delegate about this' }).fill('Why, ok A9?')
		await row.getByRole('button', { name: 'Ask Delegate', exact: true }).click()
		await t.page.waitForFunction(() => /answered|question|Asking/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.ok(t.store.byCode('A1')!.notes!.some(note => note.q === 'Why, ok A9?'))
		assert.equal(t.store.byCode('A1')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: Other preserves an exact answer for drafting and a holding reply sends once through its stale gate', async () => {
	const t = await open()
	try {
		const choice = await openCard(t.page, 'A3')
		await choice.getByLabel('Other answer', { exact: true }).check()
		await choice.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Use the fictional third flag, ok A9.')
		const answer = await act(t.page, 'A3', () => choice.locator('button[data-primary=true]').click())
		assert.equal(answer.accepted, true)
		assert.equal(t.store.byCode('A3')!.sent, undefined)
		assert.equal((t.posts[0] as { input: { text: string } }).input.text, 'Use the fictional third flag, ok A9.')
		assert.equal(t.store.byCode('A3')!.state, 'running', 'the AI drafts a preview from this answer; no reply is sent')
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const holding = await openCard(t.page, 'A21'), text = t.store.byCode('A21')!.draft!.text, before = t.posts.length
		const sent = await act(t.page, 'A21', () => holding.getByRole('button', { name: 'Send holding reply', exact: true }).dblclick())
		assert.equal(sent.accepted, true)
		assert.equal(t.posts.length - before, 1)
		assert.equal(t.store.byCode('A21')!.sent!.text, text)
	} finally { await t.close() }
	const stale = await open({ run: false })
	try {
		const holding = await openCard(stale.page, 'A21')
		await stale.page.route('**/api/v1/actions?*', async route => {
			const workflow = stale.store.byCode('A21')!
			workflow.draft!.text = 'A different holding reply'
			stale.store.save(workflow, false)
			await route.continue()
		})
		const refused = await act(stale.page, 'A21', () => holding.getByRole('button', { name: 'Send holding reply', exact: true }).click())
		assert.equal(refused.accepted, false)
		assert.equal(stale.store.byCode('A21')!.sent, undefined)
		assert.deepEqual(stale.store.answers(), [])
	} finally { await stale.close() }
})

test('React app browser: fact Edit and Skip apply, and later fact typing remains pinned after a save', async () => {
	const { propose, knowledgeOf } = await import('../src/runner/proposals.ts')
	const t = await open({ run: false, seed: store => {
		seedNext(store)
		store.saveConfig({ ...store.config(), reviewLearning: true })
		for (const topic of ['Fictional editable fact', 'Fictional skipped fact']) propose(store, knowledgeOf(store, store.config()), [
			{ topic, type: 'decision', text: `${topic} is about the Acme release.`, src: [{ link: 'https://example.com/fictional-release', date: '2026-10-22', who: 'Kim' }] },
		], 'bootstrap', 'fictional source')
		return store
	} })
	try {
		await t.page.getByRole('link', { name: /facts? to check/ }).click()
		const proposal = t.store.proposals().find(row => row.title === 'Fictional editable fact')!
		assert.ok(proposal)
		const card = t.page.locator('article').filter({ has: t.page.getByRole('heading', { name: proposal.title, exact: true }) })
		await card.getByRole('button', { name: 'Edit', exact: true }).click()
		const field = card.getByRole('textbox', { name: 'Edit this fact' })
		await field.fill('The fictional release is Friday, ok A9.')
		const queued = t.page.waitForResponse(response => response.url().includes('/api/v1/actions?'))
		await card.getByRole('button', { name: 'Save your version', exact: true }).click()
		await queued
		await field.fill('A second fact edit not submitted')
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		await card.getByText('Newer version available.', { exact: false }).waitFor()
		assert.equal(await field.inputValue(), 'A second fact edit not submitted')
		assert.equal(t.store.proposal(proposal.code)!.state, 'applied')
		assert.equal(t.store.proposal(proposal.code)!.ops[0].entry.text, 'The fictional release is Friday, ok A9.')
		assert.equal(t.store.byCode('A9')!.sent!.msgId, 'x9')
		const skipped = t.store.proposals().find(row => row.code !== proposal.code && row.state === 'needs_human')!
		assert.ok(skipped)
		const second = t.page.locator('article').filter({ has: t.page.getByRole('heading', { name: skipped.title, exact: true }) })
		const skipping = t.page.waitForResponse(response => response.url().includes('/api/v1/actions?'))
		const done = act(t.page, skipped.code, () => second.getByRole('button', { name: 'Skip', exact: true }).click())
		await skipping
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		assert.equal((await done).accepted, true)
		assert.equal(t.store.proposal(skipped.code)!.state, 'dropped')
		assert.equal(await field.inputValue(), 'A second fact edit not submitted')
	} finally { await t.close() }
})

test('React app browser: every editable Settings key saves through its actual control and checked pipeline boundary', async () => {
	const checked: string[] = []
	const t = await open({ seed: store => {
		seedOwned(seedChanges(seedNext(store)))
		const config = store.config()
		store.saveConfig({ ...config, agent: { ...config.agent, mcpServers: { ado: { command: 'fictional-never-started', args: [] } } } })
		return store
	}, probe: { builds: async () => new Map(), definition: async (project, id) => { checked.push(`${project}/${id}`); return { name: 'Fictional TEST3' } } } })
	try {
		const response = await t.page.request.get(new URL('/api/v1/settings' + new URL(t.url).search, t.url).href)
		const data = await response.json() as { rows: { key: string; kind: string; options?: { value: string }[] }[] }
		const values: Record<string, string> = { profile: 'Robin works on the fictional Acme release.', aliases: 'Robin, RP', knowledge: '.', repos: 'Acme-Web https://github.com/acme-fictional/web.git',
			deployTo: 'TEST3 Acme/3003', summaryAt: '17:45', signature: 'Responded via AI for {first}', quiet: '21:00-07:00', tz: 'Etc/UTC', model: 'fictional-test-model' }
		for (const setting of data.rows) {
			await t.page.evaluate(key => { location.hash = `settings/${key}` }, setting.key)
			const row = t.page.locator(`[id="setting-${setting.key}"]`)
			await row.waitFor({ state: 'visible' })
			const control = row.locator('input,textarea,select').first()
			const saved = t.page.waitForResponse(response => /\/settings\?/.test(response.url()) && response.request().method() === 'POST')
			let next: string | undefined
			if (setting.kind === 'switch') await row.getByRole('switch').click()
			else {
				const current = await control.inputValue()
				next = setting.options?.find(option => option.value !== current)?.value ??
					(setting.kind === 'bool' ? current === 'true' ? 'false' : 'true' : setting.kind === 'number' ? String(Number(current) + 1) : values[setting.key])
				assert.notEqual(next, undefined, `new setting ${setting.key} requires a valid fixture value`)
				if (setting.kind === 'bool' || setting.options) await control.selectOption(next!)
				else await control.fill(next!)
				await row.getByRole('button', { name: 'Save', exact: true }).click()
			}
			const result = await (await saved).json()
			assert.equal(result.ok, true, `${setting.key}: ${result.text}`)
			await row.getByRole('status').waitFor()
			if (next !== undefined) assert.equal((await control.inputValue()).trim(), next.trim(), setting.key)
		}
		assert.deepEqual(checked, ['Acme/3003'])
		assert.equal(t.store.byCode('A1')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: a recovered command-only receipt shows factual item status instead of a blank success', async () => {
	const t = await open()
	try {
		const id = crypto.randomUUID(), rev = 'saved-revision'
		t.store.savePageSubmission({ id, answerId: ulid(), fingerprint: 'fixture', item: 'A1', rev, at: new Date().toISOString(), phase: 'queued',
			accepted: true, ids: [], text: 'Answer A1 to retry.', processed: true, status: 200 })
		await t.page.evaluate(({ id, rev }) => sessionStorage.setItem('delegate-react-pending-v1', JSON.stringify([{ submissionId: id, item: 'A1', rev, action: 'A1/answer', at: Date.now() }])), { id, rev })
		await t.page.reload()
		await t.page.locator('.live-result').filter({ hasText: 'Current item:' }).waitFor()
		assert.doesNotMatch(await t.page.locator('.live-result').innerText(), /Answer A1/)
		assert.equal(t.store.byCode('A1')!.sent, undefined)
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React app browser: every actionable non-reply row posts its offered typed action and is applied', async () => {
	for (const [code, label, input] of [
		['A22', 'Try again', undefined], ['A26', 'Do it now', undefined], ['A34', 'Draft a nudge', undefined],
		['A37', 'Track this', undefined], ['W2', 'Draft a nudge', undefined],
		['A42', 'Mark done', undefined], ['A23', 'Tell Delegate', 'I tested the page.'],
	] as const) {
		const t = await open()
		try {
			const row = await openCard(t.page, code)
			const primary = row.locator('button[data-primary=true]').first()
			if (input) {
				const answer = row.locator('textarea[data-field=answer]')
				if (await answer.count()) await answer.fill(input)
			}
			const action = await primary.getAttribute('data-action-kind')
			assert.ok(action, `${code}: ${label}`)
			const applied = t.page.waitForResponse(async response => {
				if (!/\/api\/v1\/(?:actions|result)\?/.test(response.url())) return false
				const result = await response.json()
				return result.item === code && result.applied === true
			})
			await primary.click()
			const result = await (await applied).json()
			assert.equal(result.accepted, true, code)
			assert.ok(result.text?.trim(), `${code}: completed receipt has no visible detail: ${JSON.stringify(result)}`)
			await t.page.locator('.live-result').filter({ hasText: result.text }).waitFor({ timeout: 8000 }).catch(async error => {
				throw new Error(`${code}: ${error}\nSaved: ${JSON.stringify(t.store.pageSubmission((t.posts[0] as { submissionId: string }).submissionId))}\nVisible: ${await t.page.locator('.live-result').textContent()}\nPosts: ${JSON.stringify(t.posts)}`)
			})
			assert.equal(t.posts.length, 1, code)
			assert.equal((t.posts[0] as { item: string }).item, code)
			assert.equal(t.store.answers().length, 0)
		} finally { await t.close() }
	}
})

test('React app browser: multi-choice and meeting selections only create previews; sources stay private and notes never approve another item', async () => {
	const t = await open()
	try {
		const multi = await openCard(t.page, 'A4')
		await multi.getByLabel(/Search/).check()
		await multi.getByLabel(/Export/).check()
		await multi.getByRole('button', { name: 'Preview reply', exact: true }).click()
		await t.page.waitForFunction(() => /choice|draft|Rewrite|current item/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.deepEqual(t.store.byCode('A4')!.picked, [1, 3])
		assert.equal(t.store.byCode('A4')!.sent, undefined)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const meeting = await openCard(t.page, 'A5')
		const choice = meeting.locator('fieldset input[type=radio]').first()
		await choice.check()
		await meeting.getByRole('button', { name: 'Preview reply', exact: true }).click()
		await t.page.waitForFunction(() => /choice|preview|picked|use/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(t.store.byCode('A5')!.sent, undefined)
		assert.equal(t.store.byCode('A5')!.draft?.preview, true)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const card = await openCard(t.page, 'A1')
		await card.getByText(/^Why -/).click()
		await card.getByText('Private - not visible to the recipient:', { exact: false }).waitFor()
		await card.getByRole('button', { name: 'Use this in the reply', exact: true }).click()
		await t.page.waitForFunction(() => /draft|Current item|redraft/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(t.store.byCode('A1')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: version switching asks before discarding a sheet edit and Cancel keeps its exact text', async () => {
	const t = await open()
	try {
		await t.page.getByRole('button', { name: 'Watch something', exact: true }).click()
		const dialog = t.page.getByRole('dialog')
		await dialog.getByRole('textbox', { name: 'What should I make sure gets done?' }).fill('An unfinished watch')
		await dialog.getByRole('button', { name: 'Close', exact: true }).click()
		t.page.once('dialog', prompt => prompt.dismiss())
		await t.page.getByRole('combobox', { name: 'App version' }).selectOption('new')
		assert.equal(await t.page.getByRole('combobox', { name: 'App version' }).inputValue(), 'react')
		assert.equal(t.store.ui().ui, 'react')
		await t.page.getByRole('button', { name: 'Watch something', exact: true }).click()
		assert.equal(await t.page.getByRole('dialog').getByRole('textbox', { name: 'What should I make sure gets done?' }).inputValue(), 'An unfinished watch')
	} finally { await t.close() }
})

test('React app browser: facts can be selected, saved and undone from Done without changing unselected facts', async () => {
	const t = await open()
	try {
		await t.page.getByRole('link', { name: /facts? to check/ }).click()
		await t.page.getByRole('heading', { name: 'Facts to check', exact: true }).waitFor()
		const proposal = t.store.proposals().find(proposal => proposal.state === 'needs_human')!
		const card = t.page.locator('.item-card').filter({ has: t.page.getByRole('heading', { name: proposal.title, exact: true }) }).first()
		const checks = card.locator('input[type=checkbox]')
		if (await checks.count() > 1) await checks.last().uncheck()
		const before = proposal.ops.length
		await card.getByRole('button', { name: new RegExp(`^Save ${before > 1 ? before - 1 : before} facts?$`) }).click()
		await t.page.waitForFunction(() => /Saved|saved/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(t.store.proposal(proposal.code)!.state, 'applied')
		assert.equal(t.store.proposal(proposal.code)!.ops.length, before > 1 ? before - 1 : before)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		await t.page.getByRole('button', { name: 'Learned', exact: true }).click()
		const undo = t.page.getByRole('button', { name: 'Undo learned facts', exact: true }).first()
		await undo.click()
		await t.page.waitForFunction(() => /undone|took back|taken back|restored|removed|Undo/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.notEqual(t.store.proposal(proposal.code)!.state, 'applied')
	} finally { await t.close() }
})

test('React app browser: text typed after submission remains visible even when the item moves to Done', async () => {
	const t = await open({ run: false })
	try {
		const row = await openCard(t.page, 'A20')
		await row.getByRole('button', { name: 'Edit', exact: true }).click()
		const field = row.getByRole('textbox', { name: 'Edit your reply' })
		await field.fill('The approved words.')
		await row.getByRole('button', { name: 'Send your version', exact: true }).click()
		await row.getByRole('status').filter({ hasText: 'Queued.' }).waitFor()
		await field.fill('A different unfinished thought')
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		await t.page.waitForFunction(() => /sent/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(t.store.byCode('A20')!.sent?.text, 'The approved words.')
		assert.equal(await field.inputValue(), 'A different unfinished thought')
		assert.equal(await row.getByRole('button', { name: 'Show new version' }).count(), 1)
	} finally { await t.close() }
})

test('React app browser: a settings save cannot erase text typed while the request is pending', async () => {
	const t = await open()
	let release: (() => void) | undefined
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Settings', exact: true }).click()
		const row = t.page.locator('#setting-dailyRuns')
		await row.locator('input').fill('140')
		let reached: () => void = () => {}
		const sent = new Promise<void>(resolve => { reached = resolve })
		await t.page.route('**/settings?*', async route => {
			if (route.request().method() !== 'POST') { await route.continue(); return }
			const response = await route.fetch()
			reached()
			await new Promise<void>(resolve => { release = resolve })
			await route.fulfill({ response })
		})

		await row.getByRole('button', { name: 'Save', exact: true }).click()
		await sent
		await row.locator('input').fill('175')
		release!()
		await row.getByRole('status').filter({ hasText: /Saved|140/i }).waitFor()
		assert.equal(t.store.config().dailyRuns, 140)
		assert.equal(await row.locator('input').inputValue(), '175')
		assert.equal(await row.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true)
	} finally { release?.(); await t.close() }
})

test('React app browser: a pending answer preserves any newer answer text until the owner chooses the new version', async () => {
	const t = await open({ run: false })
	try {
		const row = await openCard(t.page, 'A2')
		const answer = row.getByRole('textbox', { name: 'Your answer', exact: true })
		await answer.fill('Friday works.')
		await row.getByRole('button', { name: 'Draft reply', exact: true }).click()
		await row.getByRole('status').filter({ hasText: 'Queued.' }).waitFor()
		await answer.fill('Another detail I have not sent')
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		await row.getByRole('button', { name: 'Show new version', exact: true }).waitFor()
		assert.equal(await answer.inputValue(), 'Another detail I have not sent')
		assert.equal(t.store.byCode('A2')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: feedback identifies the displayed send and cannot remove a later correction', async () => {
	const t = await open({ run: false })
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		const activity = t.page.locator('[data-activity-code="A9"]').first()
		await activity.getByRole('button', { name: 'Not right?', exact: true }).click()
		await activity.getByLabel('Not needed', { exact: true }).check()
		await activity.getByText(/removes it if its Undo window is still open/).waitFor()
		t.page.once('dialog', dialog => dialog.accept())
		await activity.getByRole('button', { name: 'Save feedback', exact: true }).click()
		await activity.getByRole('status').filter({ hasText: 'Queued.' }).waitFor()
		const workflow = t.store.byCode('A9')!
		workflow.sent!.msgId = 'a-newer-correction'
		t.store.save(workflow, false)
		let deleted = 0
		const source: Source = stub
		await applyAnswers(t.store, { ...source, deleteMessage: async () => { deleted++ } }, t.store.config(), procs as never)
		await t.page.waitForFunction(() => /Nothing was sent, deleted or redrafted/.test(document.querySelector('.live-result')?.textContent ?? ''))
		assert.equal(deleted, 0)
	} finally { await t.close() }
})

test('React app browser: changed Done activity keeps feedback, focus and composition and never deletes the replacement send', async () => {
	const t = await open()
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		const activity = t.page.locator('[data-activity-code="A9"]').first()
		await activity.getByRole('button', { name: 'Not right?', exact: true }).click()
		await activity.getByLabel('Not needed', { exact: true }).check()
		const field = t.page.getByRole('textbox', { name: 'What should change?' })
		await field.fill('Keep this unsent explanation')
		await field.evaluate((element: HTMLTextAreaElement) => { element.setSelectionRange(2, 8); element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) })
		const workflow = t.store.byCode('A9')!
		workflow.sent = { ...workflow.sent!, msgId: 'replacement-send', text: 'A later verified correction', at: new Date().toISOString() }
		t.store.save(workflow, false)
		await t.page.getByText('This activity changed while you were editing. Your text is kept.', { exact: false }).waitFor()
		assert.equal(await field.inputValue(), 'Keep this unsent explanation')
		assert.equal(await field.evaluate(element => document.activeElement === element), true)
		assert.deepEqual(await field.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]), [2, 8])
		assert.equal(await t.page.getByRole('button', { name: 'Save feedback', exact: true }).isDisabled(), true)
		assert.deepEqual(t.posts, [])
		await field.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
		t.page.once('dialog', prompt => prompt.dismiss())
		await t.page.getByRole('combobox', { name: 'App version' }).selectOption('new')
		assert.equal(t.store.ui().ui, 'react')
		assert.equal(await field.inputValue(), 'Keep this unsent explanation')
		assert.equal(t.store.byCode('A9')!.sent!.msgId, 'replacement-send')
	} finally { await t.close() }
})

test('React app browser: changed Catch up keeps an unfinished watch rather than silently replacing it', async () => {
	const t = await open()
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		await t.page.getByRole('button', { name: 'Catch up', exact: true }).click()
		const activity = t.page.locator('[data-activity-code="A30"]').first()
		await activity.getByRole('button', { name: 'Watch', exact: true }).click()
		const field = activity.getByRole('textbox', { name: 'What should get done?' })
		await field.fill('Keep watching this particular release')
		const workflow = t.store.byCode('A30')!
		workflow.fyi = { ...workflow.fyi!, gist: 'A different update arrived.' }
		t.store.save(workflow, false)
		await activity.getByText('This activity changed while you were editing.', { exact: false }).waitFor()
		assert.equal(await field.inputValue(), 'Keep watching this particular release')
		assert.equal(await field.evaluate(element => document.activeElement === element), true)
		assert.equal(await activity.getByRole('button', { name: 'Start watching', exact: true }).isDisabled(), true)
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React app browser: stale reminder recipient metadata refuses before creating any schedule', async () => {
	const t = await open()
	try {
		await t.page.getByRole('button', { name: 'Remind someone', exact: true }).click()
		const dialog = t.page.getByRole('dialog')
		await dialog.getByRole('textbox', { name: 'Exact reminder text' }).fill('A reminder which must not be created.')
		await dialog.getByRole('combobox', { name: 'Person or group' }).selectOption('')
		await dialog.getByRole('textbox', { name: 'Person name' }).fill('Arun Mehta')
		const before = t.store.automations().length
		await t.page.route('**/api/v1/actions?*', async route => {
			item(t.store, 'A777', 'Rita New', 'A new chat', { lastAsk: 'Please check this.', draft: { text: 'I will check.', sources: [], commitment: false } })
			await route.continue()
		})
		await dialog.getByRole('button', { name: 'Create reminder', exact: true }).click()
		await dialog.getByRole('alert').filter({ hasText: 'Changed since' }).first().waitFor()
		assert.equal(t.store.automations().length, before)
		assert.equal(await dialog.getByRole('textbox', { name: 'Exact reminder text' }).inputValue(), 'A reminder which must not be created.')
	} finally { await t.close() }
})

test('React app browser: Auto theme follows system changes, and Numbers keeps its selected window across tabs', async () => {
	const t = await open()
	try {
		await t.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('auto')
		await t.page.emulateMedia({ colorScheme: 'dark' })
		await t.page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
		assert.equal(await t.page.evaluate(() => localStorage.getItem('delegate-theme')), null)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Numbers', exact: true }).click()
		await t.page.getByRole('combobox', { name: 'Time window' }).selectOption('4w')
		await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Numbers', exact: true }).click()
		assert.equal(await t.page.getByRole('combobox', { name: 'Time window' }).inputValue(), '4w')
	} finally { await t.close() }
})

test('React app browser: a grouped thread exposes both independent PR approvals and targets the chosen part', async () => {
	const t = await open({ run: false, seed: store => {
		seedNext(store)
		for (const [code, pr, partOf] of [['A700', 2204, undefined], ['A701', 3305, 'w-A700']] as const) {
			item(store, code, 'Kim Lane', 'Acme reviews', {
				intent: 'pr_review', partOf, lastAsk: `Please approve PR ${pr}.`,
				effects: [{ system: 'ado', action: 'approve', target: `PR ${pr}`, summary: `Approve PR ${pr}`, head: 'c0ffee1',
					call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', pullRequestId: pr, vote: 'Approved' } },
					pr: { title: `Acme change ${pr}`, author: 'Dev Moss', required: ['Reviewers'], autoComplete: false } }],
			})

		}
		return store
	} })
	try {
		const row = await openCard(t.page, 'A700')
		await row.getByRole('button', { name: 'Open item A701', exact: true }).click()
		await row.getByText('Please approve PR 3305.', { exact: true }).waitFor()
		await row.getByText('"Acme change 3305" by Dev Moss', { exact: true }).waitFor()
		assert.equal(await row.getByRole('button', { name: 'Approve PR 3305', exact: true }).count(), 1, await row.locator('.item-card').innerText())
		await row.getByRole('button', { name: 'Approve PR 3305', exact: true }).click()
		await row.getByRole('status').filter({ hasText: 'Queued.' }).waitFor()
		assert.equal(t.store.answers()[0].answer.code, 'A701')
		assert.equal(t.store.answers().some(({ answer }) => answer.code === 'A700'), false)
	} finally { await t.close() }
})

test('React app browser: Catch up can become a bounded watch and a quiet close can be reopened for a draft', async () => {
	const t = await open({ seed: store => {
		seedNext(store)
		item(store, 'A799', 'Kim Lane', 'Acme review', { state: 'done', status: 'Nothing needed: the work was complete', lastAsk: 'Please check the Acme release.', closedBy: 'nothing' })
		return store
	} })
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		await t.page.getByRole('button', { name: 'Catch up', exact: true }).click()
		const activity = t.page.locator('[data-activity-code="A30"]').first()
		await activity.getByRole('button', { name: 'Watch', exact: true }).click()
		await activity.getByRole('button', { name: 'Start watching', exact: true }).click()
		await t.page.waitForFunction(() => /Watching/i.test(document.querySelector('.live-result')?.textContent ?? ''))
		const watchedAs = t.store.byCode('A30')!.watchedAs
		assert.ok(watchedAs)
		assert.ok(t.store.job(t.store.byCode(watchedAs)!.job!)!.endsAt, 'the watch has the existing default end window')
		await t.page.getByRole('button', { name: 'All', exact: true }).click()
		await t.page.getByText(/^Also closed \d+ with nothing to know$/).click()
		const closed = t.page.locator('[data-activity-code="A799"]')
		await closed.locator('.row-title').click()
		await closed.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Please recheck it with the latest information.')
		const applied = t.page.waitForResponse(async response => {
			if (!response.url().includes('/api/v1/result?')) return false
			const result = await response.json()
			return result.item === 'A799' && result.applied === true
		})
		await closed.getByRole('button', { name: 'Reopen and draft reply', exact: true }).click()
		await applied
		assert.notEqual(t.store.byCode('A799')!.state, 'done')
		assert.equal(t.store.byCode('A799')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: editing in the chat copies the visible reply and opens its link without sending', async () => {
	const t = await open()
	try {
		await t.page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
		await t.page.evaluate(() => {
			const state = window as Window & { opened?: string }
			window.open = (url?: string | URL) => { state.opened = String(url); return null }
		})
		const row = await openCard(t.page, 'A1'), expected = t.store.byCode('A1')!.draft!.text
		await row.getByText('More', { exact: true }).click()
		await row.getByRole('button', { name: 'Edit in Teams', exact: true }).click()
		await row.getByRole('status').filter({ hasText: 'Reply copied and chat opened' }).waitFor()
		assert.equal(await t.page.evaluate(() => navigator.clipboard.readText()), expected)
		const opened = await t.page.evaluate(() => (window as Window & { opened?: string }).opened)
		assert.ok(opened)
		assert.match(opened, /^https:\/\/teams\.microsoft\.com\//)
		assert.deepEqual(t.posts, [])
		assert.equal(t.store.byCode('A1')!.sent, undefined)
	} finally { await t.close() }
})

test('React standalone rows: reminder schedules and outgoing asks open without workflow items', async () => {
	const t = await open({ run: false })
	try {
		const automation = t.store.automations().find(row => row.state === 'active')!
		const row = t.page.locator(`.now-row[data-code="${automation.code}"]`)
		await row.locator('.row-title').click()
		const card = row.locator('.item-card')
		await card.getByRole('button', { name: 'Pause', exact: true }).waitFor()
		await card.getByRole('button', { name: 'End', exact: true }).waitFor()
		assert.ok((await card.innerText()).includes(automation.text))
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const waiting = t.page.locator('.now-row[data-code="W2"]')
		await waiting.locator('.row-title').click()
		await waiting.locator('.item-card').getByRole('button', { name: 'Draft a nudge', exact: true }).waitFor()
		assert.equal(t.store.byCode(automation.code), undefined)
		assert.equal(t.store.byCode('W2'), undefined)
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React seen lifecycle: lazy rows dwell before marking and a fast experience toggle cancels the timer', async () => {
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-seen-')), machine: 'test' }))
	store.saveUi('react')
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'))
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	const page = await context.newPage(), seen: string[][] = []
	page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/seen?')) seen.push(request.postDataJSON().filters) })
	await page.route('**/assets/Now-*.js*', async route => {
		const response = await route.fetch()
		await new Promise(resolve => setTimeout(resolve, 300))
		await route.fulfill({ response })
	})
	try {
		await page.goto(url + '#now/A20')
		await page.locator('.now-row[data-code="A20"] .item-card').waitFor()
		await page.getByRole('combobox', { name: 'Experience', exact: true }).selectOption('classic')
		await page.locator('.classic-experience').waitFor()
		await new Promise(resolve => setTimeout(resolve, 1700))
		assert.equal(seen.some(filters => filters.includes('item:A20')), false)
		const marked = page.waitForRequest(request => request.url().includes('/seen?') && request.postDataJSON()?.filters?.includes('item:A20'))
		await page.locator('select[aria-label="Experience"]:visible').selectOption('new')
		await page.locator('.now-row[data-code="A20"]').scrollIntoViewIfNeeded()
		await marked
		assert.ok(store.seen()['item:A20'] || seen.some(filters => filters.includes('item:A20')))
		assert.deepEqual(store.answers(), [])
	} finally {
		await context.close(); server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
	}
})

test('React app browser: a real new draft gains a New marker which stays for the current look', async () => {
	const t = await open()
	try {
		const seen = t.page.waitForResponse(response => response.url().includes('/seen?') && response.request().postDataJSON()?.filters?.includes('item:A20'))
		const row = await openCard(t.page, 'A20')
		await seen
		const workflow = t.store.byCode('A20')!, changedAt = new Date().toISOString()
		workflow.changedAt = changedAt
		workflow.revAt = changedAt
		workflow.draft!.text = 'A newly verified draft.'
		t.store.save(workflow, false)
		await row.locator('.chips').getByText('New', { exact: true }).waitFor()
		t.store.saveSeen(['item:A20'], changedAt)
		await t.page.waitForResponse(response => response.url().includes('/api/v1/page?'))
		assert.equal(await row.locator('.chips').getByText('New', { exact: true }).isVisible(), true)
	} finally { await t.close() }
})

test('React app browser: made and left-out changes remain visible without being offered again', async () => {
	const t = await open({ seed: store => {
		seedOwned(seedChanges(seedNext(store)))
		const workflow = store.byCode('A20')!
		workflow.effects = [{ system: 'ado', action: 'comment', target: 'PR 7711', summary: 'A comment already posted',
			call: { tool: 'ado-repo_pull_request_thread_write', args: { action: 'create', pullRequestId: 7711, content: 'A comment already posted' } },
			done: { at: new Date().toISOString() } }]
		store.save(workflow, false)
		return store
	} })
	try {
		const made = await openCard(t.page, 'A20')
		await made.getByText('Changes already handled', { exact: true }).click()
		await made.getByText(/^Made:.*A comment already posted/).waitFor()
		assert.equal(await made.locator('.change input[type=checkbox]').count(), 0)
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Now/ }).click()
		const omitted = await openCard(t.page, 'A63')
		await omitted.getByText('Changes already handled', { exact: true }).click()
		await omitted.getByText(/^Left out: Approve PR 4200003/).waitFor()
		assert.equal(await omitted.locator('.change').count(), 1)
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React app browser: Numbers fetches on open and window change, not page polls or focus events', async () => {
	const t = await open(), requests: string[] = []
	t.page.on('request', request => { if (request.url().includes('/api/v1/numbers?')) requests.push(request.url()) })
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Numbers', exact: true }).click()
		await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
		assert.equal(requests.length, 1)
		const changed = t.page.waitForResponse(response => response.url().includes('/api/v1/numbers?') && response.url().includes('4w'))
		await t.page.getByRole('combobox', { name: 'Time window' }).selectOption('4w')
		await changed
		await t.page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')) })
		for (let count = 0; count < 6; count++) await t.page.waitForResponse(response => response.url().includes('/api/v1/page?'))
		assert.equal(requests.length, 2)
		assert.equal(await t.page.getByRole('combobox', { name: 'Time window' }).inputValue(), '4w')
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: /^Done/ }).click()
		const reopened = t.page.waitForResponse(response => response.url().includes('/api/v1/numbers?'))
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Numbers', exact: true }).click()
		await reopened
		assert.equal(requests.length, 3)
	} finally { await t.close() }
})

test('React app browser: advanced Settings links open More and failed refresh keeps the same focused edit', async () => {
	const t = await open()
	try {
		const response = await t.page.request.get(new URL('/api/v1/settings' + new URL(t.url).search, t.url).href)
		const data = await response.json() as { rows: { key: string; kind: string; advanced?: boolean }[] }
		const advanced = data.rows.find(row => row.advanced && ['number', 'text', 'list', 'line'].includes(row.kind))
		assert.ok(advanced)
		await t.page.evaluate(key => { location.hash = `settings/${key}` }, advanced.key)
		const row = t.page.locator(`[id="setting-${advanced.key}"]`), field = row.locator('input,textarea')
		await field.waitFor({ state: 'visible' })
		assert.equal(await row.evaluate(element => element.closest('details')?.open), true)
		assert.doesNotMatch(await t.page.locator('main').innerText(), /Say "set up|say "move /i)
		await field.fill('73')
		await t.page.route('**/api/v1/settings?*', route => route.abort())
		await t.page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')) })
		await t.page.getByRole('alert').filter({ hasText: 'Could not refresh Settings' }).waitFor()
		assert.equal(await field.inputValue(), '73')
		assert.equal(await field.evaluate(element => document.activeElement === element), true)
		await t.page.unroute('**/api/v1/settings?*')
		await t.page.getByRole('button', { name: 'Try again', exact: true }).click()
		await t.page.getByRole('alert').filter({ hasText: 'Could not refresh Settings' }).waitFor({ state: 'hidden' })
		assert.equal(await field.inputValue(), '73')
	} finally { await t.close() }
})

test('React app browser: Settings habit and privacy controls apply and refresh without an automatic send', async () => {
	const t = await open({ seed: store => {
		seedNext(store)
		const at = new Date().toISOString()
		store.saveHabits([1, 2, 3].map(n => ({ key: `fictional-habit-${n}`, code: `H${n}`, kind: 'send' as const, state: 'suggested' as const, at,
			text: `Fictional suggestion ${n}`, does: `Simple release updates for Kim, scope ${n}`, evidence: { count: 6, days: 3, total: 6, links: [] },
			rule: { id: `fictional-rule-${n}`, text: `Learned: Simple release updates for Kim, scope ${n}`, who: { accounts: [{ id: 'fictional-kim', name: 'Kim Lane' }] }, when: { chat: 'direct' as const, intent: `release_${n}` }, then: 'send' as const } })))
		store.saveConfig({ ...store.config(), chatLevels: { [store.byCode('A1')!.chat.id]: { level: 'private', name: 'Fictional private room', at } } })
		return store
	} })
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Settings', exact: true }).click()
		await t.page.getByRole('heading', { name: 'Suggestions', exact: true }).waitFor()
		const first = t.page.locator('div').filter({ has: t.page.getByText('Fictional suggestion 1', { exact: false }) }).filter({ has: t.page.getByRole('button', { name: 'Turn on', exact: true }) }).last()
		await first.getByRole('button', { name: 'Turn on', exact: true }).click()
		const rule = t.page.locator('div').filter({ has: t.page.getByText(/^Simple release updates for Kim, scope 1/) }).last()
		await rule.getByText(/Learned .* from 6 unedited replies on 3 days/).waitFor()
		const shots = mkdtempSync(join(tmpdir(), 'delegate-react-settings-proof-'))
		for (const width of [1280, 400]) for (const theme of ['light', 'dark'] as const) {
			await t.page.setViewportSize({ width, height: width === 1280 ? 800 : 860 })
			await t.page.emulateMedia({ colorScheme: theme })
			await rule.scrollIntoViewIfNeeded()
			await t.page.screenshot({ path: join(shots, `learned-${width}-${theme}.png`) })
		}
		console.log(`React Settings evidence screenshots: ${shots}`)
		await t.page.setViewportSize({ width: 1280, height: 800 })
		await rule.getByRole('button', { name: 'Remove', exact: true }).click()
		await t.page.getByText(/^Simple release updates for Kim, scope 1/).waitFor({ state: 'hidden' })
		assert.equal(t.store.habit('H1')!.state, 'declined')
		await t.page.getByRole('button', { name: 'Not now', exact: true }).first().click()
		await t.page.getByText('Fictional suggestion 2', { exact: false }).waitFor({ state: 'hidden' })
		assert.equal(t.store.habit('H2')!.state, 'snoozed')
		await t.page.getByRole('button', { name: 'Never', exact: true }).click()
		await t.page.getByText('Fictional suggestion 3', { exact: false }).waitFor({ state: 'hidden' })
		assert.equal(t.store.habit('H3')!.state, 'declined')
		const chat = t.store.byCode('A1')!.chat.id, before = t.posts.length
		t.page.once('dialog', dialog => dialog.dismiss())
		await t.page.getByRole('button', { name: 'Mark normal again', exact: true }).click()
		assert.equal(t.posts.length, before)
		assert.equal(t.store.config().chatLevels![chat].level, 'private')
		t.page.once('dialog', dialog => dialog.accept())
		await t.page.getByRole('button', { name: 'Mark normal again', exact: true }).click()
		await t.page.getByText('Fictional private room:', { exact: false }).waitFor({ state: 'hidden' })
		assert.equal(t.store.config().chatLevels?.[chat], undefined)
		assert.equal(t.store.byCode('A1')!.sent, undefined)
	} finally { await t.close() }
})

test('React app browser: every Numbers list opens its exact records and inherited names remain an unknown list', async () => {
	const t = await open({ seed: store => seedNumbers(seedNext(store), new Date()) })
	try {
		const response = await t.page.request.get(new URL('/api/v1/numbers?window=this&t=' + new URL(t.url).searchParams.get('t'), t.url).href)
		const data = await response.json() as { lists: Record<string, { title: string; groups: { codes: string[] }[] }>; rows: Record<string, { gist?: string; work?: string }> }
		assert.ok(Object.keys(data.lists).length >= 8)
		for (const [key, list] of Object.entries(data.lists)) {
			await t.page.evaluate(key => { location.hash = `numbers/${key}` }, key)
			await t.page.getByRole('heading', { name: list.title, exact: true }).waitFor()
			const codes = list.groups.flatMap(group => group.codes)
			assert.deepEqual(await t.page.locator('[data-number-code]').evaluateAll(elements => elements.map(element => element.getAttribute('data-number-code'))), codes, key)
			for (const code of codes) for (const detail of [data.rows[code]?.gist, data.rows[code]?.work].filter(Boolean)) {
				assert.ok((await t.page.locator(`[data-number-code="${code}"]`).innerText()).includes(detail!), `${key}/${code}: ${detail}`)
			}
		}
		for (const key of ['constructor', 'toString', '__proto__']) {
			await t.page.evaluate(key => { location.hash = `numbers/${key}` }, key)
			await t.page.getByText('That list is not on this tab.', { exact: true }).waitFor()
			await t.page.getByRole('heading', { name: 'Numbers', exact: true }).waitFor()
		}
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React app browser: working preview keeps New headlines, short ask times, work-first cards and visible-section navigation', async () => {
	const { nextView } = await import('../src/web/next.ts'), { pageText } = await import('../src/web/page-text.ts')
	const askAt = new Date(Date.now() - 15 * 60_000).toISOString()
	const longAsk = 'Please validate the fictional checkout flow with the Acme service. '.repeat(25)
	const t = await open({ run: false, seed: store => {
		seedOwned(seedNext(store))
		const workflow = store.byCode('A40')!
		workflow.lastAsk = longAsk
		store.save(workflow, false)
		store.saveThread(workflow.id, [{ id: workflow.lastMsgId, at: askAt, from: workflow.asker!, text: longAsk, byOwner: false }])
		return store
	} })
	try {
		const server = nextView(t.store)
		for (const row of [...server.move, ...server.working, ...server.waiting, ...server.catchup.rows].filter(row => row.section !== 'catchup')) {
			const shown = t.page.locator(`.now-row[data-code="${row.code}"]`)
			assert.equal(await shown.locator('.row-title').first().innerText(), pageText(row.headline) || 'Review this item', row.code)
			assert.doesNotMatch(await shown.locator('.next-line').allTextContents().then(values => values.join(' ')), /\b(?:edit|answer|skip|ok)\s+A\d+|\btype\b/i)
		}
		const card = await openCard(t.page, 'A40')
		assert.equal(await card.locator('.item-navigation span').innerText(), `1 of ${server.move.length}`)
		assert.equal(await card.locator('.card-header time').getAttribute('datetime'), askAt)
		const time = await t.page.evaluate(iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), askAt)
		assert.equal(await card.locator('.card-header time').innerText(), time)
		assert.equal(await card.locator('.full-ask').getAttribute('open'), null)
		assert.equal(await card.locator('.full-ask blockquote').isVisible(), false)
		await card.getByText('What happened', { exact: true }).click()
		const timeline = await card.locator('.work-first details time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')))
		assert.ok(timeline.length > 1)
		assert.deepEqual(timeline, [...timeline].sort(), 'the card timeline stays chronological, not the row newest-first order')
		const boxes = await readLayout(t.page, ['[data-code="A40"] .work-first', '[data-code="A40"] .full-ask'])
		assert.ok(boxes['[data-code="A40"] .work-first'].y < boxes['[data-code="A40"] .full-ask'].y)
		await card.getByText('Show full ask', { exact: true }).click()
		assert.equal(await card.locator('.full-ask blockquote').innerText(), longAsk.trim())
		await freezeClock(t.page)
		const shots = mkdtempSync(join(tmpdir(), 'delegate-react-working-shots-'))
		await t.page.screenshot({ path: join(shots, 'work-first.png') })
		console.log(`Working preview screenshot: ${shots}`)
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React app browser: unchanged polls return empty 304 responses and changed items return a fresh page', async () => {
	const t = await open()
	try {
		const unchanged = await t.page.waitForResponse(response => response.url().includes('/api/v1/page?') && response.status() === 304)
		assert.ok(unchanged.request().headers()['if-none-match'])
		assert.equal((await unchanged.request().sizes()).responseBodySize, 0)
		const next = t.page.waitForResponse(async response => response.url().includes('/api/v1/page?') && response.status() === 200 && (await response.json()).entities.items.A20.status === 'A fictional changed status')
		const workflow = t.store.byCode('A20')!
		workflow.status = 'A fictional changed status'
		t.store.save(workflow, false)
		await next
		await openCard(t.page, 'A20')
		await t.page.waitForResponse(response => response.url().includes('/api/v1/page?') && response.status() === 304)
		assert.equal(t.store.byCode('A20')!.status, 'A fictional changed status')
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
})

test('React app browser: legacy new-reminder and version routes open working UI with discard protection', async () => {
	const t = await open()
	try {
		await t.page.evaluate(() => { location.hash = 'automations/new' })
		const dialog = t.page.getByRole('dialog', { name: 'Remind someone', exact: true })
		await dialog.waitFor()
		await dialog.getByRole('textbox', { name: 'Exact reminder text' }).fill('A fictional unsent reminder')
		await dialog.getByRole('button', { name: 'Close', exact: true }).click()
		t.page.once('dialog', prompt => prompt.dismiss())
		await t.page.evaluate(() => { location.hash = 'ui=new' })
		await t.page.waitForFunction(() => location.hash !== '#ui=new')
		assert.equal(t.store.ui().ui, 'react')
		t.page.once('dialog', prompt => prompt.accept())
		await t.page.evaluate(() => { location.hash = 'ui=new' })
		await t.page.waitForFunction(() => !!document.querySelector('#app[data-ui="next"]'))
		assert.equal(t.store.ui().ui, 'new')
		assert.deepEqual(t.posts, [])
	} finally { await t.close() }
	const classic = await open()
	try {
		await classic.page.evaluate(() => { location.hash = 'ui=classic' })
		await classic.page.locator('select[data-ui-choice]:visible').waitFor()
		assert.equal(await classic.page.locator('select[data-ui-choice]:visible').inputValue(), 'classic')
		assert.equal(classic.store.ui().ui, 'classic')
		assert.deepEqual(classic.posts, [])
	} finally { await classic.close() }
})

test('React app browser: reviewed safety gates keep ordered answer ids, durable refusals and stale recovery inert', async () => {
	const { actResult } = await import('../src/mcp/server.ts')
	const { reactProjection } = await import('../src/web/react-projection.ts')
	const t = await open({ run: false })
	try {
		const pause = t.page.getByRole('button', { name: 'Pause', exact: true }).last()
		const paused = t.page.waitForResponse(response => response.url().includes('/api/v1/actions?'))
		await pause.click()
		await paused
		const firstId = t.store.answers()[0].answer.id, submission = (t.posts[0] as { submissionId: string }).submissionId
		assert.match(firstId, /^[0-9A-HJKMNP-TV-Z]{26}$/)
		assert.notEqual(firstId, submission)
		assert.equal(t.store.pageSubmission(submission)!.answerId, firstId)
		const middle = actResult(t.store, 'pause').ids[0]
		const action = reactProjection(t.store).snapshot.entities.actions['A1/send-edit']
		const send = async (body: unknown) => t.page.evaluate(async body => {
			const response = await fetch('/api/v1/actions' + location.search, { method: 'POST', body: JSON.stringify(body) })
			return { status: response.status, body: await response.json() }
		}, body)
		const intent = { submissionId: crypto.randomUUID(), action: action.id, item: action.item, rev: action.rev, expect: action.expect, input: { text: 'Fictional exact words' } }
		const third = await send(intent)
		assert.equal(third.status, 202)
		assert.deepEqual(t.store.answers().map(row => row.answer.id), [firstId, middle, third.body.ids[0]])
		for (const [status, changes] of [[409, { rev: 'stale' }], [410, { action: 'unknown' }], [422, { input: {} }]] as const) {
			const body = { ...intent, ...changes, submissionId: crypto.randomUUID() }
			assert.equal((await send(body)).status, status)
			const recovered = await t.page.evaluate(async id => (await fetch('/api/v1/result' + location.search + '&submission=' + id)).json(), body.submissionId)
			assert.equal(recovered.accepted, false)
			assert.equal(recovered.applied, true)
			assert.equal(recovered.refused, true)
			assert.equal((await send(body)).status, status)
		}
		const id = crypto.randomUUID()
		t.store.savePageSubmission({ id, answerId: ulid(), intent: { ...intent, submissionId: id }, fingerprint: 'fixture', item: action.item, rev: action.rev, at: new Date().toISOString(), phase: 'prepared', accepted: false, ids: [], text: 'Preparing', status: 202 })
		const workflow = t.store.byCode('A1')!
		workflow.draft!.text = 'Changed before recovery'
		t.store.save(workflow, false)
		const before = t.store.answers().length
		const recovered = await t.page.evaluate(async id => (await fetch('/api/v1/result' + location.search + '&submission=' + id)).json(), id)
		assert.equal(recovered.refused, true)
		assert.match(recovered.text, /Changed since/)
		assert.equal(t.store.answers().length, before)
		assert.equal(t.store.byCode('A1')!.sent, undefined)
	} finally { await t.close() }
	const row = await open({ run: false, seed: store => seedPromise(store) })
	try {
		const card = await openCard(row.page, 'A60'), e = reactProjection(row.store).snapshot.entities
		const offered = e.actions[e.placements.A60.actionIds[0]]
		assert.equal(offered.staleness, 'exact')
		assert.equal(offered.expect, e.actions['A60/approve'].expect)
		assert.notEqual(offered.effect, 'local')
		await row.page.route('**/api/v1/actions?*', async route => {
			const workflow = row.store.byCode('A60')!
			workflow.effects![0].summary = 'A different approval meaning'
			row.store.save(workflow, false)
			await route.continue()
		})
		const result = await act(row.page, 'A60', () => card.locator('button[data-primary=true]').click())
		assert.equal(result.refused, true)
		assert.deepEqual(row.store.answers(), [])
	} finally { await row.close() }
})

test('React app browser: paused Send stays disabled through a pinned edit while local Ask and exact Undo remain available', async () => {
	const t = await open()
	try {
		const row = await openCard(t.page, 'A1')
		await row.getByRole('button', { name: 'Edit', exact: true }).click()
		await row.getByRole('textbox', { name: 'Edit your reply' }).fill('Keep this unsent wording')
		t.store.saveControl({ ...t.store.control(), paused: true, stopped: false })
		const paused = row.locator('button[data-primary=true]')
		await paused.filter({ hasText: 'Paused' }).waitFor()
		assert.equal(await paused.isDisabled(), true)
		assert.equal(await row.getByRole('textbox', { name: 'Edit your reply' }).inputValue(), 'Keep this unsent wording')
		await row.getByRole('textbox', { name: 'Ask Delegate about this' }).fill('Why is this held?')
		await act(t.page, 'A1', () => row.getByRole('button', { name: 'Ask Delegate', exact: true }).click())
		assert.ok(t.store.byCode('A1')!.notes!.some(note => note.q === 'Why is this held?'))
		assert.equal(t.store.byCode('A1')!.sent, undefined)
		const strip = t.page.getByRole('region', { name: 'Replies you can undo' })
		await act(t.page, 'A9', () => strip.getByRole('button', { name: 'Undo', exact: true }).click())
		assert.equal(t.store.byCode('A9')!.sent, undefined)
		t.store.saveControl({ ...t.store.control(), paused: false, stopped: false })
		await paused.filter({ hasText: 'Send your version' }).waitFor()
		assert.equal(await paused.isDisabled(), false)
		assert.equal(await row.getByRole('textbox', { name: 'Edit your reply' }).inputValue(), 'Keep this unsent wording')
	} finally { await t.close() }
})

test('React app browser: Numbers keeps window focus while Counting and exposes a working offline retry', async () => {
	const t = await open()
	let release: () => void = () => {}
	const held = new Promise<void>(resolve => { release = resolve })
	try {
		await t.page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Numbers', exact: true }).click()
		await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
		let reached: () => void = () => {}
		const requested = new Promise<void>(resolve => { reached = resolve })
		await t.page.route('**/api/v1/numbers?*', async route => { reached(); await held; await route.abort() })
		const field = t.page.getByRole('combobox', { name: 'Time window' })
		await field.focus()
		await field.selectOption('last')
		await requested
		assert.equal(await field.inputValue(), 'last')
		assert.equal(await field.evaluate(element => document.activeElement === element), true)
		release()
		await t.page.getByRole('alert').waitFor()
		assert.equal(await field.inputValue(), 'last')
		await t.page.unroute('**/api/v1/numbers?*')
		await t.page.getByRole('button', { name: 'Try again', exact: true }).click()
		await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
		assert.equal(await field.inputValue(), 'last')
	} finally { release(); await t.close() }
})

test('React app browser: report radios keep keyboard focus, refresh keeps exact dollar text and failure cannot send it', async () => {
	const t = await open()
	try {
		const row = await openCard(t.page, 'A40')
		await row.getByLabel('Both work', { exact: true }).focus()
		await t.page.keyboard.press('ArrowDown')
		assert.equal(await row.getByLabel('Issues found', { exact: true }).isChecked(), true)
		assert.equal(await row.getByLabel('Issues found', { exact: true }).evaluate(element => document.activeElement === element), true)
		const field = row.getByRole('textbox', { name: 'What did you see?' }), text = 'Checkout costs $5, ok A9. This is not a command.'
		await field.fill(text)
		const workflow = t.store.byCode('A40')!
		workflow.work!.steps.push({ at: new Date().toISOString(), what: 'A harmless progress note' })
		t.store.save(workflow, false)
		await t.page.waitForResponse(response => response.url().includes('/api/v1/page?'))
		assert.equal(await field.inputValue(), text)
		assert.equal(await field.evaluate(element => document.activeElement === element), true)
		await t.page.route('**/api/v1/actions?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ text: 'Fictional connection failure' }) }))
		await row.getByRole('button', { name: 'Draft my report', exact: true }).click()
		await row.getByRole('alert').filter({ hasText: 'Not sure it went through' }).waitFor()
		assert.equal(await field.inputValue(), text)
		assert.equal((t.posts[0] as { input: { text: string } }).input.text, text)
		assert.equal(t.store.byCode('A40')!.sent, undefined)
		assert.deepEqual(t.store.answers(), [])
	} finally { await t.close() }
})

test('React app browser: watch intervals, extension, stop, reminder pause and named-channel removal apply exactly', async () => {
	const teamId = crypto.randomUUID(), firstChannel = '19:fictional-first@thread.tacv2', secondChannel = '19:fictional-second@thread.tacv2'
	const t = await open({ seed: store => {
		seedNext(store)
		store.saveConfig({ ...store.config(), channels: [{ teamId, channelId: firstChannel, name: 'Acme release' }, { teamId, channelId: secondChannel, name: 'Globex launch' }] })
		return store
	} })
	try {
		const response = await t.page.request.get(new URL('/api/v1/page' + new URL(t.url).search, t.url).href), data = await response.json() as Snapshot
		const watch = Object.values(data.entities.watches)[0]
		assert.ok(watch)
		assert.equal(Object.keys(data.entities.channels).length, 2)
		await t.page.getByText('Watch details', { exact: true }).click()
		const card = t.page.locator('article.item-card').filter({ has: t.page.getByRole('heading', { name: watch.what, exact: true }) })
		await card.getByRole('textbox', { name: 'How often to check' }).fill('2h')
		const interval = watch.actionIds.map(id => data.entities.actions[id]).find(action => action.kind === 'interval')!
		assert.equal((await act(t.page, interval.item, () => card.getByRole('button', { name: interval.label, exact: true }).click())).accepted, true)
		assert.equal(t.store.job(t.store.byCode(watch.code)!.job!)!.every, 120)
		const extend = watch.actionIds.map(id => data.entities.actions[id]).find(action => action.kind.includes('extend'))!
		assert.ok(extend)
		assert.equal((await act(t.page, extend.item, () => card.getByRole('button', { name: extend.label, exact: true }).click())).accepted, true)
		assert.ok(Date.parse(t.store.job(t.store.byCode(watch.code)!.job!)!.endsAt!) > Date.now() + 6 * 86_400_000)
		const stop = watch.actionIds.map(id => data.entities.actions[id]).find(action => /stop|unwatch/.test(action.kind))!
		assert.ok(stop)
		assert.equal((await act(t.page, stop.item, () => card.getByRole('button', { name: stop.label, exact: true }).click())).accepted, true)
		assert.equal(t.store.byCode(watch.code)!.state, 'done')
		const automation = t.store.automations().find(row => row.state === 'active')!
		const row = t.page.locator(`.now-row[data-code="${automation.code}"]`)
		await row.getByRole('button', { name: 'Open', exact: true }).click()
		await act(t.page, automation.code, () => row.getByRole('button', { name: 'Pause', exact: true }).click())
		assert.equal(t.store.automation(automation.code)!.state, 'paused')
		await act(t.page, automation.code, () => row.getByRole('button', { name: 'Resume', exact: true }).click())
		assert.equal(t.store.automation(automation.code)!.state, 'active')
		await act(t.page, automation.code, () => row.getByRole('button', { name: 'End', exact: true }).click())
		assert.equal(t.store.automation(automation.code)!.state, 'ended')
		await t.page.getByText('Channels you named', { exact: true }).click({ timeout: 3000 }).catch(async error => { throw new Error(`Channels: ${JSON.stringify(t.store.config().channels)}; hash: ${await t.page.evaluate(() => location.hash)}; body: ${await t.page.locator('body').innerText()}`, { cause: error }) })
		const channel = Object.values(data.entities.channels).find(row => row.name === 'Acme release')!, action = data.entities.actions[channel.actionIds[0]]
		assert.equal((await act(t.page, action.item, () => t.page.getByText(channel.name, { exact: true }).locator('..').getByRole('button', { name: action.label, exact: true }).click())).accepted, true)
		assert.deepEqual(t.store.config().channels, [{ teamId, channelId: secondChannel, name: 'Globex launch' }])
		assert.equal(t.store.byCode(watch.code)!.sent, undefined)
	} finally { await t.close() }
})
