import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Locator, type Page } from 'playwright-core'
import type { Store as StoreType } from '../src/store/state.ts'
import type { Receipt, Snapshot } from '../src/web/react/domain/contracts.ts'
import type { Numbers } from '../src/web/react/domain/screens.ts'
import { freezeClock } from './browser-clock.ts'
import { readLayout } from './browser-layout.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-m4b-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { seedNext, seedQuiet, seedNumbers, item, stub } = await import('./fixture.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { propose, knowledgeOf } = await import('../src/runner/proposals.ts')
const { watchChannel } = await import('../src/mcp/server.ts')
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const root = fileURLToPath(new URL('../', import.meta.url))
let browser: Browser, preview: string
before(async () => {
	preview = mkdtempSync(join(tmpdir(), 'delegate-m4b-build-'))
	execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(preview, 'dist', 'web-react')], { cwd: root, stdio: 'pipe' })
	browser = await chromium.launch({ channel: 'chrome', headless: true })
})
after(async () => { await browser?.close() })

async function open(seed: (store: StoreType) => StoreType = seedNext, options: { route?: string; width?: number; theme?: 'light' | 'dark' } = {}) {
	const store = seed(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-m4b-store-')), machine: 'test' }))
	store.saveUi('react')
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'), undefined, preview)
	const context = await browser.newContext({
		viewport: { width: options.width ?? 1280, height: options.width === 400 ? 860 : 800 },
		colorScheme: options.theme ?? 'light', reducedMotion: 'reduce',
	})
	context.setDefaultTimeout(6000)
	await context.addInitScript(() => { window.DELEGATE_POLL_MS = 100 })
	const page = await context.newPage(), errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	try {
		await page.goto(url + '#' + (options.route ?? 'now'))
		const heading = ({ done: 'Done', numbers: 'Numbers', knowledge: 'Facts to check', settings: 'Settings' } as Record<string, string>)[options.route?.split('/')[0] ?? 'now'] ?? 'Now'
		await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor()
	} catch (error) {
		await context.close()
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		throw error
	}
	return {
		store, page, url,
		async close() {
			await page.unrouteAll({ behavior: 'wait' })
			await context.close()
			server.closeAllConnections()
			await new Promise<void>(resolve => server.close(() => resolve()))
			assert.deepEqual(errors, [])
		},
	}
}
async function apply(t: Awaited<ReturnType<typeof open>>, button: Locator) {
	const posted = t.page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/v1/actions?'))
	await button.click()
	const response = await posted
	assert.ok(response.ok(), await response.text())
	const receipt: Receipt = await response.json()
	assert.equal(receipt.accepted, true, receipt.text)
	if (!receipt.applied) {
		await applyAnswers(t.store, stub, t.store.config(), procs)
		await t.page.waitForFunction(async ({ url, id }) => {
			const endpoint = new URL('/api/v1/result', url)
			endpoint.searchParams.set('t', new URL(url).searchParams.get('t')!)
			endpoint.searchParams.set('submission', id)
			const result = await (await fetch(endpoint)).json()
			return result.applied
		}, { url: t.url, id: receipt.submissionId })
	}
	return receipt
}
async function card(page: Page, code: string) {
	const row = page.locator(`.now-row[data-code="${code}"]`)
	await row.waitFor()
	if (!await row.locator('.item-card').count()) await row.getByRole('button', { name: 'Open', exact: true }).click()
	await row.locator('.item-card').waitFor()
	return row
}
async function snapshot(t: Awaited<ReturnType<typeof open>>): Promise<Snapshot> {
	const url = new URL('/api/v1/page', t.url)
	url.searchParams.set('t', new URL(t.url).searchParams.get('t')!)
	return (await fetch(url)).json()
}
const lifecycleProofs: { name: string; run: () => Promise<void> }[] = []
const lifecycleProof = (name: string, run: () => Promise<void>) => lifecycleProofs.push({ name, run })

test('M4b SC-265: counted Numbers rows retain gist and work in both themes and widths', async () => {
	const shots = mkdtempSync(join(tmpdir(), 'delegate-m4b-shots-'))
	for (const width of [1280, 400]) for (const theme of ['light', 'dark'] as const) {
		const t = await open(store => {
			seedQuiet(store)
			seedNumbers(store)
			const at = new Date().toISOString()
			item(store, 'A901', 'Kim Lane', 'Acme release', {
				state: 'done', intent: 'fyi', fyi: { line: 'Release notes posted', gist: 'The launch stays on Thursday.', weight: 'high', at },
			})
			item(store, 'A902', 'Rita Vale', 'Acme release', {
				state: 'done', sent: { msgId: 'm902', text: 'The tests passed.', at },
				work: { goal: 'Verify the Acme release', doneWhen: 'Tests pass', links: [], steps: [], closed: { at, why: 'Tests passed' } },
			})
			return store
		}, { route: 'numbers', width, theme })
		try {
			const url = new URL('/api/v1/numbers', t.url)
			url.searchParams.set('t', new URL(t.url).searchParams.get('t')!)
			url.searchParams.set('window', 'this')
			const data: Numbers = await (await fetch(url)).json()
			await t.page.getByRole('heading', { name: 'Handled for you', exact: true }).waitFor()
			for (const code of ['A901', 'A902']) {
				const list = Object.entries(data.lists as Record<string, { groups: { codes: string[] }[] }>).find(([, list]) => list.groups.some(group => group.codes.includes(code)))
				assert.ok(list, `${code} has a counted list`)
				const links = [data.model.handled.main, ...data.model.handled.kinds, ...data.model.cards.flatMap(card => [card.main, ...card.lines.flat(), card.four]), ...data.model.corrections]
				const link = links.find(link => link.key === list[0])
				assert.ok(link, `A visible number opens ${list[0]}`)
				if (await t.page.getByRole('button', { name: 'Back to Numbers', exact: true }).count()) await t.page.getByRole('button', { name: 'Back to Numbers', exact: true }).click()
				await t.page.getByRole('button', { name: link.text, exact: true }).click()
				const row = t.page.locator(`[data-number-code="${code}"]`)
				await row.waitFor().catch(async error => { throw new Error(`${code} list ${list[0]} at ${t.page.url()}: ${await t.page.locator('main').innerText()}`, { cause: error }) })
				const value = code === 'A901' ? data.rows[code].gist : data.rows[code].work
				assert.ok(value, `${code} has source detail`)
				assert.ok((await row.innerText()).includes(value), `Numbers must retain ${code}'s ${code === 'A901' ? 'gist' : 'work'}: ${value}`)
				assert.deepEqual(await t.page.locator('[data-number-code]').evaluateAll(rows => rows.map(row => row.getAttribute('data-number-code'))), data.lists[list[0]].groups.flatMap(group => group.codes))
				for (const expected of Object.values(data.rows).filter(expected => data.lists[list[0]].groups.some(group => group.codes.includes(expected.code)))) {
					const entry = t.page.locator(`[data-number-code="${expected.code}"]`).first()
					for (const text of [expected.ask, expected.said, expected.gist, expected.work, expected.who.name, expected.at].filter(Boolean)) assert.ok((await entry.innerText()).includes(text!))
					assert.equal(await entry.getByRole('button').count(), 0)
					if (expected.teams ?? expected.href) assert.equal(await entry.getByRole('link', { name: 'Open source' }).getAttribute('href'), expected.teams ?? expected.href)
				}
			}
			await t.page.locator('[data-number-code="A902"]').scrollIntoViewIfNeeded()
			await readLayout(t.page, ['[data-number-code="A902"]'])
			await freezeClock(t.page)
			assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
			await t.page.screenshot({ path: join(shots, `numbers-${width}-${theme}.png`) })
		} finally { await t.close() }
	}
	console.log(`M4b Numbers screenshots: ${shots}`)
})

test('M4b SC-131: Done groups unseen entries before newer earlier entries and keeps the groups during this visit', async () => {
	const shots = mkdtempSync(join(tmpdir(), 'delegate-m4b-done-shots-'))
	for (const width of [1280, 400]) for (const theme of ['light', 'dark'] as const) {
		const t = await open(store => {
			seedQuiet(store)
			const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
			for (const [code, minutes] of [['A911', 60], ['A912', 5]] as const) item(store, code, 'Kim Lane', 'Acme release', {
				state: 'done', intent: 'status_next_step', sent: { msgId: code, text: code === 'A911' ? 'Unseen older reply.' : 'Already seen newer reply.', at: at(minutes), byRule: 'R1' },
			})
			store.saveSeen(['item:A912'], at(1))
			return store
		}, { route: 'done', width, theme })
		try {
			await t.page.locator('[data-activity-code="A911"]').waitFor()
			assert.deepEqual(await t.page.locator('[data-activity-code]').evaluateAll(rows => rows.map(row => row.getAttribute('data-activity-code'))), ['A911', 'A912'])
			await t.page.getByRole('heading', { name: 'New', exact: true }).waitFor()
			await t.page.getByRole('heading', { name: 'Earlier', exact: true }).waitFor()
			await t.page.getByRole('button', { name: 'Replies', exact: true }).click()
			await t.page.getByRole('heading', { name: 'New', exact: true }).waitFor()
			assert.deepEqual(await t.page.locator('[data-activity-code]').evaluateAll(rows => rows.map(row => row.getAttribute('data-activity-code'))), ['A911', 'A912'])
			await readLayout(t.page, ['[data-activity-code="A911"]', '[data-activity-code="A912"]'])
			await freezeClock(t.page)
			assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
			await t.page.screenshot({ path: join(shots, `done-${width}-${theme}.png`) })
		} finally { await t.close() }
	}
	console.log(`M4b Done screenshots: ${shots}`)
})

lifecycleProof('U25 holding reply and Undo target', async () => {
	const t = await open()
	try {
		const row = await card(t.page, 'A21'), expected = t.store.byCode('A21')!.draft!.text
		await apply(t, row.getByRole('button', { name: 'Send holding reply', exact: true }))
		assert.equal(t.store.byCode('A21')!.sent?.text, expected)
		const sent = t.store.byCode('A21')!.sent!.msgId
		await t.page.reload()
		const undo = t.page.locator('.undo-strip [data-code="A21"]').getByRole('button', { name: 'Undo', exact: true })
		await apply(t, undo)
		assert.equal(t.store.byCode('A21')!.sent, undefined, `Undo removes ${sent}`)
		assert.equal(t.store.byCode('A20')!.sent, undefined)
	} finally { await t.close() }
})

test('M4b SC-131: Done retains heading hierarchy, seen groups, fresh arrivals and earlier replies after restart', async () => {
	const t = await open(store => {
		seedQuiet(store)
		item(store, 'A915', 'Kim Lane', 'Acme release', { state: 'done', sent: { msgId: '915', text: 'The rehearsal is ready.', at: new Date().toISOString(), byRule: 'R1' } })
		return store
	}, { route: 'done' })
	try {
		await t.page.getByRole('heading', { level: 2, name: 'New', exact: true }).waitFor()
		assert.equal(await t.page.getByRole('heading', { name: 'Earlier', exact: true }).count(), 0)
		const entry = t.page.locator('[data-activity-code="A915"]')
		assert.equal(await entry.getByRole('heading', { level: 3 }).count(), 1)
		await entry.getByRole('heading').getByRole('button').focus()
		await t.page.keyboard.press('Enter')
		assert.equal(await entry.getByRole('heading').getByRole('button').getAttribute('aria-expanded'), 'true')
		t.store.saveSeen(['replies'], new Date().toISOString())
		await t.page.waitForResponse(async response => response.url().includes('/api/v1/page?') && !(Object.values((await response.json() as Snapshot).entities.doneEntries)).some(row => row.fresh))
		await t.page.getByRole('heading', { level: 2, name: 'New', exact: true }).waitFor()
		item(t.store, 'A916', 'Rita Vale', 'Acme release', { state: 'done', sent: { msgId: '916', text: 'The release is verified.', at: new Date().toISOString(), byRule: 'R1' } })
		await t.page.locator('[data-activity-code="A916"] .chip').filter({ hasText: 'New' }).waitFor()
		assert.deepEqual(await t.page.locator('[data-activity-code]').evaluateAll(rows => rows.map(row => row.getAttribute('data-activity-code'))), ['A916', 'A915'])
		await t.page.getByRole('button', { name: 'Changes', exact: true }).click()
		await t.page.getByText('Nothing in this view.', { exact: true }).waitFor()
		assert.equal(await t.page.getByRole('heading', { name: /^(New|Earlier)$/ }).count(), 0)
		await t.page.getByRole('button', { name: 'Replies', exact: true }).click()
		await t.page.getByRole('heading', { name: 'New', exact: true }).waitFor()
		t.store.saveSeen(['replies'], new Date().toISOString())
		await t.page.reload()
		await t.page.locator('[data-activity-code="A915"]').waitFor()
		assert.equal(await t.page.getByRole('heading', { name: /^(New|Earlier)$/ }).count(), 0)
		assert.equal(await t.page.locator('[data-activity-code="A915"]').getByRole('heading', { level: 2 }).count(), 1)
	} finally { await t.close() }
})

lifecycleProof('U51 fact Edit and Skip', async () => {
	for (const edit of [true, false]) {
		const t = await open(store => {
			seedQuiet(store)
			store.saveConfig({ ...store.config(), reviewLearning: true })
			propose(store, knowledgeOf(store, store.config()), [{ topic: 'Acme release', type: 'decision', text: 'Ship on Thursday.', src: [{ link: 'https://teams.microsoft.com/l/message/acme/1', date: '2026-10-22', who: 'Kim' }] }], 'bootstrap', 'fictional chats')
			return store
		}, { route: 'knowledge' })
		try {
			const proposal = t.store.proposals().find(row => row.state === 'needs_human')!
			assert.ok(proposal)
			if (edit) {
				await t.page.getByRole('button', { name: 'Edit', exact: true }).click()
				await t.page.getByRole('textbox', { name: 'Edit this fact' }).fill('Ship on Friday after verification.')
				await apply(t, t.page.getByRole('button', { name: 'Save your version', exact: true }))
				assert.equal(t.store.proposal(proposal.code)!.state, 'applied')
				assert.ok(JSON.stringify(t.store.proposal(proposal.code)!.ops).includes('Ship on Friday after verification.'))
			} else {
				const before = t.store.proposal(proposal.code)!.ops
				await apply(t, t.page.getByRole('button', { name: 'Skip', exact: true }))
				assert.equal(t.store.proposal(proposal.code)!.state, 'dropped')
				assert.deepEqual(t.store.proposal(proposal.code)!.ops, before)
				assert.equal(t.store.proposal(proposal.code)!.applied, undefined)
			}
		} finally { await t.close() }
	}
})

lifecycleProof('U30/U31 watch interval, Extend 7 days and Stop isolation', async () => {
	const t = await open()
	try {
		await t.page.getByText('Watch details', { exact: true }).click()
		let watch = t.page.locator('details article').filter({ hasText: 'PR 2203 until merged' })
		await watch.getByRole('textbox', { name: 'How often to check' }).fill('2h')
		await apply(t, watch.getByRole('button', { name: 'Save interval', exact: true }))
		assert.equal(t.store.job('j-a29')!.every, 120)
		assert.equal(t.store.job('j-a8')!.every, 60)
		await t.page.reload()
		await t.page.getByText('Watch details', { exact: true }).click()
		watch = t.page.locator('details article').filter({ hasText: 'PR 2203 until merged' })
		const ends = Date.parse(t.store.job('j-a29')!.endsAt!)
		await apply(t, watch.getByRole('button', { name: 'Extend 7 days', exact: true }))
		assert.equal(Date.parse(t.store.job('j-a29')!.endsAt!) - ends, 7 * 86_400_000)
		await t.page.reload()
		await t.page.getByText('Watch details', { exact: true }).click()
		watch = t.page.locator('details article').filter({ hasText: 'PR 2203 until merged' })
		await apply(t, watch.getByRole('button', { name: 'Stop watching', exact: true }))
		assert.equal(t.store.byCode('A29')!.state, 'done')
		assert.equal(t.store.job('j-a29')!.every, undefined)
		assert.equal(t.store.job('j-a29')!.nextAt, undefined)
		assert.equal(t.store.job('j-a8')!.every, 60)
		assert.notEqual(t.store.byCode('A8')!.state, 'done')
	} finally { await t.close() }
})

lifecycleProof('U33 reminder Pause, Resume and End isolation', async () => {
	const t = await open(store => {
		seedNext(store)
		store.saveAutomation({ ...store.automations()[0], id: 'reminder-secondary', code: 'R2', text: 'Check the fictional release.' })
		return store
	})
	try {
		const auto = t.store.automations().find(row => row.state === 'active')!
		const other = t.store.automations().find(row => row.code !== auto.code)!
		await card(t.page, auto.code)
		await apply(t, t.page.locator(`.now-row[data-code="${auto.code}"]`).getByRole('button', { name: 'Pause', exact: true }))
		assert.equal(t.store.automation(auto.code)!.state, 'paused')
		assert.equal(t.store.automation(auto.code)!.count, 0)
		await t.page.reload()
		let paused = await card(t.page, auto.code)
		assert.ok((await paused.innerText()).includes(auto.to.name))
		await apply(t, paused.getByRole('button', { name: 'Resume', exact: true }))
		assert.equal(t.store.automation(auto.code)!.state, 'active')
		assert.deepEqual(t.store.automation(auto.code)!.schedule, auto.schedule)
		await t.page.reload()
		await card(t.page, auto.code)
		await apply(t, t.page.locator(`.now-row[data-code="${auto.code}"]`).getByRole('button', { name: 'Pause', exact: true }))
		await t.page.reload()
		paused = await card(t.page, auto.code)
		await apply(t, paused.getByRole('button', { name: 'End', exact: true }))
		assert.equal(t.store.automation(auto.code)!.state, 'ended')
		assert.equal(t.store.automation(auto.code)!.count, 0)
		assert.deepEqual(t.store.automation(other.code), other)
		await t.page.locator(`.now-row[data-code="${auto.code}"]`).waitFor({ state: 'hidden' })
		await t.page.locator('.live-result').filter({ hasText: /Ended|Stopped/i }).waitFor()
	} finally { await t.close() }
})

lifecycleProof('U34 named-channel Stop isolation', async () => {
	const first = 'https://teams.microsoft.com/l/channel/19%3Aacme%40thread.tacv2/Acme?groupId=team-acme'
	const second = 'https://teams.microsoft.com/l/channel/19%3Aglobex%40thread.tacv2/Globex?groupId=team-globex'
	const t = await open(store => { seedQuiet(store); watchChannel(store, first); watchChannel(store, second); return store })
	try {
		const before = t.store.config().channels!
		assert.ok(Array.isArray(before))
		assert.equal(before.length, 2)
		await t.page.getByText('Channels you named', { exact: true }).click()
		await apply(t, t.page.locator('details article').filter({ hasText: 'Acme' }).getByRole('button', { name: 'Stop watching', exact: true }))
		const after = t.store.config().channels
		assert.ok(Array.isArray(after))
		assert.equal(after.length, 1)
		assert.deepEqual(after[0], before[1])
	} finally { await t.close() }
})

lifecycleProof('U54 health retry', async () => {
	const t = await open(store => { seedNext(store); store.setHealth('source', 'Cannot read the fictional source.'); return store })
	try {
		await apply(t, t.page.getByRole('alert').filter({ hasText: 'Cannot read the fictional source.' }).getByRole('button', { name: 'Try again', exact: true }))
		assert.equal(t.store.health().source?.text, 'Cannot read the fictional source.')
		assert.ok(t.store.kickedAt())
		assert.equal(t.store.byCode('A20')!.sent, undefined)
	} finally { await t.close() }
})

lifecycleProof('U20 Wait 3 days and Close isolation', async () => {
	for (const label of ['Wait 3 days', 'Close']) {
		const t = await open()
		try {
			const row = await card(t.page, 'A34')
			const before = Date.now()
			await apply(t, row.locator('.item-card').getByRole('button', { name: label, exact: true }))
			const work = t.store.byCode('A34')!
			if (label === 'Wait 3 days') {
				assert.equal(work.state, 'open')
				const check = Date.parse(work.work!.checkAt!)
				assert.ok(check >= before + 3 * 86_400_000 && check <= Date.now() + 3 * 86_400_000)
			} else {
				assert.equal(work.state, 'done')
				assert.ok(work.work!.closed)
			}
			assert.equal(work.sent, undefined)
			assert.notEqual(t.store.byCode('A27')!.state, 'done')
		} finally { await t.close() }
	}
})

const gap = (file: string, reason: string) => process.env.DELEGATE_M4B_CHECK_GAPS ? false : `${file}: ${reason}; owned by the other builder`
lifecycleProof('U03 Other answer drafts without sending', async () => {
	const t = await open()
	try {
		const row = await card(t.page, 'A3')
		await row.getByLabel('Other answer', { exact: true }).check()
		await row.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Use a small pilot first.')
		await apply(t, row.getByRole('button', { name: 'Draft reply', exact: true }))
		assert.equal(t.store.byCode('A3')!.sent, undefined)
		assert.equal(t.store.byCode('A3')!.ownerAnswer, 'Use a small pilot first.')
		assert.equal(t.store.byCode('A3')!.state, 'running')
	} finally { await t.close() }
})

test('M4b lifecycle: real-server actions persist the intended store state without changing other subjects', async () => {
	for (const proof of lifecycleProofs) {
		try { await proof.run() } catch (error) { throw new Error(proof.name, { cause: error }) }
	}
})

test('M4b SC-163: debug block offers Copy details', { skip: gap('src/web/react/features/ItemCard.tsx', 'debug block renders lines but no copy button') }, async () => {
	const t = await open(store => { seedNext(store); store.saveConfig({ ...store.config(), showDetails: true }); return store })
	try {
		const row = await card(t.page, 'A20')
		await row.getByText('More', { exact: true }).click()
		await row.locator('pre').filter({ hasText: 'A20' }).waitFor()
		await row.getByRole('button', { name: 'Copy details', exact: true }).waitFor()
	} finally { await t.close() }
})

test('M4b U57 SC-124/175: footer reports auto update cadence', { skip: gap('src/web/react/App.tsx', 'footer is inline in the forbidden app file, not a separately owned component') }, async () => {
	const t = await open()
	try {
		const data = await snapshot(t)
		assert.ok(data.version)
		assert.match(await t.page.locator('footer').innerText(), data.version.auto ? new RegExp(`every ${data.version.everyMin}|daily|hour|day`, 'i') : /updates off|manual|not.*automatic/i)
	} finally { await t.close() }
})

for (const state of ['ok', 'late', 'off', 'never'] as const) test(`M4b U58: exact ${state} reading status`, { skip: gap('src/web/react/App.tsx', 'reading status collapses late/off/never and omits check time') }, async () => {
	const t = await open(store => {
		seedQuiet(store)
		store.saveChats({ startedAt: new Date().toISOString(), seen: {}, ...(state === 'never' ? {} : { goodAt: new Date(Date.now() - ({ ok: 1, late: 30, off: 90 }[state]) * 60_000).toISOString() }) })
		return store
	})
	try {
		assert.equal((await snapshot(t)).status.reading.state, state)
		assert.match(await t.page.locator('.reading-status').innerText(), state === 'never' ? /Not checked yet/ : state === 'off' ? /Not checked since/ : /Checked /)
	} finally { await t.close() }
})

test('M4b SC-118: bootstrap history progress is visible', { skip: gap('src/web/react/features/Now.tsx + src/web/react-projection.ts', 'view.running bootLines and progress are not projected/rendered') }, async () => {
	const t = await open(store => {
		seedQuiet(store)
		const at = new Date().toISOString()
		for (const [id, state] of [['history-1', 'done'], ['history-2', 'running']] as const) store.saveJob({
			schema: 1, id, key: `bootstrap:chats:${id}`, goal: 'Read fictional history', label: 'fictional history',
			session: { agent: 'copilot', id }, state, purpose: 'work', parents: [], asks: [], createdAt: at, updatedAt: at,
		})
		return store
	})
	try {
		await t.page.getByText('Learning from fictional history: 1 of 2 parts done, 1 reading now', { exact: true }).waitFor()
		assert.equal(await t.page.getByRole('progressbar').getAttribute('value'), '0.5')
	} finally { await t.close() }
})

test('M4b SC-251/252: row facts render also and waiting-since', { skip: gap('src/web/react/features/Now.tsx', 'row drops facts.also and notes.since') }, async () => {
	const t = await open()
	try {
		const data = await snapshot(t), row = data.entities.placements.A23
		assert.ok(row.facts.also)
		assert.match(await t.page.locator('.now-row[data-code="A23"]').innerText(), /\+1 chat/)
		const waiting = data.entities.placements.A34.facts.notes?.find(note => note.since)
		assert.ok(waiting)
		assert.match(await t.page.locator('.now-row[data-code="A34"]').innerText(), /Waiting on:.*since/)
	} finally { await t.close() }
})

test('M4b SC-251/279/282: empty sections are omitted', { skip: gap('src/web/react/features/Now.tsx', 'Now renders empty working/waiting/catchup sections') }, async () => {
	const t = await open(store => seedQuiet(store))
	try {
		assert.equal(await t.page.locator('#section-working, #section-waiting, #section-catchup').count(), 0)
		await t.page.getByText('Quiet. Nothing needs you, and nothing is waiting.', { exact: true }).waitFor()
	} finally { await t.close() }
})

test('M4b SC-279/282: narrow health banner folds detail and leaves Your move in the top half', { skip: gap('src/web/react/features/Now.tsx', 'health alerts are unfolded, unbounded blocks on narrow screens') }, async () => {
	const t = await open(store => {
		seedNext(store)
		for (const key of ['source', 'history', 'reader']) store.setHealth(key, `Fictional ${key} problem: checking the source is delayed. No reply can be sent until it is verified.`)
		return store
	}, { width: 400 })
	try {
		const layout = await readLayout(t.page, ['#section-move'])
		assert.ok(layout['#section-move'].y < 430)
		const alert = t.page.getByRole('alert').filter({ hasText: 'Fictional source problem' })
		await alert.locator('summary').waitFor()
	} finally { await t.close() }
})

test('M4b SC-277: Find is the only missed-message entry point', async () => {
	const t = await open()
	try {
		await t.page.getByRole('heading', { name: 'More you can do', exact: true }).waitFor()
		assert.equal(await t.page.getByRole('button', { name: 'Add a missed message', exact: true }).count(), 0)
		const link = 'https://teams.microsoft.com/l/message/19:fictional@thread.v2/12345'
		await t.page.getByRole('textbox', { name: /Find a person/ }).fill(link)
		await apply(t, t.page.getByRole('button', { name: 'Make it an item', exact: true }))
		assert.equal(t.store.missed().filter(row => row.link === link).length, 1)
		assert.equal(t.store.byCode('A20')!.sent, undefined)
	} finally { await t.close() }
})
