// Manual #47 proof, outside npm test/CI: the page result line names the person and chat with Open and close, never the bare chat
// receipt; pending clicks are a grey list, never red for a busy server, polled 2/4/8/15 (scaled); a reload never brings a line back.
// Fictional temp root, real page server in Edge, stub source and runner (no model).
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium, type Page } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-47-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { ulid } = await import('../src/core/ids.ts')
const { seedNext, seedOwned, seedChanges, stub } = await import('../test/fixture.ts')

const POLL = 80
const pass = (what: string) => console.log(`PASS ${what}`)
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
type Store = InstanceType<typeof Store>

async function open(hash: string) {
	const store = seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-47-')), machine: 'test' }))))
	store.saveUi('react')
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'))
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	await context.addInitScript(ms => { (globalThis as { DELEGATE_POLL_MS?: number }).DELEGATE_POLL_MS = ms }, POLL)
	const page = await context.newPage(), errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(url + hash)
	await page.locator('main').waitFor()
	return { store, page, url, close: async () => {
		await page.unrouteAll({ behavior: 'wait' }); await context.close(); server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		assert.deepEqual(errors, [])
	} }
}
const line = (page: Page) => page.locator('.live-result')
async function cleared(page: Page, ms = 10_000) {
	for (const until = Date.now() + ms; (await line(page).innerText()) !== '';) { if (Date.now() > until) throw new Error('The result line did not clear'); await page.waitForTimeout(50) }
}
const red = (page: Page) => page.locator('main [role=alert].error, main .error')
// The asker writes again after the owner pressed Send: the runner holds it (asker-wrote-again), as live.
const AGAIN_AT = new Date().toISOString()
function wroteAgain(store: Store, chat: string) {
	const at = AGAIN_AT, from = { id: 'kim lane', name: 'Kim Lane' }
	return { ...(stub as object), async newMessages(id: string) { return id === chat ? { msgs: [{ id: '990001', at, from, html: false, body: '@Robin Park also, is the launch date fixed?' }], newest: '990001', truncated: false } : { msgs: [], truncated: false } } } as never
}
// The warm host's one-shot check (#45) says the new message changes what is asked of the owner, so the Send is held.
const quick = async () => ({ stillAnswers: 'no', changed: 'She now asks whether the launch date is fixed.' })
async function runner(store: Store, src = stub) { await applyAnswers(store, src, store.config(), procs as never, false, undefined, quick) }
async function click(page: Page, button: ReturnType<Page['getByRole']>) {
	const posted = page.waitForResponse(r => r.url().includes('/api/v1/actions?') && r.request().method() === 'POST')
	await button.click(); await posted
}

async function held(experience: 'new' | 'classic') {
	const t = await open(experience === 'new' ? '#now' : '#classic/focus/A20')
	try {
		const chat = t.store.byCode('A20')!.chat.id
		const card = experience === 'new' ? t.page.locator('.now-row[data-code="A20"]') : t.page.locator('.classic-open-card')
		if (experience === 'new') { await card.getByRole('button', { name: 'Open', exact: true }).click(); await card.locator('.item-card').first().waitFor() }
		await click(t.page, card.getByRole('button', { name: 'Send', exact: true }))
		await runner(t.store, wroteAgain(t.store, chat))
		assert.equal(t.store.byCode('A20')!.reason?.kind, 'asker-wrote-again', 'the runner held the Send')
		await line(t.page).getByText(/^Your reply to Kim in Spec review wasn't sent: /).waitFor()
		const shown = (await line(t.page).locator('span').innerText()).trim()
		assert.match(shown, /^Your reply to Kim in Spec review wasn't sent: Kim wrote again after you approved: She now asks whether the launch date is fixed\.$/, shown)
		assert.doesNotMatch(await line(t.page).innerText(), /A20|Not sent/, 'no code and no chat wording on the page')
		assert.equal(await line(t.page).getAttribute('title') !== null, true, 'the code is in the tooltip')
		assert.equal(await red(t.page).count(), 0, 'nothing red')
		await line(t.page).getByRole('button', { name: 'Close this message' }).waitFor()
		if (process.env.PROOF_SHOTS) { await t.page.evaluate('window.scrollTo(0, 0)'); await t.page.screenshot({ path: join(process.env.PROOF_SHOTS, `47-${experience}-held.png`) }) }
		pass(`${experience}: a held Send names Kim and the chat with the card's held line, Open and close; no code, nothing red`)
		// Open goes to the card and clears the line.
		await line(t.page).getByRole('link', { name: 'Open', exact: true }).click()
		await cleared(t.page)
		const route = await t.page.evaluate<string>('location.hash')
		if (experience === 'new') assert.match(route, /^#now\//)
		else assert.equal(route, '#classic/focus/A20')
		await (experience === 'new' ? card.getByRole('button', { name: 'Send anyway', exact: true }) : t.page.locator('.classic-open-card').getByRole('button', { name: 'Send anyway', exact: true })).waitFor()
		pass(`${experience}: Open goes to the held card (${route}) and clears the line`)
		// Send anyway that sends replaces the line with "Sent to Kim …"; a reload never brings a closed line back.
		const sendAnyway = experience === 'new' ? card.getByRole('button', { name: 'Send anyway', exact: true }) : t.page.locator('.classic-open-card').getByRole('button', { name: 'Send anyway', exact: true })
		await click(t.page, sendAnyway)
		await runner(t.store, wroteAgain(t.store, chat))
		assert.ok(t.store.byCode('A20')!.sent, `Send anyway sent the reply (state ${t.store.byCode('A20')!.state}: ${t.store.byCode('A20')!.status}; outcomes ${JSON.stringify(t.store.answers().length)})`)
		await line(t.page).getByText('Sent to Kim in Spec review.', { exact: true }).waitFor()
		pass(`${experience}: after Send anyway the line is "Sent to Kim in Spec review."`)
		await line(t.page).getByRole('button', { name: 'Close this message' }).click()
		assert.equal(await line(t.page).innerText(), '')
		await t.page.reload(); await t.page.locator('main').waitFor(); await t.page.waitForTimeout(500)
		assert.equal(await line(t.page).innerText(), '', 'a reload does not bring the closed line back')
		pass(`${experience}: close clears the line and a reload does not bring it back`)
	} finally { await t.close() }
}

// Every outcome kind has its own words, built from the stored outcome and the item, never the chat text (PE 18:40, PM 19:12).
// Each receipt is saved as the runner or page server leaves it, carrying a chat text with the code, which must never show.
type Outcome = NonNullable<import('../src/store/state.ts').PageSubmission['outcome']>
const until = new Date(Date.now() + 6 * 86_400_000).toISOString()
const kinds: { what: string; item: string; outcome?: Outcome; who?: string; chat?: string; words?: string; tone?: string; open: boolean }[] = [
	{ what: 'queued', item: 'A20', outcome: { kind: 'queued', action: 'redraft' }, words: 'Working on it for Kim in Spec review…', tone: 'muted', open: true },
	{ what: 'done: dismiss', item: 'A20', outcome: { kind: 'done', action: 'dismiss' }, words: "Dismissed Kim's message.", open: true },
	{ what: 'done: answer', item: 'A20', outcome: { kind: 'queued', action: 'answer' }, words: 'Got your answer; redrafting your reply to Kim.', tone: 'muted', open: true },
	{ what: 'done: reopen', item: 'A20', outcome: { kind: 'done', action: 'reopen' }, words: "Reopened Kim's message.", open: true },
	{ what: 'done: 2 to-dos', item: 'A20', outcome: { kind: 'done', action: 'todo-done', count: 2 }, words: 'Marked 2 tasks done.', open: true },
	{ what: 'done: watch', item: 'A20', outcome: { kind: 'done', action: 'watch-fyi', watch: { target: 'PR 4200001', until } }, words: `Watching PR 4200001 until ${new Date(until).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`, open: true },
	{ what: 'done: any other action', item: 'A20', outcome: { kind: 'done', action: 'take-back' }, words: 'Done for Kim.', open: true },
	{ what: 'refused: stale', item: 'A20', outcome: { kind: 'refused', action: 'later', stale: true }, words: "Couldn't do that for Kim: it changed since you looked.", open: true },
	{ what: 'failed, no reason, closed item', item: 'A999', outcome: { kind: 'failed', action: 'dismiss' }, who: 'Lin', chat: 'Release sync', words: "Couldn't do that for Lin; open it to see why.", tone: 'warn', open: false },
	{ what: 'sent in a 1:1, closed item', item: 'A999', outcome: { kind: 'sent' }, who: 'Arun', words: 'Sent to Arun.', open: false },
	{ what: 'a receipt from before outcomes: hidden', item: 'A20', open: false },
]
async function everyKind(experience: 'new' | 'classic') {
	const t = await open(experience === 'new' ? '#now' : '#classic/home')
	try {
		for (const k of kinds) {
			const id = crypto.randomUUID(), rev = `rev-${k.what}`
			t.store.savePageSubmission({ id, answerId: ulid(), fingerprint: 'fixture', item: k.item, rev, at: new Date().toISOString(), phase: 'queued', accepted: true, ids: [],
				text: `Skipped ${k.item}. Not done ${k.item}: chat wording.`, processed: true, status: 200, refused: k.outcome?.kind === 'refused' || k.outcome?.kind === 'failed' || undefined,
				...(k.outcome ? { outcome: k.outcome } : {}), ...(k.who ? { who: k.who } : {}), ...(k.chat ? { chat: k.chat } : {}) })
			await t.page.evaluate(({ id, rev, item }) => sessionStorage.setItem('delegate-react-pending-v1', JSON.stringify([{ submissionId: id, item, rev, action: `${item}/x`, at: Date.now() }])), { id, rev, item: k.item })
			await t.page.reload(); await t.page.locator('main').waitFor()
			if (k.words) await line(t.page).getByText(k.words, { exact: true }).waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`${k.what}: expected "${k.words}", shown "${await line(t.page).innerText()}"`, { cause: error }) })
			else {
				for (const until = Date.now() + 3000; await t.page.evaluate<number>("JSON.parse(sessionStorage.getItem('delegate-react-pending-v1') ?? '[]').length") > 0;) { if (Date.now() > until) throw new Error('the old receipt was not completed'); await t.page.waitForTimeout(50) }
				await t.page.waitForTimeout(300)
				assert.equal(await line(t.page).innerText(), '', `${k.what}: no line`)
			}
			const shown = await line(t.page).innerText()
			assert.doesNotMatch(shown, /A20|A999|Skipped|Not done|chat wording/, `${k.what}: no chat text or code`)
			if (k.words) assert.equal(await line(t.page).getByRole('link', { name: 'Open', exact: true }).count(), k.open ? 1 : 0, `${k.what}: Open`)
			assert.equal(await line(t.page).getAttribute('data-tone'), k.tone ?? null, `${k.what}: tone`)
			assert.equal(await red(t.page).count(), 0, `${k.what}: nothing red`)
		}
		pass(`${experience}: every outcome has its own words (${kinds.length} kinds: queued grey, past tense per action, refused/failed with or without a reason, 1:1 send, pre-outcome receipt hidden); never the chat text or a code`)
		// A real Later through the runner: its own past tense.
		const card = experience === 'new' ? t.page.locator('.now-row[data-code="A20"]') : t.page.locator('.classic-open-card')
		if (experience === 'new') { await card.getByRole('button', { name: 'Open', exact: true }).click(); await card.locator('.item-card').first().waitFor() }
		else { await t.page.goto(t.page.url().replace(/#.*$/, '#classic/focus/A20')); await card.waitFor() }
		await click(t.page, card.getByRole('button', { name: 'Later', exact: true }))
		await runner(t.store)
		await line(t.page).getByText("Kim's message is in Later.", { exact: true }).waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`Later: shown "${await line(t.page).innerText()}"`, { cause: error }) })
		pass(`${experience}: a real Later through the runner reads "Kim's message is in Later."`)
	} finally { await t.close() }
}

async function closedItem(experience: 'new' | 'classic') {
	const t = await open(experience === 'new' ? '#now' : '#classic/home')
	try {
		const id = crypto.randomUUID(), rev = 'gone-revision'
		t.store.savePageSubmission({ id, answerId: ulid(), fingerprint: 'fixture', item: 'A999', rev, at: new Date().toISOString(), phase: 'queued',
			accepted: true, ids: [], text: 'Sent A999 to Lin Brook.', processed: true, status: 200, outcome: { kind: 'sent' }, who: 'Lin', chat: 'Release sync' })
		await t.page.evaluate(({ id, rev }) => sessionStorage.setItem('delegate-react-pending-v1', JSON.stringify([{ submissionId: id, item: 'A999', rev, action: 'A999/approve', at: Date.now() }])), { id, rev })
		await t.page.reload()
		await line(t.page).getByText('Sent to Lin in Release sync.', { exact: true }).waitFor()
		assert.equal(await line(t.page).getByRole('link', { name: 'Open' }).count(), 0, 'a closed item has no Open')
		assert.doesNotMatch(await line(t.page).innerText(), /A999/)
		pass(`${experience}: a closed item's line uses the kept who and chat and has no Open`)
	} finally { await t.close() }
}

async function busy(experience: 'new' | 'classic') {
	const t = await open(experience === 'new' ? '#now' : '#classic/home')
	try {
		const rev = await t.page.evaluate<string>("fetch('/api/v1/page' + location.search).then(r => r.json()).then(p => p.entities.items.A20.rev)")
		const id = crypto.randomUUID(), times: number[] = []
		let answers = 0
		await t.page.route('**/api/v1/result?*', route => {
			times.push(Date.now())
			// 202 (still working), a lost poll, then 202 again: all busy.
			if (++answers === 3) return route.abort()
			return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ working: true, text: 'Still working on it' }) })
		})
		await t.page.evaluate(({ id, rev }) => sessionStorage.setItem('delegate-react-pending-v1', JSON.stringify([{ submissionId: id, item: 'A20', rev, action: 'A20/approve', at: Date.now() }])), { id, rev })
		await t.page.reload()
		const toggle = t.page.getByRole('button', { name: 'Finishing 1 earlier click…', exact: true })
		await toggle.waitFor()
		await t.page.waitForTimeout(POLL * (1 + 2 + 4 + 7.5 + 7.5) + 600)
		const gaps = times.slice(1).map((at, i) => at - times[i])
		const want = [2, 4, 7.5, 7.5].map(n => n * POLL)
		assert.ok(gaps.length >= 4, `polls: ${gaps.join(', ')}`)
		for (const [i, w] of want.entries()) assert.ok(gaps[i] >= w * 0.85 && gaps[i] <= w + 250, `gap ${i + 1} is ${gaps[i]} ms, want about ${w} (all: ${gaps.join(', ')})`)
		assert.equal(await red(t.page).count(), 0, 'a busy server (202, a lost poll) shows nothing red')
		await toggle.click()
		await t.page.locator('#pending-clicks-list').getByText('Kim in Spec review').waitFor()
		if (process.env.PROOF_SHOTS) await t.page.screenshot({ path: join(process.env.PROOF_SHOTS, `47-${experience}-pending.png`) })
		assert.equal(await t.page.locator('#pending-clicks-list').getByRole('link', { name: 'Open' }).count(), 1)
		pass(`${experience}: a busy server shows grey "Finishing 1 earlier click…" listing Kim in Spec review; after the first poll the gaps are ${gaps.slice(0, 4).join('/')} ms (4/8/15/15 s at ${POLL} ms per 2 s)`)
		// Any answer starts again fast: here the server has no record, and a click saved without its request (#42 W7) is not
		// replayed, so nothing is posted.
		await t.page.unroute('**/api/v1/result?*')
		const posted = await t.page.waitForRequest(r => r.url().includes('/api/v1/actions?') && r.method() === 'POST', { timeout: POLL * 7.5 + 1000 }).then(() => true, () => false)
		assert.equal(posted, false, 'nothing is posted')
		pass(`${experience}: after the busy spell nothing is sent again`)
	} finally { await t.close() }
}

async function revChange() {
	const t = await open('#now')
	try {
		const card = t.page.locator('.now-row[data-code="A20"]')
		await card.getByRole('button', { name: 'Open', exact: true }).click(); await card.locator('.item-card').first().waitFor()
		await click(t.page, card.getByRole('button', { name: 'Send', exact: true }))
		await runner(t.store, wroteAgain(t.store, t.store.byCode('A20')!.chat.id))
		await line(t.page).getByText(/^Your reply to Kim/).waitFor()
		await t.page.waitForTimeout(POLL * 30)
		assert.notEqual(await line(t.page).innerText(), '', 'the line stays while the card is unchanged')
		const wf = t.store.byCode('A20')!
		t.store.save({ ...wf, draft: { ...wf.draft!, text: 'Yes, the plan is final. Launch moves to Oct 25.' }, revAt: new Date().toISOString() }, false)
		await cleared(t.page)
		pass('new: the line clears when the card changes')
	} finally { await t.close() }
}

try {
	for (const experience of ['new', 'classic'] as const) {
		await held(experience)
		await closedItem(experience)
		await everyKind(experience)
		await busy(experience)
	}
	await revChange()
} finally { await browser.close() }
