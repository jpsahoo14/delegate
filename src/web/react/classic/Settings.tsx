import { useEffect } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useSetting, useSettings, useSettingsDrafts } from '../data/screens.ts'
import { useEntities, useSnapshot } from '../data/hooks.ts'
import type { Settings as SettingsData } from '../domain/screens.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { NAME } from '../brand.ts'
import { useScreenNavigation } from './navigation.tsx'
import './tools.css'
import { CheckNow } from '../features/CheckNow.tsx'
import { StyleEditor } from '../features/StyleEditor.tsx'
import { CLASSIC_LOOK, ToolsSettings } from '../features/ToolsSettings.tsx'

function Setting({ row }: { row: SettingsData['rows'][number] }) {
	const state = useSetting(row), id = `ct-set-${row.key}`
	const options = row.options ?? (row.kind === 'bool' ? [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] : undefined)
	if (row.kind === 'switch') return <div className="ct-setting-row ct-switch-row" id={`setting-${row.key}`}><div><strong id={`${id}-label`}>{row.label}</strong><p className="ct-muted" id={`${id}-help`}>{row.help}</p>{state.text && <p role={state.error ? 'alert' : 'status'}>{state.text}</p>}</div><button type="button" className="ct-switch" role="switch" aria-checked={state.value === 'true'} aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} disabled={state.busy} onClick={state.toggle}><span>{state.busy ? 'Saving...' : state.value === 'true' ? 'On' : 'Off'}</span><span className="ct-switch-track" aria-hidden="true"><i /></span></button></div>
	return <div className="ct-setting-row" id={`setting-${row.key}`}><label htmlFor={id}><strong>{row.label}</strong><span className="ct-muted">{row.help}</span></label>
		{options ? <select id={id} value={state.value} onChange={event => state.setValue(event.target.value)}>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> :
			row.kind === 'text' || row.kind === 'list' ? <textarea id={id} value={state.value} onChange={event => state.setValue(event.target.value)} rows={row.kind === 'text' ? 4 : 2} /> :
				<input id={id} value={state.value} inputMode={row.kind === 'number' ? 'decimal' : undefined} onChange={event => state.setValue(event.target.value)} />}
		<div className="ct-tool-actions"><Button variant={state.changed ? 'default' : 'outline'} disabled={!state.changed || state.busy} onClick={state.save}>{state.busy ? 'Saving...' : 'Save'}</Button>{row.key === 'pollIdle' && <CheckNow />}{state.changed && <small className="ct-muted">Not saved yet</small>}</div>{state.text && <p role={state.error ? 'alert' : 'status'}>{state.text}</p>}
	</div>
}

export default function Settings() {
	const query = useSettings('classic'), data = query.data, { route, href } = useScreenNavigation()
	const snapshot = useSnapshot(), entities = useEntities(), drafts = useSettingsDrafts(state => state.drafts)
	useEffect(() => {
		const id = route.split('/')[1], target = id && data ? document.getElementById(`setting-${id}`) : undefined
		if (target) {
			const fold = target.closest('details')
			if (fold instanceof HTMLDetailsElement) fold.open = true
			const index = target.closest('.ct-settings')?.querySelector<HTMLElement>('.ct-settings-index')
			if (index) target.style.scrollMarginTop = `${Number.parseFloat(getComputedStyle(index).top) + index.getBoundingClientRect().height + 12}px`
			target.scrollIntoView({ block: 'start' })
			target.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')?.focus({ preventScroll: true })
		}
	}, [route, !!data])
	if (!data) return <div className="ct-tools ct-settings"><header className="ct-tools-head"><h1>Settings</h1></header>{query.error ? <div role="alert"><p>Could not load Settings: {query.error.message}</p><Button onClick={() => void query.refetch()}>Try again</Button></div> : <p role="status">Loading settings...</p>}</div>
	const sections: [SettingsData['rows'][number]['section'], string][] = [['learned', 'What it knows'], ['you', 'You and your replies'], ['replies', 'Automatic replies'], ['timing', 'Reminders and summary'], ['system', 'Updates and system']]
	const sub = route.split('/')[1], current = data.rows.find(row => row.key === sub)?.section ?? (sub === 'tools' ? 'you' : sub)
	const unsaved = new Set(data.rows.filter(row => drafts[row.key] !== undefined && drafts[row.key] !== row.value).map(row => row.advanced ? 'system' : row.section))
	const marker = (id: SettingsData['rows'][number]['section']) => unsaved.has(id) && <span className="ct-unsaved" role="img" aria-label="Unsaved changes" />
	const rows = (section: SettingsData['rows'][number]['section'], advanced = false) => data.rows.filter(row => row.section === section && !!row.advanced === advanced && row.kind !== 'switch').map(row => <Setting row={row} key={row.key} />)
	const switches = data.rows.filter(row => row.kind === 'switch' && !row.group)
	const details = snapshot?.classic?.details
	return <div className="ct-tools ct-settings"><header className="ct-tools-head"><div><h1>Settings</h1><p>Saved to the config in your storage folder, so every machine uses them from the next cycle.</p></div></header>
		{query.error && <div role="alert"><p>Could not refresh Settings. Your current fields and edits are kept: {query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}
		<nav className="ct-settings-index" aria-label="Settings sections">{sections.map(([id, label]) => <a key={id} href={href(`settings/${id}`)} aria-current={current === id ? 'location' : undefined}>{label}{id === 'learned' && data.about.suggestions.length > 0 && <span className="ct-suggestion-count">{data.about.suggestions.length}</span>}{marker(id)}</a>)}</nav>
		{sections.map(([id, label]) => <section className="ct-settings-section" id={`setting-${id}`} aria-labelledby={`ct-section-${id}`} key={id}><h2 className="ct-section-title" id={`ct-section-${id}`}>{id === 'learned' ? `What ${NAME} knows about you` : label}{marker(id)}</h2>
			{id === 'learned' && <><p className="ct-muted">Ask your AI chat "what do you know about me?" for the same list. To change a rule you wrote, say "change my rules" there.</p>
				{data.about.suggestions.length > 0 && <><h3 className="ct-section-title">Suggestions</h3><div className="ct-setting-rows">{data.about.suggestions.map(suggestion => <div className="ct-setting-row" key={suggestion.code}><strong>{suggestion.text}</strong><span className="ct-muted">{suggestion.does}</span><span className="ct-muted">Evidence: {suggestion.evidence}</span>{suggestion.links?.length ? <span className="ct-muted evidence-links">{suggestion.links.map((link, i) => <span key={link}>{i > 0 && ' · '}<a href={link} target="_blank" rel="noreferrer">{`Reply ${i + 1}`}</a></span>)}</span> : null}<div className="ct-tool-actions">{snapshot?.settingsActions?.[suggestion.code]?.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div><ActionState item={suggestion.code} rev="" /></div>)}</div></>}
				<h3 className="ct-section-title">Standing instructions</h3><div className="ct-setting-rows">{data.about.rules.length ? data.about.rules.map((rule, n) => {
					const ids = rule.code ? snapshot?.settingsActions?.[rule.code] ?? [] : [], edit = ids.map(id => entities.actions[id]).find(action => action?.kind === 'edit-style')
					return <div className="ct-setting-row" key={rule.code ?? n}><strong>{rule.text}</strong>{rule.who && <span className="ct-muted">For: {rule.who}</span>}<span className="ct-muted">{rule.learned ?? 'You said this.'}{rule.held && ' · On hold'}</span>{edit && rule.style !== undefined && <StyleEditor action={edit} style={rule.style} />}{rule.code && <><div className="ct-tool-actions">{ids.filter(id => id !== edit?.id).map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div><ActionState item={rule.code} rev="" /></>}</div>
				}) : <div className="ct-setting-row ct-muted">None: every reply waits for your ok.</div>}</div>
				{data.about.chats.length > 0 && <><h3 className="ct-section-title">Chats you marked</h3><div className="ct-setting-rows">{data.about.chats.map((chat, n) => <div className="ct-setting-row" key={n}><strong>{chat.name}</strong><span className="ct-muted">{chat.says}. Say "{chat.name} is normal again" to undo.</span><div className="ct-tool-actions">{chat.actionIds?.filter(id => entities.actions[id]).map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>{chat.actionIds?.[0] && entities.actions[chat.actionIds[0]] && <ActionState item={entities.actions[chat.actionIds[0]].item} rev={entities.actions[chat.actionIds[0]].rev} />}</div>)}</div></>}<h3 className="ct-section-title">Learning</h3>
			</>}
			{id === 'replies' && <p className="ct-muted">Replies go out by themselves only for your <a href={href('settings/learned')}>standing instructions</a>. These limits apply to every one.</p>}
			<div className="ct-setting-rows">{rows(id)}</div>
			{id === 'you' && switches.length > 0 && <><h3 className="ct-section-title">Changes {NAME} may propose</h3><p className="ct-muted">Each one waits for your ok on its item. Turning one off edits only this list, never your items: an ok on a change it no longer allows is refused, even one approved but not made yet. Deploys follow "Where {NAME} may deploy" above.</p><div className="ct-setting-rows">{switches.map(row => <Setting key={row.key} row={row} />)}</div></>}
			{id === 'you' && <ToolsSettings data={data} Setting={Setting} look={CLASSIC_LOOK} />}
			{id === 'system' && <><h3 className="ct-section-title">AI models</h3><div className="ct-setting-rows"><div className="ct-setting-row"><strong>{data.models.set}</strong>{data.models.lines.map((line, n) => <span key={n}>{line}</span>)}<span className="ct-muted">From the last 7 days, on every machine. To choose a model, open More, then AI model.</span></div></div><details className="ct-settings-more"><summary>More</summary><div className="ct-setting-rows">{data.rows.filter(row => row.advanced).map(row => <Setting key={row.key} row={row} />)}{data.fixed.map((row, n) => <div className="ct-setting-row" key={n}><strong>{row.label}</strong><span className="ct-fixed-value">{row.value}</span><span className="ct-muted">{row.how}</span></div>)}</div>{details && <><h3 className="ct-section-title">Details</h3><div className="ct-setting-rows"><div className="ct-setting-row"><strong>Runner</strong><span className="ct-muted">{details.runner}</span><div className="ct-tool-actions"><CheckNow /></div></div><div className="ct-setting-row"><strong>Today's log, newest first</strong><pre className="ct-system-log">{details.log.join('\n') || 'Nothing yet.'}</pre></div></div></>}</details></>}
		</section>)}
	</div>
}
