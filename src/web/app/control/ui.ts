// What the controls say and focus, through whichever experience draws the page.
import { current } from '../view/render.ts'
import { applyTheme, type Theme } from '../view/theme.ts'

export const say = (t: string | undefined, toast = true) => { if (t) current().say(t, toast) }
export const focusOn = (id: string) => (document.getElementById(id) as HTMLElement | null)?.focus()
export const setTheme = (t: Theme) => { applyTheme(t); current().theme(t) }
