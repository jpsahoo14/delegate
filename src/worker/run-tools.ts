import { telemetryEvent, traceRun, writeTelemetry, type TelemetryEvent, type TraceContext } from '../core/telemetry.ts'
import type { Store } from '../store/state.ts'

type ToolShape = Omit<Extract<TelemetryEvent, { event: 'run-tools' }>, 'event'>
type Started = { call: number; tool: string; at?: number; result?: Record<string, unknown>; endedAt?: number }
const object = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const toolName = (value: unknown) => typeof value === 'string' && /^[\w.:-]{1,160}$/.test(value) ? value : 'unknown'
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined
const blockTypes = new Set(['text', 'image', 'audio', 'resource', 'resource_link', 'file'])
const envelopeKeys = new Set(['content', 'structuredContent', 'isError', 'text', 'textResultForLlm', 'resultType',
	'binaryResultsForLlm', 'error', 'image', 'data', 'value', 'items', 'nextLink', 'count'])

// Inspect only the recorded envelope. Never open offloaded result files or copy arguments, text, error messages or binary data.
function resultShape(value: unknown) {
	const result = object(value), content = typeof value === 'string' || Array.isArray(value) ? value : result.content
	const contentTypes = new Set<string>()
	const blocks = Array.isArray(content) ? content : content === undefined ? [] : [content]
	for (const block of blocks) {
		if (typeof block === 'string') contentTypes.add('text')
		else {
			const type = object(block).type
			contentTypes.add(typeof type === 'string' && blockTypes.has(type) ? type : 'unknown')
		}
	}
	if (result.structuredContent !== undefined) contentTypes.add('json')
	if (typeof result.text === 'string' || typeof result.textResultForLlm === 'string') contentTypes.add('text')
	if (result.image !== undefined || Array.isArray(result.binaryResultsForLlm)) contentTypes.add('image')
	if (value !== undefined && !contentTypes.size) contentTypes.add('json')
	const names = Object.keys(result)
	const keys = [...new Set(names.slice(0, 20).map(key => envelopeKeys.has(key) ? key : 'other'))]
	return {
		bytes: value === undefined ? 0 : Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'),
		contentTypes: [...contentTypes].sort(), keys, keysTruncated: names.length > 20,
		offloaded: blocks.some(block => typeof block === 'string' && /Output too large[^\n]*Saved to:/i.test(block) ||
			typeof object(block).text === 'string' && /Output too large[^\n]*Saved to:/i.test(String(object(block).text))),
	}
}

export function runToolShapes(slice: string): { calls: ToolShape[]; invalidLines: number } {
	const calls = new Map<string, Started>()
	let invalidLines = 0
	for (const line of slice.split('\n')) {
		if (!line.trim()) continue
		let parsed: unknown
		try { parsed = JSON.parse(line) } catch { invalidLines++; continue }
		const event = object(parsed), data = object(event.data), id = data.toolCallId
		if (!['tool.execution_start', 'tool.execution_complete'].includes(String(event.type))) continue
		if (typeof id !== 'string') { invalidLines++; continue }
		if (event.type === 'tool.execution_start') {
			if (!calls.has(id)) calls.set(id, { call: calls.size + 1, tool: toolName(data.toolName ?? data.mcpToolName), at: timestamp(event.timestamp) })
		} else {
			const started = calls.get(id) ?? { call: calls.size + 1, tool: toolName(data.toolName ?? data.mcpToolName) }
			if (started.result) continue
			calls.set(id, { ...started, result: data, endedAt: timestamp(event.timestamp) })
		}
	}
	return { invalidLines, calls: [...calls.values()].map(start => {
		const done = start.result, result = object(done?.result)
		const failed = done?.success === false || result.isError === true || result.error === true || result.resultType === 'failure'
		const status: ToolShape['class'] = !done ? 'unfinished' : failed ? 'tool-error' : done.error != null ? 'exception' : done.success === true ? 'ok' : 'unknown'
		const ms = start.at !== undefined && start.endedAt !== undefined && start.endedAt >= start.at ? start.endedAt - start.at : undefined
		return { call: start.call, tool: start.tool, ok: status === 'ok', class: status, ...(ms === undefined ? {} : { ms }), ...resultShape(done?.result) }
	}) }
}

// Call once after every run, including failed/no-report runs, with only that run's session slice and inherited trace + runId.
// Inspection/write failures emit metadata diagnostics, never stop the run. bytes measures the recorded UTF-8 envelope, not an offloaded file.
export function logRunTools(store: Pick<Store, 'machine' | 'log'>, slice: string, ctx: TraceContext & { runId: string }): number {
	return traceRun(ctx, () => {
		try {
			const shapes = runToolShapes(slice)
			for (const fields of shapes.calls) writeTelemetry(store.machine, entry => store.log(entry), telemetryEvent('run-tools', fields))
			if (shapes.invalidLines) writeTelemetry(store.machine, entry => store.log(entry), telemetryEvent('run-tools-invalid', { class: 'invalid-json', lines: shapes.invalidLines }))
			return shapes.calls.length
		} catch {
			writeTelemetry(store.machine, entry => store.log(entry), telemetryEvent('run-tools-invalid', { class: 'inspection-error' }))
			return 0
		}
	})
}
