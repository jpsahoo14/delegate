import { useEffect } from 'react'
import { Button } from '../components/ui/button.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { useCardUi, useEdit, useItemBusy, useKnowledgeCard, useShowLatest } from '../data/hooks.ts'
import { useKnowledgeProposals } from '../data/knowledge.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { useScreenNavigation } from './navigation.tsx'
import './tools.css'

function Lock() {
	return <svg className="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
}

function Proposal({ id }: { id: string }) {
	const { entities, proposal, newer } = useKnowledgeCard(id)
	const ui = useCardUi(id, proposal?.rev ?? ''), edit = useEdit(id, proposal?.rev ?? '')
	const busy = useItemBusy(id), showLatest = useShowLatest(id)
	useEffect(() => () => edit({ focusedField: undefined, composing: false }), [edit])
	if (!entities || !proposal) return null
	const actions = proposal.actionIds.map(key => entities.actions[key])
	const save = actions.find(action => action.kind === (ui.editing ? 'edit-fact' : 'save-facts'))
	const selected = proposal.factIds.filter((_, i) => !ui.excluded?.includes(i + 1)).length
	const single = proposal.factIds.length === 1 && actions.some(action => action.kind === 'edit-fact')
	return <article className="ct-fact-card" data-code={proposal.code} data-rev={proposal.rev} aria-labelledby={`ct-fact-${id}`}>
		{newer && <div className="ct-fact-stale" role="status"><p><strong>Changed since you looked.</strong> Your edit is kept.</p><Button variant="outline" disabled={busy} onClick={showLatest}>Show the new version</Button></div>}
		<header className="ct-fact-section ct-fact-head"><span className="ct-tool-icon ct-fact-icon"><Icon name="book" /></span><div><h2 id={`ct-fact-${id}`}>{proposal.topic}</h2><p className="ct-muted">{proposal.home === 'personal' ? <><Lock /> Saves to your own knowledge</> : 'Saves to team knowledge'}</p></div><span className="ct-code">{proposal.code}</span></header>
		<section className="ct-fact-section"><div className="ct-fact-label"><strong>Facts to save</strong><span>{selected} of {proposal.factIds.length} selected</span></div>
			<ul className="ct-facts">{proposal.factIds.map((factId, index) => {
				const fact = entities.facts[factId], n = index + 1, checked = !ui.excluded?.includes(n)
				return <li key={factId}><label className="ct-fact" data-selected={checked}><input type="checkbox" aria-label={fact.text} checked={checked} disabled={busy || ui.editing} onChange={() => edit({ excluded: checked ? [...(ui.excluded ?? []), n] : ui.excluded?.filter(value => value !== n) })} /><span className="ct-fact-check" aria-hidden="true"><Icon name="check" /></span><span className="ct-fact-body"><span className="ct-fact-tags"><span>{fact.type}</span>{fact.private && <span><Lock /> From a private chat</span>}</span><span className="ct-fact-text">{fact.text}</span>{fact.replaces && <span className="ct-fact-replaces">Replaces: {fact.replaces}</span>}<span className="ct-fact-attribution">{fact.href ? <a href={fact.href} target="_blank" rel="noopener noreferrer">{[fact.who, fact.date].filter(Boolean).join(', ')} <Icon name="ext" /></a> : [fact.who, fact.date].filter(Boolean).join(', ')}</span></span></label></li>
			})}</ul>
			{ui.editing && <label className="ct-fact-editor">Edit this fact<textarea value={ui.editText ?? ''} onChange={event => edit({ editText: event.target.value })} onFocus={() => edit({ focusedField: 'editText' })} onBlur={() => edit({ focusedField: undefined })} onCompositionStart={() => edit({ composing: true })} onCompositionEnd={event => edit({ composing: false, editText: event.currentTarget.value })} /></label>}
		</section>
		<footer className="ct-fact-section"><ActionState item={id} rev={proposal.rev} /><div className="ct-tool-actions">{save && <ActionButton action={save} primary input={ui.editing ? { text: ui.editText } : { excluded: ui.excluded }} disabled={newer || (ui.editing ? !ui.editText?.trim() : selected === 0)} />}{single && <Button variant="outline" disabled={busy} onClick={() => edit(ui.editing ? { editing: false } : { editing: true, editText: entities.facts[proposal.factIds[0]].text })}>{ui.editing ? 'Cancel edit' : 'Edit'}</Button>}{actions.filter(action => action.kind === 'skip-facts').map(action => <ActionButton key={action.id} action={action} />)}</div></footer>
	</article>
}

export default function Knowledge() {
	const proposals = useKnowledgeProposals(), { href } = useScreenNavigation()
	return <div className="ct-tools ct-knowledge"><header className="ct-tools-head"><div><h1>To learn</h1><p>Facts waiting for your ok. Learned facts are saved by themselves; see <a href={href('done/learned')}>Done, Learned</a>.</p></div></header><div className="ct-proposals">{proposals.length ? proposals.map(proposal => <Proposal key={proposal.id} id={proposal.id} />) : <p className="ct-muted">There are no facts waiting for your approval.</p>}</div></div>
}
