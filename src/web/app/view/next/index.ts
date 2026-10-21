// The new experience (R-NEX-02): Now, Done, Numbers, and Settings. Now sorts every open thread by whose move it is; Done, Settings,
// and To learn are the classic views as they are. Behind the "New experience" switch. See view/experience.ts for the contract.
import { newCount } from '../../model/derive.ts'
import { when } from '../../model/format.ts'
import { newRoute } from '../../model/ui.ts'
import type { AutoForm } from '../../model/types.ts'
import { S, V, env } from '../../state/store.ts'
import type { Experience } from '../experience.ts'
import { esc, html, raw, str, type H } from '../html.ts'
import { I, sprite } from '../icons.ts'
import { THEME_LABEL, theme as themeNow, type Theme } from '../theme.ts'
import { kbd } from '../classic/parts.ts'
import { formSentence } from '../classic/sheet.ts'
import { doneList } from '../classic/tabs/done.ts'
import { knowledgeList } from '../classic/tabs/learn.ts'
import { markUnsaved, settingsView } from '../classic/tabs/settings.ts'
import { numbersView } from '../classic/tabs/numbers.ts'
import { hasNumbers } from '../../state/numbers.ts'
import { nowView } from './now.ts'
import { uiSwitch } from './switch.ts'

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T
const KEYS: [string, string][] = [['Now', 'g h'], ['Undo the last automatic reply', 'u'], ['Leave a field', 'Esc'], ['This list', '?']]

function boot(app: HTMLElement) {
	document.body.insertAdjacentHTML('afterbegin', str(html`${sprite}<a class="skip" href="#main">Skip to content</a>`))
	app.dataset.ui = 'next'
	app.innerHTML = str(html`<header class="top" role="banner"><div class="top-in">
	<a class="brand" href="#now" aria-label="${esc(env.name)}, Now"><span class="mark"><svg class="i" aria-hidden="true" style="width:17px;height:17px"><use href="#i-logo"/></svg></span><span class="bn">${esc(env.name)}</span></a>
	<nav class="tabs" id="tabs" aria-label="Views"></nav><span class="vt" id="vt"></span><span class="pill" id="status"></span>${uiSwitch('top')}<button class="btn ghost icon" id="themebtn" data-act="theme"></button>
	<button class="btn ghost icon navbtn" id="navbtn" aria-expanded="false" aria-controls="tabs" aria-label="Menu">${I('more')}</button></div></header><main id="main" tabindex="-1"></main>`)
	document.body.insertAdjacentHTML('beforeend', str(html`<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div><div class="sr" id="live" aria-live="polite" aria-atomic="true"></div>
	<dialog id="keys" aria-labelledby="keys-h"><div class="sheet-h"><h2 id="keys-h">Keyboard</h2><button class="btn ghost icon sm" data-close aria-label="Close">${I('x')}</button></div><div class="sheet-b"><table class="keys"><tbody>
	${KEYS.map(([a, k]) => html`<tr><td>${esc(a)}</td><td>${raw(k.split(' ').map(x => str(kbd(x))).join(' '))}</td></tr>`)}
	</tbody></table></div></dialog>`))
	$('#keys [data-close]').addEventListener('click', () => $<HTMLDialogElement>('#keys').close())
	$('#navbtn').addEventListener('click', e => { e.stopPropagation(); const o = !$('#tabs').classList.contains('open'); $('#tabs').classList.toggle('open', o); $('#navbtn').setAttribute('aria-expanded', String(o)) })
	$('#tabs').addEventListener('click', () => { $('#tabs').classList.remove('open'); $('#navbtn').setAttribute('aria-expanded', 'false') })
}

// The tabs: Now with the Your move count, Done with its new rows, Numbers (no count), Settings. The narrow menu also holds the switch and the theme.
function tabs(base: string): H {
	const n = V.next?.move.length ?? 0, d = newCount(V)
	const tab = (h: string, label: string, count: H) => html`<a href="#${raw(h)}"${h === base ? raw(' aria-current="page"') : ''}>${esc(label)}${count}</a>`
	const t = themeNow()
	return html`${tab('now', 'Now', n ? html`<span class="count">${n}</span>` : '')}${tab('done', 'Done', d ? html`<span class="count muted" aria-label="${d} new">${d}</span>` : '')}${hasNumbers() ? tab('numbers', 'Numbers', '') : ''}${V.settings ? tab('settings', 'Settings', '') : ''}${uiSwitch('menu')}<button class="menu-only themeitem" type="button" data-act="theme">${I(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'auto')}<span>Theme: ${esc(THEME_LABEL[t])}</span></button>`
}

function status(): string {
	if (S.offline) return 'Offline'
	const st = V.status, r = st.reading
	if (st.state !== 'on') return st.state === 'paused' ? 'Paused' : 'Stopped'
	if (r.state === 'never') return 'Not checked yet'
	return r.state === 'off' ? `Not checked since ${when(r.at)}` : `Checked ${when(r.at)}`
}

const VIEWS: Record<string, () => H> = { now: nowView, done: () => doneList(S.route.split('/')[1] || 'all'), numbers: numbersView, settings: settingsView, knowledge: knowledgeList }
const LABEL: Record<string, string> = { now: 'Now', done: 'Done', numbers: 'Numbers', settings: 'Settings', knowledge: 'To learn' }
function draw() {
	const base = VIEWS[S.route.split('/')[0]] ? S.route.split('/')[0] : 'now'
	$('#tabs').innerHTML = str(tabs(base))
	// On a narrow page the tabs are in the ⋯ menu, so Done's count shows on it.
	const d = newCount(V)
	$('#navbtn').innerHTML = str(html`${I('more')}${d ? html`<span class="count muted">${d}</span>` : ''}`)
	$('#navbtn').setAttribute('aria-label', d ? `Menu, ${d} new in Done` : 'Menu')
	const bad = V.status.state !== 'on' || V.health.length || S.offline || V.status.reading.state === 'off' || V.status.reading.state === 'never'
	$('#status').className = `pill${bad ? ' warn' : ''}`
	$('#status').innerHTML = str(html`<span class="dot" aria-hidden="true"></span><span class="pt">${esc(status())}</span>`)
	$('#vt').textContent = LABEL[base]
	$('#main').innerHTML = str(VIEWS[base]())
	const n = V.next?.move.length ?? 0
	document.title = `${env.name} · ${n ? `${n} your move` : 'Now'}`
}

let toastT: ReturnType<typeof setTimeout> | undefined
function say(t: string, toast: boolean) {
	const live = $('#live'); live.textContent = ''; setTimeout(() => { live.textContent = t }, 30)
	if (!toast) return
	const el = $('#toast'); el.innerHTML = str(html`${I('check', 'sm')}<span>${esc(t)}</span>`); el.classList.add('show')
	clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 4000)
}

function theme(t: Theme) {
	const b = document.getElementById('themebtn')
	if (b) { b.innerHTML = str(I(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'auto')); b.setAttribute('aria-label', `Theme: ${THEME_LABEL[t]}. Change theme`); b.title = `Theme: ${THEME_LABEL[t]}` }
	const m = document.querySelector('#tabs .themeitem span')
	if (m) m.textContent = `Theme: ${THEME_LABEL[t]}`
}

export const next: Experience = {
	boot, draw, say, theme,
	alias: newRoute,
	keys: { open: () => $<HTMLDialogElement>('#keys').showModal(), isOpen: () => $<HTMLDialogElement>('#keys').open },
	patch: {
		primary(code, label, disabled) { const b = document.getElementById(`pri-${code}`) as HTMLButtonElement | null; if (b) { b.querySelector('.bl')!.textContent = label; b.disabled = disabled } },
		reminder(f: AutoForm) { const p = document.getElementById('au-prev'); if (p) p.innerHTML = str(formSentence(f)) },
		unsaved(field) { const row = field.closest<HTMLElement>('.setrow'), b = row?.querySelector<HTMLButtonElement>('[data-act=saveset]'); if (b) { b.disabled = false; b.classList.add('primary') } markUnsaved(row?.dataset.sec) },
	},
}
