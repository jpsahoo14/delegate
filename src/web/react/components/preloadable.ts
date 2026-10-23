import { createElement, lazy, useState, type ComponentType } from 'react'

// A view whose code can load before it is shown. Once loaded it renders at once, with no Suspense fallback: React holds a
// lazy view behind its fallback for 300 ms even when the code is already here (spec S6, bug 10-23 perf).
type Module = { default: ComponentType<never> }
export type Loader = () => Promise<Module>
const cache = new Map<Loader, { pending?: Promise<Module>; loaded?: ComponentType<never> }>()

export function warm(load: Loader): Promise<Module> {
	let state = cache.get(load)
	if (!state) cache.set(load, state = {})
	const entry = state
	return entry.pending ??= load().then(module => { entry.loaded = module.default; return module }, (error: unknown) => { entry.pending = undefined; throw error })
}
export const isWarm = (load: Loader) => !!cache.get(load)?.loaded

export function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
	const loader = load as unknown as Loader
	const Lazy = lazy(() => warm(loader) as unknown as Promise<{ default: ComponentType<P> }>)
	// Chosen once per mount, so a view never switches between the lazy and the direct form while it is on screen.
	return function View(props: P) {
		const [direct] = useState(() => cache.get(loader)?.loaded as ComponentType<P> | undefined)
		return direct ? createElement(direct, props) : createElement(Lazy, props)
	}
}
