import { readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { ROOT } from '../paths.ts'

type Entry = { file: string; css?: string[]; assets?: string[] }
const directory = (root: string) => join(root, 'dist', 'web-react')
// The saved read-only snapshot's page: one built file (scripts/build.ts) with its script, its stylesheet and a place for the
// page data. Each snapshot carries all three compressed (raw deflate, then base64), which keeps a synced file small; base64
// has no "<", so no text in the data (a message saying "</script>") can end its script early.
export const SNAPSHOT_TEMPLATE = join('dist', 'web-snapshot', 'snapshot.html')
const SNAPSHOT_DATA = '<script id="delegate-snapshot" type="application/json">__SNAPSHOT__</script>'
const APP = /<script type="module" id="delegate-snapshot-app">([\s\S]*?)<\/script>/, STYLE = /<style id="delegate-snapshot-style">([\s\S]*?)<\/style>/
const packed = (id: string, text: string) => `<script id="${id}" type="application/octet-stream">${deflateRawSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64')}</script>`
// Inflates the three in the browser, then starts the page on Classic's snapshot screen with the data in place. It needs no
// server and no request, so it opens from a file on any machine.
const LOADER = `<script>(async()=>{const read=async id=>new Response(new Blob([Uint8Array.from(atob(document.getElementById(id).textContent),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();try{const[app,style,data]=await Promise.all(['delegate-snapshot-app','delegate-snapshot-style','delegate-snapshot'].map(read));const s=document.createElement('style');s.textContent=style;document.head.append(s);window.DELEGATE_SNAPSHOT=JSON.parse(data);history.replaceState(null,'',location.pathname+location.search+'#classic/snapshot');await import(URL.createObjectURL(new Blob([app],{type:'text/javascript'})))}catch(e){document.getElementById('react-root').textContent='This snapshot could not be opened in this browser: '+e}})()</script>`
// The page around the data is compressed once per template, not on every write.
let shell: { key: string; html: string } | undefined
export function snapshotPage(snapshot: unknown, root = ROOT): string {
	const file = join(root, SNAPSHOT_TEMPLATE), key = `${file}:${statSync(file).mtimeMs}`
	if (shell?.key !== key) {
		const template = readFileSync(file, 'utf8'), app = APP.exec(template), style = STYLE.exec(template), end = template.lastIndexOf('</body>')
		if (!app || !style || end < 0 || !template.includes(SNAPSHOT_DATA)) throw new Error(`${SNAPSHOT_TEMPLATE} is not a snapshot page template.`)
		const html = template.slice(0, end).replace(app[0], () => packed('delegate-snapshot-app', app[1])).replace(style[0], () => packed('delegate-snapshot-style', style[1]))
		shell = { key, html: `${html}${LOADER}${template.slice(end)}` }
	}
	return shell.html.replace(SNAPSHOT_DATA, () => packed('delegate-snapshot', JSON.stringify(snapshot)))
}
export function reactAssets(root = ROOT): Set<string> {
	const manifest = JSON.parse(readFileSync(join(directory(root), '.vite', 'manifest.json'), 'utf8')) as Record<string, Entry>
	return new Set(Object.values(manifest).flatMap(e => [e.file, ...(e.css ?? []), ...(e.assets ?? [])]))
}

// experience: which of New and Classic opens when the address names no screen (saved per machine).
export function reactPage(token: string, root = ROOT, experience: 'new' | 'classic' = 'new'): string {
	reactAssets(root)
	return readFileSync(join(directory(root), 'index.html'), 'utf8').replaceAll('__PAGE_TOKEN__', encodeURIComponent(token)).replace(/<html\b/, `<html data-experience="${experience === 'classic' ? 'classic' : 'new'}"`).replace(
		/(src|href)="\.\/([^"]+)"/g,
		(_, attribute: string, file: string) => `${attribute}="/web-react/${file}?t=${encodeURIComponent(token)}"`,
	)
}

export function reactAsset(path: string, token: string, root = ROOT): { content: string; type: string } | undefined {
	const assets = reactAssets(root)
	if (!assets.has(path)) return undefined
	const js = path.endsWith('.js'), css = path.endsWith('.css')
	if (!js && !css) return undefined
	let content = readFileSync(join(directory(root), path), 'utf8')
	// Vite's relative dynamic imports and preload dependencies must carry the same
	// page token as the entry. Rewrite only files owned by the build manifest.
	if (js) for (const file of assets) for (const value of [file, `./${basename(file)}`, `../${file}`]) {
		for (const quote of ['"', "'", '`']) content = content.replaceAll(`${quote}${value}${quote}`, `${quote}${value}?t=${encodeURIComponent(token)}${quote}`)
	}
	return { content, type: js ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }
}
