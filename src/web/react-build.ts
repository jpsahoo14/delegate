import { readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { ROOT } from '../paths.ts'

type Entry = { file: string; css?: string[]; assets?: string[] }
const directory = (root: string) => join(root, 'dist', 'web-react')
export function reactAssets(root = ROOT): Set<string> {
	const manifest = JSON.parse(readFileSync(join(directory(root), '.vite', 'manifest.json'), 'utf8')) as Record<string, Entry>
	return new Set(Object.values(manifest).flatMap(e => [e.file, ...(e.css ?? []), ...(e.assets ?? [])]))
}

export function reactPage(token: string, root = ROOT): string {
	reactAssets(root)
	return readFileSync(join(directory(root), 'index.html'), 'utf8').replaceAll('__PAGE_TOKEN__', encodeURIComponent(token)).replace(
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
