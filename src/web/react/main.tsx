import { StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './app.css'
import { PreviewBoundary, Recovery } from './Recovery.tsx'
import { startEarlySnapshot } from './services/api.ts'
import { CLASSIC_VIEWS, NEW_VIEWS, warmExperience } from './data/views.ts'
import { warm } from './components/preloadable.ts'

const client = new QueryClient()
const root = document.getElementById('react-root')
if (!root) throw new Error('The React preview root is missing.')
// The page data, the app's code, and the first view's code load together, and the app renders once its code is here: a lazy
// app behind a fallback was revealed 300 ms late, and only then asked for the data (bug 10-23 perf).
const classic = location.hash.startsWith('#classic/')
const route = location.hash.slice(1).split('/')[0] as keyof typeof NEW_VIEWS
void warm(classic ? CLASSIC_VIEWS.app : NEW_VIEWS[route] ?? NEW_VIEWS.now).catch(() => undefined)
const page = startEarlySnapshot()
const render = (node: ReactNode) => createRoot(root).render(<StrictMode><PreviewBoundary><QueryClientProvider client={client}><Suspense fallback={<Recovery />}>{node}</Suspense></QueryClientProvider></PreviewBoundary></StrictMode>)
import('./App.tsx').then(({ App }) => render(<App />), (error: unknown) => { console.error('React preview could not load:', error); render(<Recovery failed />) })
// Once the page is shown: this experience's other views, then, when the browser is idle and at most 3 s later, the other
// experience, so no first switch waits for code (spec S6).
const idle = (run: () => void) => 'requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 1000)
void page.catch(() => undefined).finally(() => setTimeout(() => { void warmExperience(classic).finally(() => idle(() => void warmExperience(!classic))) }, 0))
