// Manual #27 scope proof. Production fs API, two real processes, fictional Temp data; no unit runner.
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = mkdtempSync(join(tmpdir(), 'delegate-read-phases-'))
const { readPhase, freshRead, readScope, scoped, readJson, readText, writeJson, writeText, listJson, records, removeFile, moveTo, appendLine, fsTime } =
  await import(pathToFileURL(join(process.cwd(), 'src', 'store', 'fs.ts')).href)
const check = (ok, text) => { if (!ok) throw new Error(text); console.log(`PASS ${text}`) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const delta = before => Object.fromEntries(Object.keys(fsTime).map(k => [k, fsTime[k] - before[k]]))
const file = join(root, 'one.json')
writeJson(file, { id: 'one', n: 1 }, 'acme')
await readPhase('hits', async () => {
  const before = { ...fsTime }
  for (let i = 0; i < 100; i++) checkValue(readJson(file, {}).n === 1)
  const d = delta(before)
  check(d.stats === 1 && d.opens === 1 && d.reads === 1, '100 JSON reads use one stat and one open in an epoch')
  const nested = { ...fsTime }, a = readJson(file, {})
  await Promise.resolve()
  const b = readScope(() => readJson(file, {}))
  check(delta(nested).stats === 0 && delta(nested).opens === 0 && a !== b, 'sync scope inside an awaited phase shares its cache and copy rules')
  b.n = 88
  check(readJson(file, {}).n === 1, 'unsaved mutations never poison a writing scope')
})
function checkValue(ok) { if (!ok) throw new Error('Wrong cached value') }
let shared
readScope(() => { shared = readJson(file, {}); check(shared === readJson(file, {}), 'outside phases the sync readonly scope preserves shared values') })
readScope(() => check(readJson(file, {}) !== readJson(file, {}), 'sync writing scopes still return copies'), { writes: true })
let ready, changed
const entered = new Promise(resolve => { ready = resolve }), written = new Promise(resolve => { changed = resolve })
await Promise.all([
  readPhase('parallel-reader', async () => {
    checkValue(readJson(file, {}).n === 1)
    listJson(root); records(root)
    ready(); await written
    check(readJson(file, {}).n === 2 && listJson(root).some(f => f.endsWith('two.json')) && records(root).length === 2,
      'parallel contexts see file and folder writes in the same epoch')
  }),
  readPhase('parallel-writer', async () => {
    await entered
    writeJson(file, { id: 'one', n: 2 }, 'acme')
    writeJson(join(root, 'two.json'), { id: 'two', n: 2 }, 'acme')
    changed()
  }),
])
const external = (path, value) => {
  const result = spawnSync(process.execPath, ['-e',
    "const fs=require('node:fs');const p=process.argv[1],t=p+'.swap';fs.writeFileSync(t,process.argv[2]);fs.renameSync(t,p)",
    path, JSON.stringify(value)], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(result.stderr || 'External writer failed')
}
await readPhase('external-epoch', async () => {
  checkValue(readJson(file, {}).n === 2)
  external(file, { id: 'one', n: 3, other: 'keep' })
  check(readJson(file, {}).n === 2, 'external changes are bounded by the declared epoch, not statted on every hit')
  const latest = freshRead(() => readJson(file, {}))
  check(latest.n === 3 && latest.other === 'keep', 'fresh commit read sees a second process immediately')
  freshRead(() => { const current = readJson(file, {}); current.n = 4; writeJson(file, current, 'acme') })
  check(readJson(file, {}).n === 4 && readJson(file, {}).other === 'keep', 'fresh merge preserves external fields and updates parent context')
  external(file, { id: 'one', n: 5, other: 'new' })
  await delay(1050)
  const before = { ...fsTime }
  for (let i = 0; i < 20; i++) checkValue(readJson(file, {}).n === 5)
  check(delta(before).stats === 1 && delta(before).opens === 1, 'expired epoch lazily revalidates once, not once per hit')
})
const absent = join(root, 'missing.json')
await readPhase('missing', async () => {
  checkValue(readJson(absent, null) === null)
  external(absent, { id: 'missing', n: 7 })
  await delay(1050)
  check(readJson(absent, null)?.n === 7, 'an externally created missing file is noticed after expiry')
})
const cards = join(root, 'cards'), nested = join(cards, 'topic')
mkdirSync(nested, { recursive: true })
const card = join(nested, 'fact.txt'); writeText(card, 'old', 'acme')
await readPhase('derived', async () => {
  let made = 0
  const value = () => scoped(`cards:${cards}`, () => { made++; return { fact: readText(card) } })
  checkValue(value().fact === 'old' && value().fact === 'old' && made === 1)
  external(card, 'new')
  await delay(1050)
  check(value().fact === '"new"' && made === 2, 'derived descendants are recomputed after expiry')
  writeText(card, 'local', 'acme')
  check(value().fact === 'local' && made === 3, 'process-wide ancestor versions invalidate derived values immediately')
})
await readPhase('move-delete-append', async () => {
  const done = join(root, 'done'); mkdirSync(done)
  const second = join(root, 'two.json')
  checkValue(readJson(second, {}).id === 'two')
  moveTo(second, done)
  check(readJson(second, null) === null && readJson(join(done, 'two.json'), {}).id === 'two', 'move updates cached source and destination')
  removeFile(join(done, 'two.json'))
  check(readJson(join(done, 'two.json'), null) === null && listJson(done).length === 0, 'remove updates cached listings and missing files')
  const log = join(root, 'events.jsonl'); appendLine(log, { n: 1 }); readText(log)
  appendLine(log, { n: 2 })
  check(readText(log).includes('"n":2'), 'append invalidates only its path and dependent folders')
})
let late
await readPhase('closed', async () => { readJson(file, {}); late = new Promise(resolve => setTimeout(() => {
  const before = { ...fsTime }, n = readJson(file, {}).n
  readJson(file, {})
  resolve({ n, ...delta(before) })
}, 30)) })
external(file, { id: 'one', n: 9 })
const afterClose = await late
check(afterClose.n === 9 && afterClose.opens === 2 && afterClose.stats === 0, 'late callbacks cannot reuse a settled phase snapshot')
let propagated = false
try { await readPhase('failed', async () => { readJson(file, {}); throw new Error('Fictional phase failure') }) } catch (error) {
  propagated = error.message === 'Fictional phase failure'
}
check(propagated, 'phase errors propagate with cleanup')
check(readJson(file, {}).n === 9, 'failed phase leaves no active cache')
await readPhase('record-copies', async () => {
  const one = records(root).find(r => r.id === 'one')
  one.n = 100
  check(records(root).find(r => r.id === 'one').n === 9 && readJson(file, {}).n === 9, 'bulk record copies do not mutate canonical JSON or record snapshots')
})
await readPhase('readonly-records', async () => { records(root).find(r => r.id === 'one').n = 101 }, { writes: false })
await readPhase('later-records', async () => check(records(root).find(r => r.id === 'one').n === 9, 'readonly rendering cannot poison another phase snapshot'))
external(file, { id: 'one', n: 10 })
await readPhase('replaced-records', async () => check(records(root).find(r => r.id === 'one').n === 10, 'a phase boundary detects an external atomic record replacement'))
writeText(file, JSON.stringify({ id: 'one', n: 11 }), 'acme')
check(freshRead(() => records(root)).find(r => r.id === 'one').n === 11, 'fresh record reads bypass cross-phase snapshots')
await readPhase('inplace-records', async () => {
  records(root)
  const child = spawnSync(process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1],process.argv[2])", file,
    JSON.stringify({ id: 'one', n: 12 })], { encoding: 'utf8' })
  if (child.status !== 0) throw new Error(child.stderr)
  check(freshRead(() => records(root)).find(r => r.id === 'one').n === 12, 'fresh reads validate files even after an external in-place edit')
  await delay(1050)
  check(records(root).find(r => r.id === 'one').n === 12, 'record snapshot age remains bounded when folder signatures do not change')
})
await readPhase('expired-list-write', async () => {
  listJson(root)
  external(join(root, 'external.json'), { id: 'external', n: 1 })
  await delay(1050)
  writeJson(file, { id: 'one', n: 12 }, 'acme')
  check(listJson(root).some(f => f.endsWith('external.json')), 'a local write never promotes an expired directory snapshot')
})
let refused = false
try { scoped('bad-key', () => 0) } catch { refused = true }
check(refused, 'derived keys still require kind and folder')
const cwd = process.cwd(), elsewhere = join(root, 'elsewhere')
mkdirSync(elsewhere); writeJson(join(elsewhere, 'one.json'), { id: 'one', n: 99 }, 'acme')
try {
  process.chdir(root)
  await readPhase('relative-paths', async () => {
    checkValue(readJson('one.json', {}).n === 12)
    listJson('.')
    process.chdir(elsewhere)
    check(readJson('one.json', {}).n === 99, 'relative paths cannot reuse another working directory cache key')
    writeJson(file, { id: 'one', n: 13 }, 'acme')
    check(readJson(file, {}).n === 13 && listJson(root).every(f => f.startsWith(root)),
      'canonical dependencies and directory results survive a working-directory change')
  })
} finally { process.chdir(cwd) }
console.log(`COUNTERS ${JSON.stringify(fsTime)}`)
console.log(`PROOF_ROOT ${root}`)
