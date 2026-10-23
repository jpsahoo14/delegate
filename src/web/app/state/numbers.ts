// The Numbers tab's calls (R-NEX-11). The numbers come only when the tab opens and when its window changes; /data never
// carries them, and polling never asks again.
import { numbersModel } from '../../model/numbers.ts'
import type { WindowKey } from '../../model/types.ts'
import { S, env, hooks } from './store.ts'

// The owner asked for this, so it draws at once, even with focus still on the window select (review P1-1): renderSoon waits
// while a field is focused, and a select always has a value. Elsewhere it waits as any update does.
const draw = () => (S.route.split('/')[0] === 'numbers' ? hooks.render() : hooks.renderSoon())

export const hasNumbers = () => !!env.io?.numbers

export async function loadNumbers(win: WindowKey = S.num.win) {
	const io = env.io
	if (!io?.numbers) return
	const seq = ++S.num.seq
	if (win !== S.num.win) S.num.data = undefined
	Object.assign(S.num, { win, busy: true, failed: false })
	draw()
	try {
		const d = await io.numbers(win)
		if (seq !== S.num.seq) return
		Object.assign(S.num, { data: d, busy: false })
	} catch {
		if (seq !== S.num.seq) return
		Object.assign(S.num, { busy: false, failed: true })
	}
	draw()
}

// Numbers only: the summary has no names, no message text, and no item codes.
export function copySummary() {
	const d = S.num.data
	if (!d) return
	const text = numbersModel(d, env.name).summary
	const failed = () => hooks.say('Could not copy. Open "See what is copied" and copy it yourself.', false)
	try { const p = navigator.clipboard?.writeText(text); if (p) p.then(() => hooks.say('Summary copied: numbers only, no names and no message text.'), failed); else failed() } catch { failed() }
}
