import type { Page } from 'playwright-core'

type Box = { x: number; y: number; width: number; height: number }

export async function readLayout(page: Pick<Page, 'evaluate'>, selectors: string[]): Promise<Record<string, Box>> {
	return page.evaluate(async (selectors) => {
		await document.fonts.ready
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
		// Resolve and measure together: a redraw between protocol calls can detach an ElementHandle.
		return Object.fromEntries(selectors.map(selector => {
			const el = document.querySelector(selector)
			if (!el) throw new Error(`Missing layout element: ${selector}`)
			const { x, y, width, height } = el.getBoundingClientRect()
			if (!width || !height) throw new Error(`Invisible layout element: ${selector}`)
			return [selector, { x, y, width, height }]
		}))
	}, selectors)
}
