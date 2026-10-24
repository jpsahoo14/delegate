// Manual HOST #29 follow-up proof. Fictional Temp roots and stub workers; no unit runner or external calls.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const root = mkdtempSync(join(tmpdir(), 'delegate-reply-retention-'))
Object.assign(process.env, { DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data') })
const load = path => import(pathToFileURL(join(process.cwd(), ...path.split('\\'))).href)
const { Store } = await load('src\\store\\state.ts')
const { dispatch } = await load('src\\runner\\dispatch.ts')
const { pruneReplySessions } = await load('src\\runner\\own.ts')
const store = new Store({ root, machine: 'acme-pc' })
const check = (ok, text) => { if (!ok) throw new Error(text); console.log(`PASS ${text}`) }
const cfg = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' },
  watch: [], discover: false, channels: false, maxParallel: 1, nudgeEveryMin: 30,
  agent: { flavor: 'copilot', command: ['fictional'], tools: ['view'] } }
store.saveConfig(cfg)
const paths = id => [join(root, 'copilot', 'session-state', id), join(root, 'sessions', id)]
const seed = (id, text = 'Fictional history') => {
  for (const dir of paths(id)) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'events.jsonl'), text) }
}
const kept = id => paths(id).every(dir => existsSync(join(dir, 'events.jsonl')))
const gone = id => paths(id).every(dir => !existsSync(dir))
const make = code => {
  const at = new Date().toISOString(), id = randomUUID()
  return { schema: 1, id, code, kind: 'reply', state: 'needs_human', key: { type: 'thread', id },
    chat: { id, name: 'Acme planning', test: true }, asker: { id: 'kim', name: 'Kim' },
    session: { agent: 'copilot', id: randomUUID() }, lastMsgId: '101', pending: ['101'], msgIds: ['101'],
    status: 'Draft ready', createdAt: at, updatedAt: at, revAt: at,
    draft: { text: 'Check with Kim.', commitment: false, sources: [] } }
}
const src = { selfChatId: 'self', sendSelf: async () => ({ msgId: randomUUID() }) }
const w = make('A1')
store.save(w, false)
const unmanaged = randomUUID(); seed(unmanaged)
const jobSessions = [randomUUID(), randomUUID()]
for (const [i, id] of jobSessions.entries()) {
  seed(id)
  store.saveJob({ schema: 1, id: randomUUID(), key: `acme:${i}`, goal: 'Keep job history', state: 'done',
    purpose: 'work', session: { agent: 'copilot', id }, parents: [], asks: [], createdAt: w.createdAt, updatedAt: w.updatedAt })
}
const ids = []
for (let i = 0; i < 5; i++) {
  const item = store.workflow(w.id)
  item.state = 'running'; item.ownerAnswer = `Rewrite ${i}`
  store.save(item, false)
  await dispatch(store, src, cfg, async (_, input) => {
    ids.push(input.sessionId)
    const dir = paths(input.sessionId)[0]
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'events.jsonl'), `${JSON.stringify({ id: randomUUID(), type: 'session.start', timestamp: new Date().toISOString(), data: {} })}\n`)
    store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Draft ready',
      reply: { text: 'Check with Kim.', commitment: false, sources: [] } }, input.runId)
    return { exitCode: 0, ms: 1 }
  }, undefined, [w.id])
}
const fresh = store.workflow(w.id)
check(fresh.session.id === ids[4] && fresh.session.previous === ids[3], 'five real dispatches track current and previous')
check(ids.slice(0, 3).every(gone) && ids.slice(3).every(kept), 'five runs leave exactly two local and synced backups')
check(jobSessions.every(kept) && kept(unmanaged), 'jobs and unmanaged histories are untouched')
const other = make('A2'); seed(other.session.id); store.save(other, false)
const ownerSession = randomUUID(); seed(ownerSession)
store.saveOwners([{ id: 'o1', session: ownerSession, what: 'Acme reviews', machine: store.machine, at: w.createdAt }])
fresh.session.retired = [...jobSessions, ownerSession, other.session.id, '..\\outside']
store.save(fresh, false)
pruneReplySessions(store)
check([...jobSessions, ownerSession, other.session.id].every(kept), 'every job, owner and other item reference is protected')
check(store.logs(1).some(e => e.event === 'reply-session-prune-refused'), 'invalid paths are refused explicitly')
check(store.workflow(w.id).session.retired.includes(other.session.id), 'temporarily protected cleanup remains retryable')
const save = store.save.bind(store); let saves = 0
store.save = (...args) => { saves++; return save(...args) }
pruneReplySessions(store); pruneReplySessions(store)
check(saves === 0, 'protected retired ids cause zero workflow writes across repeated passes')
store.save = save
other.session.id = randomUUID(); store.save(other, false)
pruneReplySessions(store)
check(gone(fresh.session.retired.find(id => id !== '..\\outside' && !jobSessions.includes(id) && id !== ownerSession)),
  'a released reference is pruned on the next pass')
const doomed = randomUUID(), added = randomUUID(); seed(doomed); seed(added)
const beforeRemoval = store.workflow(w.id); beforeRemoval.session.retired = [doomed]; store.save(beforeRemoval, false)
const remove = fs.rmSync, writer = new Store({ root, machine: 'acme-pc' }); let interleaved = false
try {
  fs.rmSync = (path, options) => {
    const result = remove(path, options)
    if (!interleaved) {
      interleaved = true
      const latest = writer.workflow(w.id)
      latest.status = 'Changed while a recursive removal was in progress'
      latest.ownerAnswer = 'Keep the new answer'
      latest.session.retired.push(added)
      writer.save(latest, false)
    }
    return result
  }
  syncBuiltinESMExports()
  pruneReplySessions(store)
} finally { fs.rmSync = remove; syncBuiltinESMExports() }
check(interleaved && store.workflow(w.id).ownerAnswer === 'Keep the new answer' &&
  store.workflow(w.id).session.retired.includes(added), 'cleanup preserves another writer and its new retirement metadata')
pruneReplySessions(store)
const failing = randomUUID(); seed(failing)
const willFail = store.workflow(w.id); willFail.session.retired = [failing]; store.save(willFail, false)
saves = 0; store.save = (...args) => { saves++; return save(...args) }
try {
  fs.rmSync = () => { throw new Error('Fictional locked session') }; syncBuiltinESMExports()
  pruneReplySessions(store); pruneReplySessions(store)
  check(saves === 0 && store.workflow(w.id).session.retired.includes(failing), 'failed deletions remain retryable without rewriting the item')
} finally { fs.rmSync = remove; syncBuiltinESMExports(); store.save = save }
pruneReplySessions(store)
// Legacy #29 replies have ownership evidence in worker logs, not a previous-session pointer.
const legacy = make('A3'), history = Array.from({ length: 5 }, randomUUID)
for (const [i, id] of history.entries()) {
  seed(id)
  store.log({ event: 'worker', fresh: true, workflowId: legacy.id, sessionId: id, sequence: i })
}
legacy.session = { ...legacy.session, id: history[4], at: new Date().toISOString() }
store.save(legacy, false)
const upgrades = store.upgrades(); delete upgrades['reply-sessions-1']; store.saveUpgrades(upgrades)
const scanLogs = store.logs.bind(store)
store.logs = (...args) => {
  const latest = writer.workflow(legacy.id); latest.status = 'Changed during legacy scanning'; writer.save(latest, false)
  return scanLogs(...args)
}
pruneReplySessions(store)
store.logs = scanLogs
check(history.slice(0, 3).every(gone) && history.slice(3).every(kept), 'versioned legacy recovery keeps the latest two known reply runs')
check(store.workflow(legacy.id).status === 'Changed during legacy scanning', 'legacy metadata update preserves another writer')
const oldLogs = store.logs.bind(store); let scans = 0
store.logs = (...args) => { scans++; return oldLogs(...args) }
pruneReplySessions(store); pruneReplySessions(store)
check(scans === 0, 'normal cleanup never re-scans historical logs')
check(history.slice(3).every(id => readFileSync(join(paths(id)[1], 'events.jsonl'), 'utf8') === 'Fictional history'),
  'retained histories remain byte-identical')
let referenceReads = 0
const jobs = store.jobs.bind(store), owners = store.owners.bind(store)
store.jobs = () => { referenceReads++; return jobs() }; store.owners = () => { referenceReads++; return owners() }
pruneReplySessions(store)
check(referenceReads === 0, 'no retired histories means no job or owner scan')
console.log(`PROOF_ROOT ${root}`)
