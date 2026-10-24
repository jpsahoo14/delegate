// Manual #44(2) proof, outside npm test/CI: kept to-dos only the owner can do are a "Left for you" section he ticks off. To-dos alone
// make a to-do card ("I've done these" leads); with a draft the reply card wins and the section sits after block 3. Ticking 2 of 3
// marks exactly those 2, only after the 6 s Undo window; Undo inside it sends nothing. Nothing is ever sent to anyone and the work is
// never closed. Fictional temp root, real page server in Edge, stub source and runner (no model). PROOF_SHOTS=<folder> keeps shots.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium, type Locator, type Page } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-442-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { seedNext, seedOwned, seedChanges, stub, item } = await import('../test/fixture.ts')
type Store = InstanceType<typeof Store>

const pass = (what: string) => console.log(`PASS ${what}`)
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const shot = async (page: Page, name: string) => { if (process.env.PROOF_SHOTS) await page.screenshot({ path: join(process.env.PROOF_SHOTS, `442-${name}.png`) }) }
const LINE = "Only you can do these. Ticking one off records it here; Delegate doesn't do it and nothing is sent."
const sentAt = new Date(Date.now() - 3 * 3600_000).toISOString()
const DAY = new Date(sentAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
const TODOS = ['Send Robin the test notes.', 'Fix the legacy Aurora check (P1).', 'Book the review room for Friday.']
let sends = 0
const source = { ...(stub as object), async send() { sends++; return { msgId: `m-sent-${sends}` } } } as never

async function open(hash: string) {
	const store = seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-442-')), machine: 'test' }))))
	// A301: his reply went; three tasks only he can do are left. A302: a new draft is waiting, with two tasks left from before.
	item(store, 'A301', 'Kim Lane', 'Aurora launch', { createdAt: sentAt, state: 'open', status: 'Sent', lastAsk: 'Can you take the launch prep?', sent: { msgId: 'm-a301', at: sentAt },
		kept: TODOS.map((text, n) => ({ id: `t${n + 1}`, text, at: sentAt })) })
	item(store, 'A302', 'Kim Lane', 'Aurora launch', { createdAt: sentAt, state: 'needs_human', lastAsk: 'Is the room booked?', sent: { msgId: 'm-a302', at: sentAt },
		draft: { text: 'Yes, the room is booked for Friday.', commitment: false, sources: [] }, kept: TODOS.slice(0, 2).map((text, n) => ({ id: `t${n + 1}`, text, at: sentAt })) })
	// A303, a 1:1: one task left, a PR comment Delegate couldn't post, and one he can do.
	item(store, 'A303', 'Kim Lane', 'Kim Lane', { createdAt: sentAt, state: 'open', status: 'Sent', lastAsk: 'Can you post the review?', sent: { msgId: 'm-a303', at: sentAt },
		chat: { id: '19:kim-1on1@thread.v2', name: 'Kim Lane', test: false, group: false },
		kept: [{ id: 't1', text: 'Post the review comment on PR 4200001. Not made for you: Azure DevOps was not reachable', at: sentAt }, { id: 't2', text: 'Book the review room for Friday.', at: sentAt },
			{ id: 't3', text: 'Not made for you: the review room calendar is not one of the tools you allow', at: sentAt }] })
	store.saveUi('react')
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'))
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
	await context.addInitScript(() => { (globalThis as { DELEGATE_POLL_MS?: number }).DELEGATE_POLL_MS = 80 })
	const page = await context.newPage(), errors: string[] = [], posts: unknown[] = []
	page.on('pageerror', error => errors.push(error.message))
	page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/v1/actions')) posts.push(r.postDataJSON()) })
	await page.goto(url + hash)
	await page.locator('main').waitFor()
	return { store, page, posts, close: async () => {
		await context.close(); server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		assert.deepEqual(errors, [])
	} }
}
async function card(page: Page, experience: 'new' | 'classic', code: string): Promise<Locator> {
	if (experience === 'classic') { await page.goto(page.url().replace(/#.*$/, `#classic/focus/${code}`)); const c = page.locator('.classic-open-card .item-card'); await c.waitFor(); return c }
	const row = page.locator(`.now-row[data-code="${code}"]`)
	await row.locator('.row-title').click()
	const c = row.locator('.item-card').first(); await c.waitFor(); return c
}
const kept = (store: Store, code: string) => store.byCode(code)!.kept!.map(todo => `${todo.id}:${todo.done ? 'done' : 'open'}`)

for (const experience of ['new', 'classic'] as const) {
	// 1. To-dos only: a to-do card. Tick 2 of 3 → after 6 s only those 2 are marked; nothing is sent; the work stays open.
	{
		const t = await open(experience === 'new' ? '#now' : '#classic/home')
		try {
			if (experience === 'new') {
				const row = t.page.locator('.now-row[data-code="A301"]')
				await row.getByText(`${TODOS[0]} (+2 more)`).waitFor()
				assert.equal(await row.getByRole('button', { name: 'Mark done' }).count(), 0, 'no Mark done on the row')
				await row.getByRole('button', { name: 'Open', exact: true }).waitFor()
				pass('new: the row line reads "Left for you: <first task> (+2 more)" and its button is Open, not Mark done')
			} else {
				// PM 20:15: Classic's "In progress" row no longer offers "Mark N to-dos done" or its confirm; it says what is left and opens the card.
				await t.page.goto(t.page.url().replace(/#.*$/, '#classic/ongoing'))
				const row = t.page.locator('li[data-classic-progress="A301"]')
				await row.locator('[data-left-for-you]').getByText(`Left for you: ${TODOS[0]} (+2 more)`, { exact: true }).waitFor()
				assert.equal(await row.getByRole('button').count(), 0, 'the row offers no button: no Mark N to-dos done, no Close while to-dos are open')
				assert.doesNotMatch(await t.page.locator('main').innerText(), /to-dos? done|Mark exactly these/i)
				await row.getByRole('link', { name: 'Open', exact: true }).click()
				await t.page.waitForURL(/#classic\/focus\/A301$/)
				pass('classic: the In progress row reads "Left for you: <first task> (+2 more)", has no Mark N to-dos done (or Close), and Open goes to the card')
			}
			const c = await card(t.page, experience, 'A301')
			assert.equal(await c.getAttribute('data-mode'), 'todo')
			const section = c.locator('.card-left-for-you')
			await section.getByRole('heading', { name: 'Left for you' }).waitFor()
			await section.getByText(LINE, { exact: true }).waitFor()
			assert.equal(await section.getByRole('checkbox').count(), 3)
			assert.equal(await section.getByRole('checkbox', { checked: true }).count(), 0, 'every box starts unticked')
			await section.getByRole('button', { name: 'Tick all' }).waitFor()
			const done = c.locator('button[data-primary=true]')
			assert.equal((await done.innerText()).trim(), "I've done these")
			assert.equal(await done.isDisabled(), true, 'disabled until a box is ticked')
			assert.equal(await c.getByText('Still to do from an earlier reply').count(), 0)
			assert.equal(await c.getByRole('button', { name: 'Write the reply yourself' }).count(), 0)
			const origin = section.locator('.todo-source').first()
			assert.equal((await origin.innerText()).trim(), `From your reply to Kim in Aurora launch · ${DAY}`)
			assert.match(await origin.getAttribute('href') ?? '', /^https:\/\/teams\.microsoft\.com\//, 'the line opens the sent reply in Teams')
			assert.equal(await section.locator('.todo-source').count(), 3, 'one source line per task')
			assert.doesNotMatch(await section.innerText(), /A301|https?:/, 'no code or link in the words')
			await section.getByRole('checkbox').nth(0).check(); await section.getByRole('checkbox').nth(2).check()
			assert.equal((await done.innerText()).trim(), "I've done these (2)")
			await shot(t.page, `${experience}-todo-card`)
			pass(`${experience}: to-dos only make a to-do card: "Left for you", the line, 3 unticked boxes, Tick all, "I've done these" leads and is disabled until a tick`)
			const before = t.posts.length
			await done.click()
			await section.getByText(`Done: ${TODOS[0]} ·`).waitFor()
			await section.getByText(`Done: ${TODOS[2]} ·`).waitFor()
			await t.page.waitForTimeout(1500)
			assert.equal(t.posts.length, before, 'nothing is sent while Undo is open')
			await t.page.waitForResponse(r => r.url().includes('/api/v1/actions?') && r.request().method() === 'POST', { timeout: 8000 })
			const posted = t.posts.at(-1) as { input?: { picks?: number[] } }
			assert.deepEqual(posted.input?.picks, [1, 3])
			await applyAnswers(t.store, source, t.store.config(), procs as never)
			assert.deepEqual(kept(t.store, 'A301'), ['t1:done', 't2:open', 't3:done'], 'only the 2 ticked are marked')
			assert.equal(t.store.byCode('A301')!.state, 'open', 'the work stays open')
			assert.equal(sends, 0, 'nothing was sent to anyone')
			for (const until = Date.now() + 10_000; await section.getByRole('checkbox').count() !== 1;) { if (Date.now() > until) throw new Error(`the card still lists ${await section.getByRole('checkbox').count()}`); await t.page.waitForTimeout(100) }
			pass(`${experience}: tick 2 of 3 → "✓ Done: … · Undo" for 6 s, then exactly t1 and t3 are marked; t2 stays, nothing is sent, the work stays open`)
			// 2. Undo inside the window: nothing is sent and the tick comes back.
			await section.getByRole('checkbox').first().check()
			const posts = t.posts.length
			await c.locator('button[data-primary=true]').click()
			await section.getByRole('button', { name: 'Undo' }).click()
			await t.page.waitForTimeout(7000)
			assert.equal(t.posts.length, posts, 'Undo inside the window sends nothing')
			assert.equal(await section.getByRole('checkbox', { checked: true }).count(), 1, 'the tick comes back')
			assert.deepEqual(kept(t.store, 'A301'), ['t1:done', 't2:open', 't3:done'])
			pass(`${experience}: Undo within 6 s sends nothing and keeps the tick`)
		} finally { await t.close() }
	}
	// 2b. A 1:1, with a change Delegate couldn't make: "From your reply to Kim · <day>", and "Delegate couldn't do this · Why?".
	{
		const t = await open(experience === 'new' ? '#now' : '#classic/home')
		try {
			const c = await card(t.page, experience, 'A303')
			const section = c.locator('.card-left-for-you')
			await section.getByText('Post the review comment on PR 4200001.', { exact: true }).waitFor()
			assert.doesNotMatch(await section.innerText(), /Not made for you/)
			const why = section.locator('details.todo-why')
			assert.equal((await why.locator('summary').innerText()).trim(), "Delegate couldn't do this · Why?")
			await why.locator('summary').click()
			await why.getByText('Azure DevOps was not reachable.', { exact: true }).waitFor()
			assert.equal((await section.locator('span.todo-source:not(.todo-why), a.todo-source').innerText()).trim(), `From your reply to Kim · ${DAY}`)
			// PE 20:12: a to-do that is only "Not made for you: <reason>" has an empty what; the reason is the line, not the raw prefix.
			await section.getByText('The review room calendar is not one of the tools you allow.', { exact: true }).waitFor()
			assert.equal((await section.locator('span.todo-why').innerText()).trim(), "Delegate couldn't do this")
			assert.equal(await section.getByRole('checkbox').count(), 3)
			await shot(t.page, `${experience}-sources`)
			pass(`${experience}: a 1:1 reads "From your reply to Kim · ${DAY}"; a change Delegate couldn't make reads "Delegate couldn't do this · Why?" with its reason; a refusal-only to-do reads its reason as the line`)
		} finally { await t.close() }
	}
	// 3. To-dos plus a draft: the reply card wins; "Left for you" sits after block 3 with its own outline button.
	{
		const t = await open(experience === 'new' ? '#now' : '#classic/home')
		try {
			const c = await card(t.page, experience, 'A302')
			assert.equal(await c.getAttribute('data-mode'), 'reply')
			assert.equal((await c.locator('button[data-primary=true]').innerText()).trim(), 'Send')
			const section = c.locator('.card-left-for-you')
			await section.getByText(LINE, { exact: true }).waitFor()
			const own = section.getByRole('button', { name: "I've done these" })
			assert.equal(await own.isDisabled(), true)
			assert.equal(await own.getAttribute('data-primary'), null, 'an outline button in the section, not the primary')
			const placed = await c.evaluate(el => { const s = el.querySelector('.card-left-for-you'), bar = el.querySelector('.card-actions'); return !!s && !!bar && !!(s.compareDocumentPosition(bar) & 4) })
			assert.ok(placed, 'the section comes before the bar')
			await shot(t.page, `${experience}-reply-card`)
			pass(`${experience}: to-dos plus a draft: the reply card (Send leads), "Left for you" before the bar with a disabled outline "I've done these"`)
		} finally { await t.close() }
	}
}
await browser.close()
