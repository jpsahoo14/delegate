import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './app.css'
import { PreviewBoundary, Recovery } from './Recovery.tsx'

const client = new QueryClient()
const App = lazy(() => import('./App.tsx').then(module => ({ default: module.App })))
const root = document.getElementById('react-root')
if (!root) throw new Error('The React preview root is missing.')
createRoot(root).render(<StrictMode><PreviewBoundary><QueryClientProvider client={client}><Suspense fallback={<Recovery />}><App /></Suspense></QueryClientProvider></PreviewBoundary></StrictMode>)
