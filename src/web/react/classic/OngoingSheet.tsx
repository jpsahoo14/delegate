import { useEffect, useState } from 'react'
import { useCardUi, useEntities, useItemBusy, useLatestResult, useSnapshot } from '../data/hooks.ts'
import { consumePageForm, hasPageFormFields, usePageForms, useSheet } from '../data/forms.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { Avatar } from './Avatar.tsx'
import type { Intent, Snapshot } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'
import { useScreenNavigation } from './navigation.tsx'
import './ongoing.css'
import { useData } from '../data/store.ts'

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const clock = (value: string) => new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
type Step = 'pick' | 'watch-something' | 'remind-someone'

export function OngoingSheet({ reminderOnly = false }: { reminderOnly?: boolean }) {
	const live = useSnapshot(), entities = useEntities(), sheet = useSheet()
	const { route, navigate } = useScreenNavigation()
	const [opened, setOpened] = useState<Snapshot>()
	const [summaryHelp, setSummaryHelp] = useState(false)
	// The automations address opens the chooser in both experiences, as today's New does (E98); "+ Remind someone" opens the form.
	useEffect(() => { if (route === 'automations/new') open('pick') }, [route, reminderOnly])
	const fields = usePageForms(state => state.fields), setField = usePageForms(state => state.setField)
	const snapshot = opened ?? live, recipients = snapshot?.recipients ?? []
	const actions = (snapshot?.pageActionIds ?? []).map(id => snapshot?.entities.actions[id]).filter(action => !!action)
	const selected = actions.find(action => action.kind === sheet.kind)
	const result = useLatestResult(), completed = useCardUi(result?.item ?? '', result?.rev ?? '')
	const close = () => {
		sheet.close()
		if (reminderOnly && route === 'automations/new') navigate('now/waiting')
	}
	useEffect(() => {
		if (!reminderOnly || !selected || completed.lastAction !== selected.id || completed.result?.submissionId !== result?.submissionId || !result?.applied || !result.accepted || result.refused || result.uncertain || !completed.submittedForm) return
		if (completed.formConsumed !== result.submissionId && !consumePageForm(completed.submittedForm)) return
		if (!hasPageFormFields(completed.submittedForm)) close()
	}, [reminderOnly, selected, completed, result])
	const recipientId = fields.recipientId ?? recipients[0]?.id ?? '', recipient = recipients.find(person => person.id === recipientId)
	const kind = sheet.kind, textKey = `${kind}/text`, value = fields[textKey] ?? (kind === 'remind-someone' ? snapshot?.reminderDefaults?.text ?? '' : '')
	useEffect(() => {
		if (kind && kind !== 'pick') sheet.dialog.current?.querySelector<HTMLInputElement>('#ongoing-sheet-text')?.focus()
	}, [kind])
	const every = fields.every ?? snapshot?.reminderDefaults?.every ?? 'weekday', at = fields.at ?? snapshot?.reminderDefaults?.at ?? '16:00'
	const busy = useItemBusy(selected?.item ?? ''), changed = !!selected && selected.rev !== live?.entities.actions[selected.id]?.rev
	const open = (step: Step) => {
		if (!sheet.kind) {
			setOpened(live)
			if (reminderOnly) {
				const action = live?.pageActionIds?.map(id => live.entities.actions[id]).find(action => action.kind === step)
				const state = useData.getState()
				if (action) for (const ui of Object.values(state.byRevision)) {
					if (ui.lastAction === action.id && ui.result?.applied && !ui.pending) state.edit(ui.result.item, ui.result.rev, { result: undefined, formConsumed: undefined })
				}
			}
			if (fields.recipientId === undefined && live?.recipients?.[0]) setField('recipientId', live.recipients[0].id)
		}
		sheet.open(step)
	}
	const people = recipients.slice(0, 5), someone = fields['classic-reminder/someone'] === 'true' || !!recipientId && !people.some(person => person.id === recipientId)
	const choose = (id: string) => setField('recipientId', id)
	const initials = (name: string) => {
		const person = Object.values(entities.people).find(person => person.name === name)
		let hash = 0
		for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
		return <Avatar person={person ?? { id: name, name, initials: name.split(/\s+/).map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(), hue: [210, 160, 25, 280, 340, 45][hash % 6] }} />
	}
	const input: Intent['input'] = kind === 'remind-someone' ? {
		text: value, to: recipient?.name, recipientId: recipient?.id, every: every === 'week' || every === 'weekday' ? every : 'day', at,
		day: every === 'week' ? Number(fields.day ?? 1) : undefined,
	} : { text: value, by: fields.by || undefined, push: fields.push === 'true' }
	const hours = [...new Set([...HOURS, at])].sort()
	const repeat = every === 'day' ? 'Every day' : every === 'weekday' ? 'Every weekday' : `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(fields.day ?? 1)]}`
	return <>
		{reminderOnly ? <Button variant="ghost" onClick={() => open('remind-someone')}>+ Remind someone</Button> : <Button variant="ghost" className="ongoing-new" onClick={() => open('pick')}><span aria-hidden="true">+</span>New automation</Button>}
		<dialog className="classic-ongoing-sheet" ref={sheet.dialog} onCancel={close} onClose={close} aria-labelledby="ongoing-sheet-title">
			<div className="ongoing-sheet-header"><h2 id="ongoing-sheet-title">{kind === 'pick' ? 'New automation' : kind === 'watch-something' ? 'Watch something' : 'Remind someone'}</h2><span className="ongoing-steps">Step {kind === 'pick' ? '1' : '2'} of 2</span><Button variant="ghost" className="ongoing-close" aria-label="Close" onClick={close}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></Button></div>
			<div className="ongoing-sheet-body">
				{kind === 'pick' ? <div className="ongoing-templates">
					<Button variant="outline" className="ongoing-template" disabled={!actions.some(action => action.kind === 'remind-someone')} onClick={() => open('remind-someone')}><span className="ongoing-template-icon"><Icon name="clock" /></span><span><b>Remind someone</b><span>Send a person the same message on a schedule.</span></span></Button>
					{recipients.length > 0 && <div className="ongoing-chips ongoing-shortcuts" role="group" aria-label="Remind someone you talk to">{recipients.slice(0, 4).map(person => <Button variant="outline" className="ongoing-chip" key={person.id} onClick={() => { choose(person.id); open('remind-someone') }}>{initials(person.name)}{person.group ? `Post in ${person.name}` : `Remind ${person.name.split(' ')[0]}`}</Button>)}</div>}
					<Button variant="outline" className="ongoing-template" disabled={!actions.some(action => action.kind === 'watch-something')} onClick={() => open('watch-something')}><span className="ongoing-template-icon"><Icon name="eye" /></span><span><b>Watch something</b><span>Make sure something gets done: a PR, an ask to someone, a decision.</span></span></Button>
					<Button variant="outline" className="ongoing-template" onClick={() => setSummaryHelp(true)}><span className="ongoing-template-icon"><svg className="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10M3 8h10M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></span><span><b>Daily summary</b><span>Say it in chat: &quot;send me a summary at 6 pm&quot;.</span></span></Button>
					{summaryHelp && <p role="status">Say it in chat: &quot;send me a summary every day at 6 pm&quot;, or set the time in <a href="#classic/settings/summaryAt" onClick={close}>Settings › Daily summary</a>.</p>}
				</div> : <div className="ongoing-form">
					{kind === 'remind-someone' && <div><span className="ongoing-field-label" id="ongoing-recipient-label">Send to</span><div className="ongoing-chips" role="group" aria-labelledby="ongoing-recipient-label">{people.map(person => <Button variant="outline" className="ongoing-chip" key={person.id} aria-pressed={recipientId === person.id} disabled={busy} onClick={() => choose(person.id)}>{initials(person.name)}{person.name}</Button>)}{recipients.length > people.length && <Button variant="outline" className="ongoing-chip" aria-expanded={someone} onClick={() => setField('classic-reminder/someone', String(!someone))}>Someone else…</Button>}</div>
						{!recipients.length && snapshot?.recipientsNote && <p className="ongoing-description" role="note">{snapshot.recipientsNote}</p>}
						{someone && <label className="ongoing-other-person"><span className="sr-only">Person or chat</span><select aria-label="Person or chat" value={recipientId} disabled={busy} onChange={event => choose(event.target.value)}>{!recipient && <option value={recipientId}>Choose a person or chat</option>}{recipients.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>}
					</div>}
					<div><label htmlFor="ongoing-sheet-text">{kind === 'watch-something' ? 'What should I make sure gets done?' : 'Message'}</label><input id="ongoing-sheet-text" autoComplete="off" value={value} placeholder={kind === 'watch-something' ? 'PR 1601234 merged, or: Ana sends the trace IDs' : undefined} onChange={event => setField(textKey, event.target.value)} /></div>
					{kind === 'watch-something' ? <>
						<div><span className="ongoing-field-label">Done by</span><div className="ongoing-segments" role="group" aria-label="Done by">{snapshot?.classic?.watchBy?.map(option => <Button variant="ghost" key={option.label} aria-pressed={(fields.by ?? '') === option.date} onClick={() => setField('by', option.date)}>{option.label}</Button>)}</div></div>
						<label className="ongoing-push"><input type="checkbox" checked={fields.push === 'true'} onChange={event => setField('push', String(event.target.checked))} />Push it: draft fixes and nudges as soon as they help. Nothing goes out without your ok.</label>
					</> : <>
						<div><span className="ongoing-field-label">When</span><div className="ongoing-schedule"><div className="ongoing-segments" role="group" aria-label="How often">{[['day', 'Every day'], ['weekday', 'Weekdays'], ['week', 'Weekly']].map(([id, label]) => <Button variant="ghost" key={id} aria-pressed={every === id} onClick={() => setField('every', id)}>{label}</Button>)}</div><select aria-label="Time" value={at} onChange={event => setField('at', event.target.value)}>{hours.map(hour => <option value={hour} key={hour}>{clock(hour)}</option>)}</select></div>
							{every === 'week' && <label className="ongoing-weekday">Day<select aria-label="Day" value={fields.day ?? '1'} onChange={event => setField('day', event.target.value)}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
						</div>
						<div><span className="ongoing-field-label">{NAME} will</span><div className="ongoing-preview" aria-label="Reminder preview">{repeat} at {clock(at)}, send <b>{recipient?.name.split(' ')[0] ?? 'the chosen person'}</b>: “{value}” <span>(sent by my assistant)</span></div></div>
					</>}
					{changed && <p role="alert">The available recipients or action changed. Your text is kept. Close and reopen this sheet to review the current choices.</p>}
					{selected && <ActionState item={selected.item} rev={selected.rev} />}
				</div>}
			</div>
			{kind !== 'pick' && <div className="ongoing-sheet-footer"><span>{kind === 'watch-something' ? `${NAME} checks it, tells you when it is done, and asks you if it gets stuck.` : `You approve this text once. Pausing ${NAME} pauses it.`}</span><Button variant="ghost" onClick={() => open('pick')}>Back</Button>{selected && <ActionButton action={selected.kind === 'remind-someone' ? { ...selected, label: 'Create automation' } : selected} input={input} primary disabled={changed || !value.trim() || kind === 'remind-someone' && !recipient} />}</div>}
		</dialog>
	</>
}
