import type { Page } from 'playwright-core'

// pauseAt installs the clock too. A separate install can tick past the pause target between protocol calls.
export async function freezeClock(page: { clock: Pick<Page['clock'], 'pauseAt'> }, at = Date.now()) {
	await page.clock.pauseAt(at)
}
