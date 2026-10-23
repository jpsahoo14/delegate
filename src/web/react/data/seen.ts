import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveSeen } from '../services/api.ts'
import { useNavigation } from './navigation.ts'
import { useSnapshot } from './hooks.ts'
import { useNowLook } from './look.ts'
import { pinnedPlacements, useData } from './store.ts'

export function useSeen() {
	const route = useNavigation(state => state.route), find = useNavigation(state => state.find), snapshot = useSnapshot()
	const pinned = useData(state => state.pinned)
	const placements = snapshot ? { ...snapshot.entities.placements, ...pinnedPlacements({ pinned }) } : undefined
	const latest = useRef({ snapshot, placements, pinned }), client = useQueryClient(), [error, setError] = useState<string>()
	latest.current = { snapshot, placements, pinned }
	useEffect(() => {
		if (route.startsWith('now') && snapshot) useNowLook.getState().begin(useData.getState().entities.placements)
		else if (useNowLook.getState().active) useNowLook.getState().end()
	}, [route, snapshot?.entities.placements])
	useEffect(() => {
		if (!snapshot || find) return
		const save = (filters: string[], shownAt = snapshot.now) => {
			const data = latest.current.snapshot
			if (!data || document.visibilityState !== 'visible') return Promise.resolve(false)
			return saveSeen(filters, shownAt).then(() => { setError(undefined); void client.invalidateQueries({ queryKey: ['page'] }); return true }, failure => {
				console.error('Could not save seen marks:', failure)
				setError('Could not save what you have seen. New markers may return until the connection is restored.')
				return false
			})
		}
		const shownAt = (subjects: string[]) => subjects.reduce((at, subject) => {
			const pin = latest.current.pinned[subject]
			return pin && pin.snapshot.now < at ? pin.snapshot.now : at
		}, latest.current.snapshot?.now ?? snapshot.now)
		if (route.startsWith('done')) {
			const filter = route.split('/')[1] ?? 'all'
			const filters = filter === 'all' ? ['replies', 'reviews', 'changes', 'reminders', 'learned', 'catchup'] : [filter === 'closed' ? 'catchup' : filter]
			const timer = setTimeout(() => save(filters), 1500)
			return () => clearTimeout(timer)
		}
		if (route === 'now' || route.startsWith('now/')) {
			const root = document.getElementById('main')
			if (!root) return
			const timers = new Map<Element, { key: string; timer: ReturnType<typeof setTimeout> }>(), saved = new Map<string, string>(), saving = new Set<string>()
			const visible = (row: Element) => {
				if (document.visibilityState !== 'visible') return false
				const box = row.getBoundingClientRect()
				const height = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0)
				return box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth && height >= Math.min(box.height, innerHeight) * .25
			}
			const scan = () => {
				const rows = new Set(root.querySelectorAll('.now-row'))
				for (const [row, pending] of timers) if (!rows.has(row) || !visible(row)) { clearTimeout(pending.timer); timers.delete(row) }
				for (const row of rows) {
					const home = row.getAttribute('data-code'), placement = home ? latest.current.placements?.[home] : undefined
					if (!home || !placement || !visible(row)) continue
					const key = JSON.stringify([placement.subjects, placement.fresh]), previous = timers.get(row)
					if (previous?.key === key || saved.get(home) === key || saving.has(home)) continue
					if (previous) clearTimeout(previous.timer)
					const at = shownAt(placement.subjects)
					timers.set(row, { key, timer: setTimeout(() => {
						timers.delete(row)
						if (!row.isConnected || !visible(row)) return
						saving.add(home)
						void save(placement.subjects.map(subject => `item:${subject}`), at).then(ok => {
							saving.delete(home)
							if (ok) saved.set(home, key)
						})
					}, 1500) })
				}
			}
			let frame = 0
			const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; scan() }) }
			const visibility = () => {
				for (const pending of timers.values()) clearTimeout(pending.timer)
				timers.clear()
				schedule()
			}
			const observer = new MutationObserver(schedule)
			observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-selected'] })
			const unsubscribe = useData.subscribe((state, previous) => {
				if (state.entities.placements !== previous.entities.placements || state.pinned !== previous.pinned) schedule()
			})
			addEventListener('scroll', schedule, true)
			addEventListener('resize', schedule)
			document.addEventListener('visibilitychange', visibility)
			scan()
			return () => {
				observer.disconnect(); unsubscribe(); cancelAnimationFrame(frame); timers.forEach(pending => clearTimeout(pending.timer))
				removeEventListener('scroll', schedule, true); removeEventListener('resize', schedule)
				document.removeEventListener('visibilitychange', visibility)
			}
		}
	}, [route, find, !!snapshot, client])
	return error
}
