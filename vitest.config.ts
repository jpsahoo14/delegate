import { defineConfig } from 'vitest/config'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NAME } from './src/brand.ts'

export default defineConfig({
	cacheDir: mkdtempSync(join(tmpdir(), 'delegate-vitest-cache-')),
	define: { __APP_NAME__: JSON.stringify(NAME) },
	test: {
		include: ['src/web/react/**/*.test.{ts,tsx}'],
		environment: 'jsdom',
		setupFiles: ['./src/web/react/test-setup.ts'],
	},
})
