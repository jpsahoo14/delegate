import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui/button.tsx'
import type { Settings } from '../domain/screens.ts'
import { saveSetting } from '../services/api.ts'

export function CodeFolders({ data, classic = false }: { data: NonNullable<Settings['code']>; classic?: boolean }) {
	const [folder, setFolder] = useState(''), client = useQueryClient()
	const mutation = useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) => saveSetting(key, value),
		async onSuccess(result, submitted) {
			if (!result.ok) return
			if (submitted.key === 'code-add') setFolder(current => current === submitted.value ? '' : current)
			await client.invalidateQueries({ queryKey: ['settings'] })
		},
	})
	const save = (key: string, value = '') => mutation.mutate({ key, value })
	const text = mutation.error?.message ?? mutation.data?.text, error = !!mutation.error || mutation.data?.ok === false
	return <div id="setting-codeFolders" className={classic ? 'ct-setting-row' : 'setting-row'}>
		<h3>Where your code is on this computer</h3>
		<p className={classic ? 'ct-muted' : 'muted'}>{data.machine}</p>
		<p className={classic ? 'ct-muted' : 'muted'}>Saved only on this computer, not in shared config. Other computers keep their own list.</p>
		{data.folders.length ? <ul>{data.folders.map(path => <li key={path}><div className={classic ? 'ct-tool-actions' : 'action-bar'}>
			<code>{path}</code>{data.automatic && <small>Found automatically</small>}
			<Button variant="outline" disabled={mutation.isPending} aria-label={`Remove ${path}`} onClick={() => save('code-remove', path)}>Remove</Button>
		</div></li>)}</ul> : <><p>No folders: Delegate won't look for your code on this computer.</p>
			{!data.automatic && <Button variant="outline" disabled={mutation.isPending} onClick={() => save('code-found')}>Use found folders again</Button>}</>}
		<form onSubmit={event => { event.preventDefault(); save('code-add', folder) }}>
			<label htmlFor="code-folder-path">Add a code folder on this computer</label>
			<input id="code-folder-path" value={folder} onChange={event => setFolder(event.target.value)} placeholder={data.example} />
			<div className={classic ? 'ct-tool-actions' : 'action-bar'}><Button type="submit" variant="outline" disabled={!folder.trim() || mutation.isPending}>Add folder</Button></div>
		</form>
		<h4>Repositories found</h4>
		{data.clones.length ? <ul>{data.clones.flatMap(clone => clone.paths.map(path => <li key={`${clone.remote}:${path}`} title={clone.remote}><strong>{clone.name}</strong> · <code>{path}</code></li>))}</ul> : <p>No repositories found yet.</p>}
		<p className={classic ? 'ct-muted' : 'muted'}>{data.scannedAt ? <>Last checked: <time dateTime={data.scannedAt}>{new Date(data.scannedAt).toLocaleString()}</time></> : 'Not checked yet'}</p>
		<Button variant="outline" disabled={mutation.isPending} onClick={() => save('code-rescan')}>Find my clones now</Button>
		{text && <p role={error ? 'alert' : 'status'}>{text}</p>}
	</div>
}
