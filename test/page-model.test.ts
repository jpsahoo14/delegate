// The page's pure layer (src/web/app/model) and its markup template, without a browser (B37).
import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { changeLabel, dirty, isNew, kCmd, newCount, orderOf, primaryOf, seenIn, tabsOf } from '../src/web/app/model/derive.ts'
import { byDate, doing, first, mmss, plural, whoOf } from '../src/web/app/model/format.ts'
import { automationInput, markCommand, newReminder, peopleOf, rowWatchCommand, rowWatchOf, sheetWatchCommand } from '../src/web/app/model/forms.ts'
import type { CardUi, DoneRow, ItemCard, KnowledgeCard, View } from '../src/web/app/model/types.ts'
import { esc, html, join, raw } from '../src/web/app/view/html.ts'

const ui = (o: Partial<CardUi> = {}): CardUi => ({ status: 'ready', msg: '', lost: false, stale: false, touched: false, pick: null, otherOn: false, other: '', editing: false, text: null, answer: '', ask: '', cmts: null, facts: null, threadOpen: false, whyOpen: false, dbgOpen: false, menu: false, ...o })
const who = whoOf('Priya Shah')
const card = (o: Partial<ItemCard> = {}): ItemCard => ({ code: 'A1', type: 'reply', rev: 'r', who, chat: { name: 'C', group: true, guests: false }, at: '', thread: [], newCount: 0, changes: [], why: { sources: [], gaps: [] }, notes: [], status: '', ...o })
const row = (o: Partial<DoneRow>): DoneRow => ({ code: 'A9', kind: 'reply', who, sentence: '', by: '', at: '2026-10-20T10:00:00.000Z', ...o })
const view = (o: Partial<View> = {}) => ({ seen: {}, since: '2026-10-20T09:00:00.000Z', done: [], needs: [], knowledge: [], people: [], ...o }) as unknown as View

test('page model: words', () => {
	assert.deepEqual([plural(1, 'fact'), plural(2, 'fact'), first('Priya Shah'), first(undefined), mmss(65)], ['1 fact', '2 facts', 'Priya', 'Someone', '1:05'])
	assert.deepEqual([who.initials, typeof who.hue], ['PS', 'number'])
	assert.deepEqual([doing('skip A1', 'D'), doing('later A1', 'D'), doing('ok A1', 'D'), doing('ask A1: x', 'D'), doing('A1: yes', 'D'), doing('pick A1 2', 'D')], ['Dismissing.', 'Moving it to later.', 'Sending.', 'Asking D.', 'Updating the draft with your answer.', 'Preparing the reply for that option.'])
	assert.equal(doing('x'.repeat(70), 'D'), `Working on "${'x'.repeat(58)}…".`)
})

test('page model: a done-by day is a date, and Friday on a Friday is the next one', () => {
	mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 23, 12) })
	try { assert.deepEqual([byDate(''), byDate('today'), byDate('fri'), byDate('week')], ['', '2026-10-23', '2026-10-30', '2026-10-30']) } finally { mock.timers.reset() }
})

test('page model: new is what Delegate did since the owner last looked at its filter, never their own sends', () => {
	const v = view({ seen: { replies: '2026-10-20T09:30:00.000Z' } })
	const seen = seenIn(v)
	assert.equal(isNew(row({}), seen), true)
	assert.equal(isNew(row({ at: '2026-10-20T09:15:00.000Z' }), seen), false, 'older than the last look')
	assert.equal(isNew(row({ own: true }), seen), false)
	assert.equal(isNew(row({ kind: 'closed' }), seen), false, 'closed rows have no filter')
	assert.equal(isNew(row({ kind: 'change', at: '2026-10-20T09:15:00.000Z' }), seen), true, 'changes were never looked at: since the visit')
	assert.equal(newCount(view({ ...v, done: [row({}), row({ own: true })] } as Partial<View>)), 1)
})

test('page model: the queue keeps arrival order, keeps handled cards for the visit, and puts Later last', () => {
	const needs = ['A1', 'A2', 'A3'].map(code => card({ code }))
	assert.deepEqual(orderOf([], needs, () => false, () => false), ['A1', 'A2', 'A3'])
	assert.deepEqual(orderOf(['A0', 'A1', 'A2'], needs, c => c === 'A0', c => c === 'A1'), ['A0', 'A2', 'A3', 'A1'])
	assert.deepEqual(orderOf(['A9', 'A1'], needs, () => false, () => false), ['A1', 'A2', 'A3'], 'gone and not handled: dropped')
	assert.equal(dirty(ui()), false)
	assert.equal(dirty(ui({ answer: 'x' })), true)
})

test('page model: tabs show To learn and Settings only when there is something, and count new under Done', () => {
	const v = view({ done: [row({})] })
	assert.deepEqual(tabsOf(v, false).map(t => t[0]), ['home', 'focus', 'done', 'ongoing'])
	assert.equal(tabsOf(v, false)[2][2], 1)
	assert.equal(tabsOf(v, true)[2][2], 0, 'the snapshot has no new counts')
	assert.deepEqual(tabsOf(view({ knowledge: [{}] as never, settings: {} as never }), false).map(t => t[0]).slice(4), ['knowledge', 'settings'])
})

test('page model: each card type\'s primary action says what happens and carries the words to type', () => {
	const draft = { text: 'Hi.', commitment: false, preview: false }
	assert.deepEqual(primaryOf(card({ draft }), ui(), 'D'), { label: 'Send', cmd: 'ok A1', kind: 'finish' })
	assert.deepEqual(primaryOf(card({ draft }), ui({ text: 'Mine.' }), 'D'), { label: 'Send your version', cmd: 'send A1: Mine.', kind: 'finish' })
	assert.equal(primaryOf(card({ draft: { ...draft, holding: true } }), ui(), 'D').label, 'Send holding reply')
	assert.deepEqual(primaryOf(card(), ui(), 'D'), { label: 'Nothing to do', cmd: 'ok A1', kind: 'finish', disabled: true })
	const q = primaryOf(card({ type: 'question' }), ui({ answer: ' Friday ' }), 'D')
	assert.deepEqual([q.label, q.cmd, q.kind, q.disabled], ['Draft reply', 'A1: Friday', 'draft', false])
	const choices = { prompt: 'Which?', options: [{ label: 'A' }, { label: 'B' }] } as ItemCard['choices']
	assert.deepEqual(primaryOf(card({ type: 'choice', choices }), ui(), 'D').verb, 'pick A1 1')
	const multi = primaryOf(card({ type: 'choice', choices: { ...choices!, multi: true } }), ui({ pick: [2, 1] }), 'D')
	assert.deepEqual([multi.label, multi.cmd, multi.hint], ['Draft reply', 'pick A1 1, 2', 'D writes the reply from your picks. Nothing is sent yet.'])
	assert.equal(primaryOf(card({ type: 'meeting', choices, picked: [1], draft: { ...draft, preview: true }, changes: [{ n: 1, summary: '', target: '', system: 'calendar', action: 'create_event' }] }), ui(), 'D').label, 'Send and create invite')
	const changes = [1, 2].map(n => ({ n, summary: '', target: '', system: 'ado', action: 'comment' }))
	assert.equal(changeLabel(card({ changes }), 2, true), 'Post 2 comments and reply')
	assert.deepEqual(primaryOf(card({ type: 'review', changes, draft }), ui({ cmts: new Set([2]) }), 'D').cmd, 'ok A1 except 1')
	const both = primaryOf(card({ type: 'review', changes, draft }), ui({ cmts: new Set([2]), text: 'Mine.' }), 'D')
	assert.deepEqual([both.disabled, both.hint], [true, 'To change the reply and skip a change, do one at a time.'])
	const k = { code: 'K1', facts: [{}, {}, {}] } as unknown as KnowledgeCard
	assert.deepEqual([kCmd(k, ui()), kCmd(k, ui({ facts: new Set([3, 1]) }))], ['ok K1', 'ok K1 #1 #3'])
})

test('page model: forms send the words the owner would type', () => {
	assert.equal(markCommand('A9', undefined, ''), 'wrong A9')
	assert.equal(markCommand('A9', 'incomplete', 'say which'), 'incomplete A9: say which')
	assert.equal(sheetWatchCommand({ text: ' PR 1 merged ', by: '', push: true }), 'watch: "PR 1 merged" push')
	assert.deepEqual(rowWatchOf(row({ sentence: 'Posted the PR' })), { target: 'Posted the PR', until: 'it is done', by: '' })
	assert.equal(rowWatchCommand('A42', { target: 'config PR', until: ' ', by: '' }), 'watch A42: "config PR"')
	const v = view({ people: [{ name: 'Arun', chat: 'c1', group: false }, { name: 'Priya Shah', chat: 'c2', group: false }], needs: [card()] })
	assert.deepEqual(peopleOf(v).map(p => p.name), ['Priya Shah', 'Arun'], 'who asked today comes first')
	assert.deepEqual(automationInput({ ...newReminder('Arun'), every: 'week' }, v), { to: 'Arun', chatId: 'c1', text: 'Reminder: please send me an update.', every: 'week', at: '16:00', day: 1 })
})

test('page markup: text is escaped, markup is not, and empty stays empty', () => {
	assert.equal(String(html`<b title="${esc('"x"')}">${esc('<i>&')}</b>`), '<b title="&quot;x&quot;">&lt;i&gt;&amp;</b>')
	assert.equal(String(html`<ul>${['a', 'b'].map(x => html`<li>${esc(x)}</li>`)}</ul>`), '<ul><li>a</li><li>b</li></ul>')
	assert.equal(String(html`${1}|${true}|${false}|${''}`), '1|true|false|')
	assert.equal(html``, '', 'empty markup is falsy, as an empty string was')
	assert.equal(esc(''), '')
	assert.equal(String(join([raw('<i>a</i>'), esc('b')], raw('<br>'))), '<i>a</i><br>b')
	// A stray string that got past the type is still escaped.
	assert.equal(String(html`${'<x>' as never}`), '&lt;x&gt;')
})

// Review #2: what the page shows is settled by the state layer, so a second experience cannot break the keys or seen marks.
test('page state: no experience changes page state while drawing', async () => {
	const { readdirSync, readFileSync } = await import('node:fs')
	const { join } = await import('node:path')
	const { fileURLToPath } = await import('node:url')
	const dir = join(fileURLToPath(new URL('../src/web/app/view/', import.meta.url)), '/')
	const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)])
	// The shared redraw step (render.ts) keeps its own scheduling flags; nothing else in view/ may write V or S.
	const writes = files(dir).filter(f => !f.replaceAll('\\', '/').endsWith('/render.ts')).flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
		.filter(([, , l]) => /\b[SV]\.[a-zA-Z]+(\[[^\]]*\])?\s*(\?\?=|=(?!=)|\+\+|--)|\bmarkSeen\b/.test(l))
	assert.deepEqual(writes.map(([f, n]) => `${f.slice(dir.length)}:${n}`), [])
})

test('page state: before drawing Needs you, the queue settles on the card asked for, else the first one open', async () => {
	const store = await import('../src/web/app/state/store.ts')
	const { viewing } = await import('../src/web/app/state/actions.ts')
	store.init({ mode: 'page', view: view({ needs: [card({ code: 'A1' }), card({ code: 'A2' })] }), name: 'D', cmd: 'd' }, null, 2000)
	store.syncOrder()
	Object.assign(store.S, { route: 'focus', cur: 'A9' })
	viewing()
	assert.equal(store.S.cur, 'A1', 'a card that is gone: the first open one')
	store.S.cur = 'A2'; viewing()
	assert.equal(store.S.cur, 'A2')
})

test('bug 10-21: an answer source chip says what the source is, never "https:"', async () => {
	const { sourceChip } = await import('../src/web/app/model/format.ts')
	assert.deepEqual([
		sourceChip({ ref: 'https://dev.azure.com/acme/Globex/_git/web/pullrequest/4200001?iteration=15' }),
		sourceChip({ ref: 'https://teams.microsoft.com/l/message/19:k@thread.v2/17?context=%7B%7D' }),
		sourceChip({ ref: 'https://docs.example.com/guide/setup' }),
		sourceChip({ ref: 'card:banner-fix/decisions#3' }),
		sourceChip({ ref: 'https://docs.example.com/x', label: 'Setup guide' }),
		sourceChip({ ref: 'a note' }),
	], ['PR 4200001', 'Teams message', 'docs.example.com', 'banner fix', 'Setup guide', 'a note'])
})
