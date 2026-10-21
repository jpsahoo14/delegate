import { execFileSync } from 'node:child_process'
import { assertTestSafe } from '../store/fs.ts'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, posix, win32 } from 'node:path'

export const LABEL = 'com.delegate.runner'
export const TASK = 'Delegate Runner'

export type Paths = { node: string; cli: string; local: string; pathEnv: string }

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The scheduler always runs this stable launcher, so an update only rewrites the launcher (dev-spec/distribution.md).
export function launcher(p: Paths, win: boolean): { file: string; body: string } {
	// Each launcher uses its own platform's path rules, whatever machine builds it.
	if (win) {
		return { file: win32.join(p.local, 'bin', 'delegate-tick.cmd'), body: `@echo off\r\nset "PATH=${p.pathEnv}"\r\nset "DELEGATE_LOCAL=${p.local}"\r\n"${p.node}" "${p.cli}" tick >> "${win32.join(p.local, 'logs', 'runner.log')}" 2>&1\r\n` }
	}
	const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
	return { file: posix.join(p.local, 'bin', 'delegate-tick'), body: `#!/bin/sh\nexport PATH=${sh(p.pathEnv)}\nexport DELEGATE_LOCAL=${sh(p.local)}\nexec ${sh(p.node)} ${sh(p.cli)} tick\n` }
}

export function plist(p: Paths, launcherFile: string): string {
	const log = xml(posix.join(p.local, 'logs', 'runner.log'))
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>${LABEL}</string>
	<key>ProgramArguments</key><array><string>${xml(launcherFile)}</string></array>
	<key>StartInterval</key><integer>60</integer>
	<key>RunAtLoad</key><true/>
	<key>ProcessType</key><string>Background</string>
	<key>LowPriorityIO</key><true/>
	<key>Nice</key><integer>5</integer>
	<key>StandardOutPath</key><string>${log}</string>
	<key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`
}

// A tiny VBScript runs the launcher with no console window, so nothing flashes on screen each minute.
export function hiddenVbs(launcherFile: string): string {
	return `CreateObject("WScript.Shell").Run """${launcherFile}""", 0, False\r\n`
}

const psq = (s: string) => `'${s.replace(/'/g, "''")}'`

// Measured on Windows 11: a task made by "schtasks /SC MINUTE" never fired, while this form ran every minute.
// It allows battery power, catches up missed runs, and never overlaps itself.
export function registerScript(vbsFile: string): string {
	return [
		`$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${psq(`//B //Nologo "${vbsFile}"`)}`,
		'$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(30) -RepetitionInterval (New-TimeSpan -Minutes 1)',
		'$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew',
		'$p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType Interactive -RunLevel Limited',
		`Register-ScheduledTask -TaskName ${psq(TASK)} -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null`,
	].join('; ')
}

export function install(p: Paths, platform = process.platform): string {
	const win = platform === 'win32'
	assertTestSafe(p.local)
	mkdirSync(join(p.local, 'logs'), { recursive: true })
	const l = launcher(p, win)
	assertTestSafe(l.file)
	mkdirSync(dirname(l.file), { recursive: true })
	writeFileSync(l.file, l.body, { mode: 0o700 })
	if (win) {
		const vbs = join(p.local, 'bin', 'delegate-tick.vbs')
		writeFileSync(vbs, hiddenVbs(l.file))
		execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', registerScript(vbs)], { stdio: 'pipe' })
		return `Installed scheduled task "${TASK}" (every minute, hidden).`
	}
	chmodSync(l.file, 0o700)
	const file = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
	assertTestSafe(file)
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, plist(p, l.file), { mode: 0o600 })
	const domain = `gui/${process.getuid?.()}`
	try { execFileSync('launchctl', ['bootout', `${domain}/${LABEL}`], { stdio: 'pipe' }) } catch { /* not loaded */ }
	execFileSync('launchctl', ['bootstrap', domain, file], { stdio: 'pipe' })
	return `Installed launchd agent ${LABEL} (every minute).`
}

export function uninstall(p: Paths, platform = process.platform): string {
	if (platform === 'win32') {
		try { execFileSync('schtasks', ['/Delete', '/F', '/TN', TASK], { stdio: 'pipe' }) } catch { /* not installed */ }
	} else {
		assertTestSafe(join(homedir(), 'Library', 'LaunchAgents'))
		try { execFileSync('launchctl', ['bootout', `gui/${process.getuid?.()}/${LABEL}`], { stdio: 'pipe' }) } catch { /* not loaded */ }
		rmSync(join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`), { force: true })
	}
	assertTestSafe(p.local)
	for (const f of ['delegate-tick', 'delegate-tick.cmd', 'delegate-tick.vbs']) rmSync(join(p.local, 'bin', f), { force: true })
	return 'Removed the background runner. Your data is kept.'
}

export function status(platform = process.platform): boolean {
	try {
		if (platform === 'win32') execFileSync('schtasks', ['/Query', '/TN', TASK], { stdio: 'pipe' })
		else execFileSync('launchctl', ['print', `gui/${process.getuid?.()}/${LABEL}`], { stdio: 'pipe' })
		return true
	} catch { return false }
}

export const installed = (local: string) => existsSync(join(local, 'bin', process.platform === 'win32' ? 'delegate-tick.cmd' : 'delegate-tick'))
