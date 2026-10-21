// One row on Now (design-spec/new-experience.md §5): the headline, the facts, "Next:", its markers, and its one action.
// The server built every word (src/web/next.ts); this draws it and says times in the owner's time.
import { FRESH_TEXT, freshOf, rowMark } from '../../model/derive.ts'
import { plural, when } from '../../model/format.ts'
import type { NextRow, Owner } from '../../model/types.ts'
import { S, U, V, cardOf, env } from '../../state/store.ts'
import { card } from '../classic/card.ts'
import { av, rowState } from '../classic/parts.ts'
import { esc, html, join, raw, type H } from '../html.ts'
import { I } from '../icons.ts'
import { onDay, owned } from './item.ts'

const ICON: Partial<Record<NextRow['kind'], string>> = { working: 'bolt', scheduled: 'clock', watch: 'eye', 'waiting-delegate': 'clock', reminder: 'clock', 'reminder-new': 'clock', catchup: 'eye', stopped: 'warn' }
const TONE: Partial<Record<string, string>> = { changed: 'accent', retrying: 'warn', held: 'warn', worth: 'accent', new: 'accent', back: 'accent' }

// "Next:" says who, in fixed words: the owner, Delegate (what it will do), a person or condition in the AI's words, or nobody.
// A time in it comes as a timestamp and is said here in the owner's time.
export function nextLine(r: NextRow): string {
	const n = r.next
	if (!n) return ''
	const o: Owner = n.owner, w = n.what?.replace(/\s+/g, ' ').trim().replace('{at}', n.at ? when(n.at) : 'soon')
	if (o.kind === 'others') return o.text.replace(/\s+/g, ' ').trim()
	if (o.kind === 'nobody') return w ?? `nobody has started this; Do it now hands it to ${env.name}`
	if (o.kind === 'you') return w ? `You: ${w}` : 'You'
	if (!w) return env.name
	return /^(after|back)\b/.test(w) ? w : `${env.name} ${w}`
}

// "today", "yesterday", "Mon", or a date when it is more than a week ago.
const day = (iso: string) => { const d = new Date(iso), at = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), n = Math.round((at(new Date()) - at(d)) / 86_400_000); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) }
// "until Fri", or a date when it is more than a week away.
const until = (iso: string) => { const d = new Date(iso), days = (d.getTime() - Date.now()) / 86_400_000; return `until ${days < 6.5 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })}` }

// who · where · one time with its verb. Words someone wrote are in quotation marks after who wrote them; a note is unquoted,
// after its label (PM review P0-2).
function facts(r: NextRow): H {
	const f = r.facts, q = f.quote, time = f.verb ? `${f.verb} ${when(f.at)}` : ''
	const ownQuote = !!q && q.by === f.who && q.verb === f.verb
	const parts: H[] = [
		// A to-do: "You promised Rita on Mon · no tool can do it" (R-NEX-07).
		...(f.promise?.to ? [esc(`You promised ${f.promise.to} ${onDay(f.promise.at)}`)] : []), ...(f.promise?.why ? [esc(f.promise.why)] : []),
		...(f.who ? [esc(f.who)] : []), ...(f.where ? [esc(f.where)] : []),
		...(r.when ? [esc(`starts ${when(r.when)}`)] : []),
		// One time with its verb: "asked 9:10 AM: …" for the person on the row, "You said 9:10 AM: …" for someone else.
		...(ownQuote ? [html`${esc(time)}: <span class="nquo">"${esc(q!.text)}"</span>`] : q && q.verb === f.verb ? [] : time ? [esc(time)] : []),
		...(q && !ownQuote ? [html`${esc(`${q.by} ${q.verb}${q.verb === f.verb && time ? ` ${when(f.at)}` : ''}`)}: <span class="nquo">"${esc(q.text)}"</span>`] : []),
		...(f.notes ?? []).map(n => html`<span class="nl2">${esc(n.label)}${n.at ? esc(` ${when(n.at)}`) : ''}:</span> ${esc(n.text)}${n.since ? esc(` since ${day(n.since)}`) : ''}`),
		...(f.until ? [esc(until(f.until))] : []),
		...(f.also ? [esc(`+${plural(f.also, 'chat')}`)] : []),
	]
	return html`<div class="nf">${join(parts, raw(' · '))}${r.teams && !env.snap ? html` <a class="ext" href="${esc(r.teams)}" target="_blank" rel="noopener" aria-label="Open in Teams">${I('ext', 'sm')}</a>` : ''}</div>`
}

// Only Your move's actions are filled: elsewhere nothing waits on the owner, so nothing shouts.
function action(r: NextRow, a: NonNullable<NextRow['primary']>, main: boolean, open: boolean): H {
	const primary = main && r.section === 'move'
	const busy = U(`row:${r.act}`).status === 'pending'
	if (!a.command) return env.snap ? '' : html`<a class="btn sm${primary && !open ? raw(' primary') : ''}" href="${open ? raw('#now') : html`#now/${esc(r.act)}`}"${open ? raw(' aria-expanded="true"') : raw(' aria-expanded="false"')}>${esc(open ? 'Hide' : a.label)}</a>`
	if (a.command.includes('{text}')) return ''
	if (env.snap) return html`<span class="verb${primary ? raw(' primary') : ''}">${esc(a.command)}</span>`
	// Paused, nothing is sent: a Send says so and waits; the banner's Resume is the one action (PM review 3).
	const held = !!V.next?.paused && main && (r.kind === 'reply' || r.kind === 'holding') && /^ok /.test(a.command)
	if (held) return html`<button class="btn sm" disabled aria-label="${esc(`${a.label}: paused, nothing is sent`)}"><span class="bl">Paused</span></button>`
	return html`<button class="btn sm${primary ? raw(' primary') : main ? '' : raw(' ghost')}" data-act="nact" data-v="${esc(a.command)}"${busy || (primary && S.offline) ? raw(' disabled') : ''}><span class="bl">${esc(a.label)}</span></button>`
}

// Your step on work: what you did goes back to Delegate through the answer path; nothing is sent to anyone first.
function tell(r: NextRow): H {
	const a = r.primary
	if (!a?.command?.includes('{text}') || env.snap) return a?.command?.includes('{text}') ? html`<span class="verb">${esc(a.command.replace('{text}', '<what you did>'))}</span>` : ''
	const u = U(`tell:${r.act}`)
	return html`<form class="ntell" data-form="tell" data-code="${esc(r.act)}" data-cmd="${esc(a.command)}" aria-label="${esc(a.label)}"><label class="sr" for="tell-${esc(r.act)}">What you did or found, for ${esc(env.name)}</label><input id="tell-${esc(r.act)}" data-tell="${esc(r.act)}" placeholder="What did you find?" autocomplete="off" value="${esc(u.answer)}"${S.offline ? raw(' disabled') : ''}><button class="btn sm primary" type="submit"${!u.answer.trim() || S.offline ? raw(' disabled') : ''}>${esc(a.label)}</button></form>`
}

// The opened row: the owned work and to-dos (N2), then the classic card when there is one to act on.
function ncard(r: NextRow, c: ReturnType<typeof cardOf>): H {
	const own = owned(r, !!c)
	if (c) return html`${own ? html`<div class="ncard">${own}</div>` : ''}<div class="ncard">${card(c as never, false, { work: !own })}</div>`
	if (own) return html`<div class="ncard">${own}</div>`
	return html`<p class="m ncard">${esc(`${r.act} has no card to open here.`)}${r.teams ? html` <a href="${esc(r.teams)}" target="_blank" rel="noopener">Open in Teams</a>` : ''}</p>`
}

export function row(r: NextRow, open: boolean): H {
	const c = open ? cardOf(r.act) : undefined, icon = ICON[r.kind]
	const lead = r.who && !icon ? av(r.who) : html`<span class="ri">${I(icon ?? 'clock')}</span>`
	// New or Back to you, against the mark this look at Now started with (state/actions.ts viewing).
	const fresh = env.snap ? undefined : freshOf(r, S.nowLook?.[r.act] ?? rowMark(V, r))
	const chips = [...(fresh ? [{ kind: fresh, text: FRESH_TEXT[fresh] }] : []), ...r.chips].map(ch => html`<span class="tag ${raw(TONE[ch.kind] ?? '')}${ch.kind === 'new' || ch.kind === 'back' ? raw(` fresh-${ch.kind}`) : ''}">${esc(ch.text)}</span>`)
	const nx = nextLine(r)
	const acts = U(`row:${r.act}`).msg ? '' : html`${r.primary ? action(r, r.primary, true, open) : ''}${(r.more ?? []).map(m => action(r, m, false, false))}`
	return html`<li class="nrow k-${raw(r.kind)}${open ? raw(' open') : ''}" id="now-${esc(r.act)}" data-code="${esc(r.act)}"${r.rev ? html` data-rev="${esc(r.rev)}"` : ''}>
		<div class="nmain">${lead}<div class="nrbody">
			<div class="nh"><b class="nt">${esc(r.headline)}</b>${chips}<span class="code">${esc(r.act)}</span></div>
			${facts(r)}
			${r.draft ? html`<blockquote class="nd">${esc(r.draft)}</blockquote>` : ''}${r.gist ? html`<p class="ng">${esc(r.gist)}</p>` : ''}
			${r.warn ? html`<div class="nwarn">${I('warn', 'sm')}<span>${esc(r.warn)}</span></div>` : ''}
			${nx ? html`<div class="nn"><span>Next: ${esc(nx)}</span></div>` : ''}
			${open && r.work?.report ? '' : tell(r)}${rowState(`row:${r.act}`)}
		</div>${acts ? html`<div class="nract">${acts}</div>` : ''}</div>
		${open ? ncard(r, c) : ''}
	</li>`
}
