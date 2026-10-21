// The AI models block in Settings, in a real browser, in both experiences (R-SET-14, design-spec/runinfo.md).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-rblocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { seedInbox } = await import('./fixture.ts')

const PW = process.env.PLAYWRIGHT_CORE ?? (() => { try { return createRequire(import.meta.url).resolve('playwright-core').replace(/index\.js$/, 'index.mjs') } catch { return '' } })()
const skip = existsSync(PW) ? false : 'playwright-core not found (set PLAYWRIGHT_CORE)'
// deno-lint-ignore no-explicit-any
let browser: any
before(async () => {
	if (skip) return
	const { chromium } = await import(pathToFileURL(PW).href)
	browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
})
after(async () => { await browser?.close() })

const OPUS = { id: 'claude-opus-5.5', name: 'Claude Opus 5.5' }
// Runs as the runner logs them, today.
function seedRuns(store: InstanceType<typeof Store>) {
	const dir = join(store.root, 'state', 'log'), at = new Date().toISOString()
	mkdirSync(dir, { recursive: true })
	const lines = [
		...[80, 90, 167].map((s, i) => ({ event: 'worker', runId: `d${i}`, runKind: 'draft', models: [OPUS], ms: s * 1000, modelMs: [50, 55, 70][i] * 1000, toolMs: [20, 30, 80][i] * 1000, startMs: [4, 5, 9][i] * 1000 })),
		{ event: 'job-done', runId: 'j1', runKind: 'review', models: [OPUS, { id: 'gpt-6', name: 'GPT-6' }], ms: 250_000, modelMs: 150_000, toolMs: 90_000, startMs: 6000 },
		{ event: 'ask', runId: 'a1', runKind: 'ask', models: [OPUS], ms: 97_000, modelMs: 60_000, toolMs: 30_000, startMs: 5000 },
	]
	writeFileSync(join(dir, `${at.slice(0, 10)}-mac.jsonl`), lines.map(l => JSON.stringify({ at, ...l })).join('\n') + '\n', { flag: 'a' })
}

async function openSettings(ui: 'new' | 'classic', viewport = { width: 1280, height: 800 }, colorScheme: 'light' | 'dark' = 'light', runs = true) {
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-rbroot-')), machine: 'mac' }))
	store.saveUi(ui)
	if (runs) seedRuns(store)
	const { url, server } = await serveInbox(() => store)
	const ctx = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce', locale: 'en-US' })
	await ctx.addInitScript('window.DELEGATE_POLL_MS = 60')
	const page = await ctx.newPage()
	const errors: string[] = []
	page.on('pageerror', (e: Error) => errors.push(e.message))
	await page.goto(`${url}#settings/system`)
	await page.waitForSelector('[data-code="models"]')
	return { store, page, close: async () => { await ctx.close(); (server.closeAllConnections?.(), server.close()); assert.deepEqual(errors, []) } }
}

for (const ui of ['classic', 'new'] as const) {
	test(`runinfo browser (${ui}): Settings shows the AI models block with what is set and what ran, without opening More`, { skip }, async () => {
		const t = await openSettings(ui)
		try {
			const block = (await t.page.locator('[data-code="models"]').innerText()).replace(/\r\n/g, '\n')
			assert.match(block, /^Uses the AI CLI's default$/m)
			assert.match(block, /^Drafts: Claude Opus 5\.5, 3 runs, typical 90 s \(model 55 s, tools 30 s, start-up 5 s\)$/m)
			assert.match(block, /^Reviews: Claude Opus 5\.5 \(1\), GPT-6 \(1\), 1 run, typical 250 s \(model 150 s, tools 90 s, start-up 6 s, other 4 s\)$/m)
			assert.match(block, /^Asks: Claude Opus 5\.5, 1 run, typical 97 s/m)
			assert.equal(await t.page.locator('details.adv [data-code="models"]').count(), 0, 'the block is not under More')
			assert.equal(await t.page.locator('#setsec-system [data-code="models"]').count(), 1, 'it sits with Updates and system')
			await t.page.setViewportSize({ width: 400, height: 860 })
			assert.ok(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on a narrow window')
		} finally { await t.close() }
	})
}

test('runinfo browser: before any run recorded its model, the block says so', { skip }, async () => {
	const t = await openSettings('classic', undefined, 'light', false)
	try {
		assert.match(await t.page.locator('[data-code="models"]').innerText(), /Models that ran: not recorded yet\./)
	} finally { await t.close() }
})
