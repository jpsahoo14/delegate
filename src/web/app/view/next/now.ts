// Now: every open thread once, by whose move it is (design-spec/new-experience.md §4, reviews/pm-n1a.md). Under the tabs, one
// line says what the other sections hold, so the first screen answers the five-second test; on a narrow panel it replaces them.
import { first, mmss, plural, when } from '../../model/format.ts'
import type { DoneRow, NextRow } from '../../model/types.ts'
import { S, U, V, env } from '../../state/store.ts'
import { banners } from '../classic/banners.ts'
import { B, rowState } from '../classic/parts.ts'
import { sheet } from '../classic/sheet.ts'
import { esc, html, join, raw, type H } from '../html.ts'
import { I } from '../icons.ts'
import { row } from './row.ts'
import { sinceOf } from '../../model/derive.ts'
import { find } from '../../model/find.ts'
import { row as doneRow } from '../classic/tabs/done.ts'

type Sec = 'move' | 'working' | 'waiting' | 'catchup'

// Empty sections other than Your move are not drawn: the summary line already says 0.
function section(id: Sec, title: string, count: string, rows: NextRow[], extra: H = '', empty: H = '', foot: H = ''): H {
	if (id !== 'move' && !rows.length) return ''
	const [, sub] = S.route.split('/'), open = id === 'move' || sub === id
	const shown = rows.find(r => r.act === sub || r.code === sub)
	return html`<section class="nsec${open ? raw(' open') : ''}" id="now-${raw(id)}" aria-labelledby="nh-${raw(id)}">
		<div class="nsh"><h2 id="nh-${raw(id)}">${esc(title)}<span class="nc">&nbsp;· ${esc(count)}</span></h2><span class="sp"></span>${extra}</div>
		${rows.length ? html`<ul class="nrows">${rows.map(r => row(r, r === shown))}</ul>` : empty}${foot}</section>`
}

// One summary line (PM review P0-1, N1b): "Since 6:10 PM: replied to 5 (2 by rule) · 1 review · 4 FYIs · 11 handled ›", then
// "Delegate is working on 3 · Waiting 8, 2 changed · Catch up 4, 1 worth a look". Each Since part opens its Done filter and
// "handled" opens Numbers; each section part opens its section.
function summary(): H {
	const n = V.next!, changed = n.waiting.filter(r => r.chips.some(c => c.kind === 'changed')).length
	const sep = raw('<span class="sep" aria-hidden="true"> · </span>')
	const part = (id: Sec, text: string) => html`<a href="#now/${raw(id)}">${esc(text)}</a>`
	const since = sinceOf(V)
	const lead = since.parts.length ? html`<span class="nsince"><span class="nsl">${esc(`Since ${when(since.at)}:`)}</span> ${join(since.parts.map(p => html`<a href="${esc(p.href)}">${esc(p.text)}${p.href === '#numbers' ? raw('<span aria-hidden="true"> ›</span>') : ''}</a>`), sep)}</span>${sep}` : ''
	// The paused tag stays on Working's header only: the banner above already says Delegate is paused (PM verification).
	return html`<p class="nsum" id="nsum">${n.off && !n.paused ? html`<span class="tag warn">${esc(n.off.since ? `${n.off.text} since ${when(n.off.since)}` : n.off.text)}</span>` : ''}${lead}${join([
		part('working', `${env.name} is working on ${n.working.length}`),
		part('waiting', `Waiting ${n.waiting.length}${changed ? `, ${changed} changed` : ''}`),
		part('catchup', `Catch up ${n.catchup.count}${n.catchup.worth ? `, ${n.catchup.worth} worth a look` : ''}`),
	], sep)}</p>`
}

// A reply sent for the owner by a rule, while it can still be taken back (U45). It leaves when the window closes.
function undoStrip(): H {
	const open = (V.done ?? []).filter((r: DoneRow) => r.undoUntil && Date.parse(r.undoUntil) > Date.now())
	return html`${open.map(r => {
		const rule = /by rule (\S+)/.exec(r.by)?.[1], left = Math.max(0, Math.round((Date.parse(r.undoUntil!) - Date.now()) / 1000))
		return html`<div class="nundo" data-code="${esc(r.code)}" role="status"><p>${esc(`Sent for you to ${first(r.who.name)}${rule ? ` (rule ${rule})` : ''}`)}${r.said ? html`<span class="nsaid">: <span class="nquo">"${esc(r.said)}"</span></span>` : ''}</p>${env.snap ? '' : html`<button class="btn sm" data-act="undo" data-v="${esc(r.code)}"${U(`row:${r.code}`).status === 'pending' ? raw(' disabled') : ''}>${I('undo', 'sm')}<span class="bl">Undo <span data-until="${esc(r.undoUntil!)}">${esc(mmss(left))}</span></span></button>`}${rowState(`row:${r.code}`)}</div>`
	})}`
}

// The quiet footer: what classic Home and Ongoing had that Now still needs (PM review 7).
function footer(): H {
	if (env.snap) return ''
	const v = V.version, chans = V.channels ?? []
	const channels = chans.length ? html`<details class="nchan" data-chan${S.chanOpen ? raw(' open') : ''}><summary>${esc(`Channels you named (${chans.length})`)}</summary><ul>${chans.map((c, i) => html`<li>${esc(c.name)} ${U(`row:ch${i}`).msg ? '' : B('Stop', 'rowact', { sm: true, ghost: true, v: `unwatch ${c.link}`, verb: `unwatch ${c.link}`, aria: html`data-key="row:ch${i}"` })}${rowState(`row:ch${i}`)}</li>`)}</ul></details>` : ''
	const ver = v?.code ? esc(`Version ${v.tag ? `${v.tag} (${v.code})` : v.code}`) : ''
	const report = S.reporting ? html`<form class="markf missf" data-form="report" aria-label="Report a problem"><label class="sr" for="repin">What went wrong</label><textarea id="repin" class="edit" rows="3" placeholder="What went wrong, and what should it have done?"></textarea><div class="markacts"><button class="btn sm primary" type="submit"${S.offline ? raw(' disabled') : ''}>Send to the feedback log</button>${B('Cancel', 'reportcancel', { sm: true, ghost: true })}</div></form>` : ''
	return html`<footer class="nfoot" aria-label="More"><div class="nfl">${join([
		B('+ Remind someone', 'tpl', { sm: true, ghost: true, v: 'remind' }), channels, ver,
		B(S.checking ? 'Checking…' : 'Check for updates', 'checkupdate', { sm: true, ghost: true, busy: S.checking }),
		B('Report a problem', 'reportopen', { sm: true, ghost: true }),
	].filter(x => !!x) as H[], raw('<span class="sep" aria-hidden="true"> · </span>'))}</div>${report}</footer>${S.sheet ? sheet() : ''}`
}

// Find (N1b): a person, a chat, a number, or words, across Now and Done; "/" focuses it. A pasted Teams link that is not an item
// yet offers to make it one, through the missed-message command, which replaces the footer's box for it.
function findBox(): H {
	if (env.snap) return ''
	return html`<form class="nfind" data-form="find" role="search" aria-label="Find"><label class="sr" for="find">Find a person, chat, PR or number, or paste a Teams link</label><input id="find" type="search" placeholder="Find a person, a number, or paste a Teams link" autocomplete="off" spellcheck="false" value="${esc(S.find ?? '')}"><kbd class="nk" aria-hidden="true">/</kbd></form>`
}
function found(): H {
	const q = (S.find ?? '').trim(), f = find(V, q)
	const make = f.link && !f.link.item ? html`<div class="nfl-make" role="group" aria-label="Not an item yet"><p>${esc(`This message is not an item yet. ${env.name} reads it and drafts what it needs, as for any ask.`)}</p><button class="btn sm primary" type="button" data-act="findmissed"${S.offline || S.missing ? raw(' disabled') : ''}><span class="bl">${esc(S.missing ? 'Making it an item…' : 'Make it an item')}</span></button></div>` : ''
	const n = f.now.length + f.done.length
	const head = n ? join([f.now.length ? `${f.now.length} on Now` : '', f.done.length ? `${f.done.length} in Done` : ''].filter(Boolean).map(x => esc(x)), raw(' · ')) : f.link ? '' : esc(`Nothing on Now or in Done matches "${q}".`)
	return html`<div class="nfound" id="nfound">${head ? html`<p class="nfres" role="status">${head}</p>` : ''}${make}
		${f.now.length ? html`<ul class="nrows">${f.now.map(r => row(r, false))}</ul>` : ''}
		${f.done.length ? html`<h2 class="section-h">In Done</h2><ul class="rows">${f.done.map(doneRow)}</ul>` : ''}</div>`
}

export function nowView(): H {
	const n = V.next
	if (!n) return html`${banners()}<p class="empty" role="status">Loading…</p>`
	const waiting = n.waiting.length
	const note = env.snap || env.ui !== 'new' || V.ui?.noted ? '' : html`<div class="nnote" role="note"><p>Same items, sorted by whose move it is<span class="wide">: yours, someone else's, or ${esc(env.name)}'s</span>. Switch back any time, <span class="wide">top right</span><span class="narrow">in ⋯</span>.</p>${B('Got it', 'uinote', { sm: true, ghost: true })}</div>`
	// A rule send's Undo stays while Find has words, so its window is not missed (review P2-7).
	if (S.find?.trim()) return html`${banners()}${findBox()}${undoStrip()}${found()}${footer()}`
	if (!n.move.length && !waiting && !n.working.length && !n.catchup.count && !n.minute.facts && !n.minute.suggestions) return html`${banners()}${findBox()}${undoStrip()}${note}<div class="nquiet"><span class="ok">${I('check', 'lg')}</span><h2>Quiet.</h2><p>Nothing needs you, and nothing is waiting.</p></div>${footer()}`
	const minute = n.minute.facts || n.minute.suggestions ? html`<p class="nmin">When you have a minute: ${n.minute.suggestions ? html`<a href="#settings/learned">${esc(plural(n.minute.suggestions, 'suggestion'))}</a>` : ''}${n.minute.facts && n.minute.suggestions ? raw(' · ') : ''}${n.minute.facts ? html`<a href="#knowledge">${esc(`${plural(n.minute.facts, 'fact')} to check`)}</a>` : ''}</p>` : ''
	const offHead = n.off ? html`<span class="tag warn">${esc(n.off.since ? `${n.off.text} since ${when(n.off.since)}` : n.off.text)}</span>` : ''
	const more = n.catchup.count - n.catchup.rows.length, others = waiting + n.working.length
	return html`${banners()}${findBox()}${summary()}${undoStrip()}${note}
		${section('move', 'Your move', String(n.move.length), n.move, '', html`<p class="nempty">Nothing needs you. ${esc(others ? `${plural(others, 'thing')} ${others === 1 ? 'is' : 'are'} waiting on someone else.` : 'Nothing is waiting either.')}</p>`, minute)}
		${section('working', `${env.name} is working`, String(n.working.length), n.working, offHead)}
		${section('waiting', 'Waiting', String(waiting), n.waiting)}
		${section('catchup', 'Catch up', `${n.catchup.count} unread`, n.catchup.rows, n.catchup.count && !env.snap ? B('Mark all read', 'seenall', { sm: true, ghost: true, v: 'catchup' }) : '', '', more > 0 ? html`<a class="nmore" href="#done/catchup">+ ${more} more ${I('right', 'sm')}</a>` : '')}
		${footer()}`
}
