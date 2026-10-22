import { useEntities, useLatestError, useSnapshot } from '../data/hooks.ts'
import { usePageForms, useSheet } from '../data/forms.ts'
import { Button } from '../components/ui/button.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'
import type { Intent } from '../domain/contracts.ts'

export function PageTools({ kinds, showDetails = true, title = 'More you can do', automation = false }: { kinds?: string[]; showDetails?: boolean; title?: string; automation?: boolean }) {
	const entities = useEntities(), snapshot = useSnapshot(), sheet = useSheet()
	const latestError = useLatestError()
	const fields = usePageForms(state => state.fields), setField = usePageForms(state => state.setField)
	const actions = (snapshot?.pageActionIds ?? []).map(id => entities.actions[id]).filter(action => !kinds || kinds.includes(action.kind))
	const selected = actions.find(action => action.kind === sheet.kind)
	const recipientId = fields.recipientId ?? snapshot?.recipients?.[0]?.id ?? ''
	const recipient = snapshot?.recipients?.find(recipient => recipient.id === recipientId)
	const textKey = `${sheet.kind}/text`, value = fields[textKey] ?? (selected?.kind === 'remind-someone' ? snapshot?.reminderDefaults?.text ?? '' : '')
	const every = fields.every ?? snapshot?.reminderDefaults?.every ?? 'weekday'
	const at = fields.at ?? snapshot?.reminderDefaults?.at ?? '16:00'
	const field = (key: string, label: string, type = 'text') => <label className="field-label" htmlFor={`tool-${key}`}>{label}<input id={`tool-${key}`} type={type} value={key === 'at' ? at : fields[key] ?? ''} onChange={event => setField(key, event.target.value)} /></label>
	const input: Intent['input'] = selected?.kind === 'remind-someone' ? {
		text: value, to: recipient?.name ?? fields.to, recipientId: recipient?.id,
		every: every === 'week' || every === 'weekday' ? every : 'day', at,
		day: every === 'week' ? Number(fields.day ?? 1) : undefined,
	} : selected?.kind === 'watch-something' ? { text: value, until: fields.until, by: fields.by || undefined, push: fields.push === 'true' } : { text: value }
	return <>
		<section className="tools-section" aria-labelledby="tools-title"><h2 id="tools-title">{title}</h2><div className="action-bar">
			{automation ? <Button variant="outline" onClick={() => sheet.open('automation')}>New automation</Button> : actions.filter(action => action.kind !== 'mark-all-read' && (action.kind !== 'paste-missed' || kinds?.includes('paste-missed'))).map(action => action.input ? <Button variant="outline" key={action.id} onClick={() => sheet.open(action.kind)}>{action.kind === 'watch-something' ? 'Watch something' : action.kind === 'remind-someone' ? 'Remind someone' : action.label}</Button> : <ActionButton key={action.id} action={action} />)}
		</div><ActionState item="" rev="" /></section>
		{showDetails && Object.keys(entities.watches).length > 0 && <details><summary>Watch details</summary>{Object.values(entities.watches).map(watch => <article className="item-card" key={watch.id}><h3>{watch.what}</h3><p>{watch.last}</p><p className="muted">Next check: {watch.nextAt ? new Date(watch.nextAt).toLocaleString() : 'Not scheduled'}{watch.by ? ` - By ${watch.by}` : ''}{watch.endsAt ? ` - Until ${new Date(watch.endsAt).toLocaleDateString()}` : ''}</p>
			<label className="field-label">How often to check<input value={fields[`interval:${watch.id}`] ?? `${watch.every ?? 60}m`} onChange={event => setField(`interval:${watch.id}`, event.target.value)} /></label>
			<div className="action-bar">{watch.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} input={entities.actions[id].kind === 'interval' ? { text: fields[`interval:${watch.id}`] ?? `${watch.every ?? 60}m` } : undefined} />)}</div><ActionState item={watch.code} rev={watch.rev} />
		</article>)}</details>}
		{showDetails && Object.keys(entities.channels).length > 0 && <details><summary>Channels you named</summary>{Object.values(entities.channels).map(channel => <article key={channel.id}><p>{channel.name}</p>{channel.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</article>)}</details>}
		<dialog ref={sheet.dialog} onCancel={sheet.close} onClose={sheet.close} aria-labelledby="tool-title"><h2 id="tool-title">{sheet.kind === 'automation' ? 'New automation' : selected?.kind === 'watch-something' ? 'Watch something' : selected?.kind === 'remind-someone' ? 'Remind someone' : selected?.kind === 'paste-missed' ? 'Add a missed message' : 'Report a problem'}</h2>
			{sheet.kind === 'automation' && <><p>Choose what to automate. Nothing starts until you confirm.</p><div className="action-bar">{actions.filter(action => ['remind-someone', 'watch-something'].includes(action.kind)).map(action => <Button key={action.id} variant="outline" onClick={() => sheet.open(action.kind)}>{action.kind === 'remind-someone' ? 'Reminder' : 'Watch'}</Button>)}<a href="#classic/settings/timing" onClick={sheet.close}>Daily summary</a><Button variant="outline" onClick={sheet.close}>Close</Button></div></>}
			{selected && <><label className="field-label" htmlFor="tool-text">{selected.kind === 'paste-missed' ? 'Teams message link' : selected.kind === 'watch-something' ? 'What should I make sure gets done?' : selected.kind === 'remind-someone' ? 'Exact reminder text' : 'What went wrong?'}<textarea id="tool-text" value={value} onChange={event => setField(textKey, event.target.value)} rows={3} /></label>
				{selected.kind === 'watch-something' && <>{field('until', 'Done when')}{field('by', 'By date (optional)', 'date')}<label><input type="checkbox" checked={fields.push === 'true'} onChange={event => setField('push', String(event.target.checked))} />Draft fixes and nudges, each held for your approval</label></>}
				{selected.kind === 'remind-someone' && <><label className="field-label">Person or group<select value={recipientId} onChange={event => setField('recipientId', event.target.value)}><option value="">Enter a name below</option>{snapshot?.recipients?.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name}{recipient.group ? ' (group)' : ''}</option>)}</select></label>{!recipient && field('to', 'Person name')}{field('at', 'At', 'time')}<label className="field-label">Repeat<select value={every} onChange={event => setField('every', event.target.value)}><option value="day">Every day</option><option value="weekday">Weekdays</option><option value="week">Weekly</option></select></label>{every === 'week' && <label className="field-label">Day<select value={fields.day ?? '1'} onChange={event => setField('day', event.target.value)}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}<p>{NAME} will send exactly the text above to {recipient?.name ?? fields.to ?? 'the chosen person'} on this schedule, with its assistant marker. It stops when you pause it.</p></>}
				{selected.kind !== 'remind-someone' && <p className="muted">Nothing is sent to a chat by this action.</p>}
				<div className="action-bar"><ActionButton action={selected} input={input} primary disabled={!value.trim() || selected.kind === 'remind-someone' && !recipient && !fields.to?.trim()} /><Button variant="outline" onClick={sheet.close}>Close</Button></div><ActionState item={selected.item} rev={selected.rev} />
				{selected.rev && latestError && <p role="alert" className="error">{latestError}</p>}
			</>}
		</dialog>
	</>
}
