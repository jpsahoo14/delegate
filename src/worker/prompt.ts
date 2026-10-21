import { retryNote } from '../runner/retry.ts'
import { NAME } from '../brand.ts'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Config, Job, Msg, Owner, Workflow } from '../core/types.ts'
import { gateBlock } from '../core/gate.ts'
import { intentPlaybook, intents } from '../core/intents.ts'
import { changeLine } from '../core/effects.ts'
import { DEPLOY } from '../core/deploy.ts'
import { scrub } from '../core/secrets.ts'

export { SKILL_DIR } from '../paths.ts'
import { SKILL_DIR } from '../paths.ts'

export type WorkContext = { home?: Workflow; works?: Workflow[]; parts?: Workflow[] }
export function buildPrompt(wf: Workflow, thread: Msg[], cfg: Config, root: string, owners: Owner[] = [], others: Workflow[] = [], corrected: string[] = [], ctx: WorkContext = {}): string {
	const contract = playbook(root, wf.kind)
	const file = (p: string) => (existsSync(join(root, p)) ? join(root, p) : 'none')
	const pending = new Set(wf.pending), mine = new Set(wf.msgIds)
	const mark = (id: string) => (pending.has(id) ? `>> [id:${id}]` : mine.has(id) ? ` * [id:${id}]` : '  ')
	const lines = thread.slice(-20).map(m => `${mark(m.id)} [${m.at}] ${m.byOwner ? `${cfg.owner.name} (owner)` : m.from.name}: ${m.text}`)
	const parts = [
		`You are preparing work for ${cfg.owner.name} (the owner). Workflow ${wf.id}, kind "${wf.kind}".`,
		'', 'Gates:', gateBlock(wf.kind),
		'', contract.trim(),
		'', 'Owner files:',
		`- profile: ${file('profile.md')}`,
		`- rules: ${file('rules.md')}`,
		`- knowledge index: ${file('knowledge/index.md')}`,
		...(cfg.cards?.team ? [`- team knowledge index: ${existsSync(join(cfg.cards.team, 'index.md')) ? join(cfg.cards.team, 'index.md') : 'none'}`] : []),
		`- knowledge folders: ${cfg.knowledge?.length ? cfg.knowledge.map(f => resolve(root, f)).join(', ') : 'none'}`,
		...(owners.length ? ['', 'Sessions the owner keeps for kinds of asks. If this ask is one of them, report a job with that owner id:', ...owners.map(o => `- ${o.id}: ${o.what}`)] : []),
		'', 'Intents (set exactly one):', ...intents(root).map(i => `- ${i.id}: ${i.when}`),
		'', `Chat: ${wf.chat.name}. Asker: ${[wf.asker, ...(wf.askers ?? [])].filter(Boolean).map(p => p!.name).join(', ') || 'unknown'}.${wf.chat.guests ? ' This chat has guests from outside the organization.' : ''}`,
		'Thread, oldest first. This item owns only the lines marked >> (new since your last run) and * (earlier). Other lines are context from other topics. Never answer them.',
		...lines,
	]
	if (others.length) parts.push('', 'Other open items in this chat. If the new message asks for the same thing as one of them, even from someone else, set `same` to its code and leave out reply:', ...others.map(o => `- ${o.code} · ${o.asker?.name ?? 'someone'}: "${(o.lastAsk ?? '').slice(0, 200)}"`))
	if (wf.kind === 'reply') parts.push('', ...allowed(cfg, 'every action the reply promises goes in `todos`'))
	if (corrected.length) parts.push('', 'How the owner corrected your recent drafts. Learn the pattern (tone, length, what they leave out or add). Never copy facts from these into this reply:', ...corrected.map(c => `- ${c}`))
	if (wf.earlier) parts.push('', `Earlier, closed: ${wf.earlier}`)
	const home = ctx.home ?? wf
	if (home.work) {
		const k = home.work, seen = wf.revAt, news = k.steps.filter(x => x.news && (!seen || x.at > seen))
		const where = (code?: string) => { const p = code && [home, ...(ctx.parts ?? [])].find(x => x.code === code); return p ? ` in ${p.code} (${p.chat.group ? p.chat.name : `1:1 with ${p.asker?.name ?? p.chat.name}`})` : '' }
		parts.push('', ctx.home
			? `This chat (${wf.code}) is part of ${home.code}'s work, which started in ${home.chat.name}. Continue it from its last state; report \`work\` with this run's step, the next step, and the plan. Reply here only to the people in this chat. Set \`work.closed\` only when its done-when holds.`
			: `This item is open work. Continue it from its last state, report \`work\` with this run's step, the next step, and the plan, and set \`work.closed\` only when its done-when holds.`,
			`Goal: ${k.goal}`, `Done when: ${k.doneWhen}`, ...(k.next ? [`Next (${k.next.who}): ${k.next.what}`] : []), ...(k.waitingOn ? [`Waiting on: ${k.waitingOn.who}${k.waitingOn.where ? ` in ${k.waitingOn.where}` : ''} since ${k.waitingOn.since.slice(0, 16).replace('T', ' ')}`] : []),
			...(k.links.length ? [`Links: ${k.links.join(', ')}`] : []),
			...(ctx.parts?.length ? [`Chats in this work: ${home.code} (${home.chat.name}, where it started)${ctx.parts.map(p => `, ${p.code} (${p.chat.group ? p.chat.name : `1:1 with ${p.asker?.name ?? p.chat.name}`})`).join('')}. Use these codes for plan steps' \`in\`.`] : []),
			...(k.plan?.length ? ['Plan (keep each id; mark done ones):', ...k.plan.map(p => `- [${p.id}] ${p.done ? 'done' : 'todo'} · ${p.who} · ${p.what}${where(p.in)}${p.probe ? ` · build ${p.probe.build}${p.seen ? `: ${p.seen}` : ''}` : ''}`)] : []),
			'Steps so far:', ...k.steps.slice(-12).map(x => `- ${x.at.slice(0, 16).replace('T', ' ')} ${x.what}`),
			...(news.length ? ['New since your last run (from its watch and build checks):', ...news.map(x => `>> ${x.what}`)] : []))
	}
	if (wf.startedBy === 'owner' && !wf.work && wf.missed) parts.push('', `The owner pointed at their own message from ${wf.missed.at.slice(0, 10)}; the messages after it are in the thread. If it started work they still own, set the plan to where things stand today.`)
	if (wf.before) parts.push('', `These messages came before the owner set up ${NAME}, and the owner has not answered them. First check the thread: if it was answered or resolved since, report no reply. If it still needs the owner, draft the reply; a few words of sorry for the late reply are fine. Knowledge may still be building, so when you cannot answer, a short holding reply or a question to the owner is fine.`)
	if (wf.needsMe) parts.push('', 'You closed this earlier as FYI, but the owner says it needs them. Draft the reply they should send; if you cannot tell what they want to say, ask them in `question`.')
	if (wf.startedBy === 'room') parts.push('', 'This message was sent to the whole group chat, not to the owner by name. Reply only if it is the owner\'s to handle: it is in an area the owner owns (check the owner\'s profile and knowledge_search for who owns it; open a linked PR to see what it changes), or only the owner can answer it. Otherwise report intent none with a one-line summary of why it is not theirs; nothing is shown to the owner.')
	if (wf.startedBy === 'owner' && !wf.work) parts.push('', 'The message marked >> is the owner\'s own. Decide whether the owner took on work they must see through (they volunteered, promised, or agreed to do something that takes more than one reply). If so, report `work` with goal, doneWhen, a plan, and links, and no reply. If not, report intent none.')
	if (ctx.works?.length) parts.push('', 'Open work that started in other chats. If this ask belongs to one of them, set `partOf` to its code and report `work` with this run\'s step:', ...ctx.works.map(w => `- ${w.code}: ${w.work!.goal}${w.work!.links.length ? ` (${w.work!.links.join(', ')})` : ''} · last: ${w.work!.steps.at(-1)?.what.slice(0, 120) ?? ''}`))
	if (wf.followUp) parts.push('', `This is a follow-up. The message marked >> is the owner's own ask to ${wf.followUp}, still unanswered. Draft a short, polite follow-up from the owner that says what is still needed. Add no new facts.`)
	if (wf.correction) parts.push('', `Your earlier reply in this chat was already sent: "${wf.correction.sent}"`, `The owner says it was ${wf.correction.kind}${wf.correction.note ? `: "${wf.correction.note}"` : '.'}`, 'Draft a short follow-up message for the same chat that fixes it. Say only what changes or was missing. Do not repeat what was right, and do not apologize at length.')
	if (wf.ownerAnswer) parts.push('', `The owner answered your question: "${wf.ownerAnswer}"`, `Your previous draft: "${wf.draft?.text ?? ''}"`)
	parts.push('', `Finish by calling submit_report with workflowId "${wf.id}".`)
	return scrub(parts.join('\n'))
}

// The owner asks Delegate about an item before deciding. It runs in the item's own session, so it already knows the work (design-spec S12).
export function buildAskPrompt(wf: Workflow, thread: Msg[], cfg: Config, root: string): string {
	const open = wf.notes?.find(n => n.a === undefined)
	const earlier = (wf.notes ?? []).filter(n => n.a !== undefined).slice(-4).flatMap(n => [`Owner: ${n.q}`, `You: ${n.a}`])
	return scrub([
		`You are helping ${cfg.owner.name} (the owner) decide on item ${wf.code}. Workflow ${wf.id}, kind "ask".`,
		'', 'Gates:', gateBlock('ask'),
		'', playbook(root, 'ask').trim(),
		'', `Chat: ${wf.chat.name}. Asker: ${wf.asker?.name ?? 'unknown'}.`,
		'Thread, oldest first:', ...thread.slice(-20).map(m => `- ${m.byOwner ? `${cfg.owner.name} (owner)` : m.from.name}: ${m.text}`),
		'', `Current draft reply: ${wf.draft?.text ? `"${wf.draft.text}"` : 'none'}`,
		...(wf.draft?.sources.length ? ['Its sources:', ...wf.draft.sources.map(s => `- ${s.ref} (${s.tier})`)] : []),
		...(earlier.length ? ['', 'Earlier in this conversation with the owner:', ...earlier] : []),
		'', `The owner asks: "${open?.q ?? ''}"`,
		'', `Finish by calling submit_report with workflowId "${wf.id}", intent "${wf.intent ?? 'other'}", state "needs_human", a one-line summary, and your answer in "answer".`,
	].join('\n'))
}

// One prompt for both job purposes: do the work, or make the approved changes (dev-spec/slices/04-long-jobs.md).
export function buildJobPrompt(job: Job, cfg: Config, root: string, o: { clone?: string; telemetry?: string[] } = {}): string {
	const kind = job.purpose === 'execute' ? 'execute' : job.key.startsWith('bootstrap:') ? 'bootstrap' : job.key.startsWith('learn:') ? 'learn' : job.every ? 'tracker' : 'job'
	const contract = playbook(root, kind)
	const parts = [
		`You are working for ${cfg.owner.name} (the owner). Job ${job.id}, about ${job.key}.`,
		'', 'Gates:', gateBlock(kind),
		'', contract.trim(),
	]
	if (kind === 'execute') {
		parts.push('', 'Approved changes, in order:', ...(job.result?.effects ?? []).map((e, i) => e.done || e.off ? '' : `${i}. ${JSON.stringify(e)}`).filter(Boolean))
	} else {
		const k = (p: string) => (existsSync(join(root, p)) ? join(root, p) : 'none')
		if (job.until) parts.push('', `Stop when: ${job.until}`, `Last result: ${job.result?.summary ?? 'none yet'}`)
		parts.push('', `Goal: ${job.goal}`, `Time: about ${cfg.jobs?.minutes ?? 30} minutes`, `Repo: ${job.repo ?? job.remote ?? 'none'}${!job.repo && job.remote ? (o.clone ? `, cloned at ${o.clone}` : '; no clone on this machine, so read its files through Azure DevOps') : ''}`, `Knowledge folders: ${cfg.knowledge?.map(f => resolve(root, f)).join(', ') || 'none'}. Profile: ${k('profile.md')}.`)
		if (job.asks.length) parts.push('', 'Asks, oldest first:', ...job.asks.map(a => `- ${a}`))
		if (job.retry) parts.push('', retryNote(job.retry), ...(job.result?.summary ? [`Your earlier result: ${job.result.summary}`] : []))
		if (kind === 'job' || kind === 'tracker') parts.push('', ...allowed(cfg, 'propose none'))
		const extra = intentPlaybook(root, intents(root).find(i => i.id === job.intent))
		if (extra) parts.push('', extra.trim())
		if (job.intent === 'validate') parts.push('', ...validateLines(cfg, o.telemetry))
	}
	parts.push('', `Finish by calling submit_report with workflowId "${job.id}".`)
	return scrub(parts.join('\n'))
}

// Continue: the first turn of the owner's window. Says what is open, what the owner can do, and how to hand back (R-HIL-17).
export function orientation(code: string, id: string, status: string, draft: string | undefined, effects: string[]): string {
	return [
		`You're continuing ${code} with the owner. Status: ${status.replace(/[.\s]+$/, '')}.`,
		draft ? `Current draft reply: "${draft}"` : 'There is no draft reply yet.',
		effects.length ? `Proposed changes: ${effects.map(e => e.replace(/[.\s]+$/, '')).join('; ')}.` : '',
		`Summarize where this stands in three lines, then wait for the owner.`,
		`When the owner says what to send or change, call the delegate tool submit_report with workflowId "${id}", the reply, and any effects. After this window closes, the Assistant shows it to the owner as a preview for one final ok.`,
		`Closing this window hands ${code} back to the Assistant.`,
	].filter(Boolean).join('\n')
}

// An owner can replace a playbook with their own file of the same name; the gates still come first (R-PKG-04).
function playbook(root: string, kind: string): string {
	const own = join(root, 'playbooks', `${kind}.md`)
	return readFileSync(existsSync(own) ? own : join(SKILL_DIR, 'workflows', `${kind}.md`), 'utf8')
}

// The changes a separate run may make after the owner's ok, each with what it does; anything else is not proposed (next action).
// A deploy is listed only with the pipelines the owner confirmed, by ID (owned work).
function allowed(cfg: Config, none: string): string[] {
	const e = cfg.agent.effectTools ?? [], d = cfg.deploy?.allowed ?? []
	const lines = [...e.map(x => `- ${changeLine(x)}`), ...(d.length ? [`- ${changeLine(DEPLOY)}. Only these pipelines, by ID: ${d.map(t => `${t.ring} ${t.pipelineId}${t.project ? ` (${t.project})` : ''}`).join(', ')}`] : [])]
	return lines.length ? ['Changes a separate run may make after the owner\'s ok, for `effects` (tool, or tool:action):', ...lines] : [`No changes are allowed, so ${none}.`]
}

// What a validate job is told that code decides: where it may deploy, and whether it can read telemetry. Its repo and clone are on the Repo line.
function validateLines(cfg: Config, telemetry: string[] = []): string[] {
	const d = cfg.deploy?.allowed ?? []
	return [
		d.length ? `Where you may deploy (by pipeline ID; any other is refused): ${d.map(t => `${t.ring} ${t.pipelineId}`).join(', ')}.` : 'No deploy pipeline is confirmed yet: report deployTargets with every deploy pipeline the repo\'s own config lists, and propose no deploy.',
		telemetry.length ? `Telemetry: read it with ${telemetry.join(', ')}.` : 'Telemetry: no telemetry tool server is set up, so you cannot read it. Say in the report that telemetry was not read.',
	]
}
