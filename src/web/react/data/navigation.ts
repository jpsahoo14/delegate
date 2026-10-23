import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { saveExperience, staticSnapshot } from '../services/api.ts'

// A link that chooses an experience: #ui=new or #ui=classic.
const chosenIn = (hash: string) => (/^#?ui=(new|classic)$/.exec(hash)?.[1] as 'new' | 'classic' | undefined)

// The experience this machine opens when the address names no screen; the server writes it on <html> (saved per machine).
export const savedExperience = () => document.documentElement.dataset.experience === 'classic' ? 'classic' : 'new'
// Remember a chosen experience on this page and on this machine; best effort, nothing waits for it.
export function rememberExperience(experience: 'new' | 'classic') {
	document.documentElement.dataset.experience = experience
	void saveExperience(experience).catch(error => console.warn('Could not remember the experience on this machine:', error))
}

// Old addresses keep working: the old Classic's screens open in React Classic (its Running, Watching and Automations are
// sections of Ongoing); every other address is already a React one.
function routeOf(hash: string): string {
	if (staticSnapshot() !== undefined) return 'classic/snapshot'
	const route = hash.replace(/^#/, ''), chosen = chosenIn(route), base = route.split('/')[0]
	if (!route) return savedExperience() === 'classic' ? 'classic/home' : 'now'
	if (chosen) return chosen === 'classic' ? 'classic/home' : 'now'
	if (base === 'home') return 'classic/home'
	if (base === 'focus' || base === 'ongoing') return `classic/${route}`
	if (route === 'running') return 'classic/ongoing/running'
	if (route === 'watching') return 'classic/ongoing'
	if (route === 'automations') return 'classic/ongoing/automations'
	if (base === 'snapshot') return 'classic/snapshot'
	return route
}
// The address the page opened with: a screen both experiences have (Done, Numbers, Settings, To learn) opens in the one this
// machine opens; a chosen experience is saved. The address is rewritten once, so links inside the page are never remapped.
function openingRoute(): string {
	const hash = location.hash.slice(1), chosen = chosenIn(hash)
	if (chosen) rememberExperience(chosen)
	const route = savedExperience() === 'classic' && /^(done|numbers|settings|knowledge)(\/|$)/.test(hash) ? `classic/${hash}` : routeOf(hash)
	if (hash && route !== hash) history.replaceState(history.state, '', `${location.pathname}${location.search}#${route}`)
	return route
}
export const useNavigation = create<{
	experienceReturn?: { from: string; to: string }
	route: string; find: string; help: boolean; menu: boolean; navigate: (route: string) => void; setFind: (find: string) => void; setHelp: (help: boolean) => void; setMenu: (menu: boolean) => void
}>(set => ({
	route: openingRoute(), find: '', help: false, menu: false,
	navigate(route) { location.hash = route; set({ route: routeOf(route) }) },
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
			const chosen = chosenIn(location.hash), next = routeOf(location.hash)
			if (chosen) rememberExperience(chosen)
			if (location.hash && next !== location.hash.slice(1)) replaceRoute(next)
			else useNavigation.setState({ route: next })
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
