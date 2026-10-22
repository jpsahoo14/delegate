import { useEffect } from 'react'
import { create } from 'zustand'

function routeOf(hash: string): string {
	const route = hash.replace(/^#/, '')
	if (!route || route === 'home') return 'now'
	if (route.startsWith('focus/')) return route.replace('focus/', 'now/')
	if (/^(ongoing|watching|automations)/.test(route)) return 'now/waiting'
	return route
}
export const useNavigation = create<{
	route: string; find: string; help: boolean; navigate: (route: string) => void; setFind: (find: string) => void; setHelp: (help: boolean) => void
}>(set => ({
	route: routeOf(location.hash), find: '', help: false,
	navigate(route) { location.hash = route; set({ route: routeOf(route) }) },
	setFind(find) { set({ find }) }, setHelp(help) { set({ help }) },
}))
export function useHashNavigation() {
	useEffect(() => {
		const changed = () => useNavigation.setState({ route: routeOf(location.hash) })
		addEventListener('hashchange', changed)
		return () => removeEventListener('hashchange', changed)
	}, [])
}
