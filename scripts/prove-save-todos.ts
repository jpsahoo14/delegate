// Manual 3e2 proof (#44(1) store hook), outside npm test/CI: Store.save drops a clone task through SEND's exact-template helper only
// when it no longer applies (the clone is cached on this machine, or the review reads the repo through Azure DevOps). A clone that
// is really needed keeps its task, other tasks are never touched, and a save never scans or writes this machine's clone list.
// Fictional temp root; no worker, no model, no network.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Job, Workflow } from '../src/core/types.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-3e2-'))
for (const folder of ['local', 'copilot', 'config', 'cache', 'data']) mkdirSync(join(root, folder))
Object.assign(process.env, { DELEGATE_LOCAL: join(root, 'local'), DELEGATE_ROOT: join(root, 'fictional'), COPILOT_HOME: join(root, 'copilot'),
	XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), NODE_TEST_CONTEXT: 'fictional-proof' })
const { Store } = await import('../src/store/state.ts')
const { cloneTodo, localClones } = await import('../src/runner/repos.ts')
const { card } = await import('../src/web/view.ts')

const store = new Store({ root: join(root, 'fictional'), machine: 'fictional-pc' })
const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
	agent: { flavor: 'copilot', command: ['never-launched'], tools: [] }, maxParallel: 1, nudgeEveryMin: 10 }
store.saveConfig(cfg)
const cached = 'dev.azure.com/acme/web/aurora', absent = 'dev.azure.com/acme/web/borealis', now = new Date().toISOString()
// This machine's clone list: Aurora is cloned; a rescan is pending (no scannedAt), which a save must leave alone.
const localFile = join(root, 'local', 'local.json')
writeFileSync(localFile, JSON.stringify({ code: [join(root, 'code')], clones: { [cached]: [join(root, 'code', 'Aurora')] }, fictionalOtherSetting: 'kept' }))
const localBefore = readFileSync(localFile, 'utf8')
const OWN = 'Clone notes are still my own task: ask Kim which branch to clone.'
let passed = 0
const pass = (what: string) => { passed++; console.log(`PASS ${what}`) }

function job(id: string, remote: string, over: Partial<Job> = {}): Job {
	const j = { schema: 1, id, key: `build:${id}`, goal: 'Run the local build', intent: 'other', remote, session: { agent: 'copilot', id: `s-${id}` },
		state: 'done', purpose: 'work', parents: [], asks: [], createdAt: now, updatedAt: now, ...over } as Job
	store.saveJob(j)
	return j
}
// Saved as it was before this change: written straight to disk, so the file holds the old clone task, as on the owner's machine.
function legacy(code: string, j: Job | undefined, todos: string[]): Workflow {
	const wf = { schema: 1, id: `w-${code}`, code, kind: 'reply', state: 'needs_human', key: { type: 'thread', id: code },
		chat: { id: `chat-${code}`, name: 'Aurora build', test: false, group: true }, asker: { id: 'kim', name: 'Kim Lane' }, session: { agent: 'copilot', id: `s-${code}` },
		lastMsgId: '100', msgIds: ['100'], pending: [], status: 'Ready', newCount: 0, todos, ...(j ? { job: j.id } : {}), createdAt: now, updatedAt: now } as Workflow
	writeFileSync(join(store.root, 'state', 'workflows', `${wf.id}.json`), JSON.stringify(wf))
	return wf
}
const onDisk = (wf: Workflow) => (JSON.parse(readFileSync(join(store.root, 'state', 'workflows', `${wf.id}.json`), 'utf8')) as Workflow).todos
// Any later save of the item, for an unrelated reason (here: its status), is the save that cleans it up.
function laterSave(wf: Workflow) { const fresh = store.workflow(wf.id)!; fresh.status = 'Checked again'; store.save(fresh) }

mkdirSync(join(store.root, 'state', 'workflows'), { recursive: true })
try {
	// 1. A local build whose clone is cached here: its old clone task is gone after the next save; his own task stays.
	const a = legacy('A201', job('j201', cached, { needsCheckout: true }), [cloneTodo(cfg, cached, store.machine), OWN])
	assert.deepEqual(onDisk(a), [cloneTodo(cfg, cached, store.machine), OWN], 'the old task is on disk before any save')
	assert.deepEqual(card(store, store.workflow(a.id)!).todos, [OWN], 'the card already hides it at read time (SEND view.ts)')
	laterSave(a)
	assert.deepEqual(onDisk(a), [OWN])
	pass('a cached clone: the next save drops the clone task and keeps the owner\'s own task, even one that talks about cloning')

	// 2. A local build whose clone is NOT here: the task is real and stays through any number of saves.
	const b = legacy('A202', job('j202', absent, { needsCheckout: true }), [cloneTodo(cfg, absent, store.machine)])
	laterSave(b); laterSave(b)
	assert.deepEqual(onDisk(b), [cloneTodo(cfg, absent, store.machine)])
	assert.deepEqual(card(store, store.workflow(b.id)!).todos, [cloneTodo(cfg, absent, store.machine)])
	pass('a checkout that is really needed and not cloned: the clone task stays on disk and on the card')

	// 3. An Azure DevOps PR review with no clone: the PR is read remotely, so the old hint is not his task and goes on the next save.
	const c = legacy('A203', job('j203', absent, { key: 'pr:Acme/Web/203', intent: 'pr_review' }), [cloneTodo(cfg, absent, store.machine), OWN])
	laterSave(c)
	assert.deepEqual(onDisk(c), [OWN])
	pass('an ADO review read remotely (A177 shape): the next save drops the old clone hint, keeps the other task')

	// 4. No job, or a job no longer on disk: nothing to decide, so nothing changes.
	const d = legacy('A204', undefined, [cloneTodo(cfg, cached, store.machine), OWN])
	laterSave(d)
	assert.deepEqual(onDisk(d), [cloneTodo(cfg, cached, store.machine), OWN])
	const e = legacy('A205', { id: 'j-gone' } as Job, [cloneTodo(cfg, cached, store.machine)])
	laterSave(e)
	assert.deepEqual(onDisk(e), [cloneTodo(cfg, cached, store.machine)])
	pass('no job, or a job that is gone: the save leaves the tasks exactly as they were')

	// 5. Tasks the owner already took on (kept, "Left for you") are not the helper's: a save never touches them.
	const f = legacy('A206', job('j206', cached, { needsCheckout: true }), [cloneTodo(cfg, cached, store.machine)])
	const kept = [{ id: 't1', text: cloneTodo(cfg, cached, store.machine), at: now }]
	writeFileSync(join(store.root, 'state', 'workflows', `${f.id}.json`), JSON.stringify({ ...f, kept }))
	laterSave(f)
	const saved = store.workflow(f.id)!
	assert.deepEqual(saved.todos, [])
	assert.deepEqual(saved.kept, kept)
	pass('kept "Left for you" tasks are untouched; only the reply\'s clone hint goes')

	// 6. No save scanned or rewrote this machine's clone list: the pending rescan is still pending, other settings kept.
	assert.equal(readFileSync(localFile, 'utf8'), localBefore)
	assert.equal(localClones().scannedAt, undefined)
	pass('no save scanned or wrote local.json; the pending rescan is left for the runner')
	console.log(`3e2 PROOF: ${passed} fictional store journeys passed.`)
} catch (error) { console.error(`3e2 PROOF FAILED in ${root}`); throw error }
