import { useCallback } from 'react'
import { useNavigation } from '../data/navigation.ts'

export function useScreenNavigation() {
	const address = useNavigation(state => state.route), go = useNavigation(state => state.navigate)
	const classic = address.startsWith('classic/')
	const navigate = useCallback((route: string) => go(classic ? `classic/${route === 'now' ? 'home' : route}` : route), [classic, go])
	return { route: classic ? address.slice('classic/'.length) : address, navigate, href: (route: string) => `#${classic ? 'classic/' : ''}${route}` }
}

export function ExperienceToggle() {
	const route = useNavigation(state => state.route), navigate = useNavigation(state => state.navigate)
	const classic = route.startsWith('classic/')
	return <label className="experience-choice">Experience <select aria-label="Experience" value={classic ? 'classic' : 'new'} onChange={event => {
		const screen = classic ? route.slice('classic/'.length) : route
		const shared = /^(done|numbers|settings|knowledge)(\/|$)/.test(screen)
		navigate(event.target.value === 'classic' ? `classic/${shared ? screen : 'home'}` : shared ? screen : 'now')
	}}><option value="new">New</option><option value="classic">Classic</option></select></label>
}
