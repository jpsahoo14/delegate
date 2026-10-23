import type { CSSProperties } from 'react'
import type { Entities } from '../domain/contracts.ts'

export function Avatar({ person, large = false }: { person: Entities['people'][string]; large?: boolean }) {
	return <span className={`classic-avatar${large ? ' classic-avatar-large' : ''}`} style={{ '--hue': person.hue } as CSSProperties} aria-hidden="true">{person.initials}</span>
}
