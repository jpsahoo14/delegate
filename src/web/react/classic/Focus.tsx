import { useEffect, useState } from 'react'
import { useEntities, useSnapshot } from '../data/hooks.ts'
import { ItemCard } from '../features/ItemCard.tsx'
import { Button } from '../components/ui/button.tsx'
import { useScreenNavigation } from './navigation.tsx'

export default function Focus() {
	const snapshot = useSnapshot(), entities = useEntities(), { route, navigate } = useScreenNavigation()
	const incoming = snapshot?.classic?.needsIds ?? []
	const [queue, setQueue] = useState(incoming)
	useEffect(() => { setQueue(previous => [...new Set([...previous, ...incoming])]) }, [snapshot?.classic?.needsIds])
	const shown = [...new Set([...queue, ...incoming])].filter(code => entities.items[code])
	const code = route.split('/')[1] ?? shown.find(code => incoming.includes(code)) ?? shown[0]
	const index = shown.indexOf(code)
	const step = (offset: number) => { if (shown[index + offset]) navigate(`focus/${shown[index + offset]}`) }
	return <><div className="classic-section-head"><h1>Needs you</h1><a href="#classic/home">Back Home</a></div>
		{!shown.length ? <section className="empty"><h2>That&apos;s everything</h2><p>Nothing needs you right now.</p><a href="#classic/home">Home</a> - <a href="#classic/done">See what was done</a></section> :
			<div className="classic-focus"><nav className="classic-queue" aria-label="Needs-you queue"><ol>{shown.map((id, position) => {
				const item = entities.items[id]
				return <li key={id}><a href={`#classic/focus/${id}`} aria-current={id === code ? 'step' : undefined} data-classic-code={id}><strong>{position + 1}. {entities.people[item.personId].name}</strong><span>{item.question || item.ask || item.job || item.status}</span><small>{id} - {incoming.includes(id) ? 'Needs you' : 'Handled this visit'}</small></a></li>
			})}</ol></nav><section className="classic-open-card">
				<div className="item-navigation"><Button variant="outline" disabled={index <= 0} onClick={() => step(-1)}>Previous</Button><span>{index >= 0 ? `${index + 1} of ${shown.length}` : code}</span><Button variant="outline" disabled={index < 0 || index >= shown.length - 1} onClick={() => step(1)}>Next</Button></div>
				{!incoming.includes(code) && <p role="status">This item has been handled. It stays in this visit&apos;s queue.</p>}
				<ItemCard code={code} />
			</section></div>}
	</>
}
