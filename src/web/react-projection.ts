import type { Store } from '../store/state.ts'
import type { Parsed } from '../core/verbs.ts'
import { parseVerbs } from '../core/verbs.ts'
import { hashOf } from '../knowledge/format.ts'
import { card, view, type ItemCard, type SourceRow, type Who } from './view.ts'
import { nextView, snapshot as placementSnapshot, place } from './next.ts'
import { emptyEntities, snapshotSchema, type Action, type Intent, type Snapshot } from './react/domain/contracts.ts'
import { knowledgeOf } from '../runner/proposals.ts'
import { find } from './app/model/find.ts'
import { freshOf, rowMark } from './app/model/derive.ts'
import { NAME } from '../brand.ts'
import { automationApprovalRev, pageChangeId, pageOptionId, proposalApprovalRev, workflowApprovalRev } from '../core/page-approval.ts'
import type { PageApproval } from '../core/types.ts'
import { pendingEffects } from '../core/effects.ts'
import { forPage } from './app/model/format.ts'

export type Binding = { action: Action; resolve: (input: Intent['input']) => Parsed }
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
	const base = view(store, store.lastViewed()), next = nextView(store, facts.now, { snapshot: facts, allCatchup: true }), entities = emptyEntities()
	const bindings = new Map<string, Binding>(), workflows = facts.workflows, byCode = new Map(workflows.map(w => [w.code, w]))
	const expectations = new Map<string, string>()
	const readyCards = new Map(base.needs.map(item => [item.code, item])), knowledge = knowledgeOf(store, store.config())
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
				label: source.label ?? 'Source', href: safeLink(source.ref), stale: source.stale, locked: source.tier === 'private',
			})))
			entities.notes[id] = { id, itemId, question: row.q, answer: row.a === undefined ? undefined : forPage(row.a), at: row.at, sourceIds }
			return id
		})
	}
	function offer(item: string, rev: string, kind: string, label: string, resolve: Binding['resolve'], options: Partial<Pick<Action, 'input' | 'effect' | 'staleness' | 'expect' | 'needsConfirm' | 'meaning'>> = {}, prefix = item): string {
		const id = `${prefix}/${kind}`
		const action: Action = { id, item, rev, kind, label, effect: 'local', staleness: 'none', ...options }
		entities.actions[id] = action
		bindings.set(id, { action, resolve })
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
		const changeIds = changes.map((change, n) => {
			const key = `${id}/change/${pageChangeId(pending[n])}`
			entities.changes[key] = { ...change, id: key, itemId: id, rev, state: pending[n]?.maybe ? 'uncertain' : 'proposed' }
			return key
		})
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
		if (editable.has(id)) {
			if (reviewAgain) actionIds.push(offer(id, rev, 'review-again', 'Review again', () => ({ code: id, verb: 'answer', text: 'review again' })))
			else if (draft && (!c.choices || draft.preview) || changes.length && !c.question || c.promise?.failed) {
				const label = c.promise?.failed && !draft ? 'Check again' : changes.length ? `Approve selected changes${draft ? ' and reply' : ''}` : draft?.holding ? 'Send holding reply' : 'Send'
				actionIds.push(offer(id, rev, 'approve', label, input => {
					const excluded = [...new Set(input?.excluded ?? [])]
					if (excluded.some(n => !changes.some(change => change.n === n))) throw new IntentError(422, 'That change is not offered.')
					if (input?.text !== undefined) throw new IntentError(422, 'Use Send your version to send an edit.')
					return { code: id, verb: 'ok', ...(excluded.length ? { except: excluded } : {}) }
				}, { effect: draft && !changes.length ? 'sends' : 'changes-system', staleness: 'exact', expect, input: changes.length ? 'approval' : undefined }))
			}
			if (draft) actionIds.push(offer(id, rev, 'send-edit', 'Send your version', input => {
				if (input?.excluded?.length) throw new IntentError(422, 'Change the reply and leave out changes one at a time.')
				return { code: id, verb: 'send', text: requiredText(input) }
			}, { effect: changes.length ? 'changes-system' : 'sends', staleness: 'exact', expect, input: 'text' }))
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
		if (c.openOn || wf.job) actionIds.push(offer(id, rev, 'continue', 'Open on your computer', () => ({ code: id, verb: 'continue' })))
		if (todoIds.length) {
			const drawnAt = todoIds.map(key => entities.todos[key].at).sort().at(-1)!
			actionIds.push(offer(id, drawnAt, 'todo-done', 'Mark done', () => ({ code: id, verb: 'close' }), { staleness: 'exact' }))
		}
		entities.items[id] = {
			...rest, rev, id, personId, chatId, draftId, changeIds, todoIds, workId, actionIds,
			question: c.question === undefined ? undefined : forPage(c.question),
			choices: c.choices && { ...c.choices, prompt: forPage(c.choices.prompt), options: c.choices.options.map(option => ({ ...option, id: pageOptionId(option) })) },
			sourceIds: sources(id, id, why.sources), noteIds: notes(id, id, cardNotes),
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
			entities.placements[row.code] = {
				...rest, headline: forPage(row.headline), facts: { ...row.facts, notes: row.facts.notes?.map(note => ({ ...note, text: forPage(note.text) })) },
				chips: [...row.chips, ...(fresh ? [{ kind: fresh, text: fresh === 'back' ? 'Back to you' : 'New' }] : [])],
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
		if (row.undoUntil && Date.parse(row.undoUntil) > Date.now()) actionIds.push(offer(row.code, rev, 'undo', 'Undo', () => ({ code: row.code, verb: 'undo' }), { staleness: 'exact', expect: rev, effect: 'changes-system', meaning: 'Removes this reply from the chat. Changes already made are not reversed.' }))
		if (row.kind === 'catchup') actionIds.push(offer(row.code, rev, 'needs-me', 'Needs me', () => ({ code: row.code, verb: 'mine' })))
		for (const [kind, label] of [['wrong', 'Wrong'], ['incomplete', 'Incomplete'], ['unneeded', 'Not needed']] as const) {
			if (row.kind === 'reply' || row.kind === 'review') actionIds.push(offer(row.code, rev, kind, label, input => ({ code: row.code, verb: kind, text: input?.text }), { input: 'feedback' }))
		}
		entities.doneEntries[id] = { ...rest, id, personId: person(row.code, who), actionIds, sourceIds: sources(row.code, id, why?.sources ?? []), noteIds: notes(row.code, id, historyNotes ?? []), why: why && { reason: why.reason, confidence: why.confidence, gaps: why.gaps, searched: why.searched }, teams: safeLink(row.teams), href: safeLink(row.href) }
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
	for (const k of base.knowledge) {
		const factIds = k.facts.map((fact, n) => {
			const id = `${k.code}/fact/${n}`
			entities.facts[id] = { ...fact, id, proposalId: k.code, href: safeLink(fact.href) }
			return id
		})
		const proposal = store.proposal(k.code)!, revision = proposalApprovalRev(proposal)
		entities.knowledgeProposals[k.code] = { id: k.code, code: k.code, rev: revision, topic: k.topic, home: k.home, factIds, actionIds: [
			offer(k.code, revision, 'save-facts', 'Save selected facts', input => {
				const excluded = input?.excluded ?? []
				if (excluded.some(n => n > k.facts.length)) throw new IntentError(422, 'That fact is not offered.')
				return { code: k.code, verb: 'ok', ...(excluded.length ? { except: excluded } : {}) }
			}, { staleness: 'exact', input: 'approval', expect: revision }),
			offer(k.code, revision, 'skip-facts', 'Skip', () => ({ code: k.code, verb: 'skip' })),
		] }
	}
	for (const h of base.health) {
		const actionIds = h.fix ? [offer('', '', `health:${h.key}`, h.fix.label, () => {
			const parsed = parseVerbs(h.fix!.command)
			if (parsed?.length !== 1) throw new IntentError(422, 'This health check needs the existing page.')
			return parsed[0]
		})] : []
		entities.health[h.key] = { id: h.key, text: h.text, since: h.since, actionIds }
	}
	for (const w of base.waiting) entities.waiting[w.code] = { ...w, id: w.code, link: safeLink(w.link), actionIds: [
		offer(w.code, '', 'follow-up', 'Draft follow-up', () => ({ code: w.code, verb: 'ok' })),
		offer(w.code, '', 'dismiss-waiting', 'Dismiss', () => ({ code: w.code, verb: 'skip' })),
	] }
	for (const ch of base.channels) {
		const id = `channel:${hashOf(ch.link)}`
		entities.channels[id] = { ...ch, id, actionIds: [] }
	}
	const found = query.trim() ? find({ ...base, next }, query) : undefined
	const snapshot = snapshotSchema.parse({
		schemaVersion: 1, fetchedAt: new Date().toISOString(), now: base.now, since: base.since, owner: base.owner,
		entities, sections, seen: base.seen, status: base.status,
		summary: { minute: next.minute, handled: next.handled, catchup: { count: next.catchup.count, worth: next.catchup.worth }, off: next.off, paused: next.paused },
		search: found ? {
			query, nowIds: found.now.map(row => row.code),
			doneIds: Object.values(entities.doneEntries).filter(row => found.done.some(match => match.code === row.code && match.kind === row.kind && match.at === row.at)).map(row => row.id),
			link: found.link,
		} : undefined,
	})
	return { snapshot, bindings }
}

export function resolvePageIntent(store: Store, intent: Intent): { parsed: Parsed; shownAt?: string; page?: PageApproval } {
	const binding = reactProjection(store).bindings.get(intent.action)
	if (!binding || binding.action.item !== intent.item) throw new IntentError(410, 'That action is no longer offered. Open the refreshed item.')
	if (binding.action.staleness === 'exact' && (binding.action.rev !== intent.rev || binding.action.expect !== intent.expect)) {
		throw new IntentError(409, 'Changed since you looked. Open the new version first.')
	}
	const parsed = binding.resolve(intent.input)
	const workflow = store.byCode(intent.item), automation = store.automation(intent.item), proposal = store.proposal(intent.item)
	let page: PageApproval | undefined
	if (binding.action.staleness === 'exact') {
		const expect = workflow ? workflowApprovalRev(workflow) : automation ? automationApprovalRev(automation) : proposal ? proposalApprovalRev(proposal) : undefined
		if (expect) {
			const todoIds = parsed.verb === 'close' ? workflow?.kept?.filter(todo => !todo.done).map(todo => todo.id) : undefined
			const kind: PageApproval['kind'] = todoIds?.length ? 'mark-todos' : parsed.verb === 'undo' ? 'undo-send' :
				parsed.verb === 'pick' ? 'pick' : workflow && pendingEffects(workflow.effects).length > 0 ? 'make-changes' :
					workflow?.draft && (parsed.verb === 'ok' || parsed.verb === 'send') ? 'send-reply' : 'approve'
			page = { kind, expect, ...(kind === 'undo-send' ? { sentMessageId: workflow?.sent?.msgId } : {}), ...(todoIds ? { todoIds } : {}) }
		}
	}
	return { parsed, page, shownAt: binding.action.kind === 'todo-done' ? binding.action.rev : workflow?.revAt ?? workflow?.updatedAt ?? automation?.updatedAt ?? proposal?.revAt }
}
export const resolveIntent = (store: Store, intent: Intent): Parsed => resolvePageIntent(store, intent).parsed
