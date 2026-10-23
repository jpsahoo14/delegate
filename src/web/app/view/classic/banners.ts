// The banners above every tab: lost connection, and the first health problem with its fix.
import { plural, when } from '../../../model/format.ts'
import { S, U, V, env } from '../../state/store.ts'
import { esc, html, type H } from '../html.ts'
import { I } from '../icons.ts'
import { B } from './parts.ts'

export function banners(): H {
	const off = S.offline ? html`<div class="health off" role="alert"><span class="hi">${I('off', 'lg')}</span><p><b>Lost connection to ${esc(env.name)}.</b> <span>Retrying… Nothing you do now is lost; actions already sent will not be sent twice.</span></p></div>` : ''
	const h = V.health[0], st = U('health')
	if (!h) return off
	const more = V.health.length > 1 ? html` <span>And ${esc(plural(V.health.length - 1, 'more problem'))}.</span>` : ''
	const fix = h.fix ? B(h.fix.label, 'healthfix', { busy: st.status === 'pending', busyLabel: 'Checking…', verb: h.fix.command }) : ''
	return html`${off}<section class="health" aria-label="Problem with ${esc(env.name)}"><span class="hi">${I('warn', 'lg')}</span><p><b>${esc(h.text)}</b>${h.since ? html` <span>Since ${esc(when(h.since))}.</span>` : ''}${more}${st.msg ? html` <span class="hm">${esc(st.msg)}</span>` : ''}</p>${fix}</section>`
}
