import type { Config, EditScope, Rule, Workflow } from '../core/types.ts'
import { BUSY, withRecordWriteNow, type Store } from '../store/state.ts'
import { offRecord } from '../core/levels.ts'
import { messageLink } from '../adapters/channels.ts'
import { createHash, randomUUID } from 'node:crypto'
import { freshRead, readJson, writeJson } from '../store/fs.ts'
import { addSuggestedRuleLine, ruleLines, rulesSnapshot, RULE_WRITE_BUSY, writeHabitRules, type RuleWriteResult } from '../store/rules.ts'
import { lineConfirmed, ruleTextHash } from '../core/rule-lines.ts'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalKey } from './jobs.ts'

// Habits: steady patterns in what the owner does, offered as standing instructions they accept or not (dev-spec/habits.md).
// send: let a kind of reply go by itself. style: draft the way the owner keeps editing (edit habits); removes: offer to drop a
// style the owner keeps editing against.
export type Habit = {
	key: string; code: string; kind: 'send' | 'style'
	text: string; does: string
	evidence: { count: number; days: number; total: number; links: string[] }
	rule: Rule
	state: 'suggested' | 'accepted' | 'snoozed' | 'declined'
	until?: string; at: string; told?: boolean
	kinds?: string[]; scope?: string; removes?: string
	dismissals?: HabitDismissal[]
	undoDismissal?: string
	acceptedBefore?: Pick<Habit, 'state' | 'at' | 'until' | 'told'>
	acceptedTextHash?: string
	acceptedLineTextHash?: string
}
export type HabitDismissalHow = 'not-now' | 'never'
export type HabitDismissal = {
	id: string; at: string; how: HabitDismissalHow; count: number; undone?: true
	before?: Pick<Habit, 'state' | 'until' | 'at' | 'told'>
}
export type HabitTransitionResult = { ok: true; habit: Habit } | { ok: false; why: string }
export type HabitSuggestions = { open?: Habit; turnedDown: { habit: Habit; at: string; how: HabitDismissalHow }[] }
export type HabitAnswerResult = { ok: true; text: string } | { ok: false; why: string }
export type Outcome = { how: 'sent' | 'skipped'; chat: string; group: boolean; guests?: boolean; asker?: { id: string; name: string }; intent?: string; edited: boolean; approvedBy?: string; link?: string; at: string }

const DAY = 86_400_000
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

const dismissalKey = z.string().refine(key => !!key.trim(), 'A suggestion scope key is required.')
const suggestionDismissal = z.object({
	key: dismissalKey, label: z.string().refine(label => !!label.trim(), 'A suggestion summary is required.'),
	at: z.iso.datetime(), until: z.iso.datetime(),
}).strict()
const scopeDismissals = z.array(suggestionDismissal)
export type SuggestionDismissal = z.infer<typeof suggestionDismissal>
export type SuggestionDismissalResult = { ok: true } | { ok: false; why: string }
const dismissalFile = (store: Store) => join(store.root, 'state', 'suggestion-dismissals.json')
const readDismissals = (store: Store) => scopeDismissals.parse(readJson<unknown>(dismissalFile(store), []))

export function dismissKey(capability: string, target: string): string {
	const scope = canonicalKey(target)
	if (!capability.trim() || !scope) throw new Error('A suggestion capability and target are required.')
	return capability + ':' + scope
}
export function isDismissed(store: Store, key: string, now: number): boolean {
	dismissalKey.parse(key)
	if (!Number.isFinite(now)) throw new Error('A valid dismissal lookup time is required.')
	return readDismissals(store).some(row => row.key === key && Date.parse(row.until) > now)
}
export function turnedDownSuggestions(store: Store, now: number): SuggestionDismissal[] {
	if (!Number.isFinite(now)) throw new Error('A valid dismissal lookup time is required.')
	return readDismissals(store).filter(row => Date.parse(row.until) > now).sort((a, b) => b.at.localeCompare(a.at))
}
function changeDismissals(store: Store, change: (rows: SuggestionDismissal[]) => SuggestionDismissal[]): SuggestionDismissalResult {
	const path = dismissalFile(store)
	const result = withRecordWriteNow(path, () => freshRead((): SuggestionDismissalResult => {
		writeJson(path, change(readDismissals(store)), store.machine)
		return { ok: true }
	}))
	return result === BUSY ? { ok: false, why: RULE_WRITE_BUSY } : result
}
export function dismissSuggestion(store: Store, key: string, at: string, label: string): SuggestionDismissalResult {
	const time = Date.parse(z.iso.datetime({ offset: true }).parse(at))
	const row = suggestionDismissal.parse({ key, label, at: new Date(time).toISOString(), until: new Date(time + 60 * DAY).toISOString() })
	return changeDismissals(store, rows => [...rows.filter(old => old.key !== key && Date.parse(old.until) > time), row])
}
export function reconsiderSuggestion(store: Store, key: string): SuggestionDismissalResult {
	dismissalKey.parse(key)
	const now = Date.now()
	return changeDismissals(store, rows => rows.filter(row => row.key !== key && Date.parse(row.until) > now))
}

function dismissalHistory(h: Habit): HabitDismissal[] {
	if (h.dismissals) return h.dismissals
	if (h.state !== 'snoozed' && h.state !== 'declined') return []
	const until = Date.parse(h.until ?? '')
	return [{ id: 'legacy', at: h.state === 'snoozed' && Number.isFinite(until) ? new Date(until - 14 * DAY).toISOString() : h.at,
		how: h.state === 'snoozed' ? 'not-now' : 'never', count: h.evidence.count }]
}
const notNows = (h: Habit) => dismissalHistory(h).filter(d => d.how === 'not-now' && !d.undone)
const evidenceFloor = (h: Habit | undefined, base: number) => {
	const declines = h ? notNows(h) : []
	return declines.length >= 2 ? Math.max(base, declines.at(-1)!.count * 2) : base
}
function changeHabit(store: Store, id: string, change: (h: Habit) => HabitTransitionResult): HabitTransitionResult {
	return freshRead(() => {
		const all = store.habits(), h = all.find(h => h.key === id || h.code.toUpperCase() === id.toUpperCase())
		if (!h) return { ok: false, why: "That suggestion is no longer available." }
		const result = change(h)
		if (result.ok && result.habit !== h) store.saveHabits(all.map(x => x.key === h.key ? result.habit : x))
		return result
	})
}
function dismissed(h: Habit, how: HabitDismissalHow, now: Date, undoable = true): Habit {
	const history = dismissalHistory(h), id = randomUUID(), at = now.toISOString()
	const days = history.filter(d => d.how === 'not-now' && !d.undone).length >= 1 ? 60 : 14
	return { ...h, state: how === 'never' ? 'declined' : 'snoozed', until: how === 'never' ? undefined : new Date(now.getTime() + days * DAY).toISOString(),
		acceptedBefore: undefined, acceptedTextHash: undefined, acceptedLineTextHash: undefined,
		dismissals: [...history, { id, at, how, count: h.evidence.count,
			...(undoable ? { before: { state: h.state, until: h.until, at: h.at, told: h.told } } : {}) }],
		undoDismissal: undoable ? id : undefined }
}
export function habitSuggestions(store: Store): HabitSuggestions {
	const all = freshRead(() => store.habits())
	return { open: all.filter(h => h.state === 'suggested').sort((a, b) => b.at.localeCompare(a.at))[0],
		turnedDown: all.filter(h => h.state === 'snoozed' || h.state === 'declined').flatMap(h => {
			const last = dismissalHistory(h).filter(d => !d.undone).at(-1)
			return last ? [{ habit: h, at: last.at, how: last.how }] : []
		}).sort((a, b) => b.at.localeCompare(a.at)) }
}
export function dismissHabit(store: Store, id: string, how: HabitDismissalHow): HabitTransitionResult {
	if (how !== 'not-now' && how !== 'never') return { ok: false, why: 'Choose Not now or Never.' }
	return changeHabit(store, id, h => {
		if (h.state === 'snoozed' && how === 'not-now' || h.state === 'declined' && how === 'never') return { ok: true, habit: h }
		if (h.state !== 'suggested') return { ok: false, why: 'Reconsider this suggestion before turning it down again. Active lines must be turned off instead.' }
		return { ok: true, habit: dismissed(h, how, new Date()) }
	})
}
export function undoDismiss(store: Store, id: string): HabitTransitionResult {
	return changeHabit(store, id, h => {
		const history = dismissalHistory(h), last = history.at(-1)
		if (!last?.before || last.undone || h.undoDismissal !== last.id || h.state !== (last.how === 'never' ? 'declined' : 'snoozed'))
			return { ok: false, why: 'That dismissal is no longer the latest change. Nothing was restored.' }
		return { ok: true, habit: { ...h, ...last.before, until: last.before.until, told: last.before.told, undoDismissal: undefined,
			dismissals: [...history.slice(0, -1), { ...last, undone: true }] } }
	})
}
export function reconsiderHabit(store: Store, id: string): HabitTransitionResult {
	return changeHabit(store, id, h => {
		if (h.state === 'suggested') return { ok: true, habit: h }
		if (h.state === 'accepted') return { ok: false, why: 'This suggestion is already on. Change its line instead.' }
		return { ok: true, habit: { ...h, state: 'suggested', until: undefined, at: new Date().toISOString(), told: true,
			dismissals: dismissalHistory(h), undoDismissal: undefined } }
	})
}

function acceptanceProblem(store: Store, h: Habit, now: number): string | undefined {
	if (h.removes) return 'Undo is not available for a stop-style suggestion.'
	if (h.state !== 'accepted' || !h.acceptedBefore || h.acceptedBefore.state === 'accepted' || !h.acceptedTextHash || !h.acceptedLineTextHash)
		return 'That acceptance can no longer be undone exactly. Change its current line instead.'
	const elapsed = now - Date.parse(h.at), limit = undoMs(store)
	if (!Number.isFinite(elapsed) || !Number.isFinite(limit) || elapsed < 0 || elapsed > limit)
		return `The undo time for ${h.code} is over. Change its current line instead.`
	const lines = ruleLines(store).filter(line => line.source === 'learned' && line.learned?.key === h.key), line = lines[0]
	const globalAt = rulesSnapshot(store).file.confirmedAt
	const legacyConfirmation = !!globalAt && line?.confirmedAt === globalAt && Date.parse(globalAt) < Date.parse(h.at)
	if (!line || lines.length !== 1 || !lineConfirmed(line) || (line.confirmedAt !== h.at && !legacyConfirmation) || line.learned?.at !== h.at ||
		h.rule.learned?.at !== h.at || ruleTextHash(line.text) !== h.acceptedLineTextHash || ruleTextHash(h.rule.text) !== h.acceptedTextHash ||
		!!line.off !== !!h.rule.off || !line.compile?.grants.some(grant => grant.id === h.rule.id))
		return 'That acceptance is no longer the latest change. Nothing was restored.'
	return undefined
}
export function undoAcceptHabit(store: Store, id: string): HabitTransitionResult {
	// The same reentrant writer lock keeps the accepted-hash check valid through removal and the local state restore.
	const result = withRecordWriteNow(join(store.root, 'rules.compiled.json'), () => changeHabit(store, id, h => {
		const why = acceptanceProblem(store, h, Date.now())
		if (why) return { ok: false, why }
		const before = h.acceptedBefore!
		const written = setRules(store, rulesSnapshot(store).file.rules.filter(rule => rule.learned?.key !== h.key))
		if (!written.ok) return written
		return { ok: true, habit: { ...h, ...before, until: before.until, told: before.told,
			acceptedBefore: undefined, acceptedTextHash: undefined, acceptedLineTextHash: undefined, undoDismissal: undefined } }
	}))
	if (result === BUSY) return { ok: false, why: RULE_WRITE_BUSY }
	if (result.ok) store.log({ event: 'habit-undone', code: result.habit.code, key: result.habit.key })
	return result
}

// One record per handled item, with whether the owner changed the words, compared as text (review: verb alone lies).
export function outcome(store: Store, wf: Workflow, how: Outcome['how'], o: { draft?: string; sent?: string; approvedBy?: string; msgId?: string } = {}) {
	const edited = how === 'sent' && !!o.draft && !!o.sent && norm(o.draft) !== norm(o.sent)
	const link = o.msgId ? messageLink(wf.chat.id, o.msgId) : undefined
	store.log({ event: 'outcome', how, chat: wf.chat.id, group: !!wf.chat.group, guests: wf.chat.guests, asker: wf.asker, intent: wf.intent, edited, approvedBy: o.approvedBy, ...(link ? { link } : {}) })
}

const covered = (rules: Rule[], asker: string, intent: string) => rules.some(r => !r.off && r.then === 'send' && r.who.accounts?.some(a => a.id === asker) && (!r.when.intent || r.when.intent === intent) && (!r.when.chat || r.when.chat === 'direct'))

// Once a day at most: the strongest new send habit, kept narrow (one person, one kind of ask, 1:1 chats).
export function noticeHabits(store: Store, cfg: Config, now = Date.now()): Habit | undefined {
	if (cfg.noticeHabits === false) return undefined
	const habits = store.habits()
	if (habits.some(h => h.state === 'suggested' && now - Date.parse(h.at) < DAY)) return undefined
	const never = new Set((cfg.policy?.never ?? []).map(p => p.id))
	const rules = store.rules()
	const all = store.logs(30).filter(e => e.event === 'outcome') as unknown as Outcome[]
	const groups = new Map<string, Outcome[]>()
	for (const o of all) {
		if (!o.asker?.id || !o.intent || o.intent === 'none' || offRecord(cfg, o.chat)) continue
		const k = `${o.asker.id}|${o.intent}`
		groups.set(k, [...(groups.get(k) ?? []), o])
	}
	const found: Habit[] = []
	for (const [k, os] of groups) {
		const [asker, intent] = k.split('|')
		const key = `send:${asker}:${intent}:direct`
		const old = habits.find(h => h.key === key)
		if (old && (old.state !== 'snoozed' || Date.parse(old.until ?? '') > now)) continue
		if (never.has(asker) || covered(rules, asker, intent)) continue
		// Only 1:1 chats without guests, and only items the owner handled.
		if (os.some(o => o.group || o.guests)) continue
		const mine = os.filter(o => o.how === 'skipped' || o.approvedBy === 'owner').sort((a, b) => a.at.localeCompare(b.at))
		const clean = mine.filter(o => o.how === 'sent' && !o.edited)
		const days = new Set(clean.map(o => o.at.slice(0, 10))).size
		if (clean.length < evidenceFloor(old, 5) || days < 3 || clean.length / mine.length < 0.9 || mine.slice(-3).some(o => o.how !== 'sent' || o.edited)) continue
		const name = os.at(-1)!.asker!.name, first = name.split(/\s+/)[0]
		const label = intent.replace(/_/g, ' ')
		found.push({
			key, code: '', kind: 'send', state: 'suggested', at: new Date(now).toISOString(),
			text: `You sent your last ${clean.length} replies to ${first} (${label}) without changes. Let those go by themselves?`,
			does: `Replies to ${name} in your 1:1 about ${label} go out by themselves, with the usual checks (private sources, commitments, open work, guests, need to know) and an undo.`,
			evidence: { count: clean.length, days, total: mine.length, links: clean.map(o => o.link).filter((l): l is string => !!l).slice(-5) },
			rule: { id: `learned-${asker.slice(0, 8)}-${intent}`, text: `Learned: replies to ${name} in 1:1 about ${label} go by themselves`, who: { accounts: [{ id: asker, name }] }, when: { chat: 'direct', intent }, then: 'send' },
		})
	}
	const best = found.sort((a, b) => b.evidence.count - a.evidence.count)[0] ?? styleHabit(store, cfg, habits, now)
	if (!best) return undefined
	return freshRead(() => {
		const current = store.habits(), previous = current.find(h => h.key === best.key)
		if (current.some(h => h.state === 'suggested' && now - Date.parse(h.at) < DAY)) return undefined
		if (previous && (previous.state !== 'snoozed' || Date.parse(previous.until ?? '') > now ||
			best.evidence.count < evidenceFloor(previous, best.kind === 'send' ? 5 : 3))) return undefined
		best.code = store.nextCode('H')
		if (previous) best.dismissals = dismissalHistory(previous)
		store.saveHabits([...current.filter(h => h.key !== best.key), best])
		store.log({ event: 'habit-suggested', code: best.code, key: best.key, evidence: best.evidence })
		return best
	})
}

// ok turns a suggestion on; skip is "not now" (14 days); never drops it, or removes the rule it made.
// A style also takes edit (its words, saved as written) and undo (within the undo window after ok: the rule goes, the suggestion is back).
export function answerHabit(store: Store, h: Habit, verb: string, text?: string): string {
	const result = answerHabitResult(store, h, verb, text)
	return result.ok ? result.text : result.why
}
export function answerHabitResult(store: Store, h: Habit, verb: string, text?: string): HabitAnswerResult {
	const done = (text: string): HabitAnswerResult => ({ ok: true, text })
	const refused = (why: string): HabitAnswerResult => ({ ok: false, why })
	const current = freshRead(() => store.habits().find(x => x.key === h.key && x.code === h.code))
	if (!current) return refused('That suggestion changed. Open its current version first.')
	h = current
	const now = new Date()
	const storedRules = () => freshRead(() => rulesSnapshot(store).file.rules)
	const save = (x: Partial<Habit>) => {
		const result = changeHabit(store, h.key, y => ({ ok: true, habit: { ...y, acceptedBefore: undefined, acceptedTextHash: undefined, acceptedLineTextHash: undefined,
			...x, dismissals: dismissalHistory(y), undoDismissal: undefined } }))
		if (!result.ok) throw new Error(result.why)
	}
	const evidence = h.kind === 'style' ? `${h.evidence.count} edited replies on ${h.evidence.days} day${h.evidence.days === 1 ? '' : 's'}` : `${h.evidence.count} unedited replies on ${h.evidence.days} days`
	if (verb === 'more') return done(`${h.code} · ${h.text}\n${h.does}\nEvidence: ${evidence}, out of ${h.evidence.total}.${h.evidence.links.length ? `\n${h.evidence.links.map(l => `- ${l}`).join('\n')}` : ''}`)
	if (verb === 'ok') {
		if (h.state === 'accepted') return done(`${h.code} is already on.`)
		if (text?.trim() && text !== h.rule.text && text !== h.text) {
			if (h.state !== 'suggested') return refused('Reconsider this suggestion before accepting edited words.')
			const learned = { key: h.key, at: now.toISOString(), evidence }
			const style = h.kind === 'style' && !h.removes && h.rule.then === 'draft' && h.rule.style ? text : undefined
			const result = addSuggestedRuleLine(store, text, { learned, style, ruleId: h.rule.id })
			if (!result.ok) return refused(result.why)
			save({ state: 'accepted', at: now.toISOString(), until: undefined, rule: { ...h.rule, text, style, learned } })
			store.log({ event: 'habit-accepted', code: h.code, key: h.key, edited: true })
			return done(`${h.code}: your edited line is saved and is being read. It has not been turned on.`)
		}
		// An offer to drop a style the owner keeps editing against: ok removes that style.
		if (h.removes) {
			const rules = storedRules(), target = rules.find(r => r.id === h.removes)
			if (target && target.learned?.key !== h.key.replace(/^style-off:/, '')) return refused('That style no longer belongs to this suggestion. Change its current line instead.')
			const result = setRules(store, rules.filter(r => r.id !== h.removes))
			if (!result.ok) return refused(result.why)
			freshRead(() => store.saveHabits(store.habits().map(y => y.rule.id === h.removes && y.key !== h.key ? dismissed(y, 'never', now, false) :
				y.key === h.key ? { ...y, state: 'accepted' as const, at: now.toISOString(), undoDismissal: undefined,
					acceptedBefore: undefined, acceptedTextHash: undefined, acceptedLineTextHash: undefined } : y)))
			store.log({ event: 'habit-accepted', code: h.code, key: h.key, removed: h.removes })
			return done(`${h.code}: done, drafts no longer follow that style.`)
		}
		const rule = { ...h.rule, learned: { key: h.key, at: now.toISOString(), evidence } }
		const result = setRules(store, [...storedRules().filter(r => r.id !== h.rule.id), rule])
		if (!result.ok) return refused(result.why)
		const lines = freshRead(() => ruleLines(store)).filter(line => line.source === 'learned' && line.learned?.key === h.key)
		if (lines.length !== 1) throw new Error('The rule was saved, but its learned line could not be verified. Open Your way of working before trying again.')
		save({ state: 'accepted', at: now.toISOString(), until: undefined, rule,
			acceptedBefore: { state: h.state, at: h.at, until: h.until, told: h.told }, acceptedTextHash: ruleTextHash(rule.text),
			acceptedLineTextHash: ruleTextHash(lines[0].text) })
		store.log({ event: 'habit-accepted', code: h.code, key: h.key })
		return done(`${h.code} is on: ${h.does} Say "never ${h.code}" to turn it off.`)
	}
	if (verb === 'edit' && h.kind === 'style' && !h.removes) {
		const style = (text ?? '').replace(/\s+/g, ' ').trim()
		if (!style) return refused(`Say "edit ${h.code}: <how drafts should be written>".`)
		const rules = storedRules(), rule = rules.find(r => r.id === h.rule.id)
		if (!rule || h.state !== 'accepted') return refused(`${h.code} is not on, so there is no style to change. Turn it on first.`)
		if (rule.learned?.key !== h.key) return refused('That line no longer belongs to this habit. Open its current version first.')
		if (rule.then !== 'draft') return refused('Edit this line in Your way of working so the changed text is read first.')
		const edited = { ...rule, style, text: `Learned: ${styleTitle(h.rule)}: ${style}`, learned: { ...rule.learned, at: now.toISOString() } }
		const result = setRules(store, rules.map(r => r.id === rule.id ? edited : r))
		if (!result.ok) return refused(result.why)
		save({ rule: edited, at: now.toISOString() })
		store.log({ event: 'habit-edited', code: h.code, key: h.key })
		return done(`${h.code} now says: ${style}`)
	}
	if (verb === 'undo' && h.state === 'accepted') {
		const result = undoAcceptHabit(store, h.key)
		return result.ok ? done(`Undone: ${h.code}'s previous suggestion state is restored.`) : refused(result.why)
	}
	if (verb === 'skip') {
		const result = dismissHabit(store, h.key, 'not-now')
		return result.ok ? done(`Not now. ${h.code} stays away for ${notNows(result.habit).length >= 2 ? 60 : 14} days.`) : refused(result.why)
	}
	if (verb === 'undo') {
		const result = undoDismiss(store, h.key)
		return result.ok ? done(`Undone: ${h.code}'s previous suggestion state is restored.`) : refused(result.why)
	}
	if (verb === 'never') {
		const rules = storedRules(), candidate = !h.removes ? rules.find(r => r.id === h.rule.id) : undefined
		const target = candidate?.learned?.key === h.key ? candidate : undefined
		if (h.state === 'accepted' && candidate && !target) return refused('That line no longer belongs to this habit. Open its current version first.')
		const had = !!target
		if (had || h.state === 'accepted') {
			const result = setRules(store, rules.filter(r => r.id !== h.rule.id))
			if (!result.ok) return refused(result.why)
			const changed = changeHabit(store, h.key, y => ({ ok: true, habit: dismissed(y, 'never', now, false) }))
			if (!changed.ok) return refused(changed.why)
		} else {
			const result = dismissHabit(store, h.key, 'never')
			if (!result.ok) return refused(result.why)
		}
		store.log({ event: 'habit-declined', code: h.code, key: h.key, removed: had })
		return done(had ? `${h.code} is off; that rule is removed.` : `${h.code} will not be suggested again.`)
	}
	return refused(`${h.code} takes ok, skip (not now), never, or more${h.kind === 'style' ? ', and once on, edit or undo' : ''}.`)
}
export const undoMs = (store: Store) => (store.config().policy?.undoMin ?? 10) * 60_000
export const habitUndoable = (store: Store, h: Habit, now = Date.now()) => h.kind === 'style' && !acceptanceProblem(store, h, now)

// ---- Edit habits (Features/Assistant/reviews/advisers/pm-edit-habits.md) ----
// One log per owner-edited send (rule sends and off-record chats never reach here), with the kinds of edit code can measure.
// tone and language come later, from the learn run, as a second log for the same item (ai: true).
export type EditStyle = EditScope & { event: 'edit-style'; at: string; kinds: string[]; link?: string; ai?: true }
const GREETING = /^(hi+|hello|hey|dear|good (?:morning|afternoon|evening)|namaste|greetings)\b/i
const LIST = /^\s*(?:[-*•]|\d+[.)])\s+/
const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean).length
const linesOf = (t: string) => t.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
const urlKinds = (t: string) => new Set([...t.matchAll(/https?:\/\/\S+/gi)].map(m => /pullrequest\//i.test(m[0]) ? 'pr' : /_wiki|\/wiki\//i.test(m[0]) ? 'wiki' : /sharepoint|\.(?:docx?|pptx?|xlsx?|loop)\b/i.test(m[0]) ? 'doc' : 'link'))
const closing = (t: string) => { const ls = linesOf(t), l = ls.at(-1) ?? ''; return ls.length > 1 && wordsOf(l) <= 4 && !LIST.test(l) && !/https?:/i.test(l) ? l : '' }
const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
export function editKinds(draft: string, sent: string): string[] {
	const k: string[] = [], d = wordsOf(draft), s = wordsOf(sent)
	if (d >= 6 && s <= 0.7 * d) k.push('shorter')
	if (d >= 3 && s >= 1.4 * d) k.push('longer')
	if (linesOf(sent).filter(l => LIST.test(l)).length >= 2 && !linesOf(draft).some(l => LIST.test(l))) k.push('bullets')
	const gd = GREETING.test(linesOf(draft)[0] ?? ''), gs = GREETING.exec(linesOf(sent)[0] ?? '')
	if (gs && !gd) k.push(`greeting:${gs[1].toLowerCase()}`)
	if (gd && !gs) k.push('no-greeting')
	const c = closing(sent)
	if (c && bare(c) && !bare(draft).endsWith(bare(c))) k.push(`signoff:${c}`)
	const had = urlKinds(draft)
	if ([...urlKinds(sent)].some(x => !had.has(x))) k.push('link')
	return k
}
// The same kind, whatever its exact words: "Thanks!" and "thanks" are one sign-off.
const kindKey = (k: string) => k.startsWith('signoff:') ? `signoff:${bare(k.slice(8))}` : k.startsWith('language:') ? `language:${bare(k.slice(9))}` : k
const OPPOSITE: Record<string, (k: string) => boolean> = {
	shorter: k => k === 'longer', longer: k => k === 'shorter', 'no-greeting': k => k.startsWith('greeting:'), 'tone:casual': k => k === 'tone:formal', 'tone:formal': k => k === 'tone:casual',
}
const opposite = (key: string) => OPPOSITE[key] ?? (key.startsWith('greeting:') ? (k: string) => k === 'no-greeting' : () => false)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
function says(k: string): { did: string; rule: string; against: string } {
	if (k === 'shorter') return { did: 'shortened the draft', rule: 'Keep replies short: about half of what you would write.', against: 'made drafts longer' }
	if (k === 'longer') return { did: 'made the draft longer', rule: 'Give fuller replies, with the reasoning.', against: 'shortened drafts' }
	if (k === 'bullets') return { did: 'used bullet points', rule: 'Use bullet points when there is more than one point.', against: 'removed bullet points' }
	if (k.startsWith('greeting:')) return { did: `started with "${cap(k.slice(9))}"`, rule: `Start with "${cap(k.slice(9))} <first name>,".`, against: 'removed the greeting' }
	if (k === 'no-greeting') return { did: 'removed the greeting', rule: 'No greeting: start with the answer.', against: 'added a greeting' }
	if (k.startsWith('signoff:')) return { did: `ended with "${k.slice(8)}"`, rule: `End with "${k.slice(8)}".`, against: 'changed the ending' }
	if (k === 'link') return { did: 'added the link you meant', rule: 'Include the link to the PR or document you mean.', against: 'removed the link' }
	if (k === 'tone:casual') return { did: 'wrote more casually', rule: 'Write more casually.', against: 'wrote more formally' }
	if (k === 'tone:formal') return { did: 'wrote more formally', rule: 'Write more formally.', against: 'wrote more casually' }
	if (k.startsWith('language:')) return { did: `wrote in ${k.slice(9)}`, rule: `Reply in ${k.slice(9)}.`, against: 'wrote in another language' }
	return { did: k, rule: k, against: k }
}
const listed = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`
type Scope = { key: string; to: string; for: string; who: Rule['who']; when: Rule['when'] }
function scopeOf(es: EditStyle[], language: boolean): Scope | undefined {
	const askers = new Set(es.map(e => e.asker?.id ?? '')), chats = new Set(es.map(e => e.chat))
	const a = es.at(-1)!.asker
	if (askers.size === 1 && a?.id) return { key: `person:${a.id}`, to: ` to ${a.name.split(/\s+/)[0]}`, for: ` for replies to ${a.name}`, who: { accounts: [{ id: a.id, name: a.name }] }, when: {} }
	if (language) return undefined
	if (chats.size === 1) { const name = es.at(-1)!.chatName ?? 'this chat'; return { key: `chat:${es[0].chat}`, to: ` in ${name}`, for: ` for replies in ${name}`, who: {}, when: { chat: es[0].chat } } }
	return { key: 'everywhere', to: '', for: ' for every reply', who: {}, when: {} }
}
const inScope = (scope: string, e: EditStyle) => scope === 'everywhere' || scope === `person:${e.asker?.id}` || scope === `chat:${e.chat}`
export const styleTitle = (r: Rule) => r.text.replace(/^Learned: /, '').replace(/:.*$/, '')

// The strongest new style: ≥3 edited sends of one kind within 14 days on ≥3 items, none of the last 3 edited sends in that
// scope going the other way; kinds found in the same scope come as one suggestion. A kind declined, accepted, waiting or
// snoozed for a scope is not offered again. An accepted style edited against 3 times since is offered for removal.
function styleHabit(store: Store, cfg: Config, habits: Habit[], now: number): Habit | undefined {
	const since = now - 14 * DAY
	const all = (store.logs(15).filter(e => e.event === 'edit-style') as unknown as EditStyle[]).filter(e => Date.parse(e.at) >= since && !offRecord(cfg, e.chat)).sort((a, b) => a.at.localeCompare(b.at))
	if (!all.length) return undefined
	const at = new Date(now).toISOString()
	// One edit per owner-edited send: an item that came back for a new ask is a new edit (pm-edit-habits §2, "distinct items").
	const sendOf = (e: EditStyle) => e.link ?? `${e.item}@${e.at}`
	const items = (es: EditStyle[]) => new Set(es.map(sendOf))
	const days = (es: EditStyle[]) => new Set(es.map(e => e.at.slice(0, 10))).size
	const links = (es: EditStyle[]) => [...new Set(es.filter(e => e.link).map(e => e.link!))].slice(-5)
	// Removal first: the owner keeps undoing a style he turned on.
	for (const h of habits.filter(x => x.kind === 'style' && x.state === 'accepted' && !x.removes && x.scope && x.kinds && store.rules().some(r => r.id === x.rule.id))) {
		const key = `style-off:${h.key}`
		const old = habits.find(x => x.key === key)
		if (old && (old.state !== 'snoozed' || Date.parse(old.until ?? '') > now)) continue
		const against = all.filter(e => Date.parse(e.at) > Date.parse(h.at) && inScope(h.scope!, e) && e.kinds.some(k => h.kinds!.some(mine => opposite(kindKey(mine))(kindKey(k)))))
		if (items(against).size < evidenceFloor(old, 3)) continue
		const opposed = h.kinds!.filter(mine => against.some(e => e.kinds.some(k => opposite(kindKey(mine))(kindKey(k)))))
		const did = listed([...new Set(opposed.map(k => says(kindKey(k)).against))]), style = store.rules().find(r => r.id === h.rule.id)?.style ?? h.rule.style
		return { key, code: '', kind: 'style', state: 'suggested', at, removes: h.rule.id, scope: h.scope, kinds: h.kinds, rule: h.rule,
			text: `You ${did} in your last ${items(against).size} replies, against ${h.code} ("${style}"). Stop drafting that way?`,
			does: `Drafts no longer follow ${h.code}; they are written as before it.`, evidence: { count: items(against).size, days: days(against), total: items(all.filter(e => inScope(h.scope!, e))).size, links: links(against) } }
	}
	const taken = (scope: string, k: string) => habits.some(h => h.kind === 'style' && !h.removes && h.scope === scope && h.kinds?.some(x => kindKey(x) === k) && (h.state !== 'snoozed' || Date.parse(h.until ?? '') > now))
	const byScope = new Map<string, { scope: Scope; kinds: string[]; es: EditStyle[] }>()
	for (const key of new Set(all.flatMap(e => e.kinds.map(kindKey)))) {
		const es = all.filter(e => e.kinds.some(k => kindKey(k) === key))
		if (items(es).size < 3) continue
		const scope = scopeOf(es, key.startsWith('language:'))
		if (!scope || taken(scope.key, key)) continue
		const previous = habits.filter(h => h.kind === 'style' && !h.removes && h.scope === scope.key && h.kinds?.some(k => kindKey(k) === key))
		if (items(es).size < Math.max(3, ...previous.map(h => evidenceFloor(h, 3)))) continue
		// The last 3 edited sends there, any kind: none may go the other way.
		const last = [...new Map(all.filter(e => inScope(scope.key, e)).map(e => [sendOf(e), e])).keys()].slice(-3)
		if (all.some(e => last.includes(sendOf(e)) && e.kinds.some(k => opposite(key)(kindKey(k))))) continue
		const raw = es.at(-1)!.kinds.find(k => kindKey(k) === key)!
		const at0 = byScope.get(scope.key) ?? { scope, kinds: [], es: [] }
		byScope.set(scope.key, { scope, kinds: [...at0.kinds, raw], es: [...at0.es, ...es] })
	}
	const best = [...byScope.values()].sort((a, b) => items(b.es).size - items(a.es).size || b.kinds.length - a.kinds.length)[0]
	if (!best) return undefined
	const { scope, kinds } = best, es = best.es, n = items(es).size
	const style = kinds.map(k => says(k).rule).join(' ')
	const key = `style:${scope.key}:${kinds.map(kindKey).sort().join('+')}`
	const id = `style-${createHash('sha256').update(key).digest('hex').slice(0, 10)}`
	return {
		key, code: '', kind: 'style', state: 'suggested', at, scope: scope.key, kinds,
		text: `In your last ${n} edited replies${scope.to}, you ${listed(kinds.map(k => says(k).did))}. Draft that way from now on?`,
		does: `Drafts${scope.for} follow this: ${style} It only shapes the wording: nothing is sent by itself, and your own edits still win.`,
		evidence: { count: n, days: days(es), total: items(all.filter(e => inScope(scope.key, e))).size, links: links(es) },
		rule: { id, text: `Learned: Drafting style${scope.for}: ${style}`, who: scope.who, when: scope.when, then: 'draft', style },
	}
}

// The style rules that fit this item: the drafting prompt follows them, and nothing else reads them.
export function stylesFor(rules: Rule[], wf: Workflow): Rule[] {
	return rules.filter(r => !r.off && r.style && (!r.who.accounts?.length || r.who.accounts.some(a => a.id === wf.asker?.id)) && (!r.when.chat || r.when.chat === wf.chat.id))
}

export const setRules = (store: Store, rules: Rule[]): RuleWriteResult => writeHabitRules(store, rules)
