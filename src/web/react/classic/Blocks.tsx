import { useRef } from 'react'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { ActionButton } from '../features/ActionButton.tsx'
import { Field, Sources } from '../features/CardFields.tsx'
import type { Action, Entities, Snapshot } from '../domain/contracts.ts'
import type { CardUi } from '../data/store.ts'
import { NAME } from '../brand.ts'

export function conversationOf(snapshot: Snapshot | undefined, code: string, fallbackIds: string[], fallback: Entities) {
	const item = snapshot?.entities.items[code]
	const done = Object.values(snapshot?.entities.doneEntries ?? {}).filter(row => row.code === code && (row.kind === 'reply' || row.kind === 'review')).sort((a, b) => b.at.localeCompare(a.at))[0]
	const entities = item || done?.noteIds.length ? snapshot!.entities : fallback
	return { entities, notes: (item?.noteIds ?? (done?.noteIds.length ? done.noteIds : fallbackIds)).map(id => entities.notes[id]) }
}

export function ClassicWhy({ why, sourceIds, entities, name, open, onToggle }: {
	why: NonNullable<Entities['doneEntries'][string]['why']>; sourceIds: string[]; entities: Entities; name: string; open: boolean; onToggle: (open: boolean) => void
}) {
	return <details className="classic-why" open={open} onToggle={event => { if (open !== event.currentTarget.open) onToggle(event.currentTarget.open) }}>
		<summary><Icon name="right" /><span><b>Why:</b> {why.reason || 'The sources behind this draft'}</span>{why.confidence === 'low' && <small>{NAME} isn&apos;t sure this reply is right</small>}{sourceIds.length > 0 && <small>{sourceIds.length} source{sourceIds.length === 1 ? '' : 's'}</small>}</summary>
		<div className="classic-source-rows">{sourceIds.map(id => {
			const source = entities.sources[id]
			return <div className="classic-source-row" key={id}><span className="classic-source-kind">{source.kind}</span>{source.href ? <a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a> : <span>{source.label}</span>}<small>{source.stale && 'May be out of date · '}{source.locked ? `Not visible to ${name.split(' ')[0]}` : source.kind === 'In the chat' ? `Visible to ${name.split(' ')[0]}` : ''}</small></div>
		})}{why.searched?.length ? <p>Looked up: {why.searched.join(', ')}</p> : null}{why.gaps.length > 0 && <p>Could not read: {why.gaps.join(', ')}</p>}</div>
	</details>
}

export function Conversation({ code, rev, ui, edit, notes, entities, actions, blocked, sent = false, allowUse = true }: {
	code: string; rev: string; ui: CardUi; edit: (patch: Partial<CardUi>) => void
	notes: Entities['notes'][string][]; entities: Entities; actions: Action[]; blocked: boolean; sent?: boolean; allowUse?: boolean
}) {
	const form = useRef<HTMLFormElement>(null)
	return <section className="classic-card-section classic-ask-thread" aria-label={`Ask ${NAME} about ${code}`}><h3><Icon name="spark" />Ask {NAME}<span>Only you see this. Each question is one AI run in this item’s session.</span></h3>
		{notes.length > 0 && <ol className="classic-notes" aria-live="polite">{notes.map(note => <li key={note.id}><p className="classic-note-question">{note.question}</p><div className="classic-note-answer"><Icon name="spark" /><div><p>{note.answer === '' ? 'The answer contained only chat instructions. Review the item using its available buttons, or ask a follow-up.' : note.answer ?? `${NAME} is looking into it.`}</p><Sources ids={note.sourceIds} entities={entities} /><div className="classic-note-actions">{allowUse && note.useActionId && <ActionButton action={entities.actions[note.useActionId]} disabled={blocked} />}<Button variant="ghost" onClick={() => form.current?.querySelector<HTMLInputElement>('[data-field=ask]')?.focus()}>Ask more</Button></div></div></div></li>)}</ol>}
		<form ref={form} className="classic-ask-form" onSubmit={event => event.preventDefault()} onKeyDown={event => {
			if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
			event.preventDefault()
			event.stopPropagation()
			if (!ui.composing && !event.nativeEvent.isComposing && !event.repeat) form.current?.querySelector<HTMLButtonElement>('[data-action-kind=ask]')?.click()
		}}><Field code={code} rev={rev} field="ask" label={`Ask ${NAME} about ${code}`} placeholder={sent ? 'Ask about this. Nothing is sent.' : 'Ask about this before you send…'} value={ui.ask ?? ''} edit={edit} singleLine />
			{actions.filter(action => action.kind === 'ask').map(action => <ActionButton key={action.id} action={{ ...action, label: 'Ask' }} input={{ text: ui.ask }} disabled={!ui.ask?.trim()} />)}
		</form>
	</section>
}
