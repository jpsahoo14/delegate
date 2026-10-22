import { Button } from '../components/ui/button.tsx'
import { useSetting, useSettings } from '../data/screens.ts'
import type { Settings as SettingsData } from '../domain/screens.ts'
import { useEffect } from 'react'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { useEntities, useSnapshot } from '../data/hooks.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'

function Setting({ row }: { row: SettingsData['rows'][number] }) {
	const state = useSetting(row), id = `set-${row.key}`
	const options = row.options ?? (row.kind === 'bool' || row.kind === 'switch' ? [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] : undefined)
	if (row.kind === 'switch') return <div className="setting-row" id={`setting-${row.key}`}><h3 id={`${id}-label`}>{row.label}</h3><p id={`${id}-help`} className="muted">{row.help}</p>
		<Button variant="outline" role="switch" aria-checked={state.value === 'true'} aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} disabled={state.busy} onClick={state.toggle}>{state.busy ? 'Saving...' : state.value === 'true' ? 'On' : 'Off'}</Button>
		{state.text && <p role={state.error ? 'alert' : 'status'}>{state.text}</p>}
	</div>
	return <div className="setting-row" id={`setting-${row.key}`}><label className="field-label" htmlFor={id}><strong>{row.label}</strong><small>{row.help}</small>
		{options ? <select id={id} value={state.value} onChange={event => state.setValue(event.target.value)}>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> :
			row.kind === 'text' || row.kind === 'list' ? <textarea id={id} value={state.value} onChange={event => state.setValue(event.target.value)} rows={row.kind === 'text' ? 4 : 2} /> :
				<input id={id} value={state.value} inputMode={row.kind === 'number' ? 'numeric' : undefined} onChange={event => state.setValue(event.target.value)} />}
	</label><div className="action-bar"><Button variant={state.changed ? 'default' : 'outline'} disabled={!state.changed || state.busy} onClick={state.save}>{state.busy ? 'Saving...' : 'Save'}</Button>
		{state.changed && <small>Not saved yet</small>}</div>
		{state.text && <p role={state.error ? 'alert' : 'status'} className={state.error ? 'error setting-result' : 'setting-result'}>{state.text}</p>}
	</div>
}
export default function Settings() {
	const query = useSettings(), { route, href } = useScreenNavigation(), data = query.data
	const entities = useEntities(), snapshot = useSnapshot()
	useEffect(() => {
		const id = route.split('/')[1]
		const target = id && data ? document.getElementById(`setting-${id}`) : undefined
		if (target) {
			const fold = target.closest('details')
			if (fold instanceof HTMLDetailsElement) fold.open = true
			target.scrollIntoView({ block: 'start' })
			target.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')?.focus({ preventScroll: true })
		}
	}, [route, !!data])
	if (query.error && !data) return <><h1>Settings</h1><p role="alert">{query.error.message}</p><Button onClick={() => void query.refetch()}>Try again</Button></>
	if (!data) return <><h1>Settings</h1><p role="status">Loading settings...</p></>
	const sections = [['learned', 'What it knows'], ['you', 'You and your replies'], ['replies', 'Automatic replies'], ['timing', 'Reminders and summary'], ['system', 'Updates and system']]
	return <><h1>Settings</h1>{query.error && <div role="alert"><p>Could not refresh Settings. Your current fields and edits are kept: {query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}<nav className="settings-index" aria-label="Settings sections">{sections.map(([id, label]) => <a key={id} href={href(`settings/${id}`)} onClick={() => document.getElementById(`setting-${id}`)?.scrollIntoView()}>{label}</a>)}</nav>
		{sections.map(([id, label]) => <section className="settings-section" id={`setting-${id}`} key={id}><h2>{label}</h2>
			{id === 'learned' && <><h3>Standing instructions</h3>{data.about.rules.length ? data.about.rules.map((rule, n) => <div key={n}><p>{rule.text}{rule.who ? ` - ${rule.who}` : ''}{rule.held ? ' - On hold' : ''}</p>{rule.learned && <small>{rule.learned}</small>}{rule.code && snapshot?.settingsActions?.[rule.code]?.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>) : <p>Every reply waits for your approval unless you allow it.</p>}
				{data.about.chats.length > 0 && <><h3>Chats you marked</h3>{data.about.chats.map((chat, n) => <div key={n}><p>{chat.name}: {chat.says}</p>{chat.actionIds?.filter(id => entities.actions[id]).map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>)}</>}
				{data.about.suggestions.length > 0 && <><h3>Suggestions</h3>{data.about.suggestions.map(suggestion => <div key={suggestion.code}><p>{suggestion.text} - {suggestion.does}<small>Evidence: {suggestion.evidence}</small></p><div className="action-bar">{snapshot?.settingsActions?.[suggestion.code]?.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div><ActionState item={suggestion.code} rev="" /></div>)}</>}
			</>}
			{data.rows.filter(row => row.section === id && !row.advanced).map(row => <Setting key={row.key} row={row} />)}
			{id === 'system' && <><section className="item-card"><h3>AI models</h3><p>{data.models.set}</p>{data.models.lines.map((line, n) => <p key={n}>{line}</p>)}</section>
				<details><summary>More</summary>{data.rows.filter(row => row.advanced).map(row => <Setting key={row.key} row={row} />)}{data.fixed.map((row, n) => <p key={n}><strong>{row.label}:</strong> {row.value}<small>Managed during setup.</small></p>)}</details></>}
		</section>)}
	</>
}
