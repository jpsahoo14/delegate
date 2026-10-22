// Prepare blind production prompts, then score independently produced reports through dispatch. No workplace store or network.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { Config } from '../src/core/types.ts'
import { ReportSchema } from '../src/core/report.ts'
import { Store } from '../src/store/state.ts'
import { writeJson, writeText } from '../src/store/fs.ts'
import { intake } from '../src/runner/intake.ts'
import { dispatch } from '../src/runner/dispatch.ts'
import { buildPrompt } from '../src/worker/prompt.ts'
import { outcomeOf, ReplaySource, type Expect } from './eval.ts'

export type FictionalCase = { id: string; text: string; expect: Expect }
const profile = 'Robin Park owns the widget service, registration reliability and partner onboarding. Robin reviews widget PRs and attends widget architecture meetings. Picnic catering is unrelated to their work.'
const at = '2026-01-15T12:00:00.000Z'
const chat = { id: 'fictional-room', name: 'Widget room', group: true, test: false }
const source = (text: string) => new ReplaySource(chat.id, [], { id: '101', at, from: { id: 'kim', name: 'Kim' }, html: false, body: text })

export async function prepareFictional(cases: FictionalCase[]) {
	const root = mkdtempSync(join(tmpdir(), 'delegate-fictional-eval-'))
	const inputs = []
	for (const c of cases) {
		if (!/^[a-z0-9-]+$/i.test(c.id)) throw new Error('Invalid fictional case id')
		const store = new Store({ root: join(root, c.id), machine: 'eval' })
		const cfg: Config = {
			schema: 1, owner: { id: 'robin', name: 'Robin Park' }, source: { command: [], selfChatId: 'self' }, watch: [chat],
			agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 1, nudgeEveryMin: 30,
		}
		store.saveConfig(cfg)
		writeText(join(store.root, 'profile.md'), profile, 'eval')
		await intake(store, source(c.text), cfg, {})
		const wf = store.workflows()[0]
		if (!wf) throw new Error(`No candidate for ${c.id}`)
		inputs.push({ id: c.id, prompt: buildPrompt(wf, store.thread(wf.id), cfg, store.root) })
	}
	writeJson(join(root, 'inputs.json'), {
		instructions: 'For each independent case, produce one submit_report payload. The tool-read result for each profile.md is supplied below. Do not read the scorer, fixtures or expectations. No tools or network are needed. No PR review has been performed: ask for review work or propose a job; never claim a vote or review is done. Output an array of {id, report}.',
		profile, reportSchema: z.toJSONSchema(z.object(ReportSchema)), cases: inputs,
	}, 'eval')
	return root
}

export async function scoreFictional(cases: FictionalCase[], root: string) {
	const reports = z.array(z.object({ id: z.string(), report: z.object(ReportSchema) })).parse(JSON.parse(readFileSync(join(root, 'reports.json'), 'utf8')))
	if (reports.length !== cases.length || new Set(reports.map(r => r.id)).size !== cases.length) throw new Error('Reports must contain each case exactly once')
	const results = []
	for (const c of cases) {
		const report = reports.find(r => r.id === c.id)?.report
		if (!report) throw new Error(`Missing report for ${c.id}`)
		const store = new Store({ root: join(root, c.id), machine: 'eval' })
		const wf = store.workflows()[0]
		if (!wf || report.workflowId !== wf.id) throw new Error(`Wrong workflow for ${c.id}`)
		await dispatch(store, source(c.text), store.config(), async (_, input) => {
			store.writeReport(report, input.runId)
			return { exitCode: 0, ms: 0 }
		})
		const got = store.workflow(wf.id)!, job = got.job ? store.job(got.job) : undefined
		const outcome = outcomeOf(got)
		const said = [got.status, got.fyi?.line, got.fyi?.gist, got.draft?.text, got.question, job?.goal].join(' ')
		const facts = (c.expect.facts ?? []).map(fact => ({ fact, found: new RegExp(fact, 'i').test(said) }))
		const pass = c.expect.accept.includes(outcome) && facts.every(f => f.found)
		results.push({ id: c.id, outcome, pass, facts })
	}
	writeJson(join(root, 'results.json'), results, 'eval')
	return results
}

if (import.meta.main) {
	const cases = JSON.parse(readFileSync(new URL('../evals/engine-xcheck.json', import.meta.url), 'utf8')) as FictionalCase[]
	const [mode, root] = process.argv.slice(2)
	if (mode === 'prepare') console.log(await prepareFictional(cases))
	else if (mode === 'score' && root) {
		const results = await scoreFictional(cases, root)
		console.log(JSON.stringify(results, null, 2))
		process.exitCode = results.every(r => r.pass) ? 0 : 1
	} else throw new Error('Usage: eval-fictional.ts prepare | score <prepared-temp-folder>')
}
