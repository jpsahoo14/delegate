import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright-core'
import { freezeClock } from './browser-clock.ts'

test('browser timing: install and pause timers before navigation, not just Date', async () => {
	const calls: [string, unknown][] = []
	const page = {
		clock: {
			install: async (options: unknown) => { calls.push(['install', options]) },
			pauseAt: async (at: unknown) => { calls.push(['pauseAt', at]) },
			setFixedTime: async (at: unknown) => { calls.push(['setFixedTime', at]) },
		},
	} satisfies { clock: Pick<Page['clock'], 'install' | 'pauseAt' | 'setFixedTime'> }
	await freezeClock(page, 1000)
	assert.deepEqual(calls, [['install', { time: 1000 }], ['pauseAt', 1000]])
})
