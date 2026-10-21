// Settings: one page by what the owner is doing, with a sticky index (design-spec/settings-v2.md). Rows save to the shared config.
import { S, U, V, env } from '../../../state/store.ts'
import { esc, html, raw, type H } from '../../html.ts'
import { banners } from '../banners.ts'
import { B, checkNow, listHead, rowState } from '../parts.ts'

type Settings = NonNullable<typeof V.settings>
type Row = Settings['rows'][number]

const SECTIONS = (): [id: string, chip: string, heading?: string][] => [['learned', 'What it knows', `What ${env.name} knows about you`], ['you', 'You and your replies'], ['replies', 'Automatic replies'], ['timing', 'Reminders and summary'], ['system', 'Updates and system']]

// The section's chip shows an edit not yet saved, as it is typed: the row may be far down the page. In place, with no redraw.
export const markUnsaved = (sec: string | undefined) => { const c = sec && document.querySelector(`.setnav a[href="#settings/${sec}"]`); if (c && !c.querySelector('.dot')) c.insertAdjacentHTML('beforeend', '<span class="dot" title="Not saved yet"></span>') }

// Show details: what the runner is doing, and today's log, for when something looks wrong.
const detailsPanel = (): H => html`<h2 class="section-h">Details</h2><ul class="rows setrows"><li class="setrow"><b>Runner</b><span class="m">${esc(V.details!.runner)}</span>${env.snap ? '' : html`<div class="markacts">${checkNow()}</div>`}</li><li class="setrow"><b>Today's log, newest first</b><pre class="dbg">${esc(V.details!.log.join('\n') || 'Nothing yet.')}</pre></li></ul>`

function input(r: Row): H {
	const id = `set-${r.key}`, v = S.set[r.key] ?? r.value
	if (r.kind === 'text') return html`<textarea id="${esc(id)}" class="edit" data-set="${esc(r.key)}" rows="4">${esc(v)}</textarea>`
	if (r.kind === 'choice') return html`<select id="${esc(id)}" data-set="${esc(r.key)}">${(r.options ?? []).map(o => html`<option value="${esc(o.value)}"${o.value === v ? raw(' selected') : ''}>${esc(o.label)}</option>`)}</select>`
	if (r.kind === 'bool') return html`<select id="${esc(id)}" data-set="${esc(r.key)}"><option value="false"${v === 'false' ? raw(' selected') : ''}>Off</option><option value="true"${v === 'true' ? raw(' selected') : ''}>On</option></select>`
	return html`<input id="${esc(id)}" class="field" data-set="${esc(r.key)}" value="${esc(v)}"${r.kind === 'number' ? raw(' inputmode="numeric"') : ''}>`
}
// A change Delegate may propose: a switch that saves as it flips (R-HIL-21). Only the list changes, never an item.
function switchRow(r: Row): H {
	const u = U(`set:${r.key}`), on = (S.set[r.key] ?? r.value) === 'true', id = `set-${r.key}`, busy = u.status === 'pending'
	return html`<li class="setrow swrow" data-code="set:${esc(r.key)}" data-sec="${esc(r.section)}"><div class="swl"><b id="${esc(id)}-l">${esc(r.label)}</b><span class="m" id="${esc(id)}-h">${esc(r.help)}</span>${u.msg ? html`<span class="m" role="status">${esc(u.msg)}</span>` : ''}</div>${env.snap ? html`<span class="m">${esc(on ? 'On' : 'Off')}</span>` : html`<button class="uisw setsw${busy ? raw(' busy') : ''}" id="${esc(id)}" type="button" role="switch" aria-checked="${raw(String(on))}" aria-labelledby="${esc(id)}-l" aria-describedby="${esc(id)}-h" data-act="setswitch" data-v="${esc(r.key)}"${busy || S.offline ? raw(' disabled') : ''}><span class="uisw-l">${esc(on ? 'On' : 'Off')}</span><span class="uisw-t" aria-hidden="true"><i></i></span></button>`}</li>`
}
function row(r: Row): H {
	const u = U(`set:${r.key}`), changed = (S.set[r.key] ?? r.value) !== r.value
	return html`<li class="setrow" data-code="set:${esc(r.key)}" data-sec="${esc(r.section)}"><label for="set-${esc(r.key)}"><b>${esc(r.label)}</b><span class="m">${esc(r.help)}</span></label>${input(r)}<div class="markacts">${B(u.status === 'pending' ? 'Saving…' : 'Save', 'saveset', { sm: true, primary: changed, v: r.key, disabled: !changed, busy: u.status === 'pending' })}${r.key === 'pollIdle' ? checkNow() : ''}${u.msg ? html`<span class="m">${esc(u.msg)}</span>` : ''}</div>${r.key === 'pollIdle' ? rowState('row:retry') : ''}</li>`
}

export function settingsView(): H {
	const st = V.settings
	if (!st) return html`${listHead('Settings', '')}<p class="empty">Settings are on the page in your browser: run "${esc(env.cmd)}".</p>`
	// What Delegate knows about you and acts on: suggestions first, then standing instructions (R-HAB-03).
	const ab = st.about, act = (label: string, verb: string, o = {}) => B(label, 'rowact', { sm: true, v: verb, verb, aria: html`data-key="row:${esc(verb.split(' ')[1])}"`, ...o })
	const sugg = html`${ab.suggestions.map(x => html`<li class="setrow" data-code="${esc(x.code)}"><b>${esc(x.text)}</b><span class="m">${esc(x.does)}</span><span class="m">Evidence: ${esc(x.evidence)}</span>${U(`row:${x.code}`).msg ? '' : html`<div class="markacts">${act('Turn on', `ok ${x.code}`, { primary: true })}${act('Not now', `skip ${x.code}`, { ghost: true })}${act('Never', `never ${x.code}`, { ghost: true })}</div>`}${rowState(`row:${x.code}`)}</li>`)}`
	const rules = html`${ab.rules.map(r => html`<li class="setrow"><b>${esc(r.text)}</b>${r.who ? html`<span class="m">For: ${esc(r.who)}</span>` : ''}<span class="m">${esc(r.learned ?? 'You said this.')}${r.held ? raw(' · On hold') : ''}</span>${r.code && !U(`row:${r.code}`).msg ? html`<div class="markacts">${act('Remove', `never ${r.code}`, { ghost: true })}</div>` : ''}${r.code ? rowState(`row:${r.code}`) : ''}</li>`)}` || raw('<li class="setrow"><span class="m">None: every reply waits for your ok.</span></li>')
	const fixed = st.fixed.map(f => html`<li class="setrow"><b>${esc(f.label)}</b><span class="sent">${esc(f.value)}</span><span class="m">${esc(f.how)}</span></li>`)
	// One page, by what the owner is doing; the chips jump to a section and show what waits there.
	const rows = (sec: string, adv = false) => st.rows.filter(r => r.section === sec && !!r.advanced === adv && r.kind !== 'switch').map(row)
	const sw = st.rows.filter(r => r.kind === 'switch')
	const changes = sw.length ? html`<h3 class="section-h">Changes ${esc(env.name)} may propose</h3><p class="m" style="margin:-4px 0 10px">Each one waits for your ok on its item. Turning one off edits only this list, never your items: an ok on a change it no longer allows is refused, even one approved but not made yet. Deploys follow "Where ${esc(env.name)} may deploy" above.</p><ul class="rows setrows">${sw.map(switchRow)}</ul>` : ''
	const unsaved = (sec: string) => st.rows.some(r => r.section === sec && S.set[r.key] !== undefined && S.set[r.key] !== r.value)
	const body: Record<string, H> = {
		learned: html`${sugg ? html`<h3 class="section-h">Suggestions</h3><ul class="rows setrows">${sugg}</ul>` : ''}<h3 class="section-h">Standing instructions</h3><ul class="rows setrows">${rules}</ul>${ab.chats?.length ? html`<h3 class="section-h">Chats you marked</h3><ul class="rows setrows">${ab.chats.map(c => html`<li class="setrow"><b>${esc(c.name)}</b><span class="m">${esc(c.says[0].toUpperCase() + c.says.slice(1))}. Say "${esc(c.name)} is normal again" to undo.</span></li>`)}</ul>` : ''}<h3 class="section-h">Learning</h3><ul class="rows setrows">${rows('learned')}</ul>`,
		you: html`<ul class="rows setrows">${rows('you')}</ul>${changes}`,
		replies: html`<p class="m" style="margin:-4px 0 10px">Replies go out by themselves only for your <a href="#settings/learned">standing instructions</a>. These limits apply to every one.</p><ul class="rows setrows">${rows('replies')}</ul>`,
		timing: html`<ul class="rows setrows">${rows('timing')}</ul>`,
		system: html`<ul class="rows setrows">${rows('system')}</ul><details class="adv" data-adv${S.advOpen ? raw(' open') : ''}><summary class="section-h">More</summary><ul class="rows setrows">${rows('system', true)}</ul>${V.details ? detailsPanel() : ''}<h3 class="section-h">Changed by setup</h3><ul class="rows setrows">${fixed}</ul></details>`,
	}
	const intro: Record<string, string> = { learned: `Ask your AI chat "what do you know about me?" for the same list. To change a rule you wrote, say "change my rules" there.` }
	const sub = S.route.split('/')[1], here = st.rows.find(r => r.key === sub)?.section ?? sub
	const nav = html`<nav class="setnav" aria-label="Settings sections">${SECTIONS().map(([id, l]) => html`<a class="chip" href="#settings/${esc(id)}"${here === id ? raw(' aria-current="location"') : ''}>${esc(l)}${id === 'learned' && ab.suggestions.length ? html`<span class="newpill">${ab.suggestions.length}</span>` : ''}${unsaved(id) ? raw('<span class="dot" title="Not saved yet"></span>') : ''}</a>`)}</nav>`
	const sections = SECTIONS().map(([id, l, h]) => html`<section class="setsec" id="setsec-${esc(id)}" aria-labelledby="setsec-${esc(id)}-h"><h2 class="section-h" id="setsec-${esc(id)}-h">${esc(h ?? l)}</h2>${intro[id] ? html`<p class="m" style="margin:-4px 0 10px">${esc(intro[id])}</p>` : ''}${body[id]}</section>`)
	return html`${banners()}<div style="max-width:760px">${listHead('Settings', 'Saved to the config in your storage folder, so every machine uses them from the next cycle.')}${nav}${sections}</div>`
}
