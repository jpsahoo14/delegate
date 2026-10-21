// An open item with work (design-spec/new-experience.md §6, N2): your move, the checklist with who does each step, Report your
// result, and what happened. The server built every word from the work record (src/web/next.ts workOf); this draws it.
import { RESULTS } from '../../model/derive.ts'
import { plural, when } from '../../model/format.ts'
import type { NextRow, Owner } from '../../model/types.ts'
import { S, env, peek } from '../../state/store.ts'
import { esc, html, raw, str, type H } from '../html.ts'
import { B, rowState } from '../classic/parts.ts'
import { I } from '../icons.ts'

const who = (o: Owner) => (o.kind === 'you' ? 'You' : o.kind === 'delegate' ? env.name : o.kind === 'others' ? o.text : 'Nobody')
// "today", "yesterday", "on Mon", or "on Oct 3".
export const onDay = (iso: string) => {
	const d = new Date(iso), at = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), n = Math.round((at(new Date()) - at(d)) / 86_400_000)
	return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `on ${n < 7 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

const markDone = (code: string, seen: string, named: boolean): H => {
	const key = `todo:${code}`, u = peek(key)
	if (env.snap) return html`<span class="verb">${esc(`close ${code}`)}</span>`
	return html`${u.msg ? '' : html`<div class="iacts">${B(named ? `Mark done (${code})` : 'Mark done', 'rowact', { sm: true, v: `close ${code}`, busy: u.status === 'pending', disabled: S.offline, aria: html`data-key="${esc(key)}" data-seen="${esc(seen)}"` })}</div>`}${rowState(key)}`
}

// "Test checkout flows 1 and 2 on staging2. Deploy done 10:05 (build 991)", or "Waiting on Dev: deploy · Then you: test both".
function move(r: NextRow): H {
	const k = r.work, todos = r.todos ?? []
	const lines: H[] = []
	if (k?.yours) { const c = k.yours.check; lines.push(html`<p class="iyours">${esc(k.yours.what.replace(/[.\s]+$/, ''))}.${c ? esc(` ${c.what} done ${when(c.at)} (build ${c.build})`) : ''}</p>`) }
	else if (k?.then) {
		const lead = k.then.owner.kind === 'delegate' ? `${env.name}: ${k.then.what}` : `Waiting on ${who(k.then.owner)}: ${k.then.what}`
		lines.push(html`<p class="ithen">${esc(lead)}${k.then.you ? esc(` · Then you: ${k.then.you}`) : ''}</p>`)
	}
	// Mark done is close on this item: it marks every open to-do done and changes nothing else (R-NEX-07). A to-do row has it already.
	// Each item's to-dos with their own Mark done, close on that item (a part's to-do closes the part's, never the home's). A to-do
	// row already has the button for its own item. Each is keyed on its item, never on the row, so its result line hides neither the
	// row's own buttons nor another item's Mark done (re-review N2 P2-A); it carries the newest to-do it drew (P2-C).
	const codes = [...new Set(todos.map(t => t.code))]
	if (todos.length) lines.push(html`${codes.map(code => html`<ul class="itodos" aria-label="${esc(codes.length > 1 ? `Your to-dos on ${code}` : 'Your to-dos')}">${todos.filter(t => t.code === code).map(t => html`<li><span class="ib" aria-hidden="true"><span class="ring"></span></span><span><b>To do:</b> ${esc(t.text)} <span class="im">${esc(`promised ${onDay(t.at)}${codes.length > 1 ? ` · ${code}` : ''}`)}</span></span></li>`)}</ul>
		${r.kind === 'todo' && code === r.act ? '' : markDone(code, todos.filter(t => t.code === code).map(t => t.at).sort().at(-1)!, codes.length > 1)}`)}`)
	if (!lines.length) return ''
	return html`<section class="isec imove" aria-labelledby="im-${esc(r.act)}"><h3 id="im-${esc(r.act)}">${esc(k?.yours || todos.length ? 'Your move' : 'Next')}</h3>${lines}</section>`
}

// Every plan step with who does it: done ✓, the current step ▸, the rest ○. Steps place nothing; the row's section came from Next.
function checklist(r: NextRow): H {
	const k = r.work
	if (!k?.steps.length) return ''
	return html`<section class="isec" aria-labelledby="ic-${esc(r.act)}"><h3 id="ic-${esc(r.act)}">Checklist</h3><ol class="icheck">${k.steps.map(s => html`<li class="${raw(s.done ? 'done' : s.now ? 'now' : 'todo')}"${s.now ? raw(' aria-current="step"') : ''}>
		<span class="ib" aria-hidden="true">${s.done ? I('check', 'sm') : s.now ? I('right', 'sm') : raw('<span class="ring"></span>')}</span>
		<span class="iw">${esc(s.what)}${s.done ? html`<span class="sr"> (done)</span>` : s.now ? html`<span class="sr"> (current step)</span>` : ''}</span>
		<span class="io">${esc([who(s.owner), s.where, s.build ? `build ${s.build}` : ''].filter(Boolean).join(' · '))}</span></li>`)}</ol></section>`
}

// Report your result: a result, what you saw, and Draft my report. It goes back through the answer path as
// "A30: Issues found: 403 on checkout"; Delegate drafts the report for the home chat, and only ok sends it.
function report(r: NextRow): H {
	const cmd = r.work?.report
	if (!cmd) return ''
	if (env.snap) return html`<section class="isec"><h3>Report your result</h3><span class="verb">${esc(cmd.replace('{result}', RESULTS.join(' | ')).replace('{text}', '<what you saw>'))}</span></section>`
	const u = peek(`result:${r.act}`), pick = u.pick?.[0], busy = peek(`row:${r.act}`).status === 'pending'
	const id = (s: string) => `${s}-${r.act}`
	return html`<section class="isec ireport" aria-labelledby="${raw(id('ir'))}"><h3 id="${raw(id('ir'))}">Report your result</h3>
		<form data-form="result" data-code="${esc(r.act)}" data-cmd="${esc(cmd)}">
		<fieldset class="ires"><legend class="sr">Result</legend>${RESULTS.map((x, i) => html`<label class="ichoice"><input type="radio" id="${raw(`res-${i}-${r.act}`)}" name="${raw(id('res'))}" data-result="${esc(r.act)}" value="${i}"${pick === i ? raw(' checked') : ''}${S.offline ? raw(' disabled') : ''}><span>${esc(x)}</span></label>`)}</fieldset>
		<label class="sr" for="${raw(id('saw'))}">What you saw</label><textarea id="${raw(id('saw'))}" class="edit" rows="2" data-saw="${esc(r.act)}" placeholder="What you saw: errors, IDs, links"${S.offline ? raw(' disabled') : ''}>${esc(u.answer)}</textarea>
		<div class="iacts"><button class="btn sm primary" type="submit"${pick == null || busy || S.offline ? raw(' disabled') : ''}><span class="bl">Draft my report</span></button><span class="im">Nothing is sent. You see the draft first.</span></div></form></section>`
}

function happened(r: NextRow): H {
	const k = r.work
	if (!k?.happened.length) return ''
	return html`<section class="isec" aria-labelledby="ih-${esc(r.act)}"><h3 id="ih-${esc(r.act)}">What happened, newest first${k.total > k.happened.length ? html`<span class="im">${esc(` · last ${plural(k.happened.length, 'step')} of ${k.total}`)}</span>` : ''}</h3><ol class="ihist">${k.happened.map(x => html`<li${x.news ? raw(' class="news"') : ''}><span class="im">${esc(when(x.at))}</span> ${esc(x.what)}</li>`)}</ol></section>`
}

// The opened item's own part. With a card (a draft to approve), the card follows and says what happened; without one, this does.
export function owned(r: NextRow, hasCard: boolean): H {
	const inner = str(html`${move(r)}${checklist(r)}${report(r)}${hasCard ? '' : happened(r)}`)
	return inner ? html`<div class="iown" data-code="${esc(r.act)}">${raw(inner)}</div>` : ''
}
