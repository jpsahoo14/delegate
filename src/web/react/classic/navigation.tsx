import { useCallback } from 'react'
import { useNavigation } from '../data/navigation.ts'

export function useScreenNavigation() {
	const address = useNavigation(state => state.route), go = useNavigation(state => state.navigate)
	const classic = address.startsWith('classic/')
	const navigate = useCallback((route: string) => go(classic ? `classic/${route === 'now' ? 'home' : route}` : route), [classic, go])
	return { classic, route: classic ? address.slice('classic/'.length).replace(/^done\/closed$/, 'done/catchup') : address, navigate, href: (route: string) => `#${classic ? 'classic/' : ''}${route}` }
}

export function ExperienceToggle({ disabled = false }: { disabled?: boolean }) {
	const route = useNavigation(state => state.route), navigate = useNavigation(state => state.navigate)
	const classic = route.startsWith('classic/')
	return <label className="experience-choice">Experience <select aria-label="Experience" disabled={disabled} value={classic ? 'classic' : 'new'} onChange={event => {
		if ((event.target.value === 'classic') === classic) return
		const screen = classic ? route.slice('classic/'.length) : route
		const shared = /^(done|numbers|settings|knowledge)(\/|$)/.test(screen)
		const previous = useNavigation.getState().experienceReturn
		const mapped = classic ? shared ? screen : screen.startsWith('focus/') ? screen.replace('focus/', 'now/') : screen.startsWith('ongoing') ? 'now/waiting' : 'now' :
			`classic/${shared ? screen : /^now\/A\d+(\/|$)/.test(screen) ? screen.replace('now/', 'focus/') : screen === 'now/waiting' ? 'ongoing' : 'home'}`
		const target = previous?.to === route ? previous.from : mapped
		useNavigation.setState({ experienceReturn: { from: route, to: target }, menu: false })
		navigate(target)
	}}><option value="new">New</option><option value="classic">Classic</option></select></label>
}
