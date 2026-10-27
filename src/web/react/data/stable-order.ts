import { useEffect, useRef } from 'react'

export function useStableOrder(ids: readonly string[]): string[] {
	const previous = useRef<string[]>([])
	const incoming = [...new Set(ids)], live = new Set(incoming), shown = new Set(previous.current)
	const next = [...incoming.filter(id => !shown.has(id)), ...previous.current.filter(id => live.has(id))]
	const order = next.length === previous.current.length && next.every((id, index) => id === previous.current[index]) ? previous.current : next
	useEffect(() => { previous.current = order }, [order])
	return order
}
