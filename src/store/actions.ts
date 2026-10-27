import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { z } from 'zod'
import { appendLine, assertTestSafe, freshRead, removeFile, writeText } from './fs.ts'
import { BUSY, withRecordWriteNow, type Store } from './state.ts'
import { ruleLines, ruleTextHash } from './rules.ts'

const timestamp = z.string().datetime({ offset: true }).transform(at => new Date(at).toISOString())
const part = z.object({
	kind: z.enum(['message', 'comment', 'thread']), msgId: z.string().optional(), link: z.string().optional(),
	text: z.string(), pr: z.number().int().positive().optional(), file: z.string().optional(), line: z.number().int().positive().optional(),
	severity: z.enum(['high', 'medium', 'low']).optional(),
	outcome: z.enum(['posted', 'failed', 'unconfirmed']), why: z.string().optional(),
}).strict()
const undo = z.object({ until: timestamp, msgId: z.string() }).strict()
const record = z.object({
	v: z.literal(1), id: z.string().uuid(), at: timestamp,
	kind: z.enum(['reply', 'ack', 'review', 'reminder', 'change']),
	item: z.object({ code: z.string(), wf: z.string() }).strict().optional(),
	chat: z.object({ id: z.string(), group: z.boolean(), name: z.string() }).strict(),
	to: z.object({ id: z.string(), first: z.string() }).strict().optional(),
	parts: z.array(part),
	because: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('line'), lineId: z.string(), grantId: z.string(), text: z.string(), hash: z.string() }).strict(),
		z.object({ kind: z.literal('setting'), key: z.string(), label: z.string() }).strict(),
		z.object({ kind: z.literal('unknown') }).strict(),
	]),
	undo: undo.optional(),
}).strict()
const amendmentBase = z.object({
	v: z.literal(1), ref: z.string().uuid(), at: timestamp, by: z.enum(['owner', 'engine']),
	why: z.string().optional(), item: z.string().optional(), lineId: z.string().optional(),
}).strict()
const amendment = z.discriminatedUnion('kind', [
	amendmentBase.extend({ kind: z.literal('completed'), parts: z.array(part), undo: undo.optional() }),
	amendmentBase.extend({ kind: z.literal('stopped'), mode: z.enum(['added', 'turned-off']).optional() }),
	amendmentBase.extend({ kind: z.enum(['undone', 'undo-failed', 'corrected', 'reviewed']) }),
])
const entry = z.union([record, amendment])

export type ActionRecord = z.infer<typeof record>
export type ActionBecause = ActionRecord['because']
export type ActionAmendment = z.infer<typeof amendment>
export type ActionEntry = ActionRecord | ActionAmendment
export type FoldedAction = ActionRecord & { completedAt?: string; amendments: ActionAmendment[] }
export type ActionRange = { since: string; until?: string; limit?: number }
type ActionStore = Pick<Store, 'root' | 'machine' | 'log'>

export const LEDGER_START = 'actions-ledger-1'
export function markLedgerStart(store: Pick<Store, 'upgrades' | 'saveUpgrades'>, at = new Date().toISOString()): void {
	freshRead(() => {
		const upgrades = store.upgrades()
		if (!Object.hasOwn(upgrades, LEDGER_START)) store.saveUpgrades({ ...upgrades, [LEDGER_START]: timestamp.parse(at) })
	})
}

export function ledgerStart(store: ActionStore & Pick<Store, 'upgrades'>): string | undefined {
	const raw = store.upgrades()[LEDGER_START]
	const marked = raw === undefined ? undefined : timestamp.parse(raw)
	let oldest: string | undefined
	for (const name of monthFiles(store).reverse()) {
		oldest = readMonth(store, join(directory(store), name)).actions.at(-1)?.at
		if (oldest) break
	}
	return marked && oldest ? (marked < oldest ? marked : oldest) : marked ?? oldest
}

export function undoableAction(action: FoldedAction, now = Date.now()): boolean {
	const undo = action.undo
	return !!undo && now < Date.parse(undo.until) &&
		!action.amendments.some(change => change.kind === 'undone' || change.kind === 'undo-failed') &&
		action.parts.some(part => part.kind === 'message' && part.outcome === 'posted' && part.msgId === undo.msgId)
}

export function becauseOf(store: Store, permit: string | { setting: { key: string; label: string } }): ActionBecause {
	if (typeof permit !== 'string') return { kind: 'setting', key: permit.setting.key, label: permit.setting.label }
	const lines = ruleLines(store).filter(line => line.grantIds?.includes(permit))
	if (lines.length === 1) {
		const line = lines[0]
		return { kind: 'line', lineId: line.id, grantId: permit, text: line.text, hash: ruleTextHash(line.text) }
	}
	store.log({ event: 'wdd-because-missing' })
	return { kind: 'unknown' }
}

function unknownRef(store: Pick<Store, 'log'>, value: ActionAmendment) {
	store.log({ event: 'wdd-amendment-missing', ref: value.ref, kind: value.kind })
}

export function foldActions(store: Pick<Store, 'log'>, entries: readonly ActionEntry[]): FoldedAction[] {
	const actions = new Map<string, FoldedAction>()
	for (const value of entries) {
		if ('id' in value) {
			if (actions.has(value.id)) throw new Error(`Duplicate action ledger id ${value.id}.`)
			actions.set(value.id, {
				...structuredClone(value), parts: value.parts.map(item => ({ ...item, outcome: 'unconfirmed' })),
				undo: undefined, amendments: [],
			})
			continue
		}
		const action = actions.get(value.ref)
		if (!action) { unknownRef(store, value); continue }
		action.amendments.push(structuredClone(value))
		if (value.kind === 'completed') {
			action.parts = structuredClone(value.parts)
			action.undo = value.undo && { ...value.undo }
			action.completedAt = value.at
		}
	}
	return [...actions.values()].sort((a, b) => b.at.localeCompare(a.at))
}

type Month = { signature: string; entries: ActionEntry[]; actions: FoldedAction[] }
const months = new Map<string, Month>()
const directory = (store: Pick<Store, 'root'>) => resolve(store.root, 'state', 'actions')
const monthPath = (store: Pick<Store, 'root'>, at: string) => join(directory(store), `${at.slice(0, 7)}.jsonl`)

function monthFiles(store: Pick<Store, 'root'>): string[] {
	try {
		return readdirSync(directory(store)).filter(name => /^\d{4}-(?:0[1-9]|1[0-2])\.jsonl$/.test(name)).sort().reverse()
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
}

function readMonth(store: ActionStore, file: string): Month {
	let signature: string, text: string
	try {
		const stat = statSync(file)
		signature = `${stat.mtimeMs}:${stat.size}:${stat.ino}`
		const cached = months.get(file)
		if (cached?.signature === signature) return cached
		text = readFileSync(file, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		months.delete(file)
		return { signature: '', entries: [], actions: [] }
	}
	const entries: ActionEntry[] = []
	if (text && !text.endsWith('\n')) throw new Error(`Incomplete action ledger line in ${basename(file)}.`)
	for (const [index, line] of text.split('\n').entries()) {
		if (!line.trim()) continue
		let value: unknown
		try { value = JSON.parse(line) } catch {
			throw new Error(`Invalid action ledger JSON in ${basename(file)} at line ${index + 1}.`)
		}
		const parsed = entry.safeParse(value)
		if (!parsed.success) throw new Error(`Invalid action ledger record in ${basename(file)} at line ${index + 1}.`)
		if ('id' in parsed.data && monthPath(store, parsed.data.at) !== file) throw new Error(`Action ledger subject is in the wrong month in ${basename(file)} at line ${index + 1}.`)
		entries.push(parsed.data)
	}
	const month = { signature, entries, actions: foldActions(store, entries) }
	months.delete(file); months.set(file, month)
	if (months.size > 64) months.delete(months.keys().next().value!)
	return month
}

export function appendAction(store: ActionStore & Pick<Store, 'upgrades' | 'saveUpgrades'>, action: ActionRecord): ActionRecord | typeof BUSY {
	const value = record.parse(action), file = monthPath(store, value.at)
	assertTestSafe(file)
	markLedgerStart(store, value.at)
	return withRecordWriteNow(file, () => {
		const previous = readMonth(store, file).entries.find((item): item is ActionRecord => 'id' in item && item.id === value.id)
		if (previous) {
			if (JSON.stringify(previous) !== JSON.stringify(value)) throw new Error(`Action ${value.id} was already recorded with different facts.`)
			return structuredClone(previous)
		}
		appendLine(file, value)
		months.delete(file)
		return structuredClone(value)
	})
}

export function amendAction(store: ActionStore, change: ActionAmendment): ActionAmendment | typeof BUSY | undefined {
	const value = amendment.parse(change)
	// Amendments stay with their subject, including across month boundaries, so a bounded read has its entire history.
	for (const name of monthFiles(store)) {
		const file = join(directory(store), name)
		if (!readMonth(store, file).actions.some(action => action.id === value.ref)) continue
		assertTestSafe(file)
		return withRecordWriteNow(file, () => {
			if (!readMonth(store, file).actions.some(action => action.id === value.ref)) { unknownRef(store, value); return undefined }
			appendLine(file, value)
			months.delete(file)
			return structuredClone(value)
		})
	}
	unknownRef(store, value)
	return undefined
}

export function amendActions(store: ActionStore, changes: ActionAmendment[]): ActionAmendment[] | typeof BUSY | { missing: string[] } {
	const values = changes.map(change => amendment.parse(change))
	if (!values.length) return []
	const pending = new Set(values.map(value => value.ref))
	const groups = new Map<string, ActionAmendment[]>()
	const missing = (unresolved: ActionAmendment[]): { missing: string[] } => {
		for (const value of unresolved) unknownRef(store, value)
		return { missing: [...new Set(unresolved.map(value => value.ref))] }
	}
	for (const name of monthFiles(store)) {
		const file = join(directory(store), name)
		const subjects = new Set(readMonth(store, file).actions.map(action => action.id))
		const group = values.filter(value => pending.has(value.ref) && subjects.has(value.ref))
		if (!group.length) continue
		groups.set(file, group)
		for (const value of group) pending.delete(value.ref)
		if (!pending.size) break
	}
	if (pending.size) return missing(values.filter(value => pending.has(value.ref)))
	const files = [...groups.keys()].sort()
	const locked = (index: number): ActionAmendment[] | typeof BUSY | { missing: string[] } => {
		const file = files[index]
		if (file !== undefined) return withRecordWriteNow(file, () => locked(index + 1))
		const unresolved = [...groups].flatMap(([path, group]) => {
			const subjects = new Set(readMonth(store, path).actions.map(action => action.id))
			return group.filter(value => !subjects.has(value.ref))
		})
		if (unresolved.length) return missing(unresolved)
		for (const path of files) {
			for (const value of groups.get(path)!) appendLine(path, value)
			months.delete(path)
		}
		return structuredClone(values)
	}
	return locked(0)
}

export function readActions(store: ActionStore, range: ActionRange): FoldedAction[] {
	const since = timestamp.parse(range.since), until = timestamp.parse(range.until ?? new Date().toISOString())
	if (since > until) throw new Error('The action ledger window ends before it starts.')
	if (range.limit !== undefined && (!Number.isSafeInteger(range.limit) || range.limit < 0)) throw new Error('The action ledger limit must be a non-negative integer.')
	if (range.limit === 0) return []
	const actions: FoldedAction[] = []
	for (const name of monthFiles(store)) {
		const month = name.slice(0, 7)
		if (month > until.slice(0, 7)) continue
		if (month < since.slice(0, 7)) break
		actions.push(...readMonth(store, join(directory(store), name)).actions.filter(action => action.at >= since && action.at <= until))
		if (range.limit !== undefined && actions.length >= range.limit) break
	}
	return structuredClone(range.limit === undefined ? actions : actions.slice(0, range.limit))
}

export function pruneActions(store: ActionStore, days = 30, now = Date.now()): { pruned: number; status: 'done' | typeof BUSY } {
	if (!Number.isFinite(days) || days < 0) throw new Error('Action ledger retention days must be non-negative.')
	const cutoff = new Date(now - days * 86_400_000).toISOString()
	let pruned = 0, status: 'done' | typeof BUSY = 'done'
	for (const name of monthFiles(store)) {
		if (name.slice(0, 7) > cutoff.slice(0, 7)) continue
		const file = join(directory(store), name)
		assertTestSafe(file)
		const result = withRecordWriteNow(file, () => {
			const month = readMonth(store, file), kept = new Set(month.actions.filter(action => action.at >= cutoff).map(action => action.id))
			const removed = month.actions.length - kept.size
			const entries = month.entries.filter(value => kept.has('id' in value ? value.id : value.ref))
			if (entries.length === month.entries.length) return 0
			if (!kept.size) removeFile(file)
			else writeText(file, entries.map(value => JSON.stringify(value)).join('\n') + '\n', store.machine)
			months.delete(file)
			return removed
		})
		if (result === BUSY) status = BUSY
		else pruned += result
	}
	return { pruned, status }
}
