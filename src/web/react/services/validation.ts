import { z } from 'zod'
import { entitiesSchema, snapshotSchema, text, type Snapshot } from '../domain/contracts.ts'
import { pageDeltaSchema } from '../domain/page-delta.ts'

const validators = new WeakMap<z.ZodObject, Map<string, z.ZodType>>()

export function readPageDelta(previous: Snapshot, input: unknown, base: string): Snapshot {
	const delta = pageDeltaSchema.parse(input)
	const checked = new Map<z.ZodType, Map<unknown, unknown>>()
	const valueAt = (index: unknown): unknown => {
		if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= delta.values.length) throw new Error('The page update has an invalid field reference.')
		return delta.values[index]
	}
	if (delta.base !== base) throw new Error('The page update belongs to a different snapshot. Reload before acting.')
	for (const key of [...Object.keys(delta.entities), ...Object.keys(delta.removed), ...Object.keys(delta.order ?? {})]) {
		if (!Object.hasOwn(entitiesSchema.shape, key)) throw new Error('The page update names an unknown entity table.')
	}
	const metadata: Record<string, unknown> = {}
	for (const key of new Set([...Object.keys(delta.page), ...delta.pageRemoved])) {
		if (key === 'entities' || !Object.hasOwn(snapshotSchema.shape, key)) throw new Error('The page update names an unknown metadata field.')
		const field = Reflect.get(snapshotSchema.shape, key)
		if (!(field instanceof z.ZodType)) throw new Error('The page metadata has no supported validator.')
		metadata[key] = field.parse(delta.pageRemoved.includes(key) ? undefined : delta.page[key])
	}
	function table<S extends z.ZodObject>(name: string, schema: S, before: Record<string, z.output<S>>): Record<string, z.output<S>> {
		const changes = delta.entities[name], removed = delta.removed[name], order = delta.order?.[name]
		if (!changes && !removed?.length && !order) return before
		const after: Record<string, z.output<S>> = Object.assign(Object.create(null), before)
		let known = validators.get(schema)
		if (!known) {
			known = new Map()
			for (const [key, field] of Object.entries(schema.shape)) {
				if (!(field instanceof z.ZodType)) throw new Error('The page field has no supported validator.')
				known.set(key, field)
			}
			validators.set(schema, known)
		}
		for (const id of removed ?? []) delete after[id]
		for (const change of changes ?? []) {
			if (change.replace) {
				const entity = schema.parse(Object.fromEntries(Object.entries(change.value).map(([key, index]) => [key, valueAt(index)])))
				for (const id of change.ids) after[id] = entity
				continue
			}
			const fields: Record<string, unknown> = {}
			for (const [key, index] of Object.entries(change.value)) {
				const field = known.get(key)
				if (!field) continue
				const value = valueAt(index)
				if (field === text && typeof value === 'string') { fields[key] = value; continue }
				let values = checked.get(field)
				if (!values) { values = new Map(); checked.set(field, values) }
				if (!values.has(value)) values.set(value, field.parse(value))
				fields[key] = values.get(value)
			}
			for (const id of change.ids) {
				if (!Object.hasOwn(before, id)) throw new Error('The page update has no original entity.')
				after[id] = { ...before[id], ...fields }
			}
		}
		if (!order) return after
		// The server's order, so a new row is not left behind older ones (bug 10-23 E97); the order names exactly the merged ids.
		if (order.length !== Object.keys(after).length || order.some(id => !Object.hasOwn(after, id))) throw new Error('The page update has an invalid order.')
		const ordered: Record<string, z.output<S>> = Object.create(null)
		for (const id of order) ordered[id] = after[id]
		return ordered
	}
	const s = entitiesSchema.shape, old = previous.entities
	return Object.assign({}, previous, metadata, { entities: {
		items: table('items', s.items.valueType, old.items), people: table('people', s.people.valueType, old.people),
		chats: table('chats', s.chats.valueType, old.chats), drafts: table('drafts', s.drafts.valueType, old.drafts),
		changes: table('changes', s.changes.valueType, old.changes), sources: table('sources', s.sources.valueType, old.sources),
		notes: table('notes', s.notes.valueType, old.notes), work: table('work', s.work.valueType, old.work),
		planSteps: table('planSteps', s.planSteps.valueType, old.planSteps), workSteps: table('workSteps', s.workSteps.valueType, old.workSteps),
		todos: table('todos', s.todos.valueType, old.todos), placements: table('placements', s.placements.valueType, old.placements),
		actions: table('actions', s.actions.valueType, old.actions), doneEntries: table('doneEntries', s.doneEntries.valueType, old.doneEntries),
		watches: table('watches', s.watches.valueType, old.watches), automations: table('automations', s.automations.valueType, old.automations),
		knowledgeProposals: table('knowledgeProposals', s.knowledgeProposals.valueType, old.knowledgeProposals),
		facts: table('facts', s.facts.valueType, old.facts), health: table('health', s.health.valueType, old.health),
		channels: table('channels', s.channels.valueType, old.channels), waiting: table('waiting', s.waiting.valueType, old.waiting),
	} })
}
