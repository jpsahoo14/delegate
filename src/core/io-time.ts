import { AsyncLocalStorage } from 'node:async_hooks'

export const netTime = { ms: 0 }
const active = new AsyncLocalStorage<{ open: boolean }>()
const wrapped = new WeakMap<object, object>()

export function timeExternal<T>(work: () => Promise<T>): Promise<T>
export function timeExternal<T>(work: () => T): T
export function timeExternal(work: () => unknown): unknown {
	if (active.getStore()?.open) return work()
	const span = { open: true }, started = performance.now()
	const stop = () => { if (span.open) { span.open = false; netTime.ms += performance.now() - started } }
	return active.run(span, () => {
		try {
			const result: unknown = work()
			if (result instanceof Promise) return result.finally(stop)
			stop()
			return result
		} catch (error) { stop(); throw error }
	})
}

// Nested API boundaries count once; this is external-call latency, not wall time minus filesystem time.
export function timedExternal<T extends object>(value: T): T {
	const old = wrapped.get(value)
	if (old) return old as T
	const methods = new Map<PropertyKey, { method: Function; timed: (...args: unknown[]) => unknown }>()
	const proxy = new Proxy(value, {
		apply(target, receiver, args: unknown[]) { return timeExternal(() => Reflect.apply(target as Function, receiver, args)) },
		get(target, key) {
			const member: unknown = Reflect.get(target, key, target)
			if (typeof member !== 'function' || key === 'constructor') return member
			const hit = methods.get(key)
			if (hit?.method === member) return hit.timed
			const timed = (...args: unknown[]) => timeExternal(() => Reflect.apply(member, target, args))
			methods.set(key, { method: member, timed })
			return timed
		},
	})
	wrapped.set(value, proxy)
	wrapped.set(proxy, proxy)
	return proxy
}

export function timedCall<T extends Function>(get: () => T): T {
	return new Proxy(get(), { apply(_target, receiver, args: unknown[]) {
		return timeExternal(() => Reflect.apply(get(), receiver, args))
	} })
}
