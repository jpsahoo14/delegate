import { Button } from '../components/ui/button.tsx'
import { useCardUi, useEdit, useEntities, useItemBusy, useKnowledgeCard, useShowLatest } from '../data/hooks.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'

function Proposal({ id }: { id: string }) {
	const { entities, proposal, newer } = useKnowledgeCard(id), ui = useCardUi(id, proposal?.rev ?? ''), edit = useEdit(id, proposal?.rev ?? ''), busy = useItemBusy(id), showLatest = useShowLatest(id)
	if (!entities || !proposal) return null
	const actions = proposal.actionIds.map(key => entities.actions[key])
	const save = actions.find(action => action.kind === (ui.editing ? 'edit-fact' : 'save-facts'))
	return <article className="item-card"><h2>{proposal.topic}</h2><p className="muted">{proposal.home === 'team' ? 'Shared knowledge' : 'Personal knowledge'} - {proposal.code}</p>
		{newer && <p role="status">Newer version available. Your edit is kept. <Button variant="outline" disabled={busy} onClick={showLatest}>Show new version</Button></p>}
		{proposal.factIds.map((factId, index) => {
			const fact = entities.facts[factId], n = index + 1
			return <label className="option" key={factId}><input type="checkbox" checked={!ui.excluded?.includes(n)} disabled={busy || ui.editing}
				onChange={() => edit({ excluded: ui.excluded?.includes(n) ? ui.excluded.filter(value => value !== n) : [...(ui.excluded ?? []), n] })} />
				<span>{fact.text}<small>{fact.type}{fact.who ? ` - ${fact.who}` : ''}{fact.private ? ' - Private source' : ''}{fact.href && <> - <a href={fact.href} target="_blank" rel="noopener noreferrer">Source</a></>}</small></span>
			</label>
		})}
		{ui.editing && <label className="field-label">Edit this fact<textarea value={ui.editText ?? ''} onChange={event => edit({ editText: event.target.value })} /></label>}
		<div className="action-bar">{save && <ActionButton action={save} primary input={ui.editing ? { text: ui.editText } : { excluded: ui.excluded }} disabled={newer || (ui.editing ? !ui.editText?.trim() : ui.excluded?.length === proposal.factIds.length)} />}
			{actions.some(action => action.kind === 'edit-fact') && <Button variant="outline" disabled={busy} onClick={() => edit(ui.editing ? { editing: false } : { editing: true, editText: entities.facts[proposal.factIds[0]].text })}>{ui.editing ? 'Cancel edit' : 'Edit'}</Button>}
			{actions.filter(action => action.kind === 'skip-facts').map(action => <ActionButton key={action.id} action={action} />)}
		</div><ActionState item={id} rev={proposal.rev} />
	</article>
}
export default function Knowledge() {
	const entities = useEntities(), { navigate } = useScreenNavigation()
	const proposals = Object.values(entities.knowledgeProposals).filter(proposal => proposal.state === 'needs_human' || proposal.actionIds.some(id => entities.actions[id].kind === 'save-facts'))
	return <><h1>Facts to check</h1><Button variant="outline" onClick={() => navigate('now')}>Back to Now</Button>
		{proposals.length ? proposals.map(proposal => <Proposal key={proposal.id} id={proposal.id} />) : <p>There are no facts waiting for your approval.</p>}</>
}
