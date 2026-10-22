import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('release: build writes portable integrity paths and hashes the exact shipped bytes', () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-build-'))
	try {
		const files = {
			'package.json': '{"version":"0.1.0"}\n',
			'.mcp.json': '{}\n',
			'.claude-plugin/plugin.json': '{}\n',
			'src/cli.ts': 'console.log("fixture")\n',
			'src/web/app/app.css': 'body { color: black; }\n',
			'src/web/app/app.ts': 'document.title = \'fixture\'\n',
			'src/web/react/index.html': '<div id="react-root"></div><script type="module" src="./main.ts"></script>',
			'src/web/react/main.ts': 'document.title = "preview fixture"\n',
			'src/mesh/extension.mjs': 'export {}\n',
			'src/mesh/inbox.mjs': 'export {}\n',
			'skills/delegate/SKILL.md': '# Fixture\n',
		}
		for (const [file, text] of Object.entries(files)) {
			const path = join(root, ...file.split('/'))
			mkdirSync(dirname(path), { recursive: true })
			writeFileSync(path, text)
		}
		const build = fileURLToPath(new URL('../scripts/build.ts', import.meta.url))
		const result = spawnSync(process.execPath, [build], { cwd: root, encoding: 'utf8', timeout: 30_000 })
		assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
		const manifest = JSON.parse(readFileSync(join(root, 'INTEGRITY.json'), 'utf8')) as { version: string; files: Record<string, string> }
		assert.equal(manifest.version, '0.1.0')
		assert.deepEqual(Object.keys(manifest.files).sort(), [
			'.claude-plugin/plugin.json', '.mcp.json', 'dist/delegate.mjs', 'dist/ext-apps.js', 'dist/mesh/extension.mjs', 'dist/mesh/inbox.mjs', 'dist/web/app.css', 'dist/web/app.js', 'dist/web-react/.vite/manifest.json', 'dist/web-react/index.html', ...Object.keys(manifest.files).filter(p => p.startsWith('dist/web-react/assets/')), 'skills/delegate/SKILL.md',
		].sort())
		for (const [file, hash] of Object.entries(manifest.files)) {
			assert.equal(createHash('sha256').update(readFileSync(join(root, ...file.split('/')))).digest('hex'), hash)
		}
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test('release: a page that would carry server code stops the build before anything is written to dist/web', () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-build-bad-'))
	try {
		const files = {
			'package.json': '{"version":"0.1.0"}\n', '.mcp.json': '{}\n', '.claude-plugin/plugin.json': '{}\n', 'src/cli.ts': 'console.log("fixture")\n',
			'src/web/app/app.css': 'body { color: black; }\n', 'src/web/app/app.ts': "import { x } from '../../store/state.ts'\nconsole.log(x)\n", 'src/store/state.ts': 'export const x = 1\n',
			'src/mesh/extension.mjs': 'export {}\n', 'src/mesh/inbox.mjs': 'export {}\n', 'skills/delegate/SKILL.md': '# Fixture\n', 'dist/web/app.js': 'the last good page\n',
		}
		for (const [file, text] of Object.entries(files)) {
			const path = join(root, ...file.split('/'))
			mkdirSync(dirname(path), { recursive: true })
			writeFileSync(path, text)
		}
		const build = fileURLToPath(new URL('../scripts/build.ts', import.meta.url))
		const result = spawnSync(process.execPath, [build], { cwd: root, encoding: 'utf8', timeout: 30_000 })
		assert.notEqual(result.status, 0)
		assert.match(result.stderr, /may only use src\/web\/app\/.*imports src\/store\/state\.ts/)
		assert.equal(readFileSync(join(root, 'dist', 'web', 'app.js'), 'utf8'), 'the last good page\n', 'the bad page was never written')
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test('release: React cannot import server source', async () => {
	const root = mkdtempSync(join(tmpdir(), 'delegate-react-boundary-'))
	try {
		for (const [file, content] of Object.entries({
			'src/web/react/index.html': '<div></div><script type="module" src="./main.ts"></script>',
			'src/web/react/main.ts': 'import { secret } from "../../core/private.ts"; console.log(secret)',
			'src/core/private.ts': 'export const secret = "server-only"',
		})) {
			mkdirSync(dirname(join(root, file)), { recursive: true })
			writeFileSync(join(root, file), content)
		}
		const { build: viteBuild } = await import('vite')
		await assert.rejects(() => viteBuild({
			configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
			root: join(root, 'src/web/react'), logLevel: 'silent', build: { write: false },
		}), /React client may only use src\/web\/react/)
	} finally { rmSync(root, { recursive: true, force: true }) }
})

// Installs run dist/, not src/: a commit whose bundle is older than its source ships old behaviour (dogfood 10-19: the VM
// ran the 19:31 build for hours while every later change sat in src). Run "npm run build" before committing.
test('release: the committed bundle and page files are built from the current source', async () => {
	const { build } = await import('esbuild')
	const { BUNDLE } = await import('../scripts/build-options.ts')
	const root = fileURLToPath(new URL('..', import.meta.url))
	const out = await build({ ...BUNDLE, absWorkingDir: root, write: false })
	assert.ok(readFileSync(join(root, 'dist', 'delegate.mjs'), 'utf8') === out.outputFiles[0].text, 'dist/delegate.mjs is out of date: run npm run build')
	assert.equal(readFileSync(join(root, 'dist', 'web', 'app.css'), 'utf8'), readFileSync(join(root, 'src', 'web', 'app', 'app.css'), 'utf8'), 'dist/web/app.css is out of date: run npm run build')
	const { bundlePage } = await import('../src/web/page-bundle.ts')
	assert.equal(readFileSync(join(root, 'dist', 'web', 'app.js'), 'utf8'), bundlePage(root), 'dist/web/app.js is out of date: run npm run build')
	const { build: viteBuild } = await import('vite')
	const preview = await viteBuild({ configFile: join(root, 'vite.config.ts'), logLevel: 'silent', build: { write: false } })
	assert.ok(!Array.isArray(preview) && 'output' in preview)
	for (const file of preview.output) {
		const actual = readFileSync(join(root, 'dist/web-react', file.fileName))
		const expected = file.type === 'chunk' ? Buffer.from(file.code) : Buffer.from(file.source)
		assert.ok(actual.equals(expected), `dist/web-react/${file.fileName} is out of date: run npm run build`)
	}
})
