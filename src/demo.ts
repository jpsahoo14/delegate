import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CLI } from './paths.ts'
import { Store } from './store/state.ts'
import { DemoSource } from './adapters/demo.ts'
import { propose, knowledgeOf, remember } from './runner/proposals.ts'
import { track } from './runner/track.ts'
import { answerAutomation, propose as proposeAutomation } from './runner/automations.ts'
import { tick } from './runner/tick.ts'
import { NAME, CMD } from './brand.ts'

const HOME = join(homedir(), '.delegate-demo')
const LOCAL = join(HOME, 'local'), ROOT = join(HOME, 'root')
const CHAT = 'demo-chat'
// Every child sees only the sandbox: inherited Delegate settings are dropped and the root is pinned (final review P0-2).
export function demoEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const clean = Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('DELEGATE_') && k !== 'COPILOT_AGENT_SESSION_ID'))
	return { ...clean, DELEGATE_LOCAL: LOCAL, DELEGATE_ROOT: ROOT, DELEGATE_NO_KICK: '1' }
}
// The demo page applies its buttons at once, like the real one; everything else waits for the next demo command.
const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { stdio: args[0] === 'tick' ? 'ignore' : 'inherit', env: { ...demoEnv(), ...(args[0] === 'open' ? { DELEGATE_NO_KICK: '' } : {}) } })

// The sandbox must use the pretend chat and the canned worker, or nothing runs.
function sandboxed(): boolean {
	const cfg = new Store({ root: ROOT, machine: 'demo' }).config()
	return cfg?.source.command[0] === 'demo' && cfg.agent.command[0] === 'demo'
}

const GUIDE = `Your demo is ready. It uses a pretend team chat, so nothing reaches Teams and nothing costs AI credits.

Try these, one at a time:
  ${CMD} demo inbox                     see what needs you
  ${CMD} demo "what needs me?"          the same, in plain words
  ${CMD} demo "ok A2"                   send a ready reply
  ${CMD} demo "edit A2: new words"      change a draft; nothing is sent until ok
  ${CMD} demo "A3: Friday, October 23"  answer a question; you get a preview to ok
  ${CMD} demo "ok A1"                   make the proposed PR comment, then reply
  ${CMD} demo "review knowledge"        go through what ${NAME} learned
  ${CMD} demo "remember Banner fix: Ana owns the banner"   save a fact yourself
  ${CMD} demo status                    is it on, and what it did today
  ${CMD} demo "watch PR 1234 until merged"         check something and hear only about changes
  ${CMD} demo "[as Vikram] fixed, please recheck"   play someone in the chat
  ${CMD} demo open                      the same inbox as a page with buttons
  ${CMD} demo reset                     start over`

// A sandbox with a pretend chat and a few typical items, so anyone can learn the words safely (persona testing uses it too).
export function demo(args: string[]): void {
	const words = args.join(' ').trim()
	if (!existsSync(join(ROOT, 'config.json')) || words === 'reset') { run(['demo-seed']); if (!words || words === 'reset') return console.log(GUIDE) }
	if (!words) return console.log(GUIDE)
	if (!sandboxed()) { process.exitCode = 1; return console.log(`The demo folder ${ROOT} is not a demo. Run "${CMD} demo reset".`) }
	if (/^status\??$/i.test(words)) return void run(['status'])
	const rem = words.match(/^remember (?:that )?(?:([^:]{2,40}):\s*)?(.+)$/i)
	if (rem) return void run(['demo-remember', rem[1] ?? 'Notes', rem[2]])
	if (/^(inbox|open|what needs me\??|what did i miss\??)$/i.test(words)) return void run([/^open$/i.test(words) ? 'open' : 'inbox'])
	const watch = words.match(/^watch (.+?) until (.+)$/i)
	if (watch) { run(['demo-watch', watch[1], watch[2]]); run(['tick', '--force']); return void run(['inbox']) }
	if (/^\[as /i.test(words)) { run(['demo-say', words]); run(['tick', '--force']); return void run(['inbox']) }
	if (/^review knowledge$/i.test(words)) { run(['demo-say-self', words]); run(['tick', '--force']); return void run(['demo-self']) }
	run(['act', words]); run(['tick', '--force']); run(['inbox'])
}

export async function seed(): Promise<void> {
	rmSync(HOME, { recursive: true, force: true })
	mkdirSync(LOCAL, { recursive: true })
	writeFileSync(join(LOCAL, 'local.json'), JSON.stringify({ root: ROOT, machine: 'demo' }))
	const store = new Store({ root: ROOT, machine: 'demo' })
	store.saveConfig({
		schema: 1, owner: { id: 'owner', name: 'You' }, source: { command: ['demo'], selfChatId: 'self' },
		watch: [{ id: CHAT, name: 'Team chat (demo)', group: false }], agent: { flavor: 'copilot', command: ['demo'], tools: [], effectTools: ['demo-comment', 'demo-calendar'] },
		maxParallel: 3, nudgeEveryMin: 30, quiet: { from: '00:00', to: '00:00' }, runner: 'demo',
	})
	mkdirSync(join(ROOT, 'knowledge', 'topics', 'meeting-options'), { recursive: true })
	writeFileSync(join(ROOT, 'knowledge', 'topics', 'meeting-options', 'architecture.md'), '---\ntitle: Meeting options · architecture\ntype: card\ntopic: meeting-options\ncard: architecture\naudience: team\naliases: []\n---\n## Observations\n- [fact] Admin policy and sensitivity labels lock some meeting options; organizers cannot change those. ^demo (src: https://teams.microsoft.com/l/message/demo/1, 2026-10-01, Priya)\n')
	const src = new DemoSource(ROOT)
	src.post('self', { id: 'owner', name: 'You' }, 'notes to self')
	src.post(CHAT, { id: 'owner', name: 'You' }, 'Morning all!')
	await tick(store, { force: true })
	src.post(CHAT, { id: 'vikram', name: 'Vikram' }, 'Can you review PR 1234 when you get a chance?')
	src.post(CHAT, { id: 'priya', name: 'Priya' }, 'Why do some meeting options show as locked for organizers?')
	src.post(CHAT, { id: 'ravi', name: 'Ravi' }, 'When will the banner fix ship?')
	src.post(CHAT, { id: 'sam', name: 'Sam' }, 'Thanks for yesterday!')
	src.post(CHAT, { id: 'arun', name: 'Arun Mehta' }, 'Shall we meet at 3 pm today to discuss the API changes? Mostly two questions: do we version the endpoint, and who owns the SDK update.')
	src.post(CHAT, { id: 'ana', name: 'Ana Costa' }, 'Flag A or B for the banner rollout?')
	await tick(store, { force: true })
	await tick(store, { force: true })
	propose(store, knowledgeOf(store, store.config()), [
		{ topic: 'Banner fix', type: 'decision', text: 'Ship behind a flag to ring 1 first; ring 3 after one clean week.', src: [{ link: 'https://teams.microsoft.com/l/message/demo/7', date: '2026-10-12', who: 'Vikram' }] },
		{ topic: 'Banner fix', type: 'owner', text: 'Ana owns the banner component.', src: [{ link: 'https://teams.microsoft.com/l/message/demo/8', date: '2026-10-13', who: 'Ana' }] },
	], 'bootstrap', 'your Teams chats')
	track(store, { target: 'PR 1234 checks', everyMinutes: 60, until: 'merged' })
	const r = proposeAutomation(store, { to: 'Priya', text: 'Reminder: the design doc review is tomorrow.', every: 'weekday', at: '16:00' })
	if (r.startsWith('R1')) answerAutomation(store, store.automation('R1')!, { id: '', code: 'R1', verb: 'ok', surface: 'chat', at: '' })
	await tick(store, { force: true })
}

// Plays a person in the pretend chat: "[as Vikram] fixed, please recheck".
export function say(words: string, self = false) {
	const store = new Store({ root: ROOT, machine: 'demo' })
	const m = words.match(/^\[as ([^\]]+)\]\s*(.*)$/)
	const src = new DemoSource(store.root)
	if (self || !m) src.post('self', { id: 'owner', name: 'You' }, words)
	else src.post(CHAT, { id: m[1].trim().toLowerCase(), name: m[1].trim() }, m[2])
}

export function demoRemember(topic: string, text: string) {
	const store = new Store({ root: ROOT, machine: 'demo' })
	console.log(remember(store, knowledgeOf(store, store.config()), 'You', { topic, type: 'fact', text, audience: 'team' }))
}

export function lastSelf() {
	return new DemoSource(ROOT).recent('self', 1).then(([m]) => console.log(m?.body ?? ''))
}
