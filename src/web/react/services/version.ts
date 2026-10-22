export type Version = 'classic' | 'new' | 'react'

export function recoveryHref(): string {
	return `/?ui=new&t=${encodeURIComponent(new URLSearchParams(location.search).get('t') ?? '')}`
}

export async function switchVersion(ui: Version): Promise<void> {
	const token = new URLSearchParams(location.search).get('t') ?? ''
	const response = await fetch(`/ui?t=${encodeURIComponent(token)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ui }),
	})
	if (!response.ok) throw new Error('Could not switch versions. Your current version is unchanged.')
	const body: unknown = await response.json()
	if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) {
		throw new Error('Could not switch versions. Your current version is unchanged.')
	}
	try { localStorage.setItem('delegate-ui', JSON.stringify({ ui, at: new Date().toISOString() })) } catch { /* Storage is optional. */ }
	location.reload()
}
