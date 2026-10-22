import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-react-installed-local-'))
process.env.DELEGATE_NO_KICK = '1'
const { Store } = await import('../src/store/state.ts')
const { seedNext } = await import('./fixture.ts')

test('React preview distribution: the installed bundle serves without node_modules or development tools', async () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-react-installed-'))
	cpSync('dist', join(root, 'dist'), { recursive: true })
	writeFileSync(join(root, 'package.json'), '{"type":"module","version":"0.2.0"}')
	const store = seedNext(new Store({ root: mkdtempSync(join(tmpdir(), 'delegate-react-installed-store-')), machine: 'installed' }))
	store.saveUi('react')
	const port = await new Promise<number>(resolve => {
		const socket = createServer().listen(0, '127.0.0.1', () => {
			const address = socket.address()
			assert.ok(address && typeof address !== 'string')
			socket.close(() => resolve(address.port))
		})
	})
	const token = randomBytes(16).toString('hex')
	writeFileSync(join(root, 'local.json'), JSON.stringify({ root: store.root, machine: 'installed' }))
	const child = spawn(process.execPath, [join(root, 'dist/delegate.mjs'), 'open'], {
		cwd: root,
		env: { ...process.env, DELEGATE_PAGE: `${port}:${token}`, DELEGATE_ROOT: store.root, DELEGATE_LOCAL: root },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let log = ''
	child.stdout.on('data', data => { log += String(data) })
	child.stderr.on('data', data => { log += String(data) })
	const url = `http://127.0.0.1:${port}/?t=${token}`
	const browser = await chromium.launch({ channel: 'chrome', headless: true })
	try {
		let ready = false
		for (let n = 0; n < 100 && child.exitCode === null; n++) {
			try { ready = (await fetch(url)).ok } catch (error) {
				if (!(error instanceof TypeError)) throw error
			}
			if (ready) break
			await new Promise(resolve => setTimeout(resolve, 50))
		}
		assert.ok(ready, `Installed server did not become ready: ${log}`)
		const page = await browser.newPage()
		await page.goto(url)
		await page.getByRole('heading', { name: 'Now', exact: true }).waitFor()
		renameSync(join(root, 'dist/web-react'), join(root, 'dist/web-react-unavailable'))
		const response = await page.goto(url)
		assert.equal(response!.status(), 200)
		await page.getByRole('alert').filter({ hasText: 'React preview unavailable' }).waitFor()
		await page.locator('#app[data-ui=next] #now-move').waitFor()
	} finally {
		await browser.close()
		child.kill()
		await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()) })
	}
})
