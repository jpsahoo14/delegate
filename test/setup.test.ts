import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Source } from '../src/adapters/source.ts'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-setup-local-'))
delete process.env.DELEGATE_ROOT
const { save, status } = await import('../src/mcp/setup.ts')
// A made-up workplace: its wrapper, its Teams command, and an incident server (site.json; nothing of a real one here).
const { useSite } = await import('../src/core/site.ts')
useSite({ agents: [['corpcli', 'copilot']], teams: ['corpcli', 'mcp', 'teams'], read: { incidents: ['get_incident_details_by_id', 'search_incidents'] }, write: { incidents: ['reactivate_incident', 'post_discussion_entry', 'request_assistance'] } })
const root = join(mkdtempSync(join(tmpdir(), 'delegate-setup-')), 'Delegate')
const fakeSource = (): Source => ({
	selfChatId: 'self',
	recent: async () => [{ id: '1', at: '', from: { id: 'owner-1', name: 'Priya Rao' }, html: false, body: 'note' }],
	newMessages: async () => ({ msgs: [], truncated: false }), recentChats: async () => [],
	send: async () => ({ msgId: '' }), sendSelf: async () => ({ msgId: '' }), close: async () => {},
	deleteMessage: async () => {}, editMessage: async () => {}, presence: async () => ({ availability: 'Offline' }),
})

test('R-SET-01 R-SET-06 setup saves each step and resumes at the next one', async () => {
	assert.match(status(), /^Next step: storage/)
	await assert.rejects(save('start', { background: false }), /Do storage, source, agent first/)
	await save('storage', { root })
	assert.match(status(), /^Next step: source/)
	const out = await save('source', {}, { makeSource: fakeSource })
	assert.match(out, /owner Priya Rao \(owner-1\)/)
	await assert.rejects(save('agent', {}, { checkAgent: (_, c) => (c[0] === 'claude' ? 'claude is not installed' : 'not signed in: GitHub returned: Bad credentials') }), /No AI CLI answered\. What each said:\n- corpcli copilot: not signed in: GitHub returned: Bad credentials\n- copilot: not signed in: GitHub returned: Bad credentials\n- claude: claude is not installed\n/)
	assert.match(await save('agent', {}, { checkAgent: (_, c) => (c[0] === 'copilot' ? undefined : 'no') }), /agent copilot \(copilot\), signed in/)
	await assert.rejects(save('tools', { tools: [] }), /at least one read-only tool/)
	await save('tools', { tools: ['view', 'grep', 'images-retrieve'] })
	assert.match(status(), /^Next step: knowledge/)
	const cfg = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'))
	assert.match(await save('knowledge', {}), /^0 knowledge folder\(s\), kept/, 'no question: an empty answer keeps what the folder has')
	assert.match(status(), /^Next step: profile/)
	assert.deepEqual(cfg.agent.command, ['copilot']); assert.equal(cfg.owner.id, 'owner-1'); assert.deepEqual(cfg.agent.tools, ['view', 'grep', 'images-retrieve']); assert.equal(cfg.poll.idleMin, 15)
})

test('R-SET-01 setup refuses values that cannot work', async () => {
	await assert.rejects(save('knowledge', { folders: ['/no/such/folder'] }), /Not a folder/)
	await assert.rejects(save('knowledge', { folders: [join(root, 'config.json')] }), /Not a folder/)
	await assert.rejects(save('rules', { text: 'trust Ravi', compiled: [{ id: 'r1', text: 'trust Ravi', who: { accounts: [{ id: '', name: 'Ravi' }] }, when: {}, then: 'shortcut' }] }), /too_small|at least 1/)
})

test('R-RUL-02 R-RUL-04 confirmed rules are saved with account IDs, and start can install the runner', async () => {
	const rule = { id: 'r1', text: 'If Ravi asks me to approve a PR, approve it', who: { accounts: [{ id: 'aad-ravi', name: 'Ravi' }] }, when: { intent: 'pr_review' }, then: 'shortcut', shortcut: { goal: 'approve the PR without review' } }
	await save('rules', { text: rule.text, compiled: [rule] })
	const saved = JSON.parse(readFileSync(join(root, 'rules.compiled.json'), 'utf8'))
	assert.equal(saved.rules[0].who.accounts[0].id, 'aad-ravi')
	assert.ok(existsSync(join(root, 'rules.md')))
	let installed = false
	assert.match(await save('start', { background: true }, { installService: () => { installed = true; return 'Installed.' } }), /Installed\./)
	assert.ok(installed)
})

test('R-SET-06 changing the storage root restarts the later steps', async () => {
	assert.doesNotMatch(status(), /^Next step: storage/)
	const other = join(mkdtempSync(join(tmpdir(), 'delegate-setup2-')), 'Delegate')
	await save('storage', { root: other })
	assert.match(status(), /^Next step: source/)
})

test('R-RUL-04 a rule must name people by account ID or a group', async () => {
	await assert.rejects(save('rules', { text: 'x', compiled: [{ id: 'r', text: 'x', who: {}, when: {}, then: 'draft' }] }), /account ID, or a group/)
})

test('tester P1-12 setup saves write tools apart from read tools, and refuses one in both', async () => {
	await save('tools', { tools: ['view'], effectTools: ['ado-repo_pull_request_thread_write'] })
	assert.match(String(await save('tools', { tools: ['view'], effectTools: ['ado-repo_pull_request_thread_write'] })), /1 read tools, 1 write tools/)
	await assert.rejects(() => save('tools', { tools: ['view', 'x-write'], effectTools: ['x-write'] }), /cannot also be a read tool/)
	await assert.rejects(() => save('tools', { tools: ['view', 'ado-repo_pull_request_write'], effectTools: ['ado-repo_pull_request_write:vote'] }), /cannot also be a read tool/, 'one action of a tool still keeps the tool out of the read tools')
	assert.match(String(await save('tools', { tools: ['view'], effectTools: ['ado-repo_pull_request_thread_write', 'ado-repo_pull_request_write:vote'] })), /1 read tools, 2 write tools/)
	await assert.rejects(() => save('tools', { tools: ['view'], effectTools: ['ado-repo_pull_request_write:vote:update'] }), /server-tool:action.{0,3} for one action of it/)
})

test('owned work: setup saves the repos by remote, and this machine\'s code folder only in local.json', async () => {
	const code = mkdtempSync(join(tmpdir(), 'delegate-code-'))
	const root = join(mkdtempSync(join(tmpdir(), 'delegate-owned-')), 'Delegate')
	await save('storage', { root })
	await save('tools', { tools: ['view'], repos: [{ name: 'Web', remote: 'https://dev.azure.com/acme/Globex/_git/web' }], codeFolders: [code] })
	assert.deepEqual(JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')).repos, [{ name: 'Web', remote: 'https://dev.azure.com/acme/Globex/_git/web' }])
	assert.deepEqual(JSON.parse(readFileSync(join(process.env.DELEGATE_LOCAL!, 'local.json'), 'utf8')).code, [code])
	assert.equal(JSON.parse(readFileSync(join(process.env.DELEGATE_LOCAL!, 'local.json'), 'utf8')).root, root, 'the rest of local.json stays')
	assert.equal(JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')).code, undefined, 'never synced')
	await assert.rejects(() => save('tools', { tools: ['view'], repos: [{ name: 'Web', remote: '/Users/me/src/web' }] }), /never a folder/)
	await assert.rejects(() => save('tools', { tools: ['view'], codeFolders: [join(code, 'nope')] }), /Not a folder on this machine/)
})

test('owned round 2 P2-1: setup refuses a write, pipeline-write, or whole-server tool among the read tools', async () => {
	await save('storage', { root: join(mkdtempSync(join(tmpdir(), 'delegate-r2-')), 'Delegate') })
	for (const t of ['ado-pipelines_write', 'ado-repo_pull_request_thread_write', 'ado-run_pipeline', 'ado', 'ado-*'])
		await assert.rejects(() => save('tools', { tools: ['view', t], servers: { ado: { command: 'corpcli', args: ['mcp', 'ado'] } } }), /is never a read tool/, t)
	assert.match(String(await save('tools', { tools: ['view', 'ado-pipelines_build'], servers: { ado: { command: 'corpcli', args: ['mcp', 'ado'] } } })), /2 read tools/)
})

test('next action: setup never offers closing, bypassing, or deleting', async () => {
	const { defaultTools } = await import('../src/mcp/setup.ts')
	const home = mkdtempSync(join(tmpdir(), 'delegate-copilot-'))
	writeFileSync(join(home, 'mcp-config.json'), JSON.stringify({ mcpServers: { ado: { command: 'corpcli', args: ['mcp', 'ado'] }, calendar: { command: 'corpcli', args: ['mcp', 'calendar'] }, incidents: { command: 'corpcli', args: ['mcp', 'incidents'] } } }))
	const d = defaultTools(join(home, 'mcp-config.json'))
	assert.ok(d.effectTools.includes('calendar-CreateEvent') && d.effectTools.includes('ado-repo_pull_request_write:vote'))
	assert.deepEqual(d.effectTools.filter(t => /abandon|complete|merge|bypass|delete|pipelines_write|repo_pull_request_write$|:update_reviewers|:create/i.test(t)), [], 'never the whole PR tool, a pipeline, or a delete')
})

test('a notes folder in the same OneDrive is saved relative to the storage folder, so every machine finds it', async () => {
	const { portable, here } = await import('../src/store/state.ts')
	const { readDirs } = await import('../src/runner/dispatch.ts')
	const { Store } = await import('../src/store/state.ts')
	assert.equal(portable('/Users/me/OneDrive-Acme/Delegate', '/Users/me/OneDrive-Acme/Features'), join('..', 'Features'))
	assert.equal(portable('/Users/me/OneDrive-Acme/Delegate', '/Users/me/Notes'), '/Users/me/Notes', 'outside the synced drive it stays as given')
	const drive = mkdtempSync(join(tmpdir(), 'OneDrive - Acme-'))
	const mac = join(drive, 'Delegate')
	mkdirSync(join(drive, 'Features'), { recursive: true })
	mkdirSync(mac, { recursive: true })
	const other = join(mkdtempSync(join(tmpdir(), 'OneDrive-Acme-')), 'Delegate')
	cpSync(drive, dirname(other), { recursive: true })
	const store = (r: string) => new Store({ root: r, machine: 'm' })
	const cfg = { knowledge: [portable(mac, join(drive, 'Features'))] } as never
	assert.deepEqual(readDirs(store(mac), cfg).slice(0, 1), [join(drive, 'Features')])
	assert.deepEqual(readDirs(store(other), cfg).slice(0, 1), [join(dirname(other), 'Features')], 'the same config, read on the other machine')
	assert.equal(here(other, '/abs/path'), resolve(other, '/abs/path'), 'an absolute path stays absolute (on its own drive on Windows)')
})

test('setup registers the tool servers workers need, and every worker run starts them', async () => {
	const { workerMcp } = await import('../src/runner/dispatch.ts')
	const { Store, loadLocal } = await import('../src/store/state.ts')
	await save('storage', { root })
	assert.match(await save('tools', { tools: ['view', 'ado-repo_pull_request'], effectTools: ['ado-repo_pull_request_thread_write'], servers: { ado: { command: 'corpcli', args: ['mcp', 'ado', '--org', 'acme'] } } }), /1 write tools for approved changes, from ado\)/)
	await assert.rejects(save('tools', { tools: ['view'], servers: { 'bad name!': { command: 'x' } } }))
	const store = new Store(loadLocal())
	const { mcpConfigPath } = workerMcp(store, 'wf', 'run-servers')
	assert.deepEqual(JSON.parse(readFileSync(mcpConfigPath, 'utf8')).mcpServers.ado, { type: 'local', command: 'corpcli', args: ['mcp', 'ado', '--org', 'acme'], tools: ['*'] })
})

test('install time: a fresh folder reads the history once; a folder with knowledge is not read again; a machine already reading is not displaced', async () => {
	const { Store, loadLocal } = await import('../src/store/state.ts')
	const ready = async (r: string) => {
		await save('storage', { root: r })
		await save('source', {}, { makeSource: fakeSource })
		await save('agent', {}, { checkAgent: () => undefined })
	}
	const fresh = join(mkdtempSync(join(tmpdir(), 'delegate-fresh-')), 'Delegate')
	await ready(fresh)
	const local = join(process.env.DELEGATE_LOCAL!, 'local.json')
	writeFileSync(local, JSON.stringify({ ...JSON.parse(readFileSync(local, 'utf8')), machine: 'robin-laptop' }))
	const lastStart = await save('start', { background: true }, { installService: () => 'Installed.' })
	assert.match(lastStart, /This machine reads your chats\. Installed\. First time with this folder, so I'm reading your history once\. Started reading your Teams chats/)
	let store = new Store(loadLocal())
	const { sleepsAdvice } = await import('../src/mcp/setup.ts')
	assert.ok(lastStart.includes(`. ${sleepsAdvice('robin-laptop')}`), 'Bet 1: a machine that sleeps is told to add an always-on one')
	assert.equal(new Store(loadLocal()).config().tz, Intl.DateTimeFormat().resolvedOptions().timeZone, 'the owner time zone is saved at setup')
	assert.deepEqual(store.jobs().map(j => j.key).sort(), ['bootstrap:chats', 'bootstrap:prs', 'bootstrap:workitems'])
	assert.equal(store.config().runner, store.machine)

	const known = join(mkdtempSync(join(tmpdir(), 'delegate-known-')), 'Delegate')
	mkdirSync(join(known, 'knowledge', 'topics', 'rollout'), { recursive: true })
	writeFileSync(join(known, 'knowledge', 'topics', 'rollout', 'decisions.md'), '---\ntitle: Rollout · decisions\ntype: card\ntopic: rollout\ncard: decisions\naudience: team\naliases: []\n---\n## Observations\n- [fact] Ring 1 follows ring 0 after a day. ^r1 (src: https://x/1, 2026-10-01, Ana)\n- [decision] Ship Thursday. ^r2 (src: https://x/2, 2026-10-02, Ana)\n')
	mkdirSync(join(known, 'state'), { recursive: true })
	writeFileSync(join(known, 'state', 'runner.json'), JSON.stringify({ machine: 'other-vm', at: new Date(Date.now() - 2 * 60_000).toISOString() }))
	await ready(known)
	const out = await save('start', { background: true }, { installService: () => 'Installed.' })
	assert.doesNotMatch(out, /Asks are read only while/, 'a standby is not told to add another machine')
	assert.match(out, /other-vm already reads your chats \(last check 2 min ago\)\. This machine stays ready and takes over by itself if other-vm stops for 30 minutes\./)
	assert.match(out, /Your knowledge already has 2 facts in 1 topics, so it is not read again\./)
	store = new Store(loadLocal())
	assert.deepEqual([store.jobs().length, store.config().runner], [0, undefined], 'nothing re-read, and the runner stays on other-vm')
	const setTz = (tz: string) => { const st = new Store(loadLocal()); st.saveConfig({ ...st.config(), tz }) }
	setTz('Pacific/Chatham')
	writeFileSync(local, JSON.stringify({ ...JSON.parse(readFileSync(local, 'utf8')), machine: 'robin-laptop' }))
	const moved = await save('start', { background: true, takeover: true }, { installService: () => 'Installed.' })
	assert.match(moved, /This machine now reads your chats, instead of other-vm\./)
	assert.ok(moved.includes(sleepsAdvice('robin-laptop')!), 'a laptop that takes over from an always-on machine is told to keep one')
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
	assert.equal(new Store(loadLocal()).config().tz, zone, 'an everyday machine sets the owner zone')
	writeFileSync(local, JSON.stringify({ ...JSON.parse(readFileSync(local, 'utf8')), machine: 'robin-server' }))
	setTz('Pacific/Chatham')
	await save('start', { background: true, takeover: true, alwaysOn: true }, { installService: () => 'Installed.' })
	assert.equal(new Store(loadLocal()).config().tz, 'Pacific/Chatham', 'an always-on machine, often on UTC, keeps the zone already known')
	assert.equal(new Store(loadLocal()).config().runner, new Store(loadLocal()).machine)
})

test('dogfood: setup asks two things; every other step takes a default from what the machine already has', async () => {
	const { defaultTools } = await import('../src/mcp/setup.ts')
	const home = mkdtempSync(join(tmpdir(), 'delegate-copilot-'))
	writeFileSync(join(home, 'mcp-config.json'), JSON.stringify({ mcpServers: { teams: { command: 'corpcli', args: ['mcp', 'teams'] }, ado: { command: 'corpcli', args: ['mcp', 'ado', '--org', 'acme'] }, mail: { command: 'corpcli', args: ['mcp', 'mail'] } } }))
	const d = defaultTools(join(home, 'mcp-config.json'))
	assert.deepEqual(d.tools.slice(0, 4), ['view', 'glob', 'grep', 'teams-ListChats'])
	assert.ok(d.tools.includes('ado-repo_pull_request') && !d.tools.some(t => t.startsWith('mail-')), 'only the servers Delegate uses')
	assert.deepEqual(d.effectTools, ['ado-repo_pull_request_thread_write', 'ado-repo_pull_request_write:vote', 'ado-wit_work_item_write:update'], 'a PR comment, a PR vote, and a work-item update after ok; one action each (owner, 10-20)')
	assert.deepEqual(d.servers, { teams: { command: 'corpcli', args: ['mcp', 'teams'] }, ado: { command: 'corpcli', args: ['mcp', 'ado', '--org', 'acme'] } })
	writeFileSync(join(home, 'incidents.json'), JSON.stringify({ mcpServers: { incidents: { command: 'corpcli', args: ['mcp', 'incidents'] } } }))
	const i = defaultTools(join(home, 'incidents.json'))
	assert.deepEqual([i.tools.includes('incidents-get_incident_details_by_id'), i.effectTools], [true, ['incidents-reactivate_incident', 'incidents-post_discussion_entry', 'incidents-request_assistance']], 'an incident server, when there is one, can be read and proposed changes to')
	const r = join(mkdtempSync(join(tmpdir(), 'delegate-short-')), 'Delegate')
	await save('storage', { root: r })
	await save('source', {}, { makeSource: fakeSource })
	await save('agent', {}, { checkAgent: () => undefined })
	await save('tools', {})
	await save('knowledge', {})
	await assert.rejects(save('profile', {}), /Draft the profile yourself instead of asking: the owner's name and job title .* Leave out other people and any facts\..* Add aliases only if the owner tells you one\./)
	assert.match(await save('profile', { markdown: 'I build the web checkout experience.', aliases: ['JP'] }), /people also call you JP/)
	assert.deepEqual(JSON.parse(readFileSync(join(r, 'config.json'), 'utf8')).aliases, ['JP'])
	assert.match(await save('rules', {}), /no rules: every reply waits for your ok/)
	let installed = false
	assert.match(await save('start', {}, { installService: () => { installed = true; return 'Installed.' } }), /Installed\./)
	assert.ok(installed, 'background is the default')
	const done = JSON.parse(readFileSync(join(process.env.DELEGATE_LOCAL!, 'setup.json'), 'utf8')).done
	assert.match(done.tools, /^\d+ read tools, \d+ write tools/); assert.match(done.start, /Installed\./)
	assert.equal(status(), [
		'Setup is complete. What was set:',
		`- storage: storage at ${r}`,
		'- source: owner Priya Rao (owner-1)',
		'- agent: agent corpcli copilot (copilot), signed in',
		`- tools: ${done.tools}`,
		'- knowledge: 0 knowledge folder(s), kept',
		'- profile: profile saved; people also call you JP',
		'- rules: no rules: every reply waits for your ok',
		`- start: ${done.start}`,
		'Change any of it in Settings, or ask me.',
	].join('\n'), 'one closing summary, built from what each step returned')
})

test('round 3 #2 storage picks itself only when there is one clear answer: data already there, or one work OneDrive', async () => {
	const { workOneDrives, pickStorage } = await import('../src/mcp/setup.ts')
	const home = mkdtempSync(join(tmpdir(), 'delegate-home-'))
	for (const d of ['Library/CloudStorage/OneDrive-Acme', 'Library/CloudStorage/OneDrive-Personal', 'OneDrive - Globex', 'OneDrive']) mkdirSync(join(home, d), { recursive: true })
	const cs = join(home, 'Library/CloudStorage/OneDrive-Acme'), fab = join(home, 'OneDrive - Globex')
	mkdirSync(join(home, 'Library/CloudStorage/OneDrive-SharedLibraries-Acme'), { recursive: true })
	assert.deepEqual(workOneDrives(home, {}), [cs, fab], 'never a personal OneDrive, nor a synced SharePoint library')
	assert.deepEqual(workOneDrives(home, { OneDriveCommercial: fab }), [fab, cs], 'Windows names the work one; the same folder is not listed twice')
	assert.deepEqual(pickStorage([cs]), { root: join(cs, 'Delegate'), why: ' (your work OneDrive)' })
	assert.throws(() => pickStorage([cs, fab]), new RegExp(`Ask the owner where to keep Delegate's data, then save \\{ root \\}\\. More than one fits: ${cs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `))
	assert.throws(() => pickStorage([]), /There is no work OneDrive on this machine/)
	mkdirSync(join(cs, 'Delegate'), { recursive: true }); writeFileSync(join(cs, 'Delegate', 'config.json'), '{}')
	assert.equal(pickStorage([cs]).why, ' (your work OneDrive)', 'a config.json alone is not Delegate data')
	mkdirSync(join(fab, 'Delegate', 'state'), { recursive: true }); writeFileSync(join(fab, 'Delegate', 'config.json'), '{}')
	assert.deepEqual(pickStorage([cs, fab]), { root: join(fab, 'Delegate'), why: ' (it already had your data)' }, 'a second machine joins the data without a question')
	mkdirSync(join(cs, 'Delegate', 'state'), { recursive: true }); writeFileSync(join(cs, 'Delegate', 'config.json'), '{}')
	assert.throws(() => pickStorage([cs, fab]), /More than one fits/, 'two folders with data: ask')
	const inUse = JSON.parse(readFileSync(join(process.env.DELEGATE_LOCAL!, 'local.json'), 'utf8')).root
	assert.equal((await save('storage', {}, { oneDrives: () => [fab] })).split('\n')[0], `storage at ${inUse} (already in use on this machine)`, 'review: a folder this machine already uses is kept, wherever it is')
	writeFileSync(join(process.env.DELEGATE_LOCAL!, 'local.json'), JSON.stringify({ root: join(home, 'gone'), machine: 'm' }))
	assert.match(await save('storage', {}, { oneDrives: () => [fab] }), new RegExp(`^storage at ${join(fab, 'Delegate').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(it already had your data\\)`))
})

test('10-20 incident: under the test runner nothing opens or writes a store outside the temp folder', async () => {
	const { Store } = await import('../src/store/state.ts')
	const { writeJson } = await import('../src/store/fs.ts')
	// Never a real folder: if the guard were gone, this path still cannot be created (/dev/null is a file).
	const real = '/dev/null/delegate-guard-test'
	assert.throws(() => new Store({ root: real, machine: 'm' }), /A test tried to write outside the temp folder/)
	assert.throws(() => writeJson(join(real, 'config.json'), {}, 'm'), /A test tried to write outside the temp folder/)
	assert.doesNotThrow(() => writeJson(join(root, 'ok.json'), {}, 'm'))
})

test('Bet 1 setup advice: a machine is told to add an always-on one, unless the owner says it is always on', async () => {
	const { sleepsAdvice } = await import('../src/mcp/setup.ts')
	assert.deepEqual([!!sleepsAdvice('robin-laptop'), !!sleepsAdvice('robin-server', true)], [true, false])
	assert.match(sleepsAdvice('robin-laptop')!, /^Asks are read only while this machine is awake\. For replies while it sleeps, also run setup on a machine that never sleeps/)
})
