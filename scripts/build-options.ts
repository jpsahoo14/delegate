import type { BuildOptions } from 'esbuild'

// Shared by the build and by the test that checks the committed bundle is current.
export const BUNDLE: BuildOptions = {
	// preserveSymlinks: a linked node_modules must not put this machine's real paths into the bundle (publish scan).
	entryPoints: ['src/cli.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'dist/delegate.mjs', preserveSymlinks: true,
	banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }, logLevel: 'warning',
}

// The page's one script, built from src/web/app/app.ts.
export { PAGE, checkInputs } from '../src/web/page-bundle.ts'
