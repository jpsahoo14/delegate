import type { Page } from 'playwright-core'

// Freeze timers as well as Date before navigation; the test advances them explicitly.
export async function freezeClock(page: { clock: Pick<Page['clock'], 'install' | 'pauseAt'> }, at = Date.now()) {
	await page.clock.install({ time: at })
	await page.clock.pauseAt(at)
}
