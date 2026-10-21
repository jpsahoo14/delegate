// The card around every item: who and where, the ask and its thread, open work, the type's body, why, the action,
// and the Ask thread. A card handled this visit stays as a short line, with Not right and Ask still there.
import { primaryOf } from '../../model/derive.ts'
import { doing, first, plural, refusalOf, sourceChip, when, forPage } from '../../model/format.ts'
import { MARKS } from '../../model/forms.ts'
import type { CardUi, DoneRow, ItemCard, Who } from '../../model/types.ts'
import { S, U, V, env } from '../../state/store.ts'
import { esc, html, join, raw, type H } from '../html.ts'
import { I } from '../icons.ts'
import { bodyOf } from './cards/index.ts'
import { B, av, rowState } from './parts.ts'

// What an Ask thread needs: a live card, or a sent one from Done.
type Asked = Pick<ItemCard, 'code' | 'notes'> & { sent?: boolean; draft?: ItemCard['draft']; type?: ItemCard['type'] }
type Note = ItemCard['notes'][number]

export const primary = (c: ItemCard) => primaryOf(c, U(c.code), env.name)

export function why(c: { why: ItemCard['why']; who: Who }, u: CardUi): H {
	const w = c.why, n = w.sources.length
	const sr = w.searched ?? []
	if (!w.reason && !n && !w.gaps.length && !sr.length) return ''
	const rows = w.sources.map(s => html`<div class="src"><span class="k">${esc(s.kind)}</span><span>${s.href && !env.snap ? html`<a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</span><span class="x">${s.stale ? raw('<span class="tag warn">May be out of date</span>') : ''}${s.locked ? html`${I('lock', 'sm')}Not visible to ${esc(first(c.who.name))}` : s.kind === 'In the chat' ? html`Visible to ${esc(first(c.who.name))}` : ''}</span></div>`)
	const looked = sr.length ? html`<div class="src"><span class="k">Looked up</span><span>${join(sr.map(x => esc(x)), raw('<br>'))}</span></div>` : ''
	const gaps = w.gaps.length ? html`<div class="src"><span class="k">Could not read</span><span>${esc(w.gaps.join(', '))}</span></div>` : ''
	const conf = w.confidence ? html`<span class="tag">${esc(w.confidence[0].toUpperCase() + w.confidence.slice(1))} confidence</span>` : ''
	return html`<div class="c-sec" style="padding-top:12px;padding-bottom:12px"><details class="why" data-why${u.whyOpen ? raw(' open') : ''}><summary>${I('right', 'sm chev')}<span class="rs"><b>Why:</b> ${esc(w.reason || 'The sources behind this draft')}</span>${conf}${n ? html`<span class="tag">${esc(plural(n, 'source'))}</span>` : ''}</summary><div class="why-b">${rows}${looked}${gaps}</div></details></div>`
}
function menu(c: ItemCard, u: CardUi): H {
	if (env.snap) return ''
	const canEdit = c.draft && (c.type === 'reply' || c.type === 'review')
	return html`<div class="menu${u.menu ? raw(' open') : ''}"><button class="btn ghost sm icon" data-act="menu" aria-haspopup="menu" aria-expanded="${u.menu}" aria-label="More actions for ${esc(c.code)}">${I('more')}</button><div class="menu-pop" role="menu">
		${canEdit ? html`<button role="menuitem" data-act="edit">${I('edit')}Edit reply<small>e</small></button>` : ''}
		<button role="menuitem" data-act="later">${I('later')}Later<small>l</small></button>
		<button role="menuitem" data-act="thread">${I('chat')}${esc(u.threadOpen ? 'Hide' : 'Show')} thread</button>
		${c.teams && c.draft ? html`<button role="menuitem" data-act="teamsdraft">${I('edit')}Edit in Teams<small>copies the reply</small></button>` : ''}
		${c.teams ? html`<button role="menuitem" data-act="teams">${I('ext')}Open in Teams</button>` : ''}
		<button role="menuitem" data-act="continue">${I('pc')}Open on your computer</button>
		<hr><button role="menuitem" data-act="dismiss">${I('x')}Dismiss</button></div></div>`
}
function head(c: ItemCard, u: CardUi): H {
	return html`<div class="c-head">${av(c.who)}<div class="c-who"><h2 class="c-name" id="h-${esc(c.code)}">${esc(c.who.name)}</h2>
		<div class="c-meta">${I(c.chat.group ? 'chat' : 'reply', 'sm')}<span>${esc(c.chat.name)}</span>${c.chat.guests ? raw('<span class="tag warn">Guests</span>') : ''}<span aria-hidden="true">·</span><span>${esc(when(c.at))}</span></div></div>
		<div class="c-right">${c.before ? html`<span class="tag" title="Sent before you set up ${esc(env.name)}; replies wait for your ok">From before setup · ${esc(when(c.before))}</span>` : ''}${c.newCount ? html`<span class="tag warn">${c.newCount} new</span>` : ''}<span class="code">${esc(c.code)}</span>${menu(c, u)}</div></div>
		${c.earlier ? html`<p class="earlier">${I('clock', 'sm')}${esc(c.earlier)}</p>` : ''}`
}
function askBlock(c: ItemCard, u: CardUi): H {
	if (!c.ask) return ''
	const th = c.thread.length ? c.thread : [{ who: c.who.name, text: c.ask, at: c.at }]
	return html`<div class="ask">${esc(c.ask)}${env.snap ? '' : html`<button class="link tl" data-act="thread" aria-expanded="${u.threadOpen}">${esc(u.threadOpen ? 'Hide thread' : 'Show thread')}</button>`}</div>
		${u.threadOpen ? html`<ol class="thread" aria-label="Thread">${th.map(m => html`<li><b>${esc(m.who)}</b><time>${esc(when(m.at))}</time><div>${esc(m.text)}</div></li>`)}</ol>` : ''}`
}
// Where the card's action stands: on its way, refused, or what came back.
export function stateLine(u: CardUi, verb: string): H {
	if (u.status === 'pending') return u.lost
		? html`<div class="state lost" role="status">${I('off')}<p><b>Lost connection. Retrying…</b> ${esc(env.name)} has your action. It will not be sent twice.</p></div>`
		: html`<div class="state pending" role="status"><span class="spin" aria-hidden="true"></span><p>${esc(doing(verb, env.name))} Usually under a minute. You can move on.</p></div>`
	if (u.status === 'refused') { const r = refusalOf(u.msg); return html`<div class="state ${raw(r.cls)}" role="alert">${I(r.cls === 'check' ? 'info' : 'warn')}<p><b>${esc(r.label)}</b> ${esc(forPage(u.msg))}</p></div>` }
	if (u.msg) return html`<div class="state ${raw(u.lost ? 'lost' : 'info')}" role="status">${I(u.lost ? 'off' : 'info')}<p>${esc(forPage(u.msg))}</p></div>`
	return ''
}
function actions(c: ItemCard, u: CardUi): H {
	const p = primary(c), verb = p.verb || p.cmd
	// The main button shows busy only for its own action, never for Dismiss, Later, or an answer (dogfood).
	// It is also busy while the step it waits on runs (preparing a picked option), with that step's word.
	const pending = u.status === 'pending' && (u.by === 'primary' || u.verb === verb)
	const busyLabel = /^pick\b/i.test(u.verb || '') && u.by !== 'primary' ? 'Preparing…' : p.kind === 'draft' ? 'Drafting…' : /^(Post|Make|Approve|Reject|Check)\b/.test(p.label) ? `${p.label.split(' and ')[0].replace(/^Post/, 'Posting').replace(/^Make/, 'Making').replace(/^Approve/, 'Approving').replace(/^Reject/, 'Rejecting').replace(/^Check/, 'Checking')}…` : 'Sending…'
	// A change failed or was dropped: the reply alone, quoted by the runner first, so nothing goes until a second ok (next action).
	const only = c.replyOnly && !u.editing ? B('Send reply only', 'replyonly', { verb: c.replyOnly, busy: u.status === 'pending' && u.verb === c.replyOnly, busyLabel: 'Checking…' }) : ''
	const sec = [u.editing ? B('Cancel edit', 'canceledit', { cls: 'sec-hide' }) : '', only, B('Later', 'later', { ghost: true, verb: `later ${c.code}` })]
	const foot = env.snap ? '' : p.hint ? html`<p class="vh">${esc(p.hint)}</p>` : ''
	return html`${stateLine(u, u.verb || verb)}<div class="acts">${B(p.label, 'primary', { primary: true, id: `pri-${c.code}`, disabled: p.disabled || u.stale, busy: pending, busyLabel, verb })}${sec}</div>${foot}`
}
function noteHtml(c: Asked, n: Note, i: number): H {
	if (!n.a) return html`<li class="nq">${esc(n.q)}</li><li class="na"><span class="bot" aria-hidden="true">${I('spark', 'sm')}</span><div class="nb"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="wait"> ${esc(env.name)} is looking into it.</span></div></li>`
	return html`<li class="nq">${esc(n.q)}</li><li class="na"><span class="bot" aria-hidden="true">${I('spark', 'sm')}</span><div class="nb"><span class="sr">${esc(env.name)}:</span><p>${esc(n.a)}</p>
		${n.sources?.length ? html`<div class="nsrc">${n.sources.map(s => html`<span class="tag">${s.tier === 'private' ? I('lock', 'sm') : ''}${/^https:\/\//.test(s.ref) && !env.snap ? html`<a href="${esc(s.ref)}" target="_blank" rel="noopener">${esc(sourceChip(s))}</a>` : esc(sourceChip(s))}</span>`)}</div>` : ''}
		${env.snap ? '' : html`<div class="nacts">${c.draft || c.type === 'question' ? B('Use this in the reply', 'usenote', { sm: true, ic: 'spark', v: i }) : ''}${B('Ask more', 'askmore', { sm: true, ghost: true })}</div>`}</div></li>`
}
// A sent reply can be marked not right (model/forms.ts MARKS). In the snapshot, the words to type.
export function markBox(r: DoneRow, u: CardUi): H {
	if (env.snap) return html`<p class="m markrow">Not right? Say <span class="verb">wrong ${esc(r.code)}: …</span>, <span class="verb">incomplete ${esc(r.code)}: …</span>, or <span class="verb">unneeded ${esc(r.code)}</span>.</p>`
	if (!u.marking) return html`<div class="markrow">${B('Not right?', 'markopen', { sm: true, ghost: true, aria: html`aria-label="Tell ${esc(env.name)} the reply to ${esc(first(r.who.name))} was not right"` })}</div>`
	const k = u.mark || 'wrong', m = MARKS.find(x => x[0] === k)!, back = k === 'unneeded' && r.rule && Date.parse(r.undoUntil || '') > Date.now(), busy = u.status === 'pending'
	return html`<form class="markf" data-form="mark" aria-label="What was not right about ${esc(r.code)}">
		<div class="filters" role="group" aria-label="What was not right">${MARKS.map(([v, l]) => html`<button type="button" class="chip" data-act="markkind" data-v="${esc(v)}" aria-pressed="${k === v}">${esc(l)}</button>`)}</div>
		<label class="sr" for="mk-${esc(r.code)}">${esc(m[2])}</label><textarea id="mk-${esc(r.code)}" class="edit" data-input="marknote" rows="2" placeholder="${esc(m[2])}">${esc(u.marknote || '')}</textarea>
		<div class="markacts"><button class="btn sm primary${busy ? raw(' busy') : ''}" type="submit"${busy || S.offline ? raw(' disabled') : ''}>${busy ? raw('<span class="spin" aria-hidden="true"></span>') : ''}<span class="bl">${esc(busy ? 'Telling it…' : back ? 'Take it back' : m[3])}</span></button>${B('Cancel', 'markcancel', { sm: true, ghost: true })}</div>
		<p class="m">${k === 'unneeded' ? (r.rule ? html`Rule ${esc(r.rule)} will ask you first from now on.` : html`${esc(env.name)} notes it so it can learn.`) : esc('Nothing is sent until you approve the new draft in Needs you.')}</p></form>`
}
// A sent item keeps its Ask thread; the Done row holds its latest notes.
const sentOf = (c: ItemCard): Asked => ({ code: c.code, sent: true, notes: V.done.find(r => r.code === c.code && r.notes)?.notes ?? c.notes ?? [] })
export function askThread(c: Asked, u: CardUi): H {
	if (env.snap) return ''
	return html`<section class="c-sec askt" aria-label="Ask ${esc(env.name)} about ${esc(c.code)}">
		<div class="askt-h">${I('spark')}Ask ${esc(env.name)}<span>Only you see this. Each question is one AI run in this item’s session.</span></div>
		${c.notes.length ? html`<ol class="notes" aria-live="polite">${c.notes.map((n, i) => noteHtml(c, n, i))}</ol>` : ''}
		<form class="askf" data-form="ask"><label class="sr" for="askin-${esc(c.code)}">Ask ${esc(env.name)} about ${esc(c.code)}</label><input id="askin-${esc(c.code)}" data-input="ask" placeholder="${esc(c.sent ? 'Ask about this. Nothing is sent.' : 'Ask about this before you send…')}" autocomplete="off" value="${esc(u.ask)}"${S.offline ? raw(' disabled') : ''}><button class="btn sm ghost" type="submit"${S.offline ? raw(' disabled') : ''}>${I('send', 'sm')}Ask</button></form></section>`
}
// Open work on its card: the goal, where it stands, and its latest steps (R-WRK-07).
function workBlock(c: ItemCard): H {
	const k = c.work
	if (!k) return ''
	const btn = (label: string, verb: string, o = {}) => B(label, 'rowact', { sm: true, v: `${verb}`, verb, aria: html`data-key="work:${esc(c.code)}"`, ...o })
	const who: Record<string, string> = { you: 'you', them: 'them', me: env.name }
	const plan = k.plan.length ? html`<ul class="plan" aria-label="Plan">${k.plan.map(p => html`<li class="${p.done ? raw('done') : ''}"><span aria-hidden="true">${esc(p.done ? '✓' : '○')}</span> ${esc(p.what)} <span class="m">${esc([who[p.who] ?? p.who, p.where, p.build && `build ${p.build}`].filter(Boolean).join(' · '))}</span></li>`)}</ul>` : ''
	return html`<div class="c-sec work" aria-label="This work"><p class="also-line">${I('eye', 'sm')}<span><b>${k.proposed ? esc('Track as work?') : k.home ? html`Part of ${esc(k.home)}:` : esc('This work:')}</b> ${esc(k.goal)}${k.waiting ? html` · waiting on ${esc(k.waiting)}` : k.next ? html` · next: ${esc(k.next)}` : ''}</span></p>
		${plan}<ol class="steps">${k.steps.map(x => html`<li${x.news ? raw(' class="news"') : ''}><span class="m">${esc(when(x.at))}</span> ${esc(x.what)}</li>`)}</ol>
		${k.due && !U(`work:${c.code}`).msg ? html`<div class="acts">${btn('Wait 3 days', `wait ${c.code}: 3d`)}${btn('Close', `close ${c.code}`, { ghost: true })}</div>` : ''}${rowState(`work:${c.code}`)}</div>`
}
// Show details: the lines that explain this item, and a button that copies them for a bug report.
const debugBlock = (c: ItemCard, u: CardUi): H => c.debug ? html`<div class="c-sec"><details class="why" data-dbg${u.dbgOpen ? raw(' open') : ''}><summary>${I('right', 'sm chev')}<span class="rs"><b>Details</b></span></summary><div class="why-b"><pre class="dbg">${esc(c.debug.join('\n'))}</pre>${env.snap ? '' : B('Copy details', 'copydebug', { sm: true, ghost: true })}</div></details></div>` : ''

// work: false when the new page's opened item draws the work itself (view/next/item.ts), so it is not shown twice.
export function card(c: ItemCard, enter?: boolean, o: { work?: boolean } = {}): H {
	const u = U(c.code), done = S.done.get(c.code)
	if (done) return html`<article class="card" id="card-${esc(c.code)}" data-code="${esc(c.code)}" aria-labelledby="ap-${esc(c.code)}" tabindex="-1"><div class="applied" role="status"><span class="ok">${I('check', 'lg')}</span><p id="ap-${esc(c.code)}"><b>${esc(done.msg)}</b><span>${esc(c.who.name)} · ${esc(c.chat.name)}</span></p><span class="code">${esc(c.code)}</span></div>${(r => r ? html`<div class="c-sec">${markBox(r, u)}</div>` : '')(V.done.find(r => r.code === c.code && r.notes))}${askThread(sentOf(c), u)}</article>`
	return html`<article class="card${enter ? raw(' enter') : ''}" id="card-${esc(c.code)}" data-code="${esc(c.code)}" data-rev="${esc(c.rev)}" aria-labelledby="h-${esc(c.code)}" tabindex="-1">
		${u.stale ? html`<div class="stale" role="status">${I('warn')}<p><b>Changed since you looked.</b> There is a newer version of this item.</p>${B('Show the new version', 'shownew', { sm: true })}</div>` : ''}
		<div class="c-sec">${head(c, u)}${askBlock(c, u)}</div>
		${o.work === false ? '' : workBlock(c)}
		<div class="c-sec">${bodyOf(c, u)}</div>
		${why(c, u)}${debugBlock(c, u)}
		<div class="c-sec c-foot">${actions(c, u)}</div>
		${askThread(c, u)}</article>`
}
