export type Version = 'classic' | 'new' | 'react'
const RETURN_ROUTE = 'delegate-react-return-route'

function legacyRouteFor(screen: string, ui: Version): string {
	if (ui === 'new') {
		if (/^(now|done|numbers|settings|knowledge)(\/|$)/.test(screen)) return screen
		if (screen.startsWith('focus/')) return screen.replace('focus/', 'now/')
		if (screen === 'ongoing/running') return 'now/working'
		return /^(ongoing|watching|automations)(\/|$)/.test(screen) ? 'now/waiting' : 'now'
	}
	if (screen === 'now') return 'home'
	if (screen === 'now/waiting') return 'ongoing'
	if (screen === 'now/working') return 'ongoing/running'
	if (screen === 'now/catchup') return 'done/catchup'
	return /^now\/A\d+(\/|$)/.test(screen) ? screen.replace('now/', 'focus/') : screen
}

export function returningReactRoute(route: string): string | undefined {
	try {
		const saved: unknown = JSON.parse(sessionStorage.getItem(RETURN_ROUTE) ?? 'null')
		if (saved) sessionStorage.removeItem(RETURN_ROUTE)
		if (saved && typeof saved === 'object' && 'legacyRoute' in saved && saved.legacyRoute === route.replace(/^classic\//, '') && 'route' in saved && typeof saved.route === 'string') {
			history.replaceState(history.state, '', `${location.pathname}${location.search}#${saved.route}`)
			return saved.route
		}
	} catch { /* Storage is optional. */ }
	return undefined
}

export function recoveryHref(): string {
	return `/?ui=new&t=${encodeURIComponent(new URLSearchParams(location.search).get('t') ?? '')}`
}

export async function switchVersion(ui: Version): Promise<void> {
	const token = new URLSearchParams(location.search).get('t') ?? ''
	const response = await fetch(`/ui?t=${encodeURIComponent(token)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ui }),
	})
	if (!response.ok) throw new Error('Could not switch versions. Your current version is unchanged.')
	const body: unknown = await response.json()
	if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) {
		throw new Error('Could not switch versions. Your current version is unchanged.')
	}
	try { localStorage.setItem('delegate-ui', JSON.stringify({ ui, at: new Date().toISOString() })) } catch { /* Storage is optional. */ }
	const route = location.hash.slice(1), screen = route.replace(/^classic\//, '')
	const legacyRoute = legacyRouteFor(screen, ui)
	try { sessionStorage.setItem(RETURN_ROUTE, JSON.stringify({ route, legacyRoute })) } catch { /* Storage is optional. */ }
	history.replaceState(history.state, '', `${location.pathname}${location.search}#${legacyRoute}`)
	location.reload()
}
