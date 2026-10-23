import { StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './app.css'
import { PreviewBoundary, Recovery } from './Recovery.tsx'
import { startEarlySnapshot } from './services/api.ts'

const client = new QueryClient()
const root = document.getElementById('react-root')
if (!root) throw new Error('The React preview root is missing.')
// The page data, the app's code, and the first view's code load together, and the app renders once its code is here: a lazy
// app behind a fallback was revealed 300 ms late, and only then asked for the data (bug 10-23 perf).
const classic = location.hash.startsWith('#classic/')
const views = classic
	? [() => import('./classic/Classic.tsx'), () => import('./classic/Done.tsx'), () => import('./classic/Numbers.tsx'), () => import('./classic/Settings.tsx'), () => import('./classic/Knowledge.tsx')]
	: [() => import('./features/Now.tsx'), () => import('./features/Done.tsx'), () => import('./features/Numbers.tsx'), () => import('./features/Settings.tsx'), () => import('./features/Knowledge.tsx')]
const first = classic ? 0 : Math.max(0, ['now', 'done', 'numbers', 'settings', 'knowledge'].indexOf(location.hash.slice(1).split('/')[0]))
const page = startEarlySnapshot()
void views[first]().catch(() => undefined)
const render = (node: ReactNode) => createRoot(root).render(<StrictMode><PreviewBoundary><QueryClientProvider client={client}><Suspense fallback={<Recovery />}>{node}</Suspense></QueryClientProvider></PreviewBoundary></StrictMode>)
import('./App.tsx').then(({ App }) => render(<App />), (error: unknown) => { console.error('React preview could not load:', error); render(<Recovery failed />) })
// This experience's other views load once the page is shown, so a first switch to one does not wait for its code.
void page.catch(() => undefined).finally(() => setTimeout(() => { for (const view of views) void view().catch(() => undefined) }, 0))
