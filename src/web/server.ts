import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import type { Store } from '../store/state.ts'
import { hashOf } from '../knowledge/format.ts'
import { readScope, writeText } from '../store/fs.ts'
import { actResult } from '../mcp/server.ts'
import { SEEN_KEYS, view } from './view.ts'
import { renderApp } from './shell.ts'
import { answerAutomation, propose as proposeAutomation, type AutomateInput } from '../runner/automations.ts'
import { NAME } from '../brand.ts'
import { versionInfo, versionInfoLater, type VersionInfo } from '../os/autoupdate.ts'
import { saveSetting, settingsView } from './settings.ts'
import { adoProbe, type BuildProbe } from '../runner/probe.ts'
import type { Config } from '../core/types.ts'
import { numbersPage } from './numbers.ts'
import { WINDOWS, type WindowKey } from '../core/numbers.ts'
import { nextView } from './next.ts'
import { reactAsset, reactPage } from './react-build.ts'
import { chatNormalActionId, reactProjection, IntentError } from './react-projection.ts'
import { submissionReceipt, submitIntent } from './react-submissions.ts'
import { intentSchema } from './react/domain/contracts.ts'
import { listsOf, numbersModel, RULES as NUMBER_RULES } from './app/model/numbers.ts'
import { ROOT } from '../paths.ts'
import { pageDelta } from './react/domain/page-delta.ts'

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

// The running version: asked of git at most every 30 s, in the background, so no page request waits for git (bug 10-23 perf).
// Only a request before the first answer reads it directly.
let ver: { at: number; v: VersionInfo } | undefined, asking = false
const withVersion = (s: Store, v: ReturnType<typeof view>) => {
	return { ...v, version: versionFor(s), settings: settingsView(s) }
}
const askVersion = (s: Store) => {
	if (asking) return
	asking = true
	const cfg = s.config()
	versionInfoLater(cfg?.autoUpdate, undefined, undefined, cfg?.updateEveryMin).then(v => { ver = { at: Date.now(), v } }, () => undefined).finally(() => { asking = false })
}
const versionFor = (s: Store) => {
	if (!ver) ver = { at: Date.now(), v: versionInfo(s.config()?.autoUpdate, undefined, undefined, s.config()?.updateEveryMin) }
	else if (Date.now() - ver.at > 30_000) askVersion(s)
	return ver.v
}

// The switch on this machine, and the new page's rows only when that page asks: classic never builds them (R-NEX-01).
export function withUi<V extends object>(s: Store, v: V, wantNext?: boolean): V & { ui: ReturnType<Store['ui']>; next?: ReturnType<typeof nextView> } {
	const ui = s.ui()
	return { ...v, ui, ...((wantNext ?? ui.ui !== 'classic') ? { next: nextView(s) } : {}) }
}
// POST /seen: the Done filters, and from N1b a mark per item ("item:A13") for codes that exist, so New and Back to you clear
// once the owner looked. Seen up to the data the page showed, never later than now, never backwards. A per-item mark goes 7 days
// after its item is done (or once its code is gone).
export function saveSeenFrom(s: Store, body: unknown) {
	const { filters, at } = (body ?? {}) as { filters?: unknown; at?: unknown }
	const now = Date.now(), week = new Date(now - 7 * 86_400_000).toISOString()
	const live = new Set<string>([
		...s.workflows().filter(w => w.code && (w.state !== 'done' || w.updatedAt > week)).map(w => w.code),
		...s.waiting().filter(w => w.state === 'waiting' || w.at > week).map(w => w.code),
		...s.automations().filter(a => a.state !== 'ended' || a.updatedAt > week).map(a => a.code),
	])
	// The prefix is lower case only; the code may be either (review P2-7).
	const item = (f: string) => /^item:[A-Za-z]+\d+$/.test(f) && live.has(f.slice(5).toUpperCase())
	const ok = Array.isArray(filters) ? [...new Set(filters.filter((f): f is string => typeof f === 'string' && (SEEN_KEYS.includes(f) || item(f))).map(f => (f.startsWith('item:') ? `item:${f.slice(5).toUpperCase()}` : f)))] : []
	const iso = new Date(now).toISOString(), t = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : iso
	s.saveSeen(ok, t < iso ? t : iso, k => !k.startsWith('item:') || live.has(k.slice(5)))
}
// POST /ui and the panel's ui_save: the choice, or that the first-time note was closed.
export function saveUiFrom(s: Store, body: unknown): { ok: boolean; ui?: ReturnType<Store['ui']> } {
	const b = (body ?? {}) as { ui?: unknown; noted?: unknown }
	if (b.ui !== 'new' && b.ui !== 'classic' && b.ui !== 'react' && b.noted !== true) return { ok: false }
	return { ok: true, ui: s.saveUi(b.ui === 'new' || b.ui === 'classic' || b.ui === 'react' ? b.ui : s.ui().ui, b.noted === true) }
}

// A local page with working buttons. Only this machine can reach it, and only with the token in its link (R-HIL-09).
// probeFor: the owner's Azure DevOps read, for a setting checked there before it is saved.
export function serveInbox(get: () => Store, port = 0, token = randomBytes(16).toString('hex'), probeFor: (cfg: Config) => BuildProbe | undefined = adoProbe, previewRoot = ROOT): Promise<{ url: string; server: Server }> {
	const initialSince = new Date(Date.now() - 86_400_000).toISOString()
	if (!ver) try { askVersion(get()) } catch { /* the first request reads it */ }
	let reactVisit: { since?: string; fallbackSince: string } | undefined
	const reactPages = new Map<string, ReturnType<typeof reactProjection>['snapshot']>()
	const server = createServer((req, res) => {
		const u = new URL(req.url ?? '/', 'http://127.0.0.1')
		const host = req.headers.host ?? ''
		if (u.searchParams.get('t') !== token || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { res.writeHead(403).end(`Open the link ${NAME} gave you.`); return }
		const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" }
		if (u.pathname.startsWith('/api/v1/')) {
			const json = (status: number, body: unknown, extra: Record<string, string> = {}) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra }).end(JSON.stringify(body))
			const failure = (error: unknown) => {
				if (error instanceof IntentError) json(error.status, { text: error.message })
				else { console.error('React API request failed:', error); json(500, { text: `${NAME} could not complete this request. Nothing will be retried automatically.` }) }
			}
			if (req.method === 'GET' && u.pathname === '/api/v1/page') {
				const query = u.searchParams.get('find') ?? ''
				if (query.length > 2000) { json(422, { text: 'Find text is too long.' }); return }
				try {
					const store = get(), start = performance.now(), snapshot = readScope(() => reactProjection(store, query, reactVisit ?? { since: store.lastViewed(), fallbackSince: initialSince }).snapshot)
					const body = { ...snapshot, version: versionFor(store) }
					const { now: _now, fetchedAt: _fetchedAt, ...content } = body
					const etag = `"${createHash('sha256').update(JSON.stringify(content)).digest('hex')}"`
					const extra = { etag, 'server-timing': `projection;dur=${(performance.now() - start).toFixed(2)}` }
					const priorTag = req.headers['if-none-match'], prior = typeof priorTag === 'string' ? reactPages.get(priorTag) : undefined
					reactPages.delete(etag); reactPages.set(etag, body)
					if (reactPages.size > 4) reactPages.delete(reactPages.keys().next().value!)
					if (priorTag === etag) res.writeHead(304, { 'cache-control': 'private, no-cache', ...extra }).end()
					else if (req.headers['x-delegate-delta'] === '1' && prior && typeof priorTag === 'string') json(200, pageDelta(prior, body, priorTag), { ...extra, 'x-delegate-delta': '1' })
					else json(200, body, extra)
				} catch (error) { failure(error) }
				return
			}
			if (req.method === 'GET' && u.pathname === '/api/v1/settings') {
				try { readScope(() => {
					const store = get(), settings = settingsView(store, u.searchParams.get('experience') === 'classic' ? 'classic' : 'new')
					const marked = Object.entries(store.config().chatLevels ?? {}).map(([id, level]) => ({ name: level.name, actionIds: [chatNormalActionId(id)] }))
					json(200, {
						...settings,
						rows: settings.rows.map(row => ({
							...row,
							help: u.searchParams.get('experience') === 'classic' ? row.help : row.help.replace(/\bOngoing\b/g, 'Waiting on Now').replace(/\bWatching\b/g, 'Watch details at the foot of Now'),
						})),
						about: { ...settings.about, chats: settings.about.chats.map((chat, index) => ({ ...chat, actionIds: marked[index]?.actionIds })) },
					})
				}) } catch (error) { failure(error) }
				return
			}
			if (req.method === 'GET' && u.pathname === '/api/v1/numbers') {
				const key = u.searchParams.get('window') ?? 'this'
				if (!(WINDOWS as string[]).includes(key)) { json(422, { text: 'Choose a supported Numbers window.' }); return }
				try {
					const page = readScope(() => numbersPage(get(), key as WindowKey))
					json(200, { model: numbersModel(page, NAME), lists: listsOf(page), rows: page.rows, missed: page.missed, rules: NUMBER_RULES(NAME) })
				} catch (error) { failure(error) }
				return
			}
			if (req.method === 'GET' && u.pathname === '/api/v1/result') {
				const id = u.searchParams.get('submission') ?? ''
				if (!/^[a-f0-9-]{36}$/i.test(id)) { json(422, { text: 'A valid submission identity is required.' }); return }
				try {
					const receipt = submissionReceipt(get(), id)
					json(receipt ? 200 : 404, receipt ?? { text: 'This submission has not been confirmed. Keep checking; do not send it again.' })
				} catch (error) { failure(error) }
				return
			}
			if (req.method === 'POST' && u.pathname === '/api/v1/actions') {
				let body = '', tooLarge = false
				req.setEncoding('utf8')
				req.on('data', chunk => {
					if (tooLarge) return
					body += chunk
					if (Buffer.byteLength(body) > 20_000) { tooLarge = true; body = ''; json(413, { text: 'That action is too large.' }) }
				})
				req.on('end', () => {
					if (tooLarge) return
					let raw: unknown
					try { raw = JSON.parse(body) } catch { json(422, { text: 'Could not read that action.' }); return }
					const parsed = intentSchema.safeParse(raw)
					if (!parsed.success) { json(422, { text: 'That action has invalid fields.' }); return }
					try {
						const result = submitIntent(get(), parsed.data)
						json(result.status, result.receipt)
					} catch (error) { failure(error) }
				})
				return
			}
			json(404, { text: 'That preview endpoint does not exist.' })
			return
		}
		if (req.method === 'GET' && u.pathname.startsWith('/web-react/')) {
			try {
				const asset = reactAsset(u.pathname.slice('/web-react/'.length), token, previewRoot)
				if (!asset) { res.writeHead(404).end(); return }
				res.writeHead(200, { 'content-type': asset.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).end(asset.content)
			} catch (error) {
				res.writeHead(500, { 'content-type': 'text/plain' }).end(`Preview asset unavailable: ${String(error)}`)
			}
			return
		}
		// Home counts what happened since the owner last looked; opening the page is looking.
		if (req.method === 'GET' && u.pathname === '/') {
			// A page that cannot be drawn says why, instead of stopping the server.
			let page, react = false
			try {
				const s = get(), recover = u.searchParams.get('ui')
				if (recover === 'new' || recover === 'classic') {
					s.saveUi(recover)
					u.searchParams.delete('ui')
					res.writeHead(303, { location: u.pathname + u.search, 'cache-control': 'no-store' }).end()
					return
				}
				react = s.ui().ui === 'react'
				if (react) {
					try { page = reactPage(token, previewRoot); reactVisit = { since: s.visitSince(), fallbackSince: new Date(Date.now() - 86_400_000).toISOString() } } catch (error) {
						console.error('React preview unavailable; showing New instead:', error)
						react = false
						page = renderApp({ ...withUi(s, withVersion(s, view(s, s.visitSince())), true), ui: { ...s.ui(), ui: 'new' } }, 'page')
							.replace('<body>', '<body><p role="alert">React preview unavailable. Showing New instead. Choose a version from App version to save it.</p>')
					}
				} else page = renderApp(withUi(s, withVersion(s, view(s, s.visitSince()))), 'page')
			} catch (e) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end(`The page could not be drawn: ${(e as Error)?.message ?? e}`); return }
			const pageHeaders = react ? {
				...headers,
				'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
				'referrer-policy': 'no-referrer',
			} : headers
			res.writeHead(200, pageHeaders).end(page); return
		}
		if (req.method === 'GET' && u.pathname === '/data') {
			res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(withUi(get(), withVersion(get(), view(get(), u.searchParams.get('since') || undefined)), u.searchParams.get('ui') === 'new')))
			return
		}
		// The Numbers tab is its own call, not part of /data: it adds up weeks of logs, and the page asks only when the tab opens (R-NEX-11).
		// It brings the rows each number counted, in Done's format.
		if (req.method === 'GET' && u.pathname === '/numbers') {
			const key = u.searchParams.get('window') ?? 'this'
			if (!(WINDOWS as string[]).includes(key)) { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, text: `window is one of ${WINDOWS.join(', ')}` })); return }
			res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(numbersPage(get(), key as WindowKey)))
			return
		}
		if (req.method === 'POST' && u.pathname === '/seen') {
			let body = ''
			req.on('data', c => { body += c; if (body.length > 20_000) req.destroy() })
			req.on('end', () => {
				try { saveSeenFrom(get(), JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}') } catch { res.writeHead(400).end('{"ok":false}') }
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
