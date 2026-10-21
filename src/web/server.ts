import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import type { Store } from '../store/state.ts'
import { hashOf } from '../knowledge/format.ts'
import { writeText } from '../store/fs.ts'
import { actResult } from '../mcp/server.ts'
import { SEEN_KEYS, view } from './view.ts'
import { renderApp } from './shell.ts'
import { answerAutomation, propose as proposeAutomation, type AutomateInput } from '../runner/automations.ts'
import { NAME } from '../brand.ts'
import { versionInfo } from '../os/autoupdate.ts'
import { saveSetting, settingsView } from './settings.ts'
import { adoProbe, type BuildProbe } from '../runner/probe.ts'
import type { Config } from '../core/types.ts'
import { numbersOf } from '../store/numbers.ts'
import { WINDOWS, type WindowKey } from '../core/numbers.ts'
import { nextView } from './next.ts'

// What a page or panel action really did once applied, and the item's fresh card if it still needs the owner.
export function actOutcome(store: Store, ids: string[], code: string) {
	const said = ids.map(id => store.outcome(id))
	const v = view(store, store.lastViewed())
	const card = v.needs.find(c => c.code === code) ?? v.knowledge.find(c => c.code === code)
	const state = (/^A/i.test(code) ? store.byCode(code)?.state : /^K/i.test(code) ? store.proposal(code)?.state : store.automation(code)?.state) ?? ''
	return { applied: said.every(t => t !== undefined), text: said.filter(Boolean).join(' '), state, card }
}

// The page's form is the owner's approval: what they typed is what is sent (design-spec/automations.md).
export function automateFromPage(store: Store, i: AutomateInput): { ok: boolean; text: string; code?: string } {
	const r = proposeAutomation(store, i)
	const a = store.automations().filter(a => a.state === 'proposed').sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0]
	if (!a || !r.startsWith(a.code)) return { ok: false, text: r }
	return { ok: true, text: answerAutomation(store, a, { id: '', code: a.code, verb: 'ok', surface: 'chat', at: '' }), code: a.code }
}

// The running version, read at most every 30 s: the page polls often, and each read asks git.
let ver: { at: number; v: ReturnType<typeof versionInfo> } | undefined
const withVersion = (s: Store, v: ReturnType<typeof view>) => {
	if (!ver || Date.now() - ver.at > 30_000) ver = { at: Date.now(), v: versionInfo(s.config()?.autoUpdate, undefined, undefined, s.config()?.updateEveryMin) }
	return { ...v, version: ver.v, settings: settingsView(s) }
}

// The switch on this machine, and the new page's rows only when that page asks: classic never builds them (R-NEX-01).
export function withUi<V extends object>(s: Store, v: V, wantNext?: boolean): V & { ui: ReturnType<Store['ui']>; next?: ReturnType<typeof nextView> } {
	const ui = s.ui()
	return { ...v, ui, ...((wantNext ?? ui.ui === 'new') ? { next: nextView(s) } : {}) }
}
// POST /ui and the panel's ui_save: the choice, or that the first-time note was closed.
export function saveUiFrom(s: Store, body: unknown): { ok: boolean; ui?: ReturnType<Store['ui']> } {
	const b = (body ?? {}) as { ui?: unknown; noted?: unknown }
	if (b.ui !== 'new' && b.ui !== 'classic' && b.noted !== true) return { ok: false }
	return { ok: true, ui: s.saveUi(b.ui === 'new' || b.ui === 'classic' ? b.ui : s.ui().ui, b.noted === true) }
}

// A local page with working buttons. Only this machine can reach it, and only with the token in its link (R-HIL-09).
// probeFor: the owner's Azure DevOps read, for a setting checked there before it is saved.
export function serveInbox(get: () => Store, port = 0, token = randomBytes(16).toString('hex'), probeFor: (cfg: Config) => BuildProbe | undefined = adoProbe): Promise<{ url: string; server: Server }> {
	const server = createServer((req, res) => {
		const u = new URL(req.url ?? '/', 'http://127.0.0.1')
		const host = req.headers.host ?? ''
		if (u.searchParams.get('t') !== token || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { res.writeHead(403).end(`Open the link ${NAME} gave you.`); return }
		const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" }
		// Home counts what happened since the owner last looked; opening the page is looking.
		if (req.method === 'GET' && u.pathname === '/') {
			// A page that cannot be drawn says why, instead of stopping the server.
			let page
			try { const s = get(); page = renderApp(withUi(s, withVersion(s, view(s, s.visitSince()))), 'page') } catch (e) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end(`The page could not be drawn: ${(e as Error)?.message ?? e}`); return }
			res.writeHead(200, headers).end(page); return
		}
		if (req.method === 'GET' && u.pathname === '/data') {
			res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(withUi(get(), withVersion(get(), view(get(), u.searchParams.get('since') || undefined)), u.searchParams.get('ui') === 'new')))
			return
		}
		// The Numbers tab is its own call, not part of /data: it adds up weeks of logs, and the page asks only when the tab opens (R-NEX-11).
		if (req.method === 'GET' && u.pathname === '/numbers') {
			const key = u.searchParams.get('window') ?? 'this'
			if (!(WINDOWS as string[]).includes(key)) { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, text: `window is one of ${WINDOWS.join(', ')}` })); return }
			res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(numbersOf(get(), key as WindowKey)))
			return
		}
		if (req.method === 'POST' && u.pathname === '/seen') {
			let body = ''
			req.on('data', c => { body += c; if (body.length > 2_000) req.destroy() })
			req.on('end', () => {
				try { const { filters, at } = JSON.parse(body) as { filters: unknown; at?: unknown }; const ok = Array.isArray(filters) ? filters.filter((f): f is string => typeof f === 'string' && SEEN_KEYS.includes(f)) : []; const now = new Date().toISOString(), t = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : now; get().saveSeen(ok, t < now ? t : now); res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}') } catch { res.writeHead(400).end('{"ok":false}') }
			})
			return
		}
		if (req.method === 'POST' && u.pathname === '/ui') {
			let body = ''
			req.on('data', c => { body += c; if (body.length > 2_000) req.destroy() })
			req.on('end', () => {
				try { const r = saveUiFrom(get(), JSON.parse(body)); res.writeHead(r.ok ? 200 : 422, { 'content-type': 'application/json' }).end(JSON.stringify(r)) } catch { res.writeHead(400).end('{"ok":false}') }
			})
			return
		}
		if (req.method === 'POST' && u.pathname === '/settings') {
			let body = ''
			req.on('data', c => { body += c; if (body.length > 20_000) req.destroy() })
			req.on('end', async () => {
				// A deploy target is read from Azure DevOps before it is saved, through the owner's own server (owned work).
				let probe: BuildProbe | undefined
				try {
					const { key, value } = JSON.parse(body) as { key: string; value: string }
					if (key === 'deployTo') probe = probeFor(get().config())
					const r = await saveSetting(get(), key, value, { probe }); if (r.ok) ver = undefined; res.writeHead(r.ok ? 200 : 422, { 'content-type': 'application/json' }).end(JSON.stringify(r))
				} catch { res.writeHead(400).end('{"ok":false,"text":"Could not read that."}') } finally { void probe?.close?.().catch(() => undefined) }
			})
			return
		}
		if (req.method === 'POST' && u.pathname === '/automate') {
			let body = ''
			req.on('data', c => { body += c; if (body.length > 20_000) req.destroy() })
			req.on('end', () => {
				try { const r = automateFromPage(get(), JSON.parse(body)); res.writeHead(r.ok ? 200 : 422, { 'content-type': 'application/json' }).end(JSON.stringify(r)) } catch { res.writeHead(400).end('{"ok":false,"text":"Could not read that."}') }
			})
			return
		}
		if (req.method === 'GET' && u.pathname === '/result') {
			const ids = (u.searchParams.get('ids') ?? '').split(',').filter(Boolean)
			res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(actOutcome(get(), ids, u.searchParams.get('code') ?? '')))
			return
		}
		if (req.method === 'POST' && u.pathname === '/act') {
			let body = ''
			req.on('data', c => { body += c; if (body.length > 20_000) req.destroy() })
			req.on('end', () => {
				try {
					const { command, seenAt } = JSON.parse(body) as { command: string; seenAt?: string }
					const r = actResult(get(), String(command), seenAt, 'page')
					res.writeHead(r.accepted ? 200 : 422, { 'content-type': 'application/json' }).end(JSON.stringify({ text: r.text, ids: r.ids }))
				} catch { res.writeHead(400).end('Could not read that action.') }
			})
			return
		}
		res.writeHead(404).end()
	})
	return new Promise(resolve => server.listen(port, '127.0.0.1', () => {
		const a = server.address()
		resolve({ url: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : port}/?t=${token}`, server })
	}))
}

// A read-only copy in the synced folder, so any machine can open it. Written only when something changed, to spare the sync.
export function writeSnapshot(store: Store): boolean {
	const v = view(store, store.lastViewed())
	const key = hashOf(JSON.stringify({ ...v, now: '' }))
	const page = renderApp(v, 'snapshot')
	if (store.notify().snapshot === key) return false
	writeText(join(store.root, 'inbox.html'), page, store.machine)
	store.saveNotify({ ...store.notify(), snapshot: key })
	return true
}
