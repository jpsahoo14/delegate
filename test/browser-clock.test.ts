import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright-core'
import { freezeClock } from './browser-clock.ts'

test('browser timing: pause timers atomically before navigation, not just Date', async () => {
	const calls: [string, unknown][] = []
	const page = {
		clock: {
			install: async (options: unknown) => { calls.push(['install', options]) },
			pauseAt: async (at: unknown) => { calls.push(['pauseAt', at]) },
			setFixedTime: async (at: unknown) => { calls.push(['setFixedTime', at]) },
		},
	} satisfies { clock: Pick<Page['clock'], 'install' | 'pauseAt' | 'setFixedTime'> }
	await freezeClock(page, 1000)
	assert.deepEqual(calls, [['pauseAt', 1000]])
})

test('browser timing: slow protocol calls cannot make the pause target fall into the past', async () => {
	let now = 0
	const page = {
		clock: {
			install: async (options?: { time?: number | string | Date }) => { now = Number(options?.time) + 5000 },
			pauseAt: async (at: number | string | Date) => { assert.ok(Number(at) >= now, 'Cannot fast-forward to the past') },
		},
	}
	await freezeClock(page, 1000)
})
