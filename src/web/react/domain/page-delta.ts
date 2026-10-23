import { z } from 'zod'
import type { Snapshot } from './contracts.ts'

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const fields = z.custom<Record<string, unknown>>(record)
type Group = { ids: string[]; replace: boolean; value: Record<string, unknown> }
const group = (value: unknown): value is Group => record(value) && typeof value.replace === 'boolean' &&
	Array.isArray(value.ids) && value.ids.every(id => typeof id === 'string') && record(value.value)
const tables = z.custom<Record<string, Group[]>>(value => record(value) &&
	Object.values(value).every(groups => Array.isArray(groups) && groups.every(group)))
export const pageDeltaSchema = z.object({
	base: z.string(), page: fields, pageRemoved: z.array(z.string()), values: z.array(z.unknown()),
	entities: tables,
	removed: z.record(z.string(), z.array(z.string())),
	// A table's ids in the server's order, when merging would not keep it (new rows go first, say) (bug 10-23 E97).
	order: z.record(z.string(), z.array(z.string())).optional(),
})
type Delta = z.infer<typeof pageDeltaSchema>

export function pageDelta(before: Snapshot, after: Snapshot, base: string): Delta {
	const { entities, ...metadata } = after, { entities: _oldEntities, ...oldMetadata } = before
	const page = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(Reflect.get(oldMetadata, key))))
	const pageRemoved = Object.keys(oldMetadata).filter(key => !(key in metadata) || Reflect.get(metadata, key) === undefined && Reflect.get(oldMetadata, key) !== undefined)
	const delta: Delta = { base, page, pageRemoved, values: [], entities: {}, removed: {} }, values = new Map<unknown, number>()
	const references = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined).map(([key, field]) => {
		let index = values.get(field)
		if (index === undefined) { index = delta.values.length; delta.values.push(field); values.set(field, index) }
		return [key, index]
	}))
	for (const table of Object.keys(entities) as (keyof Snapshot['entities'])[]) {
		const old = before.entities[table], fresh = entities[table]
		const changed = new Map<string, Delta['entities'][string][number]>()
		const change = (id: string, replace: boolean, value: Record<string, unknown>) => {
			const key = JSON.stringify([replace, value]), group = changed.get(key)
			if (group) group.ids.push(id)
			else changed.set(key, { ids: [id], replace, value })
		}
		for (const [id, value] of Object.entries(fresh)) {
			const prior = old[id]
			if (!prior || Object.keys(prior).some(key => !(key in value) || Reflect.get(value, key) === undefined && Reflect.get(prior, key) !== undefined)) {
				change(id, true, references(value)); continue
			}
			const patch = Object.fromEntries(Object.entries(value).filter(([key, field]) => JSON.stringify(field) !== JSON.stringify(Reflect.get(prior, key))))
			if (Object.keys(patch).length) change(id, false, references(patch))
		}
		if (changed.size) delta.entities[table] = [...changed.values()]
		const removed = Object.keys(old).filter(id => !(id in fresh))
		if (removed.length) delta.removed[table] = removed
		const merged = [...Object.keys(old).filter(id => id in fresh), ...Object.keys(fresh).filter(id => !(id in old))], ids = Object.keys(fresh)
		if (merged.some((id, i) => id !== ids[i])) (delta.order ??= {})[table] = ids
	}
	return delta
}
