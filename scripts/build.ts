import { build } from 'esbuild'
import { BUNDLE, PAGE, checkInputs } from './build-options.ts'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'

// One file with every dependency inside, so a plugin install runs with no npm install (dev-spec/distribution.md).
await build(BUNDLE)
// The MCP Apps client is inlined into the panel at run time, so it ships next to the bundle.
copyFileSync(createRequire(import.meta.url).resolve('@modelcontextprotocol/ext-apps/app-with-deps'), 'dist/ext-apps.js')
mkdirSync('dist/web', { recursive: true })
// The page: its stylesheet as is, and its TypeScript bundled to the one script the shell inlines (B37).
for (const f of readdirSync('src/web/app')) if (f.endsWith('.css')) copyFileSync(join('src/web/app', f), join('dist/web', f))
// Built in memory and checked before it is written, so a page that would carry server code never reaches dist/.
const page = await build({ ...PAGE, outfile: 'dist/web/app.js', write: false })
checkInputs(page.metafile!)
writeFileSync('dist/web/app.js', page.outputFiles![0].text)

// The preview is built at release time; the installed runtime never imports Vite.
const { build: buildReact } = await import('vite')
await buildReact({ configFile: join(import.meta.dirname, '..', 'vite.config.ts'), root: join(process.cwd(), 'src/web/react'), build: { outDir: join(process.cwd(), 'dist/web-react') } })

// The session extension runs inside the Copilot CLI, which loads it from its own folder (research/cross-session-opus.md).
mkdirSync('dist/mesh', { recursive: true })
for (const f of ['extension.mjs', 'inbox.mjs']) copyFileSync(join('src/mesh', f), join('dist/mesh', f))

// A hash per shipped file; doctor checks them (learning 02).
const files = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p] })
const shipped = [...files('dist'), ...files('skills'), '.mcp.json', '.claude-plugin/plugin.json'].filter(f => !f.endsWith('INTEGRITY.json'))
const hashes = Object.fromEntries(shipped.sort().map(f => [relative('.', f).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex')]))
writeFileSync('INTEGRITY.json', JSON.stringify({ version: JSON.parse(readFileSync('package.json', 'utf8')).version, files: hashes }, null, '\t') + '\n')
console.log(`Built dist/delegate.mjs and INTEGRITY.json (${shipped.length} files).`)
