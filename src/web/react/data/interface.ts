import { create } from 'zustand'
import { recoveryHref, switchVersion, type Version } from '../services/version.ts'
import { useData } from './store.ts'
import { useSettingsDrafts } from './screens.ts'
import { usePageForms } from './forms.ts'

type Interface = {
	theme: 'light' | 'dark'
	themeChoice: 'auto' | 'light' | 'dark'
	switching: boolean
	error?: string
	recoveryHref: string
	toggleTheme: () => void
	setThemeChoice: (choice: 'auto' | 'light' | 'dark') => void
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
const choice = (() => { try { const stored = localStorage.getItem('delegate-theme'); return stored === 'light' || stored === 'dark' ? stored : 'auto' } catch { return 'auto' } })()

export function hasUnsentWork(): boolean {
	const state = useData.getState()
	return Object.entries(state.byRevision).some(([key, ui]) => {
		const code = key.slice(0, key.indexOf('@')), snapshot = state.pinned[code]?.snapshot ?? state.snapshot
		const item = snapshot?.entities.items[code], draft = item?.draftId ? snapshot?.entities.drafts[item.draftId] : undefined
		return !!(ui.composing || ui.answer?.trim() || ui.ask?.trim() || ui.report?.trim() || ui.feedbackKind || ui.feedback?.trim() ||
			ui.watchText !== undefined || ui.watchUntil !== undefined || ui.watchBy !== undefined ||
			ui.editing && ui.editText !== undefined && ui.editText !== draft?.text)
	}) || Object.keys(useSettingsDrafts.getState().drafts).length > 0 ||
		Object.entries(usePageForms.getState().fields).some(([key, value]) => key.endsWith('/text') && !!value.trim())
}

export const useInterface = create<Interface>((set, get) => ({
	theme,
	themeChoice: choice,
	switching: false,
	recoveryHref: recoveryHref(),
	reloadPreview() { if (!hasUnsentWork() || window.confirm('Discard your edit and reload?')) location.reload() },
	toggleTheme() {
		const next = get().theme === 'dark' ? 'light' : 'dark'
		get().setThemeChoice(next)
	},
	setThemeChoice(choice) {
		const theme = choice === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : choice
		document.documentElement.dataset.theme = theme
		try { if (choice === 'auto') localStorage.removeItem('delegate-theme'); else localStorage.setItem('delegate-theme', choice) } catch { /* Storage is optional. */ }
		set({ theme, themeChoice: choice })
	},
	async chooseVersion(version) {
		if (get().switching || version === 'react') return
		if (hasUnsentWork() && !window.confirm('Discard your edit?')) return
		set({ switching: true, error: undefined })
		try { await switchVersion(version) } catch (error) {
			console.error('Could not save the app version:', error)
			set({ switching: false, error: 'Could not switch versions. Your current version is unchanged. Check your connection and try again.' })
		}
	},
}))
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', event => {
	if (useInterface.getState().themeChoice === 'auto') {
		const theme = event.matches ? 'dark' : 'light'
		document.documentElement.dataset.theme = theme
		useInterface.setState({ theme })
	}
})
