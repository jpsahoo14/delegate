import { spawn } from 'node:child_process'

// A system notification on the runner machine, for when no list surface can be reached (R-HIL-18). Best effort, never throws.
export function notify(title: string, body: string) {
	try {
		const q = (s: string) => s.replace(/["\\]/g, ' ')
		if (process.platform === 'darwin') spawn('osascript', ['-e', `display notification "${q(body)}" with title "${q(title)}"`], { detached: true, stdio: 'ignore' }).unref()
		else if (process.platform === 'win32') spawn('msg', ['*', `${q(title)}: ${q(body)}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
	} catch { /* a missing notifier is not worth a failed tick */ }
}
