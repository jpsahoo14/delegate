// The feedback log becomes eval cases: each correction is measured against what the owner really did (B17).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-evfb-'))
const { Store } = await import('../src/store/state.ts')
const { addedFacts, casesFrom, merge } = await import('../scripts/eval-from-feedback.ts')
const { seedInbox } = await import('./fixture.ts')

test('B17 the words the owner added become the facts a draft must contain: IDs and numbers first, then names', () => {
	assert.deepEqual(addedFacts('Got it. When was the last run, and what did it find?', 'Got it. Now you can re-start as limits are back to 10k. Also, take latest update of events-dri-v2'), ['events-dri-v2', '10k', 're-start'])
	assert.deepEqual(addedFacts('It ships Friday.', 'It ships Friday.'), [])
})

test('B17 edits, skips, marks, and missed messages become cases with the real chat link; cases already there are kept', () => {
	const store = seedInbox(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-evfb-root-')), machine: 'vm' }))
	const a1 = store.byCode('A1')!, a2 = store.byCode('A2')!
	const at = '2026-10-19T10:00:00.000Z'
	mkdirSync(join(store.root, 'feedback'), { recursive: true })
	const lines = [
		{ at, machine: 'vm', event: 'sent', kind: 'correction', code: 'A1', what: 'You changed the draft before sending.', detail: { draft: 'It is in ring 0.', sent: 'In ring 0 since Monday; ring 1 needs QA-4471 first.' } },
		{ at, machine: 'vm', event: 'skipped', kind: 'correction', code: 'A2', what: 'You skipped the drafted reply.', detail: { draft: 'Thanks!' } },
		{ at, machine: 'vm', event: 'missed', kind: 'report', what: 'You pointed out a missed message: it did not name you.', detail: { chat: '19:g@thread.v2', msgId: '1793', note: 'Kim always means me' } },
		{ at, machine: 'vm', event: 'worker', kind: 'error', code: 'A1', what: 'no report' },
	]
	writeFileSync(join(store.root, 'feedback', 'vm.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n')
	const cases = casesFrom(store)
	assert.deepEqual(cases.map(c => [c.id, c.expect!.accept, c.expect!.facts]), [
		['F-A1-2026-10-19', ['reply', 'ask'], ['QA-4471', 'Monday', 'since']],
		['F-A2-2026-10-19', ['ignore', 'not-addressed'], undefined],
		['F-1793-2026-10-19', ['reply', 'ask', 'job'], undefined],
	])
	assert.equal(cases[0].link, `https://teams.microsoft.com/l/message/${encodeURIComponent(a1.chat.id)}/${a1.msgIds.at(-1) ?? a1.lastMsgId}`)
	assert.ok(cases[1].link.includes(encodeURIComponent(a2.chat.id)))
	const file = join(store.root, 'cases.json')
	writeFileSync(file, JSON.stringify([{ id: 'F-A2-2026-10-19', link: 'x', expect: { accept: ['reply'], note: 'fixed by hand' } }]))
	assert.deepEqual(merge(file, cases), { added: ['F-A1-2026-10-19', 'F-1793-2026-10-19'], kept: 1 })
	assert.equal(JSON.parse(readFileSync(file, 'utf8'))[0].expect.note, 'fixed by hand')
	assert.deepEqual(merge(file, cases).added, [], 'running it again adds nothing')
})

test('B9 with --jobs the score says how many jobs finished and what their own output contained', async () => {
	const { table } = await import('../scripts/eval.ts')
	const r = (id: string, finished: boolean, result: boolean[]) => ({ id, link: '', outcome: 'job' as const, pass: true, ms: 1000, from: '', ask: '', context: 0, othersAfter: [], facts: [], finished, result: result.map((found, i) => ({ fact: `f${i}`, found })) })
	assert.match(table([r('R03', true, [true]), r('R04', false, [false, false])]).split('\n')[0], /Jobs finished: 1 of 2\. Job results found: 1 of 3\./)
	assert.doesNotMatch(table([{ id: 'R10', link: '', outcome: 'reply', pass: true, ms: 1, from: '', ask: '', context: 0, othersAfter: [] }]).split('\n')[0], /Jobs finished/)
})
