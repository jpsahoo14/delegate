// Golden master for the page: every tab, card type, and sheet drawn from the seeded store, in light and dark (B37, R14 step 1).
// The page code may move; what it draws may not. GOLDEN_UPDATE=1 rewrites the files after a change that is meant.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// One clock and one time zone for the store, the server, and the browser, so relative times draw the same on every run.
process.env.TZ = 'UTC'
const NOW = Date.parse('2026-10-20T10:00:00.000Z')
mock.timers.enable({ apis: ['Date'], now: NOW })
process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-glocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { serveInbox, writeSnapshot } = await import('../src/web/server.ts')
const { seedInbox, seedNext, seedQuiet, pauseNext } = await import('./fixture.ts')

const PW = process.env.PLAYWRIGHT_CORE ?? (() => { try { return createRequire(import.meta.url).resolve('playwright-core').replace(/index\.js$/, 'index.mjs') } catch { return '' } })()
const skip = existsSync(PW) ? false : 'playwright-core not found (set PLAYWRIGHT_CORE)'
const DIR = fileURLToPath(new URL('./golden/', import.meta.url))
const UPDATE = process.env.GOLDEN_UPDATE === '1'
// deno-lint-ignore no-explicit-any
type Page = any
// deno-lint-ignore no-explicit-any
let browser: any

before(async () => {
	if (skip) return
	const { chromium } = await import(pathToFileURL(PW).href)
	browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
})
after(async () => { await browser?.close(); mock.timers.reset() })

// Each state: the address to open and what to click there. A fresh page each, so no state leaks from one to the next.
const STATES: [name: string, hash: string, steps?: (p: Page) => Promise<void>][] = [
	['home', '#home'],
	['home-report', '#home', p => p.click('[data-act=reportopen]')],
	...['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map(c => [`focus-${c}`, `#focus/${c}`] as [string, string]),
	['focus-A1-menu', '#focus/A1', p => p.click('#card-A1 [data-act=menu]')],
	['focus-A1-edit', '#focus/A1', p => p.click('#card-A1 .lbl-row [data-act=edit]')],
	['focus-A1-thread', '#focus/A1', p => p.click('#card-A1 .ask [data-act=thread]')],
	['focus-A1-why', '#focus/A1', p => p.click('#card-A1 details.why summary')],
	['focus-A3-other', '#focus/A3', p => p.click('label:has(#o-A3-o)')],
	['focus-A4-picks', '#focus/A4', async p => { await p.click('label:has(#o-A4-1)'); await p.click('label:has(#o-A4-3)') }],
	['focus-A6-uncheck', '#focus/A6', p => p.click('label:has(#cm-A6-1)')],
	['focus-keys', '#focus/A1', p => p.click('[data-act=keys]')],
	...['', '/all', '/replies', '/reviews', '/changes', '/reminders', '/learned', '/catchup', '/closed'].map(f => [`done${f.replace('/', '-')}`, `#done${f}`] as [string, string]),
	['done-replies-A10-mark', '#done/replies', async p => { await p.click('li[data-code=A10] summary'); await p.click('li[data-code=A10] [data-act=markopen]'); await p.click('li[data-code=A10] [data-act=markkind][data-v=unneeded]') }],
	['ongoing', '#ongoing'],
	['ongoing-sheet-pick', '#automations/new'],
	['ongoing-sheet-remind', '#ongoing', async p => { await p.click('[data-act=newauto]'); await p.click('[data-act=tpl][data-v=remind]'); await p.click('[data-act=someone]') }],
	['ongoing-sheet-watch', '#ongoing', async p => { await p.click('[data-act=newauto]'); await p.click('[data-act=tpl][data-v=watch]'); await p.click('[data-act=wsby][data-v=fri]') }],
	['knowledge', '#knowledge'],
	['knowledge-uncheck', '#knowledge', p => p.locator('label:has([data-fact="1"])').first().click()],
	['settings', '#settings'],
	['settings-system', '#settings/system'],
	['settings-more', '#settings/system', p => p.click('details.adv summary')],
	['unknown-route', '#nowhere'],
]

// The rest of what the page can draw, from the seeds the browser tests use: Catch up lines, closed rows, promises, open work,
// asks nobody answered, a watched channel, a habit suggestion, and a watch with its timing.
// deno-lint-ignore no-explicit-any
function seedRich(s: any) {
	const base = s.workflows().find((w: { code: string }) => w.code === 'A10')
	const now = Date.now(), iso = (ms: number) => new Date(ms).toISOString()
	for (const [i, line, weight, gist] of [[1, 'Shared the v5 spec as a pre-read', 'high', 'Free-text locations allowed; ring 1 stays Oct 24. Nothing asked of you.'], [2, 'Posted the config PR', 'normal', 'Raises the event size limit to 10k.'], [3, 'Moved standup to 10:30', 'normal', ''], [4, 'Thanked the team', 'normal', '']] as const)
		s.save({ ...base, id: `f${i}`, code: `A${40 + i}`, intent: 'none', sent: undefined, draft: undefined, status: 'cc', lastMsgId: `17000000000${i}`, chat: { ...base.chat, id: '19:spec@thread.v2', test: false }, fyi: { line, weight, ...(gist ? { gist } : {}), ...(i === 2 ? { watch: { target: 'config PR 4200003', until: 'it merges' } } : {}) }, asker: { id: `p${i}`, name: ['Dev Rao', 'Pia Lin', 'Kim Ito', 'Sam Lee'][i - 1] }, updatedAt: iso(now - i * 60_000) }, false)
	s.save({ ...base, id: 'no', code: 'A51', intent: 'other', sent: undefined, status: 'No reply needed', closedBy: 'nothing', asker: { id: 'y', name: 'Yan' }, updatedAt: iso(now) }, false)
	const a1 = s.byCode('A1')
	s.save({ ...a1, todos: ['Ping the partner PM'], follow: { target: 'incident 2100', until: 'the partner team responds', everyHours: 2 } })
	const tr = s.byCode('A8')
	s.saveJob({ schema: 1, id: 'jw', key: 'track:x', goal: 'Check', session: { agent: 'copilot', id: 's' }, state: 'done', purpose: 'work', parents: [tr.id], asks: [], every: 240, endsAt: iso(now + 3 * 86_400_000), createdAt: iso(now), updatedAt: iso(now) })
	s.save({ ...tr, job: 'jw' })
	const at = iso(now - 4 * 86_400_000)
	const work = { goal: 'Mail delivery fixed by the partner team', doneWhen: 'the customer confirms', waitingOn: { who: 'Partner MTA team', where: 'incident 2100', since: at }, steps: [{ at, what: 'Replied: I reactivated incident 2100.' }, { at, what: 'incident 2100: partner asks for trace IDs', news: true }], links: ['incident:2100'], plan: [{ id: 'p1', what: 'Partner posts a fix', who: 'them', done: at }, { id: 'p2', what: 'CI build 52000001 passes', who: 'them', in: 'A2', probe: { build: 52000001, project: 'T' }, seen: 'InProgress' }] }
	const a2 = s.byCode('A2')
	s.save({ ...a2, draft: undefined, choices: undefined, effects: undefined, question: 'No news on "Mail delivery fixed" since 2026-10-16. Answer "A2: nudge them", "wait A2: 3d", or "close A2".', status: 'No news since 2026-10-16', sent: { msgId: 'm1', at, text: 'I reactivated incident 2100.' }, work })
	s.save({ ...base, id: 'op', code: 'A12', state: 'open', intent: 'status_next_step', status: 'Waiting on the partner', asker: { id: 'q', name: 'Quinn Diaz' }, sent: { msgId: 'm2', at, text: 'On it.' }, work: { ...work, goal: 'Trace IDs collected', checkAt: iso(now + 2 * 86_400_000) }, updatedAt: iso(now - 3_600_000) }, false)
	s.saveWaiting([{ code: 'W1', chat: { id: '19:w@thread.v2', name: 'Release sync' }, msgId: '1700', at: iso(now - 30 * 3_600_000), to: ['Meera Iyer'], text: 'Can you share the ring 1 numbers before Friday?', state: 'waiting' }])
	s.saveConfig({ ...s.config(), showDetails: true, channels: [{ teamId: 'team-1', channelId: '19:abc@thread.tacv2', name: 'Events dev' }] })
	s.saveHabits([{ key: 'send:sri:status_next_step:direct', code: 'H1', kind: 'send', text: 'You sent your last 6 replies to Alex (status next step) without changes. Let those go by themselves?', does: 'Replies to Alex in your 1:1 about status next step go out by themselves.', evidence: { count: 6, days: 4, total: 6, links: [] }, rule: { id: 'learned-sri', text: 'Learned: replies to Alex in 1:1 about status next step go by themselves', who: { accounts: [{ id: 'sri', name: 'Alex' }] }, when: { chat: 'direct', intent: 'status_next_step' }, then: 'send' }, state: 'suggested', at: iso(now) }])
	return s
}
const RICH: typeof STATES = [
	['rich-home', '#home'],
	['rich-home-catchup-watch', '#home', p => p.locator('[data-act=watchopen]').first().click()],
	['rich-focus-A1', '#focus/A1'],
	['rich-focus-A2', '#focus/A2'],
	['rich-done', '#done'],
	['rich-done-catchup', '#done/catchup'],
	['rich-done-catchup-quiet', '#done/catchup', p => p.click('details.quiet summary')],
	['rich-ongoing', '#ongoing'],
	['rich-settings', '#settings'],
	['rich-settings-more', '#settings/system', p => p.click('details.adv summary')],
	['rich-focus-A1-details', '#focus/A1', p => p.click('#card-A1 .c-sec details[data-dbg] summary')],
]

// What the page drew: the header with its tabs, the main area, and the key list. The commit in the version line changes with
// every commit, so it is masked; nothing else is.
const capture = (p: Page) => p.evaluate(() => [
	`<!-- title -->\n${document.title}`,
	`<!-- header -->\n${document.querySelector('header.top')?.outerHTML ?? ''}`,
	`<!-- main -->\n${document.getElementById('main')?.innerHTML ?? ''}`,
	`<!-- keys -->\n${document.getElementById('keys')?.outerHTML ?? ''}`,
].join('\n') + '\n').then((s: string) => s.replace(/Version (v\d+\.\d+\.\d+ \()?[0-9a-f]{7,40}\)?/g, 'Version <commit>').replace(/\bto [0-9a-f]{7,40}\b/g, 'to <commit>'))

function check(name: string, html: string, diffs: string[]) {
	const file = join(DIR, `${name}.html`)
	if (UPDATE || !existsSync(file)) { mkdirSync(DIR, { recursive: true }); writeFileSync(file, html); return }
	const want = readFileSync(file, 'utf8')
	if (want === html) return
	const a = want.split('\n'), b = html.split('\n'), i = a.findIndex((l, n) => l !== b[n])
	diffs.push(`${name}: line ${i + 1}\n  golden: ${a[i]?.slice(0, 400)}\n  now:    ${b[i]?.slice(0, 400)}`)
}

// One store, its page server, and a context in the theme; each state on a fresh page with the clock held still.
// deno-lint-ignore no-explicit-any
async function draw(theme: string, seed: (s: any) => any, states: typeof STATES, snapshot: boolean, base: (s: any) => any = seedInbox) {
	const store = seed(base(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-groot-')), machine: 'mac' })))
	const { url, server } = await serveInbox(() => store)
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' })
	// No polling (POLL * 10 must stay under the 2^31 ms timer limit) and no countdowns moving: the page draws once from its data.
	await ctx.addInitScript(`window.DELEGATE_POLL_MS = 1e8; localStorage.setItem('delegate-theme', '${theme}')`)
	const diffs: string[] = [], errors: string[] = []
	const shoot = async (name: string, at: string, steps?: (p: Page) => Promise<void>) => {
		const page = await ctx.newPage()
		await page.clock.setFixedTime(NOW)
		page.on('pageerror', (e: Error) => errors.push(`${name}: ${e.message}`))
		await page.goto(at)
		await page.waitForFunction(() => !!document.getElementById('main')?.innerHTML)
		await steps?.(page)
		check(`${name}.${theme}`, await capture(page), diffs)
		await page.close()
	}
	try {
		for (const [name, hash, steps] of states) await shoot(name, url + hash, steps)
		// The read-only snapshot draws every card at once, with the words to type instead of buttons.
		if (snapshot) { writeSnapshot(store); await shoot('snapshot', pathToFileURL(join(store.root, 'inbox.html')).href) }
	} finally { await ctx.close(); server.close() }
	assert.deepEqual(errors, [])
	assert.deepEqual(diffs, [], `the page draws differently:\n${diffs.join('\n')}`)
}

// The new experience (N1a): Now with every row kind, an open card, a classic link, the note closed, the narrow menu's markup,
// Done, Settings, and To learn reused; then its empty states and Delegate paused.
const NEXT: typeof STATES = [
	['next-now', '#now'],
	['next-now-open', '#now/A3'],
	['next-now-classic-link', '#focus/A1'],
	['next-now-waiting', '#now/waiting'],
	['next-now-note-closed', '#now', p => p.click('[data-act=uinote]')],
	['next-now-tell-typed', '#now', p => p.fill('#tell-A23', 'Tried the form once')],
	['next-done', '#done'],
	['next-done-catchup', '#done/catchup'],
	['next-settings', '#settings'],
	['next-knowledge', '#knowledge'],
	['next-keys', '#now', p => p.keyboard.press('?')],
]
const NEXT_EMPTY: typeof STATES = [['next-quiet', '#now']]
const NEXT_MOVING: typeof STATES = [['next-nothing-for-you', '#now']]
const NEXT_PAUSED: typeof STATES = [['next-paused', '#now']]

for (const theme of ['light', 'dark']) {
	test(`golden: every tab, card, and sheet draws exactly as before (${theme})`, { skip }, () => draw(theme, s => s, STATES, true))
	test(`golden: Catch up, open work, promises, waiting, channels, and suggestions draw exactly as before (${theme})`, { skip }, () => draw(theme, seedRich, RICH, false))
	test(`golden: the new experience draws Now, its open card, Done, and Settings (${theme})`, { skip }, () => draw(theme, s => seedNext(s, 'new', false), NEXT, false))
	test(`golden: the new experience's empty states and Delegate paused (${theme})`, { skip }, async () => {
		await draw(theme, s => s, NEXT_EMPTY, false, s => seedQuiet(s))
		await draw(theme, s => s, NEXT_MOVING, false, s => seedQuiet(s, true))
		await draw(theme, s => pauseNext(s), NEXT_PAUSED, false, s => seedNext(s))
	})
}
