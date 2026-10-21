import '@testing-library/jest-dom/vitest'
import { configure, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false }), writable: true })
configure({ reactStrictMode: true })
afterEach(cleanup)
