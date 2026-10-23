import { build } from 'esbuild'
import { BUNDLE } from './build-options.ts'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

// One file with every dependency inside, so a plugin install runs with no npm install (dev-spec/distribution.md).
await build(BUNDLE)

// The React page is built at release time; the installed runtime never imports Vite.
const { build: buildReact } = await import('vite')
await buildReact({ configFile: join(import.meta.dirname, '..', 'vite.config.ts'), root: join(process.cwd(), 'src/web/react'), build: { outDir: join(process.cwd(), 'dist/web-react') } })

// The saved read-only snapshot (inbox.html) opens from a file with no server, so its page is one file: one script and one
// stylesheet, built without code splitting and written inline. Anything else stops the build rather than ship a broken copy.
// This template stays plain so the build is the same on every machine; each snapshot compresses it when written
// (snapshotPage in src/web/react-build.ts).
const snapTmp = join(process.cwd(), 'dist', '.web-snapshot-build')
const snapshotViews = join(process.cwd(), 'src/web/react/data/views-snapshot.ts')
await buildReact({
	configFile: join(import.meta.dirname, '..', 'vite.config.ts'), root: join(process.cwd(), 'src/web/react'), logLevel: 'warn',
	plugins: [{
		// A snapshot draws only Classic's snapshot screen, so the other views' code stays out of it.
		name: 'snapshot-views', enforce: 'pre',
		async resolveId(source, importer, options) {
			const found = await this.resolve(source, importer, { ...options, skipSelf: true })
			return found?.id.replaceAll('\\', '/').endsWith('/src/web/react/data/views.ts') ? snapshotViews : null
		},
	}],
	build: { outDir: snapTmp, emptyOutDir: true, manifest: false, cssCodeSplit: false, rollupOptions: { input: join(process.cwd(), 'src/web/react/snapshot.html'), output: { inlineDynamicImports: true } } },
})
{
	const built = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? built(p) : [p] })
	let html = readFileSync(join(snapTmp, 'snapshot.html'), 'utf8')
	const scripts = [...html.matchAll(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g)], styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g)]
	const outputs = built(snapTmp).map(f => relative(snapTmp, f).replaceAll('\\', '/')).filter(f => f !== 'snapshot.html')
	const used = [...scripts, ...styles].map(m => m[1])
	if (scripts.length !== 1 || styles.length > 1 || outputs.some(f => !used.includes(f)) || /modulepreload/.test(html)) throw new Error(`The snapshot page must build to one script and at most one stylesheet; it built ${outputs.join(', ')}.`)
	const js = readFileSync(join(snapTmp, scripts[0][1]), 'utf8')
	if (js.includes('<!--')) throw new Error('The snapshot script contains "<!--", which cannot be inlined safely.')
	html = html.replace(scripts[0][0], () => `<script type="module" id="delegate-snapshot-app">${js.replaceAll('</script', '<\\/script')}</script>`)
	if (styles[0]) html = html.replace(styles[0][0], () => `<style id="delegate-snapshot-style">${readFileSync(join(snapTmp, styles[0][1]), 'utf8').replaceAll('</style', '<\\/style')}</style>`)
	mkdirSync('dist/web-snapshot', { recursive: true })
	writeFileSync('dist/web-snapshot/snapshot.html', html)
	rmSync(snapTmp, { recursive: true, force: true })
}

// The session extension runs inside the Copilot CLI, which loads it from its own folder (research/cross-session-opus.md).
mkdirSync('dist/mesh', { recursive: true })
for (const f of ['extension.mjs', 'inbox.mjs']) copyFileSync(join('src/mesh', f), join('dist/mesh', f))

// A hash per shipped file; doctor checks them (learning 02).
const files = (d: string): string[] => readdirSync(d).filter(f => f !== '.DS_Store').flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p] })
const shipped = [...files('dist'), ...files('skills'), '.mcp.json', '.claude-plugin/plugin.json'].filter(f => !f.endsWith('INTEGRITY.json'))
const hashes = Object.fromEntries(shipped.sort().map(f => [relative('.', f).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex')]))
writeFileSync('INTEGRITY.json', JSON.stringify({ version: JSON.parse(readFileSync('package.json', 'utf8')).version, files: hashes }, null, '\t') + '\n')
console.log(`Built dist/delegate.mjs and INTEGRITY.json (${shipped.length} files).`)
