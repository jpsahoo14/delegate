// The automation sheet on Ongoing: pick what to set up, then a reminder or a watch. And an automation's row.
import { clock, first, plural, when, whoOf } from '../../../model/format.ts'
import { BY, EVERY, HOURS, peopleOf } from '../../../model/forms.ts'
import type { AutoForm, AutomationRow } from '../../../model/types.ts'
import { S, V, env } from '../../state/store.ts'
import { esc, html, raw, type H } from '../html.ts'
import { I } from '../icons.ts'
import { B, av, rowState } from './parts.ts'

// The reminder as it will go out, with the assistant marker. Redrawn in place as the message is typed.
export const formSentence = (f: AutoForm): H => html`${esc(EVERY[f.every])} at ${esc(clock(f.at))}, send <b>${esc(first(f.to))}</b>: “${esc(f.text)}” <span class="marker">(sent by my assistant)</span>`

export function autoRow(a: AutomationRow): H {
	const key = `row:${a.code}`, verb = a.state === 'paused' ? 'resume' : a.state === 'proposed' ? 'ok' : 'pause'
	const label = { resume: 'Resume', ok: 'Start', pause: 'Pause' }[verb]
	return html`<li class="arow${a.state === 'paused' ? raw(' paused') : ''}${S.newAuto === a.code ? raw(' new') : ''}"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2)">${I('clock')}</span>
		<div class="s">${esc(a.sentence)}<span class="m">${a.state === 'paused' ? (a.why ? html`Paused: ${esc(a.why)}` : esc('Paused')) : a.state === 'proposed' ? esc('Not started') : a.next ? html`Next: ${esc(when(a.next))}` : ''}${a.count ? html` · Sent ${esc(plural(a.count, 'time'))}` : ''}</span>${rowState(key)}</div><span class="code">${esc(a.code)}</span>
		${B(label, 'rowact', { sm: true, ic: verb === 'pause' ? 'pause' : 'play', v: `${verb} ${a.code}`, verb: `${verb} ${a.code}`, aria: html`data-key="${esc(key)}"` })}${B('End', 'rowact', { sm: true, ghost: true, v: `skip ${a.code}`, verb: `skip ${a.code}`, aria: html`data-key="${esc(key)}"` })}</li>`
}

const TEMPLATES = [['remind', 'clock', 'Remind someone', 'Send a person the same message on a schedule.'], ['watch', 'eye', 'Watch something', 'Make sure something gets done: a PR, an ask to someone, a decision.'], ['summary', 'sum', 'Daily summary', 'Say it in chat: "send me a summary at 6 pm".']]
const errLine = (): H => S.formErr ? html`<div class="state refused" role="alert">${I('warn')}<p>${esc(S.formErr)}</p></div>` : ''

// Picking the person on step 1 is the second click, so a reminder takes three: New automation, the person, Create (R-CRD-08).
const pick = (): H => html`<div class="tpls">${TEMPLATES.map(([k, ic, t, s]) => html`<button class="tpl" data-act="tpl" data-v="${esc(k)}"><span class="ti">${I(ic)}</span><span><b>${esc(t)}</b><span>${esc(s)}</span></span></button>${k === 'remind' && V.people.length ? html`<div class="chips" role="group" aria-label="Remind someone you talk to" style="margin:-4px 0 8px 52px">${peopleOf(V).slice(0, 4).map(p => html`<button type="button" class="chip" data-act="tplto" data-v="${esc(p.name)}" style="display:inline-flex;gap:6px;align-items:center;padding-left:4px">${av(whoOf(p.name), 'xs')}${p.group ? html`Post in ${esc(p.name)}` : html`Remind ${esc(p.name.split(' ')[0])}`}</button>`)}</div>` : ''}`)}</div>`

// One field: what should get done. The AI works out what done means and where to look (design-spec/done-v2.md).
function watch(): [H, H] {
	const f = S.wform!
	return [html`<div class="frm"><div><label for="ws-text">What should I make sure gets done?</label><input class="field" id="ws-text" data-ws="text" value="${esc(f.text)}" placeholder="PR 1601234 merged, or: Ana sends the trace IDs" autocomplete="off"></div>
			<div><span class="fl">Done by</span><div class="seg" role="group" aria-label="Done by">${BY.map(([k, l]) => html`<button type="button" data-act="wsby" data-v="${esc(k)}" aria-pressed="${f.by === k}">${esc(l)}</button>`)}</div></div>
			<label class="chk"><input type="checkbox" data-ws="push"${f.push ? raw(' checked') : ''}> Push it: draft fixes and nudges as soon as they help. Nothing goes out without your ok.</label>
			${errLine()}</div>`,
	html`<div class="sheet-f"><span class="sp">${esc(env.name)} checks it, tells you when it is done, and asks you if it gets stuck.</span>${B('Back', 'autoback', { ghost: true })}${B('Start watching', 'wscreate', { primary: true, busy: S.formBusy, busyLabel: 'Starting…', disabled: !f.text.trim() })}</div>`]
}

function remind(): [H, H] {
	const f = S.form!, ps = peopleOf(V), shown = ps.slice(0, 5)
	const seg = (opts: [string, string][]) => html`<div class="seg" role="group" aria-label="How often">${opts.map(([v, l]) => html`<button type="button" data-act="every" data-v="${esc(v)}" aria-pressed="${f.every === v}">${esc(l)}</button>`)}</div>`
	const hours = [...new Set([...HOURS, f.at])].sort()
	return [html`<div class="frm">
			<div><span class="fl" id="to-l">Send to</span><div class="chips" role="group" aria-labelledby="to-l" style="margin:0">${shown.map(p => html`<button type="button" class="chip" data-act="to" data-v="${esc(p.name)}" aria-pressed="${f.to === p.name}" style="display:inline-flex;gap:6px;align-items:center;padding-left:4px">${av(whoOf(p.name), 'xs')}${esc(p.name)}</button>`)}${ps.length > shown.length ? html`<button type="button" class="chip" data-act="someone" aria-expanded="${f.someone}">Someone else…</button>` : ''}</div>
			${f.someone ? html`<div class="who-sel"><label class="sr" for="au-who">Person or chat</label><select class="field" id="au-who" data-f="to" style="width:100%">${ps.map(p => html`<option${p.name === f.to ? raw(' selected') : ''}>${esc(p.name)}</option>`)}</select></div>` : ''}</div>
			<div><label for="au-text">Message</label><input class="field" id="au-text" data-f="text" value="${esc(f.text)}" autocomplete="off"></div>
			<div><span class="fl">When</span><div class="row2">${seg([['day', 'Every day'], ['weekday', 'Weekdays'], ['week', 'Weekly']])}<label class="sr" for="au-time">Time</label><select class="field" id="au-time" data-f="at">${hours.map(h => html`<option value="${esc(h)}"${h === f.at ? raw(' selected') : ''}>${esc(clock(h))}</option>`)}</select></div></div>
			<div><span class="fl">${esc(env.name)} will</span><div class="prev-s" id="au-prev">${formSentence(f)}</div></div>
			${errLine()}</div>`,
	html`<div class="sheet-f"><span class="sp">You approve this text once. Pausing ${esc(env.name)} pauses it.</span>${B('Back', 'autoback', { ghost: true })}${B('Create automation', 'autocreate', { primary: true, busy: S.formBusy, busyLabel: 'Creating…', disabled: !f.to || !f.text.trim() })}</div>`]
}

export function sheet(): H {
	const [body, foot]: [H, H] = S.sheet === 'pick' ? [pick(), ''] : S.sheet === 'watch' ? watch() : remind()
	return html`<div class="sheet-bg" data-act="sheetbg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-h"><div class="sheet-h"><h2 id="sh-h">${esc(S.sheet === 'pick' ? 'New automation' : S.sheet === 'watch' ? 'Watch something' : 'Remind someone')}</h2><span class="steps">${esc(S.sheet === 'pick' ? 'Step 1 of 2' : 'Step 2 of 2')}</span>${B('Close', 'closesheet', { ghost: true, sm: true, icon: true, ic: 'x' })}</div><div class="sheet-b">${body}</div>${foot}</div></div>`
}
