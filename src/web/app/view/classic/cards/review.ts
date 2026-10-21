// A review: the changes to make, each one checked by default, then the reply.
import { plural } from '../../../model/format.ts'
import type { CardUi, ItemCard } from '../../../model/types.ts'
import { env } from '../../../state/store.ts'
import { esc, html, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { draftBlock, meaningLine } from './blocks.ts'

export function body(c: ItemCard, u: CardUi): H {
	const on = u.cmts ?? new Set(c.changes.map(x => x.n))
	return html`${c.question ? html`<p class="q">${esc(c.question)}</p>` : ''}${c.job ? html`<p class="rv-sum">${I('pr', 'sm')}<b>${esc(c.job)}</b><span>· ${esc(plural(c.changes.length, 'finding'))}</span></p>` : ''}
			<div class="lbl-row"><span>Changes to make</span><span class="sp"></span><span style="text-transform:none;letter-spacing:0;font-weight:500">${on.size} of ${c.changes.length} selected</span></div>
			<ul class="cmts">${c.changes.map(x => html`<li><label class="cmt"><input type="checkbox" id="cm-${esc(c.code)}-${x.n}" data-cmt="${x.n}"${on.has(x.n) ? raw(' checked') : ''}${env.snap ? raw(' disabled') : ''}><span class="mk">${I('check')}</span><span class="cb"><span class="loc">${esc(x.target)}<span class="tag">${esc(x.system)}</span></span><p>${esc(x.summary)}</p>${meaningLine(x.meaning)}${x.detail ? html`<pre>${esc(x.detail)}</pre>` : ''}</span></label></li>`)}</ul>${draftBlock(c, u)}`
}
