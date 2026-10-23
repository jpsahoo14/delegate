import { memo, useEffect, useRef, useState } from 'react'
import { useCardPresentation, useEntities, useSnapshot } from '../data/hooks.ts'
import { ClassicCard } from './Card.tsx'
import { Button } from '../components/ui/button.tsx'
import { useScreenNavigation } from './navigation.tsx'
import { Icon } from '../components/ui/icon.tsx'
import { Avatar } from './Avatar.tsx'
import { useData } from '../data/store.ts'
import { useNavigation } from '../data/navigation.ts'
import type { Entities, Snapshot } from '../domain/contracts.ts'
import { ViewportList } from '../components/ViewportList.tsx'
import { sentAt } from '../features/ItemCard.tsx'
import { SentTime } from '../features/SentTime.tsx'
import { codeHover } from '../domain/hover.ts'

const QueueItem = memo(function QueueItem({ item, person, chat, active, current }: { item: Entities['items'][string]; person: Entities['people'][string]; chat: Entities['chats'][string]; active: boolean; current: boolean }) {
	const sent = sentAt(item)
	return <div className="classic-queue-row"><a className={active ? undefined : 'classic-queue-handled'} href={`#classic/focus/${item.code}`} title={codeHover(item.code)} aria-current={current ? 'step' : undefined} data-classic-code={item.code} data-classic-live={active}>
		{active ? <Avatar person={person} /> : <span className="classic-queue-check"><Icon name="check" /></span>}<span className="classic-queue-text"><span className="classic-queue-name"><span>{person.name.split(/[\s,(]+/)[0]}</span><SentTime at={sent.at} added={sent.added} waiting={active} code={item.code} /></span><span className="classic-queue-preview">		{(item.question || item.ask || '').slice(0, 200)}</span><span className="classic-queue-chat">{chat.group ? `in ${chat.name}` : '1:1 chat'}</span></span>
	</a>{item.teams && <Button asChild variant="ghost" size="icon-xs" aria-label="Open in Teams"><a href={item.teams} target="_blank" rel="noopener noreferrer"><Icon name="ext" /></a></Button>}</div>
})

export default function Focus() {
	const snapshot = useSnapshot(), entities = useEntities(), { route, navigate } = useScreenNavigation()
	const pins = useData(state => state.pinned), setHelp = useNavigation(state => state.setHelp)
	const [wide, setWide] = useState(() => matchMedia('(min-width:961px)').matches)
	useEffect(() => {
		const media = matchMedia('(min-width:961px)'), changed = () => setWide(media.matches)
		media.addEventListener('change', changed)
		return () => media.removeEventListener('change', changed)
	}, [])
	const incoming = snapshot?.classic?.needsIds ?? []
	const visited = useRef<{ order: string[]; snapshots: Record<string, Snapshot> }>({ order: incoming, snapshots: {} })
	const visit = visited.current
	useEffect(() => {
		if (snapshot) visited.current = { order: [...new Set([...visited.current.order, ...incoming])], snapshots: { ...visited.current.snapshots, ...Object.fromEntries(incoming.map(code => [code, snapshot])) } }
	}, [snapshot])
	const shown = [...new Set([...visit.order, ...incoming])].filter(code => entities.items[code] || pins[code]?.snapshot.entities.items[code] || visit.snapshots[code]?.entities.items[code])
	const code = route.split('/')[1] ?? shown.find(code => incoming.includes(code)) ?? shown[0]
	const { primary } = useCardPresentation(code ?? '', undefined, visit.snapshots[code ?? ''])
	const live = shown.filter(code => incoming.includes(code)), index = live.indexOf(code)
	const next = index >= 0 ? live[index + 1] : shown.slice(shown.indexOf(code) + 1).find(code => incoming.includes(code)) ?? live[0]
	return <><h1 className="sr-only">Needs you</h1>
		{!shown.length ? <section className="empty"><h2>That&apos;s everything</h2><p>Nothing needs you right now.</p><a href="#classic/home">Home</a> - <a href="#classic/done">See what was done</a></section> :
			<div className="classic-focus">{wide && <nav className="classic-queue" aria-label="Needs you queue"><h2><span>Needs you</span><span>{live.length}</span></h2>			<ViewportList ordered scrollable className="classic-queue-window" ids={shown} estimate={74} gap={2} target={code} retained={Object.keys(pins)} render={id => {
				const data = entities.items[id] ? entities : pins[id]?.snapshot.entities ?? visit.snapshots[id].entities
				const item = data.items[id], person = data.people[item.personId], active = incoming.includes(id)
				return <QueueItem item={item} person={person} chat={data.chats[item.chatId]} active={active} current={id === code} />
			}} /></nav>}<section className="classic-open-card">
				<div className="classic-pager"><a href="#classic/home" aria-label="Back to Home"><Icon name="back" /></a><span className="classic-pager-spacer" />
					<Button variant="outline" aria-label="Previous item" disabled={index <= 0} onClick={() => navigate(`focus/${live[index - 1]}`)}><Icon name="left" /><span className="classic-pager-label">Previous</span></Button>
					<span className="classic-position">{index >= 0 ? `${index + 1} of ${live.length}` : `${live.length} left`}</span>
					<Button variant="outline" aria-label="Next item" disabled={!next} onClick={() => { if (next) navigate(`focus/${next}`) }}><span className="classic-pager-label">Next</span><Icon name="right" /></Button>
					<span className="classic-pager-spacer" /><Button variant="ghost" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Icon name="key" /></Button>
				</div>
				<ClassicCard key={code} code={code} fallback={visit.snapshots[code]} />
				{incoming.includes(code) && <div className="classic-key-hints"><span><kbd>j</kbd> next</span><span><kbd>k</kbd> previous</span><span><kbd>⌘</kbd><kbd>↵</kbd> {primary?.label.toLowerCase() ?? 'send'}</span><span><kbd>a</kbd> ask</span><span><kbd>l</kbd> later</span><span><kbd>?</kbd> all keys</span></div>}
			</section></div>}
	</>
}
