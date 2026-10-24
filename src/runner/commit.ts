import { isDeepStrictEqual } from 'node:util'
import { freshRead } from '../store/fs.ts'

type Snapshot = { fields: Record<string, unknown> }
const snapshots = new WeakMap<object, Snapshot>()
function fields(value: object): Record<string, unknown> {
	const out: Record<string, unknown> = Object.create(null)
	return Object.assign(out, structuredClone(Object.fromEntries(Object.entries(value))))
}

// Create before local mutations. Nested handlers sharing an object share its last committed baseline.
export function recordCommit<T extends object, A extends unknown[]>(record: T, read: () => T | undefined, write: (value: T, ...args: A) => unknown) {
	let snapshot = snapshots.get(record)
	if (!snapshot) {
		const current = freshRead(read)
		if (!current) throw new Error('The record disappeared before its update started')
		snapshot = { fields: fields(record) }
		snapshots.set(record, snapshot)
	}
	const baseline = snapshot
	const merge = () => {
		const current = read()
		if (!current) throw new Error('The record disappeared before its update could be saved')
		const keys = new Set([...Object.keys(baseline.fields), ...Object.keys(record), ...Object.keys(current)])
		for (const key of keys) {
			const own: unknown = Reflect.get(record, key), latest: unknown = Reflect.get(current, key)
			if (!isDeepStrictEqual(baseline.fields[key], own)) continue
			Object.defineProperty(record, key, { value: latest, writable: true, enumerable: true, configurable: true })
			baseline.fields[key] = structuredClone(latest)
		}
		return record
	}
	return Object.assign((...args: A) => freshRead(() => {
		merge()
		write(record, ...args)
		baseline.fields = fields(record)
	}), { refresh: () => freshRead(merge) })
}
