import { site } from '../core/site.ts'
import { spawnSync } from 'node:child_process'

export function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' }
}

// The command line of a running process, or undefined when it cannot be read.
export function commandOf(pid: number): string | undefined {
	const r = process.platform === 'win32'
		? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${Math.trunc(pid)}").CommandLine`], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
		: spawnSync('ps', ['-o', 'command=', '-p', String(Math.trunc(pid))], { encoding: 'utf8', timeout: 5_000 })
	const out = r.status === 0 ? String(r.stdout).trim() : ''
	return out || undefined
}

// A process ID from before a restart can belong to another program by now. With Windows Fast Startup the boot time
// may not move, so the command line decides: only a process running one of ours counts (restart audit R3).
// When the command line cannot be read, the old answer stands.
// A workplace's wrapper around the AI CLI names itself in site.json.
export const ours = () => new RegExp(['delegate', 'copilot', 'claude', ...(site().processNames ?? [])].map(n => n.replace(/[^\w-]/g, '')).join('|'), 'i')
export function aliveAs(pid: number, marks: RegExp = ours()): boolean {
	if (!alive(pid)) return false
	const cmd = commandOf(pid)
	return cmd === undefined || marks.test(cmd)
}

// Stops a detached run and every process it started, then confirms it is gone (tester P1-10).
// Runs are started detached, so on macOS and Linux the run leads its own process group.
export function killTree(pid: number): boolean {
	if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true })
	else try { process.kill(-pid, 'SIGKILL') } catch { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }
	for (let i = 0; i < 20 && alive(pid); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
	return !alive(pid)
}
