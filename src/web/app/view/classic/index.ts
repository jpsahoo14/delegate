// The classic experience: the page as it has been since the mockup (design-spec/mockup). See view/experience.ts for the contract.
import { plural } from '../../model/format.ts'
import { tabsOf } from '../../model/derive.ts'
import type { AutoForm } from '../../model/types.ts'
import { S, V, env, openCards } from '../../state/store.ts'
import type { Experience } from '../experience.ts'
import { esc, html, raw, str, type H } from '../html.ts'
import { I, sprite } from '../icons.ts'
import { THEME_LABEL, type Theme } from '../theme.ts'
import { kbd } from './parts.ts'
import { formSentence } from './sheet.ts'
import { snapshot } from './snapshot.ts'
import { doneList } from './tabs/done.ts'
import { focus } from './tabs/focus.ts'
import { home } from './tabs/home.ts'
import { knowledgeList } from './tabs/learn.ts'
import { ongoingView } from './tabs/ongoing.ts'
import { markUnsaved, settingsView } from './tabs/settings.ts'
import { uiSwitch } from '../next/switch.ts'

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T
const keysOf = (name: string): [string, string][] => [['Next item', 'j →'], ['Previous item', 'k ←'], ['Primary action', '⌘ Enter'], ['Pick option or toggle change', '1 to 9'], ['Edit the reply', 'e'], [`Ask ${name} about this`, 'a'], ['Later', 'l'], ['Undo the last automatic reply', 'u'], ['Home', 'g h'], ['Leave a field, then go back', 'Esc'], ['This list', '?']]

function boot(app: HTMLElement) {
	document.body.insertAdjacentHTML('afterbegin', str(html`${sprite}<a class="skip" href="#main">Skip to content</a>`))
	if (env.snap) document.body.classList.add('snap')
	app.innerHTML = str(html`<header class="top" role="banner"><div class="top-in">
	<a class="brand" href="#home" aria-label="${esc(env.name)} home"><span class="mark"><svg class="i" aria-hidden="true" style="width:17px;height:17px"><use href="#i-logo"/></svg></span><span class="bn">${esc(env.name)}</span></a>
	<nav class="tabs" id="tabs" aria-label="Views"></nav><span class="vt" id="vt"></span><span class="pill" id="status"></span>${uiSwitch('top')}${env.snap ? '' : raw('<button class="btn ghost icon" id="themebtn" data-act="theme"></button>')}
	<button class="btn ghost icon navbtn" id="navbtn" aria-expanded="false" aria-controls="tabs" aria-label="Views">${I('menu')}</button></div></header><main id="main" tabindex="-1"></main>`)
	document.body.insertAdjacentHTML('beforeend', str(html`<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div><div class="sr" id="live" aria-live="polite" aria-atomic="true"></div>
	<dialog id="keys" aria-labelledby="keys-h"><div class="sheet-h"><h2 id="keys-h">Keyboard</h2><button class="btn ghost icon sm" data-close aria-label="Close">${I('x')}</button></div><div class="sheet-b"><table class="keys"><tbody>
	${keysOf(env.name).map(([a, k]) => html`<tr><td>${esc(a)}</td><td>${raw(k.split(' ').map(x => str(kbd(x))).join(' '))}</td></tr>`)}
	</tbody></table></div></dialog>`))
	$('#keys [data-close]').addEventListener('click', () => $<HTMLDialogElement>('#keys').close())
	$('#navbtn').addEventListener('click', e => { e.stopPropagation(); const o = !$('#tabs').classList.contains('open'); $('#tabs').classList.toggle('open', o); $('#navbtn').setAttribute('aria-expanded', String(o)) })
	$('#tabs').addEventListener('click', () => { $('#tabs').classList.remove('open'); $('#navbtn').setAttribute('aria-expanded', 'false') })
}

// Each route's first part and its tab. An unknown address shows Home.
const VIEWS: Record<string, (enter: boolean) => H> = {
	home, focus: enter => focus(enter), done: () => doneList(S.route.split('/')[1] || 'all'), ongoing: ongoingView, knowledge: knowledgeList, settings: settingsView,
}
function draw(enter: boolean) {
	const base = S.route.split('/')[0]
	const ups = V.watching.filter(w => w.update).length, n = openCards().length
	const TABS = tabsOf(V, env.snap)
	$('#tabs').innerHTML = str(html`${TABS.map(([h, l, c]) => html`<a href="#${raw(h)}"${h === base ? raw(' aria-current="page"') : ''}${h === 'done' && c ? html` aria-label="Done, ${c} new"` : ''}>${esc(l)}${h === 'done' && c ? html`<span class="count muted">${c}</span>` : h === 'focus' && n ? html`<span class="count">${n}</span>` : h === 'ongoing' && ups ? html`<span class="count muted">${ups}</span>` : h === 'knowledge' && V.knowledge.length ? html`<span class="count muted">${V.knowledge.length}</span>` : ''}</a>`)}${uiSwitch('menu')}`)
	const st = V.status, bad = st.state !== 'on' || V.health.length || S.offline
	$('#status').className = `pill${bad ? ' warn' : ''}`
	$('#status').innerHTML = str(html`<span class="dot" aria-hidden="true"></span><span class="pt">${esc(S.offline ? 'Offline' : st.state === 'on' ? `On · ${plural(st.runs, 'run')} today` : st.state === 'paused' ? 'Paused' : 'Stopped')}</span>`)
	$('#vt').textContent = env.snap ? 'Snapshot' : (TABS.find(t => t[0] === base) || TABS[0])[1]
	$('#main').innerHTML = str(env.snap ? snapshot() : (VIEWS[base] || home)(enter))
	document.title = `${env.name} · ${n} need${n === 1 ? 's' : ''} you`
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
}

export const classic: Experience = {
	boot, draw, say, theme,
	keys: { open: () => $<HTMLDialogElement>('#keys').showModal(), isOpen: () => $<HTMLDialogElement>('#keys').open },
	patch: {
		primary(code, label, disabled) { const b = document.getElementById(`pri-${code}`) as HTMLButtonElement | null; if (b) { b.querySelector('.bl')!.textContent = label; b.disabled = disabled } },
		reminder(f: AutoForm) { $('#au-prev').innerHTML = str(formSentence(f)) },
		// No redraw: leaving a field fires change on the way to its Save button, and a redraw would drop that click.
		unsaved(field) { const row = field.closest<HTMLElement>('.setrow'), b = row?.querySelector<HTMLButtonElement>('[data-act=saveset]'); if (b) { b.disabled = false; b.classList.add('primary') } markUnsaved(row?.dataset.sec) },
	},
}
