import { isWarm, warm, type Loader } from '../components/preloadable.ts'

// Every view's code, in one place, so the page can load it before it is needed (spec S6).
export const NEW_VIEWS = {
	now: () => import('../features/Now.tsx'),
	done: () => import('../features/Done.tsx'),
	numbers: () => import('../features/Numbers.tsx'),
	settings: () => import('../features/Settings.tsx'),
	knowledge: () => import('../features/Knowledge.tsx'),
}
export const CLASSIC_VIEWS = {
	app: () => import('../classic/Classic.tsx'),
	done: () => import('../classic/Done.tsx'),
	numbers: () => import('../classic/Numbers.tsx'),
	settings: () => import('../classic/Settings.tsx'),
	knowledge: () => import('../classic/Knowledge.tsx'),
}
const loaders = (classic: boolean) => Object.values(classic ? CLASSIC_VIEWS : NEW_VIEWS) as unknown as Loader[]

// The code of one experience; failures are left for the view itself to report when it is opened.
export const warmExperience = (classic: boolean) => Promise.all(loaders(classic).map(load => warm(load).catch(() => undefined)))
// Classic is ready once its shell is; New's shell is always loaded, and Now is its first view.
export const experienceReady = (classic: boolean) => isWarm((classic ? CLASSIC_VIEWS.app : NEW_VIEWS.now) as unknown as Loader)
