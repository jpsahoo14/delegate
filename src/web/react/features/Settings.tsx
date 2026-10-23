import { Button } from '../components/ui/button.tsx'
import { useSetting, useSettings, useSettingsDrafts } from '../data/screens.ts'
import type { Settings as SettingsData } from '../domain/screens.ts'
import { useEffect } from 'react'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { useEntities, useSnapshot } from '../data/hooks.ts'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'
import { CheckNow } from './CheckNow.tsx'

function Setting({ row }: { row: SettingsData['rows'][number] }) {
	const state = useSetting(row), id = `set-${row.key}`
	const options = row.options ?? (row.kind === 'bool' || row.kind === 'switch' ? [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] : undefined)
	if (row.kind === 'switch') return <div className="setting-row setting-switch" id={`setting-${row.key}`}><div><h3 id={`${id}-label`}>{row.label}</h3><p id={`${id}-help`} className="muted">{row.help}</p></div>
		<Button variant="ghost" role="switch" aria-checked={state.value === 'true'} aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} disabled={state.busy} onClick={state.toggle}><span>{state.busy ? 'Saving...' : state.value === 'true' ? 'On' : 'Off'}</span><span className="setting-switch-track" aria-hidden="true"><i /></span></Button>
		{state.text && <p role={state.error ? 'alert' : 'status'}>{state.text}</p>}
	</div>
	return <div className="setting-row" id={`setting-${row.key}`}><label className="field-label" htmlFor={id}><strong>{row.label}</strong><small>{row.help}</small>
		{options ? <select id={id} value={state.value} onChange={event => state.setValue(event.target.value)}>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> :
			row.kind === 'text' ? <textarea id={id} value={state.value} onChange={event => state.setValue(event.target.value)} rows={4} /> :
				<input id={id} value={state.value} inputMode={row.kind === 'number' ? 'numeric' : undefined} onChange={event => state.setValue(event.target.value)} />}
	</label><div className="action-bar"><Button variant={state.changed ? 'default' : 'outline'} disabled={!state.changed || state.busy} onClick={state.save}>{state.busy ? 'Saving...' : 'Save'}</Button>
		{row.key === 'pollIdle' && <CheckNow />}
		{state.changed && <small>Not saved yet</small>}</div>
		{state.text && <p role={state.error ? 'alert' : 'status'} className={state.error ? 'error setting-result' : 'setting-result'}>{state.text}</p>}
	</div>
}
export default function Settings() {
	const query = useSettings(), { route, href } = useScreenNavigation(), data = query.data
	const entities = useEntities(), snapshot = useSnapshot()
	const details = snapshot?.classic?.details
	const drafts = useSettingsDrafts(state => state.drafts)
	useEffect(() => {
		const id = route.split('/')[1]
		const target = id && data ? document.getElementById(`setting-${id}`) : undefined
		if (target) {
			const fold = target.closest('details')
			if (fold instanceof HTMLDetailsElement) fold.open = true
			target.scrollIntoView({ block: 'start' })
			target.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')?.focus({ preventScroll: true })
		}
	}, [route, !!data])
	if (query.error && !data) return <><h1>Settings</h1><p role="alert">{query.error.message}</p><Button onClick={() => void query.refetch()}>Try again</Button></>
	if (!data) return <><h1>Settings</h1><p role="status">Loading settings...</p></>
	const sections = [['learned', 'What it knows'], ['you', 'You and your replies'], ['replies', 'Automatic replies'], ['timing', 'Reminders and summary'], ['system', 'Updates and system']]
	const sub = route.split('/')[1], here = data.rows.find(row => row.key === sub)?.section ?? sub
	const switches = data.rows.filter(row => row.kind === 'switch')
	const unsaved = new Set<string>(data.rows.filter(row => drafts[row.key] !== undefined && drafts[row.key] !== row.value).map(row => row.advanced ? 'system' : row.section))
	const marker = (id: string) => unsaved.has(id) && <span className="unsaved-marker" role="img" aria-label="Unsaved changes" />
	return <div className="new-settings"><h1>Settings</h1><p className="settings-intro">Saved to the config in your storage folder, so every machine uses them from the next cycle.</p>{query.error && <div role="alert"><p>Could not refresh Settings. Your current fields and edits are kept: {query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}<nav className="settings-index" aria-label="Settings sections">{sections.map(([id, label]) => <a key={id} aria-current={here === id ? 'location' : undefined} href={href(`settings/${id}`)}>{label}{id === 'learned' && data.about.suggestions.length > 0 && <span className="count">{data.about.suggestions.length}</span>}{marker(id)}</a>)}</nav>
		{sections.map(([id, label]) => <section className="settings-section" id={`setting-${id}`} key={id}><h2>{id === 'learned' ? `What ${NAME} knows about you` : label}{marker(id)}</h2>
			{id === 'learned' && <>
				<p className="muted">Ask your AI chat &quot;what do you know about me?&quot; for the same list. To change a rule you wrote, say &quot;change my rules&quot; there.</p>
				{data.about.suggestions.length > 0 && <><h3>Suggestions</h3><div className="settings-rows">{data.about.suggestions.map(suggestion => {
					const actions = snapshot?.settingsActions?.[suggestion.code]?.map(id => entities.actions[id]).filter(Boolean) ?? []
					return <div className="setting-row" data-code={suggestion.code} key={suggestion.code}><strong>{suggestion.text}</strong><small>{suggestion.does}</small><small>Evidence: {suggestion.evidence}</small><div className="action-bar">{actions.map(action => <ActionButton key={action.id} action={action} primary={action.kind === 'accept-habit'} />)}</div>{actions[0] && <ActionState item={actions[0].item} rev={actions[0].rev} />}</div>
				})}</div></>}
				<h3>Standing instructions</h3><div className="settings-rows">{data.about.rules.length ? data.about.rules.map((rule, n) => {
					const actions = rule.code ? snapshot?.settingsActions?.[rule.code]?.map(id => entities.actions[id]).filter(Boolean) ?? [] : []
					return <div className="setting-row" key={n}><strong>{rule.text}</strong>{rule.who && <small>For: {rule.who}</small>}<small>{rule.learned ?? 'You said this.'}{rule.held ? ' · On hold' : ''}</small><div className="action-bar">{actions.map(action => <ActionButton key={action.id} action={action} />)}</div>{actions[0] && <ActionState item={actions[0].item} rev={actions[0].rev} />}</div>
				}) : <p className="setting-row muted">None: every reply waits for your ok.</p>}</div>
				{data.about.chats.length > 0 && <><h3>Chats you marked</h3><div className="settings-rows">{data.about.chats.map((chat, n) => <div className="setting-row" key={n}><strong>{chat.name}</strong><small>{chat.says}</small><div className="action-bar">{chat.actionIds?.filter(id => entities.actions[id]).map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>{chat.actionIds?.[0] && entities.actions[chat.actionIds[0]] && <ActionState item={entities.actions[chat.actionIds[0]].item} rev={entities.actions[chat.actionIds[0]].rev} />}</div>)}</div></>}
				<h3>Learning</h3>
			</>}
			{id === 'replies' && <p className="muted">Replies go out by themselves only for your <a href={href('settings/learned')}>standing instructions</a>. These limits apply to every one.</p>}
			<div className="settings-rows">{data.rows.filter(row => row.section === id && !row.advanced && row.kind !== 'switch').map(row => <Setting key={row.key} row={row} />)}</div>
			{id === 'you' && switches.length > 0 && <><h3>Changes {NAME} may propose</h3><p className="muted">Each one waits for your ok on its item. Turning one off edits only this list, never your items: an ok on a change it no longer allows is refused, even one approved but not made yet. Deploys follow "Where {NAME} may deploy" above.</p><div className="settings-rows">{switches.map(row => <Setting key={row.key} row={row} />)}</div></>}
			{id === 'system' && <><h3>AI models</h3><section className="settings-rows"><div className="setting-row"><strong>{data.models.set}</strong>{data.models.lines.map((line, n) => <span key={n}>{line}</span>)}<small>From the last 7 days, on every machine. To choose a model, open More, then AI model.</small></div></section>
				<details className="settings-more"><summary>More</summary><div className="settings-rows">{data.rows.filter(row => row.advanced).map(row => <Setting key={row.key} row={row} />)}</div>
					{details && <><h3>Details</h3><div className="settings-rows"><div className="setting-row" data-settings-runner><strong>Runner</strong><small>{details.runner}</small><div className="action-bar"><CheckNow showState={false} /></div></div><div className="setting-row"><strong>Today&apos;s log, newest first</strong><pre className="settings-log">{details.log.join('\n') || 'Nothing yet.'}</pre></div></div></>}
					<h3>Changed by setup</h3><div className="settings-rows">{data.fixed.map((row, n) => <div className="setting-row" key={n}><strong>{row.label}</strong><span>{row.value}</span><small>{row.how}</small></div>)}</div></details></>}
		</section>)}
	</div>
}
