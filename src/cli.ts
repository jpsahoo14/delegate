#!/usr/bin/env node
import { site } from './core/site.ts'
import { teamsCommand } from './mcp/setup.ts'
import { assertTestSafe } from './store/fs.ts'
import { summary as feedbackSummary } from './store/feedback.ts'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import type { Config } from './core/types.ts'
import { inbox } from './runner/proposals.ts'
import { LOCAL_DIR, Store, loadLocal, withTickLock } from './store/state.ts'
import { residentMs, stayAwake, tick } from './runner/tick.ts'
import { runWindow } from './runner/continue.ts'
import { doctor, install, migrate, uninstall, update, version } from './admin.ts'
import { demo, lastSelf, demoRemember, say, seed } from './demo.ts'
import { statusText } from './runner/status.ts'
import { track } from './runner/track.ts'
import { serveInbox } from './web/server.ts'
import { openUrl } from './os/window.ts'
import { BOOT_SOURCES, startBootstrap, type BootSource } from './runner/bootstrap.ts'
import { act, serve } from './mcp/server.ts'
import * as scheduler from './os/scheduler.ts'
import { autoUpdate, exitWhenUpdated, supervise, versionInfo } from './os/autoupdate.ts'
import * as PATHS from './paths.ts'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer, request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { collectReceipts, sendToSession, sessionsText } from './mesh/route.ts'
import { numbersText, WINDOWS, type WindowKey } from './core/numbers.ts'
import { CMD } from './brand.ts'

const [cmd, ...args] = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const flags = (name: string) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []))

async function main() {
	switch (cmd) {
		case 'init': return init()
		// Updating runs even when the tick throws, so a fix can reach a broken version (review 10-19 #2).
		case 'tick': return print(await withTickLock(async () => {
			const s = store(), until = Date.now() + residentMs()
			try {
				const first = await tick(s, { force: args.includes('--force') })
				// Stays until shortly before the next scheduled runner, waking on approvals, finished jobs and due checks (latency a, c).
				if (until > Date.now()) await stayAwake(s, until)
				return first
			} finally { autoUpdate({ setting: s.config()?.autoUpdate, everyMin: s.config()?.updateEveryMin }) }
		}))
		case 'loop': return loop(Number(flag('every') ?? 60))
		case 'mcp': return serve(store)
		case 'service': return console.log(service(args[0]))
		case 'install': return console.log(install().join('\n'))
		case 'status': return console.log(statusText(store()))
		// The new experience's placement as text (N0), for checking before any page draws it.
		case 'now': { const { snapshot, place, dryText } = await import('./web/next.ts'); return console.log(dryText(place(snapshot(store())))) }
		case 'demo': return demo(args)
		case 'demo-seed': return seed()
		case 'demo-say': return say(args.join(' '))
		case 'demo-say-self': return say(args.join(' '), true)
		case 'demo-self': return lastSelf()
		case 'demo-remember': return demoRemember(args[0], args.slice(1).join(' '))
		case 'demo-watch': return console.log(track(store(), { target: args[0], until: args[1] }))
		case 'update': return console.log(update({ root: PATHS.ROOT, cli: PATHS.CLI, from: flag('from') }).join('\n'))
		case 'migrate': return console.log(migrate().join('\n'))
		case 'update-now': {
			// Never alongside a tick's own update: wait for the lock, for up to two minutes.
			for (let i = 0; i < 60; i++) {
				const r = await withTickLock(async () => autoUpdate({ setting: (s => s === false ? undefined : s)(store().config()?.autoUpdate), force: true }) ?? versionInfo(undefined).failed ?? 'up to date')
				if (r !== 'locked') return console.log(JSON.stringify(r))
				await new Promise(res => setTimeout(res, 2000))
			}
			return console.log('busy')
		}
		case 'uninstall': return console.log(uninstall(args.includes('--purge')).join('\n'))
		case 'version': case '--version': return console.log(version())
		// The Numbers tab as text (R-NEX-11): --window this, last, 4w, or all.
		case 'numbers': {
			const key = flag('window') ?? 'this'
			if (!(WINDOWS as string[]).includes(key)) { console.error(`Usage: ${CMD} numbers [--window ${WINDOWS.join('|')}]`); process.exitCode = 1; return }
			const { numbersOf } = await import('./store/numbers.ts')
			return console.log(numbersText(numbersOf(store(), key as WindowKey)))
		}
		case 'feedback': return console.log(feedbackSummary(store().lessons(), Number(flag('days') ?? 7)))
		case 'doctor': {
			const checks = doctor()
			for (const c of checks) console.log(`${c.ok ? '✓' : c.optional ? '–' : '✗'} ${c.what}${c.ok || !c.fix ? '' : `\n  ${c.optional ? 'Optional' : 'Fix'}: ${c.fix}`}`)
			process.exitCode = checks.every(c => c.ok || c.optional) ? 0 : 1
			return
		}
		case 'inbox': { const s = store(); const since = s.lastViewed(); s.markViewed(); return console.log(inbox(s, since)) }
		case 'act': return console.log(act(store(), args.join(' ')))
		case 'bootstrap': return console.log((() => { const s = store(); return startBootstrap(s, args.length ? args.filter((a): a is BootSource => (BOOT_SOURCES as readonly string[]).includes(a)) : undefined, s.runnerLive()) })())
		// The daily command: "delegate" alone opens Home, once setup is done (design-spec/home.md).
		case undefined: if (!existsSync(join(LOCAL_DIR, 'local.json')) && !process.env.DELEGATE_ROOT) return console.log(HELP)
		// falls through
		case 'open': {
			const child = process.env.DELEGATE_PAGE
			if (child) { const [port, token] = child.split(':'); const { server } = await serveInbox(store, Number(port), token); exitWhenUpdated(() => server.close()); return new Promise(() => {}) }
			const token = randomBytes(16).toString('hex'), port = await freePort(), url = `http://127.0.0.1:${port}/?t=${token}`
			supervise((p, t) => spawn(process.execPath, [fileURLToPath(import.meta.url), 'open'], { stdio: 'inherit', env: { ...process.env, DELEGATE_PAGE: `${p}:${t}` } }), port, token)
			await waitFor(port)
			if (!args.includes('--no-browser')) openUrl(url)
			console.log(`Your inbox is open at ${url}\nKeep this running while you use the page. Press Ctrl+C to close it. It picks up new versions by itself.`)
			return new Promise(() => {})
		}
		// Sessions on any machine, and messages into one of them (research/cross-session-opus.md).
		case 'sessions': return console.log(sessionsText(store()))
		case 'send': {
			if (!args[0] || !args.slice(1).join(' ').trim()) { console.error('Usage: delegate send <session ID, name, or PR> <message>'); process.exitCode = 1; return }
			const sent = sendToSession(store(), args[0], args.slice(1).join(' '))
			if (typeof sent === 'string') { console.error(sent); process.exitCode = 1; return }
			return console.log(`Queued ${sent.msg.id} for ${sent.to.session.slice(0, 8)} on ${sent.to.machine}${sent.to.open ? '' : ' (closed now: it arrives when that session opens)'}.`)
		}
		case 'replies': return console.log(collectReceipts(store()).map(r => `${r.msg.id} ${r.receipt.state}${r.receipt.why ? ` (${r.receipt.why})` : ''}${r.receipt.reply ? `\n${r.receipt.reply}` : ''}`).join('\n\n') || 'No new replies.')
		case 'continue': { const s = store(); process.exitCode = runWindow(s, s.config(), args[0] ?? ''); return }
		default:
			console.log(HELP)
	}
}

const HELP = 'delegate              open your inbox (Home)\ndelegate <init|tick [--force]|loop|mcp|inbox|act|open|status|numbers [--window this|last|4w|all]|sessions|send <session|name|PR> <text>|replies|demo|doctor|update|version|service install|uninstall>\n  init --root <folder> --owner-id <id> --owner-name <name> --watch <chatId>|<name>[|test][|group] ...'
const store = () => new Store(loadLocal())
const freePort = () => new Promise<number>(res => { const s = createServer().listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => res(typeof a === 'object' && a ? a.port : 0)) }) })
const waitFor = async (port: number) => { for (let i = 0; i < 100; i++) { if (await new Promise(r => request({ host: '127.0.0.1', port, path: '/' }, () => r(true)).on('error', () => r(false)).end())) return; await new Promise(r => setTimeout(r, 100)) } }
const print = (v: unknown) => console.log(JSON.stringify(v))

function service(sub: string | undefined): string {
	const paths = { node: process.execPath, cli: fileURLToPath(import.meta.url), local: LOCAL_DIR, pathEnv: process.env.PATH ?? '' }
	if (sub === 'install') return scheduler.install(paths)
	if (sub === 'uninstall') return scheduler.uninstall(paths)
	return scheduler.status() ? 'The background runner is installed and loaded.' : 'The background runner is not installed.'
}

async function loop(everySec: number) {
	for (;;) {
		try { print(await withTickLock(() => tick(store(), { force: true }))) } catch (e) { console.error(String(e)) }
		await new Promise(r => setTimeout(r, everySec * 1000))
	}
}

function init() {
	const root = flag('root')
	if (!root) throw new Error('--root is required')
	assertTestSafe(LOCAL_DIR)
	mkdirSync(LOCAL_DIR, { recursive: true })
	writeFileSync(join(LOCAL_DIR, 'local.json'), JSON.stringify({ root, machine: hostname().split('.')[0] }, null, '\t'))
	const watch = flags('watch').map(w => {
		const [id, name, ...opts] = w.split('|')
		return { id, name: name ?? id, test: opts.includes('test'), group: opts.includes('group') }
	})
	const cfg: Config = {
		schema: 1,
		owner: { id: flag('owner-id') ?? '', name: flag('owner-name') ?? '' },
		source: { command: teamsCommand(), selfChatId: '48:notes' },
		watch,
		agent: { flavor: 'copilot', command: site().agents?.[0] ?? ['copilot'], tools: ['view', 'glob', 'grep'] },
		maxParallel: 3,
		nudgeEveryMin: 30,
	}
	const s = new Store({ root, machine: hostname().split('.')[0] })
	if (!s.config()) s.saveConfig(cfg)
	console.log(`Ready. Storage: ${root}. Watching ${watch.length} chat(s).`)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
