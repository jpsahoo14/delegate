import { test } from 'node:test'
import assert from 'node:assert/strict'
const { planRetry, retryNote, retryStatus } = await import('../src/runner/retry.ts')

const t0 = Date.parse('2026-10-20T10:00:00Z'), MIN = 60_000
const at = (p: ReturnType<typeof planRetry>) => ('retry' in p ? (Date.parse(p.retry.at) - t0) / MIN : p.stop)

test('goal-retry plan: each kind of shortfall gets its own tries and waits, and stops on time', () => {
	const tool = { kind: 'tool' as const, why: 'No diff tool', tried: ['a'] }
	const p1 = planRetry(undefined, tool, t0)
	assert.equal(at(p1), 2)
	assert.equal('retry' in p1 && p1.fresh, false)
	const p2 = planRetry('retry' in p1 ? p1.retry : undefined, { ...tool, tried: ['b'] }, t0)
	assert.deepEqual([at(p2), 'retry' in p2 && p2.fresh], [15, true], 'the last tool try is fresh')
	assert.equal(at(planRetry('retry' in p2 ? p2.retry : undefined, { ...tool, tried: ['c'] }, t0)), 'Tried 3 times; No diff tool. Tried: a; b; c')
	let prev
	const waits = []
	for (let i = 0; i < 4; i++) { const p = planRetry(prev, { kind: 'transient', why: 'ADO 503', tried: [] }, t0); waits.push(at(p)); prev = 'retry' in p ? p.retry : undefined }
	assert.deepEqual(waits, [5, 15, 45, 'Tried 4 times; ADO 503'], 'a busy service waits out its tries though it fails the same way')
	const b1 = planRetry(undefined, { kind: 'budget', why: 'Out of time', tried: ['10 of 40 files'] }, t0)
	assert.equal(at(b1), 2)
	assert.match(String(at(planRetry('retry' in b1 ? b1.retry : undefined, { kind: 'budget', why: 'Out of time', tried: ['30 of 40 files'] }, t0))), /^Tried 2 times/)
	assert.equal(at(planRetry(undefined, { kind: 'not_ready', why: 'CI running', tried: [], retryAfterMin: 3 }, t0)), 10, 'not ready: at least 10 minutes')
	assert.equal(at(planRetry(undefined, { kind: 'not_ready', why: 'CI running', tried: [], retryAfterMin: 999 }, t0)), 240, 'at most 4 hours')
	const old = { at: '', n: 5, firstAt: new Date(t0 - 23 * 3_600_000).toISOString(), last: { kind: 'not_ready' as const, why: 'CI running', tried: [] }, tried: [] }
	assert.match(String(at(planRetry(old, { kind: 'not_ready', why: 'CI still running', tried: [], retryAfterMin: 120 }, t0))), /^Still not ready after 24 hours/)
	assert.match(String(at(planRetry(undefined, { kind: 'asker', why: 'Which branch?', tried: [] }, t0))), /^Needs the asker: Which branch\?/)
})

test('goal-retry plan: the next try is told what fell short and what not to repeat; the status says when', () => {
	const p = planRetry(undefined, { kind: 'not_ready', why: 'CI running', tried: ['pipelines_build 991: in progress'], waitFor: 'build 991', retryAfterMin: 30 }, t0)
	assert.ok('retry' in p)
	if (!('retry' in p)) return
	assert.equal(retryNote(p.retry), 'The last attempt fell short of the goal: CI running. Already tried, do not repeat: pipelines_build 991: in progress. Take a different route; search for tools by what they do before you decide one is missing. It was waiting for build 991; check it first.')
	assert.equal(retryStatus(p.retry, () => '10:30'), 'Waiting for build 991; checking again at 10:30: CI running')
})

test('goal-retry plan: each kind counts its own tries', () => {
	let prev
	for (let i = 0; i < 5; i++) { const p = planRetry(prev, { kind: 'not_ready', why: 'CI running', tried: [`poll ${i}`] }, t0); prev = 'retry' in p ? p.retry : undefined }
	const p = planRetry(prev, { kind: 'tool', why: 'No diff tool', tried: ['a'] }, t0)
	assert.deepEqual(['retry' in p && p.retry.n, at(p)], [1, 2], 'five polls do not use up the tries for a tool not found')
})

test('goal-retry plan: one ask gets 6 tries and 24 hours in all, however the kinds alternate', () => {
	let prev, stop = ''
	const kinds = ['tool', 'transient', 'tool', 'transient', 'tool', 'transient', 'tool'] as const
	for (const [i, kind] of kinds.entries()) { const p = planRetry(prev, { kind, why: `fail ${i}`, tried: [`r${i}`] }, t0); if ('stop' in p) { stop = p.stop; break } prev = p.retry }
	assert.match(stop, /^Tried 7 times; fail 6/)
	const old = { at: '', n: 1, total: 1, firstAt: new Date(t0 - 25 * 3_600_000).toISOString(), last: { kind: 'transient' as const, why: 'x', tried: [] }, tried: [] }
	assert.match(String(at(planRetry(old, { kind: 'tool', why: 'y', tried: ['z'] }, t0))), /^Tried 2 times; y/)
})
