import { useEntities, useSnapshot } from '../data/hooks.ts'
import { usePageForms } from '../data/forms.ts'
import { ActionButton, ActionState } from '../features/ActionButton.tsx'
import { PageTools } from '../features/PageTools.tsx'
import type { Action } from '../domain/contracts.ts'
import { NAME } from '../brand.ts'

function TimingActions({ ids, code, rev, every }: { ids: string[]; code: string; rev: string; every?: number }) {
	const entities = useEntities(), fields = usePageForms(state => state.fields), setField = usePageForms(state => state.setField)
	const actions = ids.map(id => entities.actions[id]).filter((action): action is Action => !!action)
	const timing = actions.some(action => action.input === 'interval'), value = fields[`classic-interval:${code}`] ?? `${every ?? entities.watches[code]?.every ?? 60}m`
	return <>{timing && <label className="field-label">How often {code} checks<input value={value} onChange={event => setField(`classic-interval:${code}`, event.target.value)} /></label>}
		<div className="action-bar">{actions.map(action => <ActionButton key={action.id} action={action} input={action.input === 'interval' ? { text: value } : undefined} />)}</div><ActionState item={code} rev={rev} /></>
}

export default function Ongoing() {
	const snapshot = useSnapshot(), entities = useEntities(), classic = snapshot?.classic
	if (!classic) return <p role="alert">Classic data is not available. Reload after the app finishes updating.</p>
	const watches = Object.values(entities.watches), waiting = Object.values(entities.waiting), channels = Object.values(entities.channels), automations = Object.values(entities.automations)
	return <><h1>Ongoing</h1><p className="muted">Work still in progress, your asks nobody has answered, what {NAME} watches or is doing now, and your reminders.</p>
		<PageTools kinds={['watch-something', 'remind-someone']} showDetails={false} title="Make something happen" automation />
		{classic.progress.length > 0 && <section><h2>In progress</h2><p className="muted">Replied, and the work goes on. News comes back to the same item.</p>{classic.progress.map(row => <article className="item-card" key={row.code} data-classic-progress={row.code}><h3>{row.goal}</h3><p>{row.code} - {row.who} - {row.chat} - {row.status}</p>{row.last && <p>Last: {row.last.what} - {new Date(row.last.at).toLocaleString()}</p>}{row.next && <p>Next: {row.next}</p>}{row.checkAt && <p>I&apos;ll ask you on {new Date(row.checkAt).toLocaleDateString()} if nothing happens.</p>}{row.endsAt && <small>Until {new Date(row.endsAt).toLocaleDateString()}</small>}<TimingActions ids={row.actionIds} code={row.code} rev={row.rev} every={row.every} /></article>)}</section>}
		{waiting.length > 0 && <section><h2>Waiting on others</h2><p className="muted">No answer for a day. Follow up drafts a short nudge for you to check first.</p>{waiting.map(row => <article className="item-card" key={row.id} data-classic-waiting={row.code}><h3>You asked {row.to}</h3><p className="muted">{row.chat} - {new Date(row.at).toLocaleString()} - {row.code}</p><blockquote>{row.text}</blockquote>{row.link && <a href={row.link} target="_blank" rel="noopener noreferrer">Open in Teams</a>}<TimingActions ids={row.actionIds} code={row.code} rev={row.actionIds.map(id => entities.actions[id].rev)[0] ?? ''} /></article>)}</section>}
		{[true, false].map(updated => {
			const rows = watches.filter(watch => watch.update === updated)
			return rows.length > 0 && <section key={String(updated)}><h2>{updated ? `${rows.length} update${rows.length === 1 ? '' : 's'}` : 'No change'}</h2>{rows.map(watch => <article className="item-card" key={watch.id} data-classic-watch={watch.code}><h3>{watch.what}</h3><p>{watch.last}</p><small>{watch.code}{watch.changedAt ? ` - Changed ${new Date(watch.changedAt).toLocaleString()}` : ''}{watch.by ? ` - By ${watch.by}` : ''}{watch.nextAt ? ` - Next check ${new Date(watch.nextAt).toLocaleString()}` : ''}{watch.from ? ` - From ${watch.from}` : ''}{watch.endsAt ? ` - Until ${new Date(watch.endsAt).toLocaleDateString()}` : ''}</small><TimingActions ids={(classic.watchActionIds[watch.code] ?? watch.actionIds).filter(id => updated || entities.actions[id]?.kind !== 'classic-ack-watch')} code={watch.code} rev={watch.rev} /></article>)}</section>
		})}
		{channels.length > 0 && <section><h2>Channels</h2>{channels.map(channel => <article className="item-card" key={channel.id}><h3><a href={channel.link} target="_blank" rel="noopener noreferrer">{channel.name}</a></h3><p>Threads you start, post in, or are mentioned in.</p><TimingActions ids={channel.actionIds} code="" rev="" /></article>)}</section>}
		{classic.running.length > 0 && <section id="classic-running"><h2>Running</h2><p className="muted">Long work {NAME} is doing now. It tells you when each one is ready.</p>{classic.running.map((row, index) => <article className="item-card" key={`${row.code}:${index}`}><h3>{row.what}</h3><small>{row.who ? `For ${row.who} - ` : ''}since {new Date(row.since).toLocaleString()}{row.code ? ` - ${row.code}` : ''}</small><progress aria-label={row.what} max={1} value={row.progress} /><TimingActions ids={row.actionIds} code={row.code} rev={entities.items[row.code]?.rev ?? ''} /></article>)}</section>}
		<section id="classic-automations"><h2>Automations</h2><p className="muted">Each one carries the assistant marker and stops when {NAME} is paused.</p>{automations.length ? automations.map(row => <article className="item-card" key={row.id} data-classic-automation={row.code}><h3>{row.sentence}</h3><p>To {row.to}</p><blockquote>{row.text}</blockquote><p>{row.when} - {row.state} - {row.count} sent{row.next ? ` - Next ${new Date(row.next).toLocaleString()}` : ''}</p>{row.why && <p>{row.why}</p>}<TimingActions ids={classic.automationActionIds[row.code] ?? row.actionIds} code={row.code} rev={row.rev} /></article>) : <p className="empty">No automations yet.</p>}</section>
		{!classic.progress.length && !waiting.length && !watches.length && !channels.length && !classic.running.length && <p className="empty">Nothing else is ongoing.</p>}
	</>
}
