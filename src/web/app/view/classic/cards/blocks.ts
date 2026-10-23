// Pieces the card types share: the draft, the context lines, the options to pick, the meeting, and what else a send does.
import { time, whoOf } from '../../../../model/format.ts'
import type { CardUi, ItemCard } from '../../../../model/types.ts'
import { env } from '../../../state/store.ts'
import { esc, html, join, raw, type H } from '../../html.ts'
import { I } from '../../icons.ts'
import { av } from '../parts.ts'

export function draftBlock(c: ItemCard, u: CardUi, label = c.draft?.holding ? 'Holding reply' : 'Your reply'): H {
	if (!c.draft) return ''
	const canEdit = !env.snap && (c.type === 'reply' || c.type === 'review')
	const head = html`<div class="lbl-row"><span>${esc(label)}</span><span class="sp"></span>${canEdit && !u.editing ? html`<button class="btn ghost sm" data-act="edit">${I('edit', 'sm')}Edit</button>` : ''}</div>`
	const body = u.editing ? html`<label class="sr" for="ed-${esc(c.code)}">Edit your reply</label><textarea class="edit" id="ed-${esc(c.code)}" data-input="text">${esc(u.text ?? c.draft.text)}</textarea>` : html`<div class="draft">${esc(c.draft.text)}</div>`
	const note = c.draft.preview ? html`<p class="draft-note">${I('spark', 'sm')}${esc(c.picked?.length ? 'The reply for your pick' : 'New draft from your answer')}. Not sent yet.</p>` : ''
	const commit = c.draft.commitment ? html`<p class="commit">${I('info', 'sm')}This reply commits you to something. Check the date or promise.</p>` : ''
	// Not the answer: the work fell short, and the status above says why and what was tried.
	const hold = c.draft.holding ? html`<p class="commit">${I('info', 'sm')}Not the answer: the work did not finish. It only tells them you are on it.</p>` : ''
	return html`${head}${body}${note}${commit}${hold}`
}
export const ctx = (c: ItemCard): H => c.context?.length ? html`<ul class="ctx">${c.context.map(f => html`<li class="${f.tone === 'warn' ? raw('warn') : ''}">${I(f.tone === 'warn' ? 'warn' : 'info', 'sm')}<span>${f.label ? html`<b>${esc(f.label)}:</b> ` : ''}${esc(f.text)}</span></li>`)}</ul>` : ''
export function options(c: ItemCard, u: CardUi): H {
	const ch = c.choices!, multi = !!ch.multi, nm = `o-${c.code}`
	const sel = u.pick ?? c.picked ?? []
	const rows = ch.options.map((o, i) => {
		const n = i + 1, on = sel.includes(n) && !u.otherOn, warn = /conflict/i.test(o.note || '')
		return html`<label class="opt ${multi ? raw('multi') : ''}"><input type="${raw(multi ? 'checkbox' : 'radio')}" name="${esc(nm)}" id="${esc(nm)}-${n}" data-opt="${n}"${on ? raw(' checked') : ''}${env.snap || u.status === 'pending' ? raw(' disabled') : ''}><span class="mk">${I('check')}</span>
			<span class="ol"><b>${esc(o.label)}</b>${o.note ? html`<span class="${warn ? raw('warn') : ''}">${warn ? html`${I('warn', 'sm')} ` : ''}${esc(o.note)}</span>` : ''}</span><span class="k" aria-hidden="true">${n}</span></label>`
	})
	const other = ch.other !== false && !env.snap ? html`<label class="opt"><input type="radio" name="${esc(nm)}" id="${esc(nm)}-o" data-opt="other"${u.otherOn ? raw(' checked') : ''}><span class="mk"></span><span class="ol"><b>Other answer…</b><span>Say it in your words. ${esc(env.name)} drafts the reply.</span></span></label>` : ''
	const field = u.otherOn ? html`<div style="margin-top:10px"><label class="sr" for="oth-${esc(c.code)}">Your answer</label><input class="field" id="oth-${esc(c.code)}" data-input="other" placeholder="Say it in your words" value="${esc(u.other)}" autocomplete="off"></div>` : ''
	return html`<fieldset class="opts"><legend class="sr">${esc(ch.prompt || c.question || 'Options')}</legend>${rows}${other}</fieldset>${field}`
}
export function meetingStrip(c: ItemCard): H {
	const m = c.meeting!, s = new Date(m.start), e = new Date(s.getTime() + m.minutes * 60000)
	const day = Math.round((new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000)
	const dl = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
	return html`<div class="mtg"><span class="cal" aria-hidden="true"><small>${esc(s.toLocaleDateString([], { month: 'short' }))}</small><b>${s.getDate()}</b></span><div class="mt"><b>${esc(m.subject)}</b><span>${esc(dl)} ${esc(time(s))} to ${esc(time(e))}</span></div><span class="stack">${m.attendees.slice(0, 3).map(a => av(whoOf(a), 'sm'))}</span></div>`
}
// What a change means, from Azure DevOps, in one quiet line under it: a vote's PR, with "your approval may complete it" as a
// warning, or a deploy's ring (next action, owned work).
type Meaning = NonNullable<ItemCard['changes'][number]['meaning']>
export const meaningLine = (m?: Meaning): H => m?.length ? html`<p class="mean">${join(m.map(p => p.warn ? html`<span class="warn">${I('warn', 'sm')}${esc(p.text)}</span>` : esc(p.text)), raw(' · '))}</p>` : ''
// With a meaning to show, each change is its own line with its meaning under it (review chui P2-2); otherwise one line, as before.
export const alsoLine = (c: ItemCard, ic: string): H => !c.changes.length ? ''
	: c.changes.some(x => x.meaning) ? html`<div class="also-line">${I(ic, 'sm')}<div><b>Also:</b><ul class="also-list">${c.changes.map(x => html`<li>${esc(x.summary)}${meaningLine(x.meaning)}</li>`)}</ul></div></div>`
	: html`<p class="also-line">${I(ic, 'sm')}<span><b>Also:</b> ${esc(c.changes.map(x => x.summary).join('; '))}</span></p>`
export const preview = (c: ItemCard, u: CardUi): H => c.draft?.preview && !u.otherOn ? html`<div class="preview">${draftBlock(c, u)}${alsoLine(c, c.type === 'meeting' ? 'cal' : 'task')}</div>` : ''
// The owner's own words that already went out, and, when checking what they promised failed, why (Slice 3).
export const saidLine = (c: ItemCard): H => c.promise ? html`<p class="also-line">${I('reply', 'sm')}<span><b>You said:</b> "${esc(c.promise.said)}"</span></p>${c.promise.failed !== undefined ? html`<p class="q">Sent. Could not check what your reply promised: ${esc(c.promise.failed)}</p>` : ''}` : ''
// What the reply promises beyond its words: the owner's own to-dos, and the check-back that starts once it is sent (B19).
export const promiseLines = (c: ItemCard): H => html`${c.todos?.length ? html`<p class="also-line">${I('warn', 'sm')}<span><b>Yours to do:</b> ${esc(c.todos.join('; '))}</span></p>` : ''}${c.follow ? html`<p class="also-line">${I('eye', 'sm')}<span><b>Then:</b> watch ${esc(c.follow.target)} every ${c.follow.everyHours} h until ${esc(c.follow.until)}, for up to 7 days. Change it under Watching.</span></p>` : ''}`
