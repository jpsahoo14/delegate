import { test } from 'node:test'
import assert from 'node:assert/strict'

const { openUrl, openWindow } = await import('../src/os/window.ts')

// Bug 10-21 windows: a browser test's "continue A1" opened a real Terminal window on every full test run. Under the test runner,
// nothing opens a window or a browser; the spawner is passed in, so a broken guard records a call instead of opening one.
test('bug 10-21 windows: a test never opens a terminal window or a browser', () => {
	const spawned: string[] = []
	const spy = ((cmd: string) => { spawned.push(cmd); return { unref() {}, on() { return this } } }) as never
	assert.throws(() => openWindow('Delegate A1', ['node', 'cli.ts', 'continue', 'A1'], {}, spy), /A test tried to open a window: Delegate A1/)
	assert.throws(() => openUrl('http://127.0.0.1:1/', spy), /A test tried to open a browser: http:\/\/127\.0\.0\.1:1\//)
	assert.deepEqual(spawned, [], 'nothing was started')
})
