// The saved read-only snapshot (inbox.html): one file that opens with no server, drawn by Classic's snapshot screen.
// The file's own loader (src/web/react-build.ts) puts the page data on window.DELEGATE_SNAPSHOT and the address on
// #classic/snapshot before this code runs. Only Classic is bundled: New's screens never draw in a snapshot.
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './app.css'
import './foundation.css'
import './workspace.css'
import './visual-new.css'
import { PreviewBoundary, Recovery } from './Recovery.tsx'
import Classic from './classic/Classic.tsx'

const root = document.getElementById('react-root')
if (!root) throw new Error('The page root is missing.')
createRoot(root).render(<StrictMode><PreviewBoundary><QueryClientProvider client={new QueryClient()}><Suspense fallback={<Recovery />}><Classic /></Suspense></QueryClientProvider></PreviewBoundary></StrictMode>)
