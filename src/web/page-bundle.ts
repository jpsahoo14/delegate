import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import type { BuildOptions, Metafile } from 'esbuild'

// The page is TypeScript in layers under src/web/app; esbuild makes it the one script the shell inlines (B37).
// Shared by the build (dist/web/app.js), the shell when running from source, and the test that the shipped file is current.
export const PAGE: BuildOptions = {
	entryPoints: ['src/web/app/app.ts'], bundle: true, format: 'iife', platform: 'browser', charset: 'utf8', legalComments: 'none', logLevel: 'warning', metafile: true,
}

// What may run in the browser: the page's own folder, and shared pure files named here. Type-only imports are erased and
// never become inputs, so the page may import types from anywhere (src/web/view.ts). Anything else would pull server code
// into the page, so the build stops.
export const PAGE_DIR = 'src/web/app/'
export const SHARED = ['src/core/whose.ts']
export function checkInputs(meta: Metafile) {
	const bad = Object.keys(meta.inputs).map(f => f.replaceAll('\\', '/')).filter(f => !f.startsWith(PAGE_DIR) && !SHARED.includes(f))
	if (bad.length) throw new Error(`The page bundle may only use ${PAGE_DIR} and ${SHARED.join(', ')}; it imports ${bad.join(', ')}. Use import type, or add a pure file to SHARED.`)
	return Object.keys(meta.inputs)
}

// From source, the page is built again when any file it was built from changes, so an edit shows on the next reload.
// esbuild is a dev dependency: it is loaded only here, never by the shipped bundle, which reads dist/web/app.js.
let last = { root: '', inputs: [] as string[], key: '', text: '' }
const keyOf = (root: string, inputs: string[]) => inputs.map(f => { const p = join(root, f); return `${f}:${existsSync(p) ? statSync(p).mtimeMs : 'gone'}` }).join('|')
export function bundlePage(root: string): string {
	if (last.root === root && last.inputs.length && keyOf(root, last.inputs) === last.key) return last.text
	const { buildSync } = createRequire(import.meta.url)('esbuild') as typeof import('esbuild')
	const out = buildSync({ ...PAGE, absWorkingDir: root, write: false })
	const inputs = checkInputs(out.metafile!).map(f => relative(root, join(root, f)))
	last = { root, inputs, key: keyOf(root, inputs), text: out.outputFiles![0].text }
	return last.text
}
// The files the page is built from, for the test that keeps them in the allowed folders.
export const pageInputs = (root: string) => { bundlePage(root); return last.inputs }
