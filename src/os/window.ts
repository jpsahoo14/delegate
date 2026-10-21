import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
type Spawn = typeof spawn
// Under the test runner nothing opens a window or a browser on the owner's screen (bug 10-21 windows: one per full test run).
const noTestWindow = (what: string, name: string) => { if (process.env.NODE_TEST_CONTEXT) throw new Error(`A test tried to open a ${what}: ${name}`) }

export function openUrl(url: string, run: Spawn = spawn) {
	noTestWindow('browser', url)
	const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`]] : ['xdg-open', [url]]
	run(cmd as string, args as string[], { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' }).unref()
}

// Opens a new terminal window on this machine running argv (R-HIL-08). The window does not inherit our environment on macOS.
export function openWindow(title: string, argv: string[], env: Record<string, string>, run: Spawn = spawn) {
	noTestWindow('window', title)
	if (process.platform === 'darwin') {
		// A .command file opens in a new Terminal window without the Automation permission that AppleScript needs (measured: AppleEvent timed out).
		const file = join(tmpdir(), `delegate-${title.replace(/\W+/g, '-')}-${process.pid}.command`)
		const lines = ['#!/bin/sh', ...Object.entries(env).map(([k, v]) => `export ${k}=${shq(v)}`), `rm -f ${shq(file)}`, `exec ${argv.map(shq).join(' ')}`]
		writeFileSync(file, lines.join('\n') + '\n', { mode: 0o755 })
		run('open', [file], { detached: true, stdio: 'ignore' }).unref()
		return
	}
	if (process.platform === 'win32') {
		const cmd = `start "${title}" ${argv.map(a => `"${a}"`).join(' ')}`
		run('cmd.exe', ['/d', '/s', '/c', cmd], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', env: { ...process.env, ...env } }).unref()
		return
	}
	throw new Error(`Opening a window is not supported on ${process.platform}. Run: ${argv.join(' ')}`)
}
