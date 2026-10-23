import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useInterface } from './interface.ts'
import { returningReactRoute } from '../services/version.ts'

function versionOf(hash: string) {
	const route = hash.replace(/^#/, '')
	return route === 'ui=new' ? 'new' : route === 'ui=classic' ? 'classic' : undefined
}

function routeOf(hash: string): string {
	const route = hash.replace(/^#/, '')
	const returning = returningReactRoute(route)
	if (returning) return returning
	if (!route || route === 'home') return 'now'
	if (versionOf(route)) return 'now'
	if (route.startsWith('focus/')) return route.replace('focus/', 'now/')
	if (route === 'automations/new') return route
	if (/^(ongoing|watching|automations)/.test(route)) return 'now/waiting'
	return route
}
export const useNavigation = create<{
	experienceReturn?: { from: string; to: string }
	route: string; find: string; help: boolean; menu: boolean; navigate: (route: string) => void; setFind: (find: string) => void; setHelp: (help: boolean) => void; setMenu: (menu: boolean) => void
}>(set => ({
	route: routeOf(location.hash), find: '', help: false, menu: false,
	navigate(route) { location.hash = route; if (!versionOf(route)) set({ route: routeOf(route) }) },
	setFind(find) { set({ find }) }, setHelp(help) { set({ help }) },
	setMenu(menu) { set({ menu }) },
}))
export function replaceRoute(route: string) {
	history.replaceState(history.state, '', `#${route}`)
	useNavigation.setState({ route: routeOf(route) })
}
export function useHashNavigation() {
	const route = useNavigation(state => state.route), previous = useRef(route)
	useEffect(() => {
		const changed = () => {
			const version = versionOf(location.hash)
			if (version) {
				replaceRoute(useNavigation.getState().route)
				void useInterface.getState().chooseVersion(version)
			} else useNavigation.setState({ route: routeOf(location.hash) })
		}
		addEventListener('hashchange', changed)
		changed()
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
