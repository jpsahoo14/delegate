// Fresh data every 20 s, faster while an Ask answer is on its way, with backoff while offline.
import { sleep, type IO } from './transport.ts'
import type { View } from '../model/types.ts'

export type PollHooks = { since(): string | undefined; ui?(): 'new' | 'classic'; waiting(): boolean; got(v: View): void; lost(): void }
export function poll(io: IO, every: number, o: PollHooks) {
	void (async () => {
		let back = 0
		for (;;) {
			await sleep(back || (o.waiting() ? every * 2 : every * 10))
			try { const nv = await io.data(o.since(), o.ui?.()); back = 0; o.got(nv) } catch { back = Math.min((back || every) * 2, 15000); o.lost() }
		}
	})()
}
