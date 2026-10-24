// Manual #45 card proof (3e), outside npm test/CI: every hold reason the engine (SEND 96c3a9e6) leaves on an item is shown in one line
// on the New and Classic cards, Redraft leads on a real change and Send anyway otherwise, the page passes exactly the holdDigest it
// showed, and sent.checks reads as history on Done. Fictional temp root, real page server in Edge, stub source and runner (no model).
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium, type Locator, type Page } from 'playwright-core'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-45-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { reviewDigest, reasonMessages, setHoldReasons } = await import('../src/core/owner-send.ts')
const { seedNext, seedOwned, seedChanges, stub } = await import('../test/fixture.ts')
type Store = InstanceType<typeof Store>
type Reason = NonNullable<import('../src/core/types.ts').Workflow['reason']>
type Unstamped = Reason extends infer R ? R extends Reason ? Omit<R, 'digest'> : never : never

const pass = (what: string) => console.log(`PASS ${what}`)
const procs = { start: () => ({ pid: 1 }), alive: () => false, kill: () => true, openWindow: () => {} }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

// A20 (Kim Lane in Spec review) as the engine leaves a held approved draft: each reason's digest is the engine's own.
function hold(store: Store, reasons: Unstamped[], legacy = false) {
	const wf = store.byCode('A20')!
	const stamped = reasons.map(r => ({ ...r, digest: reviewDigest(wf, reasonMessages({ ...r, digest: '' } as Reason)) }) as Reason)
	if (legacy) { wf.reason = stamped[0]; wf.reasons = undefined; wf.holdDigest = undefined } else setHoldReasons(wf, stamped)
	Object.assign(wf, { state: 'needs_human', ownerSend: { draft: structuredClone(wf.draft!), at: ago(30), askMsgId: wf.lastMsgId }, status: 'Your approved draft is kept. Send anyway or Redraft.' })
	store.save(wf, false)
}
const changedAsk = (changed: string): Unstamped => ({ kind: 'ask-edited', msgId: 'm-A20', before: 'Is the draft plan final?', text: 'Is the draft plan final, and can you send the risks by noon?', at: ago(5), changed })
const twoMessages = (changed: string): Unstamped => ({ kind: 'asker-wrote-again', msgId: '990002', msgIds: ['990001', '990002'], messages: [{ id: '990001', text: 'Also, can you send the rollback plan?', at: ago(12) }, { id: '990002', text: 'Daily plan status (4)', at: ago(6) }], text: 'Also, can you send the rollback plan?\n\nDaily plan status (4)', at: ago(6), changed })
const noReply = (why: string): Unstamped => ({ kind: 'no-reply-needed', why })

async function open(experience: 'new' | 'classic', seed: (store: Store) => void) {
	const store = seedOwned(seedChanges(seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-45-')), machine: 'test' }))))
	store.saveUi('react')
	seed(store)
	const { server, url } = await serveInbox(() => store, 0, randomBytes(16).toString('hex'))
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	await context.addInitScript(() => { (globalThis as { DELEGATE_POLL_MS?: number }).DELEGATE_POLL_MS = 80 })
	const page = await context.newPage(), errors: string[] = [], posts: unknown[] = []
	page.on('pageerror', error => errors.push(error.message))
	page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/v1/actions')) posts.push(r.postDataJSON()) })
	await page.goto(url + (experience === 'new' ? '#now' : '#classic/focus/A20'))
	await page.locator('main').waitFor()
	let card: Locator
	if (experience === 'new') {
		const row = page.locator('.now-row[data-code="A20"]')
		await row.getByRole('button', { name: 'Open', exact: true }).click()
		card = row.locator('.item-card').first()
	} else card = page.locator('.classic-open-card')
	await card.waitFor()
	return { store, page, card, posts, close: async () => {
		await context.close(); server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		assert.deepEqual(errors, [])
	} }
}
const primary = (card: Locator) => card.locator('button[data-primary=true]')
async function click(page: Page, button: Locator) {
	const posted = page.waitForResponse(r => r.url().includes('/api/v1/actions?') && r.request().method() === 'POST')
	await button.click()
	return (await posted).json()
}
async function sees(card: Locator, line: string) {
	await card.getByText(line, { exact: true }).waitFor({ timeout: 10_000 }).catch(async error => { throw new Error(`Expected "${line}"; the card says: ${await card.innerText()}`, { cause: error }) })
}

// PROOF_ONLY=late runs only case 5, so its race can be looped quickly (PE 19:40: 20 times).
for (const experience of process.env.PROOF_ONLY === 'late' ? [] : ['new', 'classic'] as const) {
	// 1. No reply looks needed, alone: Send anyway leads, Skip offered; it sends once.
	{
		const t = await open(experience, store => hold(store, [noReply('Kim only shared the plan status')]))
		try {
			await sees(t.card, 'Delegate thinks no reply is needed now: Kim only shared the plan status.')
			assert.equal(await primary(t.card).innerText(), 'Send anyway')
			await t.card.getByRole('button', { name: 'Skip', exact: true }).waitFor()
			assert.equal(await t.card.getByRole('button', { name: 'Redraft', exact: true }).count(), 0, 'nothing new to redraft against')
			await click(t.page, primary(t.card))
			await applyAnswers(t.store, stub, t.store.config(), procs as never)
			const wf = t.store.byCode('A20')!
			assert.ok(wf.sent, `sent (${wf.state}: ${wf.status})`)
			assert.equal(t.posts.length, 1)
			pass(`${experience}: no reply needed alone: one line, Send anyway leads, Skip offered, sent once`)
			// sent.checks reads as history on Done (the engine writes them; SEND 96c3a9e6).
			t.store.save({ ...wf, sent: { ...wf.sent!, checks: ['Kim posted again at 8:52 AM; nothing changed for you.'] } }, false)
			await t.page.goto(t.page.url().replace(/#.*$/, experience === 'new' ? '#done/replies' : '#classic/done'))
			const entry = t.page.locator('[data-activity-code="A20"]').first()
			await entry.waitFor()
			if (experience === 'new') await entry.locator('.done-title').click()
			else if (await entry.locator('summary').count()) await entry.locator('summary').click()
			await entry.getByText('Sent. Kim posted again at 8:52 AM; nothing changed for you.', { exact: true }).waitFor()
			pass(`${experience}: sent.checks shows on Done as "Sent. Kim posted again at 8:52 AM; nothing changed for you."`)
		} finally { await t.close() }
	}
	// 2. Kim wrote twice ("also, can you…?" then the unchanged digest): a real change; both messages count; Redraft leads and covers both.
	{
		const t = await open(experience, store => hold(store, [twoMessages('She also asks you for the rollback plan.')]))
		try {
			await sees(t.card, 'Kim wrote 2 more messages after you approved: She also asks you for the rollback plan.')
			assert.equal(await primary(t.card).innerText(), 'Redraft')
			await t.card.getByRole('button', { name: 'Send anyway', exact: true }).waitFor()
			await click(t.page, primary(t.card))
			await applyAnswers(t.store, stub, t.store.config(), procs as never)
			const wf = t.store.byCode('A20')!
			assert.equal(wf.state, 'running', `one rewrite starts (${wf.status})`)
			assert.deepEqual(wf.pending, ['990001', '990002'], 'Redraft covers both messages')
			assert.equal(wf.sent, undefined)
			pass(`${experience}: two new messages, a real change: "Kim wrote 2 more messages…", Redraft leads, one rewrite with both messages`)
		} finally { await t.close() }
	}
	// 3. An edited ask that changed and no reply needed, together: one line, Redraft leads, Skip stays; Send anyway sends once.
	{
		const t = await open(experience, store => hold(store, [noReply('it is a status digest'), changedAsk('She now wants the risks by noon.')]))
		try {
			await sees(t.card, 'Kim edited their message after you approved: She now wants the risks by noon. Delegate thinks no reply is needed now: it is a status digest.')
			assert.equal(await primary(t.card).innerText(), 'Redraft')
			await t.card.getByRole('button', { name: 'Skip', exact: true }).waitFor()
			await click(t.page, t.card.getByRole('button', { name: 'Send anyway', exact: true }))
			await applyAnswers(t.store, stub, t.store.config(), procs as never)
			assert.ok(t.store.byCode('A20')!.sent, `Send anyway passes both reasons shown (${t.store.byCode('A20')!.status})`)
			assert.equal(t.posts.length, 1)
			pass(`${experience}: two reasons, one sentence each, Redraft leads, Skip offered; Send anyway passes both and sends once`)
		} finally { await t.close() }
	}
	// 4. An item held before #45 (wf.reason only): read through the accessor, its old words, Send anyway leads.
	{
		const t = await open(experience, store => hold(store, [{ kind: 'asker-wrote-again', msgId: '990003', text: 'Any news?', at: ago(4) }], true))
		try {
			await sees(t.card, 'Kim wrote again after you approved.')
			assert.equal(await primary(t.card).innerText(), 'Send anyway')
			await t.card.getByRole('button', { name: 'Redraft', exact: true }).waitFor()
			await click(t.page, primary(t.card))
			await applyAnswers(t.store, stub, t.store.config(), procs as never)
			assert.ok(t.store.byCode('A20')!.sent, `an old hold still sends on Send anyway (${t.store.byCode('A20')!.status})`)
			pass(`${experience}: an item held before #45 shows "Kim wrote again after you approved.", Send anyway leads and sends`)
		} finally { await t.close() }
	}
	// 4b. Three reasons: two sentences on the card (the newest ask, then no reply); every reason in full in Details.
	{
		const t = await open(experience, store => hold(store, [noReply('it is a status digest'), changedAsk('She now wants the risks by noon.'), twoMessages('She also asks you for the rollback plan.')]))
		try {
			// The edited ask (5 min ago) is newer than the two messages (6 min ago), so it leads.
			await sees(t.card, 'Kim edited their message after you approved: She now wants the risks by noon. Delegate thinks no reply is needed now: it is a status digest.')
			assert.equal(await primary(t.card).innerText(), 'Redraft')
			const details = t.card.locator('summary', { hasText: 'Details' })
			await details.first().click()
			await sees(t.card, 'Why it waited: Kim edited their message after you approved: She now wants the risks by noon. Kim wrote 2 more messages after you approved: She also asks you for the rollback plan. Delegate thinks no reply is needed now: it is a status digest.')
			pass(`${experience}: three reasons: two sentences on the card, every reason in full in Details`)
			const lines = (await t.card.locator('.card-why-waited').innerText()).split('\n').map(line => line.trim()).filter(Boolean)
			assert.deepEqual(lines, ['Why it waited:', 'Kim edited their message after you approved: She now wants the risks by noon.', 'Kim wrote 2 more messages after you approved: She also asks you for the rollback plan.', 'Delegate thinks no reply is needed now: it is a status digest.'])
			pass(`${experience}: Details shows "Why it waited:" and then one reason per line`)
		} finally { await t.close() }
	}
}
// 5. The page passes exactly the hold it showed: a reason that arrives after the page drew the card refuses the click; nothing goes.
{
	const t = await open('new', store => hold(store, [noReply('Kim only shared the plan status')]))
	try {
		await sees(t.card, 'Delegate thinks no reply is needed now: Kim only shared the plan status.')
		// The card he is looking at stays as drawn (no page refresh), as when a reason arrives just before his click.
		await t.page.route('**/api/v1/page*', route => route.abort())
		hold(t.store, [noReply('Kim only shared the plan status'), changedAsk('She now wants the risks by noon.')])
		assert.equal(await primary(t.card).innerText(), 'Send anyway')
		const receipt = await click(t.page, primary(t.card))
		await t.page.unroute('**/api/v1/page*')
		await applyAnswers(t.store, stub, t.store.config(), procs as never)
		assert.equal(t.store.byCode('A20')!.sent, undefined, 'nothing was sent past a reason the card did not show')
		assert.ok(receipt.refused || /Changed since you looked/.test(receipt.text ?? ''), JSON.stringify(receipt))
		pass('new: a reason added after the card was drawn refuses its Send anyway (the exact rev carries holdDigest); nothing sent')
	} finally { await t.close() }
}
await browser.close()
