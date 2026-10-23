// Needs you: the queue on the left, one card at a time, Previous and Next, and the keys for it.
import { first } from '../../../../model/format.ts'
import { S, openCards, queue } from '../../../state/store.ts'
import { esc, html, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { banners } from '../banners.ts'
import { card, primary } from '../card.ts'
import { av, kbd } from '../parts.ts'

export function focus(enter?: boolean): H {
	const o = openCards(), q = queue()
	const cur = q.find(c => c.code === S.cur) || o[0]
	if (!cur) return html`${banners()}<div class="stage" style="margin:40px auto"><div class="alldone"><div class="ok">${I('check', 'lg')}</div><h2>That’s everything</h2><p>${S.done.size ? html`${S.done.size} handled. ` : ''}Nothing else needs you.</p><div class="acts" style="justify-content:center"><a class="btn primary" href="#home">Back to Home</a><a class="btn" href="#done">See what was done</a></div></div></div>`
	// The card the queue is on was settled before drawing (state/actions.ts viewing()); this only draws it.
	const pos = o.indexOf(cur), n = o.length
	const rows = q.map(c => { const d = S.done.has(c.code); return html`<li><button class="qrow${d ? raw(' done') : ''}" data-act="goto" data-v="${esc(c.code)}" aria-current="${c.code === cur.code}">${d ? html`<span class="chk">${I('check', 'sm')}</span>` : av(c.who, 'sm')}<span class="qt"><span class="qn">${esc(first(c.who.name))}<span class="code">${esc(c.code)}</span></span><span class="qs">${esc(c.question || c.ask || '')}</span></span></button></li>` })
	return html`${banners()}<div class="focus">
		<nav class="queue" aria-label="Needs you queue"><h2><span>Needs you</span><span class="tnum">${n}</span></h2><ol>${rows}</ol></nav>
		<div class="stage"><div class="pager">
			<a class="btn ghost sm icon" href="#home" aria-label="Back to Home">${I('back')}</a><span class="sp"></span>
			<button class="btn sm" data-act="prev" aria-label="Previous item"${pos <= 0 ? raw(' disabled') : ''}>${I('left')}<span class="lbl-txt">Previous</span></button>
			<span class="of tnum">${esc(pos < 0 ? `${n} left` : `${pos + 1} of ${n}`)}</span>
			<button class="btn sm" data-act="next" aria-label="Next item"${(pos < 0 ? !n : pos >= n - 1) ? raw(' disabled') : ''}><span class="lbl-txt">Next</span>${I('right')}</button>
			<span class="sp"></span><button class="btn ghost sm icon" data-act="keys" aria-label="Keyboard shortcuts">${I('key')}</button></div>
		${card(cur, enter)}
		${S.done.has(cur.code) ? '' : html`<div class="hints"><span>${kbd('j')} next</span><span>${kbd('k')} previous</span><span>${kbd('⌘')}${kbd('↵')} ${esc(primary(cur).label.toLowerCase())}</span><span>${kbd('a')} ask</span><span>${kbd('l')} later</span><span>${kbd('?')} all keys</span></div>`}</div></div>`
}
