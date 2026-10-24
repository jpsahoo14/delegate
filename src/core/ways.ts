import type { Config } from './types.ts'
import type { LimitId } from './limits.ts'
import { BUSY, withRecordWriteNow, type Store } from '../store/state.ts'
import { DEFAULT_POLICY } from './policy.ts'
import { productLimits } from './limits.ts'
import { join } from 'node:path'
import { addRuleLine, changeRuleLine, changeRuleNote, RULE_WRITE_BUSY, ruleLines, ruleNotes, ruleTextHash, type RuleWriteResult } from '../store/rules.ts'
import { freshRead, scoped } from '../store/fs.ts'
import { lineConfirmed, ruleConflicts, ruleLineView, ruleUses, type RuleLine } from './rule-lines.ts'
import { readBack } from './capabilities.ts'
import { answerHabitResult, dismissHabit, habitSuggestions, reconsiderHabit, undoAcceptHabit, undoDismiss as undoHabitDismiss,
	type Habit } from '../runner/habits.ts'

export { productLimits } from './limits.ts'

export type WayLine = {
	id: string
	text: string
	textHash: string
	source: 'owner' | 'learned' | 'setting'
	group: 'needs-him' | 'doing' | 'off'
	status: 'reading' | 'doing' | 'waiting' | 'off' | 'limited' | 'partly' | 'cant-yet' | 'unclear' | 'conflict'
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
export type WaySuggestions = {
	open?: WaySuggestion
	turnedDown: { suggestion: WaySuggestion; at: string; how: SuggestionDismissal }[]
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
	const statusText = status.status === 'doing' ? `\u2713 Doing this \u00b7 used ${usedThisWeek} times this week` : status.statusText
	const setting = status.setting ?? (line.compile?.grants.some(grant => grant.then === 'review') ? 'reviewRule' : undefined)
	return {
		id: line.id, text: line.text, textHash: ruleTextHash(line.text),
		source: line.source === 'settings' ? 'setting' : line.source,
		group: status.status === 'off' ? 'off' : ['reading', 'waiting', 'unclear'].includes(status.status) ? 'needs-him' : 'doing',
		status: status.status, readBack: [line.text, readBackLabel ? `${readBackLabel} ${readBackValue}` : readBackValue, statusText],
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
		turnedDown: habits.turnedDown.map(({ habit, at, how }) => ({ suggestion: suggestion(habit), at, how })) }
}
export const linesToCheck = (store: Store, _cfg: Config): number =>
	ruleLines(store).filter(line => ['waiting', 'unclear'].includes(ruleLineView(line).status)).length
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
export function reconsiderSuggestion(store: Store, id: string): WayWriteResult {
	const reconsidered = reconsiderHabit(store, id)
	return reconsidered.ok ? { ok: true } : reconsidered
}
