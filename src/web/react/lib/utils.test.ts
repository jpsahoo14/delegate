import { expect, it } from 'vitest'
import { cn } from './utils.ts'

it('combines conditional classes and lets callers override conflicting Tailwind utilities', () => {
	expect(cn('px-2 py-1', false, undefined, { hidden: false, block: true }, ['px-6'])).toBe('py-1 block px-6')
})
