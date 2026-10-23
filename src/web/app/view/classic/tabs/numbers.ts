// Numbers: is Delegate handling more of the owner's asks, correctly, without missing any? (R-NEX-11, design-spec/north-star-tab.md)
// Drawn from S.num, which state/numbers.ts fills when the tab opens and when its window changes. Every number is a link to
// #numbers/<list>, which shows exactly the rows it counted, in Done's row format.
import { RULES, WINDOWS, WINDOW_LABEL, listsOf, numbersModel, type Bar, type Card, type Link, type List, type NumbersModel, type RuleKey } from '../../../../model/numbers.ts'
import { when } from '../../../../model/format.ts'
import type { NumbersPage } from '../../../../model/types.ts'
import { S, env } from '../../../state/store.ts'
import { hasNumbers } from '../../../state/numbers.ts'
import { esc, html, join, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { B, listHead } from '../parts.ts'
import { row as doneRow } from './done.ts'

const num = (l: Link, cls = ''): H => l.key ? html`<a class="num-link ${raw(cls)}" href="#numbers/${esc(l.key)}">${esc(l.text)}</a>` : html`<span class="${raw(cls)}">${esc(l.text)}</span>`
const line = (ls: Link[]): H => join(ls.map(l => num(l)), raw(' · '))
const how = (k: RuleKey): H => html`<details class="num-how" data-how="${raw(k)}"${S.num.how.has(k) ? raw(' open') : ''}><summary>How is this counted?</summary><p>${esc(RULES(env.name)[k])}</p></details>`

function bar(b: Bar): H {
	const cls = ['num-bar', b.before && 'before', b.gaps.length && 'gap', b.now && 'now'].filter(Boolean).join(' ')
	const days = html`<span class="num-days" aria-hidden="true">${b.days.map(off => html`<i${off ? raw(' class="off"') : ''}></i>`)}</span>`
	const inner = html`<span class="num-bn" aria-hidden="true">${b.before ? '' : b.n}</span><span class="num-col" aria-hidden="true"><span class="num-fill" style="height:${b.height}%"></span></span>${days}<span class="num-bw" aria-hidden="true">${esc(b.label)}</span>`
	return html`<li class="${raw(cls)}">${b.key ? html`<a class="num-bin" href="#numbers/${esc(b.key)}" aria-label="${esc(b.alt)}">${inner}</a>` : html`<span class="num-bin" role="img" aria-label="${esc(b.alt)}">${inner}</span>`}</li>`
}

function card(c: Card): H {
	const pct = c.meter ? Math.round((c.meter.n / c.meter.of) * 100) : 0
	return html`<section class="num-card" aria-labelledby="numh-${raw(c.rule)}"><h3 class="num-t" id="numh-${raw(c.rule)}">${esc(c.title)}</h3>
		<p class="num-main">${num(c.main)}</p>${c.meter ? html`<div class="num-meter" role="img" aria-label="${esc(`${c.meter.n} of ${c.meter.of} as drafted`)}"><i style="width:${pct}%"></i></div>` : ''}
		<ul class="num-lines">${c.lines.map(l => html`<li>${line(l)}</li>`)}<li class="num-four">${num(c.four)}</li></ul>${how(c.rule)}</section>`
}

function main(m: NumbersModel): H {
	const h = m.handled
	return html`<section class="num-card num-hero" aria-labelledby="numh-handled">
		<h2 class="num-t" id="numh-handled">Handled for you</h2>
		<div class="num-head"><span class="num-big">${num(h.main)}</span>${h.trend ? html`<span class="num-trend${h.trend.dir ? raw(` ${h.trend.dir}`) : ''}">${esc(h.trend.text)}</span>` : ''}</div>
		${how('handled')}
		<ol class="num-bars" aria-label="Handled for you per week, the last 8 weeks">${m.bars.map(bar)}</ol>
		<p class="num-note">The last 8 weeks${m.gapNote ? html` · <span class="num-hatch" aria-hidden="true"></span> ${esc(m.gapNote)}` : ''}</p>
		${how('bars')}
		<p class="num-kinds">${line(h.kinds)}</p>
		${h.check || h.all ? html`<p class="num-row">${h.check ? num(h.check) : ''}<span class="sp"></span>${h.all ? html`<a class="num-link num-all" href="#numbers/${esc(h.all.key)}">${esc(h.all.text)} ${I('right', 'sm')}</a>` : ''}</p>${h.check ? how('check') : ''}` : ''}
	</section>
	<div class="num-cards">${m.cards.map(card)}</div>
	<section class="num-card num-foot" aria-label="Guardrails">
		<p><b>Corrections:</b> ${join(m.corrections.map(l => num(l)), '')}</p>${how('corrections')}
		${m.unknown ? html`<p>${num(m.unknown)}</p>${how('unknown')}` : ''}
		<p>${esc(m.promises)}</p>${how('promises')}
		<div class="num-copy">${B('Copy a summary', 'numcopy', { sm: true })}<span class="m">numbers only, no names and no message text</span></div>
		<details class="num-how" data-how="copy"${S.num.how.has('copy') ? raw(' open') : ''}><summary>See what is copied</summary><pre class="num-sum">${esc(m.summary)}</pre></details>
	</section>`
}

// The rows a number counted. An item counted twice (two sends) shows once and says so; a message the owner pointed at that
// never became an item says that no item was made.
function rows(d: NumbersPage, codes: string[]): H {
	const times = new Map<string, number>()
	for (const c of codes) times.set(c, (times.get(c) ?? 0) + 1)
	const one = (c: string): H => {
		const r = d.rows[c], x = d.missed[c], n = times.get(c)!
		const more = n > 1 ? html`<span class="m">Counted ${n} times: once for each send.</span>` : ''
		// Every row here says which item it is, as Done's expandable rows do, so a count can be checked against its codes.
		if (r) { const h = String(doneRow(r)), coded = h.startsWith('<li data-code') ? h : h.replace(/^<li/, `<li data-code="${String(esc(c))}"`); return raw(n > 1 ? coded.replace(/<\/li>$/, `${more}</li>`) : coded) }
		if (c.startsWith('missed:')) return html`<li class="row" data-code="${esc(c)}"><span class="ri">${I('eye')}</span><div class="rt"><b>You pointed at this message. No item was made for it.</b><span class="m">${esc(x ? when(x.at) : '')}${x?.teams && !env.snap ? html` · <a class="ext-in" href="${esc(x.teams)}" target="_blank" rel="noopener">Open in Teams↗</a>` : ''}</span>${more}</div></li>`
		return html`<li class="row" data-code="${esc(c)}"><span class="ri">${I('check')}</span><div class="rt"><b>${esc(c)} is no longer on file</b><span class="m">Its line in the log still counts.</span>${more}</div></li>`
	}
	return html`<ul class="rows">${[...times.keys()].map(one)}</ul>`
}

function list(d: NumbersPage, key: string, l: List | undefined): H {
	const back = html`<a class="num-back" href="#numbers">${I('left', 'sm')}<span>All numbers</span></a>`
	if (!l) return html`${back}<p class="empty">That list is not on this tab.</p>`
	const all = l.groups.flatMap(g => g.codes), shown = l.groups.filter(g => g.codes.length)
	const body = !all.length ? html`<p class="empty">Nothing counted here ${esc(WINDOW_LABEL[d.window.key].toLowerCase())}.</p>`
		: l.groups.length > 1 ? join(shown.map(g => html`<h3 class="section-h">${esc(g.title ?? '')} · ${g.codes.length}</h3>${rows(d, g.keys ?? g.codes)}`), '')
		: rows(d, l.groups.flatMap(group => group.keys ?? group.codes))
	return html`${back}<h2 class="num-list-h" id="num-list" tabindex="-1" data-list="${esc(key)}">${esc(l.title)} <span class="tnum">${all.length}</span></h2>${body}`
}

export function numbersView(): H {
	const name = env.name
	if (!hasNumbers()) return html`${listHead('Numbers', '')}<p class="empty">The numbers open on the live page, not in this copy.</p>`
	const n = S.num, d = n.data, sub = S.route.split('/').slice(1).join('/')
	const range = d && d.window.key === n.win ? /\(([^)]*)\)$/.exec(d.window.label)?.[1] ?? '' : ''
	const pick = html`<label class="num-win"><span class="sr">Window</span><select class="field" id="numwin" data-numwin>${WINDOWS.map(k => html`<option value="${raw(k)}"${k === n.win ? raw(' selected') : ''}>${esc(WINDOW_LABEL[k])}</option>`)}</select></label>${range ? html`<span class="num-range m">${esc(range)}</span>` : ''}`
	const head = listHead('Numbers', `Counted from ${name}'s own log on all your machines. Nothing is estimated.`, html`<span class="num-pick">${pick}</span>`)
	const state = n.failed ? 'failed' : d && !n.busy ? 'ready' : 'loading'
	const body = n.failed
		? html`<div class="empty num-fail" role="alert"><p><b>Could not load the numbers.</b> ${esc(name)} could not be reached from this page, so nothing was counted. Nothing is lost: they load when you open this tab or change the window.</p>${B('Try again', 'numretry', { sm: true })}</div>`
		: !d ? html`<p class="empty" role="status">Counting…</p>`
		: sub ? (() => { const lists = listsOf(d); return list(d, sub, Object.hasOwn(lists, sub) ? lists[sub] : undefined) })()
		: main(numbersModel(d, name))
	return html`<div class="numbers" data-state="${raw(state)}"${n.busy ? raw(' aria-busy="true"') : ''}>${head}${body}</div>`
}
