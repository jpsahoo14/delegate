# Engine fixes

2026-10-25 (fast-poll CR B1): Scheduled reply times now participate in the earliest-due calculation, so removing the
busy-item fast trigger does not delay automatic replies to the next idle tick. A deadline alone opens no fast window.

2026-10-25 (decision 43(c)): Restrict the PR joiner's relation override to multi-PR bodies and deduplicate anchor-conflict
diagnostics once per item code per process. Candidate PR scoping and fail-closed conflict handling are unchanged.

2026-10-25 (fast checking): Only sent replies and confirmed owner replies open the fast-check window. Receipt rereads,
asks, runs, queued work, reminders and self-chat nudges do not renew it; retry deadlines and source backoff stay intact.

2026-10-25 (PR body join boundary): New joins are scoped to named ADO PRs before quotes or subject matching. A sole
matching multi-PR join keeps a code-captured owned-message anchor and an Also mentions line; conflicts fail closed.
Existing sender/freshness/reopen gates, family/v5 behavior and cross-PR effect/vote refusal remain in force.

2026-10-25 (schema 8): Old PR-review workflow and completed-job context now use the shared finish-time trim policy.
CI/vote facts are removed and retained tones become info, with author/recurring/non-review exclusions and explicit
skip logs. An all-noise finish clears stale workflow context as well. Bounded versioned migration is idempotent.

2026-10-25 (#54 PE nits): Cold diagnostics use the exact 900,000 ms boundary instead of rounded minutes. Phase timing
logging failures now report to stderr without masking owner results or work errors, matching the existing step guard.

2026-10-25 (status metadata hygiene): The incomplete-report path writes its existing Not finished message through the
shared structured status helper. Wording, state, holding drafts and legacy read compatibility are unchanged.

2026-10-25 (#54 step 1): Tick phases and ten named steps report filesystem/external-call time and auditable warm/cold
classification. Diagnostic-only counters preserve synchronous work, ordering and existing scheduling/cache behavior.

2026-10-25 (U1): Acceptance Undo keeps separate proposal and stored-line hashes. Read the actual learned line after
a successful write so generated wording/evidence does not fail immediate Undo, without dropping either identity check.

2026-10-25 (A R33 compatibility): A newly accepted habit in an older rules file can still Undo across line-record
migration. Its fresh learned consent time is authoritative; an old file-wide confirmation is not mistaken for that action.

2026-10-25 (A R33): Undo after unchanged Add it restores the exact pre-acceptance suggestion state, not a fresh suggestion.
The shared writer lock protects latest/hash/window checks through rule removal and restore; refusals preserve habit state.
Stop-style, edited and legacy-without-snapshot cases use their normal line controls instead of an unsafe acceptance Undo.

2026-10-24 (edited suggestion acceptance): Changed suggestion text goes directly to the central learned Reading-line
writer with trusted provenance. Habit acceptance and dismissal-Undo invalidation follow only a successful write;
the original grant is never accepted first and the edited line is never silently confirmed.

2026-10-24 (R12a-h): New and edited rule lines take the next free drafting slot before queued drafts. Fresh, restricted
AI runs pass raw output and the original text hash to the central writer; edits, invalid output and refusals cannot
apply stale meaning or grant consent. Reading has no promised time; failures report in Health and remain retryable.

2026-10-24 (R12a-h2 / R29): Habits delegate learned-rule writes to the locked central writer and propagate refusals before
success. Plain suggestion/dismiss/Undo/reconsider APIs preserve decline history, cooldowns and doubled-evidence thresholds;
unchanged acceptance uses its actual consent time. The ways facade and drift work remain separately owned.

2026-10-24 (R11(3)): Empty-text wait on an unsent follow-up is Keep waiting instead: close it as skipped, restore the
original waiting row immediately and record only a local result, with no message, model run or negative learning.

2026-10-24 (R10c slice 2 PE B1): Review again now falls through the existing probe checks instead of short-circuiting them.
Preserve vote/closure news and role/effect refresh; suppress only the automatic stale-draft redraft for verified new heads.

2026-10-24 (R10c slice 2 / R24): After fixed SEND integration, probePRs marks later commits against the verified reviewBasis
without clearing the draft, receipts, sent reply or failure facts, or starting a new model run. Repeated probes keep the
marker time stable; further pushes refresh it and invalidate old page actions.

2026-10-24 (R10c PE news correction): Capture the owner's vote at review start and retain it as the comparison baseline.
Only a changed non-zero vote or a PR closing after the ask completes the review item; old votes and closures stay context.
Failed reads clear unknown baselines; normal probes and report-only continuations do not fabricate or reset them.

2026-10-24 (R10c first slice): Populate/clear live cleaned PR group scope and close resting review owner items on the
owner's unique live non-zero vote or PR closure, preserving receipts and sent replies. Generic/compound PR handling and
exact-head approval checks remain; reviewAgain awaits SEND's completion-basis handoff.

2026-10-24 (R20 prerequisite): Add optional reviewer-group/start-revision types and read the exact PR head before review
starts/restarts. Awaited start callers preserve lifecycle gates; no completion or auto-post policy is changed.

2026-10-24 (L2a PE B1/B2): Keep the short checkbox prompt separate from the text question, which names every cleaned group.
Do not consume worker-option picks or existing retry/redraft/vote/send card answers as reviewer-group membership.

2026-10-24 (L2a): Reviewer-group answers now accept named groups, multi-select picks and None, atomically saving both
membership lists instead of dropping non-yes/no answers into a redraft. A shared read-time choices contract cleans labels
while preserving exact server names, including on old saved questions. Card rendering is L2b's separate change.

2026-10-24 (step-6 B1): Stamp current workflow schema in the four real constructors, so new data cannot trigger legacy
rewrites. Actual intake/split/follow-up/track proofs show no migration, upgrade log, item-byte change or marker churn.

2026-10-24 (card-state step 6): Extract pure workflow compatibility; replace four probeMark repairs with an ordered,
50-item schema migration pass. Add structured status/review/window metadata and convert runner readers, preserving owner-send
holds. Stamp stable workingSince on state transitions. Manual legacy-equivalence, idempotency, recovery/skip and two-process
proofs pass; current-schema ticks stay within target.

2026-10-24 (#51): Chat effect previews, approvals and completion lines use natural comment counts, PR titles, person/chat
and closing command handles. Partial, failed, uncertain and reply-only wording comes from existing results, without gate changes.

2026-10-24 (#27 runner): Wire tick phases and audit cursor, draft, owner-send/Undo, job, PR, terminal and retention commits.
Bounded directory/version-validated record snapshots and readonly rendering retain freshness without repeated metadata work.
Fictional 400-item / 20-tick proof: p50 382 ms, max 1,593 ms, real HTTP <=248 ms; cross-process safety and no-replay cases pass.
Simulated storage only; no State.save, React or projection edits, no unit tests.

2026-10-24 (#27 scope API): AsyncLocalStorage phases, one-second lazy freshness, process-wide write versions and explicit
fresh commit reads. Synchronous page scopes retain their API/copy rules. Manual two-process scope proof passes; tick wiring next.

2026-10-24 (#45 HOST): Export a warm-only quick JSON call for owner-approved send checks. Fresh verified tool-less sessions,
provider/host schema validation, five-second wall deadline, abort/delete cleanup and no cold-start/spawn fallback.
Actual-runtime isolated stub proof passes; no unit tests or real-provider performance claim.

2026-10-24 (#29 retention): Keep two managed reply-run histories per item, local and synced. Protect job, owner and live
item/window references; use one versioned log pass for legacy reply IDs. Manual five-run Temp-root proof passes; no unit tests.
Follow-up: unchanged/protected/failed retirement lists do not rewrite workflows; cleanup merges into the latest item, preserving
concurrent answers and newly retired IDs. Both official PE save blockers have focused manual proof.

2026-10-24 (#29 runner): Fresh item reply sessions retain completed-review findings and prior private-source holds.
Kicked answers draft before intake/sweep, with item-specific bounded PR evidence and immediate submission acknowledgment.
Job sessions, budgets, terminal holds and send-time safety checks stay unchanged. Manual actual-runtime latency proof uses
fictional Temp roots and a delayed local model, not live provider timings. Card display remains separately owned.

2026-10-24 (#39): Verify actual host tools before a prompt and retry missing-tool setup failures on spawn. Only registered owner
proxies and required worker tools fault; resting catalog entries remain optional. Match full hyphenated names. A versioned,
log-keyed upgrade recovers eligible historical failures once. Fictional-root real-runtime proof covers delayed startup, warm
reuse with a resting server, report recovery and the breaker; no unit tests or live-root writes.

| Date | Fix | Expected behavior and proof |
| --- | --- | --- |
| 2026-10-22 | Approval truth | All PR workers receive live evidence before drafting. Approval-sensitive replies need bounded, complete wording and evidence for the exact claimed PR; mixed/unknown wording redrafts even after execution. Supported negative statuses and other-PR future promises remain valid. Dropped votes, repeated ok and vote receipts never bypass factual checks. A valid live owner vote wins; unsupported votes are unknown. Only completed PRs with empty reviewers may use one successful, current-turn, fully scoped receipt for an unsent owed reply, without a known head conflict. Scope-less legacy receipts hold instead of supplying missing evidence. Failed/unavailable/malformed/ambiguous reads never fall back to receipts. Re-reviews and broader asks remain open. SC-430. |
| 2026-10-22 | Completed work and PR identity | Approval families leave Waiting after verified changes and a persisted reply, not while newer asks, other parts' obligations, or failed/unknown changes remain. Closing reports with an owed reply stay open and keep their watch until send succeeds. The send receipt is saved before family cleanup, and interrupted cleanup recovers without resending. Terminal reports merge into the actual home; part plans retain other obligations. Broader work and its useful watches stay open. SC-431. |
| 2026-10-22 | Placement coverage | Actual Classic and New assemblies use the same canonical placement and show one home row across the shared fixtures and all 48 nonterminal home/part state combinations. Sender waits and parts stay visible. "Nothing needed" is never closure evidence. SC-432. |
| 2026-10-22 | Goal fidelity | Plans, stale jobs, and part reports cannot replace the home goal or done-when. Only an explicit changed outcome tied to the home's new owned pending ask can authorize replacement. SC-433. |
| 2026-10-22 | Group asks and skip audit | Backlog and live candidates persist past the cursor, behind direct asks and within paced daily limits. Owner candidates have no silent two-message drop. Distinct PR asks retain their identities. Every skip uses a fixed reason and IDs/outcome only, including one budget-deferral record per deferred turn; no text, names, or error payloads. SC-434. |
| 2026-10-22 | Relevant FYIs | Relevant group updates and recaps can become Catch up without a mention; thanks and unrelated requests remain noise. The fictional eval harness prepares blind production prompts and scores independent model reports through dispatch, distinguishing FYI from ignore and checking required facts. These isolated judgments are not live workplace or PR-review validation. SC-435. |

## Preview changelog

2026-10-22: Restored React Classic's compact Needs-you queue/pager and dedicated
Classic card anatomy, visible desktop version selector and three-line Home
Catch-up. Shared prerequisites are `9855e7d`. Side-by-side fictional-store Chrome
checks cover both themes/sizes, edited send/Undo, choices/review, private Ask,
due-work Wait/Close and retained editors. Build only; formal tests remain deferred.

2026-10-22: Designed React preview architecture and normalized schema before UI.
Added an opt-in foundation build and three-version menu. No item actions yet.
Existing Classic and New remain available. See R-REACT-01, 02 and 09.

2026-10-22: Rebased the React foundation onto the reconciled engine, replaced
the class utility package with an owned helper, and reserved the version menu's
layout allocation so native option/font metrics cannot resize the header.

2026-10-22: Activated the React workspace and current card. Rows only open;
typed server-offered buttons handle replies, choices, selected changes, private
Ask, work reports, holding replies and Undo. Pending identities and durable
receipts prevent replay after a lost response. Pinned revisions retain newer
typing and activity-form edits. The integrated supporting screens are available;
their formal M3 acceptance and complete M4 inventory follow. SC-406 through
SC-419 record the fixture-browser and shared-engine regression coverage.

2026-10-22: Completed M3 screen acceptance. Numbers fetches only when opened
or its window changes, including after focus/reconnect events. Advanced Settings
links open More and failed refresh preserves the same focused edit. Learned
rules retain their provenance; all habit and privacy controls refresh through
the real server. Setup-only values no longer prescribe chat commands.

2026-10-22: Prepared a working-preview handoff on main c8815d3. The shipped
workspace uses New's server headline/Next text and short times, puts work before
long asks, counts navigation within the visible section, and avoids unchanged
poll downloads with conditional responses. Prepared-action recovery revalidates
the saved intent without enqueueing. Legacy reminder/version routes work,
learned provenance is retained, and ending an open reminder cannot crash Now.

2026-10-22: Kept React New keyboard traversal inside the visible section and
Find result scope, matching its card count and Previous/Next buttons. Direct
Chrome walkthrough also confirmed paused Send with usable Ask/Undo, resumed
edits, overdue Wait/Close, health retry, bootstrap progress, reading states,
update cadence, exact Copy details and New-before-earlier Done ordering.

2026-10-22: Finished short event-time formatting across React New's Numbers,
watch details, bootstrap progress and footer. A counted item removed from
storage now says it is no longer on file, not that the owner reported a missed
message. Its logged count is preserved. Verified by direct fictional-store
Chrome walkthrough; build only, no test runner.

2026-10-22: Restored New's narrow first-screen density. Health age and extra
problems fold, status and Undo actions sit beside their text, and the duplicated
paused summary is gone. Find remains labelled and readable. In direct Chrome
checks at 400x860, Your move starts in the top half with status, Find, summary
and Undo present; fix results remain visible inside their health banner.

2026-10-22: Completed the React New migration inventory for all U01-U61 and
286 master scenarios. The acceptance records actual browser evidence, reused
engine behavior and the five absent future capabilities without inventing
features. React Classic/in-app toggle and the dedicated post-parity test phase
remain separate work; no combined-app or live-model sign-off is implied.

2026-10-22: Matched React New's row/header/summary/inline-card presentation to
the current New baseline. Added avatars, compact attributed facts/link icons,
filled Open, logo/tab/status pills and icon theme control; removed the extra
pager and duplicate Now-card names. Session notices use the compact leading
health line. The existing Same items note persists per machine, and Since uses
the actual visit cursor. Same-data comparisons and direct fictional-store
Chrome clicks cover both widths/themes. Intentional Open-only row safety and
honest timestamp fallbacks remain; no pixel-zero claim or test-suite run.

2026-10-22: Integrated the coordinator's react-all branch without rebasing.
Preserved the old page's visit cursor, including intentional absence on the
first-ever visit, instead of using React's load mark or display fallback for
freshness. Shared Done/Catch up counts now match the old helpers in returning,
first-ever and item-marked fictional browser cases. Reload/poll/toggle do not
move the leaving time. New's header-frame rule is scoped away from Classic.
