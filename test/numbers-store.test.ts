import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-numlocal-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { counted, numbersOf, saveWeeks } = await import('../src/store/numbers.ts')
const { daily, summaryText } = await import('../src/runner/daily.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { item, stub, seedNumbers } = await import('./fixture.ts')
const { numbersPage } = await import('../src/web/numbers.ts')
const { listsOf } = await import('../src/web/app/model/numbers.ts')

// The Numbers tab's files and surfaces (R-NEX-11). Wednesday 2026-10-21, the owner in UTC.
const NOW = new Date('2026-10-21T12:00:00Z')
const at = (day: string, hm = '10:00') => `${day}T${hm}:00.000Z`
function setup(machine = 'mac', root = mkdtempSync(join(tmpdir(), 'delegate-numroot-'))) {
	const store = new Store({ root, machine })
	if (!store.config()) store.saveConfig({ schema: 1, owner: { id: 'me', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 1, nudgeEveryMin: 30, tz: 'UTC', summaryAt: 'off' } as never)
	return store
}
const logLines = (store: InstanceType<typeof Store>, day: string, machine: string, lines: Record<string, unknown>[]) => {
	mkdirSync(join(store.root, 'state', 'log'), { recursive: true })
	const f = join(store.root, 'state', 'log', `${day}-${machine}.jsonl`)
	writeFileSync(f, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
	// A file last written at the end of its own day, so tests never depend on the real clock.
	const end = new Date(`${day}T23:59:00Z`)
	utimesSync(f, end, end)
}
const sent = (code: string, when: string, over: Record<string, unknown> = {}) => ({ at: when, event: 'sent', code, approvedBy: 'owner', unchanged: true, text: 'Secret plan for Kim', asker: { id: 'kim', name: 'Kim' }, ...over })
const weekFiles = (store: InstanceType<typeof Store>) => existsSync(join(store.root, 'state', 'numbers')) ? readdirSync(join(store.root, 'state', 'numbers')).sort() : []

function seedWeeks(store: InstanceType<typeof Store>) {
	logLines(store, '2026-10-13', 'mac', [{ at: at('2026-10-13', '09:00'), event: 'tick' }, sent('A1', at('2026-10-13'))])
	logLines(store, '2026-10-14', 'win', [{ at: at('2026-10-14', '09:00'), event: 'tick' }, sent('A1', at('2026-10-14')), sent('A2', at('2026-10-14'))])
	logLines(store, '2026-10-19', 'mac', [{ at: at('2026-10-19', '09:00'), event: 'tick' }])
	logLines(store, '2026-10-20', 'mac', [{ at: at('2026-10-20', '09:00'), event: 'tick' }, sent('A3', at('2026-10-20'))])
	// The other machine read an earlier week too; this machine had nothing then.
	logLines(store, '2026-10-06', 'win', [{ at: at('2026-10-06', '09:00'), event: 'tick' }, sent('A7', at('2026-10-06'))])
}

test('R-NEX-11 weekly totals: a week that is over is written once, for every machine, and the 8-week view reads it instead of the log', () => {
	const mac = setup()
	seedWeeks(mac)
	assert.equal(saveWeeks(mac, NOW), 2)
	assert.deepEqual(weekFiles(mac), ['mac-2026-10-12.json', 'win-2026-10-05.json'], 'not the week still going; another machine\'s week once its log had a week to sync')
	const file = join(mac.root, 'state', 'numbers', 'mac-2026-10-12.json'), first = readFileSync(file, 'utf8')
	assert.doesNotMatch(first, /Secret|Kim/, 'codes and times only')
	assert.deepEqual(JSON.parse(first).events.map((e: { at: string }) => e.at.slice(0, 10)), ['2026-10-13', '2026-10-13'], 'only its own week')
	// The log of that week is gone: the file is what counts, and it is never written again.
	unlinkSync(join(mac.root, 'state', 'log', '2026-10-13-mac.jsonl'))
	assert.deepEqual(numbersOf(mac, 'last', NOW).handled.codes, ['A1', 'A2'], 'A1 from the file, A2 from the other machine\'s log, A1 once')
	assert.deepEqual(numbersOf(mac, 'this', NOW).handled.codes, ['A3'], 'the week still going comes from the log')
	assert.equal(saveWeeks(mac, new Date('2026-10-22T12:00:00Z')), 0)
	assert.equal(readFileSync(file, 'utf8'), first)
	const win = setup('win', mac.root)
	assert.equal(saveWeeks(win, NOW), 1)
	assert.deepEqual(weekFiles(mac), ['mac-2026-10-12.json', 'win-2026-10-05.json', 'win-2026-10-12.json'])
	assert.equal(readFileSync(file, 'utf8'), first, 'one writer per file')
	assert.equal(counted(mac).filter(e => e.event === 'sent').length, 5, 'each machine\'s week once, from its file')
	unlinkSync(join(mac.root, 'state', 'log', '2026-10-06-win.jsonl'))
	assert.ok(numbersOf(mac, 'all', NOW).handled.codes.includes('A7'), 'a week whose log is gone still counts from its file')
})

test('R-NEX-11 weekly totals: another machine\'s week is written only once its log shows it synced past that week; until then it is read from the log', () => {
	const store = setup()
	// A laptop that ran a cycle in the week of Oct 5, then went offline: nothing of it after that week has arrived.
	logLines(store, '2026-10-06', 'old', [{ at: at('2026-10-06', '09:00'), event: 'tick' }, sent('A1', at('2026-10-06'))])
	// Its last day so far is the week's own Sunday: that does not show the week finished syncing.
	logLines(store, '2026-10-11', 'old', [{ at: at('2026-10-11', '09:00'), event: 'tick' }])
	logLines(store, '2026-10-20', 'mac', [{ at: at('2026-10-20', '09:00'), event: 'tick' }])
	assert.equal(saveWeeks(store, NOW), 0)
	assert.deepEqual(weekFiles(store), [])
	assert.ok(numbersOf(store, 'all', NOW).handled.codes.includes('A1'), 'still counted, from the log')
	// A later day of its log arrives: the week before it is complete.
	logLines(store, '2026-10-12', 'old', [{ at: at('2026-10-12', '09:00'), event: 'tick' }, sent('A2', at('2026-10-12'))])
	// The week's own Sunday file is still being uploaded: it changed an hour ago.
	const sunday = join(store.root, 'state', 'log', '2026-10-11-old.jsonl'), hourAgo = new Date(NOW.getTime() - 3_600_000)
	utimesSync(sunday, hourAgo, hourAgo)
	assert.equal(saveWeeks(store, NOW), 0, 'not while a file of that week still changes')
	const settled = new Date(NOW.getTime() - 7 * 3_600_000)
	utimesSync(sunday, settled, settled)
	assert.equal(saveWeeks(store, NOW), 1)
	assert.deepEqual(weekFiles(store), ['old-2026-10-05.json'], 'not its week of Oct 12, which nothing later shows complete')
})

test('R-NEX-11 weekly totals: files hold UTC weeks and the owner\'s zone applies only when counting, so neither a zone nor a change of it loses a line', () => {
	const store = setup()
	store.saveConfig({ ...store.config(), tz: 'Asia/Tokyo' })
	// Sunday 20:00 UTC is Monday 05:00 in Tokyo and Sunday 13:00 in Los Angeles.
	logLines(store, '2026-10-11', 'mac', [{ at: at('2026-10-11', '20:00'), event: 'tick' }, sent('A1', at('2026-10-11', '20:00')), sent('A2', at('2026-10-11', '10:00'))])
	logLines(store, '2026-10-12', 'mac', [{ at: at('2026-10-12', '09:00'), event: 'tick' }, sent('A5', at('2026-10-12'))])
	assert.equal(saveWeeks(store, NOW), 2)
	assert.deepEqual(weekFiles(store), ['mac-2026-10-05.json', 'mac-2026-10-12.json'], 'the UTC weeks of the log')
	assert.deepEqual(JSON.parse(readFileSync(join(store.root, 'state', 'numbers', 'mac-2026-10-12.json'), 'utf8')).events.filter((e: { code?: string }) => e.code).map((e: { code: string }) => e.code), ['A5'], 'not Sunday\'s lines')
	assert.deepEqual(numbersOf(store, 'last', NOW).handled.codes, ['A1', 'A5'], 'A1 is Monday in Tokyo')
	store.saveConfig({ ...store.config(), tz: 'America/Los_Angeles' })
	assert.deepEqual(numbersOf(store, 'last', NOW).handled.codes, ['A5'])
	assert.deepEqual(numbersOf(store, '4w', NOW).handled.codes, ['A2', 'A1', 'A5'], 'A1 is still there, in the week before')
	// Monday 02:00 UTC is still Sunday in Los Angeles: the owner's this week spans a written UTC week and the one still going.
	const la = setup()
	la.saveConfig({ ...la.config(), tz: 'America/Los_Angeles' })
	logLines(la, '2026-10-13', 'mac', [{ at: at('2026-10-13', '09:00'), event: 'tick' }, sent('A3', at('2026-10-13'))])
	logLines(la, '2026-10-19', 'mac', [{ at: at('2026-10-19', '01:00'), event: 'tick' }, sent('A4', at('2026-10-19', '02:00'))])
	const mon = new Date('2026-10-19T05:00:00Z')
	assert.equal(saveWeeks(la, mon), 1)
	assert.deepEqual(numbersOf(la, 'this', mon).handled.codes, ['A3', 'A4'])
})

test('R-NEX-11 weekly totals: the daily pass writes a week before the 30-day redaction clears its words', async () => {
	const store = setup()
	// 43 days ago: an edit then ok, logged as unchanged before 10-21, with the draft it changed.
	logLines(store, '2026-09-08', 'mac', [{ at: at('2026-09-08', '09:00'), event: 'tick' }, sent('A1', at('2026-09-08'), { draft: 'Secret draft' })])
	await daily(store, stub, store.config(), NOW)
	const week = JSON.parse(readFileSync(join(store.root, 'state', 'numbers', 'mac-2026-09-07.json'), 'utf8'))
	assert.equal(week.events.find((e: { event: string }) => e.event === 'sent').asDrafted, false, 'written while the line could still prove it was edited')
	assert.doesNotMatch(readFileSync(join(store.root, 'state', 'log', '2026-09-08-mac.jsonl'), 'utf8'), /Secret/, 'then the log was cleared')
	assert.deepEqual(numbersOf(store, 'all', NOW).handled.codes, [])
})

test('R-NEX-11 weekly totals: a week file is never rewritten; the writer says so, and an old-format file is read from the log instead', () => {
	const store = setup()
	seedWeeks(store)
	mkdirSync(join(store.root, 'state', 'numbers'), { recursive: true })
	const old = join(store.root, 'state', 'numbers', 'mac-2026-10-12.json'), inflated = JSON.stringify({ schema: 1, events: [{ at: at('2026-10-13'), event: 'sent', code: 'A9', asDrafted: true }] })
	writeFileSync(old, inflated)
	saveWeeks(store, NOW)
	assert.equal(readFileSync(old, 'utf8'), inflated)
	assert.deepEqual(store.logs(30).filter(e => e.event === 'numbers-weeks-kept').map(e => e.weeks), [['mac-2026-10-12']])
	assert.deepEqual(numbersOf(store, 'last', NOW).handled.codes, ['A1', 'A2'], 'counted from the log, not from the old file')
	assert.equal(store.saveNumberWeek('mac', '2026-10-12', { schema: 2, events: [] }), false, 'the store refuses too')
	assert.equal(readFileSync(old, 'utf8'), inflated)
})

test('R-NEX-11 weekly totals: the daily summary writes them once a day, even with the summary off; a conflict copy is not a second file', async () => {
	const store = setup()
	seedWeeks(store)
	mkdirSync(join(store.root, 'state', 'numbers'), { recursive: true })
	writeFileSync(join(store.root, 'state', 'numbers', 'mac-2026-10-05 2.json'), '{"events":[{"at":"2026-10-06T10:00:00.000Z","event":"sent","code":"A9","asDrafted":true}]}')
	assert.equal(await daily(store, stub, store.config(), NOW), false, 'the summary is off')
	assert.ok(weekFiles(store).includes('mac-2026-10-12.json'))
	assert.equal(numbersOf(store, '4w', NOW).handled.codes.includes('A9'), false)
})

test('R-NEX-11 the Friday line: Friday\'s summary adds this week\'s numbers under Today; other days do not', () => {
	const store = setup()
	seedWeeks(store)
	logLines(store, '2026-10-23', 'mac', [{ at: at('2026-10-23', '09:00'), event: 'tick' }, sent('A4', at('2026-10-23')), { at: at('2026-10-23'), event: 'state', code: 'A5', from: 'needs_human', to: 'done', closedBy: 'replied' }])
	item(store, 'A6', 'Kim', 'Plans', {})
	const fri = summaryText(store, new Date('2026-10-23T18:00:00Z'))!
	assert.match(fri, /^Assistant · Today: [^\n]*\nThis week: 2 handled for you · 2 of 3 replies as drafted · 0 missed\.\n/)
	assert.doesNotMatch(summaryText(store, new Date('2026-10-22T18:00:00Z'))!, /This week/)
	assert.doesNotMatch(fri, /\d+ ?(h|min)\b/, 'never a time')
	store.saveConfig({ ...store.config(), tz: 'Etc/GMT-14' })
	assert.match(summaryText(store, new Date('2026-10-22T10:30:00Z'))!, /\nThis week: /, 'Friday 00:30 on the owner\'s clock; Thursday on nearly every machine\'s')
	const quiet = setup()
	seedWeeks(quiet)
	assert.match(summaryText(quiet, new Date('2026-10-23T18:00:00Z'))!, /^Assistant · Today: 0 sent by you, 0 by your rules\. 0 need you\.\nThis week: 1 handled for you · 1 of 1 replies as drafted · 0 missed\.$/, 'nothing today, but the week has numbers')
	assert.equal(summaryText(setup(), new Date('2026-10-23T18:00:00Z')), undefined, 'a Friday with nothing at all sends nothing')
})

test('R-NEX-11 the page asks for the numbers on their own: /numbers by window, with codes, behind the page\'s token', async () => {
	const store = setup()
	seedWeeks(store)
	const { url, server } = await serveInbox(() => store)
	try {
		const n = url.replace('/?', '/numbers?')
		const v = await (await fetch(`${n}&window=all`)).json()
		assert.equal(v.window.key, 'all')
		assert.ok(v.handled.codes.includes('A1') && Array.isArray(v.bars) && v.bars.length === 8)
		assert.equal((await (await fetch(n)).json()).window.key, 'this', 'this week by default')
		assert.equal((await fetch(`${n}&window=year`)).status, 400)
		assert.equal((await fetch(n.replace(/t=\w+/, 't=wrong'))).status, 403)
	} finally { (server.closeAllConnections?.(), server.close()) }
})

test('R-NEX-11 delegate numbers prints the tab as text, and refuses an unknown window', () => {
	const store = setup()
	const d = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
	logLines(store, d(5).slice(0, 10), 'mac', [{ at: d(5), event: 'tick' }, { ...sent('A1', d(4)), askAt: d(30) }])
	const cli = (...a: string[]) => execFileSync(process.execPath, ['src/cli.ts', 'numbers', ...a], { env: { ...process.env, DELEGATE_ROOT: store.root }, encoding: 'utf8' })
	const out = cli('--window', 'all')
	assert.match(out, /^Numbers · Since you started \(/)
	assert.match(out, /HANDLED FOR YOU\n1 ask since you started/)
	assert.match(out, /See all 1: A1/)
	assert.match(out, /median 26 min/)
	assert.throws(() => execFileSync(process.execPath, ['src/cli.ts', 'numbers', '--window', 'year'], { env: { ...process.env, DELEGATE_ROOT: store.root }, stdio: 'pipe' }), /Usage: delegate numbers \[--window this\|last\|4w\|all\]/)
})

test('R-NEX-11 every number brings its rows: /numbers and the panel\'s numbers_view return each counted item in Done\'s row format, and a message pointed at with no item as its Teams link', async () => {
	const store = seedNumbers(setup())
	const { url, server } = await serveInbox(() => store)
	try {
		const v = await (await fetch(`${url.replace('/?', '/numbers?')}&window=4w`)).json()
		const codes = [...new Set(Object.values(listsOf(v) as Record<string, { groups: { codes: string[] }[] }>).flatMap(l => l.groups.flatMap(g => g.codes)))]
		assert.ok(codes.length > 40)
		assert.deepEqual(codes.filter(c => !v.rows[c] && !v.missed[c]), [], 'every code a number counts can be opened')
		const opened = Object.values(listsOf(v)).flatMap(l => l.groups.flatMap(g => g.codes))
		assert.deepEqual(opened.filter(c => !v.rows[c] && !v.missed[c]), [], 'every list the page opens has its rows')
		assert.ok(v.now.missed.asks.length > 10 && v.corrections.sent.length > 10)
		const lost = v.now.missed.pointed.find((c: string) => c.startsWith('missed:'))
		assert.equal(lost, 'missed:1760000000001')
		assert.equal(v.rows[lost], undefined, 'no item was made for it')
		assert.equal(v.missed[lost].teams, 'https://teams.microsoft.com/l/message/19:globexsync@thread.v2/1760000000001?context=%7B%22contextType%22%3A%22chat%22%7D')
		const r = v.rows[v.handled.reply[0]]
		assert.deepEqual([r.kind, r.by, typeof r.ask, typeof r.said], ['reply', 'by you', 'string', 'string'], 'a reply reads as the exchange, as in Done')
		assert.equal(v.rows[v.handled.nothing[0]].kind, 'closed')
		assert.match(v.rows[v.handled.nothing[0]].sentence, /Nothing needed/)
		assert.equal(v.rows[v.now.replies.teams[0]].by, 'by you in Teams')
		// Review P2-2: rows only for the lists this window can open, and without what a Numbers list never shows.
		assert.deepEqual(Object.keys(v.rows).sort(), codes.filter(c => !c.startsWith('missed:')).sort(), 'only the rows its lists open')
		assert.deepEqual(Object.values(v.rows as Record<string, Record<string, unknown>>).filter(r => 'text' in r || 'why' in r || 'notes' in r), [], 'no sent text, why, or notes: the list never expands')
		assert.ok(v.rows[v.handled.reply[0]].said, 'what was said still reads on the row')
	} finally { (server.closeAllConnections?.(), server.close()) }
	// The chat panel reaches the same numbers through its own tool.
	const { build } = await import('../src/mcp/server.ts')
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
	const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
	const [x, y] = InMemoryTransport.createLinkedPair()
	await build(() => store).connect(x)
	const c = new Client({ name: 't', version: '1' }); await c.connect(y)
	try {
		const r = await c.callTool({ name: 'numbers_view', arguments: { window: 'last' } }) as unknown as { structuredContent: { window: { key: string }; handled: { codes: string[] }; rows: Record<string, unknown> } }
		assert.equal(r.structuredContent.window.key, 'last')
		assert.deepEqual(r.structuredContent.handled.codes, numbersPage(store, 'last').handled.codes)
		assert.ok(r.structuredContent.handled.codes.every(k => r.structuredContent.rows[k]))
		const bad = await c.callTool({ name: 'numbers_view', arguments: { window: 'year' } }) as { isError?: boolean }
		assert.equal(bad.isError, true, 'an unknown window is refused')
	} finally { await c.close() }
})
