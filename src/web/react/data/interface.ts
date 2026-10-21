import { create } from 'zustand'
import { recoveryHref, switchVersion, type Version } from '../services/version.ts'

type Interface = {
	theme: 'light' | 'dark'
	switching: boolean
	error?: string
	recoveryHref: string
	toggleTheme: () => void
	chooseVersion: (version: Version) => Promise<void>
	reloadPreview: () => void
}

function initialTheme(): 'light' | 'dark' {
	try {
		const stored = localStorage.getItem('delegate-theme')
		if (stored === 'light' || stored === 'dark') return stored
	} catch { /* Storage is optional. */ }
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = initialTheme()
document.documentElement.dataset.theme = theme

export const useInterface = create<Interface>((set, get) => ({
	theme,
	switching: false,
	recoveryHref: recoveryHref(),
	reloadPreview() { location.reload() },
	toggleTheme() {
		const next = get().theme === 'dark' ? 'light' : 'dark'
		document.documentElement.dataset.theme = next
		try { localStorage.setItem('delegate-theme', next) } catch { /* Storage is optional. */ }
		set({ theme: next })
	},
	async chooseVersion(version) {
		if (get().switching || version === 'react') return
		set({ switching: true, error: undefined })
		try { await switchVersion(version) } catch (error) {
			console.error('Could not save the app version:', error)
			set({ switching: false, error: 'Could not switch versions. Your current version is unchanged. Check your connection and try again.' })
		}
	},
}))
