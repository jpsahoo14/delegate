import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import { useInterface } from './data/interface.ts'

describe('preview foundation', () => {
	beforeEach(() => {
		useInterface.setState({ theme: 'light', switching: false, error: undefined })
	})
	it('discloses missing functionality and offers exactly the three versions', () => {
		render(<App />)
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The same Delegate')
		expect(screen.getByText(/items and actions are not available/)).toBeVisible()
		expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Classic', 'New', 'React (preview)'])
		expect(screen.queryByRole('button', { name: /^Send/ })).not.toBeInTheDocument()
	})
	it('theme toggles without sending a request', () => {
		const fetch = vi.spyOn(globalThis, 'fetch')
		render(<App />)
		fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
		expect(document.documentElement.dataset.theme).toBe('dark')
		expect(fetch).not.toHaveBeenCalled()
		fetch.mockRestore()
	})
	it('a failed version save stays in the preview and shows an error', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":false}', { status: 422 }))
		render(<App />)
		fireEvent.change(screen.getByRole('combobox', { name: 'App version' }), { target: { value: 'new' } })
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not switch'))
		expect(screen.getByRole('combobox')).toHaveValue('react')
		expect(screen.getByRole('combobox')).toBeEnabled()
		expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ ui: 'new' })
		fetch.mockRestore()
	})
})
