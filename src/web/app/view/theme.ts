// A display choice for this browser only: Auto follows the system; Light and Dark override it.
// The shell applies a stored choice before the first paint (src/web/shell.ts THEME_FIRST), so dark never flashes light.
export const THEMES = ['auto', 'light', 'dark'] as const
export type Theme = typeof THEMES[number]
export const THEME_LABEL: Record<Theme, string> = { auto: 'same as your system', light: 'light', dark: 'dark' }

export const theme = (): Theme => { let t: string | null | undefined; try { t = localStorage.getItem('delegate-theme') } catch { t = document.documentElement.dataset.theme } return (THEMES as readonly string[]).includes(t ?? '') ? t as Theme : 'auto' }
export const nextTheme = () => THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length]
export function applyTheme(t: Theme) {
	try { if (t === 'auto') localStorage.removeItem('delegate-theme'); else localStorage.setItem('delegate-theme', t) } catch { /* private mode: this page only */ }
	if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t
}
