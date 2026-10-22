import { useEffect, useRef } from 'react'
import { create } from 'zustand'

function routeOf(hash: string): string {
	const route = hash.replace(/^#/, '')
	if (!route || route === 'home') return 'now'
	if (route.startsWith('focus/')) return route.replace('focus/', 'now/')
	if (/^(ongoing|watching|automations)/.test(route)) return 'now/waiting'
	return route
}
export const useNavigation = create<{
	route: string; find: string; help: boolean; menu: boolean; navigate: (route: string) => void; setFind: (find: string) => void; setHelp: (help: boolean) => void; setMenu: (menu: boolean) => void
}>(set => ({
	route: routeOf(location.hash), find: '', help: false, menu: false,
	navigate(route) { location.hash = route; set({ route: routeOf(route) }) },
	setFind(find) { set({ find }) }, setHelp(help) { set({ help }) },
	setMenu(menu) { set({ menu }) },
}))
export function useHashNavigation() {
	const route = useNavigation(state => state.route), previous = useRef(route)
	useEffect(() => {
		const changed = () => useNavigation.setState({ route: routeOf(location.hash) })
		addEventListener('hashchange', changed)
		return () => removeEventListener('hashchange', changed)
	}, [])
	useEffect(() => {
		const before = previous.current, base = route.split('/')[0]
		previous.current = route
		if (route === base || before.split('/')[0] !== base && !(base === 'settings' && route.includes('/'))) {
			const frame = requestAnimationFrame(() => {
				window.scrollTo(0, 0)
				document.getElementById('main')?.focus({ preventScroll: true })
			})
			return () => cancelAnimationFrame(frame)
		}
	}, [route])
}
