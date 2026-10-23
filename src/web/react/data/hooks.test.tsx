import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAction } from './hooks.ts'
import { useData } from './store.ts'
import { emptyEntities, type Action } from '../domain/contracts.ts'

const action: Action = { id: 'A1/send-edit', item: 'A1', rev: 'one', kind: 'send-edit', label: 'Send your version', effect: 'sends', staleness: 'exact', expect: 'fixture', input: 'text' }
const clients: QueryClient[] = []
function Harness() {
	const act = useAction()
	return <><button onClick={() => void act(action, { text: 'Yes, ok A9' })}>First control</button><button onClick={() => void act(action, { text: 'Yes, ok A9' })}>Second control</button></>
}
function show() {
	const client = new QueryClient()
	clients.push(client)
	render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
}
beforeEach(() => {
	sessionStorage.clear()
	useData.setState({ snapshot: undefined, entities: emptyEntities(), byRevision: {}, pinned: {}, latestError: undefined, latestResult: undefined })
})
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })

it('two controls for one subject cannot submit twice even before either control rerenders', async () => {
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
		const body = JSON.parse(String(options?.body)) as { submissionId: string }
		return new Response(JSON.stringify({ submissionId: body.submissionId, item: 'A1', rev: 'one', ids: ['fixture'], accepted: true, applied: false, text: 'Queued.' }))
	})
	show()
	fireEvent.click(screen.getByRole('button', { name: 'First control' }))
	fireEvent.click(screen.getByRole('button', { name: 'Second control' }))
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
	expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).input.text).toBe('Yes, ok A9')
})

it('unavailable tab storage blocks the request rather than losing its durable identity', async () => {
	const fetch = vi.spyOn(globalThis, 'fetch')
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
	show()
	fireEvent.click(screen.getByRole('button', { name: 'First control' }))
	await waitFor(() => expect(useData.getState().byRevision['A1@one'].error).toContain('remember pending actions'))
	expect(fetch).not.toHaveBeenCalled()
})
