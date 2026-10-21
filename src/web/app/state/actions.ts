// What the owner's clicks do to the page's state and to Delegate. Drawing is lent by the view through hooks (state/store.ts).
import { KIND_KEY, dirty, freshOf, latest, rowMark } from '../model/derive.ts'
import { find } from '../model/find.ts'
import { automationInput, markCommand, rowWatchCommand, rowWatchOf, sheetWatchCommand } from '../model/forms.ts'
import type { ItemCard, KnowledgeCard, Kind, NextRow, View } from '../model/types.ts'
import { sleep, type Result } from '../io/transport.ts'
import { S, U, V, cardOf, env, hooks, openCards, queue, replaceCard, setView, syncOrder } from './store.ts'

const render = (enter?: boolean) => hooks.render(enter)
const renderSoon = () => hooks.renderSoon()
const say = (t: string | undefined, toast?: boolean) => hooks.say(t, toast)
type Card = ItemCard | KnowledgeCard
const cards = (v: View, key: 'needs' | 'knowledge') => v[key] as Card[]

/* ------------------------------ data ------------------------------ */
// Fresh data from the server. A card the owner has started on keeps what they did and says a newer version is there.
let lastDrawn = Date.now()
export function merge(nv: View) {
	for (const key of ['needs', 'knowledge'] as const) (nv[key] as Card[]) = cards(nv, key).map(c => {
		const old = cards(V, key).find(x => x.code === c.code), u = S.ui[c.code]
		if (old && old.rev !== c.rev && u && u.status !== 'pending' && dirty(u)) { S.fresh[c.code] = c; u.stale = true; return old }
		return c
	})
	// A card whose action is still on its way stays until its result arrives, even while the item is being redrafted.
	for (const key of ['needs', 'knowledge'] as const) for (const c of cards(V, key)) if (S.ui[c.code]?.status === 'pending' && !cards(nv, key).some(x => x.code === c.code)) cards(nv, key).push(c)
	nv.since = V.since
	// Nothing new: no redraw, so nothing under the owner's pointer is replaced mid-click (CI 10-22). Once a minute it still
	// redraws, so times like "5 min ago" stay right.
	const same = !!V && JSON.stringify({ ...nv, now: '' }) === JSON.stringify({ ...V, now: '' }) && Date.now() - lastDrawn < 60_000
	setView(nv); syncOrder()
	if (!same) { lastDrawn = Date.now(); renderSoon() }
	// A new version was installed: reload into it, unless the owner is typing.
	if (env.start && nv.version?.code && nv.version.code !== env.start && !hooks.typing()) { say(`Updated to ${nv.version.code}. Reloading.`); setTimeout(() => location.reload(), 1200) }
}
export const connected = (nv: View) => { if (S.offline) { S.offline = false; say('Connected again.', false) } merge(nv) }
export const lost = () => { if (!S.offline) { S.offline = true; renderSoon() } }
export async function refresh() {
	if (!env.io) return
	try { const nv = await env.io.data(V.since, env.ui); connected(nv) } catch { lost() }
}

/* ------------------------------ acting ------------------------------ */
// Sends a command, then waits for its result. kind says how: finish (the item should leave), draft (wait for a new draft),
// pick, ask, mark, later, keep, row (a list action).
// The revision of the Now row the owner acts on, so its result can clear once the row changes.
const rowRev = (act: string) => { const n = V.next; return n ? [...n.move, ...n.working, ...n.waiting, ...n.catchup.rows].find(r => r.act === act)?.rev ?? '' : '' }
// sent: called once the runner has the command, so a form keeps its words until then (review N2 P2-6).
export async function act(key: string, code: string, cmd: string, kind: Kind, seenAt?: string, by = '', sent?: () => void) {
	const io = env.io
	if (!io || !cmd) return
	const u = U(key)
	Object.assign(u, { status: 'pending', msg: '', lost: false, verb: cmd, menu: false, by, rev: kind === 'row' ? rowRev(code) : undefined })
	render()
	let r
	try { r = await io.call(cmd, seenAt) } catch {
		Object.assign(u, { status: 'ready', lost: true, msg: `Could not reach ${env.name}. Nothing was sent. Try again when the connection is back.` })
		S.offline = true; render(); return
	}
	if (!r.ok) { Object.assign(u, { status: kind === 'row' ? 'ready' : 'refused', msg: r.text || `${env.name} could not do that.` }); render(); say(u.msg, false); return }
	sent?.()
	// A list action answered on the spot (check now, stop watching) has nothing to wait for.
	if (kind === 'row' && !r.ids?.length) return finish(key, code, { applied: true, text: r.text }, kind)
	let o: Result, wait = env.poll, tries = 0
	for (;;) {
		await sleep(wait)
		try { o = await io.result(r.ids, code) } catch { u.lost = true; if (!S.offline) S.offline = true; renderSoon(); wait = Math.min(wait * 2, 15000); continue }
		if (u.lost || S.offline) { u.lost = false; S.offline = false; renderSoon() }
		wait = env.poll
		const working = !o.card && /running|waiting|queued/.test(o.state || '')
		if (o.applied && !(kind === 'draft' && working)) break
		if (++tries > 90) { Object.assign(u, { status: 'ready', msg: 'Still working. Check again in a minute.' }); renderSoon(); return }
	}
	// A command answered on the spot (no queued work) keeps the server's words.
	finish(key, code, r.ids.length ? o : { ...o, text: o.text || r.text }, kind)
}
function finish(key: string, code: string, o: Result, kind: Kind) {
	const u = U(key)
	u.lost = false
	if (kind === 'row') { Object.assign(u, { status: 'ready', msg: o.text || 'Done.' }); say(o.text); refresh(); return }
	if ((kind === 'ask' || kind === 'mark') && !o.card) { Object.assign(u, { status: 'ready', msg: '' }, kind === 'mark' ? { marking: false, marknote: '' } : {}); say(o.text); refresh(); return }
	if (o.card) {
		replaceCard(o.card); u.stale = false; delete S.fresh[code]
		if (kind === 'finish') { Object.assign(u, { status: 'refused', msg: o.text || 'Nothing was changed.' }); say(u.msg, false); render(); return }
		Object.assign(u, { status: 'ready', msg: '' })
		if (kind === 'draft' || kind === 'pick') Object.assign(u, { answer: '', other: '', otherOn: false, pick: null, editing: false, text: null, touched: false })
		if (kind === 'keep') u.msg = o.text as string
		if (kind === 'later') {
			const o0 = openCards(), i0 = o0.findIndex(x => x.code === code), next = o0[i0 + 1] || o0.find(x => x.code !== code)
			S.later.add(code); syncOrder(); say(o.text)
			if (S.route === 'focus' && S.cur === code && next) return go(next.code)
		}
		if (kind === 'draft') say('New draft ready. Nothing sent yet.')
		render()
		if (kind === 'draft') document.getElementById(`pri-${code}`)?.focus()
		return
	}
	const c = cardOf(code)
	u.status = 'ready'
	if (c) S.done.set(code, { msg: o.text || 'Done.', card: c })
	say(o.text)
	render(); refresh()
	if (S.route === 'focus' && S.cur === code) setTimeout(() => { if (S.route === 'focus' && S.cur === code) step(1, code) }, 1200)
}

/* ------------------------------ what the page shows ------------------------------ */
// Settled before every draw, so any experience draws the same thing and the keys follow it (view/experience.ts):
// on Needs you, the card the queue is on (the keys, Next, and Previous act on S.cur); on a Done filter, what was new when it
// was opened stays marked for the visit, and the filter is marked seen a moment later. Repeating it changes nothing.
export function viewing() {
	if (env.snap) return
	const [base, sub] = S.route.split('/')
	if (base === 'focus') { const cur = queue().find(c => c.code === S.cur) || openCards()[0]; if (cur) S.cur = cur.code }
	if (base === 'done') {
		const f = !sub ? 'all' : sub === 'closed' ? 'catchup' : sub
		S.seenOpen ??= {}
		const keys = f === 'all' ? Object.values(KIND_KEY) as string[] : [f]
		if (S.seenFor !== f) { S.seenFor = f; for (const k of keys) S.seenOpen[k] = V.seen?.[k] ?? V.since ?? ''; markSeen(f, keys) }
	}
	if (base === 'now' && V.next && !S.find?.trim()) viewingNow(sub)
}
// Now (N1b): a row on screen is seen a moment after it is first shown, and an opened row at once. What was New or Back to you
// when this look first showed it stays marked for the look (S.nowLook). Only rows that are new are marked, so a look writes little.
function viewingNow(sub?: string) {
	const n = V.next!, look = S.nowLook ??= {}
	// On a narrow page only Your move and the section the address opens are on screen.
	const narrow = (document.getElementById('app')?.clientWidth ?? 1000) <= 600
	const shown: NextRow[] = [...n.move, ...(!narrow || sub === 'working' ? n.working : []), ...(!narrow || sub === 'waiting' ? n.waiting : []), ...(!narrow || sub === 'catchup' ? n.catchup.rows : [])]
	const later: string[] = [], now: string[] = []
	for (const r of shown) {
		const opened = !!sub && (r.act === sub || r.code === sub), first = !(r.act in look)
		if (first) look[r.act] = rowMark(V, r)
		// An opened row is marked once, and again only when it has news newer than its mark (review P2-1).
		const again = opened && latest(r.fresh?.changed, r.fresh?.back) > (V.seen?.[`item:${r.act}`] ?? '')
		if (!freshOf(r, look[r.act]) || !(first || again)) continue
		;(again ? now : later).push(...new Set([`item:${r.act}`, `item:${r.code}`]))
	}
	if (now.length) markItems(now, 0)
	if (later.length) markItems(later, window.DELEGATE_LOOK_MS || 1500)
}
let itemT: ReturnType<typeof setTimeout> | undefined
const itemKeys = new Set<string>(), sending = new Set<string>()
// Seen up to the data this page shows; a row that changed since was never on screen as it is now. An opened row is sent at
// once; the rest wait a moment, so a look that ends at once (a click straight through) marks nothing.
function markItems(keys: string[], wait: number) {
	if (!wait) return sendItems(keys.filter(k => !sending.has(k)))
	for (const k of keys) itemKeys.add(k)
	clearTimeout(itemT)
	itemT = setTimeout(() => { const ks = [...itemKeys]; itemKeys.clear(); sendItems(ks) }, wait)
}
function sendItems(ks: string[]) {
	const io = env.io
	// A look that became a Find, or left Now, before its moment never really saw the rows.
	if (!S.route.startsWith('now') || S.find?.trim() || document.hidden || !io?.seen || !ks.length) return
	const at = V.now
	for (const k of ks) sending.add(k)
	io.seen(ks, at).then(() => { for (const k of ks) if ((V.seen?.[k] ?? '') < at) V.seen = { ...V.seen, [k]: at }; render() }, () => undefined).finally(() => { for (const k of ks) sending.delete(k) })
}
// Watch, from a Catch up row: the form opens prefilled from what the AI suggested.
export function openRowWatch(code: string) {
	const r = V.done.find(x => x.code === code) ?? V.catchUp?.top.find(x => x.code === code)
	S.watchOpen = code; S.watchForm = r ? rowWatchOf(r) : null
}

/* ------------------------------ the queue ------------------------------ */
export function step(d: number, from = S.cur) {
	const q = queue(), o = openCards()
	if (!o.length) { S.cur = null; return render() }
	const i = o.findIndex(c => c.code === from)
	let next
	if (i < 0) { const qi = q.findIndex(c => c.code === from); next = q.slice(qi + 1).find(c => !S.done.has(c.code)) || o[0] }
	else next = o[i + d] || (from !== S.cur || S.later.has(from as string) ? o.find(c => c.code !== from) : null)
	if (next) go(next.code)
	else render()
}
export function go(code: string) {
	S.cur = code
	if (location.hash !== `#focus/${code}`) history.replaceState(null, '', `#focus/${code}`)
	S.route = 'focus'; render(true)
	const o = openCards(), c = o.find(x => x.code === code)
	document.getElementById(`card-${code}`)?.focus({ preventScroll: true })
	if (c) say(`Item ${o.indexOf(c) + 1} of ${o.length}, ${c.who.name}.`, false)
}

/* ------------------------------ forms ------------------------------ */
// Watch something, from the Ongoing sheet.
export function startSheetWatch() {
	const cmd = sheetWatchCommand(S.wform!)
	S.formBusy = true; render()
	env.io!.call(cmd).then(r => { S.formBusy = false; if (!r.ok) { S.formErr = r.text || 'Could not start it.'; render(); return } S.sheet = null; say(r.text); refresh(); render() }, () => { S.formBusy = false; S.formErr = `Could not reach ${env.name}.`; render() })
}
// Watch, from a Catch up row.
export function startRowWatch(code: string) {
	const cmd = rowWatchCommand(code, S.watchForm!)
	S.watchOpen = null; act(`row:${code}`, code, cmd, 'row')
}
export async function createAutomation() {
	const f = S.form!
	S.formBusy = true; S.formErr = ''; render()
	try {
		const r = await env.io!.automate(automationInput(f, V))
		S.formBusy = false
		if (!r.ok) { S.formErr = r.text || 'Not created.'; render(); return }
		S.sheet = null; S.newAuto = r.code ?? null; say(r.text); await refresh(); render()
	} catch { S.formBusy = false; S.formErr = 'Lost connection. Nothing was created. Try again.'; render() }
}
export function markCard(code: string) {
	const u = U(code)
	act(code, code, markCommand(code, u.mark, (u.marknote || '').trim()), 'mark')
}
export function ask(code: string) {
	const u = U(code), q = u.ask.trim()
	if (!q) return
	u.ask = ''
	act(code, code, `ask ${code}: ${q}`, 'ask', cardOf(code)?.rev)
}

/* ------------------------------ Home, Done, Settings ------------------------------ */
// Catch up's Mark all read: seen up to the data this page shows.
export function seenAll() { const at = V.now; env.io?.seen?.(['catchup'], at)?.then(() => { V.seen = { ...V.seen, catchup: at }; refresh() }) }

let seenT: ReturnType<typeof setTimeout> | undefined
// Opening a Done filter marks its rows seen after a moment, so a click straight through does not.
export function markSeen(f: string, keys: string[]) {
	clearTimeout(seenT)
	seenT = setTimeout(() => {
		const io = env.io
		if (S.route !== `done/${f}` && !(f === 'all' && S.route === 'done') || document.hidden || !io?.seen) return
		// Seen up to the data this page shows, not the click: a row that arrived since was never on screen.
		const at = V.now
		io.seen(keys, at).then(() => { for (const k of keys) V.seen = { ...V.seen, [k]: at }; render() }, () => undefined)
	}, 1500)
}
// Check for updates, then look again every 3 s for up to 2 minutes until the check time moves.
export function checkUpdate() {
	const io = env.io
	if (!io || S.checking) return
	const before = V.version?.checkedAt
	S.checking = true; render()
	io.call('check update').then(async () => {
		for (let i = 0; i < 40 && V.version?.checkedAt === before; i++) { await sleep(3000); await refresh() }
		S.checking = false; render()
	}, () => { S.checking = false; say('Could not reach the page server.', false); render() })
}
export function saveSetting(key: string) {
	const row = V.settings!.rows.find(r => r.key === key), u = U(`set:${key}`), value = S.set[key] ?? row?.value ?? '', io = env.io
	if (!io?.settings) return
	// A switch that did not save goes back to what is saved; a field keeps what the owner typed, to fix it.
	const undo = () => { if (row?.kind === 'switch') delete S.set[key] }
	Object.assign(u, { status: 'pending', msg: '' }); render()
	io.settings(key, value).then(r => { Object.assign(u, { status: 'ready', msg: r.text }); if (r.ok) delete S.set[key]; else undo(); say(r.text, r.ok); refresh() }, () => { undo(); Object.assign(u, { status: 'ready', msg: 'Could not reach the page server.' }); render() })
}
// A switch saves as it is flipped, through the same save as any setting.
export function toggleSetting(key: string) {
	const row = V.settings?.rows.find(r => r.key === key)
	if (!row || U(`set:${key}`).status === 'pending') return
	S.set[key] = (S.set[key] ?? row.value) === 'true' ? 'false' : 'true'
	saveSetting(key)
}
export function report(text: string) {
	const io = env.io
	if (!text || !io) return
	io.call(`report: ${text}`).then(r => { if (r.ok) S.reporting = false; say(r.text, r.ok); render() }, () => say('Could not reach the page server.', false))
}
// A message it should have picked up: it becomes an item with why it was missed (B21). From Find, the words clear once it is.
export function missed(link: string) {
	const io = env.io
	if (!link || !io) return
	S.missing = true; S.missedLink = link; render()
	io.call(`missed ${link}`).then(r => { S.missing = false; if (r.ok) { S.missedLink = ''; if (S.find?.trim() === link) S.find = '' } say(r.text, r.ok); render(); setTimeout(refresh, 5000) }, () => { S.missing = false; say('Could not reach the page server.', false); render() })
}
// Find (N1b): its words live in the page state, so a redraw from fresh data never loses them.
export function setFind(q: string) { S.find = q; render() }
// A pasted Teams link that is not an item yet, through the existing missed-message command; nothing else.
export function findMissed() {
	const f = find(V, S.find ?? '')
	if (f.link && !f.link.item && !S.missing) missed(f.link.href)
}
