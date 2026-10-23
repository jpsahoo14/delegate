import { create } from 'zustand'
import { useData } from './store.ts'
import { useSettingsDrafts } from './screens.ts'
import { usePageForms } from './forms.ts'

export const THEME_LABEL = { auto: 'same as your system', light: 'light', dark: 'dark' } as const

type Interface = {
	theme: 'light' | 'dark'
	themeChoice: 'auto' | 'light' | 'dark'
	switching: boolean
	error?: string
	toggleTheme: () => void
	setThemeChoice: (choice: 'auto' | 'light' | 'dark') => void
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
		usePageForms.getState().composing || Object.keys(usePageForms.getState().fields).length > 0
}

export const useInterface = create<Interface>((set, get) => ({
	theme,
	themeChoice: choice,
	switching: false,
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
}))
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', event => {
	if (useInterface.getState().themeChoice === 'auto') {
		const theme = event.matches ? 'dark' : 'light'
		document.documentElement.dataset.theme = theme
		useInterface.setState({ theme })
	}
})
