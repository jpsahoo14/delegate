import type { ComponentProps, CSSProperties } from 'react'
import { useAction, useCardUi, useEntities, useItemBusy, useLatestResult, useSnapshot } from '../data/hooks.ts'
import { useQuery } from '@tanstack/react-query'
import { fetchSnapshot } from '../services/api.ts'
import { Icon } from '../components/ui/icon.tsx'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { Button } from '../components/ui/button.tsx'
import { usePageForms } from '../data/forms.ts'
import { useActionAvailability } from '../data/presentation.ts'
import { PageTools } from '../features/PageTools.tsx'
import { NAME } from '../brand.ts'
import { Entry } from '../features/Done.tsx'
import { useDoneEntries } from '../data/done.ts'
import { useData } from '../data/store.ts'
import { revisionKey, type Action } from '../domain/contracts.ts'
import { when } from '../domain/time.ts'
import { versionLabel, versionTitle } from '../domain/version.ts'
import { useClassicMarkSeen } from './data.ts'
import { useScreenNavigation } from './navigation.tsx'
import { messageText, sentAt } from '../features/ItemCard.tsx'
import { SentTime } from '../features/SentTime.tsx'
import { busyWords } from '../data/busy.ts'
import { WaysLink, waysLinkShown } from '../features/Ways.tsx'

const destinations: Record<string, string> = {
	replies: 'done/replies', reviews: 'done/reviews', tasks: 'done/changes', prs: 'done/changes', invites: 'done/changes',
	reminders: 'done/reminders', knowledge: 'knowledge', watching: 'ongoing', waiting: 'ongoing',
	running: 'ongoing/running', automations: 'ongoing/automations', learned: 'done/learned', suggestions: 'settings/learned',
}
const icons: Record<string, ComponentProps<typeof Icon>['name']> = {
	replies: 'reply', reviews: 'pr', tasks: 'task', prs: 'pr', invites: 'cal', reminders: 'clock',
	knowledge: 'book', watching: 'eye', waiting: 'clock', running: 'bolt', automations: 'clock', learned: 'book', suggestions: 'bolt',
}

function TileSentence({ label, count }: { label: string; count: number }) {
	const match = /^(.*?)(\d+)(.*)$/.exec(label)
	return <span className="classic-tile-sentence">{match ? <>{match[1]}<b>{match[2]}</b>{match[3]}</> : <><b>{count}</b> {label}</>}</span>
}

function MissedMessage({ action }: { action: Action }) {
	const act = useAction(), busy = useItemBusy(action.item), ui = useCardUi(action.item, action.rev), unavailable = useActionAvailability(action)
	const latest = useLatestResult()
	const value = usePageForms(state => state.fields['paste-missed/text'] ?? ''), setField = usePageForms(state => state.setField)
	const link = value.trim(), valid = /^https:\/\/teams\.microsoft\.com\/l\/message\/[^/?#]+\/\d+/i.test(link)
	const lookup = useQuery({ queryKey: ['missed-link', link], queryFn: ({ signal }) => fetchSnapshot(link, signal), enabled: valid, retry: false })
	const existing = valid ? lookup.data?.search?.link?.item : undefined
	const changeValue = (text: string) => {
		if (ui.result?.applied && !ui.result.uncertain && !ui.pending) useData.getState().edit(action.item, action.rev, { result: undefined, formConsumed: undefined })
		setField('paste-missed/text', text)
	}
	return <form className="classic-missed" aria-label="Missed a message" onSubmit={event => { event.preventDefault(); if (!existing && !lookup.isFetching && !lookup.error) void act(action, { text: value }) }}>
		<div className="classic-missed-entry"><label className="sr-only" htmlFor="classic-missed-link">Paste the Teams link of a message {NAME} missed</label>
			<input id="classic-missed-link" data-page-field="paste-missed/text" type="url" required autoComplete="off" placeholder="Missed a message? Paste its Teams link here" value={value} onChange={event => changeValue(event.target.value)} onCompositionStart={() => usePageForms.getState().setComposing(true)} onCompositionEnd={event => { changeValue(event.currentTarget.value); usePageForms.getState().setComposing(false) }} />
			{existing ? <span>This message is already {existing}. <a href={`#classic/focus/${existing}`}>Open</a></span> : <Button variant="ghost" type="submit" disabled={busy || !value.trim() || lookup.isFetching || !!lookup.error || !!unavailable} title={unavailable?.reason}>{lookup.isFetching ? 'Checking...' : ui.pending ? 'Making an item...' : 'Make an item'}</Button>}
		</div>{lookup.error && <p role="alert">Could not check this message: {lookup.error.message} <Button type="button" onClick={() => void lookup.refetch()}>Try again</Button></p>}{(!ui.result || ui.result.submissionId !== latest?.submissionId) && <ActionState item={action.item} rev={action.rev} />}
	</form>
}

export default function Home({ readOnly = false }: { readOnly?: boolean }) {
	const snapshot = useSnapshot(), entities = useEntities(), classic = snapshot?.classic
	const entries = useDoneEntries(), pins = useData(state => state.pinned), edits = useData(state => state.byRevision), { navigate } = useScreenNavigation(), seen = useClassicMarkSeen()
	if (!snapshot || !classic) return <p role="alert">Classic data is not available. Reload after the app finishes updating.</p>
	const needs = classic.needsIds.map(id => entities.items[id]).filter(Boolean)
	const tiles = classic.tiles.filter(tile => tile.key !== 'needs')
	const handled = tiles.reduce((sum, tile) => sum + tile.count, 0)
	const retained = Object.values(entries).filter(row => {
		const pin = pins[row.code], ui = pin && edits[revisionKey(row.code, pin.actionRev ?? pin.rev)]
		return row.kind === 'catchup' && ui && (ui.folds?.watch || ui.feedbackKind || ui.composing || ui.focusedField || ui.pending)
	}).map(row => row.id)
	const catchupIds = [...new Set([...classic.catchupIds, ...retained])]
	const missed = snapshot.pageActionIds?.map(id => entities.actions[id]).find(action => action.kind === 'paste-missed')
	const version = snapshot.version
	const updateTiming = version && (version.channel === 'off' ? 'Updates when you check' : `Updates to ${version.channel === 'release' ? 'each release' : 'every change'}, ${version.everyMin >= 1440 ? 'checked once a day' : version.everyMin >= 60 ? 'checked every hour' : `checked every ${version.everyMin || 10} minutes`}`)
	const updateStatus = version && (version.failed ? `Could not check: ${version.failed}` : version.last?.rolledBack && version.last.to !== version.code ? `${version.last.to} did not start, so this stays on ${version.code}` : version.checkedAt ? `Up to date, checked ${when(version.checkedAt)}` : 'Not checked yet')
	return <>
		<section className="classic-hello"><h1>Since you were away</h1><p>{snapshot.since ? `You left ${when(snapshot.since)}` : 'In the last day'}{handled ? ` · ${NAME} handled ${handled} thing${handled === 1 ? '' : 's'} for you` : ''}</p></section>
		{/* R12c (C1): When you have a minute, the lines and the suggestion in Settings › Your way of working. */}
		{waysLinkShown(snapshot.ways) && <p className="classic-minute">When you have a minute: <WaysLink /></p>}
		<div className="classic-tiles"><section className="classic-tile classic-needs" role="group" aria-labelledby="classic-needs-title">
			{needs.length ? <><h2 className="classic-needs-head" id="classic-needs-title"><span className="classic-needs-number">{needs.length}</span><span>{needs.length === 1 ? 'needs you' : 'need you'}</span></h2>
				<ul>{needs.slice(0, 4).map(item => {
					const sent = sentAt(item)
					const person = entities.people[item.personId], avatar: CSSProperties & { '--hue': number } = { '--hue': person.hue }
					const retry = item.actionIds.some(id => entities.actions[id].kind === 'answer' && entities.actions[id].recovery)
					const headline = retry ? `Answer ${item.code} to retry with directions, or skip it` : item.question || item.ask || item.job
					return <li className="classic-needs-row" key={item.id}><a href={`#classic/focus/${item.code}`}><span className="classic-avatar" style={avatar} aria-hidden="true">{person.initials}</span><strong>{person.name.split(' ')[0]}</strong>					<span className="classic-peek-headline">										{messageText(headline ?? '').slice(0, 200)}</span><SentTime at={sent.at} added={sent.added} waiting code={item.code} /></a>{item.teams && <Button asChild variant="ghost" size="icon-xs" aria-label="Open in Teams"><a href={item.teams} target="_blank" rel="noopener noreferrer"><Icon name="ext" /></a></Button>}</li>
				})}</ul><div className="classic-needs-foot">
					{!readOnly && <a className="classic-start" href={`#classic/focus/${needs[0].code}`}>Start with {entities.people[needs[0].personId].name.split(' ')[0]} <Icon name="arrow" /></a>}
					{needs.length > 4 && <span>and {needs.length - 4} more</span>}
				</div></> : <><span className="classic-tile-icon classic-all-clear"><Icon name="check" /></span><h2 id="classic-needs-title">All clear</h2><p>Nothing needs you.</p></>}
		</section>{tiles.map(tile => <a className="classic-tile" key={tile.key} href={`#classic/${destinations[tile.key] ?? 'done'}`} aria-label={tile.label}><span className="classic-tile-icon"><Icon name={icons[tile.key] ?? 'check'} /></span><span className="classic-tile-go"><Icon name="arrow" /></span><TileSentence label={tile.label} count={tile.count} />{tile.sub && <span className="classic-tile-sub">{tile.sub}</span>}</a>)}</div>
		{catchupIds.length > 0 && <section className="classic-catchup"><div className="classic-section-head"><h2>Catch up · {snapshot.summary.catchup.count} new</h2>{!readOnly && snapshot.summary.catchup.count > 0 && snapshot.pageActionIds?.filter(id => entities.actions[id].kind === 'mark-all-read').map(id => <ActionButton key={id} action={entities.actions[id]} input={{ seenAt: snapshot.now }} />)}</div>
			<div className="classic-catchup-rows">{catchupIds.map(id => { const row = entries[id]; return row && (readOnly ? <article className="item-card" key={id}><h3>{row.sentence}</h3>{row.gist && <p>{row.gist}</p>}<small>{row.by} · {when(row.at)}</small></article> : <div key={id} onClickCapture={event => { if (event.target instanceof Element && event.target.closest('a[href^="https:"]')) seen.mark([`item:${row.code}`], snapshot.now) }}>{!classic.catchupIds.includes(id) && <p className="classic-retained-note">Your open edit is kept here; this is no longer a new Catch-up row.</p>}<Entry row={row} compact grouped open={false} onToggle={() => navigate('done/catchup')} /></div>) })}</div>
			{seen.error && <p role="alert" className="error">{seen.error}</p>}
			<a className="classic-more" href="#classic/done/catchup">{snapshot.summary.catchup.count > classic.catchupIds.length ? `${snapshot.summary.catchup.count - classic.catchupIds.length} more · ` : ''}See all</a>
		</section>}
		{classic.also.length > 0 && <section className="classic-also"><h2>Also for you</h2><div className="classic-also-tiles">{classic.also.map(tile => {
			// R11(1): "<N> working now" over "<M> queued · <reason>", never "N running" for queued work; muted "Nothing running" at 0 and 0.
			const busy = tile.key === 'running' && snapshot.busy ? busyWords(snapshot.busy) : undefined
			return <a className={`classic-mini${busy?.idle ? ' classic-mini-idle' : ''}`} key={tile.key} href={`#classic/${destinations[tile.key] ?? 'done'}`} title={busy?.title}><span className="classic-tile-icon"><Icon name={icons[tile.key] ?? 'check'} /></span>
				{busy ? <div><b>{busy.head}</b>{busy.sub && <span>{busy.sub}</span>}{busy.also && <span>{busy.also}</span>}</div> : <div><b>{tile.count || !tile.sub ? `${tile.count} ${tile.label}` : tile.sub}</b>{!!tile.count && tile.sub && <span>{tile.sub}</span>}</div>}</a>
		})}</div></section>}
		{!readOnly && <>{missed && <MissedMessage action={missed} />}<div className="classic-home-tools">{versionLabel(version) && <><span title={versionTitle(version)}>{versionLabel(version)}</span><span>{updateTiming}</span><span role={version?.failed || version?.last?.rolledBack ? 'alert' : undefined}>{updateStatus}</span></>}<PageTools kinds={['check-update', 'report-problem']} showDetails={false} title="" /></div></>}
	</>
}
