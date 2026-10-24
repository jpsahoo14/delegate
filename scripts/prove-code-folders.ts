// Fictional-root git/runner/HTTP journeys, deliberately not part of the unit-test suite.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config, Job, Workflow } from '../src/core/types.ts'
import type { Source } from '../src/adapters/source.ts'
import type { Procs } from '../src/runner/jobs.ts'

const root = mkdtempSync(join(tmpdir(), 'delegate-clones-proof-'))
for (const folder of ['local', 'copilot', 'config', 'cache', 'data', 'code', 'more-code']) mkdirSync(join(root, folder))
Object.assign(process.env, { DELEGATE_LOCAL: join(root, 'local'), DELEGATE_ROOT: join(root, 'fictional'),
	COPILOT_HOME: join(root, 'copilot'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), NODE_TEST_CONTEXT: 'fictional-proof' })
const { Store } = await import('../src/store/state.ts')
const { remoteOf, cloneUrl, cloneFor, cloneTodo, localClones, codeFolders, saveCodeFolders, scanCodeFolders, requestCloneScan, visibleCloneTodos, visibleCloneKept } = await import('../src/runner/repos.ts')
const { dispatch } = await import('../src/runner/dispatch.ts')
const { startJobs, checkJobs } = await import('../src/runner/jobs.ts')
const { tick } = await import('../src/runner/tick.ts')
const { serveInbox } = await import('../src/web/server.ts')
const { card } = await import('../src/web/view.ts')
const { settingsSchema, saveResultSchema } = await import('../src/web/react/domain/screens.ts')
const store = new Store({ root: join(root, 'fictional'), machine: 'fictional' })
const cfg: Config = { schema: 1, owner: { id: 'robin', name: 'Robin' }, source: { command: [], selfChatId: 'self' }, watch: [],
	agent: { flavor: 'copilot', command: ['fictional-worker-never-launched'], tools: [], host: false }, maxParallel: 3, nudgeEveryMin: 10, dailyRuns: 100 }
store.saveConfig(cfg); saveCodeFolders([])
const code = join(root, 'code'), more = join(root, 'more-code'), clone = join(code, 'Aurora'), remote = 'dev.azure.com/acme/web/aurora'
const localFile = join(root, 'local', 'local.json'), now = new Date().toISOString()
const source: Source = { selfChatId: 'self', recent: async () => [], newMessages: async () => ({ msgs: [], truncated: false }), recentChats: async () => [],
	send: async () => { throw new Error('This proof must not send') }, sendSelf: async () => ({ msgId: '99000' }), presence: async () => ({ availability: 'Away' }),
	close: async () => {}, deleteMessage: async () => {}, editMessage: async () => {} }
const procs: Procs = { start: () => { throw new Error('No process may launch in the stopped tick') }, alive: () => false, kill: () => true, openWindow: () => { throw new Error('No window may open') } }
let inbox: Awaited<ReturnType<typeof serveInbox>> | undefined, passed = 0
const proof = (text: string) => { passed++; console.log(`PASS ${text}`) }
function git(...args: string[]) { return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }) }
function makeClone(path: string, origin: string) {
	const bare = `${path}-origin.git`
	git('init', '--quiet', '--bare', '-b', 'main', bare)
	git('clone', '--quiet', bare, path)
	git('-C', path, 'remote', 'set-url', 'origin', origin)
}
function seed(id: string, job: Job, todos?: string[]): Workflow {
	const wf: Workflow = { schema: 1, id, code: id, kind: 'reply', state: 'needs_human', intent: job.intent, key: { type: 'thread', id },
		chat: { id: `chat-${id}`, name: 'Aurora review', test: false }, asker: { id: 'kim', name: 'Kim' }, session: { agent: 'copilot', id: `session-${id}` },
		lastMsgId: '100', msgIds: ['100'], pending: [], lastAsk: 'Robin, review the Aurora change.', draft: { text: 'The Aurora change keeps the fallback.', commitment: false, sources: [] },
		status: 'Ready', newCount: 0, todos, job: job.id, createdAt: now, updatedAt: now }
	job.parents = [id]; store.saveJob(job); store.save(wf); return wf
}
const job = (id: string, target = remote): Job => ({ schema: 1, id, key: `pr:Acme/Web/${id}`, goal: 'Review the Aurora change',
	intent: 'pr_review', remote: target, branch: 'main', session: { agent: 'copilot', id: `job-session-${id}` }, state: 'done', purpose: 'work', parents: [], asks: [], createdAt: now, updatedAt: now })
try {
	for (const url of [
		'https://acme.visualstudio.com/Web/_git/_full/Aurora',
		'https://acme.visualstudio.com/Web/_git/_optimized/Aurora',
		'https://acme.visualstudio.com/DefaultCollection/Web/_git/_full/Aurora',
		'https://dev.azure.com/acme/Web/_git/_full/Aurora',
		'git@ssh.dev.azure.com:v3/acme/Web/_full/Aurora',
		'https://dev.azure.com/acme/Web/_git/Aurora',
	]) assert.equal(remoteOf(url), remote)
	assert.equal(remoteOf('git@vs-ssh.visualstudio.com:v3/acme/Web/_optimized/Aurora'), remote)
	assert.equal(cloneUrl(remote), 'https://dev.azure.com/acme/web/_git/aurora')
	proof('six required limited-ref/plain URLs plus optimized SSH normalize; clone URL stays plain')

	makeClone(clone, 'https://acme.visualstudio.com/DefaultCollection/Web/_git/_full/Aurora')
	writeFileSync(localFile, JSON.stringify({ code: [code], clones: { 'dev.azure.com/acme/web/_full': [clone] }, scannedAt: now, fictionalOtherSetting: 'kept' }))
	assert.equal(localClones().scannedAt, undefined)
	assert.deepEqual(localClones().clones, {})
	assert.equal(cloneFor(remote), clone)
	const scanned = localClones().scannedAt
	assert.ok(scanned); assert.deepEqual(localClones().clones?.[remote], [clone])
	assert.equal(JSON.parse(readFileSync(localFile, 'utf8')).fictionalOtherSetting, 'kept')
	makeClone(join(code, 'Borealis'), 'https://dev.azure.com/acme/Web/_git/Borealis')
	assert.equal(cloneFor('dev.azure.com/acme/web/borealis'), undefined)
	assert.equal(localClones().scannedAt, scanned)
	proof('real limited-ref git clone found; invalid old map rescans once and preserves other local settings')

	inbox = await serveInbox(() => store)
	const url = (path: string) => { const u = new URL(path, inbox!.url); u.search = new URL(inbox!.url).search; return u }
	const get = async () => {
		const response = await fetch(url('/api/v1/settings')); assert.equal(response.status, 200)
		const data = settingsSchema.parse(await response.json()); assert.ok(data.code)
		return { ...data, code: data.code }
	}
	const save = async (key: string, value = '') => {
		const response = await fetch(url('/settings'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, value }) })
		return { status: response.status, body: saveResultSchema.parse(await response.json()) }
	}
	const beforeConfig = readFileSync(join(store.root, 'config.json'), 'utf8'), beforeLocal = readFileSync(localFile, 'utf8')
	let data = await get()
	assert.equal(data.code.machine, 'fictional'); assert.deepEqual(data.code.folders, [code])
	assert.equal(data.code.automatic, false); assert.equal(data.code.clones[0].remote, remote); assert.equal(data.code.scannedAt, scanned)
	assert.equal(data.code.example, process.platform === 'win32' ? 'C:\\src' : '/Users/you/code')
	assert.equal(data.code.clones[0].name, 'aurora')
	writeFileSync(join(root, 'not-a-directory.txt'), 'fictional')
	for (const [invalid, text] of [
		['relative-folder', 'Give an absolute folder path on this computer.'],
		[join(root, 'missing'), "That folder doesn't exist."],
		[join(root, 'not-a-directory.txt'), "That path isn't a folder."],
		[join(root, '\0'), "Couldn't check that folder. Check that you have permission to open it, or choose another folder."],
	]) {
		const refusal = await save('code-add', invalid); assert.equal(refusal.status, 422); assert.equal(refusal.body.ok, false); assert.equal(refusal.body.text, text)
		assert.equal(readFileSync(localFile, 'utf8'), beforeLocal)
	}
	assert.ok(store.logs().some(e => e.event === 'code-folder-check-failed' && String(e.reason).includes('null bytes')))
	const stale = await save('code-remove', join(root, 'missing'))
	assert.equal(stale.status, 422); assert.equal(stale.body.text, "That folder is no longer in this computer's list. Refresh Settings.")
	assert.equal(readFileSync(localFile, 'utf8'), beforeLocal)
	const added = await save('code-add', more)
	assert.equal(added.status, 200)
	assert.equal(added.body.text, 'Saved code folders on this computer. Other computers keep their own list. Delegate will look for your clones on its next check. This list updates then.')
	assert.deepEqual(localClones().code, [code, more]); assert.equal(localClones().scannedAt, undefined)
	const rescan = await save('code-rescan'); assert.equal(rescan.status, 200)
	assert.equal(rescan.body.text, 'Delegate will look for your clones on its next check. This list updates then.')
	assert.equal(localClones().clones?.['dev.azure.com/acme/web/borealis'], undefined)
	data = await get(); assert.equal(data.code.scannedAt, undefined)
	assert.equal(localClones().clones?.['dev.azure.com/acme/web/borealis'], undefined)
	assert.equal(readFileSync(join(store.root, 'config.json'), 'utf8'), beforeConfig)
	proof('real Settings HTTP uses plain missing/non-folder/invalid-path errors and this-computer receipts, logs other failures, preserves refused folders and queues scans without shared-config writes or a page scan')

	store.saveControl({ ...store.control(), stopped: true })
	await tick(store, { source, procs, force: true })
	assert.ok(localClones().clones?.['dev.azure.com/acme/web/borealis'])
	assert.ok(localClones().scannedAt)
	assert.equal((await save('code-remove', more)).status, 200)
	assert.equal((await save('code-remove', code)).status, 200)
	assert.deepEqual(codeFolders(), [])
	await save('code-add', code); await tick(store, { source, procs, force: true })
	proof('next real stopped runner tick scans queued folders; removing the last folder keeps an explicit empty list')

	const cached = localClones().clones
	assert.equal((await save('code-found')).status, 200)
	assert.equal(localClones().code, undefined); assert.equal(localClones().scannedAt, undefined)
	data = await get(); assert.equal(data.code.automatic, true); assert.deepEqual(data.code.folders, [])
	assert.deepEqual(localClones().clones, cached)
	assert.equal(readFileSync(join(store.root, 'config.json'), 'utf8'), beforeConfig)
	proof('Use found folders again clears only the local override and queues scanning; Settings never scans automatic folders')

	saveCodeFolders([code])
	const review = job('177')
	review.state = 'queued'
	let wf = seed('A177', review, [cloneTodo(cfg, remote, store.machine), 'Ask Kim about the rollout.'])
	const starts: { cwd: string; workflowId: string; runId: string }[] = []
	const fakeProcs: Procs = { ...procs, start: (_cfg, input) => { starts.push(input); return { pid: 987654 } } }
	assert.equal(startJobs(store, cfg, fakeProcs), 1); assert.equal(starts[0].cwd, clone)
	assert.ok(store.logs().some(e => e.event === 'job-start' && e.job === review.id && e.clone === clone))
	wf = store.workflow(wf.id)!
	assert.deepEqual(wf.todos, ['Ask Kim about the rollout.'])
	const run = store.job(review.id)!.run!
	store.writeReport({ workflowId: review.id, intent: 'pr_review', state: 'needs_human', summary: 'Reviewed through the fictional worker',
		reply: { text: 'The Aurora change keeps the fallback.', commitment: false, sources: [] } }, run.id)
	await checkJobs(store, source, cfg, fakeProcs)
	proof('real start/report/apply uses the limited-ref checkout and logs its path, with no clone todo')

	const absent = 'dev.azure.com/acme/web/no-checkout', remoteReview = job('178', absent)
	wf = seed('A178', remoteReview, [cloneTodo(cfg, absent, store.machine), 'Check the clone instructions with Kim.'])
	assert.deepEqual(visibleCloneTodos(cfg, wf, remoteReview, store.machine), ['Check the clone instructions with Kim.'])
	const template = cloneTodo(cfg, absent, store.machine)
	wf.kept = [
		{ id: 'clone-open', text: template, at: now },
		{ id: 'clone-done', text: template, at: now, done: now },
		{ id: 'owner-task', text: 'Check the clone instructions with Kim.', at: now },
		{ id: 'near-match', text: `${template}.`, at: now },
		{ id: 'other-machine', text: cloneTodo(cfg, absent, 'another-fictional-machine'), at: now },
		{ id: 'other-repo', text: cloneTodo(cfg, remote, store.machine), at: now },
	]
	const keptBefore = structuredClone(wf), localBeforeKept = readFileSync(localFile, 'utf8')
	assert.deepEqual(visibleCloneKept(cfg, wf, remoteReview, store.machine), wf.kept.slice(1))
	assert.deepEqual(visibleCloneKept(cfg, wf, { ...remoteReview, needsCheckout: true }, store.machine), wf.kept)
	assert.deepEqual(visibleCloneKept(cfg, wf, undefined, store.machine), wf.kept)
	assert.equal(visibleCloneKept(cfg, { ...wf, kept: undefined }, remoteReview, store.machine), undefined)
	assert.deepEqual(visibleCloneKept(cfg, { ...wf, kept: [] }, remoteReview, store.machine), [])
	const cachedKept = { ...wf, kept: [{ id: 'cached-clone', text: cloneTodo(cfg, remote, store.machine), at: now }, wf.kept[1]] }
	assert.deepEqual(visibleCloneKept(cfg, cachedKept, { ...remoteReview, remote, needsCheckout: true }, store.machine), [wf.kept[1]])
	assert.deepEqual(wf, keptBefore)
	assert.equal(readFileSync(localFile, 'utf8'), localBeforeKept)
	proof('Left for you removes only the exact undone obsolete clone template, retaining completed history, required checkouts, near matches, other machines/repos and owner tasks without mutation or scan')
	remoteReview.intent = 'other'; remoteReview.needsCheckout = true; store.saveJob(remoteReview)
	assert.deepEqual(visibleCloneTodos(cfg, wf, remoteReview, store.machine), wf.todos)
	const nonAdo = job('179'); nonAdo.intent = 'other'; nonAdo.key = 'build:cached-aurora'; nonAdo.needsCheckout = true
	const found = seed('A179', nonAdo, [cloneTodo(cfg, remote, store.machine), 'Clone notes are still my own task.'])
	requestCloneScan()
	const beforeFiltering = readFileSync(localFile, 'utf8')
	assert.deepEqual(visibleCloneTodos(cfg, found, nonAdo, store.machine), ['Clone notes are still my own task.'])
	assert.deepEqual(card(store, found).todos, ['Clone notes are still my own task.'])
	assert.equal(readFileSync(localFile, 'utf8'), beforeFiltering)
	assert.equal(localClones().scannedAt, undefined)
	store.saveControl({ ...store.control(), stopped: true })
	await tick(store, { source, procs, force: true })
	assert.deepEqual(store.workflow(found.id)?.todos, ['Clone notes are still my own task.'])
	assert.deepEqual(store.workflow(wf.id)?.todos, wf.todos)
	proof('same exact-template helper hides clone-found/non-ADO and remote ADO hints, keeps genuinely required checkouts and unrelated owner tasks; runner persists cleanup')

	remoteReview.intent = 'pr_review'; remoteReview.needsCheckout = undefined; store.saveJob(remoteReview)
	wf = store.workflow(wf.id)!
	assert.deepEqual(card(store, wf).todos, ['Check the clone instructions with Kim.'])
	proof('A177-shaped legacy clone task is hidden immediately in shared New/Classic card facts')

	const noCloneReview = job('180', absent); noCloneReview.state = 'queued'
	const remoteOnly = seed('A180', noCloneReview)
	assert.equal(startJobs(store, cfg, fakeProcs), 1)
	assert.equal(store.workflow(remoteOnly.id)?.todos?.includes(cloneTodo(cfg, absent, store.machine)), undefined)
	store.writeReport({ workflowId: noCloneReview.id, intent: 'pr_review', state: 'needs_human', summary: 'Reviewed remotely',
		reply: { text: 'Aurora is ready for your review.', commitment: false, sources: [] } }, store.job(noCloneReview.id)!.run!.id)
	await checkJobs(store, source, cfg, fakeProcs)

	const localWork = seed('A181', job('181', absent))
	localWork.state = 'running'; localWork.job = undefined; localWork.pending = ['100']; localWork.intent = 'other'; store.save(localWork)
	await dispatch(store, source, cfg, async (_cfg, input) => {
		store.writeReport({ workflowId: input.workflowId, intent: 'other', state: 'needs_human', summary: 'Run the requested local build',
			job: { key: 'build:aurora', goal: 'Run the requested local build', repo: cloneUrl(absent), needsCheckout: true } }, input.runId)
		return { exitCode: 0, ms: 1 }
	})
	const requested = store.workflow(localWork.id)!
	assert.equal(store.job(requested.job!)?.needsCheckout, true)
	assert.equal(startJobs(store, cfg, fakeProcs), 1)
	assert.deepEqual(store.workflow(localWork.id)?.todos, [cloneTodo(cfg, absent, store.machine)])
	store.writeReport({ workflowId: requested.job!, intent: 'other', state: 'needs_human', summary: 'Local checkout required', question: 'Where is the local build checkout?' }, store.job(requested.job!)!.run!.id)
	await checkJobs(store, source, cfg, fakeProcs)
	proof('real dispatch/report marks genuine local build checkout need; job start creates a clone task only for that need, never for remote PR reading')
	if (process.argv.includes('--browser')) {
		const { chromium } = await import('playwright-core')
		const browser = await chromium.launch({ channel: 'msedge', headless: true })
		try {
			for (const classic of [false, true]) for (const width of [1280, 400]) for (const colorScheme of ['light', 'dark'] as const) {
				store.saveUi('react', false, classic ? 'classic' : 'new')
				const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 800 : 860 }, colorScheme })
				try {
					const page = await context.newPage(), errors: string[] = []
					page.on('pageerror', error => errors.push(error.message))
					await page.goto(inbox.url + (classic ? '#classic/settings/codeFolders' : '#settings/codeFolders'))
					const section = page.locator('#setting-codeFolders'), heading = section.getByRole('heading', { name: 'Where your code is on this computer', exact: true })
					await heading.waitFor({ state: 'visible' })
					const identity = section.locator('h3 + p')
					assert.equal(await identity.textContent(), store.machine)
					assert.equal(await identity.getAttribute('class'), classic ? 'ct-muted' : 'muted')
					assert.equal(await identity.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).fontSize), '12.5px')
					assert.equal(await section.getByText(store.machine, { exact: true }).count(), 1)
					const titleBox = await heading.boundingBox(), machineBox = await identity.boundingBox()
					assert.ok(titleBox && machineBox && machineBox.y >= titleBox.y + titleBox.height)
					assert.notEqual(await identity.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).color), await heading.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).color), `${classic ? 'Classic' : 'New'} ${width}px ${colorScheme}: machine identity must be muted`)
					assert.deepEqual(errors, [])
				} finally { await context.close() }
			}
			proof('New and Classic show the page-server machine exactly once, muted beneath the exact heading, at desktop/mobile widths in light/dark')
		} finally { await browser.close() }
	}
	console.log(`CLONE PROOF: ${passed} fictional git/runner/HTTP journeys passed.`)
	if (process.argv.includes('--serve')) {
		console.log(`BROWSER URL ${inbox.url}`)
		console.log(`PROOF ROOT ${root}`)
		console.log(`ADD FOLDER ${more}`)
		const stop = join(root, 'finish-proof')
		await new Promise<void>((resolve, reject) => {
			const deadline = Date.now() + 10 * 60_000
			const timer = setInterval(() => { if (existsSync(stop)) { clearInterval(timer); resolve() } else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('Browser proof timed out')) } }, 200)
		})
	}
} finally {
	await new Promise<void>((resolve, reject) => inbox ? inbox.server.close(error => error ? reject(error) : resolve()) : resolve())
	await source.close()
	rmSync(root, { recursive: true, force: true })
}
