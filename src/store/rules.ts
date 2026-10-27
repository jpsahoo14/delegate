import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Rule } from '../core/types.ts'
import { compileRuleLine, confirmRuleLine, editRuleLine, lineGrants, lineNeedsCompile,
	RuleCompileSchema, ruleTextHash, setRuleLineOff, widening, type RuleLine } from '../core/rule-lines.ts'
import { CAPABILITY_VERSION, readBack, REVIEW_RULE_TEXT, StoredRuleSchema, voteLimitNotice } from '../core/capabilities.ts'
import { freshRead, readJson, readText, writeJson, writeText } from './fs.ts'
import { BUSY, withRecordWriteNow, type Store } from './state.ts'

export const RULE_WRITE_BUSY = 'Delegate is saving another change; your text is kept. Try again.'
export const RULE_CHANGED = 'This line changed; your text is kept'
export { ruleTextHash } from '../core/rule-lines.ts'
export const rulesText = (store: Pick<Store, 'root'>) => existsSync(join(store.root, 'rules.md')) ? readText(join(store.root, 'rules.md')) : ''
export type RuleNote = { id: string; text: string }
export type RulesFile = {
	schema: 1
	rules: Rule[]
	lines?: RuleLine[]
	deleted?: { line: RuleLine; at: string }[]
	confirmedAt?: string
	sourceHash?: string
	notes?: RuleNote[]
	notesMigrated?: 1
	legacySource?: true
	[key: string]: unknown
}
export type RulesSnapshot = { text: string; file: RulesFile }
export type RuleWriteResult = { ok: true; line?: RuleLine } | { ok: false; why: string }
type RuleUpdate = { ok: true; text: string; file: RulesFile; line?: RuleLine; clearHeld?: string[] } | { ok: false; why: string }
export const rulesSnapshot = (store: Pick<Store, 'root'>): RulesSnapshot => ({
	text: rulesText(store),
	file: readJson<RulesFile>(join(store.root, 'rules.compiled.json'), { schema: 1, rules: [] }),
})

// All read/compare/write work is inside the same non-spinning, cross-process lock.
export function writeRuleRecord(store: Store, change: (snapshot: RulesSnapshot) => RuleUpdate,
	expect?: { id: string; textHash: string; deleted?: true }): RuleWriteResult {
	const result = withRecordWriteNow(join(store.root, 'rules.compiled.json'), () => freshRead((): RuleWriteResult => {
		const snapshot = rulesSnapshot(store)
		if (expect) {
			const line = expect.deleted ? snapshot.file.deleted?.find(entry => entry.line.id === expect.id)?.line
				: linesOf(snapshot).find(line => line.id === expect.id)
			if (!line || ruleTextHash(line.text) !== expect.textHash) return { ok: false, why: RULE_CHANGED }
		}
		const next = change(snapshot)
		if (!next.ok) return next
		if (new Set(next.file.rules.map(rule => rule.id)).size !== next.file.rules.length ||
			next.file.lines && new Set(next.file.lines.map(line => line.id)).size !== next.file.lines.length)
			throw new Error('Rule lines and grants must have unique ids.')
		const migratedNotes = notesOf(snapshot).length > 0 && !notesBlock.test(next.text)
		const file = { ...next.file, ...(migratedNotes ? { notes: [], notesMigrated: 1 as const } : {}), sourceHash: ruleTextHash(next.text) }
		if (next.text !== snapshot.text) writeText(join(store.root, 'rules.md'), next.text, store.machine)
		if (JSON.stringify(file) !== JSON.stringify(snapshot.file)) writeJson(join(store.root, 'rules.compiled.json'), file, store.machine)
		for (const line of file.lines ?? []) if (line.unbound && !snapshot.file.lines?.some(old => old.id === line.id && old.unbound))
			for (const grant of line.compile?.grants ?? []) store.log({ event: 'rule-migration-unbound', ruleId: grant.id })
		if (next.clearHeld?.length) {
			const held = store.heldRules()
			for (const id of next.clearHeld) delete held[id]
			store.saveHeldRules(held)
		}
		return { ok: true, ...(next.line ? { line: next.line } : {}) }
	}))
	return result === BUSY ? { ok: false, why: RULE_WRITE_BUSY } : result
}

const BEGIN = '<!-- learned rules: generated, do not edit -->', END = '<!-- end learned rules -->'
const learnedBlock = new RegExp(`\\n*${BEGIN}[\\s\\S]*?${END}\\n*`)
const NOTES_BEGIN = '<!-- legacy notes: no actions -->', NOTES_END = '<!-- end legacy notes -->'
const notesBlock = new RegExp(`${NOTES_BEGIN}\\r?\\n([\\s\\S]*?)\\r?\\n${NOTES_END}`)
const bullet = (text: string) => `- ${text.replace(/\r?\n/g, '\n  ')}`
export function ruleSourceLines(text: string): string[] {
	const lines: string[] = []
	let current: string | undefined
	const flush = () => { if (current?.trim()) lines.push(current); current = undefined }
	for (const raw of text.replace(notesBlock, '').replace(/^<!--[\s\S]*?-->/gm, '').split(/\r?\n/)) {
		if (/^ {2}/.test(raw) && current !== undefined) { current += `\n${raw.slice(2)}`; continue }
		flush()
		const value = raw.trim()
		if (value && !value.startsWith('#')) current = raw.replace(/^\s*[-*][ \t]/, '')
	}
	flush()
	return lines
}
export function ruleLinesText(lines: RuleLine[], notes: RuleNote[] = []): string {
	const owner = lines.filter(line => line.source !== 'learned').map(line => bullet(line.text)).join('\n')
	const learned = lines.filter(line => line.source === 'learned').map(line => bullet(line.text)).join('\n')
	const kept = notes.filter(note => !lines.some(line => normalizedRuleText(line.text) === normalizedRuleText(note.text))).map(note => bullet(note.text)).join('\n')
	return `${[owner, learned ? `${BEGIN}\n## Learned\n\n${learned}\n${END}` : '', kept].filter(Boolean).join('\n\n')}\n`
}

const normalizedRuleText = (text: string) => text.trim().replace(/\s+/g, ' ')
const legacyTexts = (rule: Rule) => [rule.text, ...(rule.learned
	? [`${rule.text.replace(/^Learned: /, '')} (learned ${rule.learned.at.slice(0, 10)} from ${rule.learned.evidence})`] : [])]
const legacyAllowed = (rule: Rule) => !widening(rule) || !!rule.who.accounts?.length || rule.then === 'review' && rule.who.group === 'org'
function notesOf(snapshot: RulesSnapshot): RuleNote[] {
	const block = snapshot.text.match(notesBlock)
	if (!block && !snapshot.file.legacySource && (snapshot.file.lines || !snapshot.file.confirmedAt)) return []
	const known = new Set(snapshot.file.rules.flatMap(legacyTexts).map(normalizedRuleText))
	const source = (block?.[1] ?? snapshot.text.replace(learnedBlock, '')).replace(/^#[^\r\n]*(?:\r?\n|$)/gm, '')
	return (source.match(/[^\r\n]+(?:\r?\n(?![ \t]*\r?\n)[^\r\n]+)*/g) ?? []).flatMap((text, index) => {
		const parts = ruleSourceLines(text), unmatched = parts.filter(part => !known.has(normalizedRuleText(part)))
		if (!block && !unmatched.length) return []
		const texts = block || unmatched.length === parts.length ? [text] : unmatched
		return texts.filter(text => text.trim()).map((text, part) => ({ id: `note-${ruleTextHash(text).slice(0, 24)}-${index}-${part}`, text }))
	})
}
// Compatibility for old readers: former notes are now main-list rule lines.
export const ruleNotes = (_store: Store): RuleNote[] => []
function linesOf(snapshot: RulesSnapshot): RuleLine[] {
	const used = new Set<string>(), usedGrants = new Set<string>(), occurrences = new Map<string, number>()
	const previous = new Map<string, RuleLine[]>(), legacyByText = new Map<string, Rule[]>()
	const reserved = new Set([...(snapshot.file.lines ?? []).map(line => line.id), ...(snapshot.file.deleted ?? []).map(entry => entry.line.id)])
	for (const line of snapshot.file.lines ?? []) previous.set(line.text.trim(), [...(previous.get(line.text.trim()) ?? []), line])
	if (!snapshot.file.lines) for (const rule of snapshot.file.rules) {
		const texts = new Set(legacyTexts(rule))
		for (const text of texts) {
			const key = normalizedRuleText(text)
			const grants = legacyByText.get(key) ?? []
			if (!grants.some(grant => grant.id === rule.id)) legacyByText.set(key, [...grants, rule])
		}
	}
	function legacyLine(text: string, legacy: Rule[], unbound = false): RuleLine {
		for (const grant of legacy) usedGrants.add(grant.id)
		const key = ruleTextHash(normalizedRuleText(text)).slice(0, 24), n = (occurrences.get(key) ?? 0) + 1
		occurrences.set(key, n)
		let id = `line-${key}-${n}`
		while (used.has(id) || reserved.has(id)) id += '-new'
		used.add(id)
		const learned = legacy.find(rule => rule.learned)?.learned, style = legacy.find(rule => rule.style)?.style
		let line: RuleLine = {
			id, text, source: legacy.some(rule => rule.source === 'settings') ? 'settings' : learned ? 'learned' : 'owner',
			...(unbound ? { unbound: true } : {}),
			...(learned ? { learned } : {}), ...(style ? { style } : {}),
			...(legacy.length && legacy.every(rule => rule.off) ? { off: true } : {}),
		}
		if (!legacy.length) return line
		line = compileRuleLine(line, { grants: legacy.map(rule => {
			const { lane, ...when } = rule.when
			return { ...rule, when }
		}) }, legacy)
		const at = snapshot.file.confirmedAt ?? learned?.at
		// Old global confirmation cannot turn newly supported organization sends on.
		if (!unbound && at && legacy.every(legacyAllowed)) {
			const off = line.off, compile = line.compile
			line = { ...confirmRuleLine(line, at), off, compile }
		}
		return line
	}
	const notes = new Set(notesOf(snapshot).flatMap(note => ruleSourceLines(note.text)).map(normalizedRuleText))
	const lines = ruleSourceLines(snapshot.text).flatMap(text => {
		const old = previous.get(text.trim())?.shift()
		if (old) { used.add(old.id); return [editRuleLine(old, text)] }
		if (notes.has(normalizedRuleText(text))) return []
		return [legacyLine(text, (legacyByText.get(normalizedRuleText(text)) ?? []).filter(rule => !usedGrants.has(rule.id)))]
	})
	if (!snapshot.file.lines) for (const rule of snapshot.file.rules) {
		if (!usedGrants.has(rule.id)) {
			const carried = !!snapshot.file.confirmedAt && !rule.off && legacyAllowed(rule)
			lines.push({ ...legacyLine(rule.text, [rule], !carried), ...(carried ? { carried: true } : {}) })
		}
	}
	for (const line of snapshot.file.lines ?? []) if ((line.unbound || line.carried) && !used.has(line.id)) lines.push(line)
	for (const note of notesOf(snapshot)) {
		const id = `line-${note.id}`
		if (lines.some(line => line.id === id) || !notesBlock.test(snapshot.text) &&
			lines.some(line => normalizedRuleText(line.text) === normalizedRuleText(note.text))) continue
		lines.push({ id, text: note.text, source: 'owner', needsConfirmation: true })
	}
	return lines
}
export const ruleLines = (store: Store) => linesOf(rulesSnapshot(store))
export const activeRuleGrants = (root: string): Rule[] => linesOf(rulesSnapshot({ root })).flatMap(lineGrants)

function lineUpdate(snapshot: RulesSnapshot, lines: RuleLine[], text = snapshot.text, line?: RuleLine, notes = notesOf(snapshot)): RuleUpdate {
	if (notes.length) text = ruleLinesText(lines)
	const source = new Set(ruleSourceLines(text))
	const kept = lines.map(line => line.carried && source.has(line.text) ? { ...line, carried: undefined } : line)
	const legacySource = (snapshot.file.legacySource || !snapshot.file.lines && !!snapshot.file.confirmedAt) && text === snapshot.text
	return { ok: true, text, file: { ...snapshot.file, lines: kept, notes: [], ...(notes.length ? { notesMigrated: 1 as const } : {}), legacySource: legacySource ? true : undefined,
		rules: kept.flatMap(lineGrants) }, ...(line ? { line } : {}) }
}
export function rulesToCompile(store: Store): RuleLine[] {
	const snapshot = rulesSnapshot(store), lines = linesOf(snapshot)
	if (!snapshot.file.lines || notesOf(snapshot).length || snapshot.file.sourceHash !== ruleTextHash(snapshot.text)) {
		const result = writeRuleRecord(store, fresh => lineUpdate(fresh, linesOf(fresh)))
		if (!result.ok) throw new Error(result.why)
		return ruleLines(store).filter(lineNeedsCompile)
	}
	return lines.filter(lineNeedsCompile)
}
export function finishRuleCompile(store: Store, id: string, expectedTextHash: string, rawOutput: unknown): RuleWriteResult {
	const output = RuleCompileSchema.safeParse(rawOutput)
	if (!output.success) {
		store.log({ event: 'rule-compile-refused', id, reason: 'invalid-output', issues: output.error.issues.map(issue => issue.code) })
		const why = "Couldn't read this line into supported actions; your text is kept."
		const saved = failRuleCompile(store, id, expectedTextHash, why)
		return saved.ok ? { ok: false, why } : saved
	}
	return writeRuleRecord(store, snapshot => {
		const lines = linesOf(snapshot), index = lines.findIndex(line => line.id === id)
		if (index < 0 || ruleTextHash(lines[index].text) !== expectedTextHash) return { ok: false, why: RULE_CHANGED }
		if (!lineNeedsCompile(lines[index])) return { ok: false, why: 'This line has already been read; its current meaning is kept.' }
		const line = compileRuleLine(lines[index], output.data, lines[index].compile?.grants)
		lines[index] = line
		return lineUpdate(snapshot, lines, snapshot.text, line)
	})
}
export function failRuleCompile(store: Store, id: string, expectedTextHash: string, why: string): RuleWriteResult {
	return writeRuleRecord(store, snapshot => {
		const lines = linesOf(snapshot), index = lines.findIndex(line => line.id === id)
		if (index < 0 || ruleTextHash(lines[index].text) !== expectedTextHash || !lineNeedsCompile(lines[index]))
			return { ok: false, why: RULE_CHANGED }
		const line = { ...lines[index], compileError: why }
		lines[index] = line
		store.log({ event: 'rule-compile-refused', id, reason: 'read-failed' })
		return lineUpdate(snapshot, lines, snapshot.text, line)
	})
}
export function addRuleLine(store: Store, text: string): RuleWriteResult {
	text = text.replace(/\r\n/g, '\n')
	if (!text.trim()) return { ok: false, why: 'Write a line before saving it.' }
	const line: RuleLine = { id: `line-${randomUUID()}`, text, source: 'owner' }
	return writeRuleRecord(store, snapshot => {
		const lines = [...linesOf(snapshot), line]
		return lineUpdate(snapshot, lines, ruleLinesText(lines), line)
	})
}
export function stopRuleLine(store: Store, sourceId: string, grant: Rule, expectedTextHash: string,
	narrowing?: { id: string; text: string; rule: Rule }): RuleWriteResult {
	return writeRuleRecord(store, snapshot => {
		const lines = linesOf(snapshot), index = lines.findIndex(line => line.id === sourceId), source = lines[index]
		if (!source || !source.compile?.grants.some(current => isDeepStrictEqual(current, grant)))
			return { ok: false, why: RULE_CHANGED }
		if (!lineGrants(source).some(current => current.id === grant.id && !current.off))
			return { ok: false, why: 'This line is no longer on. Check it in Settings.' }
		if (!narrowing) {
			const line = setRuleLineOff(source, true)
			lines[index] = line
			return lineUpdate(snapshot, lines, ruleLinesText(lines), line)
		}
		if (narrowing.rule.then !== 'draft') throw new Error('A stop line can only keep work for the owner.')
		if (lines.some(line => line.id === narrowing.id))
			return { ok: false, why: 'This stop line already exists. Check it in Settings.' }
		const rule = StoredRuleSchema.parse(narrowing.rule), { lane, ...when } = rule.when
		const line = compileRuleLine({ id: narrowing.id, text: narrowing.text, source: 'owner' }, {
			grants: [{ ...rule, when }], instruction: { constraints: [narrowing.text], who: rule.who, when },
		}, [rule])
		const next = [...lines.slice(0, index + 1), line, ...lines.slice(index + 1)]
		const update = lineUpdate(snapshot, next, ruleLinesText(next), line)
		if (update.ok) update.file.deleted = snapshot.file.deleted?.filter(entry => entry.line.id !== line.id)
		return update
	}, { id: sourceId, textHash: expectedTextHash })
}
export function addSuggestedRuleLine(store: Store, text: string, metadata: {
	learned: NonNullable<Rule['learned']>; style?: string; ruleId: string
}): RuleWriteResult {
	text = text.replace(/\r\n/g, '\n')
	if (!text.trim()) return { ok: false, why: 'Write a line before saving it.' }
	return writeRuleRecord(store, snapshot => {
		const lines = linesOf(snapshot), old = lines.find(line => line.learned?.key === metadata.learned.key)
		if (old) return old.text === text ? { ok: true, text: snapshot.text, file: snapshot.file, line: old }
			: { ok: false, why: RULE_CHANGED }
		if (lines.some(line => line.grantIds?.includes(metadata.ruleId) || line.compile?.grants.some(grant => grant.id === metadata.ruleId)))
			return { ok: false, why: 'This suggestion no longer owns its rule. Change the current line instead.' }
		const line: RuleLine = {
			id: `line-${randomUUID()}`, text, source: 'learned', learned: metadata.learned,
			...(metadata.style ? { style: metadata.style } : {}), grantIds: [metadata.ruleId],
		}
		const next = [...lines, line]
		return lineUpdate(snapshot, next, ruleLinesText(next), line)
	})
}
export type RuleLineChange = 'on' | 'off' | 'confirm' | 'read-again' | 'delete' | 'restore' | { text: string }
export function changeRuleLine(store: Store, id: string, change: RuleLineChange, expectedTextHash: string): RuleWriteResult {
	return writeRuleRecord(store, snapshot => {
		const lines = linesOf(snapshot)
		if (change === 'restore') {
			const entry = snapshot.file.deleted?.find(entry => entry.line.id === id)
			if (!entry || lines.some(line => line.id === id)) return { ok: false, why: RULE_CHANGED }
			const next = [...lines, entry.line], update = lineUpdate(snapshot, next, ruleLinesText(next), entry.line)
			if (update.ok) update.file.deleted = snapshot.file.deleted?.filter(entry => entry.line.id !== id)
			return update
		}
		const index = lines.findIndex(line => line.id === id), was = lines[index]
		if (!was) return { ok: false, why: RULE_CHANGED }
		if (typeof change === 'object' && !change.text.trim()) return { ok: false, why: 'Write a line before saving it.' }
		if (change === 'confirm' && (was.compileError || lineNeedsCompile(was) || !was.compile?.grants.length || was.compile.question || was.compile.setting))
			return { ok: false, why: 'Read this line into supported actions before turning it on.' }
		if (change === 'delete') {
			const next = lines.filter(line => line.id !== id), update = lineUpdate(snapshot, next, ruleLinesText(next))
			if (update.ok) {
				update.file.deleted = [...(snapshot.file.deleted ?? []).filter(entry => entry.line.id !== id), { line: was, at: new Date().toISOString() }]
			}
			return update
		}
		const line = change === 'read-again' ? { ...was, compile: undefined, compileError: undefined, catalogVersion: undefined,
			confirmedAt: undefined, confirmedHash: undefined, confirmedCatalogVersion: undefined, needsConfirmation: true as const,
			grantIds: [...new Set([...(was.grantIds ?? []), ...(was.compile?.grants ?? []).map(grant => grant.id)])] }
			: typeof change === 'object' ? editRuleLine(was, change.text) : change === 'confirm' ? confirmRuleLine(was)
			: setRuleLineOff(was, change === 'off')
		lines[index] = line
		const update = lineUpdate(snapshot, lines, ruleLinesText(lines), line)
		if (update.ok && (typeof change === 'object' || change === 'confirm'))
			update.clearHeld = [...(was.compile?.grants ?? []), ...(line.compile?.grants ?? [])].map(grant => grant.id)
		return update
	}, { id, textHash: expectedTextHash, ...(change === 'restore' ? { deleted: true } : {}) })
}

export function changeRuleNote(store: Store, id: string, makeLine: boolean, expectedTextHash: string): RuleWriteResult {
	return writeRuleRecord(store, snapshot => {
		const notes = notesOf(snapshot), note = notes.find(note => note.id === id)
		if (!note || ruleTextHash(note.text) !== expectedTextHash) return { ok: false, why: RULE_CHANGED }
		const lines = linesOf(snapshot), line = lines.find(line => line.id === `line-${id}`)
		if (!line) return { ok: false, why: RULE_CHANGED }
		const next = makeLine ? lines : lines.filter(other => other.id !== line.id)
		return lineUpdate(snapshot, next, ruleLinesText(next), makeLine ? line : undefined)
	})
}

// This entry is for trusted habit acceptance/style edits, not model compile output.
export function writeHabitRules(store: Store, rules: Rule[]): RuleWriteResult {
	const learned = rules.filter(rule => rule.learned).map(rule => ({ ...rule, ...StoredRuleSchema.parse(rule) }))
	return writeRuleRecord(store, snapshot => {
		if (snapshot.file.sourceHash && snapshot.file.sourceHash !== ruleTextHash(snapshot.text))
			return { ok: false, why: RULE_CHANGED }
		const own = snapshot.file.rules.filter(rule => !rule.learned)
		if (learned.some(rule => own.some(other => other.id === rule.id)))
			return { ok: false, why: 'A learned line conflicts with an existing rule; your text is kept.' }
		const previous = snapshot.file.rules.filter(rule => rule.learned)
		const changed = new Set([...previous, ...learned].filter(rule =>
			JSON.stringify(previous.find(old => old.id === rule.id)) !== JSON.stringify(learned.find(next => next.id === rule.id))).map(rule => rule.id))
		let lines = snapshot.file.lines || snapshot.file.confirmedAt ? linesOf(snapshot) : undefined, text: string
		if (lines) {
			const oldLearned = lines.filter(line => line.source === 'learned')
			if (learned.some(rule => oldLearned.some(line => line.learned?.key === rule.learned!.key &&
				!line.compile && line.text !== rule.text)))
				return { ok: false, why: RULE_CHANGED }
			if (learned.some(rule => changed.has(rule.id) && oldLearned.some(line =>
				line.learned?.key === rule.learned!.key && line.text !== rule.text && line.compile?.grants.some(widening))))
				return { ok: false, why: 'Edit this line in Your way of working so its changed permissions are read first.' }
			const groups = new Map<string, Rule[]>()
			for (const rule of learned) groups.set(rule.learned!.key, [...(groups.get(rule.learned!.key) ?? []), rule])
			const learnedIds = new Set(learned.map(rule => rule.id))
			const accepted = [...groups.values()].flatMap((grants): RuleLine[] => {
				const rule = grants.find(rule => changed.has(rule.id)) ?? grants[0]
				const old = oldLearned.find(line => line.learned?.key === rule.learned!.key || line.compile?.grants.some(grant =>
					grant.id === rule.id || grant.learned?.key === rule.learned!.key))
				if (old?.compile?.grants.some(grant => !learnedIds.has(grant.id))) return []
				if (old && grants.every(rule => !changed.has(rule.id))) return [old]
				const at = rule.learned!.at, hash = ruleTextHash(rule.text)
				return [{
					...old, id: old?.id ?? `learned-${ruleTextHash(rule.learned!.key).slice(0, 24)}`,
					text: rule.text, source: 'learned', off: rule.off,
					learned: rule.learned, style: rule.style,
					compile: { grants, notYet: [], limited: [] }, catalogVersion: CAPABILITY_VERSION,
					confirmedAt: at, confirmedHash: hash, confirmedCatalogVersion: CAPABILITY_VERSION,
				}]
			})
			const pending = oldLearned.filter(line => !line.compile &&
				!accepted.some(next => next.id === line.id))
			lines = [...accepted, ...pending, ...lines.filter(line => line.source !== 'learned')]
			text = ruleLinesText(lines)
			lines = lines.map(line => ({ ...line, carried: undefined }))
		} else {
			const owner = snapshot.text.replace(learnedBlock, '\n').trimEnd()
			const items = learned.map(rule => bullet(`${rule.text.replace(/^Learned: /, '')} (learned ${rule.learned!.at.slice(0, 10)} from ${rule.learned!.evidence})`))
			text = `${owner}${items.length ? `\n\n${BEGIN}\n## Learned\n\n${items.join('\n')}\n${END}` : ''}\n`.replace(/^\n+/, '')
		}
		return { ok: true, text, file: { ...snapshot.file, rules: lines ? lines.flatMap(lineGrants) : [...own, ...learned],
			...(lines ? { lines, notes: notesOf(snapshot), legacySource: undefined } : {}) }, clearHeld: [...changed] }
	})
}

function saveRules(snapshot: RulesSnapshot, text: string, rules: Rule[]): { file: RulesFile; grants: Rule[]; text: string } {
	const sourceLines = new Set(ruleSourceLines(text)), words = new Set([...sourceLines].map(line => line.trim()))
	const present = (value: string) => words.has(value.trim())
	const settings = snapshot.file.rules.filter(rule => rule.source === 'settings' && rule.textHash === ruleTextHash(rule.text) && present(rule.text))
	const grants: Rule[] = rules.map(rule => {
		const kept = settings.find(old => old.text === rule.text) ??
			(rule.source === 'settings' && rule.text === REVIEW_RULE_TEXT && rule.textHash === ruleTextHash(rule.text) && present(rule.text) ? rule : undefined)
		return { ...rule, ...StoredRuleSchema.parse(rule), source: kept?.source, textHash: kept?.textHash }
	})
	for (const kept of settings) if (!grants.some(rule => rule.id === kept.id || rule.text === kept.text)) grants.push(kept)
	const at = new Date().toISOString()
	const previous = linesOf(snapshot)
	const supplied = { text, file: { ...snapshot.file, rules: grants, lines: undefined, confirmedAt: at } }
	const notes = notesOf(supplied)
	const lines = linesOf(supplied).map(line => {
		const index = previous.findIndex(old => old.text === line.text), old = index < 0 ? undefined : previous.splice(index, 1)[0]
		const id = old?.id ?? `line-${randomUUID()}`
		const compiled = line.compile && { ...line.compile, grants: line.compile.grants.map((grant, i) => ({
			...grant, id: old?.compile?.grants[i]?.id ?? old?.grantIds?.[i] ?? `${id}-g${i + 1}`,
		})) }
		const next: RuleLine = { ...line, id, carried: undefined, source: old?.source ?? line.source, compile: compiled,
			learned: old?.learned ?? line.learned, style: old?.style ?? line.style,
			grantIds: [...new Set([...(old?.grantIds ?? []), ...(old?.compile?.grants ?? []).map(grant => grant.id), ...(compiled?.grants ?? []).map(grant => grant.id)])] }
		if (!next.compile?.grants.length) return next
		return { ...next, confirmedAt: at, confirmedHash: ruleTextHash(next.text), confirmedCatalogVersion: next.catalogVersion }
	})
	const active = lines.flatMap(lineGrants)
	const source = notes.length || lines.some(line => !sourceLines.has(line.text)) ? ruleLinesText(lines) : text.endsWith('\n') ? text : text + '\n'
	return { file: { ...snapshot.file, rules: active, confirmedAt: at, lines, notes, legacySource: undefined }, grants: active, text: source }
}
export function writeRules(store: Store, text: string, rules: Rule[]): string {
	let summary = ''
	const result = writeRuleRecord(store, snapshot => {
		const next = saveRules(snapshot, text, rules)
		summary = [`${next.grants.length} confirmed rule(s)`, ...next.grants.map(readBack), voteLimitNotice(text)].filter(Boolean).join('\n')
		return { ok: true, text: next.text, file: next.file, clearHeld: next.grants.map(rule => rule.id) }
	})
	if (!result.ok) throw new Error(result.why)
	return summary
}
export function toggleReviewRules(store: Store, on: boolean) {
	let summary = ''
	const result = writeRuleRecord(store, snapshot => {
		let lines = linesOf(snapshot), text = snapshot.text
		if (!lines.some(line => line.compile?.grants.some(grant => grant.then === 'review')) && on) {
			const line: RuleLine = { id: `line-${randomUUID()}`, text: REVIEW_RULE_TEXT, source: 'settings' }
			lines = [...lines, compileRuleLine(line, { grants: [{
				id: line.id, text: line.text, who: { group: 'org' }, when: { intent: 'pr_review' },
				then: 'review', review: { comments: 'post', reply: 'send' },
			}] })]
			text = ruleLinesText(lines)
		}
		lines = lines.map(line => line.compile?.grants.some(grant => grant.then === 'review') ? setRuleLineOff(line, !on) : line)
		const grants = lines.flatMap(lineGrants)
		summary = [`${grants.length} rule(s)`, ...grants.map(readBack), voteLimitNotice(text)].filter(Boolean).join('\n')
		return lineUpdate(snapshot, lines, text)
	})
	if (!result.ok) throw new Error(result.why)
	return summary
}
