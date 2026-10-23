import { useEffect } from 'react'
import { codeHover } from '../domain/hover.ts'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { useCardUi, useEdit, useItemBusy, useKnowledgeCard, useShowLatest } from '../data/hooks.ts'
import { useKnowledgeProposals } from '../data/knowledge.ts'
import { useScreenNavigation } from '../classic/navigation.tsx'
import { ActionButton, ActionState } from './ActionButton.tsx'

function Proposal({ id }: { id: string }) {
	const { entities, proposal, newer } = useKnowledgeCard(id), ui = useCardUi(id, proposal?.rev ?? ''), edit = useEdit(id, proposal?.rev ?? ''), busy = useItemBusy(id), showLatest = useShowLatest(id)
	useEffect(() => () => edit({ focusedField: undefined, composing: false }), [edit])
	if (!entities || !proposal) return null
	const actions = proposal.actionIds.map(key => entities.actions[key])
	const save = actions.find(action => action.kind === (ui.editing ? 'edit-fact' : 'save-facts'))
	return <article className="item-card knowledge-card" data-proposal-code={proposal.code}><header className="knowledge-heading"><span className="row-icon"><Icon name="book" /></span><div><h2>{proposal.topic}</h2><p className="muted">{proposal.home === 'team' ? 'Saves to team knowledge' : <><Icon name="lock" /> Saves to your own knowledge</>}</p></div><span className="code" title={codeHover(proposal.code)}>{proposal.code}</span></header>
		{newer && <p role="status">Newer version available. Your edit is kept. <Button variant="outline" disabled={busy} onClick={showLatest}>Show new version</Button></p>}
		<div className="knowledge-selection"><span>Facts to save</span><span>{proposal.factIds.length - (ui.excluded?.length ?? 0)} of {proposal.factIds.length} selected</span></div>
		<div className="knowledge-facts">{proposal.factIds.map((factId, index) => {
			const fact = entities.facts[factId], n = index + 1
			return <label className="option" key={factId}><input type="checkbox" checked={!ui.excluded?.includes(n)} disabled={busy || ui.editing}
				onChange={() => edit({ excluded: ui.excluded?.includes(n) ? ui.excluded.filter(value => value !== n) : [...(ui.excluded ?? []), n] })} />
				<span className="knowledge-check"><Icon name="check" /></span><span className="knowledge-fact"><span className="knowledge-tags"><span className="chip">{fact.type}</span>{fact.private && <span className="chip"><Icon name="lock" /> From a private chat</span>}</span><span>{fact.text}</span>{fact.replaces && <small className="knowledge-replaces">Replaces: {fact.replaces}</small>}<small>{fact.href ? <a href={fact.href} target="_blank" rel="noopener noreferrer">{[fact.who, fact.date].filter(Boolean).join(', ')}</a> : [fact.who, fact.date].filter(Boolean).join(', ')}</small></span>
			</label>
		})}</div>
		{ui.editing && <label className="field-label">Edit this fact<textarea value={ui.editText ?? ''} onChange={event => edit({ editText: event.target.value })}
			onFocus={() => edit({ focusedField: 'editText' })} onBlur={() => edit({ focusedField: undefined })}
			onCompositionStart={() => edit({ composing: true })} onCompositionEnd={event => edit({ composing: false, editText: event.currentTarget.value })} /></label>}
		<div className="action-bar">{save && <ActionButton action={save} primary input={ui.editing ? { text: ui.editText } : { excluded: ui.excluded }} disabled={newer || (ui.editing ? !ui.editText?.trim() : ui.excluded?.length === proposal.factIds.length)} />}
			{actions.some(action => action.kind === 'edit-fact') && <Button variant="outline" disabled={busy} onClick={() => edit(ui.editing ? { editing: false } : { editing: true, editText: entities.facts[proposal.factIds[0]].text })}>{ui.editing ? 'Cancel edit' : 'Edit'}</Button>}
			{actions.filter(action => action.kind === 'skip-facts').map(action => <ActionButton key={action.id} action={action} />)}
		</div><ActionState item={id} rev={proposal.rev} />
	</article>
}
export default function Knowledge() {
	const proposals = useKnowledgeProposals(), { navigate, classic } = useScreenNavigation()
	return <div className={classic ? undefined : 'new-knowledge'}><h1>To learn</h1><p className="muted">Facts waiting for your ok. Learned facts are saved by themselves; see Done, Learned.</p>{classic && <Button variant="outline" onClick={() => navigate('now')}>Back Home</Button>}
		{proposals.length ? proposals.map(proposal => <Proposal key={proposal.id} id={proposal.id} />) : <p>Nothing to learn right now.</p>}</div>
}
