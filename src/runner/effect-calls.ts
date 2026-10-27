import { isDeepStrictEqual } from 'node:util'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import type { Call, Effect } from '../core/types.ts'
import type { ToolInfo } from '../core/tool-class.ts'
import type { Catalog } from './catalog.ts'
import { effectLeftAction } from '../core/effects.ts'
import { leftRefusal, type LeftDraft } from '../core/left-lines.ts'

export type CommentRef = { project: string; repositoryId: string; pullRequestId: number }
export type EffectCallRepair = { event: 'effect-call-repaired'; from: 'threadContext' | 'rebuilt'; ok: boolean }
export type EffectCallPreparation = {
	effects: Effect[]; problems: string[]; repaired: number[]; left: LeftDraft[]
	failures: { effect: Effect; why: string; left: LeftDraft }[]
}
type ListedTool = { name: string; server: string; info: ToolInfo }
type BuiltCall = { call: Call; problem?: never } | { call?: never; problem: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const line = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const threadTool = (name: string) => /(?:^|[-_])(?:repo_)?pull_request_thread_write(?::create)?$/i.test(name)
export const isInlineComment = (effect: Effect) => threadTool(effect.call?.tool ?? '') && /^(?:create|comment|post_comment)$/i.test(effect.action) ||
	/^(?:post[_ -]?)?(?:pr[_ -]?)?comment$/i.test(effect.action) && /\bPR(?:\b|\d)|pull[\s_-]?requests?/i.test(effect.target)

export function effectCallProblem(call: Call, info: ToolInfo): string | undefined {
	const schema = info.inputSchema
	if (!schema?.properties || !Object.keys(schema.properties).length) return "the tool's input format isn't available"
	if (!object(call.args)) return 'the call needs named fields'
	// Match the MCP execution precheck even when additionalProperties is not explicitly false.
	const unknown = Object.keys(call.args).find(k => !Object.hasOwn(schema.properties!, k))
	if (unknown) return `the tool doesn't take '${unknown}'`
	try {
		// Catalogs retain the complete JSON Schema; ToolInfo declares only its discovery fields.
		const result = new AjvJsonSchemaValidator().getValidator(schema as JsonSchemaType)(call.args)
		return result.valid ? undefined : `the call doesn't match the tool's input format: ${result.errorMessage}`
	} catch {
		return "the tool's input format couldn't be checked; refresh its tool catalog"
	}
}

export function buildCommentCall(payload: unknown, ref: CommentRef | undefined, tool: { name: string; info: ToolInfo }): BuiltCall {
	if (!object(payload)) return { problem: 'the finding needs a file, line and comment text' }
	if (!text(payload.file)) return { problem: 'the file is missing' }
	if (!line(payload.line)) return { problem: 'the line is missing or is not a positive whole number' }
	if (!text(payload.text)) return { problem: 'the comment text is missing' }
	if (payload.endLine !== undefined && (!line(payload.endLine) || payload.endLine < payload.line)) return { problem: 'the end line must be a whole number at or after the start line' }
	if (!ref || !text(ref.project) || !text(ref.repositoryId) || !line(ref.pullRequestId)) return { problem: 'the pull request reference is incomplete' }
	const properties = tool.info.inputSchema?.properties
	if (!properties) return { problem: "the comment tool's input format isn't available" }
	const args: Record<string, unknown> = {}
	const fields: [string[], unknown][] = [
		[['action', 'operation'], 'create'],
		[['project', 'projectName'], ref.project],
		[['repositoryId', 'repository', 'repoId'], ref.repositoryId],
		[['pullRequestId', 'pullRequestNumber', 'prId'], ref.pullRequestId],
		[['filePath', 'file', 'path'], payload.file],
		[['rightFileStartLine', 'startLine', 'line'], payload.line],
		[['rightFileStartOffset', 'startOffset'], 1],
		[['rightFileEndLine', 'endLine'], payload.endLine ?? payload.line],
		[['rightFileEndOffset', 'endOffset'], line(payload.endLineLength) ? payload.endLineLength : 1],
		[['content', 'text', 'body'], payload.text],
	]
	for (const [names, value] of fields) {
		const key = names.find(k => Object.hasOwn(properties, k))
		if (!key) return { problem: `the comment tool has no supported '${names[0]}' field; refresh its tool catalog` }
		args[key] = value
	}
	const call = { tool: tool.name, args }, problem = effectCallProblem(call, tool.info)
	return problem ? { problem } : { call }
}

// Worker proposals only. Add server-built author questions afterward and check those with effectCallProblem.
// Preparation never executes or approves: repaired pending effects need approval of the new card revision.
export function prepareEffectCalls(
	effects: Effect[], ref: CommentRef | undefined, catalogs: Record<string, Pick<Catalog, 'tools'>>,
	log: (repair: EffectCallRepair) => void,
	defer: (effect: Effect) => boolean = () => false,
): EffectCallPreparation {
	const tools: ListedTool[] = Object.entries(catalogs).flatMap(([server, catalog]) =>
		catalog.tools.map(t => ({ server, name: `${server}-${t.name}`, info: t.info })))
	const comments = tools.filter(t => threadTool(t.name))
	const result: EffectCallPreparation = { effects: [], problems: [], repaired: [], left: [], failures: [] }
	const problemLeft = (effect: Effect, why: string, comment = false) => {
		const action = effectLeftAction(effect, ref?.pullRequestId)
		const draft = { ...leftRefusal(comment ? { ...action, verb: 'comment' } : action, 'incomplete'), why }
		result.left.push(draft)
		result.problems.push(draft.why)
		result.failures.push({ effect, why, left: draft })
	}
	let n = 0
	for (const [index, effect] of effects.entries()) {
		if (defer(effect)) { result.effects.push(effect); continue }
		const name = effect.call?.tool ?? ''
		const isComment = isInlineComment(effect)
		if (!isComment) {
			const tool = tools.find(t => t.name === name)
			const problem = !effect.call ? 'no exact call was provided' : !tool ? 'the tool is not in the cached catalog' : effectCallProblem(effect.call, tool.info)
			if (problem) {
				problemLeft(effect, `Couldn't prepare change ${index + 1}: ${problem}`)
				log({ event: 'effect-call-repaired', from: 'rebuilt', ok: false })
			} else result.effects.push(effect)
			continue
		}

		n++
		const exact = comments.find(t => t.name === name || `${t.name}:create` === name)
		const candidates = comments.filter(t => t.server === effect.system)
		const tool = exact ?? (candidates.length === 1 ? candidates[0] : undefined)
		const built = tool ? buildCommentCall(effect.payload, ref, tool) : { problem: "the comment tool isn't uniquely identified in the cached catalog" }
		const from = object(effect.call?.args) && Object.hasOwn(effect.call.args, 'threadContext') ? 'threadContext' : 'rebuilt'
		if (!built.call) {
			problemLeft(effect, `Couldn't prepare comment ${n}: ${built.problem}`, true)
			log({ event: 'effect-call-repaired', from, ok: false })
		} else if (isDeepStrictEqual(effect.call, built.call)) result.effects.push(effect)
		else {
			result.effects.push({ ...effect, call: built.call })
			result.repaired.push(index)
			log({ event: 'effect-call-repaired', from, ok: true })
		}
	}
	return result
}
