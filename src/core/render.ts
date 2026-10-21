import { changeSays, meaningOf, pendingEffects, shown } from './effects.ts'
import type { Effect, Msg, Proposal, Workflow } from './types.ts'

export const MARK = 'Assistant ·'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export function age(fromIso: string, now: Date): string {
	const m = Math.max(0, Math.round((now.getTime() - Date.parse(fromIso)) / 60000))
	if (m < 60) return `${m}m`
	if (m < 60 * 48) return `${Math.round(m / 60)}h`
	return `${Math.round(m / 1440)}d`
}

export function statusLine(wf: Workflow, now = new Date()): string {
	if (wf.state === 'done') {
		const left = wf.sent?.undoUntil ? Math.round((Date.parse(wf.sent.undoUntil) - now.getTime()) / 60000) : 0
		return (wf.status || 'Done') + (left > 0 ? ` · undo for ${left} min: "undo ${wf.code}"` : '')
	}
	if (wf.state === 'open') return `${wf.status}. Nothing needs you now`
	if (wf.openOn) return `Open in a window on ${wf.openOn}. I won't touch it until you close the window`
	if (wf.state === 'running') return 'Running: drafting a reply'
	if (wf.state === 'waiting_on_task') return `${wf.status} (${Math.max(0, Math.round((now.getTime() - Date.parse(wf.waitingSince ?? wf.updatedAt)) / 60000))} min)`
	if (wf.state === 'scheduled') return wf.status.startsWith('Held') ? wf.status : `Sending at ${hhmm(wf.sendAt)} unless you act (${wf.decision?.reason ?? 'rule'})`
	if (wf.draft?.preview) return `Preview: reply "ok ${wf.code}" to send`
	if (wf.job && !wf.question) return `Ready: ${wf.status}`
	if (wf.decision?.ruleId && !wf.question) return `Not sent automatically (${wf.decision.reason}). Reply "ok ${wf.code}" to send`
	// A ready draft says how sure it is, from the evidence the runner checked (R-ANS-02).
	// Plain words for how well the draft is backed, from the evidence the runner checked (persona test P2).
	if (!wf.question) return wf.decision ? { high: 'Ready · based on your notes and a live source', medium: 'Ready · based on your notes', low: 'Draft · little evidence, check it' }[wf.decision.confidence] : 'Draft ready'
	return `Needs you: ${wf.question}`
}

export function renderItem(wf: Workflow, mode: 'full' | 'line', now: Date, bold = true): string {
	const code = bold ? `**${wf.code}**` : wf.code
	const who = wf.asker?.name ?? 'Someone'
	const head = `${code} · ${who} · ${wf.chat.name} · ${age(wf.createdAt, now)}`
	const fresh = wf.newCount > 0 ? ` · ${wf.newCount} new message${wf.newCount > 1 ? 's' : ''}` : ''
	if (mode === 'line') return `${head} · ${clip(oneLine(statusLine(wf, now)), 110)}`
	const lines = [head + fresh]
	if (wf.lastAsk) lines.push(`> ${clip(oneLine(wf.lastAsk), 140)}`)
	lines.push(statusLine(wf, now))
	lines.push(...cardLines(wf))
	const left = pendingEffects(wf.effects)
	if (wf.state === 'needs_human' && left.length) lines.push(okWill(wf), ...left.map(e => `- ${clip(oneLine(changeSays(e)), 140)}`))
	return lines.join('\n')
}

// The meeting, the facts that matter, the options with their numbers, and the draft when there is a real one (design-spec cards).
// The same lines on every text surface, so the phone and the AI chat show what the page shows.
export function cardLines(wf: Workflow): string[] {
	const out: string[] = []
	if (wf.meeting) out.push(`Meeting: ${wf.meeting.subject} · ${new Date(wf.meeting.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${wf.meeting.minutes} min`)
	for (const f of wf.context ?? []) out.push(`${f.tone === 'warn' ? '⚠ ' : ''}${f.text}`)
	const real = wf.draft?.text && !/^_{3,}\.?$/.test(wf.draft.text.trim())
	if (wf.choices && !wf.draft?.preview) {
		out.push(...wf.choices.options.map((o, i) => `${i + 1}. ${o.label}${o.note ? ` (${o.note})` : ''}`))
		out.push(`Reply "${wf.code}: 1"${wf.choices.multi ? `, or several: "${wf.code}: 1, 3"` : ''}${wf.choices.other ? `, or "${wf.code}: your own answer"` : ''}.`)
	} else if (real) out.push(`Draft: "${clip(wf.draft!.text.split('\n').slice(0, 2).join(' '), 220)}"`)
	return out
}

// "2× comment on PR 1601234, approve on PR 1601234". Words come from the job, so no plural rules (R-HIL-21).
export function effectLine(effects: Effect[]): string {
	const groups = new Map<string, number>()
	// A PR change says what the PR is, from Azure DevOps (next action).
	// Built from each change's call, never the AI's words about it (review 10-21 P1-1).
	for (const e of effects) { const m = meaningOf(e), k = `${shown(e).line}${m ? ` (${m})` : ''}`; groups.set(k, (groups.get(k) ?? 0) + 1) }
	return [...groups].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k)).join(', ')
}

export type Extra = { proposals?: Proposal[]; background?: { what: string; since: string }[]; automations?: { code: string; line: string; state: string; next?: string }[]; waiting?: { code: string; to: string; text: string; at: string }[] }

// One grouping for every surface, so the phone and the page never disagree about what is where.
export function groups(wfs: Workflow[], since?: string) {
	const needs = wfs.filter(w => w.state === 'needs_human').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
	const watching = wfs.filter(w => w.kind === 'tracker' && w.state === 'waiting_on_task')
	const running = wfs.filter(w => w.kind !== 'tracker' && (w.state === 'running' || w.state === 'waiting_on_task' || w.state === 'scheduled'))
	// A tracker shows under Done only when its result changed since the owner last looked (R-TRK-02).
	const done = [...wfs.filter(w => w.state === 'done' && w.code && (!since || w.updatedAt > since) && w.intent !== 'none'), ...watching.filter(w => w.changedAt && (!since || w.changedAt > since) && (!w.ackAt || w.changedAt > w.ackAt))]
	return { needs, watching, running, done }
}

export function renderList(wfs: Workflow[], now: Date, since?: string, health: Record<string, { text: string; since: string }> = {}, extra: Extra = {}): string {
	const kp = (extra.proposals ?? []).filter(p => p.state === 'needs_human').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
	const bg = extra.background ?? []
	const { needs, watching, running, done } = groups(wfs, since)
	const head = [`${needs.length} need you`, `${done.length} done`, `${running.length + bg.length} running`, ...(kp.length ? [`${kp.length} to learn`] : [])].join(' · ')
	const out = [head]
	const problems = Object.values(health)
	if (problems.length) out.push('', '### Health', ...problems.map(p => `- ${p.text} (since ${age(p.since, now)} ago)`))
	if (needs.length) out.push('', '### Needs you', ...needs.map(w => renderItem(w, 'full', now) + '\n'))
	if (done.length) out.push('', '### Done while you were away', ...done.map(w => (w.kind === 'tracker' ? `- Update · **${w.code}** · ${w.lastAsk?.replace(/^Watch /, '').replace(/ until .*$/, '') ?? ''}: ${clip(oneLine(w.status), 110)}` : `- ${renderItem(w, 'line', now)}`)))
	// Knowledge never crowds out replies: one line per topic, after them (dev-spec/slices/05 UX).
	if (kp.length) out.push('', '### Knowledge to review', ...kp.slice(0, 5).map(p => `- **${p.code}** · ${p.title} · ${p.status}`), ...(kp.length > 5 ? [`- and ${kp.length - 5} more`] : []),
		kp.length > 1 && kp.length <= 20 ? `Say "review knowledge" to go through them one by one, or "ok ${kp[0].code}-${kp.at(-1)!.code}" to save all.` : `Reply "ok ${kp[0].code}", "more ${kp[0].code}", or "skip ${kp[0].code}".`)
	const wait = extra.waiting ?? []
	if (wait.length) out.push('', '### Waiting on others', ...wait.map(w => `- **${w.code}** · you asked ${w.to} ${age(w.at, now)} ago: "${clip(oneLine(w.text), 90)}"`), `Say "nudge ${wait[0].code}" to draft a follow-up, or "skip ${wait[0].code}".`)
	const autos = extra.automations ?? []
	if (autos.length) out.push('', '### Automations', ...autos.map(a => `- ${a.line} · ${a.state === 'proposed' ? `say "ok ${a.code}" to start` : a.state === 'paused' ? 'paused' : `next ${new Date(a.next!).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}`))
	const progress = wfs.filter(w => w.state === 'open' && w.work)
	if (progress.length) out.push('', '### In progress', ...progress.map(w => `- **${w.code}** · ${clip(oneLine(w.work!.goal), 80)} · ${w.status}`), `Say "more ${progress[0].code}" for its steps, or "close ${progress[0].code}: why" when it is finished.`)
	if (watching.length) out.push('', '### Watching', ...watching.map(w => `- **${w.code}** · ${w.lastAsk?.replace(/^Watch /, '') ?? ''} · ${w.status}`))
	if (running.length || bg.length) out.push('', '### Running', ...running.map(w => `- ${renderItem(w, 'line', now)}`), ...bg.map(b => `- ${b.what} (${Math.max(0, Math.round((now.getTime() - Date.parse(b.since)) / 60000))} min)`))
	if (!needs.length && !done.length && !running.length && !kp.length && !bg.length && !progress.length) out.push('', 'Nothing needs you.')
	return out.join('\n')
}

const hhmm = (iso?: string) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '')

export function renderNudge(needs: Workflow[], undoable: Workflow[] = [], now = new Date(), kp: Proposal[] = []): string {
	const lines = needs.slice(0, 6).map(w => `${w.code} ${w.asker?.name ?? 'Someone'}: ${clip(oneLine(w.lastAsk ?? w.status), 70)}${cardLines(w).slice(0, 4).map(l => `\n   ${clip(oneLine(l), 100)}`).join('')}${okWill(w) ? `\n   ${okWill(w)}` : ''}`)
	const more = needs.length > 6 ? [`and ${needs.length - 6} more`] : []
	const eg = needs[0] ? `"ok ${needs[0].code}"` : '"ok A1"'
	const sent = undoable.map(w => `Sent ${w.code} to ${w.asker?.name ?? 'them'} by rule: "${clip(oneLine(w.draft?.text ?? ''), 90)}". Undo for ${Math.max(1, Math.round((Date.parse(w.sent!.undoUntil!) - now.getTime()) / 60000))} more min: reply "undo ${w.code}".`)
	const head = needs.length ? `${MARK} ${needs.length} need you` : undoable.length ? `${MARK} ${undoable.length} sent for you` : `${MARK} ${kp.length} topic${kp.length > 1 ? 's' : ''} to learn`
	const learn = kp.length ? `${kp.length} topic${kp.length > 1 ? 's' : ''} to learn (${kp.slice(0, 4).map(p => p.title).join(', ')}${kp.length > 4 ? ', …' : ''}): "more ${kp[0].code}" or "ok ${kp[0].code}${kp.length > 1 ? `-${kp.at(-1)!.code}` : ''}".` : ''
	return [head, ...lines, ...more, ...sent, needs.length && learn ? learn : '', needs.length ? `Reply here, for example ${eg}, or ask in your AI chat.` : !undoable.length ? learn : ''].filter(Boolean).join('\n')
}

// Every surface that asks for ok says what ok will do on other systems (R-HIL-21, tester P1-11).
function okWill(wf: Workflow): string {
	const left = pendingEffects(wf.effects)
	return left.length ? `ok will: ${effectLine(left)}${wf.draft?.text ? ', then send the reply' : ''}` : ''
}

// The phone list: one line per item, the decision first, so it reads in seconds (persona test P1).
// Health first, so a phone-only owner knows whether silence means "all clear" (final review P1-7).
export function renderPhone(wfs: Workflow[], kp: Proposal[] = [], health: Record<string, { text: string }> = {}, since?: string): string {
	const { needs, watching, running, done } = groups(wfs, since)
	const line = (w: Workflow) => {
		const left = pendingEffects(w.effects)
		const what = w.choices && !w.draft?.preview ? `pick one: ${w.choices.options.map((o, i) => `${i + 1} ${clip(o.label, 24)}`).join(' · ')}` : w.question ? `needs your answer: ${clip(oneLine(w.question), 60)}` : left.length ? `${effectLine(left)}, then reply` : `reply ready: "${clip(oneLine(w.draft?.text ?? ''), 50)}"`
		return `${w.code} ${w.asker?.name ?? 'Someone'} · ${what}`
	}
	const problems = Object.values(health).map(p => `⚠ ${p.text}`)
	const open = kp.filter(p => p.state === 'needs_human')
	const learn = open.length ? `${open.length} topic${open.length > 1 ? 's' : ''} to learn: "review knowledge"` : ''
	const also = [running.length && `${running.length} running`, watching.length && `${watching.length} watching`, done.length && `${done.length} done since you last looked`].filter(Boolean).join(' · ')
	const more = also ? `Also: ${also}. Say "more <code>" for any item.` : ''
	if (!needs.length) return [`${MARK} Nothing needs you.`, ...problems, learn, more].filter(Boolean).join('\n')
	const eg = needs.find(w => !w.question) ?? needs[0]
	return [`${MARK} ${needs.length} need${needs.length > 1 ? '' : 's'} you`, ...problems, ...needs.slice(0, 6).map(line), ...(needs.length > 6 ? [`and ${needs.length - 6} more`] : []), learn, more, `Say "ok ${eg.code}", "more ${needs[0].code}", or "later ${needs[0].code}".`].filter(Boolean).join('\n')
}

export function renderPreview(wf: Workflow): string {
	return [`${MARK} ${wf.code} → "${wf.draft?.text ?? ''}"`, okWill(wf), `Reply "ok ${wf.code}" to send, or "edit ${wf.code}: ..." to change it.`].filter(Boolean).join('\n')
}

// One line per thing a run looked at: where, what, and how many hits, never what came back.
const hitCount = (n: number) => (n === 1 ? '1 hit' : `${n} hits`)
export const lookLine = (x: NonNullable<Workflow['looked']>[number]) =>
	x.tool === 'read' ? `Read ${x.q}${x.n ? '' : ' (not found)'}` : `${x.tool === 'knowledge' ? 'Your knowledge' : 'Teams'}: "${x.q}" (${hitCount(x.n)})`

export function renderMore(wf: Workflow, thread: Msg[], now: Date): string {
	const t = thread.slice(-10).map(m => `- ${m.from.name}: ${clip(oneLine(m.text), 200)}`)
	const src = (wf.draft?.sources ?? []).map(s => `- ${s.ref} (${s.tier}, ${s.origin})`)
	// What the owner approves comes first; the thread last, so a phone cutoff trims context, not the decision (review 01-04 P2-9).
	const changes = pendingEffects(wf.effects).map(e => `- ${clip(oneLine(changeSays(e)), 400)}`)
	const head = `${wf.code} · ${wf.asker?.name ?? 'Someone'} · ${wf.chat.name}\n${statusLine(wf, now)}`
	const card = cardLines(wf)
	const notes = (wf.notes ?? []).map(n => `- ${clip(oneLine(n.q), 120)}: ${n.a ? clip(oneLine(n.a), 300) : 'asking…'}`)
	const work = wf.work ? ['', `This work: ${wf.work.goal}. Done when ${wf.work.doneWhen}.`, ...(wf.work.plan ?? []).map(p => `${p.done ? '[x]' : '[ ]'} ${p.what} (${p.who}${p.in ? `, ${p.in}` : ''}${p.probe ? `, build ${p.probe.build}${p.seen ? ` ${p.seen}` : ''}` : ''})`), ...wf.work.steps.slice(-8).map(x => `- ${x.at.slice(5, 16).replace('T', ' ')} ${clip(oneLine(x.what), 160)}`)] : []
	return [head, ...work, '', ...(card.length ? card : ['Draft: none']), ...(notes.length ? ['', 'You asked:', ...notes] : []), ...(changes.length ? ['', okWill(wf), ...changes] : []), '', 'Sources:', ...(src.length ? src : ['- none']), ...(wf.looked?.length ? ['', 'Looked up:', ...wf.looked.map(x => `- ${lookLine(x)}`)] : []), '', 'Thread:', ...t].join('\n')
}

export function plain(md: string): string {
	return md.replace(/\*\*/g, '').replace(/^### /gm, '')
}
