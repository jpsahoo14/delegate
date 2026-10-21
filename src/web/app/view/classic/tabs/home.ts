// Home: what happened while the owner was away, what needs them, Catch up, a missed-message box, and the version.
import { first, plural, when } from '../../../model/format.ts'
import type { Tile } from '../../../model/types.ts'
import { S, V, env, openCards } from '../../../state/store.ts'
import { esc, html, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { banners } from '../banners.ts'
import { B, av } from '../parts.ts'
import { cuRow } from './done.ts'

const TILE_ICON: Record<string, string> = { replies: 'reply', reviews: 'pr', tasks: 'task', prs: 'pr', invites: 'cal', reminders: 'clock', knowledge: 'book', watching: 'eye', waiting: 'clock', running: 'bolt', automations: 'clock', learned: 'book', suggestions: 'bolt' }
const TILE_HREF: Record<string, string> = { replies: '#done/replies', reviews: '#done/reviews', tasks: '#done/changes', prs: '#done/changes', invites: '#done/changes', reminders: '#done/reminders', knowledge: '#knowledge', watching: '#ongoing', waiting: '#ongoing', running: '#ongoing/running', automations: '#ongoing/automations', learned: '#done/learned', suggestions: '#settings/learned' }
// A tile's label reads as a sentence with its number in bold.
const sentence = (t: Tile): H => { const m = /^(.*?)(\d+)(.*)$/.exec(t.label); return m ? html`${esc(m[1])}<b>${raw(m[2])}</b>${esc(m[3])}` : html`<b>${t.count}</b> ${esc(t.label)}` }

// A message it should have picked up: paste its link, and it becomes an item with why it was missed (B21).
function missedForm(): H {
	if (env.snap) return raw(`<p class="ver">Missed a message? In your self-chat, say <span class="verb">missed &lt;Teams message link&gt;</span>.</p>`)
	return html`<form class="askf missf" data-form="missed" aria-label="Missed a message"><label class="sr" for="missin">Paste the Teams link of a message ${esc(env.name)} missed</label><input id="missin" placeholder="Missed a message? Paste its Teams link here" autocomplete="off" value="${esc(S.missedLink || '')}"${S.offline ? raw(' disabled') : ''}><button class="btn sm ghost" type="submit"${S.offline || S.missing ? raw(' disabled') : ''}>${S.missing ? raw('<span class="spin" aria-hidden="true"></span>') : ''}Make an item</button></form>`
}
// The running version, whether it updates by itself, and a way to check now (dogfood: "an update button").
function versionLine(): H {
	const v = V.version
	if (!v?.code || env.snap) return ''
	const st = S.checking ? '' : v.failed ? `Could not check: ${v.failed}` : v.last?.rolledBack && v.last.to !== v.code ? `${v.last.to} did not start, so this stays on ${v.code}` : v.checkedAt ? `Up to date, checked ${when(v.checkedAt)}` : 'Not checked yet'
	const how = v.channel === 'off' ? 'Updates when you check' : `${v.channel === 'release' ? 'Updates to each release' : 'Updates to every change'}, ${v.everyMin >= 1440 ? 'checked once a day' : v.everyMin >= 60 ? 'checked every hour' : `checked every ${v.everyMin || 10} minutes`}`
	return html`<p class="ver"><span>Version ${esc(v.tag ? `${v.tag} (${v.code})` : v.code)}</span><span>${esc(how)}</span>${st ? html`<span>${esc(st)}</span>` : ''}${B(S.checking ? 'Checking…' : 'Check for updates', 'checkupdate', { sm: true, ghost: true, busy: S.checking })}${B('Report a problem', 'reportopen', { sm: true, ghost: true })}</p>${S.reporting ? html`<form class="markf missf" data-form="report" aria-label="Report a problem"><label class="sr" for="repin">What went wrong</label><textarea id="repin" class="edit" rows="3" placeholder="What went wrong, and what should it have done?"></textarea><div class="markacts"><button class="btn sm primary" type="submit"${S.offline ? raw(' disabled') : ''}>Send to the feedback log</button>${B('Cancel', 'reportcancel', { sm: true, ghost: true })}</div></form>` : ''}`
}
// Home's Catch up: up to 3 new lines, worth knowing first, each opening Teams; one tap to all (design-spec/done-v2.md).
function catchUpCard(): H {
	const c = V.catchUp
	if (!c?.count) return ''
	const more = c.count - c.top.length
	return html`<div class="also-hrow"><h2 class="also-h">Catch up · ${c.count} new</h2>${env.snap ? '' : B('Mark all read', 'seenall', { sm: true, ghost: true, v: 'catchup' })}</div><div class="catchup"><ul class="rows">${c.top.map(r => cuRow(r, true))}</ul><a class="mini-more" href="#done/catchup">${more > 0 ? html`${more} more · ` : ''}See all</a></div>`
}
export function home(): H {
	const o = openCards(), tiles = V.tiles.filter(t => t.key !== 'needs')
	const handled = tiles.reduce((n, t) => n + t.count, 0)
	const need = o.length ? html`<div class="tile need" role="group" aria-labelledby="need-h">
			<div class="need-head"><span class="big tnum">${o.length}</span><span class="lbl" id="need-h">${esc(o.length === 1 ? 'needs you' : 'need you')}</span></div>
			<ul class="peek">${o.slice(0, 4).map(c => html`<li><a href="#focus/${esc(c.code)}">${av(c.who, 'sm')}<span class="nm">${esc(first(c.who.name))}</span><span class="ps">${esc(c.question || c.ask || c.job || '')}</span></a></li>`)}</ul>
			<div class="foot">${env.snap ? '' : html`<a class="btn primary" href="#focus/${esc(o[0].code)}">Start with ${esc(first(o[0].who.name))} ${I('arrow')}</a>`}<span class="more">${o.length > 4 ? html`and ${o.length - 4} more` : ''}</span></div></div>`
		: html`<div class="tile need" role="group"><span class="ti" style="background:var(--success-soft);color:var(--success)">${I('check')}</span><span class="big" style="font-size:22px">All clear</span><span class="lbl">Nothing needs you.</span></div>`
	return html`${banners()}
	<section class="hello" aria-labelledby="hello-h"><h1 id="hello-h">Since you were away</h1><p>${V.since ? html`You left ${esc(when(V.since))}` : esc('In the last day')}${handled ? html` · ${esc(env.name)} handled ${esc(plural(handled, 'thing'))} for you` : ''}</p></section>
	<div class="tiles">${need}${tiles.map(t => html`<a class="tile" href="${raw(TILE_HREF[t.key] || '#done')}" aria-label="${esc(t.label)}"><span class="ti">${I(TILE_ICON[t.key] || 'check')}</span><span class="go">${I('arrow')}</span><span class="sent">${sentence(t)}</span>${t.sub ? html`<span class="sub">${esc(t.sub)}</span>` : ''}</a>`)}</div>
	${catchUpCard()}
	${V.also.length ? html`<h2 class="also-h">Also for you</h2><div class="also">${V.also.map(t => html`<a class="mini" href="${raw(String(TILE_HREF[t.key]))}"><span class="ti">${I(TILE_ICON[t.key])}</span><div><b>${t.count || !t.sub ? html`${t.count} ${esc(t.label)}` : esc(t.sub)}</b>${t.count && t.sub ? html`<span>${esc(t.sub)}</span>` : ''}</div></a>`)}</div>` : ''}${missedForm()}${versionLine()}`
}
