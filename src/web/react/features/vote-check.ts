import { useEffect, useRef, useState } from 'react'
import { checkVoteClaim } from '../services/api.ts'
import type { VoteCheck } from '../domain/contracts.ts'

type Claim = NonNullable<VoteCheck['claim']>
export type LiveVoteCheck = { claim?: Claim; cleared: boolean; pending: boolean }

// A37 (b) / PM A R37: while he edits the reply, the vote-claim check runs again on his text after a short pause, on the server, with
// SEND's shared classifier (the rule Send applies), so the button and the engine agree. While a claim is there the line quotes it; once
// none is left (after the card or this check had one) the line says so and Send enables. Once a claim has shown, Send waits for each
// new check before it enables again. A claim typed fresh and sent before its check returns, or with the check unreachable, is held by
// the engine's own Send check, which uses the same classifier.
export function useLiveVoteCheck(code: string, text: string | undefined, hadClaim: boolean): LiveVoteCheck {
	const [result, setResult] = useState<{ text: string; claim?: Claim; failed?: true }>()
	const seen = useRef(hadClaim)
	if (hadClaim) seen.current = true
	useEffect(() => {
		if (text === undefined) { setResult(undefined); return }
		const abort = new AbortController()
		const timer = setTimeout(() => {
			checkVoteClaim(code, text, abort.signal).then(found => { if (!abort.signal.aborted) setResult({ text, ...(found.claim ? { claim: found.claim } : {}) }) })
				.catch(() => { if (!abort.signal.aborted) setResult({ text, failed: true }) })
		}, 500)
		return () => { clearTimeout(timer); abort.abort() }
	}, [code, text])
	if (text === undefined) return { cleared: false, pending: false }
	const current = result?.text === text ? result : undefined
	if (current?.claim) seen.current = true
	return { ...(current?.claim ? { claim: current.claim } : {}), cleared: !!current && !current.claim && !current.failed && seen.current, pending: !current && seen.current }
}