import { useSnapshot } from '../data/hooks.ts'
import { ItemCard } from '../features/ItemCard.tsx'
import type { Snapshot } from '../domain/contracts.ts'
import { useScreenNavigation } from './navigation.tsx'

export function ClassicCard({ code, fallback, readOnly = false }: { code: string; fallback?: Snapshot; readOnly?: boolean }) {
	const snapshot = useSnapshot(), { navigate } = useScreenNavigation()
	const family = Object.values(snapshot?.entities.placements ?? {}).find(placement => placement.subjects.includes(code) && placement.subjects.length > 1)
	const placement = Object.values(snapshot?.entities.placements ?? {}).find(row => row.act === code)
	return <ItemCard code={code} placementId={readOnly ? undefined : placement?.id} fallback={fallback} readOnly={readOnly} asks={!readOnly && family ? { codes: family.subjects, onOpen: selected => navigate(`focus/${selected}`) } : undefined} />
}
