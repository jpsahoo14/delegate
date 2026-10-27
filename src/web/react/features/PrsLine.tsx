import type { Item } from '../domain/contracts.ts'
import './prs.css'

type Prs = NonNullable<Item['prs']>
const problem = (pr: Prs[number]) => pr.outcome === 'couldnt-read' || pr.outcome === 'gave-up'

// D-A239 MP3 (Designer): a row's line for an ask naming two or more PRs: "PRs: 5520 reviewing · 5521 not reviewing · +1". The short
// outcomes are the server's (HOST's typed outcome); a PR that couldn't be read or gave up is listed first, so a problem is never hidden
// behind "+N". "+N" never truncates and the outcomes before it ellipsize; the full list is the accessible name (prsName).
export const prsOrder = (prs: Prs) => [...prs.filter(problem), ...prs.filter(pr => !problem(pr))]
export const prsName = (prs: Prs) => `PRs: ${prsOrder(prs).map(pr => `PR ${pr.pr} ${pr.short}`).join(', ')}`
export const manyPrs = (item?: Item): Prs | undefined => item?.prs && item.prs.length >= 2 ? item.prs : undefined

export function PrsLine({ prs }: { prs: Prs }) {
	const ordered = prsOrder(prs), more = ordered.length - 2
	return <span className="prs-line"><span className="prs-shown"><b>PRs:</b> {ordered.slice(0, 2).map(pr => `${pr.pr} ${pr.short}`).join(' · ')}</span>{more > 0 && <span className="prs-more">&nbsp;· +{more}</span>}</span>
}
