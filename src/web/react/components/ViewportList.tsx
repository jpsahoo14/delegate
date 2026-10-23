import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function ViewportList({ ids, render, retained = [], target, estimate, gap = 0, className, ordered = false, scrollable = false }: {
	ids: string[]; render: (id: string) => ReactNode; retained?: string[]; target?: string; estimate: number; gap?: number; className?: string; ordered?: boolean; scrollable?: boolean
}) {
	const root = useRef<HTMLElement | null>(null), heights = useRef(new Map<string, number>()), passes = useRef(0)
	const [range, setRange] = useState({ start: 0, end: 18 }), [focused, setFocused] = useState<string>()
	const windowed = ids.length > 100, offsets = [0]
	for (const id of ids) offsets.push(offsets.at(-1)! + (heights.current.get(id) ?? estimate) + gap)
	const kept = new Set([...retained, ...(target ? [target] : []), ...(focused ? [focused] : [])])
	const indices = ids.flatMap((id, index) => !windowed || index >= range.start && index < range.end || kept.has(id) ? [index] : [])
	useLayoutEffect(() => {
		const element = root.current
		if (!element || !windowed) return
		// Rows read their own heights here, in the commit that drew them. A measured height never re-renders by itself: spacers
		// only stand for rows not drawn, so only a range change needs another commit (bug 10-23 E88: no measure/frame cascade).
		const measure = () => {
			let changed = false
			element.querySelectorAll<HTMLElement>(':scope > [data-window-id]').forEach(row => {
				const id = row.dataset.windowId!, height = row.getBoundingClientRect().height
				if (height > 0 && heights.current.get(id) !== height) { heights.current.set(id, height); changed = true }
			})
			return changed
		}
		const update = () => {
			const at = [0]
			for (const id of ids) at.push(at.at(-1)! + (heights.current.get(id) ?? estimate) + gap)
			const top = element.getBoundingClientRect().top, from = scrollable ? element.scrollTop : -top, to = from + (scrollable ? element.clientHeight : innerHeight)
			let start = 0, end = ids.length
			while (start < ids.length && at[start + 1] < from) start++
			end = start
			while (end < ids.length && at[end] < to) end++
			start = Math.max(0, start - 3); end = Math.min(ids.length, end + 3)
			setRange(previous => previous.start === start && previous.end === end ? previous : { start, end })
		}
		let frame = 0
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(() => { frame = 0; update() })
		}
		const observer = new ResizeObserver(() => { if (measure()) schedule() })
		element.querySelectorAll(':scope > [data-window-id]').forEach(row => observer.observe(row))
		measure()
		// A few synchronous passes per frame settle the range; past that, the next frame does (no layout recursion).
		if (passes.current++ === 0) requestAnimationFrame(() => { passes.current = 0 })
		if (passes.current <= 3) update(); else schedule()
		addEventListener('scroll', schedule, true); addEventListener('resize', schedule)
		return () => { observer.disconnect(); cancelAnimationFrame(frame); removeEventListener('scroll', schedule, true); removeEventListener('resize', schedule) }
	}, [ids, windowed, range.start, range.end, focused, target, scrollable])
	useLayoutEffect(() => {
		if (!target || !windowed && !scrollable) return
		const element = root.current
		if (!element) return
		if (scrollable) {
			const index = ids.indexOf(target), top = offsets[index], bottom = offsets[index + 1]
			if (index >= 0 && (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight)) element.scrollTop = Math.max(0, top - element.clientHeight / 2)
		} else {
			const row = [...element.children].find(row => row instanceof HTMLElement && row.dataset.windowId === target)
			row?.scrollIntoView({ block: 'nearest' })
		}
	}, [target, windowed, scrollable])
	const Container = ordered ? 'ol' : 'div', Row = ordered ? 'li' : 'div', children: ReactNode[] = []
	let previous = 0
	for (const index of indices) {
		if (windowed && offsets[index] > offsets[previous]) children.push(<Row key={`space-${index}`} aria-hidden="true" style={{ height: offsets[index] - offsets[previous], listStyle: 'none' }} />)
		children.push(<Row key={ids[index]} data-window-id={ids[index]} role={ordered ? undefined : 'listitem'} aria-posinset={index + 1} aria-setsize={ids.length}
			style={gap ? { marginBottom: gap } : undefined}>{render(ids[index])}</Row>)
		previous = index + 1
	}
	if (windowed && previous < ids.length) children.push(<Row key="space-end" aria-hidden="true" style={{ height: offsets.at(-1)! - offsets[previous], listStyle: 'none' }} />)
	return <Container ref={(node: HTMLOListElement & HTMLDivElement | null) => { root.current = node }} role={ordered ? undefined : 'list'} className={className} style={ordered ? { gap: 0 } : undefined}
		onFocusCapture={event => {
			const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-window-id]') : undefined
			if (row) setFocused(row.dataset.windowId)
		}}
		onBlurCapture={event => {
			if (!(event.relatedTarget instanceof Node) || !root.current?.contains(event.relatedTarget)) setFocused(undefined)
		}}>{children}</Container>
}
