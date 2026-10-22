import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveSeen } from '../services/api.ts'
import { useNavigation } from './navigation.ts'
import { useSnapshot } from './hooks.ts'
import { useNowLook } from './look.ts'

export function useSeen() {
	const route = useNavigation(state => state.route), find = useNavigation(state => state.find), snapshot = useSnapshot()
	const latest = useRef(snapshot), client = useQueryClient(), [error, setError] = useState<string>()
	latest.current = snapshot
	useEffect(() => {
		if (route.startsWith('now') && snapshot) useNowLook.getState().begin(snapshot.entities.placements)
		else if (useNowLook.getState().active) useNowLook.getState().end()
	}, [route, snapshot?.entities.placements])
	useEffect(() => {
		if (!snapshot || find) return
		const save = (filters: string[], shownAt = snapshot.now) => {
			const data = latest.current
			if (!data || document.visibilityState !== 'visible') return
			void saveSeen(filters, shownAt).then(() => { setError(undefined); void client.invalidateQueries({ queryKey: ['page'] }) }, failure => {
				console.error('Could not save seen marks:', failure)
				setError('Could not save what you have seen. New markers may return until the connection is restored.')
			})
		}
		if (route.startsWith('done')) {
			const filter = route.split('/')[1] ?? 'all'
			const filters = filter === 'all' ? ['replies', 'reviews', 'changes', 'reminders', 'learned', 'catchup'] : [filter === 'closed' ? 'catchup' : filter]
			const timer = setTimeout(() => save(filters), 1500)
			return () => clearTimeout(timer)
		}
		const code = route.startsWith('now/') ? route.split('/')[1] : undefined
		if (code) {
			const placement = snapshot.entities.placements[code]
			if (placement) save([...new Set(placement.subjects)].map(subject => `item:${subject}`))
		}
		if (route === 'now' || ['move', 'working', 'waiting', 'catchup'].includes(route.split('/')[1])) {
			const timers = new Map<Element, ReturnType<typeof setTimeout>>()
			const observer = new IntersectionObserver(entries => {
				for (const entry of entries) {
					const previous = timers.get(entry.target)
					if (!entry.isIntersecting) { if (previous) clearTimeout(previous); timers.delete(entry.target); continue }
					if (previous) continue
					const shownAt = latest.current?.now ?? snapshot.now
					timers.set(entry.target, setTimeout(() => {
						const home = entry.target.getAttribute('data-code'), placement = home ? latest.current?.entities.placements[home] : undefined
						if (placement) save(placement.subjects.map(subject => `item:${subject}`), shownAt)
						observer.unobserve(entry.target); timers.delete(entry.target)
					}, 1500))
				}
			}, { threshold: .25 })
			document.querySelectorAll('.now-row').forEach(row => observer.observe(row))
			return () => { observer.disconnect(); timers.forEach(timer => clearTimeout(timer)) }
		}
	}, [route, find, !!snapshot, client])
	return error
}
