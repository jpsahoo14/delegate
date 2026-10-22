import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { NAME } from './src/brand.ts'

export default defineConfig({
	root: 'src/web/react',
	base: './',
	define: { __APP_NAME__: JSON.stringify(NAME) },
	plugins: [
		tailwindcss(),
		{
			name: 'react-client-boundary',
			transformIndexHtml(html) { return html.replaceAll('%APP_NAME%', NAME) },
			moduleParsed(info) {
				const source = info.id.replaceAll('\\', '/')
				if (source.includes('/src/') && !source.includes('/node_modules/') && !source.includes('/src/web/react/')) {
					this.error(`React client may only use src/web/react/: imports ${source.slice(source.indexOf('/src/') + 1)}`)
				}
			},
			generateBundle(_options, bundle) {
				for (const file of Object.keys(bundle)) if (!/\.(?:js|css|html|json)$/.test(file)) {
					this.error(`Unsupported React asset: ${file}. Token-safe serving supports JavaScript and CSS only.`)
				}
			},
		},
	],
	resolve: { alias: { '@': fileURLToPath(new URL('./src/web/react', import.meta.url)) } },
	build: {
		outDir: '../../../dist/web-react',
		emptyOutDir: true,
		manifest: true,
		sourcemap: false,
	},
})
