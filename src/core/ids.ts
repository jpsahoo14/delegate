import { randomBytes } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let last = { t: -1, r: [] as number[] }

// Monotonic within a process: IDs made in the same millisecond still sort in creation order.
export function ulid(now = Date.now()): string {
	if (now === last.t) {
		let i = 15
		while (i >= 0 && last.r[i] === 31) last.r[i--] = 0
		if (i >= 0) last.r[i]++
	} else last = { t: now, r: [...randomBytes(16)].map(b => b % 32) }
	let t = '', n = now
	for (let i = 0; i < 10; i++) { t = B32[n % 32] + t; n = Math.floor(n / 32) }
	return t + last.r.map(i => B32[i]).join('')
}

export function itemCode(n: number, prefix = 'A'): string {
	return `${prefix}${n}`
}

export function isCode(s: string): boolean {
	return /^[A-Z]\d+$/.test(s)
}
