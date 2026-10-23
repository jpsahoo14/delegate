import { useCallback, useEffect, type ReactNode } from 'react'
import { useCardUi, useEntities, useLatestError, useLatestResult, useSnapshot } from '../data/hooks.ts'
import { consumePageForm, hasPageFormFields, usePageForms, useSheet } from '../data/forms.ts'
import { replaceRoute, useNavigation } from '../data/navigation.ts'
import { Button } from '../components/ui/button.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'
import { NAME } from '../brand.ts'
import type { Intent } from '../domain/contracts.ts'
import { when } from '../domain/time.ts'
import { useData } from '../data/store.ts'
import { OngoingSheet } from '../classic/OngoingSheet.tsx'

export function PageTools({ kinds, showDetails = true, title = 'More you can do', automation = false, quiet = false, children }: { kinds?: string[]; showDetails?: boolean; title?: string; automation?: boolean; quiet?: boolean; children?: ReactNode }) {
	const entities = useEntities(), snapshot = useSnapshot(), sheet = useSheet()
	const latestError = useLatestError()
	const pageUi = useCardUi('', '')
	const result = useLatestResult(), completed = useCardUi(result?.item ?? '', result?.rev ?? '')
	const composing = usePageForms(state => state.composing)
	const fields = usePageForms(state => state.fields), setField = usePageForms(state => state.setField)
	const pageActions = (snapshot?.pageActionIds ?? []).map(id => entities.actions[id])
	const actions = pageActions.filter(action => !kinds || kinds.includes(action.kind))
	const shownActions = actions.filter(action => action.kind !== 'mark-all-read' && (action.kind !== 'paste-missed' || kinds?.includes('paste-missed')))
	const route = useNavigation(state => state.route)
	const reminderId = actions.find(action => action.kind === 'remind-someone')?.id
	const openSheet = useCallback((kind: string) => {
		const state = useData.getState()
		const action = state.snapshot?.pageActionIds?.map(id => state.entities.actions[id]).find(action => action.kind === kind)
		if (action) {
			for (const ui of Object.values(state.byRevision)) if (ui.lastAction === action.id && ui.result?.applied && !ui.pending) state.edit(ui.result.item, ui.result.rev, { result: undefined, formConsumed: undefined })
		}
		sheet.open(kind)
	}, [sheet.open])
	useEffect(() => {
		if (!quiet && route === 'automations/new' && reminderId) openSheet('remind-someone')
	}, [route, reminderId, openSheet, quiet])
	useEffect(() => () => usePageForms.getState().setComposing(false), [])
	const close = () => {
		usePageForms.getState().setComposing(false)
		sheet.close()
		if (route === 'automations/new') replaceRoute('now/waiting')
	}
	const selected = pageActions.find(action => action.kind === sheet.kind)
	useEffect(() => {
		if (!result?.applied || !result.accepted || result.refused || result.uncertain || !completed.submittedForm || completed.result?.submissionId !== result.submissionId || composing) return
		if (completed.formConsumed !== result.submissionId) {
			if (!consumePageForm(completed.submittedForm)) return
			useData.getState().edit(result.item, result.rev, { formConsumed: result.submissionId })
		}
		if (!selected || completed.lastAction !== selected.id || hasPageFormFields(completed.submittedForm)) return
		useData.getState().edit(result.item, result.rev, { result: undefined, formConsumed: undefined })
		sheet.close()
		if (route === 'automations/new') replaceRoute('now/waiting')
	}, [selected, result, completed, composing, fields, sheet.close, route])
	const recipientId = fields.recipientId ?? snapshot?.recipients?.[0]?.id ?? ''
	const recipient = snapshot?.recipients?.find(recipient => recipient.id === recipientId)
	const textKey = `${sheet.kind}/text`, value = fields[textKey] ?? (selected?.kind === 'remind-someone' ? snapshot?.reminderDefaults?.text ?? '' : '')
	const every = fields.every ?? snapshot?.reminderDefaults?.every ?? 'weekday'
	const at = fields.at ?? snapshot?.reminderDefaults?.at ?? '16:00'
	const endComposition = (target: EventTarget) => {
		if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.dataset.pageField) setField(target.dataset.pageField, target.value)
		usePageForms.getState().setComposing(false)
	}
	const field = (key: string, label: string, type = 'text') => <label className="field-label" htmlFor={`tool-${key}`}>{label}<input id={`tool-${key}`} data-page-field={key} type={type} value={key === 'at' ? at : fields[key] ?? ''} onChange={event => setField(key, event.target.value)} /></label>
	const input: Intent['input'] = selected?.kind === 'remind-someone' ? {
		text: value, to: recipient?.name ?? fields.to, recipientId: recipient?.id,
		every: every === 'week' || every === 'weekday' ? every : 'day', at,
		day: every === 'week' ? Number(fields.day ?? 1) : undefined,
	} : selected?.kind === 'watch-something' ? { text: value, until: fields.until, by: fields.by || undefined, push: fields.push === 'true' } : { text: value }
	return <>
		<section className={quiet ? 'quiet-tools' : 'tools-section'} aria-label={quiet ? 'More' : undefined} aria-labelledby={quiet || !title ? undefined : 'tools-title'}>{!quiet && title && <h2 id="tools-title">{title}</h2>}<div className="action-bar">
			{quiet ? <><OngoingSheet reminderOnly />
				{Object.keys(entities.channels).length > 0 && <details><summary>Channels you named ({Object.keys(entities.channels).length})</summary>{Object.values(entities.channels).map(channel => <div key={channel.id}><span>{channel.name}</span>{channel.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</div>)}</details>}
				{children}<Button variant="ghost" onClick={() => openSheet('report-problem')}>Report a problem</Button></> :
			automation ? <Button variant="outline" onClick={() => sheet.open('automation')}>New automation</Button> : shownActions.map(action => action.input ? <Button variant="outline" key={action.id} onClick={() => openSheet(action.kind)}>{action.kind === 'watch-something' ? 'Watch something' : action.kind === 'remind-someone' ? 'Remind someone' : action.label}</Button> : <ActionButton key={action.id} action={action} />)
			}
		</div>{shownActions.some(action => action.id === pageUi.lastAction) && <ActionState item="" rev="" />}</section>
		{showDetails && Object.keys(entities.watches).length > 0 && <details><summary>Watch details</summary>{Object.values(entities.watches).map(watch => <article className="item-card" key={watch.id}><h3>{watch.what}</h3><p>{watch.last}</p><p className="muted">Next check: {watch.nextAt ? when(watch.nextAt) : 'Not scheduled'}{watch.by ? ` - By ${watch.by}` : ''}{watch.endsAt ? ` - Until ${new Date(watch.endsAt).toLocaleDateString()}` : ''}</p>
			<label className="field-label">How often to check<input data-page-field={`interval:${watch.id}`} value={fields[`interval:${watch.id}`] ?? `${watch.every ?? 60}m`} onChange={event => setField(`interval:${watch.id}`, event.target.value)} onCompositionStart={() => usePageForms.getState().setComposing(true)} onCompositionEnd={event => endComposition(event.currentTarget)} /></label>
			<div className="action-bar">{watch.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} input={entities.actions[id].kind === 'interval' ? { text: fields[`interval:${watch.id}`] ?? `${watch.every ?? 60}m` } : undefined} />)}</div><ActionState item={watch.code} rev={watch.rev} />
		</article>)}</details>}
		{showDetails && Object.keys(entities.channels).length > 0 && <details><summary>Channels you named</summary>{Object.values(entities.channels).map(channel => <article key={channel.id}><p>{channel.name}</p>{channel.actionIds.map(id => <ActionButton key={id} action={entities.actions[id]} />)}</article>)}</details>}
		<dialog className="tool-sheet" ref={sheet.dialog} onCancel={close} onClose={close} onCompositionStartCapture={() => usePageForms.getState().setComposing(true)} onCompositionEndCapture={event => endComposition(event.target)} aria-labelledby="tool-title"><h2 id="tool-title">{sheet.kind === 'automation' ? 'New automation' : selected?.kind === 'watch-something' ? 'Watch something' : selected?.kind === 'remind-someone' ? 'Remind someone' : selected?.kind === 'paste-missed' ? 'Add a missed message' : 'Report a problem'}</h2>
			{sheet.kind === 'automation' && <><p>Choose what to automate. Nothing starts until you confirm.</p><div className="action-bar">{actions.filter(action => ['remind-someone', 'watch-something'].includes(action.kind)).map(action => <Button key={action.id} variant="outline" onClick={() => openSheet(action.kind)}>{action.kind === 'remind-someone' ? 'Reminder' : 'Watch'}</Button>)}<a href="#classic/settings/timing" onClick={sheet.close}>Daily summary</a></div><div className="action-bar" role="group" aria-label="Remind someone you talk to">{snapshot?.recipients?.slice(0, 4).map(recipient => <Button variant="outline" key={recipient.id} onClick={() => { setField('recipientId', recipient.id); openSheet('remind-someone') }}>{recipient.group ? `Post in ${recipient.name}` : `Remind ${recipient.name.split(' ')[0]}`}</Button>)}</div>{!snapshot?.recipients?.length && snapshot?.recipientsNote && <p className="muted" role="note">{snapshot.recipientsNote}</p>}<Button variant="outline" onClick={sheet.close}>Close</Button></>}
			{selected && <><label className="field-label" htmlFor="tool-text">{selected.kind === 'paste-missed' ? 'Teams message link' : selected.kind === 'watch-something' ? 'What should I make sure gets done?' : selected.kind === 'remind-someone' ? 'Exact reminder text' : 'What went wrong?'}<textarea id="tool-text" data-page-field={textKey} placeholder={selected.kind === 'report-problem' ? 'What went wrong, and what should it have done?' : undefined} value={value} onChange={event => setField(textKey, event.target.value)} rows={3} /></label>
				{selected.kind === 'watch-something' && <>{field('until', 'Done when')}{automation && <div className="action-bar" role="group" aria-label="Done by">{snapshot?.classic?.watchBy?.map(option => <Button variant="outline" aria-pressed={(fields.by ?? '') === option.date} key={option.label} onClick={() => setField('by', option.date)}>{option.label}</Button>)}</div>}{field('by', 'By date (optional)', 'date')}<label><input type="checkbox" checked={fields.push === 'true'} onChange={event => setField('push', String(event.target.checked))} />Draft fixes and nudges, each held for your approval</label></>}
				{selected.kind === 'remind-someone' && <>{!snapshot?.recipients?.length && snapshot?.recipientsNote && <p className="muted" role="note">{snapshot.recipientsNote}</p>}<label className="field-label">Person or group<select value={recipientId} onChange={event => setField('recipientId', event.target.value)}><option value="">Enter a name below</option>{snapshot?.recipients?.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name}{recipient.group ? ' (group)' : ''}</option>)}</select></label>{!recipient && field('to', 'Person name')}{field('at', 'At', 'time')}<label className="field-label">Repeat<select value={every} onChange={event => setField('every', event.target.value)}><option value="day">Every day</option><option value="weekday">Weekdays</option><option value="week">Weekly</option></select></label>{every === 'week' && <label className="field-label">Day<select value={fields.day ?? '1'} onChange={event => setField('day', event.target.value)}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}<p>{NAME} will send exactly the text above to {recipient?.name ?? fields.to ?? 'the chosen person'} on this schedule, with its assistant marker. It stops when you pause it.</p></>}
				{automation && selected.kind === 'remind-someone' && <div className="draft" aria-label="Reminder preview">{every === 'week' ? `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(fields.day ?? 1)]}` : every === 'weekday' ? 'Every weekday' : 'Every day'} at {at}, send {recipient?.name ?? fields.to ?? 'the chosen person'}: &quot;{value}&quot; <span className="muted">(sent by my assistant)</span></div>}
				{selected.kind !== 'remind-someone' && <p className="muted">Nothing is sent to a chat by this action.</p>}
				<div className="action-bar"><ActionButton action={selected.kind === 'report-problem' ? { ...selected, label: 'Send to the feedback log' } : selected} input={input} primary disabled={!value.trim() || selected.kind === 'remind-someone' && !recipient && !fields.to?.trim()} />{automation && <Button variant="outline" onClick={() => sheet.open('automation')}>Back</Button>}<Button variant="outline" onClick={close}>Close</Button></div><ActionState item={selected.item} rev={selected.rev} />
				{selected.rev && latestError && <p role="alert" className="error">{latestError}</p>}
			</>}
		</dialog>
	</>
}
