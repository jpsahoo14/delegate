import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.tsx'
import { useInterface } from './data/interface.ts'
import { emptyEntities, type Snapshot } from './domain/contracts.ts'
import { useData } from './data/store.ts'
import { useNavigation } from './data/navigation.ts'

const clients: QueryClient[] = []
const snapshot = (): Snapshot => ({
	schemaVersion: 1, fetchedAt: new Date().toISOString(), now: new Date().toISOString(), owner: 'Robin', entities: emptyEntities(),
	sections: [{ id: 'move', label: 'Your move', ids: [] }], seen: {},
	status: { state: 'on', autoSend: false, runs: 0, cap: 200, reading: { state: 'ok' } },
	summary: { handled: 0, minute: { facts: 0, suggestions: 0 }, catchup: { count: 0, worth: 0 } },
})
function show() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	return render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
}
beforeEach(() => {
	sessionStorage.clear()
	useData.setState({ snapshot: undefined, entities: emptyEntities(), byRevision: {}, pinned: {}, latestResult: undefined })
	useNavigation.setState({ route: 'now', find: '', help: false, menu: false })
	useInterface.setState({ theme: 'light', switching: false, error: undefined })
	vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(snapshot()), { headers: { 'content-type': 'application/json' } }))
})
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })
describe('React workspace', () => {
	it('renders four views and offers exactly three versions', async () => {
		show()
		await screen.findByRole('heading', { level: 1, name: 'Now' })
		expect([...screen.getByRole('combobox', { name: 'App version' }).querySelectorAll('option')].map(option => option.textContent)).toEqual(['Classic', 'New', 'React (preview)'])
		expect(screen.getByRole('navigation', { name: 'Views' }).querySelectorAll('a')).toHaveLength(4)
		expect(screen.queryByRole('button', { name: /^Send/ })).not.toBeInTheDocument()
	})
	it('theme toggles without posting an action', async () => {
		show()
		await screen.findByRole('heading', { level: 1, name: 'Now' })
		fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'dark' } })
		expect(document.documentElement.dataset.theme).toBe('dark')
		expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
	})
	it('a failed version save stays in React and shows a readable error', async () => {
		show()
		await screen.findByRole('heading', { level: 1, name: 'Now' })
		vi.mocked(fetch).mockResolvedValueOnce(new Response('{"ok":false}', { status: 422 }))
		fireEvent.change(screen.getByRole('combobox', { name: 'App version' }), { target: { value: 'new' } })
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not switch'))
		expect(screen.getByRole('combobox', { name: 'App version' })).toHaveValue('react')
		expect(screen.getByRole('combobox', { name: 'App version' })).toBeEnabled()
	})
})
