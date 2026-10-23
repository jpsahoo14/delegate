import { useCallback, useId } from 'react'
import { useNavigation } from '../data/navigation.ts'
import { experienceReady, warmExperience } from '../data/views.ts'
import { hoverOf } from '../domain/hover.ts'

export function useScreenNavigation() {
	const address = useNavigation(state => state.route), go = useNavigation(state => state.navigate)
	const classic = address.startsWith('classic/')
	const navigate = useCallback((route: string) => go(classic ? `classic/${route === 'now' ? 'home' : route}` : route), [classic, go])
	return { classic, route: classic ? address.slice('classic/'.length).replace(/^done\/closed$/, 'done/catchup') : address, navigate, href: (route: string) => `#${classic ? 'classic/' : ''}${route}` }
}

export function ExperienceToggle({ disabled = false }: { disabled?: boolean }) {
	const route = useNavigation(state => state.route), navigate = useNavigation(state => state.navigate)
	const classic = route.startsWith('classic/')
	const hover = hoverOf('', 'Experience'), describedBy = useId()
	return <label className="experience-choice" title={hover}>Experience <select aria-label="Experience" aria-describedby={describedBy} disabled={disabled} value={classic ? 'classic' : 'new'} onChange={event => {
		if ((event.target.value === 'classic') === classic) return
		const screen = classic ? route.slice('classic/'.length) : route
		const shared = /^(done|numbers|settings|knowledge)(\/|$)/.test(screen)
		const previous = useNavigation.getState().experienceReturn
		const mapped = classic ? shared ? screen : screen.startsWith('focus/') ? screen.replace('focus/', 'now/') : screen.startsWith('ongoing') ? 'now/waiting' : 'now' :
			`classic/${shared ? screen : /^now\/A\d+(\/|$)/.test(screen) ? screen.replace('now/', 'focus/') : screen === 'now/waiting' ? 'ongoing' : 'home'}`
		const target = previous?.to === route ? previous.from : mapped
		const go = () => { useNavigation.setState({ experienceReturn: { from: route, to: target }, menu: false }); navigate(target) }
		// The other experience's code normally loads while idle; a switch before it arrives keeps this screen, dimmed, until it does (spec S6).
		if (experienceReady(!classic)) { go(); return }
		const page = document.documentElement
		page.dataset.switching = 'true'
		void warmExperience(!classic).finally(() => { delete page.dataset.switching; go() })
	}}><option value="new">New</option><option value="classic">Classic</option></select><span id={describedBy} className="sr-only">{hover}</span></label>
}
