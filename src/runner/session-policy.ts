import { randomUUID } from 'node:crypto'

export type SessionFamily = 'reply' | 'ask' | 'job' | 'item' | 'one-off'
export type TodaySession = { fresh: true } | { keep: string }

const POLICY: Readonly<Record<SessionFamily, 'today'>> = {
	reply: 'today',
	ask: 'today',
	job: 'today',
	item: 'today',
	'one-off': 'today',
}

export function chooseSession(family: SessionFamily, today: TodaySession): string {
	switch (POLICY[family]) {
		case 'today': return 'keep' in today ? today.keep : randomUUID()
	}
}
