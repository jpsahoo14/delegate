// A To learn card: facts read from the owner's chats, waiting for their ok before they are saved.
import { factsOn, kCmd } from '../../../model/derive.ts'
import { plural } from '../../../model/format.ts'
import type { KnowledgeCard } from '../../../model/types.ts'
import { S, U, env } from '../../state/store.ts'
import { esc, html, raw, type H } from '../html.ts'
import { I } from '../icons.ts'
import { stateLine } from './card.ts'
import { B, kbd } from './parts.ts'

export function kCard(k: KnowledgeCard): H {
	const u = U(k.code), on = factsOn(k, u), n = on.size, done = S.done.get(k.code)
	if (done) return html`<article class="card" data-code="${esc(k.code)}"><div class="applied" role="status"><span class="ok">${I('check', 'lg')}</span><p><b>${esc(done.msg)}</b><span>${esc(k.topic)}</span></p><span class="code">${esc(k.code)}</span></div></article>`
	const cmd = kCmd(k, u)
	const by = (f: KnowledgeCard['facts'][number]) => esc([f.who, f.date].filter(Boolean).join(', '))
	return html`<article class="card" data-code="${esc(k.code)}" data-rev="${esc(k.rev)}" aria-labelledby="h-${esc(k.code)}">
		${u.stale ? html`<div class="stale" role="status">${I('warn')}<p><b>Changed since you looked.</b></p>${B('Show the new version', 'shownew', { sm: true })}</div>` : ''}
		<div class="c-sec"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text)">${I('book')}</span><div class="c-who"><h2 class="c-name" id="h-${esc(k.code)}">${esc(k.topic)}</h2><div class="c-meta" style="display:block">${k.home === 'personal' ? html`${I('lock', 'sm')} Saves to your own knowledge` : esc('Saves to team knowledge')}</div></div><span class="code">${esc(k.code)}</span></div></div>
		<div class="c-sec"><div class="lbl-row"><span>Facts to save</span><span class="sp"></span><span style="text-transform:none;letter-spacing:0;font-weight:500">${n} of ${k.facts.length} selected</span></div>
		<ul class="cmts" style="margin:0">${k.facts.map((f, i) => html`<li><label class="cmt"><input type="checkbox" data-fact="${i + 1}" id="f-${esc(k.code)}-${i + 1}"${on.has(i + 1) ? raw(' checked') : ''}${env.snap ? raw(' disabled') : ''}><span class="mk">${I('check')}</span><span class="cb"><span class="loc" style="font-family:var(--font)"><span class="tag accent">${esc(f.type)}</span>${f.private ? html`<span class="tag">${I('lock', 'sm')}From a private chat</span>` : ''}</span><p>${esc(f.text)}</p><span style="font-size:12px;color:var(--text-3)">${f.href && !env.snap ? html`<a href="${esc(f.href)}" target="_blank" rel="noopener" style="color:inherit">${by(f)}</a>` : by(f)}</span></span></label></li>`)}</ul></div>
		<div class="c-sec c-foot">${stateLine(u, u.verb || cmd)}<div class="acts">${B(n ? `Save ${plural(n, 'fact')}` : 'Save', 'primary', { primary: true, id: `pri-${k.code}`, disabled: !n || u.stale, busy: u.status === 'pending', busyLabel: 'Saving…', verb: cmd })}${B('Skip', 'skipk', { ghost: true, verb: `skip ${k.code}` })}</div>${env.snap ? '' : html`<p class="vh">or type ${kbd(cmd)} in Teams or your AI chat</p>`}</div></article>`
}
