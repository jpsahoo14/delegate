// Small pieces every tab uses: the button, a key, an avatar, a list's heading, and a row's working state.
import type { Who } from '../../../model/types.ts'
import { S, env, peek } from '../../state/store.ts'
import { esc, html, raw, type H } from '../html.ts'
import { I } from '../icons.ts'

export type ButtonOpts = { primary?: boolean; ghost?: boolean; sm?: boolean; icon?: boolean; cls?: string; busy?: boolean; busyLabel?: string; disabled?: boolean; id?: string; v?: string | number; aria?: H; ic?: string; verb?: string }
// In the snapshot every action is the words to type; elsewhere it is a real button. A primary button waits while offline.
export function B(label: string, act: string, o: ButtonOpts = {}): H {
	if (env.snap) return o.verb ? html`<span class="verb ${o.primary ? raw('primary') : ''}">${esc(o.verb)}</span>` : ''
	const cls = ['btn', o.primary && 'primary', o.ghost && 'ghost', o.sm && 'sm', o.icon && 'icon', o.cls, o.busy && 'busy'].filter(Boolean).join(' ')
	const dis = o.disabled || o.busy || (S.offline && o.primary)
	return html`<button class="${raw(cls)}" data-act="${raw(act)}"${o.id ? html` id="${raw(o.id)}"` : ''}${o.v != null ? html` data-v="${esc(o.v)}"` : ''}${dis ? raw(' disabled') : ''}${o.aria ? html` ${o.aria}` : ''}>${o.busy ? raw('<span class="spin" aria-hidden="true"></span>') : ''}${o.ic ? I(o.ic) : ''}${o.icon ? html`<span class="sr">${esc(label)}</span>` : html`<span class="bl">${esc(o.busy ? o.busyLabel || label : label)}</span>`}</button>`
}
export const kbd = (v: string) => html`<kbd>${esc(v)}</kbd>`
export const av = (w: Who, cls = '') => html`<span class="av hue ${raw(cls)}" style="--hue:${w.hue}" aria-hidden="true">${esc(w.initials)}</span>`
export const listHead = (title: string, sub: string, extra: H = '') => html`<div class="lh"><div><h1>${esc(title)}</h1>${sub ? html`<p>${esc(sub)}</p>` : ''}</div><span class="sp"></span>${extra}</div>`
// A list row's action on its way, or what came back.
export const rowState = (key: string): H => { const u = peek(key); return u.status === 'pending' ? html`<span class="m">${esc(u.lost ? 'Lost connection. Retrying…' : 'Working…')}</span>` : u.msg ? html`<span class="m" role="status">${esc(u.msg)}</span>` : '' }
// Asks the runner to look again now; on the health banner and in Settings.
export const checkNow = () => env.snap ? '' : B('Check now', 'rowact', { sm: true, v: 'retry', verb: 'retry', aria: raw('data-key="row:retry"') })
