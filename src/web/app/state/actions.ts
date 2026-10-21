// What the owner's clicks do to the page's state and to Delegate. Drawing is lent by the view through hooks (state/store.ts).
import { KIND_KEY, dirty } from '../model/derive.ts'
import { automationInput, markCommand, rowWatchCommand, rowWatchOf, sheetWatchCommand } from '../model/forms.ts'
import type { ItemCard, KnowledgeCard, Kind, View } from '../model/types.ts'
import { sleep, type Result } from '../io/transport.ts'
import { S, U, V, cardOf, env, hooks, openCards, queue, replaceCard, setView, syncOrder } from './store.ts'

const render = (enter?: boolean) => hooks.render(enter)
const renderSoon = () => hooks.renderSoon()
const say = (t: string | undefined, toast?: boolean) => hooks.say(t, toast)
type Card = ItemCard | KnowledgeCard
const cards = (v: View, key: 'needs' | 'knowledge') => v[key] as Card[]

/* ------------------------------ data ------------------------------ */
// Fresh data from the server. A card the owner has started on keeps what they did and says a newer version is there.
export function merge(nv: View) {
	for (const key of ['needs', 'knowledge'] as const) (nv[key] as Card[]) = cards(nv, key).map(c => {
		const old = cards(V, key).find(x => x.code === c.code), u = S.ui[c.code]
		if (old && old.rev !== c.rev && u && u.status !== 'pending' && dirty(u)) { S.fresh[c.code] = c; u.stale = true; return old }
		return c
	})
	// A card whose action is still on its way stays until its result arrives, even while the item is being redrafted.
	for (const key of ['needs', 'knowledge'] as const) for (const c of cards(V, key)) if (S.ui[c.code]?.status === 'pending' && !cards(nv, key).some(x => x.code === c.code)) cards(nv, key).push(c)
	nv.since = V.since
	setView(nv); syncOrder(); renderSoon()
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
export async function act(key: string, code: string, cmd: string, kind: Kind, seenAt?: string, by = '') {
	const io = env.io
	if (!io || !cmd) return
	const u = U(key)
	Object.assign(u, { status: 'pending', msg: '', lost: false, verb: cmd, menu: false, by })
	render()
	let r
	try { r = await io.call(cmd, seenAt) } catch {
		Object.assign(u, { status: 'ready', lost: true, msg: `Could not reach ${env.name}. Nothing was sent. Try again when the connection is back.` })
		S.offline = true; render(); return
	}
	if (!r.ok) { Object.assign(u, { status: kind === 'row' ? 'ready' : 'refused', msg: r.text || `${env.name} could not do that.` }); render(); say(u.msg, false); return }
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
	const u = U(`set:${key}`), value = S.set[key] ?? V.settings!.rows.find(r => r.key === key)?.value ?? '', io = env.io
	if (!io?.settings) return
	Object.assign(u, { status: 'pending', msg: '' }); render()
	io.settings(key, value).then(r => { Object.assign(u, { status: 'ready', msg: r.text }); if (r.ok) delete S.set[key]; say(r.text, r.ok); refresh() }, () => { Object.assign(u, { status: 'ready', msg: 'Could not reach the page server.' }); render() })
}
export function report(text: string) {
	const io = env.io
	if (!text || !io) return
	io.call(`report: ${text}`).then(r => { if (r.ok) S.reporting = false; say(r.text, r.ok); render() }, () => say('Could not reach the page server.', false))
}
// A message it should have picked up: it becomes an item with why it was missed (B21).
export function missed(link: string) {
	const io = env.io
	if (!link || !io) return
	S.missing = true; S.missedLink = link; render()
	io.call(`missed ${link}`).then(r => { S.missing = false; if (r.ok) S.missedLink = ''; say(r.text, r.ok); render(); setTimeout(refresh, 5000) }, () => { S.missing = false; say('Could not reach the page server.', false); render() })
}
