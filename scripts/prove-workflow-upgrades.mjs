// Manual schema journeys on fictional stores; no unit runner or external service.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import ts from 'typescript'

const root = mkdtempSync(join(tmpdir(), 'delegate-workflow-upgrades-'))
for (const dir of ['local', 'copilot']) mkdirSync(join(root, dir))
Object.assign(process.env, { DELEGATE_ROOT: root, DELEGATE_LOCAL: join(root, 'local'), COPILOT_HOME: join(root, 'copilot') })
const { Store } = await import('../src/store/state.ts')
const { writeJson } = await import('../src/store/fs.ts')
const { stateFields, upgrade, WORKFLOW_SCHEMA } = await import('../src/core/upgrades.ts')
const { migrateWorkflows } = await import('../src/runner/upgrades.ts')
const { freshAsk } = await import('../src/runner/same-ask.ts')
const { checkOpen } = await import('../src/runner/continue.ts')
const { applyAnswers } = await import('../src/runner/apply.ts')
const { applyReport, dispatch } = await import('../src/runner/dispatch.ts')
const { SendUncertain } = await import('../src/adapters/source.ts')
const { statusLine } = await import('../src/core/render.ts')
const { refreshApprovedHolds } = await import('../src/runner/send-holds.ts')
const { joinWhy } = await import('../src/runner/work.ts')
const { intake, splitOff } = await import('../src/runner/intake.ts')
const { track } = await import('../src/runner/track.ts')
const { recheckPr } = await import('../src/runner/probe.ts')
const at = new Date().toISOString(), now = Date.now()
const cfg = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
  agent: { flavor: 'copilot', command: ['fictional'], tools: [], host: false } }
const item = id => ({ schema: 1, id, code: `A${id.replace(/\D/g, '') || '1'}`, kind: 'reply', state: 'needs_human',
  key: { type: 'thread', id }, chat: { id, name: 'Acme review', test: true }, asker: { id: 'kim', name: 'Kim' },
  session: { agent: 'copilot', id: `fictional-${id}` }, lastMsgId: '101', msgIds: ['101'], pending: [], lastAsk: 'Please check the plan.',
  status: 'Ready', newCount: 0, createdAt: at, updatedAt: at })
const job = id => ({ schema: 1, id, key: 'pr:4200001', goal: 'Review the change', state: 'done', purpose: 'work',
  session: { agent: 'copilot', id: `fictional-${id}` }, parents: [], asks: [], result: { summary: 'Ready', effects: [] }, createdAt: at, updatedAt: at })
const work = (goal, links = [], parts) => ({ goal, doneWhen: 'Reviewed', links, parts, steps: [] })
const raw = (s, w) => writeJson(join(s.root, 'state', 'workflows', `${w.id}.json`), w, s.machine)
const bytes = (s, id) => readFileSync(join(s.root, 'state', 'workflows', `${id}.json`), 'utf8')
const make = name => { const s = new Store({ root: join(root, name), machine: 'acme-pc' }); s.saveConfig(cfg); return s }
let checks = 0
const check = (ok, text) => { assert(ok, text); checks++; console.log(`PASS ${text}`) }
async function oldModule(file) {
  const source = execFileSync('git', ['show', `846f7e52:src/runner/${file}.ts`], { encoding: 'utf8' })
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    transformers: { before: [context => node => ts.visitEachChild(node, child => {
      if (ts.isImportDeclaration(child) && child.moduleSpecifier.text.startsWith('.'))
        return context.factory.updateImportDeclaration(child, child.modifiers, child.importClause,
          context.factory.createStringLiteral(pathToFileURL(resolve('src', 'runner', child.moduleSpecifier.text)).href), child.attributes)
      return child
    }, context)] } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}
const oldDispatch = await oldModule('dispatch'), oldWork = await oldModule('work')
function seed(s) {
  const setup = { ...item('acme-1'), question: 'Sign in, then answer or skip this item' }
  const content = { ...item('acme-2'), question: 'Check this item, then answer or skip it' }
  const stopped = { ...item('acme-3'), status: 'Tried 3 times; The plan cannot be read. Tried: first route; second route', job: 'acme-done' }
  const home = { ...item('acme-4'), lastAsk: 'Review PR 4200001', work: work('Review PR 4200001', ['pr:4200001', 'pr:4200002'], ['acme-5', 'acme-6']) }
  const bad = { ...item('acme-5'), partOf: home.id, lastAsk: 'Review PR 4200002' }
  const good = { ...item('acme-6'), partOf: home.id, lastAsk: 'Review PR 4200001' }
  const news = { ...item('acme-7'), question: 'No news on "the plan" since yesterday', work: { ...work('Track the plan'), checkAt: new Date(now - 86_400_000).toISOString() } }
  for (const w of [setup, content, stopped, home, bad, good, news]) raw(s, w)
  s.saveJob(job('acme-done'))
  s.saveThread(news.id, [{ id: '101', at, from: news.asker, text: 'Here is an update.', byOwner: false }])
  s.log({ event: 'worker', workflowId: setup.id, error: 'unknown model fictional', at })
  s.log({ event: 'worker', workflowId: content.id, error: 'Fictional content rejected', at })
  s.log({ event: 'retry-stopped', job: stopped.job, at })
  return [setup, content, stopped, home, bad, good, news]
}
const legacy = make('legacy'), current = make('current'), seeded = seed(current)
seed(legacy)
oldDispatch.repairRunFailures(legacy); oldDispatch.repairBlocked(legacy); oldWork.repairParts(legacy); oldWork.repairNoNews(legacy)
check(migrateWorkflows(current, now) === seeded.length, 'context pass migrates every eligible fictional item')
for (const w of seeded) {
  const a = legacy.workflow(w.id), b = current.workflow(w.id)
  for (const key of ['state', 'question', 'pending', 'runFailed', 'partOf']) assert.deepEqual(b[key], a[key], `${w.id}: ${key}`)
  if (a.work) {
    assert.deepEqual(b.work.parts, a.work.parts); assert.deepEqual(b.work.links, a.work.links)
    if (a.work.checkAt) assert(Math.abs(Date.parse(b.work.checkAt) - Date.parse(a.work.checkAt)) < 2000)
  }
}
check(true, 'v4-v6 match the previous four repair functions on the same stored shapes')
check(current.workflow('acme-1').state === 'running' && current.workflow('acme-2').runFailed.kind === 'other' &&
  current.workflow('acme-3').runFailed.tried.length === 2, 'setup reruns; content and stopped-route failures wait with preserved evidence')
const before = seeded.map(w => bytes(current, w.id)), logCount = current.logs(1).filter(e => e.event === 'upgraded').length
check(migrateWorkflows(current, now + 1000) === 0 && seeded.every((w, i) => bytes(current, w.id) === before[i]) &&
  current.logs(1).filter(e => e.event === 'upgraded').length === logCount, 'second pass changes no current item and emits no duplicate upgrade')
for (const w of seeded) for (const to of [4, 5, 6, 7]) assert.equal(current.logs(1).filter(e => e.event === 'upgraded' && e.code === w.code && e.to === to).length, 1)
check(true, 'each durable version transition is logged exactly once')

const compatible = { ...item('acme-8'), state: 'done', sent: { msgId: '201', at }, todos: ['Check the note', 'Check the note'] }
delete compatible.msgIds
raw(current, compatible)
const original = bytes(current, compatible.id), pure = current.workflow(compatible.id)
check(pure.msgIds.length === 0 && pure.kept.length === 1 && bytes(current, compatible.id) === original, 'pure msgIds/kept read upgrade performs no write')
check(JSON.stringify(upgrade(structuredClone(pure))) === JSON.stringify(pure), 'pure read upgrades are idempotent')
const unversioned = item('acme-84'); delete unversioned.schema
raw(current, unversioned); migrateWorkflows(current)
check(current.workflow(unversioned.id).schema === 7, 'an item without an old schema marker is treated as version one')
const family = make('goal')
raw(family, { ...item('acme-9'), lastAsk: 'Track this work', work: work('Review PR 4200001', ['pr:4200001', 'pr:4200002'], ['acme-10', 'acme-11']) })
raw(family, { ...item('acme-10'), lastAsk: 'Review PR 4200001', partOf: 'acme-9' })
raw(family, { ...item('acme-11'), lastAsk: 'Review PR 4200002', partOf: 'acme-9' })
migrateWorkflows(family)
check(family.workflow('acme-10').partOf === 'acme-9' && !family.workflow('acme-11').partOf &&
  family.workflow('acme-9').work.parts.includes('acme-10'), 'home goal PR is authoritative for retaining and detaching parts')
const liveHome = { ...family.workflow('acme-9'), lastAsk: 'Review PR 4200002' }
check(!!joinWhy(family, liveHome, { ...item('live-wrong'), chat: liveHome.chat, lastAsk: 'Review PR 4200002' }, true) &&
  !joinWhy(family, liveHome, { ...item('live-right'), chat: liveHome.chat, lastAsk: 'Review PR 4200001' }, true),
  'new joins also use the goal PR, so the repaired relationship cannot recur')

const reviews = make('reviews'), review = { ...item('acme-12'), intent: 'pr_review', job: 'acme-review',
  lastAsk: 'Review https://dev.azure.com/acme/Acme/_git/widget/pullrequest/4200001',
  question: 'Should capacity be 20 or 30?', prAuthor: 'Kim Example', todos: ['Not made for you: it names no exact call'] }
raw(reviews, review); reviews.saveJob({ ...job('acme-review'), parents: [review.id] })
reviews.writeReport({ workflowId: 'acme-review', intent: 'pr_review', state: 'needs_human', summary: 'Found an issue',
  effects: [{ system: 'azure devops', action: 'comment', target: 'PR 4200001', summary: 'P2: capacity is ignored',
    payload: { body: 'Please retain the capacity limit.', file: '/src/widget.ts', line: 12 } }] }, 'acme-run')
reviews.archiveReport('acme-review', 'acme-run')
migrateWorkflows(reviews)
const converted = reviews.workflow(review.id)
check(!converted.question && !converted.todos.length && converted.effects.length === 2 &&
  converted.effects.every(e => e.call.tool === 'ado-repo_pull_request_thread_write' && e.call.args.pullRequestId === 4200001),
  'v7 builds author-question and finding comment calls without executing them')
check(converted.effects.some(e => e.call.args.filePath === '/src/widget.ts' && e.call.args.rightFileStartLine === 12), 'finding file and line survive the code-built call')
const noPayload = { ...review, id: 'acme-13', code: 'A13', job: 'acme-missing' }
raw(reviews, noPayload); reviews.saveJob({ ...job('acme-missing'), parents: [noPayload.id] })
migrateWorkflows(reviews)
check(reviews.workflow(noPayload.id).question === noPayload.question && !reviews.workflow(noPayload.id).effects &&
  reviews.logs(1).filter(e => e.event === 'upgrade-skipped' && e.code === noPayload.code && e.step === 7).length === 1,
  'unrecoverable payload leaves the entire step unchanged and logs one durable skip')

const capped = make('capped')
for (let i = 20; i < 71; i++) raw(capped, { ...item(`acme-${i}`), schema: 6 })
check(migrateWorkflows(capped) === 50 && capped.workflows().filter(w => w.schema === WORKFLOW_SCHEMA).length === 50 &&
  !capped.upgrades()['schema-7-done'], 'at most 50 items migrate in a tick, with no premature completion marker')
check(migrateWorkflows(capped) === 1 && !!capped.upgrades()['schema-7-done'], 'next tick converges and marks the completed schema')
raw(capped, item('acme-71'))
check(migrateWorkflows(capped) === 1, 'an older item arriving after the completion marker still upgrades')
for (let i = 100; i < 151; i++) raw(capped, { ...item(`late-${i}`), schema: 6 })
check(migrateWorkflows(capped) === 50 && !capped.upgrades()['schema-7-done'], 'a late backlog invalidates the advisory completion marker')
migrateWorkflows(capped)
for (const schema of [1, 2, 3, 4, 5, 6, 7]) raw(capped, { ...item(`version-${schema}`), schema })
migrateWorkflows(capped)
check([1, 2, 3, 4, 5, 6, 7].every(n => capped.workflow(`version-${n}`).schema === 7), 'every prior persisted schema converges to the current version')
const typed = { ...item('acme-80'), schema: 7, status: 'Could not start', createdAt: at, msgIds: [] }
raw(capped, typed)
check(freshAsk(capped, capped.workflow(typed.id), now), 'current schema decision ignores misleading status prose')
raw(capped, { ...typed, status: 'Looks ready', statusReason: { kind: 'not-finished', text: 'A saved failure', at } })
check(!freshAsk(capped, capped.workflow(typed.id), now), 'structured failure controls follow-up eligibility independently of prose')
assert.equal(statusLine({ ...typed, state: 'scheduled', sendAt: at, statusReason: { kind: 'not-sent', text: 'Held for you', at } }), 'Held for you')

const win = { ...item('acme-81'), schema: 7, draft: { text: 'Check the plan.', commitment: false, sources: [] } }
raw(capped, win)
capped.setOpenWindow(win.id, { machine: capped.machine, pid: 12345, since: at, runId: 'acme-window' })
checkOpen(capped, { alive: () => false, windowAlive: () => false }, 0)
check(capped.workflow(win.id).returnedFrom.machine === capped.machine && !capped.workflow(win.id).returnedFrom.report, 'window release writes a structured return marker')
capped.writeAnswer({ code: win.code, verb: 'more', surface: 'self' })
await applyAnswers(capped, { selfChatId: 'self', sendSelf: async () => ({ msgId: '202' }), close: async () => {} }, cfg, { alive: () => false })
check(!capped.workflow(win.id).returnedFrom, 'the next owner action clears the return marker durably')
const draft = { ...win, returnedFrom: { machine: 'acme-pc', at, report: false }, runFailed: { at, kind: 'other', why: 'Old failure' }, statusReason: { kind: 'not-finished', text: 'Old failure', at } }
applyReport(draft, { workflowId: draft.id, intent: 'other', state: 'needs_human', summary: 'A new draft',
  reply: { text: 'Here is the plan.', commitment: false, sources: [] } })
check(!draft.returnedFrom && !draft.statusReason && !draft.runFailed, 'a new draft clears prior return and failure metadata')
const pr = { ...item('acme-82'), schema: 7, lastAsk: review.lastAsk, effects: [{ system: 'azure devops', action: 'vote', target: 'PR 4200001',
  summary: 'Approve the PR', head: 'old-head', call: { tool: 'ado-repo_pull_request_write', args: { action: 'vote', project: 'Acme', repositoryId: 'widget', pullRequestId: 4200001, vote: 'Approved' } } }] }
raw(capped, pr)
await recheckPr(capped, pr, { pr: async () => ({ status: 'active', head: 'new-head', title: 'Acme change', author: 'Kim', votes: [{ name: 'Robin', vote: 0 }] }) })
check(pr.reviewAgain?.pr === 4200001 && pr.reviewAgain.head === 'new-head', 'live review-again metadata records the exact PR head')
const merging = make('concurrent'), candidate = { ...item('acme-83'), question: 'Check this item, then answer or skip it' }
raw(merging, candidate)
const oldLogs = merging.logs.bind(merging)
let interleaved = false
merging.logs = days => {
  if (!interleaved) {
    interleaved = true
    const path = join(merging.root, 'state', 'workflows', `${candidate.id}.json`)
    const child = spawnSync(process.execPath, ['-e', "const fs=require('node:fs'),p=process.argv[1],v=JSON.parse(fs.readFileSync(p,'utf8'));v.earlier='External metadata';fs.writeFileSync(p+'.swap',JSON.stringify(v));fs.renameSync(p+'.swap',p)", path], { encoding: 'utf8' })
    assert.equal(child.status, 0, child.stderr)
  }
  return oldLogs(days)
}
migrateWorkflows(merging)
check(merging.workflow(candidate.id).earlier === 'External metadata' && merging.workflow(candidate.id).schema === 7, 'migration commit preserves another process field after context reads')
const writers = make('writers'), reported = { ...win, id: 'acme-85', code: 'A85' }
raw(writers, reported)
writers.setOpenWindow(reported.id, { machine: writers.machine, pid: 12345, since: at, runId: 'acme-report' })
writers.writeReport({ workflowId: reported.id, intent: 'other', state: 'needs_human', summary: 'Window result',
  reply: { text: 'Check the plan.', commitment: false, sources: [] } }, 'acme-report')
checkOpen(writers, { alive: () => false, windowAlive: () => false }, 0)
check(writers.workflow(reported.id).returnedFrom.report && writers.workflow(reported.id).draft.preview, 'a window report preserves its preview and sets report=true')
const uncertain = { ...win, id: 'acme-86', code: 'A86' }
raw(writers, uncertain)
writers.saveThread(uncertain.id, [{ id: '101', at, from: uncertain.asker, text: uncertain.lastAsk, byOwner: false }])
const src = { selfChatId: 'self', recent: async () => [], newMessages: async () => ({ msgs: [], truncated: false }),
  sendSelf: async () => ({ msgId: '203' }), send: async () => { throw new SendUncertain('Fictional answer lost') }, close: async () => {} }
writers.writeAnswer({ code: uncertain.code, verb: 'send', text: 'Check the plan.', surface: 'self' })
await applyAnswers(writers, src, cfg, { alive: () => false, windowAlive: () => false })
check(writers.workflow(uncertain.id).statusReason?.kind === 'not-sure-sent' && !writers.workflow(uncertain.id).sent, 'an actual uncertain send writes a structured reason without a false receipt')
const starting = { ...item('acme-87'), schema: 7, state: 'running', pending: ['101'] }
raw(writers, starting)
await dispatch(writers, src, cfg, async () => { throw new Error('Could not start: unknown model fictional') }, undefined, [starting.id])
check(writers.workflow(starting.id).statusReason?.kind === 'could-not-start', 'an actual start failure writes its structured setup reason')
const clocks = make('working-clocks'), clock = { ...item('acme-88'), schema: 7, runFailed: { kind: 'other', at, why: 'Fictional failure' }, statusReason: { kind: 'not-finished', text: 'Fictional failure', at } }
raw(clocks, clock)
clocks.writeAnswer({ code: clock.code, verb: 'answer', text: 'try again', surface: 'self' })
await applyAnswers(clocks, src, cfg, { alive: () => false, windowAlive: () => false })
const running = clocks.workflow(clock.id), started = running.workingSince
check(running.state === 'running' && !!started && !running.statusReason, 'a real Retry starts a working clock and clears the superseded failure')
const stable = new Date(Date.parse(started) - 60_000).toISOString()
running.workingSince = stable; clocks.save(running, false)
running.status = 'Unrelated metadata update'; clocks.save(running)
check(clocks.workflow(clock.id).workingSince === stable && clocks.workflow(clock.id).updatedAt !== stable, 'unrelated saves do not move the working clock')
const next = new Date(Date.now() + 1000).toISOString()
Object.assign(running, stateFields(running, 'waiting_on_task', next)); clocks.save(running, false)
check(clocks.workflow(clock.id).workingSince === next, 'entering waiting_on_task stamps its new phase time')
applyReport(running, { workflowId: running.id, intent: 'other', state: 'needs_human', summary: 'Finished',
  reply: { text: 'The work is ready.', commitment: false, sources: [] } })
clocks.save(running, false)
check(!clocks.workflow(clock.id).workingSince, 'leaving a working state clears the clock')
check(stateFields(undefined, 'running', at).workingSince === at && !stateFields(undefined, 'done', at).workingSince, 'new workflow construction stamps only working states')
const states = ['running', 'waiting_on_task', 'needs_human', 'waiting_on_sender', 'scheduled', 'open', 'done']
for (const before of states) for (const after of states) {
  const record = { state: before, workingSince: at }, fields = stateFields(record, after, next)
  assert.deepEqual(record, { state: before, workingSince: at })
  assert.deepEqual(Object.keys(fields).sort(), ['state', 'workingSince'])
  assert.equal(fields.state, after)
  assert.equal(fields.workingSince, after === 'running' || after === 'waiting_on_task' ? before === after ? at : next : undefined)
}
check(true, 'all 49 state pairs preserve state semantics and change only the clock')
const births = make('real-constructors'), marker = '2026-10-24T01:00:00.000Z'
births.saveUpgrades({ 'schema-7-done': marker })
const markerPath = join(births.root, 'state', 'upgrades.json'), markerBefore = readFileSync(markerPath, 'utf8')
const chat = { id: 'acme-intake-chat', name: 'Acme intake', test: true, group: false }
const birthCfg = { ...cfg, watch: [chat] }; births.saveConfig(birthCfg)
const inbound = { id: '101', at, from: { id: 'kim', name: 'Kim' }, body: 'Robin, please check the Acme plan?', html: false }
const birthSource = { ...src, recent: async id => id === chat.id ? [inbound] : [],
  newMessages: async id => ({ msgs: id === chat.id ? [inbound] : [], newest: '101', truncated: false }),
  members: async () => ({ ids: ['robin', 'kim'], guests: false, names: { robin: 'Robin', kim: 'Kim' } }) }
await intake(births, birthSource, birthCfg, {})
const incoming = births.workflows().find(w => w.chat.id === chat.id)
assert(incoming, 'Real intake must create the fixture workflow')
incoming.msgIds.push('102'); incoming.pending.push('102')
births.save(incoming, false)
births.saveThread(incoming.id, [...births.thread(incoming.id), { id: '102', at, from: inbound.from, text: 'Also check the separate plan.', byOwner: false }])
assert(splitOff(births, birthCfg, incoming, ['102']), 'Real split must create the second workflow')
births.saveWaiting([{ code: 'W1', chat: { id: 'acme-followup', name: 'Acme follow-up' }, msgId: '201', at,
  to: ['Kim'], text: 'Kim, can you share the plan?', state: 'waiting' }])
births.writeAnswer({ code: 'W1', verb: 'ok', surface: 'self' })
await applyAnswers(births, birthSource, birthCfg, { alive: () => false, windowAlive: () => false })
assert(births.workflows().some(w => w.followUp === 'Kim'), 'Real apply must create the follow-up workflow')
track(births, { target: 'PR 4200001', everyMinutes: 60 })
assert(births.workflows().some(w => w.kind === 'tracker'), 'Real track must create the tracker workflow')
const created = births.workflows(), beforeBirths = created.map(w => bytes(births, w.id))
const beforeBirthLogs = births.logs(1).filter(e => e.event === 'upgraded' || e.event === 'upgrade-skipped').length
check(created.length === 4 && created.every(w => w.schema === WORKFLOW_SCHEMA), 'real intake, split, apply and track constructors stamp the current workflow schema')
check(migrateWorkflows(births) === 0 && beforeBirthLogs === 0 && created.every((w, i) => bytes(births, w.id) === beforeBirths[i]) &&
  births.logs(1).filter(e => e.event === 'upgraded' || e.event === 'upgrade-skipped').length === beforeBirthLogs &&
  readFileSync(markerPath, 'utf8') === markerBefore,
  'real new items trigger no legacy migration, upgrade log, byte change or completion-marker write')
check(births.jobs().length > 0 && births.jobs().every(j => j.schema === 1), 'job constructors retain their independent schema one')
const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists)
const config = ts.readConfigFile(configPath, ts.sys.readFile).config
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, resolve(configPath, '..'))
const program = ts.createProgram(parsed.fileNames, parsed.options), checker = program.getTypeChecker()
const decl = program.getSourceFiles().flatMap(sf => [...sf.statements]).find(n => ts.isTypeAliasDeclaration(n) && n.name.text === 'Workflow')
const workflowType = checker.getTypeAtLocation(decl), bare = [], oldSchemas = []
function isWorkflow(node) {
  const type = checker.getTypeAtLocation(node)
  return !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) && checker.isTypeAssignableTo(checker.getNonNullableType(type), workflowType)
}
const objects = node => ts.isObjectLiteralExpression(node) ? [node] : ts.isConditionalExpression(node)
  ? [...objects(node.whenTrue), ...objects(node.whenFalse)] : ts.isParenthesizedExpression(node) ? objects(node.expression) : []
for (const file of program.getSourceFiles().filter(sf => {
  const path = relative(process.cwd(), sf.fileName).replaceAll('\\', '/')
  return !sf.isDeclarationFile && path.startsWith('src/') && !path.startsWith('src/web/')
})) {
  const note = node => bare.push(`${file.fileName}:${file.getLineAndCharacterOfPosition(node.pos).line + 1}`)
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'state' && isWorkflow(node.left.expression)) note(node)
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'Object.assign' && node.arguments.length > 1 && isWorkflow(node.arguments[0]))
      for (const arg of node.arguments.slice(1).flatMap(objects))
        for (const p of arg.properties) if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText(file) === 'state') note(p)
    if (ts.isObjectLiteralExpression(node) && isWorkflow(node))
      for (const p of node.properties) if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        if (p.name.getText(file) === 'state') note(p)
        if (p.name.getText(file) === 'schema' && (!ts.isPropertyAssignment(p) || p.initializer.getText(file) !== 'WORKFLOW_SCHEMA'))
          oldSchemas.push(`${file.fileName}:${file.getLineAndCharacterOfPosition(p.pos).line + 1}`)
      }
    ts.forEachChild(node, visit)
  }
  visit(file)
}
check(!bare.length, `every typed engine workflow transition uses the clock helper${bare.length ? `: ${bare.join(', ')}` : ''}`)
check(!oldSchemas.length, `every typed workflow constructor uses WORKFLOW_SCHEMA${oldSchemas.length ? `: ${oldSchemas.join(', ')}` : ''}`)
const holds = make('hold-refresh'), held = { ...item('acme-89'), schema: 7, holdCheckPending: true,
  ownerSend: { draft: { text: 'The plan is ready.', commitment: false, sources: [] }, at, askMsgId: '101' },
  draft: { text: 'The plan is ready.', commitment: false, sources: [] } }
raw(holds, held)
await refreshApprovedHolds(holds, { ...src, newMessages: async () => {
  const path = join(holds.root, 'state', 'workflows', `${held.id}.json`)
  const child = spawnSync(process.execPath, ['-e', "const fs=require('node:fs'),p=process.argv[1],v=JSON.parse(fs.readFileSync(p,'utf8'));v.earlier='Changed during hold refresh';fs.writeFileSync(p+'.swap',JSON.stringify(v));fs.renameSync(p+'.swap',p)", path], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  return { msgs: [], truncated: false }
} })
check(holds.workflow(held.id).earlier === 'Changed during hold refresh' && !holds.workflow(held.id).holdCheckPending,
  'released hold refresh preserves another writer while committing its refreshed hold')
console.log(`PASS ${checks} upgrade journeys; fictional stores, no live effects or unit runner`)
console.log(`PROOF_ROOT ${root}`)
