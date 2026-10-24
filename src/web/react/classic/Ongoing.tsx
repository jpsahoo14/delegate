import { useAction, useCardUi, useEntities, useItemBusy, useSnapshot } from '../data/hooks.ts'
import { usePageForms } from '../data/forms.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import type { Action, Entities } from '../domain/contracts.ts'
import { when } from '../domain/time.ts'
import { Icon } from '../components/ui/icon.tsx'
import { Avatar } from './Avatar.tsx'
import { OngoingSheet } from './OngoingSheet.tsx'
import { NAME } from '../brand.ts'
import { useState } from 'react'
import { MessageBubble } from '../features/ItemCard.tsx'
import { SentTime } from '../features/SentTime.tsx'
import { busyReason } from '../data/busy.ts'
import { Hint } from '../components/ui/button.tsx'
import { codeHover, disabledHover, hoverOf } from '../domain/hover.ts'

const CodeHint = ({ code }: { code: string }) => <Hint text={codeHover(code)}><span className="code">{code}</span></Hint>
import './ongoing.css'

const INTERVALS: [number, string][] = [[60, '1 h'], [120, '2 h'], [240, '4 h'], [480, '8 h'], [1440, '1 day']]
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const preview = (text: string, length: number) => text.length > length ? `${text.slice(0, length)}…` : text

function Timing({ action, every, endsAt, extend }: { action?: Action; every?: number; endsAt?: string; extend?: Action }) {
	const act = useAction(), busy = useItemBusy(action?.item ?? ''), ui = useCardUi(action?.item ?? '', action?.rev ?? '')
	const entities = useEntities(), unavailable = action && (entities.actions[action.id]?.unavailable ?? action.unavailable)
	const fields = usePageForms(state => state.fields), setField = usePageForms(state => state.setField)
	if (!every || !action) return null
	const options = INTERVALS.some(([minutes]) => minutes === every) ? INTERVALS : [...INTERVALS, [every, `${every} min`] as [number, string]].sort((a, b) => a[0] - b[0])
	const key = `classic-interval:${action.item}`, value = ui.pending ? fields[key] ?? `${every}m` : `${every}m`
	return <div className="ongoing-timing"><label>Every <Hint text={disabledHover({ busy, unavailable: unavailable?.reason }, hoverOf(action.kind, action.label))}><select aria-label={`How often ${action.item} checks`} value={value} disabled={busy || !!unavailable} onChange={event => {
		setField(key, event.target.value)
		void act(action, { text: event.target.value })
	}}>{options.map(([minutes, label]) => <option key={minutes} value={`${minutes}m`}>{label}</option>)}</select></Hint></label>
		{endsAt && <><span>until {shortDate(endsAt)}</span>{extend && <ActionButton action={extend} />}</>}
	</div>
}

function RowActions({ actions, primary, className = '' }: { actions: Action[]; primary?: string; className?: string }) {
	const first = actions[0], ui = useCardUi(first?.item ?? '', first?.rev ?? '')
	const finished = !!ui.result && ui.result.accepted && !ui.result.refused && !ui.result.uncertain && !ui.pending && actions.some(action => action.id === ui.lastAction)
	return <div className={`ongoing-actions ${className}`}>{!finished && actions.map(action => <span className={['classic-close', 'stop-watch', 'dismiss-waiting', 'end', 'stop-channel'].includes(action.kind) ? 'ongoing-action-ghost' : action.label === 'Resume' ? 'ongoing-action-resume' : undefined} key={action.id}><ActionButton action={action} primary={action.kind === primary} /></span>)}</div>
}

function RowState({ actions }: { actions: Action[] }) {
	return <>{actions.filter((action, index) => actions.findIndex(other => other.item === action.item && other.rev === action.rev) === index).map(action => <ActionState key={`${action.item}:${action.rev}`} item={action.item} rev={action.rev} />)}</>
}

function Watch({ watch, actions }: { watch: Entities['watches'][string]; actions: Action[] }) {
	const interval = actions.find(action => action.input === 'interval'), extend = actions.find(action => action.kind === 'extend-watch')
	const plan = [
		watch.by ? `By ${new Date(`${watch.by}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : '',
		watch.nextAt && Date.parse(watch.nextAt) > Date.now() ? `next check ${when(watch.nextAt)}` : '',
		watch.from ? `from ${watch.from}` : '',
	].filter(Boolean).join(' · ')
	const controls = actions.filter(action => action.input !== 'interval' && action.kind !== 'extend-watch' && (watch.update || action.kind !== 'classic-ack-watch'))
	const timing = <Timing action={interval} every={watch.every} endsAt={watch.endsAt} extend={extend} />
	return watch.update ? <article className="ongoing-card" data-classic-watch={watch.code} aria-labelledby={`watch-${watch.code}`}>
		<div className="ongoing-card-head"><span className="ongoing-icon"><Icon name="eye" /></span><div className="ongoing-text"><h3 id={`watch-${watch.code}`}>{watch.what}</h3><span className="ongoing-meta">{[watch.changedAt ? `Changed ${when(watch.changedAt)}` : '', plan].filter(Boolean).join(' · ')}</span></div><CodeHint code={watch.code} /></div>
		<div className="ongoing-change"><span>{watch.last}</span></div>{timing}<RowActions actions={controls} primary="classic-ack-watch" /><RowState actions={actions} />
	</article> : <li className="ongoing-row" data-classic-watch={watch.code}><span className="ongoing-icon"><Icon name="eye" /></span>
		<div className="ongoing-text"><b>{watch.what}</b><span className="ongoing-meta">{watch.last}</span>{plan && <span className="ongoing-meta">{plan}</span>}{timing}<RowState actions={actions} /></div><CodeHint code={watch.code} /><RowActions actions={controls} />
	</li>
}

export default function Ongoing() {
	const [opened, setOpened] = useState<Record<string, boolean>>({})
	const snapshot = useSnapshot(), entities = useEntities(), classic = snapshot?.classic
	if (!classic) return <p role="alert">Classic data is not available. Reload after the app finishes updating.</p>
	const watches = Object.values(entities.watches), waiting = Object.values(entities.waiting), channels = Object.values(entities.channels), automations = Object.values(entities.automations)
	const actionsOf = (ids: string[]) => ids.map(id => entities.actions[id]).filter((action): action is Action => !!action)
	const updates = watches.filter(watch => watch.update), rest = watches.filter(watch => !watch.update)
	return <div className="classic-ongoing">
		<div className="ongoing-heading"><div><h1>Ongoing</h1><p>Work still in progress, your asks nobody has answered, what {NAME} watches or is doing now, and your reminders.</p></div><OngoingSheet /></div>
		{classic.progress.length > 0 && <section><h2 className="ongoing-section-title ongoing-first-title">In progress</h2><p className="ongoing-description">Replied, and the work goes on. News comes back to the same item.</p><ul className="ongoing-rows">{classic.progress.map(row => {
			const actions = actionsOf(row.actionIds), person = Object.values(entities.people).find(person => person.name === row.who)
			return <li className="ongoing-row" key={row.code} data-classic-progress={row.code}>
				{person ? <Avatar person={person} /> : <span className="ongoing-icon"><Icon name="task" /></span>}
				<div className="ongoing-text"><b>{row.goal}</b><span className="ongoing-meta">{[row.code, row.who, row.status].join(' · ')}</span>
					{(todoIds => todoIds.length > 0 && entities.todos[todoIds[0]] && <span className="ongoing-meta" data-left-for-you>Left for you: {entities.todos[todoIds[0]].text}{todoIds.length > 1 ? ` (+${todoIds.length - 1} more)` : ''}</span>)(entities.items[row.code]?.todoIds ?? [])}
					{row.last && <span className="ongoing-meta">Last: {preview(row.last.what, 160)} · {when(row.last.at)}</span>}
					{row.checkAt && <span className="ongoing-meta">I&apos;ll ask you on {shortDate(row.checkAt)} if nothing happens</span>}
					<Timing action={actions.find(action => action.input === 'interval')} every={row.every} endsAt={row.endsAt} extend={actions.find(action => action.kind === 'classic-extend')} /><RowState actions={actions} />
				</div><a href={`#classic/focus/${row.code}`}>Open</a><RowActions actions={actions.filter(action => ['classic-close', 'stop-watch'].includes(action.kind))} />
			</li>
		})}</ul></section>}
		{waiting.length > 0 && <section><h2 className="ongoing-section-title ongoing-first-title">Waiting on others</h2><p className="ongoing-description">No answer for a day. Follow up drafts a short nudge for you to check first.</p><div className="ongoing-grid">{waiting.map(row => {
			const actions = actionsOf(row.actionIds)
			return <article className="ongoing-card" key={row.id} data-classic-waiting={row.code} aria-labelledby={`waiting-${row.code}`}><div className="ongoing-card-head"><span className="ongoing-icon"><Icon name="clock" /></span><div className="ongoing-text"><h3 id={`waiting-${row.code}`}>You asked {row.to}</h3>			<span className="ongoing-meta">{row.chat} · <SentTime at={row.at} code={row.code} />{row.link && <> · <a href={row.link} target="_blank" rel="noopener noreferrer">Open in Teams</a></>}			</span></div><CodeHint code={row.code} /></div>
				<MessageBubble text={row.text} teams={row.link} open={!!opened[row.code]} onToggle={value => setOpened(previous => ({ ...previous, [row.code]: value }))} /><RowActions actions={actions.map(action => action.kind === 'follow-up' ? { ...action, label: 'Follow up' } : action)} primary="follow-up" /><RowState actions={actions} />
			</article>
		})}</div></section>}
		{updates.length > 0 && <section><h2 className="ongoing-section-title ongoing-first-title">{updates.length} update{updates.length === 1 ? '' : 's'}</h2><div className="ongoing-grid">{updates.map(watch => <Watch key={watch.id} watch={watch} actions={actionsOf(classic.watchActionIds[watch.code] ?? watch.actionIds)} />)}</div></section>}
		{rest.length > 0 && <section><h2 className="ongoing-section-title">No change</h2><ul className="ongoing-rows">{rest.map(watch => <Watch key={watch.id} watch={watch} actions={actionsOf(classic.watchActionIds[watch.code] ?? watch.actionIds)} />)}</ul></section>}
		{channels.length > 0 && <section><h2 className="ongoing-section-title">Channels</h2><ul className="ongoing-rows">{channels.map(channel => {
			const actions = actionsOf(channel.actionIds)
			return <li className="ongoing-row" key={channel.id}><span className="ongoing-icon"><Icon name="eye" /></span><div className="ongoing-text"><b><a href={channel.link} target="_blank" rel="noopener noreferrer">{channel.name}</a></b><span className="ongoing-meta">Threads you start, post in, or are mentioned in</span><RowState actions={actions} /></div><RowActions actions={actions} /></li>
		})}</ul></section>}
		{classic.running.length > 0 && <section id="classic-running"><h2 className="ongoing-section-title">Running</h2><p className="ongoing-description">Long work {NAME} is doing now. It tells you when each one is ready.</p><div className="ongoing-grid">{classic.running.map((row, index) => {
			const actions = actionsOf(row.actionIds)
			const held = !!row.detail?.startsWith('Held:')
			// R11(1): a queued row has a clock and why it waits, never a progress bar; the projection lists the working ones first.
			const queuedWhy = row.queued && snapshot?.busy ? busyReason(snapshot.busy) : undefined
			return <article className="ongoing-card" key={`${row.code}:${index}`} data-queued={row.queued || undefined}><div className="ongoing-card-head"><span className="ongoing-icon ongoing-accent"><Icon name={row.queued ? 'clock' : row.code ? 'pr' : 'book'} /></span><div className="ongoing-text"><h3>{row.what}</h3><span className="ongoing-meta">{row.who && `For ${row.who} · `}{row.queued ? 'queued' : 'started'} {when(row.since)}</span></div>			{row.code && <CodeHint code={row.code} />}</div>
				{row.retry ? <div className="ongoing-description"><p>Retry {row.retry.attempt} scheduled for {when(row.retry.at)}: {row.retry.reason}</p>{row.retry.tried.length > 0 && <p>Tried: {row.retry.tried.join('; ')}</p>}</div> : row.detail && row.detail !== row.what && <p className="ongoing-description">{row.detail}</p>}
				{row.queued ? queuedWhy && <p className="ongoing-description">Queued · {queuedWhy}</p> : !held && (row.sendAt ? <p className="ongoing-description">Sends at <time dateTime={row.sendAt}>{when(row.sendAt)}</time>. Hold it to review before sending.</p> : <div className="ongoing-bar" role="progressbar" aria-label={row.what} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.progress === undefined ? undefined : Math.round(row.progress * 100)} aria-valuetext={row.progress === undefined ? 'Running' : undefined}><i className={row.progress === undefined ? 'ongoing-indeterminate' : undefined} style={row.progress === undefined ? undefined : { width: `${Math.max(4, Math.round(row.progress * 100))}%` }} /></div>)}
				<RowActions actions={actions} className="ongoing-right-actions" /><RowState actions={actions} />
			</article>
		})}</div></section>}
		{automations.length > 0 && <section id="classic-automations"><h2 className="ongoing-section-title">Automations</h2><p className="ongoing-description">Each one carries the assistant marker and stops when {NAME} is paused.</p><ul className="ongoing-rows ongoing-automations">{automations.map(row => {
			const actions = actionsOf(classic.automationActionIds[row.code] ?? row.actionIds)
			return <li className={`ongoing-automation${row.state === 'paused' ? ' ongoing-paused' : ''}`} key={row.id} data-classic-automation={row.code}><span className="ongoing-icon"><Icon name="clock" /></span><div className="ongoing-text">{row.sentence}<span className="ongoing-meta">{row.state === 'paused' ? row.why ? `Paused: ${row.why}` : 'Paused' : row.state === 'proposed' ? 'Not started' : row.next ? `Next: ${when(row.next)}` : ''}{row.count > 0 && ` · Sent ${row.count} time${row.count === 1 ? '' : 's'}`}</span><RowState actions={actions} />			</div><CodeHint code={row.code} /><RowActions actions={actions} /></li>
		})}</ul></section>}
		{!classic.progress.length && !waiting.length && !watches.length && !channels.length && !classic.running.length && !automations.length && <p className="empty">Nothing is ongoing. Say &quot;watch PR 1234 until merged&quot;, or &quot;remind Arun every weekday at 4 pm to update the doc&quot;.</p>}
	</div>
}
