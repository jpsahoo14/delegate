import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hiddenVbs, launcher, plist, registerScript, LABEL } from '../src/os/scheduler.ts'

const p = { node: '/usr/local/bin/node', cli: '/opt/delegate/src/cli.ts', local: '/Users/a/.delegate', pathEnv: '/usr/bin:/bin' }

test('R-SET-03 macOS: the launchd plist runs the stable launcher every minute and is valid', () => {
	const l = launcher(p, false)
	assert.equal(l.file, '/Users/a/.delegate/bin/delegate-tick')
	assert.equal(l.body, "#!/bin/sh\nexport PATH='/usr/bin:/bin'\nexport DELEGATE_LOCAL='/Users/a/.delegate'\nexec '/usr/local/bin/node' '/opt/delegate/src/cli.ts' tick\n")
	const x = plist(p, l.file)
	assert.match(x, new RegExp(`<string>${LABEL}</string>`))
	assert.match(x, /<key>StartInterval<\/key><integer>60<\/integer>/)
	if (process.platform === 'darwin') {
		const f = join(mkdtempSync(join(tmpdir(), 'plist-')), 'a.plist')
		writeFileSync(f, x)
		assert.match(execFileSync('plutil', ['-lint', f]).toString(), /OK/)
	}
})

test('R-SET-03 Windows: a hidden task runs the stable launcher every minute with limited rights', () => {
	const w = { ...p, node: 'C:\\Program Files\\nodejs\\node.exe', cli: 'C:\\d\\src\\cli.ts', local: 'C:\\Users\\a\\.delegate', pathEnv: 'C:\\Windows' }
	const l = launcher(w, true)
	assert.match(l.body, /^@echo off\r\nset "PATH=C:\\Windows"\r\nset "DELEGATE_LOCAL=C:\\Users\\a\\.delegate"\r\n"C:\\Program Files\\nodejs\\node\.exe" "C:\\d\\src\\cli\.ts" tick >> /)
	assert.equal(hiddenVbs('C:\\x\\t.cmd'), 'CreateObject("WScript.Shell").Run """C:\\x\\t.cmd""", 0, False\r\n')
	const s = registerScript("C:\\Users\\o'neil\\t.vbs")
	assert.match(s, /-Argument '\/\/B \/\/Nologo "C:\\Users\\o''neil\\t\.vbs"'/)
	assert.match(s, /-RepetitionInterval \(New-TimeSpan -Minutes 1\)/)
	assert.match(s, /-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable/)
	assert.match(s, /-MultipleInstances IgnoreNew/)
	assert.match(s, /-LogonType Interactive -RunLevel Limited/)
	assert.match(s, /Register-ScheduledTask -TaskName 'Delegate Runner'/)
})

test('R-SET-03 macOS launcher paths with apostrophes stay valid shell', () => {
	const l = launcher({ ...p, local: "/Users/o'neil/.delegate", cli: "/Users/o'neil/delegate/src/cli.ts" }, false)
	assert.match(l.body, /export DELEGATE_LOCAL='\/Users\/o'\\''neil\/\.delegate'/)
	if (process.platform !== 'win32') {
		const f = join(mkdtempSync(join(tmpdir(), 'sh-')), 'l.sh')
		writeFileSync(f, l.body)
		execFileSync('sh', ['-n', f])
	}
})
