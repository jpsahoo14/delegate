import { useEffect, useMemo, useState } from 'react'
import { useEntities } from './hooks.ts'
import { useData } from './store.ts'

export function useDoneEntries() {
	const entries = useData(state => state.entities.doneEntries), pins = useData(state => state.pinned)
	return useMemo(() => {
		const result = { ...entries }
		for (const [code, pin] of Object.entries(pins)) for (const row of Object.values(pin.snapshot.entities.doneEntries)) if (row.code === code) result[row.id] = row
		return result
	}, [entries, pins])
}

export function useDoneLook() {
	const entities = useEntities()
	const [fresh, setFresh] = useState(() => new Set(Object.values(entities.doneEntries).filter(row => row.fresh).map(row => row.id)))
	useEffect(() => {
		const added = Object.values(entities.doneEntries).filter(row => row.fresh && !fresh.has(row.id))
		if (added.length) setFresh(previous => new Set([...previous, ...added.map(row => row.id)]))
	}, [entities.doneEntries, fresh])
	return fresh
}
