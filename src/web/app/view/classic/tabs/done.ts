// Done: the last 7 days by filter, new first, each reply readable as the exchange, with Undo while it can, and Catch up.
import { CHIP_LABEL, DONE_KINDS, isNew, itemSeen, newCount, seenIn } from '../../../../model/derive.ts'
import { first, mmss, when } from '../../../../model/format.ts'
import { BY, rowWatchOf } from '../../../../model/forms.ts'
import type { DoneRow } from '../../../../model/types.ts'
import { S, V, env, peek } from '../../../state/store.ts'
import { esc, html, join, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { banners } from '../banners.ts'
import { askThread, markBox, why } from '../card.ts'
import { B, av, listHead, rowState } from '../parts.ts'

const DONE_ICON: Record<string, string> = { reply: 'reply', review: 'pr', change: 'task', reminder: 'clock', learned: 'book', closed: 'check', catchup: 'eye' }
// New as it was when this filter was opened, so the marks stay for the visit though the rows now count as seen.
const seenOf = (k: string) => S.seenOpen?.[k] ?? V.seen?.[k] ?? V.since ?? ''

// A Catch up row reads on its own: headline, what changed, who and where; the row opens Teams.
export function cuRow(r: DoneRow, home = false): H {
	const key = `row:${r.code}`, u = peek(key), w = S.watchOpen === r.code
	const meta = html`<span class="m">${join([r.by, when(r.at)].filter(Boolean).map(x => esc(x)), raw(' · '))}${r.watchedAs ? html` · <span class="tag ok">Watching as ${esc(r.watchedAs)}</span>` : ''}</span>`
	const text = html`<b>${esc(r.sentence)}</b>${r.gist ? html`<span class="gist">${esc(r.gist)}</span>` : ''}${meta}`
	const body = r.teams && !env.snap ? html`<a class="rt rlink" href="${esc(r.teams)}" target="_blank" rel="noopener" data-act="cuopen" data-v="${esc(r.code)}" title="Open in Teams">${text}</a>` : html`<div class="rt">${text}</div>`
	const acts = env.snap || u.msg ? '' : html`<div class="rowacts">${r.watchedAs ? '' : B('Watch', 'watchopen', { sm: true, ghost: true, v: r.code })}${B('Needs me', 'rowact', { sm: true, ghost: true, v: `mine ${r.code}`, verb: `mine ${r.code}`, aria: html`data-key="${esc(key)}"` })}</div>`
	const form = w ? watchForm(r) : ''
	return html`<li class="row cu${home ? raw(' home') : ''}" data-code="${esc(r.code)}"><span class="ri">${I(r.high ? 'warn' : 'eye')}</span>${body}${r.teams && !env.snap ? html`<a class="ext" href="${esc(r.teams)}" target="_blank" rel="noopener" aria-label="Open in Teams" data-act="cuopen" data-v="${esc(r.code)}">${I('ext', 'sm')}</a>` : ''}${acts}${rowState(key)}${form}</li>`
}
// Watch, from a Catch up row: one editable sentence, prefilled from what the AI suggested, and when it should be done by.
function watchForm(r: DoneRow): H {
	const f = S.watchForm ?? rowWatchOf(r)
	return html`<div class="wform" role="group" aria-label="Watch this"><label class="fl" for="wt-${esc(r.code)}">Watch</label><input class="field" id="wt-${esc(r.code)}" data-wf="target" value="${esc(f.target)}"><label class="fl" for="wu-${esc(r.code)}">until</label><input class="field" id="wu-${esc(r.code)}" data-wf="until" value="${esc(f.until)}">
		<div class="seg" role="group" aria-label="Done by">${BY.map(([k, l]) => html`<button type="button" data-act="wby" data-v="${esc(k)}" aria-pressed="${f.by === k}">${esc(l)}</button>`)}</div>
		<div class="acts">${B('Start watching', 'watchgo', { primary: true, sm: true, v: r.code, disabled: !f.target.trim() })}${B('Cancel', 'watchcancel', { sm: true, ghost: true })}</div></div>`
}
// One Done row; the Numbers tab draws the rows a number counted with it too (R-NEX-11), and Find on the new page's Now (N1b).
export function row(r: DoneRow): H {
	if (r.kind === 'catchup') return cuRow(r)
	const key = `row:${r.code}`, left = r.undoUntil ? Math.round((Date.parse(r.undoUntil) - Date.now()) / 1000) : 0, u = peek(key), ru = peek(r.code)
	// Undo counts down in place (app.ts ticks [data-until] every second).
	const undo = left > 0 && !u.msg ? raw(String(B('Undo', 'undo', { v: r.code, busy: u.status === 'pending', busyLabel: 'Taking it back…', verb: `undo ${r.code}`, aria: html`aria-label="Undo the reply to ${esc(first(r.who.name))}"` })).replace('<span class="bl">Undo</span>', String(html`${I('undo', 'sm')}<span class="bl">Undo <span class="tnum" data-until="${esc(r.undoUntil)}" style="color:var(--text-3);font-weight:500">${esc(mmss(left))}</span></span>`))) : ''
	const link = r.teams || r.href
	const reply = r.kind === 'reply' || r.kind === 'review', where = r.sentence.match(/ in (.+)$/)
	const meta = html`<span class="m">${join([reply ? `${r.who.name}${where ? ` · ${where[1]}` : ''}` : r.by && r.kind !== 'learned' ? r.by : '', reply ? r.by : '', when(r.at), left > 0 && !u.msg ? 'you can take it back' : ''].filter(Boolean).map(x => esc(x)), raw(' · '))}${link && !env.snap ? html` · <a class="ext-in" href="${esc(link)}" target="_blank" rel="noopener">Open ${esc(r.teams ? 'in Teams' : '')}↗</a>` : ''}</span>`
	const work = r.work ? html`<span class="tag${/^Closed/.test(r.work) ? raw(' ok') : ''}">${esc(r.work)}</span>` : ''
	const lead = reply ? av(r.who) : html`<span class="ri">${I(DONE_ICON[r.kind])}</span>`
	// A reply reads as the exchange: what was asked, and what was said (layout A, verbatim).
	const lines = reply && (r.ask || r.said)
		? html`${r.ask ? html`<span class="qa"><b>${esc(first(r.who.name))} asked:</b> ${esc(r.ask)}</span>` : html`<b>${esc(r.sentence)}</b>`}${r.said ? html`<span class="qa you"><b>You${esc(r.inTeams ? ' (in Teams)' : '')}:</b> ${esc(r.said)}</span>` : ''}`
		: html`<b>${esc(r.sentence)}</b>${r.gist ? html`<span class="gist">${esc(r.gist)}</span>` : r.said ? html`<span class="gist">“${esc(r.said)}”</span>` : ''}`
	const main = html`${lead}<div class="rt">${lines}${meta}${work}${rowState(key)}</div>`
	if (r.text && !undo) return html`<li data-code="${esc(r.code)}"><details class="rowx" data-row${ru.open || ru.marking || r.notes?.some(n => !n.a) ? raw(' open') : ''}><summary class="row">${main}${I('right', 'sm')}</summary><div class="sent">${esc(r.text)}</div>${r.why ? why({ why: r.why, who: r.who }, ru) : ''}${r.notes ? html`<div class="c-sec">${markBox(r, ru)}</div>` : ''}${r.notes ? askThread({ code: r.code, sent: true, notes: r.notes }, ru) : ''}</details></li>`
	return html`<li class="row${undo ? raw(' undo-row') : ''}">${main}${undo}</li>`
}
export function doneList(f: string): H {
	if (f === 'closed') f = 'catchup'
	// What was new when this filter was opened stays marked for the visit (S.seenOpen, settled by state/actions.ts viewing()).
	const shown = (r: DoneRow) => r.kind !== 'closed'
	const rows = V.done.filter(r => shown(r) && (f === 'all' || DONE_KINDS[f]?.includes(r.kind)))
	const chips = ([['all', 'All', V.done.filter(shown).length, newCount(V)], ...Object.entries(DONE_KINDS).map(([k, ks]) => [k, CHIP_LABEL[k] ?? k[0].toUpperCase() + k.slice(1), V.done.filter(r => ks.includes(r.kind)).length, V.done.filter(r => ks.includes(r.kind) && isNew(r, seenIn(V), itemSeen(V))).length])] as [string, string, number, number][]).filter(x => x[2])
	const fresh = rows.filter(r => isNew(r, seenOf, itemSeen(V))), earlier = rows.filter(r => !isNew(r, seenOf, itemSeen(V)))
	const list = (h: string, rs: DoneRow[]): H => rs.length ? html`${h ? html`<h2 class="section-h">${esc(h)}</h2>` : ''}<ul class="rows">${rs.map(row)}</ul>` : ''
	const quiet = f === 'catchup' ? V.done.filter(r => r.kind === 'closed') : []
	const foot = quiet.length ? html`<details class="quiet"><summary class="m">Also closed ${quiet.length} with nothing to know · Show</summary><ul class="rows">${quiet.map(r => html`<li class="row"><span class="ri">${I('check')}</span><div class="rt"><b>${esc(r.sentence)}</b><span class="m">${esc(when(r.at))}${r.teams && !env.snap ? html` · <a class="ext-in" href="${esc(r.teams)}" target="_blank" rel="noopener">Open in Teams↗</a>` : ''}</span></div></li>`)}</ul></details>` : ''
	const body = rows.length ? html`${list(fresh.length && earlier.length ? 'New' : '', fresh)}${list(fresh.length ? 'Earlier this week' : '', earlier)}` : html`<p class="empty">${esc(f === 'catchup' ? 'Nothing to catch up on in the last 7 days.' : 'Nothing in the last 7 days.')}</p>`
	const sub = f === 'catchup' ? `What ${env.name} read for you and closed with no reply. Click a row to open it in Teams.` : 'The last 7 days. Open a reply to see what was sent and why.'
	return html`${banners()}<div style="max-width:880px">${listHead('Done', sub)}
		<div class="filters" role="group" aria-label="Filter">${chips.map(([k, l, n, nw]) => html`<a class="chip" href="#done/${esc(k)}" aria-pressed="${f === k}" style="display:inline-flex;align-items:center;gap:6px">${esc(l)}<span class="tnum" style="color:var(--text-3)">${n}</span>${nw ? html`<span class="newpill">${nw} new</span>` : ''}</a>`)}</div>${body}${foot}</div>`
}
