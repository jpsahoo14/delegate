import type { Store } from '../store/state.ts'
import type { Parsed } from '../core/verbs.ts'
import { parseVerbs } from '../core/verbs.ts'
import { hashOf } from '../knowledge/format.ts'
import { card, knowledge as knowledgeCard, view, type ItemCard, type SourceRow, type Who } from './view.ts'
import { nextView, snapshot as placementSnapshot, place } from './next.ts'
import { emptyEntities, snapshotSchema, type Action, type Intent, type Snapshot } from './react/domain/contracts.ts'
import { knowledgeOf } from '../runner/proposals.ts'
import { find } from './app/model/find.ts'
import { freshOf, rowMark } from './app/model/derive.ts'
import { NAME } from '../brand.ts'
import { automationApprovalRev, pageChangeId, pageDigest, pageOptionId, proposalApprovalRev, workflowApprovalRev } from '../core/page-approval.ts'
import type { PageApproval } from '../core/types.ts'
import { meaningParts, pendingEffects, shown } from '../core/effects.ts'
import { forPage, sourceChip } from './app/model/format.ts'
import { isNew, itemSeen, newCount, seenIn, sinceOf } from './app/model/derive.ts'
import { byEnd, watchItemTarget, watchTarget } from '../runner/track.ts'
import { watchChannel, actResult } from '../mcp/server.ts'
import { answerAutomation, propose as proposeAutomation } from '../runner/automations.ts'
import { report as reportProblem } from '../store/feedback.ts'
import { parseChannelLink } from '../adapters/channels.ts'
import { newReminder, peopleOf } from './app/model/forms.ts'
import { reopenable } from '../core/policy.ts'
import { madeBefore, maybeOf } from '../runner/ledger.ts'
import { stillApproved } from '../runner/jobs.ts'
import { hasCommandHint, pageText } from './page-text.ts'

type Immediate = { accepted: boolean; text: string }
export type Binding = { action: Action; resolve: (input: Intent['input']) => Parsed; execute?: (input: Intent['input']) => Immediate }
export class IntentError extends Error {
	readonly status: number
	constructor(status: number, message: string) { super(message); this.status = status }
}
const safeLink = (link?: string) => link && /^https:/i.test(link) ? link : undefined
const requiredText = (input: Intent['input']) => {
	if (!input?.text?.trim()) throw new IntentError(422, 'Enter your text first.')
	return input.text
}
const ownerOf = (who: string) => who === 'you' ? { kind: 'you' as const } : who === 'me' ? { kind: 'delegate' as const } : { kind: 'others' as const, text: who === 'them' ? 'Others' : who }

export function reactProjection(store: Store, query = ''): { snapshot: Snapshot; bindings: Map<string, Binding> } {
	const facts = placementSnapshot(store), placed = place(facts), placementOf = new Map(placed.map(placement => [placement.code, placement]))
	const base = view(store, store.lastViewed(), new Date(facts.now), facts.workflows), next = nextView(store, facts.now, { snapshot: facts, allCatchup: true }), entities = emptyEntities()
	const bindings = new Map<string, Binding>(), workflows = facts.workflows, byCode = new Map(workflows.map(w => [w.code, w]))
	const expectations = new Map<string, string>()
	const readyCards = new Map(base.needs.map(item => [item.code, item])), knowledge = knowledgeOf(store, store.config())
	const asksAt = new Map<string, string>()
	for (const workflow of workflows) {
		const message = store.thread(workflow.id).find(message => message.id === workflow.lastMsgId && !message.byOwner)
		if (message) asksAt.set(workflow.code, message.at)
	}
	function person(code: string, who: Who): string {
		const id = `person:${hashOf(byCode.get(code)?.asker?.id ?? code)}`
		entities.people[id] = { id, ...who }
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
	function offer(item: string, rev: string, kind: string, label: string, resolve: Binding['resolve'], options: Partial<Pick<Action, 'input' | 'effect' | 'staleness' | 'expect' | 'needsConfirm' | 'meaning' | 'expiresAt' | 'selection'>> = {}, prefix = item): string {
		const id = `${prefix}/${kind}`
		const action: Action = { id, item, rev, kind, label, effect: 'local', staleness: 'none', ...options }
		entities.actions[id] = action
		bindings.set(id, { action, resolve })
		return id
	}
	function tool(item: string, kind: string, label: string, execute: NonNullable<Binding['execute']>, input?: Action['input'], prefix = 'page'): string {
		const id = offer(item, '', kind, label, () => { throw new IntentError(422, 'This is not a queued item command.') }, { input }, prefix)
		bindings.get(id)!.execute = execute
		return id
	}
	const editable = new Set(base.needs.map(c => c.code))
	for (const wf of workflows) {
		const c = readyCards.get(wf.code) ?? card(store, wf, knowledge), id = c.code, rev = workflowApprovalRev(wf)
		const { who, chat, draft, changes, notes: cardNotes, why, work, todos: _todos, replyOnly, reviewAgain, ...rest } = c
		const personId = person(id, who), chatId = `chat:${hashOf(wf.chat.id)}`
		entities.chats[chatId] = { ...chat, id: chatId }
		const draftId = draft ? `${id}/draft` : undefined
		if (draft && draftId) entities.drafts[draftId] = { ...draft, id: draftId, itemId: id, rev }
		const pending = (wf.effects ?? []).filter(effect => !effect.done && !effect.off)
		const approved = stillApproved(wf, wf.job ? facts.jobs.get(wf.job) : undefined)
		const changeIds = changes.map((change, n) => {
			const key = `${id}/change/${pageChangeId(pending[n])}`
			entities.changes[key] = { ...change, id: key, itemId: id, rev, state: maybeOf(store, pending[n]) ? 'uncertain' : approved ? 'approved' : 'proposed', error: pending[n].error ? pageText(pending[n].error) || 'The change could not be confirmed. Check the target before retrying.' : undefined }
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
				entities.planSteps[key] = { ...step, id: key, workId, position, owner: ownerOf(step.who), now: false }
				return key
			})
			const stepIds = work.steps.map((step, position) => {
				const key = `${workId}/step/${position}`
				entities.workSteps[key] = { ...step, id: key, workId }
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
			else if (draft && (!c.choices || draft.preview) || changes.length && !c.question || c.promise?.failed) {
				const label = c.promise?.failed && !draft ? 'Check again' : changes.length ? `Approve selected changes${draft ? ' and reply' : ''}` : draft?.holding ? 'Send holding reply' : 'Send'
				actionIds.push(offer(id, rev, 'approve', label, approval, { effect: draft && !changes.length ? 'sends' : 'changes-system', staleness: 'exact', expect, input: changes.length ? 'approval' : undefined, selection }))
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
			actionIds.push(offer(id, rev, 'answer', 'Draft reply', input => ({ code: id, verb: 'answer', text: requiredText(input) }), { input: 'text' }))
			if (c.choices) actionIds.push(offer(id, rev, 'pick', 'Preview reply', input => {
				const picks = [...new Set(input?.picks ?? [])]
				if (!picks.length || picks.some(n => n > c.choices!.options.length) || !c.choices!.multi && picks.length !== 1) throw new IntentError(422, 'Pick an offered option.')
				return { code: id, verb: 'pick', nums: picks }
			}, { input: 'picks', staleness: 'exact', expect }))
			actionIds.push(offer(id, rev, 'later', 'Later', () => ({ code: id, verb: 'later' })), offer(id, rev, 'dismiss', 'Dismiss', () => ({ code: id, verb: 'skip' })))
			if (replyOnly) actionIds.push(offer(id, rev, 'reply-only', 'Send reply only', () => ({ code: id, verb: 'ok', except: changes.map(change => change.n) }), { staleness: 'exact', expect, effect: 'sends' }))
		}
		actionIds.push(offer(id, rev, 'ask', `Ask ${NAME}`, input => ({ code: id, verb: 'ask', text: requiredText(input) }), { input: 'text' }))
		if (reopenable(wf, 'answer')) actionIds.push(offer(id, rev, 'reopen', 'Reopen and draft reply', input => ({ code: id, verb: 'answer', text: requiredText(input) }), { input: 'text', staleness: 'exact', expect }))
		const noteIds = notes(id, id, cardNotes)
		for (const noteId of noteIds) {
			const note = entities.notes[noteId]
			if (note.answer?.trim()) note.useActionId = offer(id, rev, 'use-note', 'Use this in the reply', () => ({ code: id, verb: 'answer', text: `Use this: ${note.answer}` }), { staleness: 'exact', expect: pageDigest(note.answer) }, noteId)
		}
		if (c.openOn || wf.job) actionIds.push(offer(id, rev, 'continue', 'Open on your computer', () => ({ code: id, verb: 'continue' })))
		if (todoIds.length) {
			const drawnAt = todoIds.map(key => entities.todos[key].at).sort().at(-1)!
			actionIds.push(offer(id, drawnAt, 'todo-done', 'Mark done', () => ({ code: id, verb: 'close' }), { staleness: 'exact' }))
		}
		const job = wf.job ? facts.jobs.get(wf.job) : undefined
		const stopped = wf.state === 'waiting_on_task' && (!job || job.state === 'failed' || job.state === 'done')
		entities.items[id] = {
			...rest, rev, id, personId, chatId, draftId, changeIds, effectIds, todoIds, workId, actionIds,
			askAt: asksAt.get(id),
			status: pageText(c.status),
			attention: stopped || c.draft?.holding ? pageText(job?.error ?? wf.status) || 'The previous run could not finish. Use the available action, ask a question or review the visible holding reply.' : undefined,
			question: c.question === undefined ? undefined : pageText(c.question) || undefined,
			choices: c.choices && { ...c.choices, prompt: forPage(c.choices.prompt), options: c.choices.options.map(option => ({ ...option, id: pageOptionId(option) })) },
			sourceIds: sources(id, id, why.sources), noteIds,
			primaryActionId: ['review-again', 'approve-again', ...(c.choices && !draft?.preview ? ['pick'] : []), 'approve', 'answer', 'reopen'].map(kind => `${id}/${kind}`).find(key => actionIds.includes(key)),
			why: { reason: why.reason, confidence: why.confidence, gaps: why.gaps, searched: why.searched }, teams: safeLink(c.teams),
		}
	}
	const sections: Snapshot['sections'] = ([
		['move', 'Your move', next.move], ['working', `${NAME} is working`, next.working],
		['waiting', 'Waiting', next.waiting], ['catchup', 'Catch up', next.catchup.rows],
	] as const).map(([id, label, rows]) => ({
		id, label, total: rows.length, ids: rows.map((row, position) => {
			const { who, primary, more, draft: _draft, rev: rowRev, work, todos, ...rest } = row
			const actionIds: string[] = []
			for (const [n, action] of [primary, ...(more ?? [])].entries()) {
				if (!action?.command) continue
				const parsed = parseVerbs(action.command)
				if (parsed?.length !== 1) throw new Error(`Unsupported server row action: ${row.kind}`)
				const offered = parsed[0]
				const code = offered.code ?? row.act, subject = byCode.get(code)
				const canonical = offered.verb === 'ok' ? entities.actions[`${code}/approve`] : offered.verb === 'close' ? entities.actions[`${code}/todo-done`] : undefined
				if (canonical && !offered.nums?.length && !offered.except?.length) { actionIds.push(canonical.id); continue }
				const kept = (subject?.kept ?? []).filter(todo => !todo.done)
				const marks = offered.verb === 'close' && kept.length > 0
				const exact = marks || ['ok', 'send', 'edit', 'pick', 'undo'].includes(offered.verb) && !code.startsWith('W')
				const auto = store.automation(code)
				if (auto && (offered.verb === 'pause' || offered.verb === 'resume')) { actionIds.push(`${code}/toggle`); continue }
				const rev = marks ? kept.map(todo => todo.at).sort().at(-1)! : subject ? workflowApprovalRev(subject) : auto ? automationApprovalRev(auto) : ''
				const item = entities.items[code]
				actionIds.push(offer(code, rev, `row-${n}`, action.label, input => ({
					...offered, code,
					...(offered.text?.includes('{text}') ? { text: offered.text.replace('{text}', () => requiredText(input)) } : {}),
				}), {
					input: action.command.includes('{text}') ? 'text' : undefined,
					staleness: exact ? 'exact' : 'none', expect: exact && !marks ? expectations.get(code) ?? (auto ? automationApprovalRev(auto) : undefined) : undefined,
					effect: offered.verb === 'ok' && !code.startsWith('W') ? item?.draftId && !item.changeIds.length ? 'sends' : 'changes-system' : 'local',
				}, `row:${row.code}`))
			}
			const todoIds = (todos ?? []).map(todo => {
				const key = `${todo.code}/todo/${todo.id}`
				entities.todos[key] = { ...todo, id: key, itemId: todo.code, done: false }
				return key
			})
			const workId = work ? `row:${row.code}/work` : undefined
			if (work && workId) {
				const planIds = work.steps.map((step, n) => {
					const key = `${workId}/plan/${n}`
					entities.planSteps[key] = { ...step, id: key, workId, position: n }
					return key
				})
				const stepIds = work.happened.map((step, n) => {
					const key = `${workId}/step/${n}`
					entities.workSteps[key] = { ...step, id: key, workId }
					return key
				})
				const reportActionId = work.report ? offer(row.act, entities.items[row.act]?.rev ?? rowRev ?? '', 'report', 'Draft my report', input => {
					if (!input?.result) throw new IntentError(422, 'Choose a result first.')
					return { code: row.act, verb: 'answer', text: `${input.result}${input.text?.trim() ? `: ${input.text}` : ''}` }
				}, { input: 'report' }) : undefined
				entities.work[workId] = { ...entities.work[workId], id: workId, itemId: row.act, goal: work.goal, due: entities.work[workId]?.due ?? false, proposed: entities.work[workId]?.proposed ?? false, planIds, stepIds, total: work.total, yours: work.yours, then: work.then, reportActionId }
			}
			const fresh = freshOf(row, rowMark(base, row))
			const authoritative = placementOf.get(row.code)
			if (!authoritative) throw new Error(`The row ${row.code} has no authoritative server placement.`)
			const workflow = byCode.get(row.act), askedAt = asksAt.get(row.act)
			const headline = hasCommandHint(row.headline) ? workflow?.lastAsk ? `Review ${workflow.asker?.name ?? 'the request'}: "${workflow.lastAsk.slice(0, 160)}"` : 'Review this request' : pageText(row.headline)
			entities.placements[row.code] = {
				...rest, headline, facts: {
					...row.facts, ...(row.facts.verb === 'asked' && workflow ? { at: askedAt ?? workflow.createdAt, verb: askedAt ? 'asked' : 'item created' } : {}),
					notes: row.facts.notes?.map(note => ({ ...note, text: pageText(note.text) })),
				},
				chips: [...row.chips, ...(byCode.get(row.act)?.draft?.holding ? [{ kind: 'holding', text: 'Holding reply' }] : []), ...(fresh ? [{ kind: fresh, text: fresh === 'back' ? 'Back to you' : 'New' }] : [])],
				id: row.code, subjects: authoritative.subjects, position, personId: who ? person(row.act, who) : undefined, rowRev, actionIds, todoIds, workId, teams: safeLink(row.teams),
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
		const { who, notes: historyNotes, why, ...rest } = row
		const wf = byCode.get(row.code)
		const activity = `${row.code}/${row.kind}/${row.at}`, n = activityCounts.get(activity) ?? 0
		activityCounts.set(activity, n + 1)
		const id = wf?.sent?.at === row.at && (row.kind === 'reply' || row.kind === 'review') ? `sent:${hashOf(`${wf.chat.id}|${wf.sent.msgId}`)}` : `${activity}/${n}`
		const rev = wf ? workflowApprovalRev(wf) : row.at
		const actionIds: string[] = []
		if (row.undoUntil && Date.parse(row.undoUntil) > Date.now()) actionIds.push(offer(row.code, rev, 'undo', 'Undo', () => ({ code: row.code, verb: 'undo' }), { staleness: 'exact', expect: rev, effect: 'changes-system', expiresAt: row.undoUntil, meaning: 'Removes this reply from the chat. Changes already made are not reversed.' }))
		if (row.kind === 'catchup') actionIds.push(offer(row.code, rev, 'needs-me', 'Needs me', () => ({ code: row.code, verb: 'mine' })))
		if (row.kind === 'catchup' && wf && (!wf.watchedAs || !byCode.get(wf.watchedAs) || byCode.get(wf.watchedAs)?.state === 'done')) actionIds.push(tool(wf.code, 'watch-fyi', 'Start watching', input => {
			const target = input?.text?.trim() || row.watch?.target || row.sentence
			if (input?.by && !byEnd(input.by)) throw new IntentError(422, 'Choose a valid date.')
			const result = watchItemTarget(store, wf, { target, until: input?.until?.trim() || row.watch?.until, by: input?.by || undefined, shepherd: input?.push })
			return { accepted: result.accepted, text: pageText(result.text) }
		}, 'watch', id))
		if (row.kind === 'learned' && store.proposal(row.code)?.state === 'applied') actionIds.push(`${row.code}/undo-facts`)
		for (const [kind, label] of [['wrong', 'Wrong'], ['incomplete', 'Incomplete'], ['unneeded', 'Not needed']] as const) {
			if (row.kind === 'reply' || row.kind === 'review') actionIds.push(offer(row.code, rev, kind, label, input => ({ code: row.code, verb: kind, text: input?.text }), {
				input: 'feedback', staleness: 'exact', expect: rev, effect: kind === 'unneeded' ? 'changes-system' : 'local',
				needsConfirm: kind === 'unneeded',
				meaning: kind === 'unneeded' ? 'Marks this reply as unnecessary and removes it if its Undo window is still open. Changes already made are not reversed.' : 'Drafts a follow-up for your approval. Nothing is sent yet.',
			}))
		}
		entities.doneEntries[id] = { ...rest, fresh: isNew(row, seenIn(base), itemSeen(base)), id, personId: person(row.code, who), actionIds, sourceIds: sources(row.code, id, why?.sources ?? []), noteIds: notes(row.code, id, historyNotes ?? []), why: why && { reason: why.reason, confidence: why.confidence, gaps: why.gaps, searched: why.searched }, teams: safeLink(row.teams), href: safeLink(row.href) }
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
			...(a.state === 'proposed' ? [] : [offer(a.code, a.rev, 'toggle', a.state === 'paused' ? 'Resume' : 'Pause', () => ({ code: a.code, verb: a.state === 'paused' ? 'resume' : 'pause' }))]),
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
		const actionIds = h.fix ? [tool('', `health:${h.key}`, h.fix.label, () => actResult(store, h.fix!.command, undefined, 'page'))] : []
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
		}, undefined, id)] }
	}
	const pageActionIds = [
		offer('', '', 'pause-resume', base.status.state === 'on' ? 'Pause' : 'Resume', () => ({ verb: base.status.state === 'on' ? 'pause' : 'resume' }), {}, 'page'),
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
		else settingsActions[habit.code] = [offer(habit.code, '', 'remove-rule', 'Remove', () => ({ code: habit.code, verb: 'never' }))]
	}
	for (const [chatId, level] of Object.entries(store.config().chatLevels ?? {})) {
		const key = `chat:${hashOf(chatId)}`
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
	const found = query.trim() ? find({ ...base, next }, query) : undefined
	const classic: Snapshot['classic'] = {
		needsIds: base.needs.map(item => item.code), tiles: base.tiles, also: base.also,
		catchupIds: base.catchUp.top.map(row => Object.values(entities.doneEntries).find(entry => entry.code === row.code && entry.kind === row.kind && entry.at === row.at)?.id).filter((id): id is string => !!id),
		running: base.running.map(row => ({
			...row, what: pageText(row.what),
			actionIds: row.code ? [offer(row.code, entities.items[row.code]?.rev ?? '', 'classic-continue', 'Open on your computer', () => ({ code: row.code, verb: 'continue' }))] : [],
		})),
		progress: base.progress.map(row => ({
			...row, who: row.who.name, status: pageText(row.status), next: row.next && pageText(row.next),
			actionIds: [
				offer(row.code, row.rev, 'classic-close', 'Close', () => ({ code: row.code, verb: 'close' })),
				...(row.every ? [offer(row.code, row.rev, 'classic-interval', 'Save interval', input => ({ code: row.code, verb: 'every', text: requiredText(input) }), { input: 'interval' })] : []),
				...(row.endsAt ? [offer(row.code, row.rev, 'classic-extend', 'Extend 7 days', () => ({ code: row.code, verb: 'extend' }))] : []),
			],
		})),
		watchActionIds: Object.fromEntries(base.watching.map(row => [row.code, [
			offer(row.code, row.rev, 'classic-ack-watch', 'Got it', () => ({ code: row.code, verb: 'ok' })),
			...entities.watches[row.code].actionIds,
		]])),
		automationActionIds: Object.fromEntries(base.automations.map(row => [row.code, [
			...(row.state === 'proposed' ? [offer(row.code, row.rev, 'classic-start', 'Start', () => ({ code: row.code, verb: 'ok' }))] : []),
			...entities.automations[row.code].actionIds,
		]])),
		details: base.details,
	}
	const snapshot = snapshotSchema.parse({
		schemaVersion: 1, fetchedAt: new Date().toISOString(), now: base.now, since: base.since, owner: base.owner,
		entities, sections, seen: base.seen, status: base.status, classic,
		pageActionIds, reminderDefaults: newReminder(''), recipients: peopleOf(base).map(person => ({ id: hashOf(person.chat), name: person.name, group: person.group })), settingsActions, doneNew: newCount(base), sinceLine: sinceOf({ ...base, next }),
		summary: { minute: next.minute, handled: next.handled, catchup: { count: next.catchup.count, worth: next.catchup.worth }, off: next.off, paused: next.paused },
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
	if (binding.action.staleness === 'exact' && (binding.action.rev !== intent.rev || binding.action.expect !== intent.expect)) {
		throw new IntentError(409, 'Changed since you looked. Open the new version first.')
	}
	if (binding.execute) return { execute: () => binding.execute!(intent.input) }
	const parsed = binding.resolve(intent.input)
	const workflow = store.byCode(intent.item), automation = store.automation(intent.item), proposal = store.proposal(intent.item)
	let page: PageApproval | undefined
	if (binding.action.staleness === 'exact') {
		const expect = workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
		if (expect) {
			const todoIds = parsed.verb === 'close' ? workflow?.kept?.filter(todo => !todo.done).map(todo => todo.id) : undefined
			const kind: PageApproval['kind'] = todoIds?.length ? 'mark-todos' : parsed.verb === 'undo' && workflow ? 'undo-send' :
				workflow?.sent && ['wrong', 'incomplete', 'unneeded'].includes(parsed.verb) ? 'feedback-send' :
				parsed.verb === 'pick' ? 'pick' : workflow && ['ok', 'send', 'edit'].includes(parsed.verb) && pendingEffects(workflow.effects).length > 0 ? 'make-changes' :
					workflow?.draft && (parsed.verb === 'ok' || parsed.verb === 'send') ? 'send-reply' : 'approve'
			page = { kind, expect, ...(kind === 'undo-send' || kind === 'feedback-send' ? { sentMessageId: workflow?.sent?.msgId } : {}), ...(todoIds ? { todoIds } : {}) }
		}
	}
	return { parsed, page, shownAt: binding.action.kind === 'todo-done' ? binding.action.rev : workflow?.revAt ?? workflow?.updatedAt ?? automation?.updatedAt ?? proposal?.revAt }
}
export const resolveIntent = (store: Store, intent: Intent): Parsed => {
	const parsed = resolvePageIntent(store, intent).parsed
	if (!parsed) throw new IntentError(422, 'This is not a queued item action.')
	return parsed
}
