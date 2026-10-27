import type { Config, Rule, Workflow } from './types.ts'
import { NAME } from '../brand.ts'
import type { LimitId } from './limits.ts'
import { BUSY, withRecordWriteNow, type Store } from '../store/state.ts'
import { DEFAULT_POLICY, instructionScopeMatches } from './policy.ts'
import { productLimits } from './limits.ts'
import { join } from 'node:path'
import { addRuleLine, changeRuleLine, changeRuleNote, RULE_WRITE_BUSY, ruleLines, ruleNotes, ruleTextHash, stopRuleLine, type RuleWriteResult } from '../store/rules.ts'
import { amendAction, readActions, type FoldedAction } from '../store/actions.ts'
import { telemetryEvent } from './telemetry.ts'
import { freshRead, scoped } from '../store/fs.ts'
import { lineConfirmed, lineGrants, ruleConflicts, ruleLineView, ruleUses, type RuleLine, type RuleLineState, type StandingInstruction } from './rule-lines.ts'
import { readBack } from './capabilities.ts'
import { answerHabitResult, dismissHabit, habitSuggestions, reconsiderHabit, undoAcceptHabit, undoDismiss as undoHabitDismiss,
	reconsiderSuggestion as reconsiderScopeSuggestion, turnedDownSuggestions, type Habit } from '../runner/habits.ts'

export { productLimits } from './limits.ts'

export type WayLine = {
	id: string
	text: string
	textHash: string
	source: 'owner' | 'learned' | 'setting'
	group: 'needs-him' | 'doing' | 'off'
	status: 'reading' | 'doing' | 'waiting' | 'off' | 'limited' | 'partly' | 'cant-yet' | 'unclear' | 'conflict'
	state: RuleLineState
	readBack: [string, string, string]
	readBackLabel: string
	readBackValue: string
	statusText: string
	notYet?: { clause: string; untilThen: string }[]
	limited?: LimitId[]
	question?: string
	setting?: string
	redirect?: true
	ruleIds?: string[]
	confirmedAt?: string
	usedThisWeek: number
	conflictWith?: string[]
}

export type WaySuggestion = {
	id: string
	text: string
	textHash: string
	readBack: [string, string, string]
	evidence: string
	links?: string[]
}
export type WayNote = { id: string; text: string; textHash: string; review: boolean }
export const wayNotes = (store: Store): WayNote[] => ruleNotes(store).map(note => ({
	...note, textHash: ruleTextHash(note.text), review: /\b(?:PRs?|pull requests?)\b/i.test(note.text) && /\breview\w*\b/i.test(note.text),
}))

export type WayWriteResult = { ok: true; line?: WayLine } | { ok: false; why: string }
export type SuggestionDismissal = 'not-now' | 'never'
export type WayTurnedDownHabit = { kind?: 'habit'; suggestion: WaySuggestion; at: string; how: SuggestionDismissal }
export type WayTurnedDown = WayTurnedDownHabit | { kind: 'suggestion'; key: string; label: string; at: string }
export type WaySuggestions = {
	open?: WaySuggestion
	turnedDown: WayTurnedDown[]
}

export const WAY_CHANGED = 'This line changed; your text is kept'
export const limitsCard = (cfg: Config) => productLimits(({ ...DEFAULT_POLICY, ...cfg.policy }).maxAutoPerChatHour)

function view(line: RuleLine, used: Record<string, number> = {}, conflictWith: string[] = [], conflict?: RuleLine): WayLine {
	const status = ruleLineView(line, conflict)
	const ruleIds = [...new Set([...(line.grantIds ?? []), ...(line.compile?.grants ?? []).map(grant => grant.id)])]
	const usedThisWeek = ruleIds.reduce((count, id) => count + (used[id] ?? 0), 0)
	const reading = status.status === 'reading', redirect = !reading && !!line.compile?.setting
	const readBackLabel = reading || redirect ? '' : 'Delegate reads this as:'
	const readBackValue = status.meaning || 'It waits for you.'
	const statusText = status.state === 'on' ? `\u2713 Doing this \u00b7 used ${usedThisWeek} times this week` : status.statusText
	const setting = status.setting ?? (line.compile?.grants.some(grant => grant.then === 'review') ? 'reviewRule' : undefined)
	return {
		id: line.id, text: line.text, textHash: ruleTextHash(line.text),
		source: line.source === 'settings' ? 'setting' : line.source,
		group: status.state === 'off' ? 'off' : ['reading', 'waiting', 'not-in-effect'].includes(status.state) ? 'needs-him' : 'doing',
		status: status.status, state: status.state, readBack: [line.text, readBackLabel ? `${readBackLabel} ${readBackValue}` : readBackValue, statusText],
		readBackLabel, readBackValue, statusText, usedThisWeek, ruleIds,
		...(line.compile?.notYet.length ? { notYet: line.compile.notYet.map(part => ({ clause: part.clause, untilThen: 'It waits for you.' })) } : {}),
		...(line.compile?.limited.length ? { limited: [...new Set(line.compile.limited.map(part => part.limit))] } : {}),
		...(line.compile?.question ? { question: line.compile.question } : {}),
		...(setting ? { setting } : {}), ...(redirect ? { redirect: true } : {}),
		...(lineConfirmed(line) ? { confirmedAt: line.confirmedAt } : {}),
		...(conflictWith.length ? { conflictWith } : {}),
	}
}
function lineViews(store: Store): WayLine[] {
	const lines = ruleLines(store), conflicts = ruleConflicts(lines)
	const used = scoped(`ruleuses:${join(store.root, 'state', 'log')}`, () => ruleUses(store.logs(7)))
	return lines.map(line => view(line, used, conflicts[line.id], lines.find(other => conflicts[line.id]?.includes(other.id))))
}
export const wayLines = (store: Store, _cfg: Config): WayLine[] => lineViews(store)
export type InstructionScope = { workflow: Workflow; pr?: number }
export function standingInstructions(store: Store, scopes: readonly InstructionScope[],
	mode: 'reply' | 'result' = 'reply'): StandingInstruction[] {
	const lines = ruleLines(store), conflicts = ruleConflicts(lines)
	return lines.flatMap(line => {
		const instruction = line.compile?.instruction
		if (!instruction) return []
		const state = ruleLineView(line, lines.find(other => conflicts[line.id]?.includes(other.id))).state
		if (state !== 'on' && state !== 'part' && state !== 'guidance') return []
		const grants = lineGrants(line).filter(grant => !grant.off)
		const unscoped = !instruction.who?.accounts?.length && !instruction.who?.group &&
			!Object.values(instruction.when ?? {}).some(value => value !== undefined)
		if (!scopes.length && (!unscoped || state !== 'guidance')) return []
		if (!scopes.every(({ workflow, pr }) => instructionScopeMatches(instruction, workflow, pr, mode) &&
			(state === 'guidance' || grants.some(grant => instructionScopeMatches(grant, workflow, pr, mode))))) return []
		return [{ state: state === 'guidance' ? 'Guidance' as const : 'Active' as const,
			instruction: { ...(instruction.task ? { task: instruction.task } : {}), constraints: [...instruction.constraints],
				...(instruction.output ? { output: instruction.output } : {}) } }]
	})
}
const suggestionText = (habit: Habit) => habit.removes
	? `Stop using this drafting style: ${habit.rule.style ?? habit.rule.text}` : habit.rule.text
function suggestion(habit: Habit): WaySuggestion {
	const text = suggestionText(habit)
	const meaning = habit.removes ? text
		: habit.kind === 'style' ? `Use this drafting style: ${habit.rule.style ?? text}` : readBack(habit.rule)
	const evidence = `${habit.evidence.count} ${habit.kind === 'style' ? 'edited' : 'unedited'} replies on ${habit.evidence.days} days, out of ${habit.evidence.total}.`
	return { id: habit.code, text, textHash: ruleTextHash(text),
		readBack: [text, `Delegate reads this as: ${meaning}`, evidence], evidence, links: habit.evidence.links }
}
export function suggestions(store: Store): WaySuggestions {
	const habits = habitSuggestions(store)
	return { ...(habits.open ? { open: suggestion(habits.open) } : {}),
		turnedDown: [
			...habits.turnedDown.map(({ habit, at, how }) => ({ suggestion: suggestion(habit), at, how })),
			...turnedDownSuggestions(store, Date.now()).map<WayTurnedDown>(({ key, label, at }) => ({ kind: 'suggestion', key, label, at })),
		] }
}
export const linesToCheck = (store: Store, _cfg: Config): number =>
	ruleLines(store).filter(line => ['waiting', 'not-in-effect'].includes(ruleLineView(line).state)).length
export const needsHim = (store: Store, cfg: Config): number =>
	linesToCheck(store, cfg) + Number(!!habitSuggestions(store).open)

function result(store: Store, written: RuleWriteResult): WayWriteResult {
	if (!written.ok || !written.line) return written.ok ? { ok: true } : written
	const line = lineViews(store).find(line => line.id === written.line!.id)
	if (!line) throw new Error('The saved rule line could not be read back.')
	return { ok: true, line }
}

// Every existing-line mutation compares expectHash before going through the rules writer.
// Add, edit and an on-switch that needs compilation return the Reading row at once.
export const addLine = (store: Store, text: string): WayWriteResult => result(store, addRuleLine(store, text))
export const editLine = (store: Store, id: string, text: string, expectHash: string): WayWriteResult =>
	result(store, changeRuleLine(store, id, { text }, expectHash))
export const confirmLine = (store: Store, id: string, textHash: string): WayWriteResult =>
	result(store, changeRuleLine(store, id, 'confirm', textHash))
export const setLineOff = (store: Store, id: string, off: boolean, expectHash: string): WayWriteResult =>
	result(store, changeRuleLine(store, id, off ? 'off' : 'on', expectHash))
export const deleteLine = (store: Store, id: string, expectHash: string): WayWriteResult =>
	result(store, changeRuleLine(store, id, 'delete', expectHash))
export const restoreLine = (store: Store, id: string, expectHash: string): WayWriteResult =>
	result(store, changeRuleLine(store, id, 'restore', expectHash))
export const answerLine = editLine
export const readLineAgain = (store: Store, id: string, expectHash: string): WayWriteResult =>
	result(store, changeRuleLine(store, id, 'read-again', expectHash))
export type StopActionScope = 'chat' | 'person' | 'never'
export type StopActionResult = { ok: true; mode: 'added' | 'turned-off'; line: WayLine } |
	{ ok: true; reminder: string } | { ok: false; why: string }
type StopPlan = { why: string } | { reminder: string } |
	{ action: FoldedAction; source: RuleLine; grant: Rule; covers: boolean; id: string; text: string; rule: Rule }
function planStop(store: Store, recordId: string, scope: StopActionScope, expectHash: string): StopPlan {
	if (!['chat', 'person', 'never'].includes(scope)) return { why: 'Choose where to stop doing this.' }
	const action = readActions(store, { since: '1970-01-01T00:00:00.000Z' }).find(action => action.id === recordId)
	if (!action) return { why: 'This action is no longer in the record.' }
	if (action.kind === 'reminder') return action.because.kind === 'setting' && action.because.key.trim()
		? { reminder: action.because.key } : { why: `${NAME} didn't record which reminder this was.` }
	if (action.kind !== 'reply' && action.kind !== 'ack' && action.kind !== 'review')
		return { why: 'Change this action in Settings.' }
	const because = action.because
	if (because.kind !== 'line') return { why: `${NAME} didn't record why this was allowed. Check Settings.` }
	const source = ruleLines(store).find(line => line.id === because.lineId)
	if (!source || ruleTextHash(source.text) !== expectHash) return { why: WAY_CHANGED }
	const grant = source.compile?.grants.find(grant => grant.id === because.grantId)
	const capability = action.kind === 'review' ? 'review' : action.kind === 'ack' ? 'ack' : 'send'
	if (!grant || grant.then !== capability) return { why: WAY_CHANGED }
	if (scope === 'person' && !action.to) return { why: 'This action has no recorded person. Choose its chat instead.' }
	const covers = scope === 'never' || scope === 'chat' && grant.when.chat === action.chat.id ||
		scope === 'person' && grant.who.accounts?.length === 1 && grant.who.accounts[0].id === action.to!.id
	const id = `line-stop-${action.id}-${scope}`
	const chat = action.chat.group ? action.chat.name : `your 1:1 with ${action.to?.first ?? action.chat.name.trim().split(/\s+/)[0]}`
	const text = scope === 'person'
		? action.kind === 'review' ? `Don't review ${action.to!.first}'s PRs by yourself.` :
			grant.when.results ? `Don't send review or investigation results to ${action.to!.first} by yourself.` : `Don't reply to ${action.to!.first} by yourself.`
		: action.kind === 'review' ? `Don't review PRs by yourself in ${chat}.` :
			grant.when.results ? `Don't send review or investigation results by yourself in ${chat}.` : `Don't reply by yourself in ${chat}.`
	const rule: Rule = { id: `${id}-g1`, text, then: 'draft',
		who: scope === 'person' ? { accounts: [{ id: action.to!.id, name: action.to!.first }] } : structuredClone(grant.who),
		when: { intent: grant.when.intent, reviewerGroup: grant.when.reviewerGroup,
			...(action.kind !== 'review' && grant.when.minConfidence ? { minConfidence: grant.when.minConfidence } : {}),
			chat: scope === 'chat' ? action.chat.id : grant.when.chat,
			lane: action.kind === 'review' ? 'review' : grant.when.results ? 'result' : 'reply' } }
	return { action, source, grant, covers, id, text, rule }
}
export function stopPreview(store: Store, recordId: string, scope: StopActionScope, expectHash: string):
	{ mode: 'added'; text: string } | { mode: 'turned-off'; text: string } | { reminder: string } | { why: string } {
	const plan = planStop(store, recordId, scope, expectHash)
	if ('why' in plan || 'reminder' in plan) return plan
	return plan.covers ? { mode: 'turned-off', text: plan.source.text } : { mode: 'added', text: plan.text }
}
export function stopFromAction(store: Store, recordId: string, scope: StopActionScope, expectHash: string): StopActionResult {
	const plan = planStop(store, recordId, scope, expectHash)
	if ('why' in plan) return { ok: false, why: plan.why }
	if ('reminder' in plan) return { ok: true, reminder: plan.reminder }
	const { action, source, grant, covers, id, text, rule } = plan
	const written = stopRuleLine(store, source.id, grant, expectHash, covers ? undefined : { id, text, rule })
	const saved = result(store, written)
	if (!saved.ok || !saved.line) return saved.ok ? { ok: false, why: 'The stop line could not be read back.' } : saved
	const mode = covers ? 'turned-off' as const : 'added' as const
	const historyFailed = `The line is stopped, but ${NAME} could not save its history. Check the line in Settings.`
	try {
		const recorded = amendAction(store, { v: 1, ref: action.id, at: new Date().toISOString(), by: 'owner', kind: 'stopped', lineId: saved.line.id, mode })
		if (!recorded || recorded === BUSY) {
			store.log(telemetryEvent('wdd-stop-record-failed', { reason: recorded === BUSY ? 'busy' : 'missing' }))
			return { ok: false, why: historyFailed }
		}
	} catch (error) {
		store.log(telemetryEvent('wdd-stop-record-failed', { reason: 'write-failed' }))
		throw new Error(historyFailed, { cause: error })
	}
	store.log(telemetryEvent('wdd-stop', { kind: action.kind, scope, mode }))
	return { ok: true, mode, line: saved.line }
}
export const makeNoteLine = (store: Store, id: string, expectHash: string): WayWriteResult =>
	result(store, changeRuleNote(store, id, true, expectHash))
export const deleteNote = (store: Store, id: string, expectHash: string): WayWriteResult =>
	result(store, changeRuleNote(store, id, false, expectHash))
function currentSuggestion(store: Store, id: string, expectHash: string): Habit | undefined {
	const habit = freshRead(() => store.habits().find(habit => habit.key === id || habit.code.toUpperCase() === id.toUpperCase()))
	return habit && ruleTextHash(suggestionText(habit)) === expectHash ? habit : undefined
}
export function acceptSuggestion(store: Store, id: string, text: string, expectHash: string): WayWriteResult {
	const habit = currentSuggestion(store, id, expectHash)
	if (!habit || !['suggested', 'accepted'].includes(habit.state)) return { ok: false, why: WAY_CHANGED }
	if (!text.trim()) return { ok: false, why: 'Write a line before saving it.' }
	const unchanged = text === suggestionText(habit)
	if (!unchanged && habit.state !== 'suggested') return { ok: false, why: WAY_CHANGED }
	const accepted = answerHabitResult(store, habit, 'ok', unchanged ? habit.rule.text : text)
	if (!accepted.ok) return accepted
	const record = ruleLines(store).find(record => record.learned?.key === habit.key)
	const line = record && lineViews(store).find(line => line.id === record.id)
	return { ok: true, ...(line ? { line } : {}) }
}
export function undoAcceptSuggestion(store: Store, id: string, expectHash: string): WayWriteResult {
	const undone = withRecordWriteNow(join(store.root, 'rules.compiled.json'), () => freshRead((): WayWriteResult => {
		const line = ruleLines(store).find(line => line.id === id)
		if (!line || line.source !== 'learned' || !line.learned?.key || ruleTextHash(line.text) !== expectHash)
			return { ok: false, why: WAY_CHANGED }
		const restored = undoAcceptHabit(store, line.learned.key)
		return restored.ok ? { ok: true } : restored
	}))
	return undone === BUSY ? { ok: false, why: RULE_WRITE_BUSY } : undone
}
export function dismissSuggestion(store: Store, id: string, how: SuggestionDismissal, expectHash: string): WayWriteResult {
	if (!currentSuggestion(store, id, expectHash)) return { ok: false, why: WAY_CHANGED }
	const dismissed = dismissHabit(store, id, how)
	return dismissed.ok ? { ok: true } : dismissed
}
export function undoDismiss(store: Store, id: string): WayWriteResult {
	const restored = undoHabitDismiss(store, id)
	return restored.ok ? { ok: true } : restored
}
export function reconsiderSuggestion(store: Store, id: string, kind?: WayTurnedDown['kind']): WayWriteResult {
	if (kind === 'suggestion') return reconsiderScopeSuggestion(store, id)
	const reconsidered = reconsiderHabit(store, id)
	return reconsidered.ok ? { ok: true } : reconsidered
}
