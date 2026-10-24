// Manual #53 proof (Store.log stamp), outside npm test/CI: every log line carries telemetryBase (at, v, machine, pid), and inside a
// traced run also its trace and runId; outside one it is still a valid line with no trace. The event's own fields win over the base,
// and an async step inside the run keeps its trace. Fictional temp root; no model, no network.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-stamp-local-'))
const { Store } = await import('../src/store/state.ts')
const { startTrace, traceRun } = await import('../src/core/telemetry.ts')
const { VERSION } = await import('../src/paths.ts')

const store = new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-stamp-')), machine: 'fictional-pc' })
const lines = () => readdirSync(join(store.root, 'state', 'log')).flatMap(f => readFileSync(join(store.root, 'state', 'log', f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>))
const byEvent = (event: string) => lines().find(l => l.event === event)!
const pass = (what: string) => console.log(`PASS ${what}`)

store.log({ event: 'outside-run', code: 'A1' })
const outside = byEvent('outside-run')
assert.equal(outside.machine, 'fictional-pc'); assert.equal(outside.pid, process.pid)
assert.match(String(outside.v), new RegExp(`^${VERSION.replace(/\./g, '\\.')}\\+`))
assert.ok(Number.isFinite(Date.parse(String(outside.at))))
assert.equal(outside.trace, undefined); assert.equal(outside.runId, undefined)
assert.equal(outside.code, 'A1')
pass('outside a traced run: at, v, machine and pid; no trace or runId; the event\'s own fields kept')

const ctx = startTrace('A12', '6f1c2b3a-0000-4000-8000-000000000001')
await traceRun(ctx, async () => {
	store.log({ event: 'item-start' })
	await traceRun({ runId: 'run-42' }, async () => {
		await new Promise(resolve => setTimeout(resolve, 5))
		store.log({ event: 'run-step', code: 'A12' })
	})
})
assert.equal(byEvent('item-start').trace, ctx.trace); assert.equal(byEvent('item-start').runId, undefined)
assert.equal(byEvent('run-step').trace, ctx.trace, 'the run inherits the item trace'); assert.equal(byEvent('run-step').runId, 'run-42')
pass('inside a traced run: the item trace, and the run\'s runId after an async step')

store.log({ event: 'own-fields', machine: 'reported-by-event' })
const own = byEvent('own-fields')
assert.equal(own.machine, 'reported-by-event', 'an event field wins over the base')
assert.ok(Number.isFinite(Date.parse(String(own.at))), 'the line time is the log time')
store.log({ event: 'after-run' })
assert.equal(byEvent('after-run').trace, undefined, 'no trace leaks out of the run')
pass('an event\'s own fields win over the base, as they did before; no trace leaks after the run')
for (const line of lines()) for (const key of ['at', 'v', 'machine', 'pid', 'event']) assert.ok(key in line, `${line.event} has ${key}`)
console.log(`STAMP PROOF: ${lines().length} log lines checked.`)
