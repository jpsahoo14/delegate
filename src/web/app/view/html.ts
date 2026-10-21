// Markup for the page. html`` builds it; text goes in through esc(). A plain string cannot be put in html``: the type allows only
// markup, numbers, booleans, and '' (the empty markup), so text that was not escaped fails the typecheck (B37).
// At run time a stray string is escaped all the same. Booleans and missing values print as a template literal prints them.
export class Html {
	readonly s: string
	constructor(s: string) { this.s = s }
	toString() { return this.s }
}
// Empty markup is '', so `x ? … : ''` and `if (part)` read as they did when markup was a string.
export type H = Html | ''
export type Part = H | number | boolean | null | undefined | readonly Part[]

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const text = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ENT[c])
const part = (v: Part | string): string => v instanceof Html ? v.s : Array.isArray(v) ? v.map(part).join('') : typeof v === 'string' ? text(v) : String(v)

export const raw = (s: string): H => s ? new Html(s) : ''
export const esc = (s: unknown): H => raw(text(s))
export function html(strings: TemplateStringsArray, ...parts: Part[]): H {
	let out = strings[0]
	for (let i = 0; i < parts.length; i++) out += part(parts[i]) + strings[i + 1]
	return raw(out)
}
// Markup joined by markup, as Array.join would with strings.
export const join = (items: readonly H[], by: H): H => raw(items.map(String).join(String(by)))
export const str = (h: H): string => String(h)
