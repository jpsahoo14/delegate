// Live proof on one macOS machine (research/cross-session-opus.md): two real Copilot CLI sessions, each in its own Copilot home
// standing in for a VM, a temp folder standing in for OneDrive, and a third process (Delegate) that writes the messages.
// Usage: scripts/limit.sh 900 node scripts/cross-session-live.ts [--keep]
// Needs: python3 (for a terminal), Copilot CLI signed in on this machine. Costs about four model turns. Never touches ~/.copilot or ~/.delegate.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = process.env.COPILOT_JS ?? newestCli()
const tmp = mkdtempSync(join(tmpdir(), 'delegate-xs-live-'))
const share = join(tmp, 'OneDrive', 'Delegate')
const t0 = Date.now()
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`)

function newestCli(): string {
	const dir = join(homedir(), 'Library', 'Caches', 'copilot', 'pkg', `${process.platform}-${process.arch}`)
	const v = readdirSync(dir).filter(d => /^\d+\.\d+\.\d+$/.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
	if (!v) throw new Error(`No Copilot CLI under ${dir}; set COPILOT_JS`)
	return join(dir, v, 'index.js')
}

// One "machine": its own Copilot home (with Delegate's extension installed the way "delegate install" does) and its own ~/.delegate.
function machine(name: string) {
	const dir = join(tmp, name)
	const copilotHome = join(dir, 'copilot'), local = join(dir, 'delegate'), work = join(dir, 'work')
	for (const d of [copilotHome, local, work]) mkdirSync(d, { recursive: true })
	writeFileSync(join(local, 'local.json'), JSON.stringify({ root: share, machine: name }))
	writeFileSync(join(copilotHome, 'config.json'), JSON.stringify({ trustedFolders: [work] }))
	const env: NodeJS.ProcessEnv = { ...process.env, COPILOT_HOME: copilotHome, DELEGATE_LOCAL: local }
	delete env.DELEGATE_ROOT
	return { name, copilotHome, local, work, env }
}

const procs: ChildProcess[] = []
// A real terminal for the CLI's full-screen UI, as when the owner runs it (macOS `script` refuses Node's stdin).
const PTY = join(import.meta.dirname, 'pty-run.py')
function startSession(m: ReturnType<typeof machine>, args: string[]): ChildProcess {
	const log = openSync(join(m.copilotHome, `tui-${Date.now()}.log`), 'a')
	const p = spawn('python3', [PTY, process.execPath, CLI, '--allow-all-tools', ...args], { cwd: m.work, env: m.env, stdio: ['pipe', log, log], detached: true })
	procs.push(p)
	return p
}
// A power cut: the session's whole process group (the CLI and its extension) is killed at once, so nothing can say goodbye.
function powerCut(extensionPid: number) {
	const pgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(extensionPid)]).toString().trim())
	process.kill(-pgid, 'SIGKILL')
	return pgid
}
const groups = new Set<number>()
function stopAll() {
	for (const g of groups) try { process.kill(-g, 'SIGKILL') } catch { /* gone */ }
	for (const p of procs) try { process.kill(-p.pid!, 'SIGKILL') } catch { /* gone */ }
}

async function until<T>(what: string, secs: number, f: () => T | undefined): Promise<T> {
	const end = Date.now() + secs * 1000
	for (;;) {
		const v = f()
		if (v) return v
		if (Date.now() > end) throw new Error(`Timed out after ${secs}s waiting for ${what}`)
		await new Promise(r => setTimeout(r, 1000))
	}
}
const events = (m: ReturnType<typeof machine>, id: string) => { const f = join(m.copilotHome, 'session-state', id, 'events.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8') : '' }
const userMessagesWith = (m: ReturnType<typeof machine>, id: string, text: string) => events(m, id).split('\n').filter(l => l.includes('"user.message"') && l.includes(text)).length

async function main() {
	const A = machine('vm-review'), B = machine('vm-other'), mac = machine('mac')
	process.env.DELEGATE_LOCAL = mac.local
	process.env.DELEGATE_ROOT = share
	const { installExtension } = await import('../src/mesh/route.ts')
	const { Store } = await import('../src/store/state.ts')
	const { collectReceipts, sendToSession, sessionsText } = await import('../src/mesh/route.ts')
	const { listSessions } = await import('../src/mesh/inbox.mjs')
	const { MESH_DIR } = await import('../src/paths.ts')
	for (const m of [A, B]) say(installExtension(m.copilotHome, MESH_DIR, m.local))
	say(`Copilot CLI: ${CLI}`)
	startSession(A, ['--name', 'PR reviews'])
	startSession(B, ['--name', 'Other work'])
	const reg = await until('both sessions to register', 120, () => (listSessions(share).length >= 2 ? listSessions(share) : undefined))
	const sa = reg.find(s => s.machine === 'vm-review')!, sb = reg.find(s => s.machine === 'vm-other')!
	for (const s of reg) groups.add(Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(s.pid)]).toString().trim()))
	say(`registered:\n${sessionsText(new Store({ root: share, machine: 'mac' }))}`)

	const store = new Store({ root: share, machine: 'mac' })
	const replies: Record<string, string> = {}
	const take = (id: string) => { for (const r of collectReceipts(store)) replies[r.msg.id] = r.receipt.reply ?? `(${r.receipt.state}: ${r.receipt.why})`; return replies[id] }

	// 1. A message for the review session, written by another process into the shared folder.
	const n1 = `PONG-${Math.random().toString(36).slice(2, 8)}`
	const s1 = sendToSession(store, 'PR reviews', `Reply with exactly ${n1} and nothing else. Do not use any tools.`)
	if (typeof s1 === 'string') throw new Error(s1)
	const sent1 = Date.now()
	say(`sent ${s1.msg.id} to ${s1.to.machine}`)
	const r1 = await until('the reply to message 1', 180, () => take(s1.msg.id))
	say(`reply 1 after ${((Date.now() - sent1) / 1000).toFixed(1)}s: ${JSON.stringify(r1.slice(0, 80))}`)

	// 2. Power cut on the review session's machine; a message arrives while it is down; the owner resumes the session.
	const cut = powerCut(sa.pid)
	await new Promise(r => setTimeout(r, 2000))
	say(`power cut: killed process group ${cut}; registry still says open=${listSessions(share).find(s => s.machine === 'vm-review')?.open}`)
	const n2 = `PONG-${Math.random().toString(36).slice(2, 8)}`
	const s2 = sendToSession(store, sa.session, `Reply with exactly ${n2} and nothing else. Do not use any tools.`)
	if (typeof s2 === 'string') throw new Error(s2)
	say(`session cut off; sent ${s2.msg.id} while it was down`)
	startSession(A, ['--resume', sa.session])
	const resumed = Date.now()
	const r2 = await until('the reply to message 2 after resume', 180, () => take(s2.msg.id))
	const back = listSessions(share).find(s => s.machine === 'vm-review')!
	groups.add(Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(back.pid)]).toString().trim()))
	say(`reply 2, ${((Date.now() - resumed) / 1000).toFixed(1)}s after resume: ${JSON.stringify(r2.slice(0, 80))}`)

	const checks = {
		reply1HasNonce: r1.includes(n1),
		reply2HasNonce: r2.includes(n2),
		reviewSessionGotMessage1Once: userMessagesWith(A, sa.session, `Delegate message ${s1.msg.id}`) === 1,
		reviewSessionGotMessage2Once: userMessagesWith(A, sa.session, `Delegate message ${s2.msg.id}`) === 1,
		otherSessionGotNothing: !events(B, sb.session).includes('Delegate message'),
		inboxEmpty: !readdirSync(join(share, 'mesh', 'inbox')).some(d => readdirSync(join(share, 'mesh', 'inbox', d)).some(f => f.endsWith('.json'))),
	}
	say(`checks: ${JSON.stringify(checks, null, 1)}`)
	if (!Object.values(checks).every(Boolean)) process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 }).finally(() => {
	stopAll()
	if (process.argv.includes('--keep') || process.exitCode) console.log(`Kept ${tmp} for inspection.`)
	else rmSync(tmp, { recursive: true, force: true })
})
