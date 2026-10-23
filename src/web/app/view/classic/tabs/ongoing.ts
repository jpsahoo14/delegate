// Ongoing: everything Delegate is doing or waiting on, in one place (round 3 #4). Running and Automations are sections here.
import { plural, when } from '../../../../model/format.ts'
import { INTERVALS } from '../../../../model/forms.ts'
import type { View } from '../../../../model/types.ts'
import { S, U, V, env } from '../../../state/store.ts'
import { esc, html, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { banners } from '../banners.ts'
import { B, av, listHead, rowState } from '../parts.ts'
import { autoRow, sheet } from '../sheet.ts'

type Timed = { code: string; every?: number; endsAt?: string }
type Watched = View['watching'][number]

const runningRows = (): H => html`${V.running.map(r => html`<article class="wcard"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text)">${I(r.code ? 'pr' : 'book')}</span><div class="c-who"><h3>${esc(r.what)}</h3><span class="m">${r.who ? html`For ${esc(r.who)} · ` : ''}since ${esc(when(r.since))}</span></div>${r.code ? html`<span class="code">${esc(r.code)}</span>` : ''}</div>
		${r.progress != null ? html`<div class="bar" role="progressbar" aria-label="${esc(r.what)}" aria-valuenow="${Math.round(r.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(4, Math.round(r.progress * 100))}%;animation:none"></i></div>` : html`<div class="bar" role="progressbar" aria-label="${esc(r.what)}" aria-valuetext="Running"><i></i></div>`}
		<div class="acts"><span class="sp"></span>${r.code ? B('Open on your computer', 'rowact', { sm: true, ic: 'pc', v: `continue ${r.code}`, verb: `continue ${r.code}`, aria: html`data-key="row:${esc(r.code)}"` }) : ''}</div>${r.code ? rowState(`row:${r.code}`) : ''}</article>`)}`

// How often a watch checks, and until when; both change from here (B19).
function timing(w: Timed): H {
	if (!w.every || env.snap) return ''
	const opts = INTERVALS.some(([m]) => m === w.every) ? INTERVALS : [...INTERVALS, [w.every, `${w.every} min`] as [number, string]].sort((a, b) => a[0] - b[0])
	const ends = w.endsAt ? html`<span class="m">until ${esc(new Date(w.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>${B('Extend 7 days', 'rowact', { sm: true, ghost: true, v: `extend ${w.code}`, verb: `extend ${w.code}`, aria: html`data-key="row:${esc(w.code)}"` })}` : ''
	return html`<div class="timing"><label class="m">Every <select data-every="${esc(w.code)}" aria-label="How often ${esc(w.code)} checks">${opts.map(([m, l]) => html`<option value="${m}m"${m === w.every ? raw(' selected') : ''}>${esc(l)}</option>`)}</select></label>${ends}</div>`
}

export function ongoingView(): H {
	const ups = V.watching.filter(w => w.update), rest = V.watching.filter(w => !w.update)
	const btn = (w: { code: string }, label: string, verb: string, o = {}) => B(label, 'rowact', { sm: true, v: `${verb} ${w.code}`, verb: `${verb} ${w.code}`, aria: html`data-key="row:${esc(w.code)}"`, ...o })
	// When it should be done by, and when it is looked at next, so a quiet watch still says it is alive.
	const plan = (w: Watched) => [w.by ? `By ${new Date(`${w.by}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : '', w.nextAt && Date.parse(w.nextAt) > Date.now() ? `next check ${when(w.nextAt)}` : '', w.from ? `from ${w.from}` : ''].filter(Boolean).join(' · ')
	const card = (w: Watched) => html`<article class="wcard" aria-labelledby="w-${esc(w.code)}"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2)">${I('eye')}</span><div class="c-who"><h3 id="w-${esc(w.code)}">${esc(w.what)}</h3><span class="m">${esc([w.changedAt ? `Changed ${when(w.changedAt)}` : '', plan(w)].filter(Boolean).join(' · '))}</span></div><span class="code">${esc(w.code)}</span></div>
		<div class="chg"><span class="tag ok">${esc(w.last)}</span></div>
		${timing(w)}<div class="acts">${U(`row:${w.code}`).msg ? '' : html`${btn(w, 'Got it', 'ok', { primary: true })}${btn(w, 'Stop watching', 'skip', { ghost: true })}`}</div>${rowState(`row:${w.code}`)}</article>`
	const wait = html`${(V.waiting || []).map(w => html`<article class="wcard" aria-labelledby="wt-${esc(w.code)}"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2)">${I('clock')}</span><div class="c-who"><h3 id="wt-${esc(w.code)}">You asked ${esc(w.to)}</h3><span class="m">${esc(w.chat)} · ${esc(when(w.at))}${w.link ? html` · <a href="${esc(w.link)}" target="_blank" rel="noopener">Open in Teams</a>` : ''}</span></div><span class="code">${esc(w.code)}</span></div>
		<blockquote class="ask">${esc(w.text.length > 280 ? w.text.slice(0, 280) + '…' : w.text)}</blockquote>
		<div class="acts">${U(`row:${w.code}`).msg ? '' : html`${btn(w, 'Follow up', 'ok', { primary: true })}${btn(w, 'Dismiss', 'skip', { ghost: true })}`}</div>${rowState(`row:${w.code}`)}</article>`)}`
	const prog = html`${(V.progress || []).map(w => html`<li class="row" data-code="${esc(w.code)}">${av(w.who)}<div class="rt"><b>${esc(w.goal)}</b><span class="m">${esc([w.code, w.who.name, w.status].join(' · '))}</span>${w.last ? html`<span class="m">Last: ${esc(w.last.what.length > 160 ? w.last.what.slice(0, 160) + '…' : w.last.what)} · ${esc(when(w.last.at))}</span>` : ''}${w.checkAt ? html`<span class="m">I'll ask you on ${esc(new Date(w.checkAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} if nothing happens</span>` : ''}${timing(w)}${rowState(`row:${w.code}`)}</div>${U(`row:${w.code}`).msg ? '' : btn(w, 'Close', 'close', { ghost: true })}</li>`)}`
	const run = runningRows(), autos = html`${V.automations.map(autoRow)}`
	return html`${banners()}${listHead('Ongoing', `Work still in progress, your asks nobody has answered, what ${env.name} watches or is doing now, and your reminders.`, env.snap ? '' : B('New automation', 'newauto', { ghost: true, ic: 'plus' }))}
		${prog ? html`<h2 class="section-h" style="margin-top:6px">In progress</h2><p class="m" style="margin:-4px 0 10px">Replied, and the work goes on. News comes back to the same item.</p><ul class="rows">${prog}</ul>` : ''}
		${wait ? html`<h2 class="section-h" style="margin-top:6px">Waiting on others</h2><p class="m" style="margin:-4px 0 10px">No answer for a day. Follow up drafts a short nudge for you to check first.</p><div class="grid2">${wait}</div>` : ''}
		${ups.length ? html`<h2 class="section-h" style="margin-top:6px">${esc(plural(ups.length, 'update'))}</h2><div class="grid2">${ups.map(card)}</div>` : ''}
		${rest.length ? html`<h2 class="section-h">No change</h2><ul class="rows">${rest.map(w => html`<li class="row"><span class="ri">${I('eye')}</span><div class="rt"><b>${esc(w.what)}</b><span class="m">${esc(w.last)}</span>${plan(w) ? html`<span class="m">${esc(plan(w))}</span>` : ''}${timing(w)}${rowState(`row:${w.code}`)}</div><span class="code">${esc(w.code)}</span>${U(`row:${w.code}`).msg ? '' : btn(w, 'Stop watching', 'skip', { ghost: true })}</li>`)}</ul>` : ''}
		${(V.channels || []).length ? html`<h2 class="section-h">Channels</h2><ul class="rows">${V.channels.map((c, i) => html`<li class="row"><span class="ri">${I('eye')}</span><div class="rt"><b>${esc(c.name)}</b><span class="m">Threads you start, post in, or are mentioned in</span>${rowState(`row:ch${i}`)}</div>${U(`row:ch${i}`).msg ? '' : B('Stop watching', 'rowact', { sm: true, ghost: true, v: `unwatch ${c.link}`, verb: `unwatch ${c.link}`, aria: html`data-key="row:ch${i}"` })}</li>`)}</ul>` : ''}
		${run ? html`<h2 class="section-h" id="running">Running</h2><p class="m" style="margin:-4px 0 10px">Long work ${esc(env.name)} is doing now. It tells you when each one is ready.</p><div class="grid2">${run}</div>` : ''}
		${autos ? html`<h2 class="section-h" id="automations">Automations</h2><p class="m" style="margin:-4px 0 10px">Each one carries the assistant marker and stops when ${esc(env.name)} is paused.</p><ul class="rows" style="max-width:880px">${autos}</ul>` : ''}
		${V.watching.length || (V.waiting || []).length || (V.channels || []).length || (V.progress || []).length || run || autos ? '' : raw(`<p class="empty">Nothing is ongoing. Say "watch PR 1234 until merged", or "remind Arun every weekday at 4 pm to update the doc".</p>`)}${S.sheet ? sheet() : ''}`
}
