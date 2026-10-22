import '@testing-library/jest-dom/vitest'
import { configure, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false }), writable: true })
Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true })
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => {}, writable: true })
Object.defineProperty(globalThis, 'IntersectionObserver', { value: class {
	observe() {}
	unobserve() {}
	disconnect() {}
}, writable: true })
configure({ reactStrictMode: true })
afterEach(cleanup)
