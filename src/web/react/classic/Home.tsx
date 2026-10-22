import { useEntities, useSnapshot } from '../data/hooks.ts'
import { ActionButton } from '../features/ActionButton.tsx'
import { PageTools } from '../features/PageTools.tsx'
import { NAME } from '../brand.ts'

const destinations: Record<string, string> = {
	replies: 'done/replies', reviews: 'done/reviews', tasks: 'done/changes', prs: 'done/changes', invites: 'done/changes',
	reminders: 'done/reminders', knowledge: 'knowledge', watching: 'ongoing', waiting: 'ongoing',
	running: 'ongoing/running', automations: 'ongoing/automations', learned: 'done/learned', suggestions: 'settings/learned',
}

export default function Home({ readOnly = false }: { readOnly?: boolean }) {
	const snapshot = useSnapshot(), entities = useEntities(), classic = snapshot?.classic
	if (!snapshot || !classic) return <p role="alert">Classic data is not available. Reload after the app finishes updating.</p>
	const needs = classic.needsIds.map(id => entities.items[id]).filter(Boolean)
	const tiles = classic.tiles.filter(tile => tile.key !== 'needs')
	const handled = tiles.reduce((sum, tile) => sum + tile.count, 0)
	return <>
		<h1>Since you were away</h1><p className="muted">{snapshot.since ? `You left ${new Date(snapshot.since).toLocaleString()}` : 'In the last day'}{handled ? ` - ${NAME} handled ${handled} things for you` : ''}</p>
		<div className="classic-tiles"><section className="classic-tile classic-needs" aria-labelledby="classic-needs-title">
			<h2 id="classic-needs-title">{needs.length ? `${needs.length} need${needs.length === 1 ? 's' : ''} you` : 'All clear'}</h2>
			{needs.length ? <><ul>{needs.slice(0, 4).map(item => <li key={item.id}><a href={`#classic/focus/${item.code}`}><strong>{entities.people[item.personId].name}</strong><span>{item.question || item.ask || item.job}</span></a></li>)}</ul>
				{!readOnly && <a className="classic-start" href={`#classic/focus/${needs[0].code}`}>Start with {entities.people[needs[0].personId].name.split(' ')[0]}</a>}
				{needs.length > 4 && <small>and {needs.length - 4} more</small>}</> : <p>Nothing needs you.</p>}
		</section>{tiles.map(tile => <a className="classic-tile" key={tile.key} href={`#classic/${destinations[tile.key] ?? 'done'}`}><h2>{/\d/.test(tile.label) ? tile.label : `${tile.count} ${tile.label}`}</h2>{tile.sub && <p>{tile.sub}</p>}</a>)}</div>
		{snapshot.summary.catchup.count > 0 && <section><div className="classic-section-head"><h2>Catch up - {snapshot.summary.catchup.count} new</h2>{!readOnly && snapshot.pageActionIds?.filter(id => entities.actions[id].kind === 'mark-all-read').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ seenAt: snapshot.now }} />)}</div>
			{classic.catchupIds.map(id => { const row = entities.doneEntries[id]; return row && <article className="item-card" key={id}><h3><a href={row.teams ?? row.href ?? '#classic/done/catchup'} target={row.teams || row.href ? '_blank' : undefined} rel="noopener noreferrer">{row.sentence}</a></h3>{row.gist && <p>{row.gist}</p>}{row.work && <p>{row.work}</p>}<small>{entities.people[row.personId].name} - {row.by} - {new Date(row.at).toLocaleString()}</small></article> })}
			<a href="#classic/done/catchup">{snapshot.summary.catchup.count > classic.catchupIds.length ? `${snapshot.summary.catchup.count - classic.catchupIds.length} more - ` : ''}See all</a>
		</section>}
		{classic.also.length > 0 && <section><h2>Also for you</h2><div className="classic-tiles">{classic.also.map(tile => <a className="classic-tile" key={tile.key} href={`#classic/${destinations[tile.key] ?? 'done'}`}><h3>{tile.count || !tile.sub ? `${tile.count} ${tile.label}` : tile.sub}</h3>{!!tile.count && tile.sub && <p>{tile.sub}</p>}</a>)}</div></section>}
		{!readOnly && <PageTools kinds={['paste-missed', 'retry-source', 'check-update', 'report-problem']} showDetails={false} title="Keep things working" />}
	</>
}
