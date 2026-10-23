import type { Store } from '../store/state.ts'
import type { Parsed } from '../core/verbs.ts'
import { parseVerbs } from '../core/verbs.ts'
import { hashOf } from '../knowledge/format.ts'
import { card, knowledge as knowledgeCard, readingOf, view, who as displayWho, type ItemCard, type SourceRow, type Who } from './view.ts'
import { nextView, snapshot as placementSnapshot, place, todoHeadline, type NextRow } from './next.ts'
import { emptyEntities, snapshotSchema, type Action, type Intent, type Snapshot } from './react/domain/contracts.ts'
import { knowledgeOf } from '../runner/proposals.ts'
import { find } from './app/model/find.ts'
import { freshOf, rowMark } from './app/model/derive.ts'
import { NAME } from '../brand.ts'
import { isPersona } from '../core/intake.ts'
import { PAGE_REPLY_CHANGED, automationApprovalRev, pageChangeId, pageDigest, pageOptionId, proposalApprovalRev, workflowApprovalRev } from '../core/page-approval.ts'
import type { Config, PageApproval, Workflow } from '../core/types.ts'
import { meaningParts, pendingEffects, refusal, shown } from '../core/effects.ts'
import { byDate, forPage, sourceChip } from './app/model/format.ts'
import { isNew, itemSeen, newCount, seenIn, sinceOf } from './app/model/derive.ts'
import { byEnd, watchItemTarget, watchTarget } from '../runner/track.ts'
import { watchChannel, actResult } from '../mcp/server.ts'
import { answerAutomation, propose as proposeAutomation } from '../runner/automations.ts'
import { report as reportProblem } from '../store/feedback.ts'
import { parseChannelLink } from '../adapters/channels.ts'
import { BY, newReminder, peopleOf } from './app/model/forms.ts'
import { approvedReplyText, currentDraft, reopenable } from '../core/policy.ts'
import { madeBefore, maybeOf } from '../runner/ledger.ts'
import { stillApproved } from '../runner/jobs.ts'
import { prTarget } from '../runner/probe.ts'
import { pageText } from './page-text.ts'
import { pageManagementRev, workflowManagementRev } from '../store/page-revision.ts'
import { active } from '../runner/work.ts'
import { habitUndoable, undoMs } from '../runner/habits.ts'

type Immediate = { accepted: boolean; text: string }
export type Binding = { action: Action; resolve: (input: Intent['input']) => Parsed; execute?: (input: Intent['input']) => Immediate; management?: boolean }
export class IntentError extends Error {
	readonly status: number
	constructor(status: number, message: string) { super(message); this.status = status }
}
const safeLink = (link?: string) => link && /^https:/i.test(link) ? link : undefined
const requiredText = (input: Intent['input']) => {
	if (!input?.text?.trim()) throw new IntentError(422, 'Enter your text first.')
	return input.text
}
const failedJobDirections = (workflow?: Workflow) => workflow?.status?.startsWith('The job did not finish:') &&
	workflow.question === `Answer ${workflow.code} to retry with directions, or skip it`
const ownerOf = (who: string) => who === 'you' ? { kind: 'you' as const } : who === 'me' ? { kind: 'delegate' as const } : { kind: 'others' as const, text: who === 'them' ? 'Others' : who }
const presentationRev = (workflow: Workflow, cfg: Config): string => {
	const rev = workflowApprovalRev(workflow), draft = workflow.draft
	if (workflow.state !== 'needs_human' || !draft) return rev
	const text = approvedReplyText(draft.text, workflow, cfg)
	return text === draft.text ? rev : pageDigest([rev, text])
}

// The Settings tab names a marked chat's "Mark normal again" action by this key, without building the page (bug 10-23 perf).
export const chatLevelKey = (chatId: string) => `chat:${hashOf(chatId)}`
export const chatNormalActionId = (chatId: string) => `${chatLevelKey(chatId)}/chat-normal`

export function reactProjection(store: Store, query = '', visit?: { since?: string; fallbackSince: string }): { snapshot: Snapshot; bindings: Map<string, Binding> } {
	const stored = placementSnapshot(store)
	const facts = { ...stored, workflows: stored.workflows.map(workflow => currentDraft(workflow, workflow.job ? stored.jobs.get(workflow.job) : undefined) === workflow.draft ? workflow : { ...workflow, draft: undefined }) }
	const placed = place(facts), placementOf = new Map(placed.map(placement => [placement.code, placement])), cfg = store.config()
	// A first visit has no cursor; its newly written lastViewed mark is not one.
	const since = visit ? visit.since : store.lastViewed()
	const base = view(store, since, new Date(facts.now), facts.workflows), next = nextView(store, facts.now, { snapshot: facts, allCatchup: true }), entities = emptyEntities()
	const bindings = new Map<string, Binding>(), workflows = facts.workflows, byCode = new Map(workflows.map(w => [w.code, w]))
	const expectations = new Map<string, string>()
	const managementRevisions = new Map<string, string | undefined>()
	const readyCards = new Map(base.needs.map(item => [item.code, item])), knowledge = knowledgeOf(store, store.config())
	const asksAt = new Map<string, string>()
	for (const workflow of workflows) {
		const message = store.thread(workflow.id).find(message => message.id === workflow.lastMsgId && !message.byOwner)
		if (message) asksAt.set(workflow.code, message.at)
	}
	function person(code: string, who: Who): string {
		const id = `person:${hashOf(byCode.get(code)?.asker?.id ?? code)}`
		entities.people[id] = { id, ...(byCode.get(code)?.startedBy === 'owner' ? displayWho('You') : who) }
		return id
	}
	function sources(itemId: string, prefix: string, rows: SourceRow[]): string[] {
		return rows.map((row, n) => {
			const id = `${prefix}/source/${n}`
			entities.sources[id] = { ...row, id, itemId, href: safeLink(row.href) }
			return id
		})
	}
	function notes(itemId: string, prefix: string, rows: ItemCard['notes']): string[] {
		return rows.map((row, n) => {
			const id = `${prefix}/note/${n}`
			const sourceIds = sources(itemId, id, (row.sources ?? []).map(source => ({
				kind: source.tier === 'private' ? 'Private' : source.tier === 'card' ? 'Knowledge' : 'In the chat',
				label: source.label ?? (/^https:/.test(source.ref) ? sourceChip(source) : source.tier === 'card' ? 'Knowledge source' : 'Private source'), href: safeLink(source.ref), stale: source.stale, locked: source.tier === 'private',
			})))
			entities.notes[id] = { id, itemId, question: row.q, answer: row.a === undefined ? undefined : pageText(row.a), at: row.at, sourceIds }
			return id
		})
	}
	function offer(item: string, rev: string, kind: string, label: string, resolve: Binding['resolve'], options: Partial<Pick<Action, 'input' | 'effect' | 'staleness' | 'expect' | 'todoIds' | 'unavailable' | 'needsConfirm' | 'meaning' | 'expiresAt' | 'selection' | 'recovery'>> = {}, prefix = item): string {
		const id = `${prefix}/${kind}`
		if (options.staleness === undefined && !managementRevisions.has(item)) {
			const workflow = byCode.get(item)
			const jobId = workflow?.work?.watch ?? workflow?.job
			managementRevisions.set(item, workflow ? workflowManagementRev(workflow, jobId ? facts.jobs.get(jobId) : undefined) : pageManagementRev(store, item))
		}
		const managementRev = options.staleness === undefined ? managementRevisions.get(item) : undefined
		const action: Action = { id, item, rev: rev || managementRev || '', kind, label, effect: 'local', staleness: 'none', ...(managementRev ? { staleness: 'exact', expect: managementRev } : {}), ...options }
		entities.actions[id] = action
		bindings.set(id, { action, resolve, management: !!managementRev })
		return id
	}
	// "Continue in a terminal" (spec S7, owner 10-23): the terminal opens on the machine whose runner reads the chats, which may not
	// be the one showing the page; it is named then. With no runner reading, or the window already open, it is unavailable, with why.
	function continueOffer(item: string, rev: string, kind: string, openOn?: string): string {
		const reading = readingOf(store), runner = reading.machine, elsewhere = !!runner && runner !== store.machine
		const label = `Continue in a terminal${elsewhere ? ` on ${runner}` : ''}`
		const off = reading.state === 'off' || reading.state === 'never' || !runner
		const unavailable = openOn ? { label, reason: `Already open on ${openOn}.` } : off ? { label, reason: `${NAME} isn't running on any machine, so there is no session to open.` } : undefined
		return offer(item, rev, kind, label, () => {
			if (unavailable) throw new IntentError(409, unavailable.reason)
			return { code: item, verb: 'continue' }
		}, {
			meaning: elsewhere ? `Opens this item's AI session in a terminal on ${runner}, not on this computer. Go to that machine to use it. ${NAME} leaves the item alone until you close that window, then picks up the result.`
				: `Opens this item's AI session in a terminal on this computer, so you can take over or look at the work. ${NAME} leaves the item alone until you close that window, then picks up the result.`,
			...(unavailable ? { unavailable } : {}),
		})
	}
	// Spec S9: where a step happens, and what happened, in words; never an item code or a raw reference (part:, job:, sent:, owner:).
	const isCode = (token: string) => /^[A-Z]\d{1,5}$/.test(token) && byCode.has(token)
	const chatWords = (code: string) => { const w = byCode.get(code); return w ? w.chat.group ? w.chat.name : `${(w.asker?.name ?? '').split(/\s+/)[0]} · 1:1` : undefined }
	const whereWords = (home: string, where?: string) => !where ? undefined : !isCode(where) ? where : where === home ? 'this chat' : chatWords(where)
	const plainText = (text: string) => text
		.replace(/\s*\(([^()]*?),\s*([A-Z]\d{1,5})\)/g, (all, inner, code) => isCode(code) ? ` · ${inner}` : all)
		.replace(/\s*\(([A-Z]\d{1,5})\)/g, (all, code) => isCode(code) ? '' : all)
		.replace(/\b(?:part|job|sent|owner|completion|row):[^\s,;)]+/g, '')
		.replace(/\b([A-Z]\d{1,5})(:\s|\b)/g, (all, code, tail) => isCode(code) ? tail.trim() ? '' : '' : all)
		.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim()
	function markTodos(code: string, todos: NonNullable<Workflow['kept']>, kind = 'todo-done', prefix = code): string {
		const expect = pageDigest(todos.map(todo => [todo.id, todo.text, todo.at]))
		return offer(code, expect, kind, kind === 'todo-row-done' ? 'Mark done' : todos.length === 1 ? 'Mark to-do done' : `Mark ${todos.length} to-dos done`,
			() => ({ code, verb: 'close' }), {
				staleness: 'exact', expect, todoIds: todos.map(todo => todo.id),
				...(kind === 'classic-close' ? { needsConfirm: true, meaning: `Mark exactly these to-dos done?\n\n${todos.map(todo => `- ${todo.text}`).join('\n')}\n\n${code} stays ${byCode.get(code)?.state === 'done' ? 'done' : 'open'}. Nothing is sent.` } : {}),
			}, prefix)
	}
	function closeWork(code: string, kind: string, prefix = code): string {
		const rev = entities.items[code].rev
		const blocked = byCode.get(code)?.kept?.some(todo => !todo.done)
		const reason = 'Mark the listed to-dos done in the opened item before closing this work.'
		return offer(code, rev, kind, 'Close', () => {
			if (blocked) throw new IntentError(409, reason)
			return { code, verb: 'close' }
		}, { staleness: 'exact', expect: rev, ...(blocked ? { unavailable: { label: 'Close', reason } } : {}) }, prefix)
	}
	function tool(item: string, kind: string, label: string, execute: NonNullable<Binding['execute']>, input?: Action['input'], prefix = 'page', rev?: string): string {
		const id = offer(item, rev ?? '', kind, label, () => { throw new IntentError(422, 'This is not a queued item command.') }, { input, ...(rev ? { staleness: 'exact', expect: rev } : {}) }, prefix)
		bindings.get(id)!.execute = execute
		return id
	}
	function watchFyi(workflow: Workflow, label: string, prefix: string, rev: string, defaults?: { target?: string; until?: string }, form = true): string {
		return tool(workflow.code, 'watch-fyi', label, input => {
			if (input?.by && !byEnd(input.by)) throw new IntentError(422, 'Choose a valid date.')
			const result = watchItemTarget(store, workflow, { target: input?.text?.trim() || defaults?.target,
				until: input?.until === undefined ? defaults?.until : input.until.trim(), by: input?.by || undefined, shepherd: input?.push })
			return { accepted: result.accepted, text: pageText(result.text) }
		}, form ? 'watch' : undefined, prefix, rev)
	}
	const stoppedCodes = new Set(next.move.filter(row => row.kind === 'stopped').map(row => row.act))
	const recoveryCodes = new Set([...stoppedCodes, ...workflows.filter(workflow => workflow.state === 'needs_human' && workflow.job && facts.jobs.get(workflow.job)?.state === 'failed').map(workflow => workflow.code)])
	const editable = new Set([...workflows.filter(workflow => workflow.state === 'needs_human').map(workflow => workflow.code), ...stoppedCodes])
	for (const wf of workflows) {
		const c = readyCards.get(wf.code) ?? card(store, wf, knowledge), id = c.code, rev = presentationRev(wf, cfg)
		const recovery = recoveryCodes.has(id)
		const { who, chat, draft, changes, notes: cardNotes, why, work, replyOnly, reviewAgain, ...rest } = c
		const personId = person(id, who), chatId = `chat:${hashOf(wf.chat.id)}`
		entities.chats[chatId] = { ...chat, id: chatId }
		const draftId = draft ? `${id}/draft` : undefined
		if (draft && draftId) {
			const sendText = approvedReplyText(draft.text, wf, cfg)
			entities.drafts[draftId] = { ...draft, sendText: sendText === draft.text ? undefined : sendText, id: draftId, itemId: id, rev }
		}
		const pending = (wf.effects ?? []).filter(effect => !effect.done && !effect.off)
		const approved = stillApproved(wf, wf.job ? facts.jobs.get(wf.job) : undefined)
		const changeIds = changes.map((change, n) => {
			const key = `${id}/change/${pageChangeId(pending[n])}`
			const blocked = refusal(cfg, pending[n], prTarget(store, wf))
			entities.changes[key] = { ...change, id: key, itemId: id, rev, state: maybeOf(store, pending[n]) ? 'uncertain' : approved ? 'approved' : 'proposed',
				error: blocked ? `This change cannot be made: ${blocked}.` : pending[n].error ? pageText(pending[n].error) || 'The change could not be confirmed. Check the target before retrying.' : undefined }
			return key
		})
		const effectIds = [...new Set((wf.effects ?? []).map((effect, index) => {
			const key = `${id}/change/${pageChangeId(effect)}`
			if (!entities.changes[key]) {
				const display = shown(effect)
				entities.changes[key] = {
					id: key, itemId: id, rev, n: index + 1, summary: display.text, target: display.loc || display.system, system: display.system,
					action: display.line, detail: display.detail || undefined, meaning: meaningParts(effect),
					state: effect.done || madeBefore(store, effect) ? 'made' : effect.off ? 'left-out' : maybeOf(store, effect) ? 'uncertain' : approved ? 'approved' : 'proposed',
				}
			}
			return key
		}))]
		const todoIds = (wf.kept ?? []).filter(todo => !todo.done).map(todo => {
			const key = `${id}/todo/${todo.id}`
			entities.todos[key] = { ...todo, id: key, itemId: id, code: id, done: false }
			return key
		})
		const workId = work ? `${id}/work` : undefined
		if (work && workId) {
			const planIds = work.plan.map((step, position) => {
				const key = `${workId}/plan/${position}`
				entities.planSteps[key] = { ...step, what: plainText(step.what), where: whereWords(id, step.where), id: key, workId, position, owner: ownerOf(step.who), now: false }
				return key
			})
			const stepIds = work.steps.map((step, position) => {
				const key = `${workId}/step/${position}`
				entities.workSteps[key] = { ...step, what: plainText(step.what), id: key, workId }
				return key
			})
			entities.work[workId] = { ...work, id: workId, itemId: id, stepIds, planIds, total: stepIds.length }
		}
		const actionIds: string[] = []
		const expect = rev
		expectations.set(id, expect)
		const approval = (input: Intent['input']): Parsed => {
			const excluded = [...new Set(input?.excluded ?? [])]
			if (excluded.some(n => !changes.some(change => change.n === n))) throw new IntentError(422, 'That change is not offered.')
			if (input?.text !== undefined) throw new IntentError(422, 'Use Send your version to send an edit.')
			return { code: id, verb: 'ok', ...(excluded.length ? { except: excluded } : {}) }
		}
		const comments = changes.length > 0 && changes.every(change => /comment|review/i.test(change.action))
		const selection: Action['selection'] = changes.length ? {
			total: changes.length, verb: comments ? 'Post' : 'Make', singular: comments ? 'comment' : 'change', plural: comments ? 'comments' : 'changes',
			suffix: draft ? ' and reply' : '', empty: draft ? 'Send reply only' : 'Nothing selected', allowEmpty: !!draft,
			exactSingle: !draft && changes.length === 1 ? changes[0].action : undefined,
		} : undefined
		if (editable.has(id)) {
			if (reviewAgain) actionIds.push(offer(id, rev, 'review-again', 'Review again', () => ({ code: id, verb: 'answer', text: 'review again' })))
			else if ((draft && (!c.choices || draft.preview) || changes.length && !c.question || c.promise?.failed) &&
				!(wf.state === 'needs_human' && wf.question && !(c.promise?.failed && !draft))) {
				const label = c.promise?.failed && !draft ? 'Check again' : changes.length ? `Approve selected changes${draft ? ' and reply' : ''}` : draft?.holding ? 'Send holding reply' : 'Send'
				actionIds.push(offer(id, rev, 'approve', label, approval, { effect: c.promise?.failed && !draft ? 'local' : draft && !changes.length ? 'sends' : 'changes-system', staleness: 'exact', expect, input: changes.length ? 'approval' : undefined, selection }))
				if (pending.some(effect => maybeOf(store, effect))) actionIds.push(offer(id, rev, 'approve-again', 'I checked: make the changes once', input => ({ ...approval(input), again: true }), {
					effect: 'changes-system', staleness: 'exact', expect, input: 'approval', needsConfirm: true,
					meaning: 'Choose this only after checking the target system and confirming these changes were not made. This permits one new attempt.',
					selection: selection && { ...selection, verb: 'I checked: make', suffix: ` once${draft ? ' and reply' : ''}`, exactSingle: undefined },
				}))
			}
			if (draft) actionIds.push(offer(id, rev, 'send-edit', changes.length ? 'Preview your version with changes' : 'Send your version', input => {
				if (input?.excluded?.length) throw new IntentError(422, 'Change the reply and leave out changes one at a time.')
				return { code: id, verb: 'send', text: requiredText(input) }
			}, { effect: changes.length ? 'local' : 'sends', staleness: 'exact', expect, input: 'text' }))
			actionIds.push(offer(id, rev, 'answer', 'Draft reply', input => ({ code: id, verb: 'answer', text: requiredText(input) }), { input: 'text', recovery: recovery || undefined }))
			if (c.choices) actionIds.push(offer(id, rev, 'pick', 'Preview reply', input => {
				const picks = [...new Set(input?.picks ?? [])]
				if (!picks.length || picks.some(n => n > c.choices!.options.length) || !c.choices!.multi && picks.length !== 1) throw new IntentError(422, 'Pick an offered option.')
				return { code: id, verb: 'pick', nums: picks }
			}, { input: 'picks', staleness: 'exact', expect }))
			actionIds.push(offer(id, rev, 'later', 'Later', () => ({ code: id, verb: 'later' })), offer(id, rev, 'dismiss', recovery || c.promise ? 'Skip' : 'Dismiss', () => ({ code: id, verb: 'skip' })))
			if (replyOnly) actionIds.push(offer(id, rev, 'reply-only', 'Send reply only', () => ({ code: id, verb: 'ok', except: changes.map(change => change.n) }), { staleness: 'exact', expect, effect: 'sends' }))
		}
		else if (wf.job && facts.jobs.get(wf.job)?.state === 'queued' && facts.jobs.get(wf.job)?.retry) {
			actionIds.push(offer(id, rev, 'dismiss', 'Dismiss', () => ({ code: id, verb: 'skip' }), { staleness: 'exact', expect }))
		}
		actionIds.push(offer(id, rev, 'ask', `Ask ${NAME}`, input => ({ code: id, verb: 'ask', text: requiredText(input) }), { input: 'text' }))
		if (reopenable(wf, 'answer')) actionIds.push(offer(id, rev, 'reopen', 'Reopen and draft reply', input => ({ code: id, verb: 'answer', text: requiredText(input) }), { input: 'text', staleness: 'exact', expect }))
		const noteIds = notes(id, id, cardNotes)
		for (const noteId of noteIds) {
			const note = entities.notes[noteId]
			if (note.answer?.trim()) note.useActionId = offer(id, rev, 'use-note', 'Use this in the reply', () => ({ code: id, verb: 'answer', text: `Use this: ${note.answer}` }), { staleness: 'exact', expect: pageDigest(note.answer) }, noteId)
		}
		if (c.openOn || wf.job) actionIds.push(continueOffer(id, rev, 'continue', c.openOn))
		const checkBack = wf.work?.watch ? facts.jobs.get(wf.work.watch) : undefined
		if (active(wf) && checkBack?.every) {
			if (checkBack.endsAt) actionIds.push(offer(id, rev, 'extend-watch', 'Extend 7 days', () => ({ code: id, verb: 'extend' })))
			actionIds.push(offer(id, rev, 'stop-watch', 'Stop', () => ({ code: id, verb: 'unwatch' }), { meaning: 'Stops only this check-back. Work and to-dos stay open.' }))
		}
		if (todoIds.length) {
			actionIds.push(markTodos(id, wf.kept!.filter(todo => !todo.done)))
		}
		const job = wf.job ? facts.jobs.get(wf.job) : undefined
		const agentWait = facts.agentWait && (wf.state === 'running' || wf.state === 'waiting_on_task' && job?.state === 'queued' || job?.state === 'failed' && job.error === facts.agentWait.text) ? facts.agentWait.text : undefined
		const stopped = wf.state === 'waiting_on_task' && (!job || job.state === 'failed' || job.state === 'done')
		const replyChanged = wf.state === 'needs_human' && wf.status === PAGE_REPLY_CHANGED
		// A send the engine refused (owner words claiming an approval the PR does not show, an unverifiable PR) says why on the card (bug 10-23 E35).
		const notSent = !replyChanged && wf.state === 'needs_human' && (!!draft && /^(?:Not sent: |Not sure it was sent)/.test(wf.status) || /^Could not start: /.test(wf.status))
		entities.items[id] = {
			...rest, rev, id, personId, chatId, draftId, changeIds, effectIds, todoIds, workId, actionIds,
			askAt: asksAt.get(id),
			status: pageText(c.status),
			attention: replyChanged ? PAGE_REPLY_CHANGED : agentWait ?? (notSent ? pageText(wf.status) : recovery || stopped || c.draft?.holding ? pageText(job?.error ?? wf.status) || 'The previous run could not finish. Use the available action, ask a question or review the visible holding reply.' : !draft && job?.state === 'done' && job.result && !job.result.reply && wf.status.endsWith(job.result.summary) ? pageText(job.result.summary) : undefined),
			attentionKind: replyChanged ? 'reply-changed' : agentWait ? 'agent-setup' : recovery || stopped || c.draft?.holding ? 'run-failed' : undefined,
			question: c.question === undefined ? undefined : (failedJobDirections(wf) ? forPage(c.question) : pageText(c.question)) || undefined,
			choices: c.choices && { ...c.choices, prompt: forPage(c.choices.prompt), options: c.choices.options.map(option => ({ ...option, id: pageOptionId(option) })) },
			sourceIds: sources(id, id, why.sources), noteIds,
			primaryActionId: recovery ? `${id}/answer` : ['review-again', 'approve-again', ...(c.choices && !draft?.preview ? ['pick'] : []), 'approve', 'answer', 'reopen'].map(kind => `${id}/${kind}`).find(key => actionIds.includes(key)),
			why: { reason: why.reason, confidence: why.confidence, gaps: why.gaps, searched: why.searched }, teams: safeLink(c.teams),
		}
	}
	// Spec S3: the sections say whose move it is, Delegate's queued rows say Delegate does them, and a group message is "Posted to everyone".
	const s3 = (row: NextRow): NextRow => {
		const subject = byCode.get(row.act), first = (subject?.asker?.name ?? '').split(/\s+/)[0]
		const headline = subject?.startedBy === 'room' && subject.state === 'running' && first ? `${NAME} is checking whether ${first}'s message needs you`
			: row.headline.replace(/^Draft a reply to /, `${NAME} will draft a reply to `)
		return { ...row, headline, chips: row.chips.map(chip => chip.kind === 'room' ? { ...chip, text: 'Posted to everyone' } : chip) }
	}
	// Rows that wait on Delegate are Delegate's, never "Waiting on others" (spec S3); watches and reminders stay with others.
	const onDelegate = (row: NextRow) => row.kind === 'waiting-delegate' || row.kind === 'working'
	const sections: Snapshot['sections'] = ([
		['move', 'Waiting on you', next.move], ['working', `${NAME} is on it`, [...next.working, ...next.waiting.filter(onDelegate).map(row => ({ ...row, section: 'working' as NextRow['section'] }))]],
		['waiting', 'Waiting on others', next.waiting.filter(row => !onDelegate(row))], ['catchup', 'Catch up', next.catchup.rows],
	] as const).map(([id, label, rows]) => ({
		id, label, total: rows.length, ids: rows.map(s3).map((row, position) => {
			const { who, primary, more, draft: _draft, rev: rowRev, work, todos, ...rest } = row
			const actionIds: string[] = []
			for (const [n, action] of [primary, ...(more ?? [])].entries()) {
				if (!action?.command) continue
				const parsed = parseVerbs(action.command)
				if (parsed?.length !== 1) throw new Error(`Unsupported server row action: ${row.kind}`)
				const offered = parsed[0]
				const code = offered.code ?? row.act, subject = byCode.get(code)
				if (offered.verb === 'watch' && row.section === 'catchup' && subject?.fyi) {
					actionIds.push(watchFyi(subject, action.label, `row:${row.code}`, presentationRev(subject, cfg), undefined, false))
					continue
				}
				if (offered.verb === 'close') {
					actionIds.push(row.kind === 'todo'
						? markTodos(code, subject!.kept!.filter(todo => !todo.done).slice(0, 1), 'todo-row-done', `row:${row.code}`)
						: closeWork(code, `row-${n}`, `row:${row.code}`))
					continue
				}
				const canonical = offered.verb === 'ok' ? entities.actions[`${code}/approve`] : undefined
				if (canonical && !offered.nums?.length && !offered.except?.length) { actionIds.push(canonical.id); continue }
				const exact = ['ok', 'send', 'edit', 'pick', 'undo'].includes(offered.verb) && !code.startsWith('W')
				const auto = store.automation(code)
				if (auto && (offered.verb === 'pause' || offered.verb === 'resume')) { actionIds.push(`${code}/toggle`); continue }
				const rev = subject ? presentationRev(subject, cfg) : auto ? automationApprovalRev(auto) : ''
				const item = entities.items[code]
				actionIds.push(offer(code, rev, `row-${n}`, action.label, input => ({
					...offered, code,
					...(offered.text?.includes('{text}') ? { text: offered.text.replace('{text}', () => requiredText(input)) } : {}),
				}), {
					input: action.command.includes('{text}') ? 'text' : undefined,
					...(exact ? { staleness: 'exact' as const, expect: expectations.get(code) ?? (auto ? automationApprovalRev(auto) : undefined) } : {}),
					effect: offered.verb === 'ok' && !code.startsWith('W') ? item?.draftId && !item.changeIds.length ? 'sends' : 'changes-system' : 'local',
				}, `row:${row.code}`))
			}
			if (row.section === 'waiting') actionIds.push(...(entities.items[row.act]?.actionIds.filter(id => ['extend-watch', 'stop-watch'].includes(entities.actions[id].kind)) ?? []))
			const todoIds = (todos ?? []).map(todo => {
				const key = `${todo.code}/todo/${todo.id}`
				entities.todos[key] = { ...todo, id: key, itemId: todo.code, done: false }
				return key
			})
			const workId = work ? `row:${row.code}/work` : undefined
			if (work && workId) {
				const planIds = work.steps.map((step, n) => {
					const key = `${workId}/plan/${n}`
					entities.planSteps[key] = { ...step, what: plainText(step.what), where: whereWords(row.act, step.where), id: key, workId, position: n }
					return key
				})
				const stepIds = work.happened.map((step, n) => {
					const key = `${workId}/step/${n}`
					entities.workSteps[key] = { ...step, what: plainText(step.what), id: key, workId }
					return key
				})
				const reportActionId = work.report ? offer(row.act, entities.items[row.act]?.rev ?? rowRev ?? '', 'report', 'Draft my report', input => {
					if (!input?.result) throw new IntentError(422, 'Choose a result first.')
					return { code: row.act, verb: 'answer', text: `${input.result}${input.text?.trim() ? `: ${input.text}` : ''}` }
				}, { input: 'report' }) : undefined
				const cardWorkId = entities.items[row.act]?.workId, cardWork = cardWorkId ? entities.work[cardWorkId] : undefined
				entities.work[workId] = { ...cardWork, id: workId, itemId: row.act, goal: work.goal, due: cardWork?.due ?? false, proposed: cardWork?.proposed ?? false, planIds, stepIds, total: work.total, yours: work.yours, then: work.then, reportActionId }
			}
			const fresh = freshOf(row, rowMark(base, row))
			const authoritative = placementOf.get(row.code)
			if (!authoritative) throw new Error(`The row ${row.code} has no authoritative server placement.`)
			const workflow = byCode.get(row.act), askedAt = asksAt.get(row.act)
			const headline = (failedJobDirections(workflow) && row.kind === 'question' ? forPage(row.headline) :
				pageText(row.kind === 'todo' ? todoHeadline(byCode.get(row.act)!.kept!.find(todo => !todo.done)!.text) : row.headline)) || 'Review this item'
			const nextWhat = pageText(row.next?.what).replace(/\s+/g, ' ').trim(), owner = row.next?.owner
			const nextText = !owner ? undefined : owner.kind === 'others' ? pageText(owner.text).replace(/\s+/g, ' ').trim() :
				owner.kind === 'you' ? nextWhat ? `You: ${nextWhat}` : 'You' :
					owner.kind === 'nobody' ? nextWhat || `nobody has started this; Do it now hands it to ${NAME}` :
						!nextWhat ? NAME : /^(after|back)\b/.test(nextWhat) ? nextWhat : `${NAME} ${nextWhat}`
			entities.placements[row.code] = {
				...rest, headline, nextText, warn: row.warn ? pageText(row.warn) : undefined, facts: {
					...row.facts, ...(row.facts.verb === 'asked' && workflow ? { at: askedAt ?? workflow.createdAt, verb: askedAt ? 'asked' : 'item created' } : {}),
					notes: row.facts.notes?.map(note => ({ ...note, text: pageText(note.text) })),
				},
				chips: [...row.chips, ...(fresh ? [{ kind: fresh, text: fresh === 'back' ? 'Back to you' : 'New' }] : [])],
				id: row.code, subjects: authoritative.subjects, position, personId: who ? person(row.act, who) : undefined, rowRev, actionIds, todoIds, workId, teams: safeLink(row.teams),
			}
			if (row.kind === 'track' && actionIds[0]) {
				const item = entities.items[row.act]
				item.actionIds.unshift(actionIds[0])
				item.primaryActionId = actionIds[0]
				const skip = item.actionIds.map(id => entities.actions[id]).find(action => action.kind === 'dismiss')
				if (skip) skip.label = 'Skip'
			}
			return row.code
		}),
	}))
	const closed = placed.filter(placement => placement.section === 'done')
	for (const [position, placement] of closed.entries()) entities.placements[placement.code] = {
		id: placement.code, code: placement.code, act: placement.act, section: placement.section, rule: placement.rule, subjects: placement.subjects,
		position, kind: 'closed', headline: placement.title, facts: { who: placement.who, where: placement.chat, at: placement.at },
		chips: [], todoIds: [], actionIds: [],
	}
	sections.push({ id: 'done', label: 'Done', total: closed.length, ids: closed.map(placement => placement.code) })
	const activityCounts = new Map<string, number>()
	for (const row of base.done) {
		const { who, notes: historyNotes, why, sentId: _sentId, earlier: _earlier, ...rest } = row
		const wf = byCode.get(row.code)
		const activity = `${row.code}/${row.kind}/${row.at}`, n = activityCounts.get(activity) ?? 0
		activityCounts.set(activity, n + 1)
		const id = row.sentId ? `sent:${hashOf(`${wf?.chat.id ?? ''}|${row.sentId}`)}` : wf?.sent?.at === row.at && (row.kind === 'reply' || row.kind === 'review') ? `sent:${hashOf(`${wf.chat.id}|${wf.sent.msgId}`)}` : `${activity}/${n}`
		const rev = wf ? presentationRev(wf, cfg) : row.at
		const actionIds: string[] = []
		if (row.undoUntil && Date.parse(row.undoUntil) > Date.now()) actionIds.push(offer(row.code, rev, 'undo', 'Undo', () => ({ code: row.code, verb: 'undo' }), { staleness: 'exact', expect: rev, effect: 'changes-system', expiresAt: row.undoUntil, meaning: 'Removes this reply from the chat. Changes already made are not reversed.' }))
		if (row.kind === 'catchup') actionIds.push(offer(row.code, rev, 'needs-me', 'Needs me', () => ({ code: row.code, verb: 'mine' })))
		if (row.kind === 'catchup' && wf && (!wf.watchedAs || !byCode.get(wf.watchedAs) || byCode.get(wf.watchedAs)?.state === 'done')) actionIds.push(watchFyi(wf, 'Start watching', id, rev, { target: row.watch?.target || row.sentence, until: row.watch?.until }))
		if (row.kind === 'learned' && store.proposal(row.code)?.state === 'applied') actionIds.push(`${row.code}/undo-facts`)
		// An earlier reply of an item that is open again is history: feedback acts on the item's current reply, not this one.
		for (const [kind, label] of [['wrong', 'Wrong'], ['incomplete', 'Incomplete'], ['unneeded', 'Not needed']] as const) {
			if ((row.kind === 'reply' || row.kind === 'review') && !row.earlier) actionIds.push(offer(row.code, rev, kind, label, input => ({ code: row.code, verb: kind, text: input?.text }), {
				input: 'feedback', staleness: 'exact', expect: rev, effect: kind === 'unneeded' ? 'changes-system' : 'local',
				needsConfirm: kind === 'unneeded',
				meaning: kind === 'unneeded' ? 'Marks this reply as unnecessary and removes it if its Undo window is still open. Changes already made are not reversed.' : 'Drafts a follow-up for your approval. Nothing is sent yet.',
			}))
		}
		entities.doneEntries[id] = { ...rest, text: wf?.sent?.at === row.at && (row.kind === 'reply' || row.kind === 'review') ? wf.sent.sendText ?? rest.text : rest.text, fresh: isNew(row, seenIn(base), itemSeen(base)), id, personId: person(row.code, who), actionIds, sourceIds: sources(row.code, id, why?.sources ?? []), noteIds: notes(row.code, id, historyNotes ?? []), why: why && { reason: why.reason, confidence: why.confidence, gaps: why.gaps, searched: why.searched }, teams: safeLink(row.teams), href: safeLink(row.href) }
	}
	for (const w of base.watching) entities.watches[w.code] = {
		...w, id: w.code, actionIds: [
			offer(w.code, w.rev, 'stop-watch', 'Stop watching', () => ({ code: w.code, verb: 'skip' })),
			offer(w.code, w.rev, 'extend-watch', 'Extend 7 days', () => ({ code: w.code, verb: 'extend' })),
			offer(w.code, w.rev, 'interval', 'Save interval', input => ({ code: w.code, verb: 'every', text: requiredText(input) }), { input: 'interval' }),
		],
	}
	for (const a of base.automations) entities.automations[a.code] = {
		...a, id: a.code, actionIds: [
			...(a.state === 'proposed' ? [] : [offer(a.code, a.rev, 'toggle', a.state === 'paused' ? 'Resume' : 'Pause', () => ({ code: a.code, verb: a.state === 'paused' ? 'resume' : 'pause' }), { staleness: 'exact', expect: automationApprovalRev(store.automation(a.code)!) })]),
			offer(a.code, a.rev, 'end', 'End', () => ({ code: a.code, verb: 'skip' })),
		],
	}
	const readyProposals = new Map(base.knowledge.map(proposal => [proposal.code, proposal]))
	for (const proposal of store.proposals()) {
		const k = readyProposals.get(proposal.code) ?? knowledgeCard(proposal)
		const factIds = k.facts.map((fact, n) => {
			const id = `${k.code}/fact/${n}`
			entities.facts[id] = { ...fact, id, proposalId: k.code, href: safeLink(fact.href) }
			return id
		})
		const revision = proposalApprovalRev(proposal)
		const actionIds = proposal.state === 'needs_human' ? [
			offer(k.code, revision, 'save-facts', 'Save selected facts', input => {
				const excluded = input?.excluded ?? []
				if (excluded.some(n => n > k.facts.length)) throw new IntentError(422, 'That fact is not offered.')
				return { code: k.code, verb: 'ok', ...(excluded.length ? { except: excluded } : {}) }
			}, { staleness: 'exact', input: 'approval', expect: revision, selection: { total: k.facts.length, verb: 'Save', singular: 'fact', plural: 'facts', suffix: '', empty: 'Nothing selected', allowEmpty: false } }),
			...(k.facts.length === 1 ? [offer(k.code, revision, 'edit-fact', 'Save your version', input => ({ code: k.code, verb: 'edit', text: requiredText(input) }), { input: 'text', staleness: 'exact', expect: revision })] : []),
			offer(k.code, revision, 'skip-facts', 'Skip', () => ({ code: k.code, verb: 'skip' })),
		] : proposal.state === 'applied' ? [offer(k.code, revision, 'undo-facts', 'Undo learned facts', () => ({ code: k.code, verb: 'undo' }), { staleness: 'exact', expect: revision })] : []
		entities.knowledgeProposals[k.code] = { id: k.code, code: k.code, rev: revision, topic: k.topic, home: k.home, state: proposal.state, factIds, actionIds }
	}
	for (const h of base.health) {
		const actionIds = h.fix ? [tool('', `health:${h.key}`, h.fix.label, () => actResult(store, h.fix!.command, undefined, 'page'), undefined, 'page', pageDigest(h))] : []
		entities.health[h.key] = { id: h.key, text: h.text, since: h.since, actionIds }
	}
	for (const w of base.waiting) entities.waiting[w.code] = { ...w, id: w.code, link: safeLink(w.link), actionIds: [
		offer(w.code, '', 'follow-up', 'Draft follow-up', () => ({ code: w.code, verb: 'ok' })),
		offer(w.code, '', 'dismiss-waiting', 'Dismiss', () => ({ code: w.code, verb: 'skip' })),
	] }
	for (const ch of base.channels) {
		const id = `channel:${hashOf(ch.link)}`
		entities.channels[id] = { ...ch, id, actionIds: [tool('', 'stop-channel', 'Stop watching', () => {
			if (!parseChannelLink(ch.link)) throw new IntentError(422, 'This channel link cannot be read.')
			return { accepted: true, text: watchChannel(store, ch.link, true) }
		}, undefined, id, pageDigest(ch))] }
	}
	const pageActionIds = [
		offer('', '', 'pause-resume', base.status.state === 'on' ? 'Pause' : 'Resume', () => ({ verb: base.status.state === 'on' ? 'pause' : 'resume' }), { staleness: 'exact', expect: pageDigest(base.status.state) }, 'page'),
		tool('', 'retry-source', 'Check now', () => actResult(store, 'retry', undefined, 'page')),
		tool('', 'check-update', 'Check for updates', () => actResult(store, 'check update', undefined, 'page')),
		tool('', 'mark-all-read', 'Mark all read', input => {
			if (!input?.seenAt || !Number.isFinite(Date.parse(input.seenAt)) || Date.parse(input.seenAt) > Date.now()) throw new IntentError(422, 'The displayed time is not valid. Refresh before marking read.')
			store.saveSeen(['catchup'], new Date(input.seenAt).toISOString())
			return { accepted: true, text: 'Marked the displayed Catch up items read.' }
		}),
		tool('', 'report-problem', 'Report a problem', input => ({ accepted: true, text: reportProblem(store, requiredText(input)) }), 'text'),
		tool('', 'paste-missed', 'Make it an item', input => {
			const link = requiredText(input).trim()
			if (!/^https:\/\/teams\.microsoft\.com\/l\/message\/[^/?#]+\/[^/?#]+/i.test(link)) throw new IntentError(422, 'Paste a Teams message link.')
			store.addMissed({ link, at: new Date().toISOString() }); store.saveKick()
			return { accepted: true, text: 'Saved. It becomes an item on the next read. Nothing is sent.' }
		}, 'text'),
		tool('', 'watch-something', 'Start watching', input => {
			const target = requiredText(input).trim()
			if (input?.by && !byEnd(input.by)) throw new IntentError(422, 'Choose a valid date.')
			const result = watchTarget(store, { target, until: input?.until?.trim() || undefined, by: input?.by || undefined, shepherd: input?.push })
			return { accepted: result.accepted, text: pageText(result.text) }
		}, 'watch'),
		tool('', 'remind-someone', 'Create reminder', input => {
			if (!input?.to || !input.every || !input.at) throw new IntentError(422, 'Choose a person and schedule.')
			const selected = input.recipientId ? base.people.find(person => hashOf(person.chat) === input.recipientId && person.name === input.to) : undefined
			if (input.recipientId && !selected) throw new IntentError(409, 'That recipient changed. Select the person again.')
			const before = new Set(store.automations().map(auto => auto.code))
			const text = proposeAutomation(store, { to: input.to, chatId: selected?.chat, text: requiredText(input), every: input.every, at: input.at, day: input.day, until: input.by })
			const auto = store.automations().find(auto => !before.has(auto.code) && auto.state === 'proposed')
			if (!auto) return { accepted: false, text: forPage(text) }
			return { accepted: true, text: forPage(answerAutomation(store, auto, { id: '', code: auto.code, verb: 'ok', surface: 'chat', at: '' })) }
		}, 'reminder'),
	]
	const reminderRevision = pageDigest(base.people)
	Object.assign(entities.actions['page/remind-someone'], {
		effect: 'sends', staleness: 'exact', rev: reminderRevision, expect: reminderRevision,
		meaning: 'Creates the displayed reminder schedule for the selected recipient. The exact text above is what will be sent.',
	})
	const settingsActions: Record<string, string[]> = {}
	for (const habit of store.habits()) {
		if (habit.state === 'suggested') settingsActions[habit.code] = [
			offer(habit.code, '', 'accept-habit', 'Turn on', () => ({ code: habit.code, verb: 'ok' })),
			offer(habit.code, '', 'defer-habit', 'Not now', () => ({ code: habit.code, verb: 'skip' })),
			offer(habit.code, '', 'never-habit', 'Never', () => ({ code: habit.code, verb: 'never' })),
		]
		else {
			settingsActions[habit.code] = [offer(habit.code, '', 'remove-rule', 'Remove', () => ({ code: habit.code, verb: 'never' }))]
			// A drafting style the owner turned on: its words can be changed, and the turn-on taken back within the undo window (edit habits).
			if (habit.kind === 'style' && !habit.removes && habit.state === 'accepted') {
				const rule = store.rules().find(r => r.id === habit.rule.id), rev = ''
				if (rule) settingsActions[habit.code].unshift(offer(habit.code, rev, 'edit-style', 'Save style', input => ({ code: habit.code, verb: 'edit', text: requiredText(input) }), { input: 'text', effect: 'changes-system', meaning: 'Saves these words as the drafting style. New drafts follow them; nothing is sent.' }))
				if (habitUndoable(store, habit)) settingsActions[habit.code].push(offer(habit.code, rev, 'undo-habit', 'Undo', () => ({ code: habit.code, verb: 'undo' }), { effect: 'changes-system', expiresAt: new Date(Date.parse(habit.at) + undoMs(store)).toISOString(), meaning: 'Turns this style off again and brings its suggestion back.' }))
			}
		}
	}
	for (const [chatId, level] of Object.entries(store.config().chatLevels ?? {})) {
		const key = chatLevelKey(chatId)
		const actionId = tool(key, 'chat-normal', 'Mark normal again', () => {
			const config = store.config(), levels = { ...config.chatLevels }
			delete levels[chatId]
			store.saveConfig({ ...config, chatLevels: levels })
			return { accepted: true, text: 'This chat is normal again. Existing drafts and source checks are unchanged.' }
		}, undefined, key)
		Object.assign(entities.actions[actionId], {
			effect: 'changes-system', rev: pageDigest([chatId, level]), expect: pageDigest([chatId, level]), staleness: 'exact', needsConfirm: true,
			meaning: `Stop treating ${level.name} as ${level.level === 'off' ? 'off the record' : 'private'}? Future learning and replies use the normal privacy checks. Existing stored facts are not changed.`,
		})
		settingsActions[key] = [actionId]
	}
	if (base.status.state !== 'on') for (const action of Object.values(entities.actions)) {
		if (action.effect === 'sends' || action.effect === 'changes-system' && ['approve', 'approve-again'].includes(action.kind)) {
			action.unavailable = { label: base.status.state === 'paused' ? 'Paused' : 'Stopped', reason: `${base.status.state === 'paused' ? 'Paused' : 'Stopped'}: nothing is sent. Resume before approving this action.` }
		}
	}
	const found = query.trim() ? find({ ...base, next }, query) : undefined
	const classicRunning = base.running.filter(row => !stoppedCodes.has(row.code))
	const classic: Snapshot['classic'] = {
		needsIds: [...new Set([...base.needs.map(item => item.code), ...stoppedCodes, ...workflows.filter(workflow => workflow.partOf && workflow.state === 'needs_human').map(workflow => workflow.code)])].sort((a, b) => byCode.get(a)!.createdAt.localeCompare(byCode.get(b)!.createdAt)), tiles: base.tiles,
		also: base.also.map(tile => tile.key === 'running' ? { ...tile, count: classicRunning.length } : tile).filter(tile => tile.key !== 'running' || tile.count > 0),
		catchupIds: base.catchUp.top.map(row => Object.values(entities.doneEntries).find(entry => entry.code === row.code && entry.kind === row.kind && entry.at === row.at)?.id).filter((id): id is string => !!id),
		running: classicRunning.map(row => ({
			...row, what: pageText(Object.values(entities.placements).find(placement => placement.act === row.code && placement.kind === 'scheduled')?.headline ?? row.what),
			sendAt: byCode.get(row.code)?.state === 'scheduled' ? byCode.get(row.code)?.sendAt : undefined,
			detail: entities.items[row.code]?.attentionKind === 'agent-setup' ? `Held: ${entities.items[row.code].attention}` : row.code && (byCode.get(row.code)?.state !== 'scheduled' || /^Held: /.test(byCode.get(row.code)?.status ?? '')) ? pageText(byCode.get(row.code)?.status) : undefined,
			retry: (() => {
				const workflow = byCode.get(row.code), retry = workflow?.job ? facts.jobs.get(workflow.job)?.retry : undefined
				return retry ? { at: retry.at, attempt: retry.n, reason: pageText(retry.last.why), tried: retry.tried.map(pageText) } : undefined
			})(),
			actionIds: row.code ? byCode.get(row.code)?.state === 'scheduled' ? Object.values(entities.placements).find(placement => placement.act === row.code && placement.kind === 'scheduled')?.actionIds ?? [] : [
				continueOffer(row.code, entities.items[row.code]?.rev ?? '', 'classic-continue', byCode.get(row.code)?.openOn),
				...(entities.items[row.code]?.actionIds.filter(id => entities.actions[id].kind === 'dismiss') ?? []),
			] : [],
		})),
		progress: base.progress.map(row => ({
			...row, who: row.who.name, status: pageText(row.status), next: row.next && pageText(row.next),
			actionIds: [
				entities.items[row.code].todoIds.length ? markTodos(row.code, byCode.get(row.code)!.kept!.filter(todo => !todo.done), 'classic-close') : closeWork(row.code, 'classic-close'),
				...(row.every ? [offer(row.code, row.rev, 'classic-interval', 'Save interval', input => ({ code: row.code, verb: 'every', text: requiredText(input) }), { input: 'interval' })] : []),
				...(row.endsAt ? [offer(row.code, row.rev, 'classic-extend', 'Extend 7 days', () => ({ code: row.code, verb: 'extend' }))] : []),
				...(entities.actions[`${row.code}/stop-watch`] ? [`${row.code}/stop-watch`] : []),
			],
		})),
		workActionIds: Object.fromEntries(base.needs.filter(card => card.work?.due).map(card => {
			const rev = entities.items[card.code].rev
			return [card.code, [
				offer(card.code, rev, 'classic-work-wait', 'Wait 3 days', () => ({ code: card.code, verb: 'wait', text: '3d' }), { staleness: 'exact', expect: rev }),
				closeWork(card.code, 'classic-work-close'),
			]]
		})),
		watchActionIds: Object.fromEntries(base.watching.map(row => [row.code, [
			offer(row.code, row.rev, 'classic-ack-watch', 'Got it', () => ({ code: row.code, verb: 'ok' })),
			...entities.watches[row.code].actionIds,
		]])),
		automationActionIds: Object.fromEntries(base.automations.map(row => [row.code, [
			...(row.state === 'proposed' ? [offer(row.code, row.rev, 'classic-start', 'Start', () => ({ code: row.code, verb: 'ok' }), { effect: 'sends', staleness: 'exact', expect: row.rev })] : []),
			...entities.automations[row.code].actionIds,
		]])),
		watchBy: BY.map(([key, label]) => ({ label, date: key ? byDate(key) : '' })),
		details: base.details,
	}
	const undoable = Object.values(entities.doneEntries).flatMap(row => row.actionIds.filter(id => entities.actions[id]?.kind === 'undo').map(id => ({ id, at: row.at })))
	const lastUndoId = undoable.sort((a, b) => b.at.localeCompare(a.at))[0]?.id
	const snapshot = snapshotSchema.parse({
		schemaVersion: 1, fetchedAt: new Date().toISOString(), now: base.now, since: base.since, owner: base.owner,
		entities, sections, seen: base.seen, status: base.status, running: base.running.filter(run => !run.code), classic, lastUndoId,
		pageActionIds, reminderDefaults: newReminder(''), recipients: peopleOf(base).map(person => ({ id: hashOf(person.chat), name: person.name, group: person.group })),
		// An empty list says why, so the owner knows to type a name (reminder recipients, 10-23).
		...(base.people.length ? {} : { recipientsNote: `No one to choose yet: reminders go to people and group chats ${NAME} has seen asks from.${store.workflows().some(w => w.chat.test && !w.chat.group && w.asker && isPersona(w.asker.id)) ? ' People played with "[as Name]" in test chats are not real, so they are not listed.' : ''} They appear here once they write to you.` }),
		settingsActions, doneNew: newCount(base), sinceLine: sinceOf({ ...base, since: base.since ?? visit?.fallbackSince, next }),
		summary: { minute: next.minute, handled: next.handled, catchup: { count: next.catchup.count, worth: next.catchup.worth }, off: next.off, paused: next.paused },
		showExperienceNote: !store.ui().noted,
		search: found ? {
			query, nowIds: found.now.map(row => row.code),
			doneIds: Object.values(entities.doneEntries).filter(row => found.done.some(match => match.code === row.code && match.kind === row.kind && match.at === row.at)).map(row => row.id),
			link: found.link,
		} : undefined,
	})
	return { snapshot, bindings }
}

export function resolvePageIntent(store: Store, intent: Intent): { parsed?: Parsed; execute?: () => Immediate; shownAt?: string; page?: PageApproval } {
	const binding = reactProjection(store).bindings.get(intent.action)
	if (!binding || binding.action.item !== intent.item) throw new IntentError(410, 'That action is no longer offered. Open the refreshed item.')
	// Management expectations describe the decision; row timestamps also move on routine checks.
	if (binding.action.staleness === 'exact' && (binding.action.expect !== intent.expect || !binding.management && binding.action.rev !== intent.rev)) {
		throw new IntentError(409, 'Changed since you looked. Open the new version first.')
	}
	if (binding.execute) return { execute: () => binding.execute!(intent.input) }
	const parsed = binding.resolve(intent.input)
	if (binding.management) return { parsed, page: { kind: 'manage', expect: binding.action.expect! } }
	const workflow = store.byCode(intent.item), automation = store.automation(intent.item), proposal = store.proposal(intent.item)
	let page: PageApproval | undefined
	if (binding.action.staleness === 'exact') {
		const expect = workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
		if (expect) {
			const todoIds = binding.action.todoIds
			const kind: PageApproval['kind'] = todoIds?.length ? 'mark-todos' : parsed.verb === 'undo' && workflow ? 'undo-send' :
				workflow?.sent && ['wrong', 'incomplete', 'unneeded'].includes(parsed.verb) ? 'feedback-send' :
				parsed.verb === 'pick' ? 'pick' : workflow && ['ok', 'send', 'edit'].includes(parsed.verb) && pendingEffects(workflow.effects).length > 0 ? 'make-changes' :
					workflow?.draft && (parsed.verb === 'ok' || parsed.verb === 'send') ? 'send-reply' : 'approve'
			page = { kind, expect, ...(kind === 'undo-send' || kind === 'feedback-send' ? { sentMessageId: workflow?.sent?.msgId } : {}), ...(todoIds ? { todoIds } : {}),
				...(parsed.verb === 'ok' && workflow?.draft && (kind === 'send-reply' || kind === 'make-changes') ? { replyDigest: pageDigest(approvedReplyText(workflow.draft.text, workflow, store.config())) } : {}),
			}
		}
	}
	return { parsed, page, shownAt: workflow?.revAt ?? workflow?.updatedAt ?? automation?.updatedAt ?? proposal?.revAt }
}
export const resolveIntent = (store: Store, intent: Intent): Parsed => {
	const parsed = resolvePageIntent(store, intent).parsed
	if (!parsed) throw new IntentError(422, 'This is not a queued item action.')
	return parsed
}
