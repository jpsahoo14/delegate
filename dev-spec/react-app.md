# React preview

## COUNT58 B1 owner-step reader correction (0.2.48 HOST)

- PE 2026-10-25T15:01:41Z preserves the ownerNext union and names one shared date read:
  ownerStepSince(work, createdAt) returns waitingOn.since, else the last step's at, else createdAt.
  It is a pure read, not a new clock, migration or inferred date.
- askWhatNext selects the owner copy on ownerWait alone, including an explicit owner step without
  waitingOn. Its existing words and day formatting stay; the date comes from ownerStepSince.
  Owner choices never fall back to drafting a nudge merely because waitingOn is absent.
- New owns the paired check-date reader correction in next.ts: replace waitingOn!.since in both
  the headline and the facts date with ownerStepSince. HOST edits no New source in this correction.
- CR B1 remains an integration blocker until both owned reader corrections are supplied and reviewed.
  The helper/HOST copy change is not a page-fix, producer-handoff or standalone shipping claim.
  Normal OWN checks explicit next.you/no waitingOn: owner copy, last-step date and no page TypeError
  once New's reader is included. No extra proof, stored-data rewrite or union reversal.

## COUNT58 typed producer (0.2.48 HOST)

- Start from released .47 d23588f8 on an isolated .48 branch. The original conflicted WDD checkout
  and existing .47 lines stay untouched. This is the producer-first pull, not a WDD/H0 or broader A19 build.
- core/whose exports Section with left and optional Facts.job.setup. New fills setup with the existing
  agentSetupFailure classifier; the pure rule layer does not parse job errors or change the job.
- setup-hold is working only when the existing stopped condition AND job.setup hold; it precedes stopped.
  A non-setup stopped run remains move. in-terminal becomes waiting; your-step and todo become left.
  Other rule conditions, including watch waiting and needs-human precedence, stay unchanged.
- Shared rule-id predicates are needsYou(rule: string) for needs-you/stopped and leftForYou(rule: string)
  for your-step/todo. They never overlap; setup-hold and in-terminal belong to neither N nor M.
- URGENCY is move, left, working, waiting, catchup, done. PRECEDENCE is in-terminal, needs-you, stopped,
  your-step, todo, job-running, starts-next, setup-hold, partner-wait, waiting, catchup, done.
- PE 2026-10-25T14:43:24Z: ownerNext(work, me) returns you when next.who is you OR waitingOn names
  the owner; otherwise it returns next.who. Matching uses the shipped C4 trimmed/case-insensitive
  name/alias comparison. This union keeps owner-waiting work with no next step as the owner's step.
  HOST's waitsOnOwner uses this one result; New replaces its local nextWho with the reviewed export.
  No web import is added to core. Explicit owner-next plus another waiting person intentionally gets
  C4's owner choices; its existing waitingOn.since date remains, a PE-disclosed imprecision.
- The same PE ruling authorises exactly one adjacent New-owned compile bridge: NAMES.left is
  LEFT FOR YOU in web/next.ts, the existing uppercase dry-text header map. Nothing else in that file
  changes in the producer; New retains ownership and builds the actual consumer after the reviewed handoff.
- New's setup facts, page/Classic N and M grouping, count fixtures and B3-min plus SEND's self-chat
  implementation remain separately owned consumers of the reviewed DTO. HOST wires its self-chat caller
  only to the actual reviewed SEND interface, not an invented renderer signature.
- One coupled .48 cut is required: producer alone must not ship because moving rows to left without
  the Left-for-you consumer would hide items. Old data uses pure derivation with no migration/repair.
  Normal build, both typechecks, existing goldens and OWN; no extra test/proof budget. CR checks the
  no-next/owner-wait, owner-next/other-wait and other-next/other-wait shared-read cases.

## Carrier reply reason precedence (0.2.48)

- Newly created change carriers have `Job.carrier: true`. They carry an existing
  draft; they are not completed worker results and have no worker send facts.
  Automatic decisions for those drafts use the normal item policy ordering.
- Genuine worker results still take the verified-result branch, including its
  missing-facts hold. Older unmarked carriers retain that conservative hold;
  no stored record is relabelled and no send permission is widened.

## Rule-send suggestion cleanup (0.2.48, paired policy review required)

- The shared post-send bookkeeping drops an item's unrun suggested effects only
  when its actual sent receipt matches this send's time and names a rule.
  This covers ordinary replies, open work and rule review replies through the same
  existing caller; it does not require a send-path edit or a second send route.
- Asked, promised and legacy effects stay. Suggestions with actual completion,
  uncertain-write or failed-attempt history stay as history, not as unrun proposals.
  Owner sends and failed/held sends do not trigger this cleanup. It never executes
  a suggestion or grants consent.
- The separate policy change that ignores suggested effects when deciding whether
  a reply promises mandatory changes must compose with this cleanup in review.
  Neither implementation alone is acceptance of the coupled rule path.

## Per-unit read and gate providers (0.2.48, composition pending)

- `probePrUnits` is the typed unit reader for the following migration/caller slice.
  It re-derives open, unredacted units, reads actual references in batches of four,
  and retries each failed read after ten minutes. Only an attempted read that throws
  or returns unusable data increments that unit's counter; the third failure gives up.
  A missing reader or unresolved reference never counts as a failed read.
- Successful reads reset the counter and replace only the unit's read snapshot.
  Errors are scrubbed before the bounded 120-character reason is stored or logged.
  Owner/system skips and gave-up units are not probed; an explicit force may target
  one PR without waiting. Concurrent answers, skips, retries and other unit changes
  are retained through fresh reads, request matching and the existing commit helper.
- `reviewUnitGate` checks the ask and that unit's successful role snapshot, never
  legacy scalar permission. Pending, failed, gave-up and skipped units cannot review.
  Existing role declines and Add me use the same decision helper as the scalar gate.
- An explicit empty Azure DevOps reviewer list means no reviewers, not a read failure.
  An active response with its reviewer list missing fails explicitly.
- The tick/reply probe now initializes newly named units and routes multi-PR reads
  through the unit reader. Single-PR records take their snapshot from the existing
  scalar read, not a second request. A per-call promise cache also deduplicates a PR
  shared between single- and multi-PR items; it adds no retry cooldown.
- Given-up single units stop automatic reads too. Missing readers return units to
  pending without a strike. Existing scalar close/vote behavior is otherwise retained;
  unit job/reply routing is still the coupled follow-up.

## Unit review frames and schema 9 (0.2.48, coupled readers pending)

- `PrUnit.review` and the one item-level `reviewReply` use the shared review module's
  typed frame/reply contracts. `unitOutcome` exports only the outcome and reason code;
  pending or failed reads alone are never called reviewed, and a review basis alone
  is not completion. Section-9 completion receipts retain the factual reviewed outcome
  with a moved marker when needed. A no-link skip is final not-reviewing, not a failure.
- The bounded versioned upgrade derives units on open, unredacted items without log
  scans. It copies no legacy role/read snapshot into permission: units start pending,
  with zero failed reads, even when a schema-8 record already contains units.
  The migration clears every unit's prior read timestamp, failure and successful-read
  snapshot; ordinary same-reference derivation still retains current unit state.
  Valid historic declines keep their original timestamp.
  False unread/PR-zero declines are cleared and an otherwise empty blocked turn
  becomes runnable again. Done records are not upgraded or counted as pending work.
- Scalar review basis/run/done/again facts move only to the matching numbered unit;
  job identities are retained only for that PR. Shared reply metadata keeps the
  actual saved rule/turn and the one numbered unit. Missing legacy turn metadata is
  logged and cannot create an automatic reply permission. Scalar history remains
  readable for the still-pending legacy consumer switches, not unit authority.
- New turns clear unit review frames and the shared reply. A later successful read
  of a changed reviewed head marks only that unit for review and invalidates the
  shared reply revision. No workflow is cloned to represent another PR.
- Unit job orchestration, command routing and the shared reply's actual send path
  remain coupled follow-ups; this is the fields/migration provider, not whole review
  runtime or release acceptance.

## Per-PR read actions (0.2.48, coupled admission/orchestration pending)

- The serialized answer handler accepts exactly one current PR number in `nums`.
  Try now/again applies only to failed or gave-up reads; Skip this PR applies to
  gave-up reads. Closed/redacted items, stale revisions, open windows and that
  unit's active job/posting are refused without changing another unit.
  Both raw selected-unit job ids are checked for window reservations, even when
  the job record is absent or done and the workflow's legacy job names another PR.
- Retry resets only the selected read counter and forces one real read of that
  PR now. A missing reader is an explicit refusal, not a successful check; an
  actual failed read is reported as failed. The temporary reader is closed.
  Skip records an owner skip without inventing a reviewer role.
- Either action invalidates shared reply consent and the unsent generated draft;
  owner-written drafts and other units' review state are retained. Neither action
  sends a reply, posts findings or casts a vote. Command admission and the periodic
  job/reply scheduler remain separate coupled surfaces, not implied by this handler.

## Review-job unit scoping (0.2.48, coupled result routing pending)

- Review jobs resolve their PR through the unit whose job id matches, not the
  workflow's scalar target. Both the readable reference and the numeric prompt
  scope have job-aware helpers. An unmatched unit review has no target; it never
  falls back to another PR. Non-review, change-carrier and legacy-no-unit paths
  keep their existing scalar behavior.
- Single-unit attachment records that real job identity. Parent discovery includes
  unit jobs without replacing the one workflow with several items. The review's
  live start read and scoped prompt use its actual unit; a multi-PR read never
  overwrites the shared scalar owner-vote field.
  A typed work review cannot retain a parent through a stale legacy job pointer;
  legacy single-unit job aliases migrate only through the existing owned job link.
- Code-built author questions use the matched unit's reference and author snapshot;
  conflicting references are refused rather than borrowed from another parent.
  Unit queueing, result aggregation and reply sending remain coupled follow-ups.

## Factual review completion (0.2.48, section-9 writer)

- A new work review clears only its own unit's old frame. At completion the actual
  matched unit receives `review.completed` only for a done report, a goal not marked
  false, review findings or a code-verified clean result, and a live completion head.
  The receipt and the stored job result share one result timestamp.
  The same guarded writer runs when an unsent owner draft is preserved: keeping the
  owner's text and hold never discards a completed review's factual receipt.
- A verified start/live head comparison also writes the basis. An unverified
  completion marks that unit for review again; neither invents a rule id, posting
  receipt or permission. Failed/stopped runs and missing-head results write none.
- The pure outcome reports the completed review even if its revision has moved,
  with reason `moved` for an unverified or different head. A basis alone is never
  completion; successful posting remains the separate rule-owned `done` receipt.
- The versioned legacy-rule migration derives completion only from the actual
  matching original job's result, start/head and existing rule-posting receipt.
  It never manufactures a manual completion from scalar basis data.
- Multi-job result aggregation and the shared rule-reply guard remain the following
  coupled routing slice; completion metadata alone does not send anything.

## Unit session and execution ownership (0.2.48)

- Whole-item send/redraft ownership checks include every unit's review job and
  current posting job, including their raw window reservations. The selected
  retry/skip handler retains its workflow/legacy fence and checks its own two
  selected job ids, without inheriting unrelated units' new window restrictions.
- Typed review work parents require the real unit job association. Posting/change
  parents also recognize the native unit run job id. Withdrawing the item's OK
  reaches every linked executor, while another item's valid approval still keeps
  a shared executor alive as before.
- The existing execution approval checks remain unchanged. Their per-unit rule
  successor needs the actual typed approval/turn contract; a completion or posting
  marker is not substituted for the existing exact batch approval.

## PR-unit provider (0.2.48, first typed slice only)

- `Workflow.prs` holds ask-ordered `PrUnit` records. Each unit has its own reference,
  read state, consecutive-failure count, successful-read snapshot, decline, skip and job.
  A skip is not a reviewer role; an unresolved number is pending with a system no-link
  skip, never a fabricated reference or a failed read.
- `derivePrUnits` resolves the ask's numbers through `prRefFor`, retaining unit state
  only for the same verified reference. A later link clears a system no-link skip;
  an owner's skip survives derivation. Done and redacted items are not re-derived.
  References prefer the ask and the asker's messages, never another sender's link.
- Existing imports of `PrRef` from the probe remain valid; its type now lives beside
  the shared PR-reference helpers. `prTarget` returns the sole unit's number, or no
  number for a multi-PR set. Legacy items without units retain the scalar path.
- The `pr-retry` and `pr-skip` verbs are reserved with the existing numeric argument.
  This provider does not admit those commands, write units, migrate stored records,
  start jobs or change review permission. Review-frame types, migration, probe/gate,
  handlers and reply orchestration are the following coupled slices.

## Native per-job results and questions (0.2.48, section 10)

- Work results retain the validated report's state, trimmed question/hint, goal,
  blocker and vetted todos under their native field names. Stopped goal retries
  keep those facts too. No send-verification record or generic context label is used.
- A pure job-result view selects the first unanswered question in unit ask order.
  Its cached `questionOf` identifies the real job and PR; changing that view changes
  the item revision. Old jobs without native result fields keep scalar behavior.
- Answer resumes only that current unit job, clears its answered question and frame,
  and leaves other jobs and owner wording intact. The next retained question can
  become current. Stale answers and target windows are refused.
- `attachJob` now has an actual unit mode: it records that unit's job/frame without
  replacing shared draft/effects or another unit. Existing session-relay consent is
  retained and serialized before ordinary result questions; targeted vote/change
  approvals cannot be interpreted as permission to relay a different PR.
- `createChangeCarrier` returns the real stored carrier without changing the workflow
  pointer. Existing `changesJob` keeps its original wrapper behavior. Allocation
  alone starts no executor and grants no approval.
- Generic todos remain native job facts. The section-11 composed `wf.todos` view
  includes only reviewed units in the reply; only an actual send turns them into
  existing owner-promise Left lines. That composition, the queue and per-unit rule
  execution remain coupled follow-ups.

## Per-unit posting approval and epoch (0.2.48, section 11)

- `ReviewFrame.epoch` is a validated nonnegative integer. New fact generations
  increment it; resets retain the counter while clearing the frame. Completion,
  changed read facts/head/again, retry and skip invalidate only that unit.
  A routine read timestamp alone does not change the generation.
- At load, old frames without an epoch receive the explicit legacy generation zero
  and lose any run permission. Schema 10 increments the generation and drops old
  runs; scalar by-rule approvals are discarded. No approval is synthesized from
  a missing epoch or from historical result facts. Manual approvals stay unchanged.
- Rule `stillApproved` resolves the actual unit job and its required approval.
  The rule, posting job, epoch, unique pending effect ids for that PR, exact subset
  digest and job batch must all match; votes cannot enter the batch. Shared reply
  text/revision is not a comment-posting approval. `keyOf` is the real shared digest
  API, not a duplicated formatter.
- Whole-item withdrawal increments every stored unit approval's epoch before
  deciding whether an execution still has another approving parent. Pause/stop
  also select open items with native posting approval, persist the revocation,
  and hold them for the owner. Completed items are not reopened for historical
  unit packets. Basis, completion, posted history and other parents' approvals
  remain intact; resume cannot make a revoked packet valid again. This applies
  to existing packets at the next withdrawal without a repair or migration.
- The carrier marker is cleared only in the actual work-start commit. Execute runs
  retain it; reused jobs need no marker repair.
- Native unit references remain addresses when temporary turn effects are cleared;
  they never supply read/role/approval authority. Newer ask links still win.
- The existing pure `factsOf(PrState): PrFacts` normalizer is exported for the
  completion reader's same-read facts handoff. Its defaults describe meaning,
  not permission; no additional read, stored grant or migration is introduced.
- Carrier allocation can bind the real current unit job without changing the shared
  workflow job pointer. Ownership checks also retain the original completed review
  job while a posting job is current.
- Todo composition uses the section-11 `wf.todos` view, not a new Left draft. The
  actual SEND packet producer and shared-send ports remain paired source
  successors; the guard itself creates no packet or change execution.

## Native review queue and shared result (0.2.48)

- Section 13 provides `PrUnit.requested?: true` and the pure narrowing-only
  `askExcludes(text, pr)`. Sentence/semicolon/but/except clauses naming a PR with
  a negated review directive exclude it; skip/except clauses also narrow.
  A bare line break continues the directive and its PR/link, rather than
  separating the negative instruction from its target.
  Neither helper nor field supplies write permission. The runtime consumes the
  actual reviewed SEND schema/prompt delta, never its unapproved parent changes.
  No migration manufactures a request for old data.
- The owned `Report.reviewPrs?: number[]` type and request selector validate
  safe positive integers against `askPrs`, log dropped out-of-scope/invalid
  entries, deduplicate and require both `reviewAsked` and no exclusion.
  An explicitly empty list remains empty; only absence permits the scalar
  PR-job fallback. The selector does not mutate units, queue work or grant
  write permission. That fallback uses the existing canonical job-key
  normalization, including harmless whitespace/case differences, without
  widening its single-unit authority. At a classifier report, only that checked conjunction is
  stored as the unit's requested flag. Background readers use this turn-scoped
  request proof, not a role grant or a fallback from missing metadata. Owner
  answers remain valid requests after their processed text leaves ownerAnswer.
- New asker input or a generic owner answer/choice clears the previous request
  scope and advances affected epochs before another review can start or rule
  call can remain approved. Reply-only turn resets do not manufacture or erase
  the already classified ask. Raw windows are fenced before classifier-driven
  unit resets, and missing flags never permit old queued work to start.
- A current unconsumed owner command is exclusion-checked before earlier pending
  ask text, preserving both current overrides and cancellations. Intake drops
  an older answer on a new ask; a single-unit answer is consumed
  once handed to its real job. Handled classifier turns consume pending input
  even when no job is ready, retaining the checked request proof rather than
  repeatedly classifying it. A genuine current override remains available while
  its single unit awaits a real job, and is never promoted over a later ask.
- Unrequested units are not-reviewing/not-asked, start no new job, and contribute
  no pending proposals or job question to this reply. Stored jobs and factual
  history remain available. Unit references and later no-link resolution retain
  the current ask's request flag rather than inventing or losing a request.
- Orphaned error/uncertainty history remains stored but off, not a pending
  proposal reconstructed from failure metadata. Actual receipts and uncertainty
  metadata are retained without changing a source job or active manifest.
  A single unrequested unit settles through the same truthful room/direct
  outcome path as multiple units; it creates no review/completion.
- The requested flag gates the review intent, not unrelated/custom intent
  actions that happen to name a PR. Their existing deterministic ask check,
  actual unit membership, owner approval and write-time checks still apply.
  Reply-report vote checks use the newly classified workflow, not its stale
  pre-classification intent snapshot.
- The dispatcher queues real review jobs for the ask's units through their own
  read/role gates. Each job retains the shared workflow parent; no workflow is
  cloned and no missing reference becomes PR zero. Fresh explicit review asks
  reset only the requested units after active posting/windows have settled.
- The normal job allocator also handles unit jobs and relay consent. One unit
  needing an owner answer does not overwrite another unit's normalized result;
  the existing answer route resumes the selected real job.
- An old terminal work result without native report state is not a completion
  grant. After the fresh read/role gate, an unanswered owner question or owner
  draft is preserved; otherwise the actual review job runs again read-only.
  An old posting carrier is never reused as the review worker. The new result's
  native state makes recovery converge without a repair marker or log scan.
  Both fresh-turn resets and recovery fence the resolved original worker's raw
  window, including its legacy carrier address, before resetting or requeuing.
  A native done report missing completion facts is an explicit job failure view,
  not an endless checking status or a fabricated reviewed result.
- Unit results contribute partial proposed changes while other reviews continue.
  Optional Add me still uses the central suggestion selector. A successful Add me
  marks that unit pending for a real PR read, never grants a role from the receipt.
- Shared owner execution receipts are mirrored only to matching proposals in the
  corresponding original unit job. Vote receipts additionally match its head;
  later live reads clear reset votes from both views. A completed change does not
  close the multi-PR ask or send a shared reply while another unit is unsettled.
- The matched completion writer copies the reviewed reader's optional same-read
  facts into the actual unit completion and title snapshot. Only that unit's
  votes receive those stored facts as `Effect.pr`, using the existing
  `prParts`/`prMeaning` rendering path. Old or failed-read receipts keep facts
  absent. No second read, role grant, head verification or permission is
  inferred from meaning facts; the real write-time PR read remains authoritative.
- Once every unit is settled, code composes one outcome per unit in ask order.
  Gave-up reads can be composed but need owner OK; native questions, active
  executors and unresolved relays hold the shared reply. Owner-written drafts
  remain intact. Already-replied turns are not automatically rearmed.
- The composed reply's todo view is the ordered exact-text union from the
  reviewed units it includes. No new Left kind or worker-created promise is used.
  Automatic reply metadata requires verified current-head completion and actual
  posted receipts from one real rule, all-final outcomes and no question/todos.
- Selected votes resolve against the actual unit set; combined multi-PR voting
  needs separate approvals. Existing scalar behavior remains for legacy items.
  Non-PR calls retain the item's existing single-unit context, so an allowlisted
  deploy needs no invented pullRequestId. An unmatched PR call still has no
  target, and missing PR arguments are refused by the existing call validator;
  a multi-unit item does not supply a guessed deployment PR.
  After a selected batch ends, unrelated votes rebuild from their original
  unit proposals and head-checked receipts, not the shared batch's temporary
  deselection. Source-level off flags/history remain intact. The active manual
  batch is never rebuilt; its callback also keeps other pending unit votes open
  rather than letting an immediate shared send close the ask before rebuilding.
  The actual reviewed selector/write backstops, completion reader and corrected
  native producer/shared-send successor are consumed as scoped input. This
  does not itself approve coupled/runtime behavior or grant rule permission.
- A native `reviewReply` on the current `pr_review` intent uses the existing
  shared-review policy/final-send path
  in `automaticDecision`, even when its text equals the original work result or
  a result-facts turn matches. Presence selects a lane, never permission. Native
  unit/rule/epoch/head/turn/text/audience/write guards remain in that path.
  Retained native history on a non-review intent does not select that lane or
  get cleared to force a decision. Ordinary work results still use `decideResult`
  and their existing result-fact
  and scalar legacy review checks; no scalar basis/facts are manufactured for
  the native reply.

## Origin-bearing report data (0.2.48, first data slice only)

- Effects carry optional origin, reason, exact askQuote and a complete-alternative group
  (id, question, positive integer min). Omission remains readable for older stored reports.
  Suggested effects have suggested origin and a required structured reason; the report schema
  accepts a separate ranked suggested list without executing, vetting or promoting it.
- normalizeReport retains these fields, including choice effects. Its derived legacyEffects
  flag and legacyEffectOrigins helper identify origin-less stored revisions without rewriting
  them. Any origin or a suggested list opts out of legacy consent; mixed revisions are not legacy.
  No checked/default state is stored, and this slice does not activate include-list approval.
- Report call preparation verifies asked origin against an exact nonblank substring of an
  owned message from the item's asker, never another item, the owner, summary or lastAsk.
  New proposals without evidence become suggested, with catalogued origin-downgraded metadata
  containing only code, a known capability name (unknown otherwise) and a fixed why. Model-supplied note
  and rule labels cannot grant authority. Existing draft, approval and execution paths stay.
- verifyOrigin(effect, ctx) in core/effects accepts optional attributePromise(replyText, effect).
  It retains promised only when that code-owned attributor returns a nonblank sentence from the
  actual reply. Without attribution it downgrades with why=no-attribution. The later action-claims
  slice supplies and wires that callback; no ad hoc parser or bridge is added here.
  This is the engineering-approved interim contract, not suggestion execution or the UI.
  The complete first slice must not ship without the action-claims slice; downgrade-only is not released.

## Internal after-Send orchestration (0.2.48 HOST, first slice)

- Only external pending changes queue or count in the existing execute run. Direct calls and
  worker prompts keep original external indexes; internal-only owner approval uses the existing
  send-without-change-run path, preserving busy, agreement and pause checks.
- Take the reviewed in-memory internal receipt after approval is verified, before clearing it.
  The owner path captures the selected manifest before carrier adoption; the execute completion
  path captures it while stillApproved is true. No receipt or approval is minted after Send.
- Pass that same receipt to the reviewed dispatcher only after successful non-holding Send or
  an approved no-reply rest. Failed/held/stale/review/tracker/deploy-open paths discard it.
  A retained draft proven equal to the current ask's already-sent text is history, not a second
  reply on an explicit internal-only retry.
- Preserve actual internal done/error markers on workflow and carrier, and make failures
  actionable without counting them as external writes. External ledger, approval and execution
  order remain unchanged. Internal receipts/history are never folded from that external ledger;
  all internal execution still uses the reviewed real executor.

## Revision-bound approval caller (0.2.48 HOST, first slice)

- Pass the complete original Answer to `okSendGate` before changing draft text or legacy
  numeric/except selection, for legacy pages as well as origin-bearing revisions. Preserve
  include ids, the separate dedicated-page vote id, candidate text, exact page expect, reviewed
  metadata and consistency consent. The full typed Answer reaches the reviewed gate; its
  validated vote joins the retained effects there, never the ordinary include array.
  Refusals remain refusals; no draft-first, changed revision or second late gate is used.
- Legacy quote decisions use the original numeric selection. Apply it by stable change id
  and occurrence after the gate's existing self-chat vote omission, never by renumbering the
  owner's original choices. Votes retain their dedicated path; legacy originless effects
  receive no invented origin or selection-learning event.
- Returned omission notices survive a subsequently created owner-send record and its receipt.
  Accepted verified non-vote selections emit only catalogued include/exclude metadata;
  informational zero-action results are still returned without continuing to Send.

## Internal suggestions and executor (0.2.48 HOST, first slice)

- `runner/internal-effects` exports `runInternalEffect(store, workflow, effect)` returning a
  promise of `{ok:true, ref?}` or `{ok:false, error}`. It validates the actual reviewed internal
  action union and current item targets before calling the existing watch or wait engine.
  No MCP name, free payload, rule grant or alternate executor is introduced.
- Check-back requires an active main work item and a representable date. SEND dispatches it
  after Send and captures its normal receipts: the existing wait verb clears the completed
  turn; only a draft matching the actual sent text is retained for the existing Undo path.
  Schedule state is staged until save succeeds, so a failed write is not later committed as
  a scheduled action. No approval or other cleared turn field is restored. This module does
  not add that dispatcher or weaken approval/send checks.
- Code-built watch proposals use shared structured PR/work-item/incident targets and the
  existing bounded watch, without duplicating an existing watch. Generic waiting main work
  can instead offer the existing three-day check-back when no future check-back is scheduled.
  These are always suggested, not preapproved, and share the actual selector's three-row,
  target, dedupe, dismissal and no-votes rules with worker suggestions.
- Hooks cover direct reports, job reports and stored-report application. Holding, rule,
  tracker, execution-output, failed-goal and no-reply/no-requested-change reports generate no extra work.
  The read-time no-call repair preserves schema-valid code-suggested internal effects on both
  item and carrier. Actual old originless no-call proposals keep their existing refusal path;
  there is no relabeling, backfill or one-shot repair.
  New's display and SEND's reviewed dispatch remain required for the complete slice.

## Dismissed suggestion scopes (0.2.48 HOST, first data slice only)

- The serialized `dont-suggest` answer carries the server-resolved key and scrubbed label.
  It matches a current pending suggested effect before writing anything, refuses busy or stale
  items or uncertain writes, and never treats an asked/promised effect as a dismissal. No chat-text syntax is added.
  The client owns the six-second hide/Undo interval; there is no server timer or restoration.
- On success the scope store is updated and matching suggested effects are unchecked on both
  the item and its carrier through the existing selection writer. Other origins and scopes stay.
  The catalogued `wys-dismiss` event carries only code, call capability plus a bounded target
  kind, and the stored verified origin; only catalog/config capability names enter that field.
  It never carries the key, target id, free-text action argument or read-back label.
  Scope identity uses the reviewed `effectCapability` API for calls and typed internal
  suggestions; dismissal never executes either. New owns exact-revision resolution and SEND
  its typed admission/carrier. Internal dispatch remains a separate reviewed implementation.
- `runner/habits` exports `dismissKey(capability, target)`, using the existing canonical target
  key, and `isDismissed(store, key, now)` with a numeric lookup time. Only an explicit cross
  dismisses a suggestion in this slice; inclusion/exclusion learning is not implemented here.
- `dismissSuggestion(store, key, at, label)` takes an ISO timestamp and the dismissed effect's
  existing scrubbed summary. It persists one `dont-suggest` scope per key in
  `state/suggestion-dismissals.json`, expiring exactly 60 days after dismissal.
  Writers use the existing nonblocking record lock, a fresh read and atomic JSON replacement;
  a busy writer returns `{ok:false, why}`, never a successful dismissal.
- `turnedDownSuggestions(store, now)` lists unexpired `SuggestionDismissal {key, label, at, until}`
  records newest first. `reconsiderSuggestion(store, key)` removes only that suppression. Both mutations return
  `{ok:true}` or `{ok:false, why}`. Neither expiry nor Reconsider restores a proposal, grants a
  Rule or runs an action; a future suggestion must be produced again from evidence. Reads exclude
  expired entries without writing; mutations prune them during their locked update.
- The sidecar is metadata, not a fake Rule-backed Habit. Existing send/style acceptance,
  snooze, decline, Undo and learned rules remain unchanged. Roots without the sidecar read
  as no suppressed scopes; malformed existing data raises an error rather than being erased.
  The existing Rule-backed Ways adapter is not changed by this producer; its paired adapter
  unions habit rows with `{kind:'suggestion', key, label, at}`, reads back the label and routes
  Reconsider to this API. The full slice needs that adapter and its row renderer before shipping.

## Measurable usage logging (0.2.47 HOST, usage-first cut)

- Build from reviewed Settings input 6c7a04f3 on the clean usage line, not the deferred WDD merge.
  Coordinator 2026-10-25T12:17:26Z places HOST GAP-1/2/3 plus New's measurable view in the SAME .47 cut.
  Logging alone is not completion of the requested view. Introduce no deferred WDD/action/Undo or
  A76 result commits into this line; the final release manifest verifies every selected ancestry.
- PE 2026-10-25T11:28:00Z: ran(kind, use) always returns runKind, including when usage is missing
  or empty. Report only supplied usage fields; do not fill missing models/calls/tokens/time with zero.
  This keeps an unmeasured run in the new view's denominator without inventing measurements.
- RunKind adds owner-reply, promise and rule. Existing model-summary helpers recognise those kinds
  when a model was reported; their model-only behavior stays. New's usageOf owns unknown values and X/Y.
- owner-reply-run records runId, ms, chat/msg ids and ran(owner-reply, used), but NO workflow/item ids.
  The judgment may cover multiple items, so the run is never assigned to one item or split among them.
- promise-run records workflowId, runId, ms and ran(promise, used). Rule compilation uses ran(rule, used)
  in its existing event. Log after the run returns, before report/setup validation, so failed/no-report
  results retain their run identity too. Add no prompt, answer, person name or message text to usage events.
- Preserve model execution, sessions, reports, setup holds, retries, approvals and actual effects.
  No old-log rewrite or migration. Legacy events without runKind remain outside the new view's counts;
  New supplies honest counted-since/partial-window text and unknown cells, not retroactive estimates.
  PE's launch amendment derives coverage from existing release/machine log metadata, not the first
  occasional owner-reply/promise event; HOST adds no stored coverage flag or new version marker.
- New owns all-machine/runId deduplication, aggregation, totals/over-time/model breakdown, item
  attribution and the ONE PE seven-case fictional-Temp aggregation proof plus Designer checks.
  HOST hands off the actual reviewed metadata/RunKind commit. No credit/money conversion or promise.

## Settings interval: active-watch scheduling companion (0.2.47 HOST)

- Coordinator 2026-10-25T12:02:38Z and PE 2026-10-25T12:09:15Z: keep configured watch
  deadlines in tick.reschedule's existing earliest-due calculation, independent of a longer quiet idle.
  The pure track.watchDeadline(store, cfg, job, now) returns nextAt only for every/state=done jobs
  with no relay/retry and a finite timestamp strictly after now. Reuse dueTrackers' FIRST non-Done
  parent: it must watch this job or be waiting_on_task; do not pick a later eligible parent instead.
- Suppress only this new deadline addition while stopped, at the daily run cap, or under the pure
  activeAgentHold check. Never call the mutating blockedAgent here. Paused still includes watches.
  Running, queued, relay and failed jobs add no watch deadline; existing queued retry scheduling stays.
  endsAt is not a separate deadline: dueTrackers still handles expiry when nextAt falls due.
- Past-due or invalid nextAt never pulls the schedule to now. A watch blocked by a cap or hold returns
  to ordinary idle cadence after its deadline passes, rather than spinning the resident runner.
- Keep scheduled sends, automations, retries, reply-only fast windows, work-hours policy and health
  unchanged. Reuse the same jobs read; do not change watch cadence/defaults, read scope or AI budget.
- New owns the paired Settings 1-240 validator, final help and save note in both UIs. Both reviewed
  halves ship in the same .47 cut. No live config rewrite, schema change, backfill or migration:
  existing configured intervals stay valid. The runnerSilent recommendation is explicitly excluded.
- Validation is build, both typechecks and existing goldens, with normal OWN CR's explicit
  240-minute-idle/hourly-watch deadline, paused inclusion and no-parent/ineligible-parent/stopped/
  held/capped/past-due exclusion check. No new unit test or proof file.

## Decision 56: bounded cross-item chat news (0.2.47 HOST)

- After the existing person's routed appendThread only, add a news step to each other active item in
  that same chat, excluding the target, its home and its parts. Do not add hooks to ownerStep, group
  context fan-out or missed-message appends. Keep all routing and PR-join/target guards unchanged.
- Require a nonempty sender id that is not the owner and does not match the existing BOT sender filter.
  Reuse that filter unchanged. In groups the id must equal the other item's asker or an askers entry;
  in a 1:1 the counterpart counts. Never match waitingOn.who, names, aliases or message/topic similarity.
- Store only step text "<first> wrote in this chat (now in <target code>)", news=true, at=raw.at and
  ref=xnews:<target id>; save only when step adds it. This dedupes to one step per waiting item/target.
  It states where the person wrote, not that the message answered the waiting item's question.
- Existing due() defers checkAt using lastActivity and CHECK_DAYS. Take the maximum stored step time,
  not append order: a backlog news step can be older than the previous last step. Threads/parts and
  existing timing stay otherwise unchanged. An unrelated topic can defer the check by at most
  CHECK_DAYS from that activity; a long side conversation on one target adds no further step.
- No pending, state, question, closure, wake/run, verb or AI-field changes. An already visible no-news
  question stays as it is. No classifier, model, repair, owner-step reset or live-data action.
- Old records use the ordinary intake/due path for newly read messages. No migration, backfill or
  restoration. Normal OWN review; preserve the isolated .47 chain and all earlier-release artifacts.

## H1: applying typed question hints (0.2.47 HOST)

- PE 2026-10-25T09:32:55Z / Coordinator 2026-10-25T09:49:20Z: apply the existing optional
  Report.questionHint beside its own question in finishWork, shortOfGoal and applyReport, including
  the ordinary reply and short-of-goal branches. Call the reviewed normalizeQuestionHint before storage.
  A missing/blank question or absent hint stores no hint; an explicitly supplied empty/sanitised-empty
  hint stays empty. Do not parse question prose to create answers or copy hints from an earlier report.
- Previews and new turns clear both fields. Engine-made replacement questions, failures, retry starts,
  reviewer/group transitions and owner edits clear the previous hint; preserving the same question
  preserves its hint. A question moved into an author comment drops its owner-answer hints.
  The no-question sentinel clears both fields even on a report without a reply.
- No question wording, state/timing, choices, send/approval, PR-target, Left-for-you or schema contract
  changes. The existing normaliser remains SEND-owned and unchanged; HOST changes only its runner files.
- Old records without hints remain optional/legacy data until an ordinary report or question transition.
  No schema bump, repair, backfill, copy parser or live-root rewrite. New's typed chips and legacy-only
  fallback are a separately reviewed companion in the SAME .47 cut; this producer is not page completion.
- Other owners retain their question writers: SEND's keepApprovedDraft, send and effect-call repair;
  New's retention/redaction. Their clear/replace pairing must be retained with the typed consumer.

## Structured other-PR mentions (decision 43(d), 0.2.47 HOST producer)

- At the existing first sole-match multi-PR join only, the code-built prAnchor stores also as the other
  named PR numbers. Use the same strict, deduplicated PR set and the same original target computed BEFORE
  appending the message. Never overwrite an existing anchor or extend its original also list on later joins.
- Stop writing the Also mentions context finding. New reports may replace context without losing the
  structured mention. No join/PR-target check, guard, routing condition or action/vote authority changes.
- Clear also with the whole anchor through the existing split, edited/replaced/removed message, redaction
  and done transitions. No independent lifetime, new state, event or formatter.
- Old anchors have optional also absent: render no structured mention rather than guessing/backfilling.
  Existing legacy context facts retain their ordinary lifetime until a normal report replaces them.
  No schema bump, copy parsing, repair, restoration or live-data rewrite.
- Coordinator 2026-10-25T09:49:20Z: HOST producer now, then its OWN review and exact named handoff to New;
  New renders from valid anchor facts after its C4 safe boundary. Both reviewed halves share the same .47
  cut, neither alone. Preserve reviewed C4/.46 b2 and leave .46 candidates/frozen artifacts unchanged.
- H1 questionHint application follows this own step/review and its normal pull; the consumer pairing is
  not a global coding stop. No unreviewed helper/branch merge or held feature expansion is included.

## C4: owner-wait question (0.2.47, HOST)

- Build on a separate .47 branch from reviewed b2ace3f7; leave the .46 candidate/ref unchanged.
  The pure work.waitsOnOwner(wf, me: string[]): boolean predicate compares waitingOn.who with the supplied
  names/aliases using trimmed, case-insensitive exact matching. askWhatNext supplies the configured owner's
  full name, first name and aliases; New supplies its existing s.me. Both halves use this one predicate.
- For that owner wait, use the PM's Still on your list since <day>: <step> line and Report how it went /
  Remind me in 3 days / Close it wording. Reporting is the existing owner answer with the actual result;
  waiting and closing keep their existing commands. Never offer a nudge to the asker for the owner's step.
- The date comes from waitingOn.since; the step comes from the stored next step, or the work goal if none.
  This is display data, not a new clock. The ordinary No news status, due/lastActivity/CHECK_DAYS logic,
  state, placement, send/closure behavior and schemas are unchanged. Other-person questions stay exact.
- Forward the existing Store through the two watch-ended callers as well as the ordinary tick, so owner
  identity is available at every production question writer. No new poll, job or external action is scheduled.
- Old work uses the same fields and normal question-generation path: no schema migration, one-shot repair,
  restoration or live-data rewrite. No age-policy, stale-step trigger, Reopen, menu or placement redesign.
- PE 2026-10-25T09:25:25Z confirms a SAME .47 CUT pairing: HOST's question/shared predicate plus New's
  owner-only check-date actions and existing report-form exposure. Other-person rows stay exact; New uses
  workflowApprovalRev, not leftRev. New's companion is scheduled by Coordinator and edited by New only.
  Neither half ships alone; do not claim whole-page C4 completion or edit New's files under this HOST slice.

## A120 text-render caller pairing (HOST)

- Merge only the reviewed optional-Place renderer API and MCP caller at SEND df5ec00e / 5bf331e.
  HOST's apply more/effect-result and proposals inbox renderList pass placeOf(store, wf.chat, wf.asker),
  using the existing cached place model and excluding that item's actual asker.
- Untitled groups therefore use the same place words as the page. Titled chats and 1:1s get undefined Place
  and keep the renderer's existing output. No live member read, stored-name rewrite or migration.
- Display-only: keep the same truncation/plain-text pass, markShown behavior, effect/send/hold decisions,
  consent revisions and receipt timing. MCP admission/leftRev remain SEND's separate decision-53 work.
- This is the named SEND08:05:45 HOST companion, not a broader legacy-web, card, Settings or source-ownership transfer.

## I34 HOST marker hooks (decision 45)

- After a correction's successful send and addSent, emit the existing marker metadata as owner-text/unmarked.
  After a reminder's successful send and addSent, emit it as auto/marked. This is the named SEND handoff.
- No message text, user or target enters the event. No new await, change to send order, marker policy, final
  consent check or retry behavior. The existing SEND catalogue/markerFor and New preview remain paired.

## Action-nudge links (W7 provider)

- `actionNudge(records, page, now)` accepts an undefined page URL and then ends with
  "Review in Delegate." or "Undo or review in Delegate.", preserving the Undo countdown.
  A supplied URL keeps its existing http(s) validation and record/day hash.
- The runner's self-chat consumer passes no URL in 0.2.48. A per-launch localhost bearer
  token is not a durable cross-device link and must not be posted to chat or persisted.
  Record eligibility, cadence, cursor and daily-summary wiring remain runner-owned.

## Action-ledger start date (0.2.48 provider)

- `store/actions.ts` exports `LEDGER_START`, `markLedgerStart(store, at?)`, and `ledgerStart(store)`.
  The marker is `actions-ledger-1` in the existing synced upgrade map. A fresh read preserves every other
  upgrade key and writes this key only while absent. Appending a record marks its timestamp before the ledger write.
- `ledgerStart` returns the earlier of the marker and the oldest retained record, correcting a later synced
  marker when older ledger evidence exists. It returns no date when neither exists; no version or date is guessed.
  It reads the oldest nonempty month, using the shared parsed ledger cache, and writes nothing.
- HOST separately marks the start after watching initialization on every tick. New separately consumes the
  exported date and keeps its approved undated fallback until a date exists. This provider neither wires
  those consumers nor backfills records.

## Bulk action amendments (0.2.48 provider)

- `amendActions(store, changes)` returns saved amendments in input order, `BUSY`, or `{ missing: refs }`.
  It parses and resolves every input, then takes all subject-month try-locks in sorted path order and
  rechecks every subject before appending any line. A busy lock or missing subject writes no amendment.
  Empty input returns an empty array. Missing references use the existing metadata diagnostic.
- Existing `amendAction` behavior and callers are unchanged. The page separately makes one batch call
  after its current-list digest check and reconciles the saved count with its receipt.
- This is all-or-nothing for preflight refusals, not a cross-file crash transaction. A process lost
  between appends can leave harmless repeated review marks behind a prepared receipt; no journal or
  rollback is added, and the receipt must not claim an unsaved outcome.

## Action-record Undo engine (W4, 0.2.48 input)

- `runner/send.ts` exports `undoAction(store, source, config, recordId, rev)` for the serialized owner-command runner.
  `core/page-approval.ts` exports `actionApprovalRev(foldedAction)`; the page must carry that exact record revision,
  never a freshly reconstructed revision at execution. A changed revision refuses before deletion.
- Only a confirmed posted message matching the record's `undo.msgId` may be deleted, strictly before `undo.until`.
  Comments and other effects are untouched. Adapter success appends `undone`; rejection appends `undo-failed` with
  `why` equal to `forbidden`, `replied-to`, `edited` or `other`. A failed record is not offered for another Undo.
  Expired/already-undone records refuse with "Too late to take it back". No ledger Undo falls back to editing a message.
- `undoableAction` is the shared eligibility predicate. Chat `undo <code>` selects the newest eligible record for that
  workflow only when it no longer has `wf.sent`. When `wf.sent` exists, both page and chat target only that message's
  matching record, or its legacy path if unrecorded; they never delete an older recorded reply instead.
  A sent reply found in the ledger never falls through to legacy Undo.
  Unconfirmed same-grant records also refuse the legacy shortcut. Older sends without a ledger record retain the existing
  `wf.sent` delete/withdraw behavior; the existing page's latest-sent approval guard remains unchanged.
- After a confirmed deletion, a still-current finished reply returns to its kept draft. Active work, a newer turn, replacement send or
  unrelated draft is not overwritten. A ledger-write failure after the adapter result reports what actually happened,
  raises `wdd-undo:<recordId>` Health and blocks another delete; no external action is retried automatically.
- Integration dependency: New owns the new record button/countdown and failure-class copy. HOST owns the queued-command
  bridge in `runner/apply.ts`: it must dispatch the exact `(recordId, rev)` to this facade under the existing tick lock,
  before workflow-only routing (records can outlive items or have no item). H0 also owns the narrowly limited open-work
  chat exemption and result metadata. That bridge and New's UI are not installed by this SEND-only slice.
  Do not call the facade directly from an HTTP request or claim the page is wired.
- SEND's page-command binding is `enqueueParsed(store, [{verb: 'undo-action', text: recordId}], shownAt, 'page',
  answerId, {kind: 'undo-action', expect: actionApprovalRev(record)}, pageSubmissionId)`. It accepts exactly one record
  action, refuses malformed/stale/expired/undone/non-message inputs, and queues without any adapter call.
  The queued `Answer` has `code: ''`, `verb: 'undo-action'`, `text: recordId`, and the unchanged page guard/token.
  Repeating the same submission identity keeps the existing answer; it does not enqueue another command.
  H0 must read that pair from `answer.text` and `answer.page.expect`; it must not resolve `answer.code` or regenerate
  the token. Pair this binding with H0 before exposing it in New. The runner's same record guard is authoritative
  if the record changes or the window closes after enqueue. A too-late facade result also carries `reason: 'too-late'`
  for H0's typed outcome mapping.

## Suggested-answer hint ownership (SEND, decision 57)

- Clearing or replacing a question in the approved-draft backstop, old-invite refusal or effect-call preparation/repair
  clears `questionHint` in the same assignment. A holding reply preserves the hint only when it preserves the question;
  creating its fallback question clears any old hint. Send and repair behavior is otherwise unchanged.
- These adjacent clears ship in the same .47 cut as New's hint consumer and page-revision digest. The producer's separate
  privacy pairing with New's retention clear remains mandatory; this slice adds no parser, schema, helper or merge.

## Left-for-you tasks, verbs and certain-signal probe (HOST)

- keepTodos creates typed promise records from the reply's real todos at send time, keyed by the sent-message link;
  existing kept records stay readable, and new promises are not also added there. A corrected owner reply records its
  real msgId/at for promise provenance. The shared-review hold, legacy no-call proposals, old invites, role-regated
  votes and stale deploy-build refusals emit LeftDrafts directly. No legacy wording is read to recover an action.
- doneTodos accepts the selected kept and left ids together; typed ticks use owner/ticked at the same timestamp.
  It never closes/reopens the item. New owns the same six-second receipt/Undo and page consent integration.
- left-ask-again and left-draft-invite accept one exact active line id in Answer.text. Stale/cleared ids, non-invites
  for the invite verb, open windows and busy jobs refuse explicitly. A repeat for the queued id is a no-op.
  leftRetry tracks that id until a proposal/draft lands, when it clears as superseded; new turns/explicit closure
  invalidate the pending binding. The existing needsMe and ownerAnswer path makes the result draft-only, never a send.
- The PR activity probe runs with the normal read-only probe every ten minutes (or an explicit kick), groups reads
  by project/repository/PR and uses at most four reads in parallel. It skips items with pending asks/queued answers
  after the reads. Only a known closedAt after line.at, or the exact source discussionId with a later owner-id/UPN
  comment, clears as seen-done. Base PR links without a discussionId cannot prove a reply to a particular thread.
  No display-name match, AI judgment, stored per-view flag or guessed timestamp; unfamiliar reads log and leave tasks.
- These are HOST engine surfaces, not a claim that the page/MCP counterparts have landed. SEND owns MCP admission
  for done items; New owns active-left task selection/revision and receipt Undo. The reviewed optional repair bridge
  is now wired at legacyEffects: its unchanged code-made LeftDrafts get the same code-owned source/id merge before
  SEND's existing recordCommit, with no duplicate generated wf.todos strings.
  The existing cross-owner handoffs must pair before the release cut. No A76, anchor.also or .47 work is included.

## Left-for-you report consumers (HOST, decision 44)

- left-source constructs source facts from the item's current origin message, PR/job and saved review head.
  It uses messageLink for chat/reply origins and the owned PR URL for a review; who is first-name-only.
  A completing review supplies the same verified head it saves to Job.result.reviewHead, never an old cached head.
- Report.refused is kept raw in Job.result, including a stopped/retrying job. Before wf.left, reportLeft calls
  normalizeReport, keeps its filtered HTTPS ADO/Teams links and plain reason, and drops display-only compatibility fields.
  Neither normalization nor source placement changes the producer-computed action key.
- Reply/report completion, preserved approved drafts, job results, vet, reviewer-role vote gates and picked/deploy-busy
  choices feed the shared merge. Admission/pending-ask/failed-effect and carry/share gates stay in their original order.
  A refusal cannot qualify a review as clean. Ending the reply lifecycle does not end the owner's typed tasks.
- Typed refused actions no longer enter wf.todos as generated refusal prose. Report todos remain real reply promises.
  Allowed-now and reviewer-group recovery use structured keys/kinds/settings, or a legacy review's typed job/intent,
  not the old refusal wording.
- PE 2026-10-25T07:35:05Z, clarified 08:40:29Z: automatic done/close transitions leave lines active. Only an explicit
  owner action that closes the item clears them in the same commit, including explicitly closed family parts.
  R-WRK-08 skip on open work drops only the reply and keeps its Left-for-you lines; closeLeft runs after that branch.
  A prior owner-ticked clear becomes
  item-closed on explicit closure so a delayed tick Undo cannot revive it. stateFields and close alone never clear lines.
  work re-exports openLeft beside openTodos; New counts both for the done-but-task row. No new state or SEND edit.
  No migration or restoration of prior clears: the corrected skip path applies when the next owner action is handled.
- This was the first producer slice, not the full feature. The next HOST task/verb/probe slice is described above.
  The reviewed repair bridge is wired above; MCP admission plus New's renderer/consent/receipt integration still pair separately.
  The simple SEND close path remains unchanged as the PE ruled.

## Left-for-you foundation (decision 44; HOST)

- API: mergeLeft(wf, drafts: LeftDraft[], source: LeftSource, reviewHead?, at?) -> LeftLine[]. It mutates only wf.left;
  the caller supplies the item's code-derived source and persists through its existing recordCommit/save.
  Worker refusals must pass normalizeReport before this API; the job keeps the original raw refused records.
- The id is left- plus the first 16 hex digits of sha256(type|kind|verb|pr|target|action.key|sourceIdentity).
  PE 2026-10-25T06:44:10Z C: sourceIdentity is source.href, or source.href@reviewHead for a review with
  the job's result.reviewHead. The link stays the real PR URL; same-head reruns keep an id, new heads do not.
  Keys come from SEND's reviewed producers, never model-supplied keys or display text. A same-source rerun
  updates an active record without changing its original id, source or at. Cleared ids never reopen.
- clearLeft and undoLeft are id-based. Undo restores only an owner-ticked record with the exact clear timestamp;
  the page's existing six-second receipt is still mandatory. allowLeft clears refusals only on an exact allowed call key.
  Explicit owner closure replaces a prior tick with item-closed, so Undo cannot revive it afterward.
- PE 2026-10-25T06:32:03Z: prune cleared records after 30 days, then retain their ids in optional leftCleared.
  The merge checks both retained cleared records and those tombstones. Deduplicate; cap at 2,000 oldest-first.
  A cap event left-cleared-cap records only code and dropped count. No content, links or person names enter telemetry.
- Pruning shares tick's existing workflow pass, re-reads only expiry candidates and commits owned fields freshly.
  Absent left/leftCleared means empty; no migration, legacy-copy parsing or old-data repair.
- Source construction/report consumers are in the slice above; proposal-only verbs and seen-done probing are
  not functionality supplied by this foundation alone. Prerequisite merge 35c147ed includes New's reviewed
  d61b7eed G96 legacy-input handoff, decision 40; its expectation is unchanged.
  No A76 call site, anchor.also draft, UI/State edit or frozen-stage mutation is included.

## M2: PR/link parsing boundary (0.2.46)

- Move linksIn, prMentions, prNumbersIn, isNonAdoPrLink and adoPrNumber to core/pr-refs with byte-identical bodies.
  Only the former private prMentions gains export for the joiner's direct import. Preserve the distinct existing
  parser semantics, including site-provided build/incident words; this is not a policy or regex change.
- work keeps the join/family decisions, including prJoinCandidates, and re-exports its three prior public parsers
  for the compatibility release. probe re-exports adoPrNumber. Existing caller paths therefore resolve the same functions.
- M1's core/vote-claims imports linksIn/prNumbersIn from core/pr-refs, not runner/work, removing that interim
  core-to-runner dependency. This import-only named handoff changes no classifier code or output.
- Build on the reviewed M1 prerequisite on a separate future-release branch. Do not mutate the frozen 0.2.45 stage,
  apply A76 WIP, consume blocked key-dependent producers or claim M3/M4/hint/wf.left complete.
- Source/declaration byte comparison plus build, both typechecks, existing goldens and publication scan validate the move.
  No new test/proof cases or old-data changes; caller import cleanup/removal of re-exports belongs to M5 in 0.2.47.

## Joiner follow-ups (PE decision 43(c), 0.2.45)

- Keep candidate scoping by actual prTarget for every named PR. Only multi-PR messages may bypass askRelation;
  a single-PR message again uses the old quote/subject relation test among scoped candidates, including when its
  target came only from a job/effect and the old relation would not join. No new permission or family rewrite.
- pr-anchor-conflict remains fail-closed on every call but emits once per item code per process, not on every
  prTarget reader. Another code may emit its own event; no durable marker or migration.
- #54 analysis note: named-PR home selection scopes store.workflows(), so prTarget may read each candidate's thread.
  Include that cost in Debug's idle/intake/controls timing analysis; no new cache or latency claim in this follow-up.
- The temporary Also mentions context line can be replaced by the next worker report. Decision 43(d)'s producer
  is now the .47 slice above, paired with New's rendering under the explicit cut; .46 PR-target guards stay unchanged.

## Fast checks after sent replies only (A R39 / owner fast-poll ruling)

- A successful workflow reply receipt (wf.sent.at, whether owner-approved or rule-sent) is the tick's activity evidence,
  not command/ask/run/job/probe/nudge/busy counts. Do not use the generic sent ledger: it also includes reminders and self posts.
- runner/poll records fastUntil from the actual reply time plus the configured window. Existing receipts never extend it
  again on each tick; old replies outside the window cannot reopen it. A later reply extends it. Partial poll configuration
  uses the same default merge as the page. No new workflow, schedule or store fields and no old-data repair.
- Confirmed owner-authored replies use the shared rememberOwnerReply writer, covering intake and the pre-send check.
  An unconfirmed/unrelated owner message and somebody else's incoming reply do not open it. Incoming text only renews
  fast checks once Delegate sends its answer. Nudges, reminders, acknowledgements and status posts alone do not qualify.
- Successful and stopped ticks schedule using that window; a source failure retains its existing backoff/nextAt while
  recording any already-persisted reply. Pending workflow sendAt deadlines join the earliest reminder/retry deadline:
  they wake at the due minute without opening a fast window. Kick/answer/local-job wakeups stay unchanged.
  Previously open windows expire normally and are not renewed by unrelated activity.
- Cadence change from removing the no-reply busy trigger: relay/host jobs without a local PID and closed
  Continue windows are noticed at idle cadence unless another wake is due (normally 5 minutes during work hours,
  15 outside). A stopped runner can retain an existing reply's fast window while supervising without source reads.
  The sent-receipt workflow scan is cached where scopes permit; include its cost in #54, not a measured-cost claim.
- The authorized fictional Temp check exercises actual ticks with fake source/procs and a stub worker, an owner-approved
  send, a rule-tagged persisted receipt, confirmed owner replies, ask/run/job/nudge negatives, replay/expiry, retry and
  source-backoff preservation. No real source/model calls or new committed proof/test/golden cases.
- Page copy remains New's A R39/R42 work and must ship with this behavior. This does not consume SEND's blocked
  key-dependent 0.2.46 merge or future decision-48 prerequisites.

## New-message PR join boundary (0.2.45)

- Scope incoming body text before quote/subject routing. prJoinCandidates uses explicit PR / PR # / pull request words,
  or validated dev.azure.com / *.visualstudio.com pullrequest URLs. Bare numbers and non-ADO PR links never identify an
  ADO item; a foreign-only PR link cannot collide with an open ADO target. Attachments/forwarded fields are not new inputs.
  The existing approval-number parser keeps its old behavior; linksIn, joinWhy and v5 family splitting are unchanged.
- Existing sender, freshness, quiet/backlog and closed-reopen gates still apply. One matching eligible item wins even
  when another named PR makes askRelation differ. Several matches require a matching explicit reply target, otherwise
  take the existing ambiguity/new-item path; a wrong-PR quote/subject cannot override the boundary. No PR means old routing.
  Named-PR group context is not appended to unrelated items; owner waiting-work links and new cross-chat parts are scoped too.
- A joined item gets one info fact "Also mentions PR <n>" for additional names. In the sole-match/multi-PR case only,
  the joiner may record Workflow.prAnchor {pr,msgId,at}: the actual old prTarget, computed before append, among the names.
  Never from a worker or migration, never overwritten by a later join. prTarget honors it only while the message is owned;
  a different single computed/lone-ask target fails closed and logs pr-anchor-conflict {code,anchor,computed}.
- The same prTarget drives existing review/vote/effect guards; this grants no action on another PR. Splitting the anchor
  message out or replacing it clears the anchor; close clears it through stateFields. Pure compatibility discards a stale,
  removed, redacted or closed anchor, restoring the old computation. No existing family is rewritten.
- Authorized fictional %TEMP% checks cover PE P1-P6, multi-PR effect/vote refusal, anchor ownership/conflict/lifecycle,
  strict providers and unchanged sender/freshness/reopen/no-PR behavior. No committed tests or golden rows.
- The optional schema-8 nit only suppresses a missing-job skipped log for non-review intent; payload/stamping is unchanged.
  Forwarded-text preservation, fast polling and A76's result-send call site remain separate queued work.

## Historic review context, schema 8 (A48(a))

- WORKFLOW_SCHEMA is 8; all existing workflow constructors keep using the shared constant. Versions 4-7 are unchanged,
  and version 8 stays inside the existing 50-per-schema-phase bound, fresh reads, recordCommit and skipped stamping.
- runner/review-context exports the pure trimReviewContext(job, parents, context, intent?) -> {context, dropped, warns}.
  Its predicate/regex/filter are the former finishWork #8 policy: PR review, not a recurring job, no author parent;
  drop reviewNoise facts and make retained tones info. Ineligible inputs pass through unchanged. reviewNoise remains
  re-exported from jobs for compatibility; report intent is passed explicitly by finishWork.
- The migration resolves the linked job and parent roles, trims workflow context and the done job's result.context,
  including a job-only cache when workflow context is empty. Job context commits before the schema stamp, through
  recordCommit and the standard job writer; other result fields are retained. Missing job evidence leaves context unchanged and logs skipped.
  A changed trim logs review-context-trimmed with migrated:true and workflow dropped/warns plus separate job counts.
- Finish and migration use the same helper. When an eligible finish trims every fact, it also clears old workflow
  context rather than silently retaining the stale facts; non-review/author/recurring behavior is unchanged.
- The one-time schema pass, not projection, fixes the page, chat/status and worker inputs together. No new repair,
  per-read mutation, model run, source call, send, vote or job restart.
- Check wording (owner clarification): drain schema-phase passes on the %TEMP% copy until every workflow is at 8.
  Author and non-review payloads stay unchanged except for schema (their jobs byte-identical). A second completed
  phase changes no workflow, job or marker bytes. Show finish-vs-migration helper equality. No full tick is claimed.
- The authorised copy check must name absent real controls honestly: fictional Temp controls cover author/recurring
  exclusions and a populated done-job cache when the live copy lacks them. No new committed tests/goldens. Normal
  E2E fixtures import WORKFLOW_SCHEMA and are born at 8 automatically; no harness API or fixture-shape change is needed.

## Not-finished status metadata hygiene

- The goal-not-met, non-work report path uses statusFields('not-finished', the existing text), not a bare status write.
  Keep Needs human, why/tried copy, holding draft, question, effects, learnAfter and revAt behavior unchanged.
  Old records continue through the existing read-time status compatibility; no rewrite or repair.
- No new AST/proof cases under the current owner rule; the existing status writes get a PE diff scan and allowed gates.

## Tick measurement, warm and cold (#54 step 1)

- Every existing tick-phase gains fsMs/netMs and cold/idleMs. Ten tick-step records cover readOwnerCommands, checkJobs,
  legacyEffects, migrateWorkflows, cliServers, adoProbe, applyAnswers, discover, intake and retryOwnerReplies, in their
  existing order and read scopes. Synchronous steps stay synchronous; failure records are emitted before rethrow.
  A step or phase timing-log failure is reported to stderr, not substituted for the owner's result or original work error.
- cold is based on time since the existing previous chats.endAt: idleMs >=900,000 is cold, without rounding up shorter
  idle gaps. Missing/invalid/future end times are cold; valid idleMs is logged so the
  VM table can audit that classification. No schedule, timestamp, lease, cursor, cache or connection lifetime changes.
- fsMs is non-overlapping native store-call time (including stat, reads/writes, opens/closes/lists/removes and retry sleeps)
  plus the existing receipt-lock counter. Existing read/write counters remain unchanged; summing them would double-count
  nested reads. The native wrappers preserve overloads and current import bindings.
- netMs is elapsed external-call latency, not wall time minus filesystem time: Source/procs/awaited worker boundaries,
  MCP connect/list/call/close, host loopback HTTP and synchronous child-process waits. A detached job's lifetime is not
  charged to the tick. Async-local nesting counts inner boundaries once; receivers and results/errors are preserved.
- Counters are process-wide completion deltas, not exclusive CPU/network buckets. Concurrent catalog work can overlap
  other phases, and nested phases/steps are not additive; fsMs+netMs is not a wall-time decomposition.
- New phase/step payloads contain fixed names, numbers and cold only, in the existing metadata telemetry catalog
  (shape-only payload; no tool arguments, server identities or message text). Existing ms/allMs meaning is unchanged.
- This is measurement only. Debug's three idle VM ticks decide optimizations; warm <2 s and cold <5 s are targets,
  not achieved claims. No new tests/proofs: build, both types, existing goldens, publication scan and PE diff review.

## Acceptance Undo identity fix (U1)

- Keep acceptedTextHash as the proposal's h.rule.text hash. After unchanged acceptance's writer succeeds, read back
  exactly one learned line by its trusted habit key and record its actual text hash as acceptedLineTextHash.
  Legacy learned-source wording can differ from the proposal, including its evidence suffix; never guess that stored hash.
- Undo compares h.rule.text with acceptedTextHash and line.text with acceptedLineTextHash. All other latest-change,
  confirmation/consent, original-grant, ownership, window, on/off and shared-lock gates stay unchanged.
  Clear both hashes wherever acceptance Undo is invalidated. A missing/ambiguous read-back reports an explicit error
  after the rules write rather than saving invented identity metadata or claiming success.
- Old acceptances without the stored-line hash refuse exact Undo at read time; normal line controls remain available.
  No repair, migration or grant change. #54 instrumentation is parked outside this fix; no new tests/proof cases.

## Undo an unchanged habit acceptance (A R33)

- Unchanged ok records acceptedBefore `{state, at, until, told}` and acceptedTextHash only after the rule writer succeeds.
  Repeated ok does not reset that snapshot/window. Edited acceptance and later accepted-style editing do not arm it;
  other habit changes clear it. Stop-style/removes offers have no acceptance Undo.
- Export `undoAcceptHabit(store, id): HabitTransitionResult` for SEND (stable key or H code). The habit must still be
  accepted, inside the existing undo window, with its snapshot and one matching confirmed learned line: same accepted
  words, original grant ID, consent timestamp and on/off state. Missing, replaced, edited, ambiguous or expired records refuse.
  Its confirmation time must also match, except an older stamp equal to the file-wide legacy confirmation: legacyLine
  can carry that old stamp into a newly persisted record. Fresh learned/habit consent times still match the acceptance;
  newer or unrelated confirmation stamps refuse. This is a read-time rule, not a migration or timestamp rewrite.
- Reuse the central writer's existing reentrant non-spinning record lock across the fresh gate, setRules and habit restore.
  No new writer implementation or lock file. Remove all grants of that learned line first; BUSY/changed-source/writer
  refusals return before habit changes or a success log. Restore the four fields exactly, including absent until/told.
  No dismissal, cooldown extension or negative-learning event is recorded; repeat Undo refuses.
- The existing answerHabitResult undo verb delegates to this function. Legacy style-Undo eligibility uses the same guard;
  SEND owns undoAcceptSuggestion and the page's six-second status action. Older accepted records without a snapshot
  cannot be restored exactly: hide/refuse acceptance Undo at read time and leave normal line controls available, no repair.
- No new tests/proof cases. The allowed build/types/existing goldens/publication gates and PE diff review apply.

## Edited suggestion acceptance (R12a-h follow-up)

- Integrate PE-approved SEND `3fad10e3`. For a suggested habit accepted with changed text, answerHabitResult calls
  addSuggestedRuleLine with the original trusted rule ID, habit key/evidence and actual edit-consent time.
  Only a real drafting style carries the edited words as style metadata; a stop-style offer never inherits its target's style.
- A refusal returns before acceptance, dismissal-Undo invalidation or success logging. Success stores the edited text
  on the habit and clears dismissal Undo; it does not first accept the original grant or confirm the edited one.
  The central writer returns an unconfirmed learned Reading row for the existing compile lane. Unchanged acceptance,
  normal stop-style acceptance and accepted-style editing retain their existing paths. No migration or repair is needed.
- SEND owns the facade hookup. Existing build/types/goldens/publication checks apply; no new proof cases.

## Rule compile priority lane (R12a-h)

- Integrate PE-approved SEND `ee88b4ad` (including `a58444d8`) by exact parent. Every free slot in the existing draft pool checks `rulesToCompile` first,
  with fresh reads, before taking another queued draft. Compiles share `maxParallel` and the daily AI-run allowance;
  they do not preempt a running draft or occupy a second pool. Pause/stop and an AI setup hold leave them pending.
- Claim a line once per text hash per dispatch pass, and at most one version of an ID in flight. Recheck the queue
  whenever a slot frees: a line edited during its compile is read again, never overwritten by the old result.
  `finishRuleCompile(store, id, expectedTextHash, rawOutput)` owns the fresh locked compare and schema validation.
  An already-read/deleted/changed line is not an error for the new text; invalid output or a busy writer stays pending,
  logs its refusal and raises Health. Failures cannot starve normal drafts in that pass.
- Fresh host sessions use the compile schema and a verified empty tool set, with no worker report requirement.
  Their IDs are separate from a possible CLI fallback, so late SDK cleanup cannot delete that fallback's session.
  The normal worker preflight and the warm-only five-second quick-check route are unchanged. Compiles have the normal
  run deadline and cold-spawn fallback; a tool-less compile is not a worker-tools-missing incident.
- Spawn uses an empty MCP config and no owner tools, with only the existing prompt-file read and completion tools.
  Copilot returns task_complete JSON; Claude returns final-result JSON. Neither path writes a workflow or a report.
  Temporary run files are cleaned in finally, including on malformed output or writer refusal.
- Code supplies the capability/limit catalogs and known account identities; unknown IDs or mismatched names are refused,
  so a read-back cannot name someone other than the grant's target.
  Raw model output never grants consent. SEND's code-built row still says Reading... until compilation lands, with
  no promised time; widening/confirmation, Can't yet/Partly and Settings redirects remain its existing lifecycle.
- Old pending lines are picked up by SEND's source reconciliation, not a new repair or marker. No new proof cases
  or tests: build, both app types, existing goldens and publication scan; the PE's diff review is the regression gate.

## Habits handoff to the central rules writer (R12a-h2 / R29)

- Integrate released `180307f5` and SEND writer `0c68eeb6`. `habits.setRules` now returns `writeHabitRules`'s discriminated
  result; it never writes rules.md/compiled itself. Acceptance, accepted-style edits, style removal, Undo and Never all
  check `ok` before changing habit state or logging success. BUSY/changed-source refusals return verbatim. Mutation lists
  come from the writer's full rulesSnapshot, not the active-only Store.rules policy reader, retaining inactive learned lines.
- Only trusted current habit rules reach that writer. Unchanged Add it stamps `learned.at` at acceptance, not at evidence
  discovery; explicit accepted-style edits keep the existing draft-only grant/scope and use the edit-consent time. Changed suggestion text is not confirmed through the habit
  path: SEND's facade compiles it normally. Other owner/Settings rules are neither edited nor deleted by habit decisions.
- Four exported plain functions for SEND (IDs accept a habit's stable `key` or its H `code`):
  - `habitSuggestions(store): HabitSuggestions` returns `{open?: Habit, turnedDown: [{habit, at, how}]}`. Open is the latest
    currently suggested record, at most one; turnedDown contains currently snoozed/declined records, newest first. Read-only.
  - `dismissHabit(store, id, how: 'not-now'|'never'): HabitTransitionResult`;
  - `undoDismiss(store, id): HabitTransitionResult`;
  - `reconsiderHabit(store, id): HabitTransitionResult`.
  Mutation results are `{ok:true, habit}` or `{ok:false, why}`; the facade must propagate refusals. Accepted lines use their
  line controls, not suggestion-dismissal APIs. `answerHabitResult` provides `{ok:true,text}|{ok:false,why}` for acceptance
  and legacy controls; applyAnswers forwards the refusal bit to page receipts. Existing `answerHabit` remains a string adapter.
- `Habit.dismissals` persists id/at/how/evidence-count plus the previous suggestion state. First Not now waits 14 days;
  second and later wait 60 days and require at least twice the last dismissed evidence count before automatic re-offer.
  Send, style and style-removal generation enforce that floor alongside their existing evidence rules. Never has no expiry.
- Undo restores the prior state only for the latest still-undoable dismissal. It marks that event undone (no double Undo)
  and does not count it toward later cooldowns. Acceptance/edit/re-offer/reconsider invalidates dismissal Undo.
  Reconsider opens immediately without erasing the history; it is an explicit override, not an automatic Never expiry.
  The page's six-second Undo display window is not an engine timeout.
- Old records need no repair/migration: a legacy snooze retains its stored expiry and implies one prior Not now; its date
  can be derived from the original 14-day expiry. A legacy permanent decline has only its existing habit date, not a claimed
  recovered action timestamp; no fabricated prior-state snapshot means no historical Undo. New actions record exact times.
- Fresh synchronous habit-list updates preserve unrelated records; rule writes retain the central writer's one lock.
  Existing manual fixtures that create owner rules now call `store/rules.writeRules`, not the learned-only helper, with no
  new cases/assertions or proof execution. No test/ edits. Drift remains R14; build/both types/existing goldens/publish only.

## Keep waiting instead (R11(3), runner contract)

- Reuse the existing `wait` verb: New's link under an unsent follow-up submits `{code: followUpItem.code, verb: 'wait'}`
  with no text, on the exact workflow revision. Target the A item, not its W entry; do not use `skip`, which learns.
  Ordinary non-follow-up work waits and explicit wait-duration text keep their existing handling.
- The runner requires a normal follow-up reply, a uniquely linked W entry in the same chat whose original message is
  still in the item, no sent reply, and a resting/scheduled draft (or an already-skipped retry). Window-owned, linked
  unfinished work, shared jobs and queued/running jobs refuse without changing anything.
- Close the draft as `done` / `closedBy: 'skipped'`, cancel its approval/scheduled send, clear edit-learning/promise state,
  and stop its own idle watch/work without touching another item's work. Keep the unsent draft for history.
  Bypass the normal skip branch: no skipped/outcome learning event, learning hook, source call or model is used.
- A fresh synchronous waiting-list read removes only this follow-up's `item` link, retaining the original ask, people,
  chat, message, age and current state. A waiting entry returns immediately instead of waiting for the closed-item cooldown.
  Already answered/dismissed entries remain so; they are never resurrected. Other and concurrently added rows are retained.
- Confirmation/refusal uses only stored outcomes, page submissions and local receipts, including the self surface; it never
  posts a follow-up or an acknowledgement to Teams. Duplicate already-closed/unlinked actions do not send or learn.
  `recordAnswerResult` is the unchanged local-result portion extracted from reply; existing reply transport behavior stays.
- Existing linked follow-up records use the same handler without a migration. This commit is runner-only; New owns the
  link, its eligibility and projection. No new tests/proofs/golden rows; only allowed fast checks and PE diff review.

## Trusted owner identity in the tick source (R12a / R26 handoff)

- After merging SEND `ae2bbf03`, the tick passes `cfg.owner.id` as `sourceFor`'s fourth argument. Teams member tenant
  provenance is anchored to the matching trusted user ID, never the owner's display name. Injected sources and the demo
  adapter keep their existing behavior. No owner config, policy, membership parser or cache is changed by this call site.

## PR review head-change producer (R10c slice 2 / R24)

- On the exact fixed SEND handoff (`ebd81a69`, merged as `177df412`), `probePRs` compares a review item's live PR head only
  with its same-PR, code-verified `wf.reviewBasis.head`. Missing basis/head, another PR or `sameHead` equality sets no marker.
  It never adopts the latest read, a vote effect or worker prose as the reviewed revision.
- A mismatch sets `reviewAgain {pr, head: live, at}`. Subsequent pushes replace the marker; repeated reads of the same new
  head retain its first-seen time. New marker revisions invalidate old page actions. Normal PR read metadata remains fresh.
- The producer clears nothing and falls through to the normal role/effect/vote/closure checks. It never writes prStatus
  before those checks, so closedNow's missing-date fallback still sees the prior state. Only the stale-draft automatic
  redraft is suppressed for a verified-basis head mismatch; approval/closure news and other existing transitions still run.
  With no other news, reviewed results remain and re-review still needs an explicit ask/action.
- Repeated probes do not refresh the marker time. A new marker is saved through the existing commit path and counted
  once even when the same probe also handles ordinary PR news.
- The corrected live-vote/closed-after-ask completion runs first. SEND keeps its during-review completion check; no second
  after-completion producer is added to its posting hook or finishReview. New reads the existing reviewAgain shape and the
  fresh prRead head for its Review again / exact-head Approve state.
- No migration or repair: old items without a verified reviewBasis remain unmarked; verified items converge on the next
  normal probe. Only build, both typechecks, existing goldens and clean publish run; official PE diff/regression review pending.

## PR review owner-item lifecycle, first slice (R10c)

- Successful PR reads populate `wf.prGroups` using `reviewerGroups` from the review gate: cleaned L2 labels, deduplicated
  case-insensitively. An omitted reviewer list means unknown, not an empty known list. Missing readers/targets, failed reads
  and malformed PR responses clear this scope; `recheckPr` and `voteNow` use the same producer. Existing items acquire it
  on their next normal successful PR read, without a repair or migration.
- `liveOwnerVote` reads only the live response, sharing the review gate's owner identity rule: unique sign-in when supplied,
  otherwise an unambiguous display name. Group votes, duplicate matches, unknown enum values and cached receipts do not
  establish the owner's vote. Existing vote preflight readers use the same helper; exact-head checks are unchanged.
- A resting standalone `intent: 'pr_review'` item closes into Done only on news: a non-zero live owner vote that differs
  from its known review-start `prVote`, or the existing `closedNow` (a completed/abandoned PR closed after the ask).
  An old "Waiting for author" vote and a PR merged before the ask remain context, not completion.
  Running/queued jobs, pending input, linked unfinished parts and generic/compound PR work stay on their existing paths.
  Owner commands arriving during the asynchronous role read are deferred instead of being overwritten by a close.
- The same code-read PR response used for `job.reviewStart` captures each parent's live `prVote` baseline, including zero.
  A failed/unknown start read clears the old baseline. Ordinary probes do not invent or rebase standalone review baselines;
  older items with no baseline retain the existing probe paths, never the new vote-news close. Report-only wrap-up retains
  the original review's baseline, so an owner vote during the review is not swallowed by a later reporting run.
- New's owner-item contract: `state: 'done'`, `closedBy: 'nothing'`, and exact `status`:
  - `You approved PR <n>`;
  - `You voted "Approved with suggestions" on PR <n>`;
  - `You voted "Waiting for author" on PR <n>` / `You voted "Rejected" on PR <n>`;
  - `PR <n> closed` for either completed or abandoned.
  `prRead`/`prReadAt` and `prStatus` come from that read; `prVote` is the start baseline while waiting, the live value on Done.
  The item retains its sent reply, draft, effects/receipts,
  sources and job result for Done; it does not start a new turn, rerun a review, send a reply or cast a vote.
- SEND owns the completion-time `reviewBasis` evidence; the separate head-change slice above consumes it without guessing
  a reviewed head from the latest live PR. Only the existing fast
  checks run; no new test/proof/golden cases or browser/engine proofs. Official PE diff/regression review is pending.

## PR review start stamp (R20 prerequisite)

- Optional `Workflow.prGroups?: string[]` is reserved for R10c's cleaned reviewer-group producer; unknown PR reads clear it.
  Optional `Job.reviewStart?: {pr, head, at}` is code-read start evidence, not a completed review or permission to post.
  Old records need no migration. SEND owns the distinct reviewBasis field and its completion-time verification.
- `startJobs` is now awaited. Before each PR review work run (including retries and relays), it reads the
  job's single PR through the existing probe, replaces the previous stamp, and then starts the worker.
  Missing/ambiguous targets, unavailable readers, malformed reads and failures log `pr-check-failed` with phase
  `review-start` and leave the stamp unset; the review can still run but cannot establish an auto-post basis.
- Report-only wrap-up runs retain the original stamp only after re-reading the same head; they never relabel older
  findings as a review of a newer head. Status-only trackers, execution runs and unrelated jobs do not create review-start stamps.
- After the await, the job and controls are re-read before starting; changed/cancelled jobs, Pause/Stop, the AI hold and
  run/parallel caps prevent a stale start. Existing cursor, receipt and completion-hook behavior is unchanged.
  A borrowed probe stays borrowed; a locally opened probe is closed. The late tick start paths do not reopen the probe
  whose dispatch lifetime has ended.
- All three production call sites await the start pass. Existing manual-script callers receive mechanical await updates
  only: no added proof cases, no test-directory edits and no engine/browser proof runs. Validation is build, both app
  typechecks, existing card/report goldens and clean publish; official PE diff/regression review is pending.

## Reviewer-group answers (L2a)

- `runner/review-gate.ts` exports `groupChoices(groupAsk): GroupChoices`, a pure read-time adapter for both existing
  and new `Workflow.groupAsk {pr, groups}`. It returns the existing Choices shape with `multi: true`, `other: false`,
  the prompt "Which of these review groups on PR <n> are you in?", and one `{label, value}` per raw group.
  Labels drop the leading `[Org]\`, identifier-style parenthetical tags and markdown escapes; values retain the exact
  server names. The final option is `{label: 'None of these', value: ''}`.
  Separately, `groupQuestion` lists those cleaned labels in `wf.question` and says "Say the names, or none.",
  so chat and pre-L2b cards remain answerable without the checkbox UI.
- L2b consumes that adapter under "Delegate also asks"; it must not overwrite the worker's independent `wf.choices`.
  Its Save submits the existing `pick` verb with 1-based `nums` in `groupAsk.groups` order, with index `groups.length + 1`
  reserved for None alone. Group-list changes stamp `revAt`, so an already-open page cannot save indices for a different list.
  Offer that group pick only when `wf.choices` is absent; otherwise picks retain their existing worker-choice meaning.
  Card/projection changes remain separately owned; this commit changes no page files.
- `applyOne` intercepts reviewer-group answers and picks before generic choice/redraft handling, including old saved asks.
  Existing card answers (Try again, Redraft, Add the vote, Send anyway and Review again) bypass group selection and keep
  their established retry/redraft/send handling; they never change remembered membership.
  `groupSelection` accepts case-insensitive cleaned names (comma, semicolon, newline, "and" or "+" separated), full raw
  names, None, and whole-answer yes/no for exactly one group. Ambiguous cleaned labels require full names or numbered picks.
  Empty/out-of-range picks, None mixed with groups, unknown names and multi-group yes/no save no config and never redraft;
  the reply is "Say which groups you're in, or none."
- `groupAnswer` freshly reads config and saves both membership lists in one synchronous write: selected groups in
  reviewerGroups, every unselected asked group in notReviewerGroups, unrelated entries retained. It clears and commits the
  saved question before re-reading the PR, retaining held-vote restoration and review restart only on usable PR evidence.
  The answer says "Delegate remembers your answer." Full/short-name membership matching remains unchanged.
- `unknownGroups` checks both lists. Normal PR processing refreshes existing asks, removes already-known groups and updates
  the prompt without a repair job or schema rewrite. `groupChoices` supplies the new display contract immediately on reads
  of old asks. No new tests, proof cases or golden rows; only the owner-approved fast checks run, with PE diff review pending.

## Step-6 PE correction B1: distinguish new data from legacy data

- All four Workflow factories (intake creation/split, waiting follow-up and tracker) stamp WORKFLOW_SCHEMA.
  New items never enter the legacy schema chain. Jobs, automations and proposals keep their independent schema 1.
  Existing old workflows still follow the bounded migration; no repair or migration behavior is changed here.
- The typed engine AST audit rejects a Workflow literal whose schema does not reference WORKFLOW_SCHEMA.
  The manual proof now constructs items through real intake, splitOff, applyAnswers and track, rather than seeding schema 7.
  Migration returns zero, workflow bytes and the completion marker remain byte-identical, and no upgrade/skip logs appear.
- `node scripts/prove-workflow-upgrades.mjs` now proves 40 journeys. The real-constructor assertion reproduced B1 before
  the four-factory fix, then passed after it.

## R5 exact SEND handoff merge

- Merge only ac80ea62 onto the fd61abbc release integration (d894d2c2). Retain SEND's report preparation at runOne,
  finishWork and terminal-return applyReport, the optional store context, structured review results and the idempotent
  repairPendingEffectCalls path from legacyEffects. No later SEND work is included.
- Retain HOST status/return/failure lifecycle fields, fresh owned-field commits and working clocks. The newly introduced
  repair state transition uses stateFields too; SEND's workflow/job re-read merge fixes remain intact.
- All comment-call, stage-B native MCP and structured-report proofs pass, as do migration/clock 36, send 26, aggregate
  holds 20, sharing 12, receipt wording 21, scopes 29 and retention 15. Twenty current-schema simulated-storage ticks:
  p50/p90/max 372/447/1769 ms; real page/settings during await 266/262 ms. Build and both app typechecks pass.

## R5 release-base merge

- Merge the exact 0.2.41 + CI-only base, retaining multi-reason owner holds, warm checks/history and New's released UI.
  Host schema/status/return metadata and stateFields working clocks remain in place. Generated assets are rebuilt.
- The released asynchronous approved-hold refresh now commits through recordCommit, preserving the host's fresh-merge
  rule at the newly introduced await/save point. The merge proof adds a second-process write during that refresh.
- Manual merge proof: workflow upgrades/clock audit 36 journeys, send 26, aggregate holds 20, effect wording 21,
  build and both typechecks. SEND's later ac80ea62 integration is the next bounded merge, not included by this base.

## Card-state step 6: compatibility and durable schema upgrades

PE A1/A2 splits the original v2-v7 proposal:
- `core/upgrades.ts` owns the pure v2 schema/msgIds/kept compatibility fill and v3 legacy reason/review mapping. Store's original two call
  sites are unchanged; its only handover is removing the old function and importing this one. Reads do no migration I/O.
- New `statusReason`, `reviewAgain { pr, head, at }` and `returnedFrom { machine, at, report }` are independent of SEND's
  `reason` hold union. Writers stamp them beside display prose. Follow-up, vote refusal, review-again, window return and
  scheduled-status readers use fields, not status prefixes. Owner actions durably clear the return marker; new drafts clear
  obsolete return/failure/review metadata. There is no new active-hold field.
- `workingSince` is stamped by `stateFields` at every typed workflow transition and constructor: entering running or
  waiting_on_task starts its phase clock, reassigning the same state preserves it, and leaving clears it. Metadata-only
  saves cannot move the clock. Legacy reads fall back to waitingSince or the saved updatedAt until the next write freezes it.
  The standalone proof audits all typed engine state writers so a later bare assignment cannot silently bypass this rule.
- The runner processes at most 50 workflows below schema 7 per tick, in order: v4 legacy setup/stopped failures, v5 part
  links (the home goal's PR is authoritative), v6 no-news check dates, v7 author questions and recoverable finding comments.
  Each step stages a private candidate. An inapplicable conversion preserves that step's data and records its skip reason.
  The final owned-field commit saves schema 7 synchronously, then emits the ordered `upgraded` / `upgrade-skipped` events.
  Existing probeMark run-failure/blocked/parts/no-news one-shots are removed.
- `state/upgrades.json`'s `schema-7-done` is advisory, never a gate: later old items still migrate, and a pending late backlog
  clears the marker. Already-current items are not rewritten or scanned twice. Root marker updates also use a fresh read.
- v7 uses the existing PR-reference/comment builder; finding payload file/line/text survive. Recorded run evidence or a
  unique archived report identifies the source. Missing/invalid payloads skip rather than invent text or half-convert a question.
  Recovered effects are unapproved proposals, never claimed done or executed by migration.
- This is a runner/store-compatibility change, not New's card-facts wiring. New still owns consuming these fields in cards.
  SEND's applyReport signature/context call and effect-call-shape-1 repair are untouched.

Proof: `node scripts/prove-workflow-upgrades.mjs`: 35 fictional-store journeys, including direct comparison with all four
pre-change repair functions, every prior schema, per-version log idempotency, the 50-item limit, late arrivals, skip rollback,
structured readers, exact review head, window lifecycle, stable working clocks and a second-process metadata edit during context reads.
The 400-item tick rig now seeds current-schema workflows (a first migration is not an empty tick). Twenty ticks remain <=2 s;
measured p50/p90/max 355/464/1607 ms on the fixed simulated-storage rig. No live-store or real-provider performance claim.
## #50 stage B: comment ranges and structured results

Code-built inline comment calls use the payload's positive `endLineLength` when
known, otherwise offset 1 to anchor to the final line without an unverified
out-of-range offset. The catalog still determines the argument names.
`finishWork` saves the report's structured `findings` and `voteRecommendation`
alongside its summary, reply and effects; it does not infer them from prose.

Worker proposals are prepared at `runOne`, `finishWork` and terminal-return
`applyReport`, using authoritative parent PR references and the full cached
tool schema. Worker inline arguments are not authority. Missing payload fields
become visible `Couldn't prepare comment N: ...` to-dos, not offered calls or
silent completion. Votes/add-me retain their existing builders and live gates;
code-built author questions are validated separately.

Before the existing `legacyEffects` drop, `effect-call-shape-1` is an idempotent
validity rule, not a once-only upgrade. Only definitely unmade pending comments
outside running jobs are repaired; done, off, uncertain and ledger receipts
are preserved. Workflow and carrier calls stay aligned even when two malformed
calls were identical but their finding payloads differed. Repair clears old
approval and queued execution, bumps `revAt`, retains the draft, and exposes
`status: "The comment format was wrong and is fixed. Post them now?"`.
The existing card contract is repaired `effects`, current revision, cleared
`approved`, and explicit `todos`/`question` for failures; no card branch is added.
Repair never posts or reruns work. A fresh exact-revision approval is required.
Successful repair logs are keyed by the repaired effect's `pageChangeId`;
unchanged ticks do not repeat them, and later catalog changes are still checked.
Workflow repair uses the runner's `recordCommit` merge point, retaining newer
drafts and kept tasks. Carrier updates re-read the job and change only its
result effects and queued-execution fields, retaining newer result metadata;
fresh running jobs and newly recorded receipts remain untouched.

Fictional Temp-root proof: `node scripts/prove-effect-preparation.ts` exercises
real dispatch/report submission, card data, stale/current approvals, native MCP
schema-checked writes, closed-window return, repair receipts and catalog changes.
`node scripts/prove-review-report.ts` also verifies structured result storage.

## #53: shape-only tool result keys

Run-tools metadata retains only the fixed envelope keys `content`,
`structuredContent`, `isError`, `text`, `textResultForLlm`, `resultType`,
`binaryResultsForLlm`, `error`, `image`, `data`, `value`, `items`, `nextLink`
and `count`. All other top-level names map to one deduplicated `other`; the
existing 20-key inspection bound and truncation signal are unchanged.
`node scripts/prove-run-tools.ts` proves a name-keyed result logs only
`['other']`, with no names, values, arguments or tool-call IDs.
HOST still owns activation after every run with the current session slice.

## #46: app version before commit

PM/design and PE approval: queue item #46, PE 19:30, "build as written".
Data: nearest release tag, commits since that tag, full installed commit and
update channel; without git, package.json, then saved state/version.json.
The installed package version wins over stale saved state.
Ranked scenarios: tagged release, commits after release, non-git install.
Compared commit-only (opaque), version-only (ambiguous between updates), and
version plus short commit (selected). New/Classic and Report a problem use
"Version 0.2.37 (abc1234)" or "Version 0.2.37+3 (def5678)"; non-git installs
show only the version. Hover exposes the full commit and channel.
Resolve release tags matching v[0-9]* once at page-server startup and after an
applied update, never from a request or polling timer. Existing process restart
after updates made by another process resolves the new identity at startup.
Fictional git/HTTP/browser proof covers each fallback, unrelated tags, update
refresh and unchanged git trace across repeated page requests (including past
the former 30-second cache expiry): `node scripts/prove-version.ts --browser`.

## #51 chat effect wording

- Effect lines group adjacent comments on the same PR without moving a vote past another operation. Counts read
  "a comment" / "2 comments"; present, running and past forms come from exact calls, with the PR title capped at 40 characters.
  A following vote uses "it" only for the most recently named PR. Unknown effects keep `shown().line`.
- Chat preview/edit/approval lines use command codes only in the closing command. Completion names the person and group chat.
  Existing result fields render partial, failed, uncertain and changes-only receipts without changing execution or retry gates.
  Uncertain results never offer a retry; raw tool names, job IDs and commit hashes are not emitted as failure reasons.
- Manual fictional proof: `node scripts/prove-effect-lines.mjs`, 21 copy variants and a real apply/approval receipt.
  Existing send and sharing journeys remain green. No page, card, projection or store changes.

## #27 runner wiring and commit-point audit

- Tick preserves its operation order in isolated controls/answers, approved-change, answer-first, intake, sweep/probe,
  dispatch, supervision/send, summary and finalization phases. Catalog work and individual workers/effects have child contexts.
  The snapshot has an isolated `{ writes: false }` phase so its nested synchronous renderer keeps the page's copy semantics.
- Flat record snapshots are shared only across async phases: validate the directory signature and process write version,
  retain them for at most the original one-second deadline, and cap the cache at 5,000 records / 1,000 folders. A consumer's
  epoch cannot outlive that snapshot. `freshRead` bypasses this reuse and validates files individually; synchronous requests
  outside phases remain unchanged. Readonly consumers receive private parsed snapshots. No watcher or new worker project.
- This removes repeated folder/file metadata work without changing the declared freshness bound. Bulk record copies clone
  once, not once per record twice. Canonical dependency paths stay absolute; relative requests and listing result paths remain
  correct after a working-directory change. A write never promotes an expired listing into a fresh epoch.
- `recordCommit` starts from the acquired record before local mutations, including nested handlers on the same object. At a commit,
  read fresh, merge changed owned fields with the latest unrelated fields, then save synchronously. It is not a transaction;
  same-field contention still relies on the existing writer/lease rules. No external effect is automatically replayed.

Named audit points:
- [tick.ts](../src/runner/tick.ts): cursor commits after command/intake awaits.
- [dispatch.ts](../src/runner/dispatch.ts): queued item re-read, post-model session/report commit, post-vote/sharing/ack draft
  merge, question-answer commit and automation result re-read. A newer ask holds the result; a cancelled queued item never runs.
- [apply.ts](../src/runner/apply.ts): answer handler, remembered owner draft, held-send/group answer/correction, send receipt
  after the remote post, and the outer answer commit after Undo. Sent receipts still precede closure/learning.
- [autosend.ts](../src/runner/autosend.ts): acknowledgement marker before posting, scheduled preview/hold metadata and the
  post-send outer commit. Presence awaits cannot resurrect cancelled items; policy decisions and at-most-once markers survive.
- [jobs.ts](../src/runner/jobs.ts): per-job supervisor/start/execution reads, detached-start metadata, execution-parent updates,
  and final job merge retaining newly appended asks. Effect calls keep their existing ledger and have fresh child phases.
- [probe.ts](../src/runner/probe.ts): live PR/role metadata merges, including caller-owned pending changes.
- [continue.ts](../src/runner/continue.ts): open-on metadata after process inspection and terminal-return report commit.
- [own.ts](../src/runner/own.ts): legacy retention metadata and post-removal retirement update, including the save's before-state read.

Proof: `node scripts/prove-read-phases.mjs` (29 invariants), `node scripts/prove-tick-phases.mjs` (20 ticks plus real HTTP,
two-process item/config changes, acquisition-to-commit tracking, send/Undo/acknowledgement, scheduled holds,
execution/start/PR/window commits, invalid PR
evidence clearing, cancellation, stopped/outage and no-replay cases).
To compare the same rig with an older tick: `node scripts/prove-tick-phases.mjs --baseline-ref=<pre-wiring-ref>`.
The baseline loads that tick with absolute production-module imports, not a second store implementation.

400 fictional items / 55 jobs; fixed simulated open/stat/list costs 0.35 / 0.05 / 0.1 ms:

| Measurement | Pre-wiring p50 / p90 / max | Scoped p50 / p90 / max |
| --- | --- | --- |
| Whole tick, including snapshot/finalization | 6,171 / 6,347 / 8,323 ms | 382 / 493 / 1,593 ms |
| readText requests | 7,484 / 7,484 / 8,800 | 461 / 916 / 1,376 |
| Physical readFile attempts | 6,634 / 6,634 / 8,807 | 40 / 40 / 913 |
| Physical stat calls | 885 / 885 / 885 | 501 / 1,344 / 1,660 |

Real HTTP page/settings during an awaiting tick: 248 / 242 ms. Phase counters distinguish reads, stats, opens, listings and
hits; overlapping phase counters are not additive. The final tick event includes cleanup. These are simulated-storage results,
not a VM or real-OneDrive performance claim. No State.save, React, card or projection changes.

## #27 async scope API

- `readPhase(name, asyncWork)` uses AsyncLocalStorage for a writing context spanning awaits. Each child phase owns its cache;
  success/error closes it, and late callbacks read uncached. `freshRead(syncWork)` creates an independent fresh writing scope
  for commit-point re-reads. Existing synchronous `readScope` inherits a phase, or preserves its old request lifetime outside one.
- A phase epoch is at most 1,000 monotonic ms. Hits do not stat. The first use after expiry lazily validates file signatures,
  including missing files, once per file/version/epoch. Listings validate their folder. Derived/record values rebuild after
  expiry because a descendant edit need not alter the top folder's mtime; unchanged text is reused after signature validation.
- Every process write, append, move and remove bumps path/ancestor-folder versions, including writes outside a scope.
  Parallel contexts discard mismatched entries immediately. Own JSON/listing writes are write-through; other entries survive.
  Writing contexts return copies, derived keys remain `<kind>:<folder>`, and the existing bounded text cache remains.
- Counters distinguish readText requests (`reads`), signature calls (`stats`), readFile attempts (`opens`), directory reads
  (`lists`) and cache hits (`hits`). No workflow migration or page/store-state change.
- Manual proof: `node scripts/prove-read-phases.mjs` covers 29 invariants, including 100 JSON reads = one stat/open, parallel
  same-epoch visibility, inherited sync scopes, external epoch/fresh reads, missing files, descendant facts, move/remove/append,
  settled/error contexts, copy rules and invalid derived keys. Tick wiring and its 400-item measurements are recorded above.

## #45: warm-only one-shot checks

- `host/client.quick(prompt, jsonSchema, timeoutMs = 5000)` returns validated JSON, or `undefined` so the owner-send caller
  fails open. It only contacts an existing matching warm host: no ensureHost, package discovery, CLI start or spawn fallback.
  A host becomes model-ready after a successful normal turn; an older host without this readiness field is unavailable.
- One wall-clock deadline, capped at five seconds, covers ping, session admission and inference. Streaming bytes never reset
  it. The server rejects cold/draining/busy requests immediately and aborts an expired or disconnected check.
- Every check creates a fresh SDK session with an empty available-tool set, no worker/MCP definitions, no memory/config
  discovery and denied permissions. It verifies zero actual tools before prompting. The provider receives the response schema,
  and the host validates the returned JSON against it. No item/job session is resumed or backed up.
- Ephemeral sessions are aborted when needed, disconnected and deleted, including late session creation. Cleanup errors are
  logged; they cannot extend the caller's deadline. Quick errors never count toward the worker host breaker.
- Old data needs no migration: this API owns no workflow state. The configured model is unchanged; the send caller still owns
  the semantic yes/no/unsure decision, its history note and all strict rule-send checks.
- Manual proof: `node scripts/prove-host-quick.mjs`, real installed runtime and local stub model on isolated Temp homes.
  Yes/no/unsure return schema-valid values; malformed, wrong-schema, provider error, absent/cold/busy/draining/down host and
  timeout fail open. An eight-second provider returned unavailable after 5,009 ms and was aborted. Trickle-response deadline,
  zero offered tools, fresh history, deleted ephemeral sessions, unchanged item history/start markers and a healthy subsequent
  worker all pass. The existing host-tools proof also passes. These are local-stub numbers, not real-provider latency.
## Merge of #29 (HOST) with #36: a redraft keeps what the draft it replaces drew on

- `drewOn` on a redraft is the previous draft's chats plus `draftUse`'s chats (HOST's union, on #36's `draftUse`).
- The previous draft's `records` carry over, so the record chips stay.
- An unknown read now, or an unknown-reads hold behind the replaced draft (legacy string or `{ kind: 'reads' }`), holds as
  `{ kind: 'reads' }`.
- An earlier hold with no chats behind it (a record's: restricted, unread, customer) is kept when the new run finds no hold.
- Proof on the merged tree, stub model (quota): a redraft after a chat-B draft keeps the `conversation` hold; one after a
  restricted-incident hold keeps it and the record; an unheld item stays unheld; input tokens stay about 6.7k a call.

## #36: need to know by source audience

PM rule `pm-need-to-know-audience.md`, with the PE 17:05 corrections.

- **Incident audience, from data.** The field names come from the owner's real session logs, read-only, names and booleans only; they
  are written into #36's spec. An incident read with the incident tool's `get_incident_details_by_id` is org-visible only when `isSecurityRisk`,
  `isRestricted` and `isSupportEngagement` are all present and `false` in its `structuredContent`. Anything missing or non-boolean
  is Restricted (`core/share.ts incidentAudience`).
- **ADO.**
  - `ado-repo_pull_request`, `ado-wit_work_item` and `ado-wiki` reads are org-visible only in a project on the new
    `orgVisibleProjects` list (Settings › You, "Projects anyone in your org can read"; empty by default).
  - A work item's project comes from `System.TeamProject` when the call names none.
  - No project at all means Restricted.
- **Provenance.**
  - `readsOf` records successful record reads with their id (`Look.tool: incident | ado | wiki`, `id`) as `Reads.records`, kept on the
    item as `wf.records`.
  - `draftUse`: a cited record counts only with a read of that id; otherwise it is `unread`, which holds. A restricted record that
    was read counts even uncited.
  - Cited chats always count. Read chats count unless every source is a record that was read (fail-closed).
  - Documents count as the chat they were shared in (#40), and a Confidential label holds.
- **`sharingHold`** returns `{ kind, record?, chat?, who?, level? }`, never prose. Kinds: `marked`, `members`, `guest`,
  `restricted`, `unread`, `conversation`, `customer`, and `reads` (set by dispatch). The first that applies decides, in the PM's
  order.
  - Customer details are checked deterministically: GUIDs and emails in the draft that this chat's thread doesn't have.
  - Owner sends are unchanged (`gate.ts`).
  - Stored prose holds read as "Waiting for you: …".
  - Hold text never displays a chat id, including stored prose and record/person fields.
    `sharingHold` passes only a readable source chat name, not the adapter's id fallback;
    a saved chat-level name is the next choice. The card displays named conversation holds as
    "Need to know: uses something from <chat name>, and Kim isn't in it."
    Without a name they say "Need to know: uses something from another chat you're in,
    and not everyone here is." The formatter retains its "Waiting for you:" wrapper,
    which callers replace with the card's "Need to know:" prefix. Other hold kinds
    use a readable name or "another chat".
- **Shareable within my org.**
  - A new chat level, for groups and meetings only (a 1:1 is refused).
  - A shareable chat used elsewhere doesn't hold when the target chat has no guest.
  - Any membership read that finds a guest clears it, logs `shareable-cleared`, and tells the owner once in his self-chat.
  - Members are now cached with `guests`.
- **Settings, Chats you marked (C(2)).**
  - Read from `cfg.chatLevels` plus the cached member names. Untitled group rows use the existing `placeOf(...).sentence`;
    titled chats and 1:1 names stay unchanged. No stored-name migration, new wording, or Teams read is needed.
  - Preserve the existing row order and chat-ID-based actions. Both Settings experiences and the text view consume `aboutView`.
  - Keep the existing `"<name> is normal again"` instruction rather than replace it with a row-action-only instruction:
    `setChatLevel` accepts the exact displayed place label for marked chats, case-insensitively.
  - Exact stored names and displayed labels are considered together before the existing substring-name fallback. A chat
    matching both counts once; different chats sharing a label, or a label colliding with another exact name, refuse as
    ambiguous rather than pick a target. Direct chat IDs and message links still resolve as before.
  - Mark/undo receipts and marked-chat ambiguity suggestions use the same cached place words; saved names remain unchanged.
- **Pending effect-call repair, structured refusal handoff.**
  - `repairPendingEffectCalls(store, consume?)` collects the existing pure `prepareEffectCalls` refusal drafts for the effects
    it repairs/removes. An optional `(wf, drafts: LeftDraft[]) => void` consumer receives the same workflow after its
    `recordCommit` baseline and local repair updates, before that commit saves it. No new source, ID or formatter is assigned here.
  - With a consumer, these refusal strings are not also appended to legacy `wf.todos`; existing todos are preserved, and
    question/status text keeps its old behavior. Without a consumer, old callers retain the existing legacy todos.
  - HOST owns the consumer's source/hash/clear state and caller wiring. This callback does not change successful-Send closing.
- **A120 self-chat parity (decision 52, 0.2.46).**
  - The text inbox and `more` headers use `placeOf(...).row`; result/owner-send receipts use its sentence form. They pass the
    workflow's asker so cached labels omit both asker and owner, just like the page. Titled and 1:1 names stay unchanged.
  - Pure renderers accept a trailing optional `Place`; list rendering accepts a per-item place lookup. Old signatures remain valid.
    HOST must wire the inbox in `runner/proposals.ts` with `w => placeOf(store, w.chat, w.asker)`, and both `runner/apply.ts`
    `more`/result callers with `placeOf(store, wf.chat, wf.asker)`. The MCP `more` caller passes the same argument
    (decision 53 assigns that exact file to SEND). Full self-chat parity requires the reviewed HOST caller counterparts.
  - Place data propagates through list/item/status result rendering. Unknown members use the reviewed helper's group-chat
    fallback, with no Teams reads, workflow-name rewrites or new wording. The renderer imports only the `Place` type, not a runtime
    helper/store dependency; `place.ts` remains unchanged.
  - The plain successful-send receipt also consumes the same place helper rather than bypassing it. Only text changes:
    send authorization, final checks, `keepTodos`, closing, retries, markers, undo and A76 rule metadata are untouched.
- **Left-for-you consent (decision 53, 0.2.46).**
  - Ticks and the two line-bound draft verbs use a separate `leftRev`, derived from sorted active line IDs and clear state.
    Only active left IDs or open legacy kept IDs can be ticked; stale revisions and cleared/unknown IDs refuse.
    A generic page Close cannot tick active lines without the explicit mark-todos binding.
  - Send and approve still use the unchanged `workflowApprovalRev`; left-line changes alone never stale their consent.
  - MCP close selection includes active lines. A done item admits only an exact active-line draft verb in addition to its
    existing commands. The runner remains authoritative for kind, window and retry checks; these commands never send.
- **Card and page.**
  - `CardFacts.shareHold` gives `CardState.waited`, the "Why it waited" line in the PM's words. Golden G63–G70, one per kind;
    70/70.
  - "Need to know" keeps its warning.
  - Record chips read "Incident 900001 · visible in your org" or "… · restricted" (source kind `Record`).
  - The reply workflow says to cite the record, not the chat.
- **Proof.** Fictional root, stub model (quota). Session-log events are in the AI CLI's own shape (as in the owner's logs); Teams
  members come from a stub source. Each case went through the real `readsOf`, `draftUse` and `sharingHold`:
  - **No hold:** Ex1 (an org-only chat, the incident read and cited); rule R1 sends it at high confidence.
  - **Holds, each with its line:**
    - Ex2: a guest in the chat;
    - Ex3: a war-room quote that Dev isn't in. Marking the war room Shareable removes the hold;
    - a restricted incident;
    - missing audience fields;
    - a cited incident never read;
    - a PR in an unlisted project;
    - an unlabelled doc shared in the war room;
    - a private 1:1 quote;
    - customer details.
  - **Shareable:** a 1:1 can't be marked. A guest joining the Release room cleared its mark, with one notice.
  - **The card, New and Classic:** shows the warning, the "Why it waited" line and the chips, and Send stays.
  - **The inert owner copy:** the page builds, and the one-thread projection matches the whole one on all 114 items.

## #43: a terminal hold uses the window's own process and a 12 h cap; Take it back

PE 16:50 corrections, built as written.
- **`checkOpen`.**
  - A local window counts as open only when its pid is alive and runs `delegate continue` (`windowProcess`: the CIM/`ps` command
    line matches `ours()` and "continue"), it started after boot, and it is under 12 h old (the cap remote windows had).
  - The process-table answer is cached per pid and start for the life of the process.
  - A release takes the existing closed path, and `continue-closed` gets
    `why: closed | taken-back | over-12h | gone | not-ours`. No one-off is needed: the rule runs every tick.
- **A late report.** `submit_report` from a window whose open record is gone, has another `runId`, or was taken back is refused:
  "Delegate took this item back; what you decide here isn't used. Tell Delegate in the page instead." It is logged as
  `continue-late-report`. The terminal is never killed.
- **Card.**
  - `CardFacts.hold` gains `kind: 'window'` with `machine` and `since` (from `wf.openOn` and the open record).
  - Mode `in-terminal` comes first: primary `take-back`, no secondary, ⋯ `dismiss`, editor `none`. Its warn reads "Open in a
    terminal on <machine> since <time> · Delegate waits until you close it."
  - `checkCard` flags any other action on it.
  - Golden G60–G62: it beats a running state, a draft, and a failure plus a question. 62/62.
- **Placement.**
  - `whose.ts` rule `in-terminal` (section `move`) comes first in precedence, and gives row kind `in-terminal` with that line.
  - Running lists leave out items with `openOn`; Classic lists them under Needs you.
- **Take it back.** A page action with exact rev that writes `closed` and `takenBack` on the open record and nothing else. Receipt:
  "Taken back. Your terminal stays open; what you decide there now isn't used." The next tick applies a report the window already
  submitted, as a preview, and releases the item.
- **Open question for the PE.** The ⋯ Dismiss the spec gives this mode is refused by the engine while the window holds the item
  ("Close the window first"), as before.
- **Proof.** Fictional root, stub model (quota), Edge, real processes.
  - **The stand-in window's command line** on Windows reads `node.exe -e … src\cli.ts continue A3`, so it matches.
  - **First tick:** an A173-shaped hold whose pid belongs to an unrelated process was released (`not-ours`), and its paced
    redraft ran on the next tick. A hold over 12 h on a stand-in `delegate continue` was released (`over-12h`).
  - **A live stand-in window (Ana):**
    - It stayed held: row `in-terminal` in the owner's section and Classic's Needs you, not in either Running list. The card is
      `in-terminal` with Take it back in New and Classic.
    - Its report submitted before Take it back came back as a preview after the next tick (`taken-back`).
    - A report after Take it back was refused with the line, and the terminal kept running.
  - **Earlier proofs still pass:** held Send, send-edit, refused/replay/422, and the #41 holding flows.

## #41 + #42: a holding reply keeps the item open; a click the server never got is sent again once, or released

**#41 (PE 16:40 spec).** An owner send of a draft with `holding: true` keeps the item open on its question.
- **After the send:**
  - The item goes to `needs_human` with its `question`, or "What should the full reply to <first> say?" when there was none.
  - The draft is cleared and `approved` dropped.
  - `wf.sent` records `holding: true`, alongside the `sent` log line's `holding`.
  - The status is "Holding reply sent. <first> is waiting for the full answer." The card lands in `answer` mode through the
    existing rules (golden G59).
- **Nothing keyed on `wf.sent` blocks the full reply.** Each of these is gated on "the last send was not a holding reply":
  - the done/correction checks and the sent-plus-promise waits in apply.ts;
  - `reopenable`;
  - `keepApprovedDraft`;
  - intake's `recordOwnerReply` logging;
  - the send gate's `alreadyReplied` ("A reply to this message already exists").
- **Learning, need-to-know and promises.** Nothing is learned from a holding text. Need-to-know and promises are unchanged.
- **A typed `ok`** sends a holding draft while its question is open, as the page's Send does.

**#42 (PE 16:40 corrections).**
- **Server.**
  - It keeps an in-process set of submission ids whose POST it is handling: added once the body is read, before the intent is
    parsed, and removed in `finally`.
  - `/api/v1/result` answers 202 "Still working on it." for those, the receipt when one is saved, and 404 "No saved click with this
    id." otherwise.
- **Client storage.** A pending click keeps its exact request (`intent`) in tab storage, so it survives a reload.
- **When a click is sent again.**
  - Only on a 404 from `/result`: never on a 202, and never while the click's own POST is still out.
  - Once automatically; again from Check again / Check now; and once more on the first poll after 10 minutes, unless it is `unreached`.
- **What the replay can get.**
  - A receipt: done.
  - 409: the refused receipt's line.
  - 422: logged, and the click is released.
  - A definite 404 or 5xx, followed by a `/result` that still says 404 (decision 49 (a)): released and never sent again; Send is
    offered again with "Not sent: Delegate didn't get your click. Try again." ("Not saved: …" for an action that sends nothing).
  - A network failure, or a `/result` that can't be reached: `unreached`, below.
- **Unknown outcome (decision 49 (b), PE 22:36:38Z, PM 22:43:03Z (A)).** When the receipt can't be reached about a click whose POST
  failed, or its replay was lost on the network, the click is `unreached`: Send stays disabled, with "Couldn't confirm whether your
  reply was sent. Check again before sending it again." as its hover and under the bar, with an outline [Check again] (focus moves
  there; one alert). Nothing is sent again on its own, not even the 10-minute replay. Check again re-polls: a receipt shows its
  result, a 202 means Delegate has it, and a 404 sends the same request once more. Actions that send nothing keep "Not confirmed
  yet." with Check now.
- **The result slot (I28, PE 22:44:56Z / 22:49:23Z).** The owner's click reserves the slot under that card's bar for its largest
  state at the current width (the "Still working on it" line, the unknown state with its button, the not-sent line), measured
  before paint. Later states swap in place; it shrinks only on his next click there, or when the card closes or the page changes.
  Once reserved it is also capped at that height (CR B1 on 7556c674): a receipt's or the server's own words (unbounded, landing
  later) are clipped there. A clipped slot shows "… Show all" over its last row (PE 01:13:27Z): a button he can tab to or tap (44 px
  tall hit area), shown lines kept whole. Show all lifts the cap for one layout pass, then fixes the slot at the full words plus a
  row for Show less (his own change, so nothing later grows it unasked); Show less, his next click there, or unmount returns the
  reserved height. Each line keeps its full words in its title and whole text node for screen readers. A busy button
  ("Sending…") keeps the width it took at the click, so the controls beside it don't slide when the label shrinks back.
- **A new click after a release** uses a new id.

**Proof.** Fictional root, stub model (quota), Edge.

- **#41**
  - **Priya (New):** the holding reply sent +1 message, and the card is in `answer` mode in New and Classic. Her same-ask follow-up
    joined the item's thread, the redraft produced the full draft, and Send sent +1; the item closed.
  - **Kim (Classic):** holding reply +1, then answer, full draft and Send +1; the item closed.
  - **Sam:** a typed `ok` sent the holding reply once and left the item open on its question.
- **#42**
  - **A, New, Kim's Send:** the first POST was dropped and sent again once. One answer, one log line, one message; the same request
    sent again changed nothing.
  - **B, Classic Waiting card:** W1 Dismiss with the first POST dropped; dismissed once.
  - **C:** every POST answered 500. The click was released with the plain line and Send was enabled again; a new click went once.
  - **D, Classic W2 Dismiss:** the POST and its replay were both lost, so it showed `unreached` with Check saved result; that button
    dismissed it once.
  - **E:** `/result` answered 202 while a POST waited on a lock held by another process, then 200; an unknown id got 404.
- **Earlier proofs still pass:** held Send, send-edit, 2a, and refused/replay/422. On 2a, sending the edited holding reply now
  keeps the item open.
- **card-golden:** 59/59. G58: a CLI tool denial recorded as `other` is not permanent (PE 0c follow-up).

## #29 follow-up: retain two reply-run histories

- After a reply run, its session records the previous managed reply ID and any retired IDs still awaiting cleanup.
  After the dispatch pool finishes, cleanup keeps current/previous histories and deletes older managed reply directories
  from both the local Copilot home and synced backups. It never rewrites a retained transcript.
- Every job session (including done jobs), owner session, other item's current/previous session and open terminal is protected.
  Unmanaged histories are not inferred from folder age or names. Only UUIDs recorded as reply sessions can be removed;
  links and invalid IDs are refused explicitly. Failed deletion is logged and retried on a later pass.
- Protected or failed cleanup writes no workflow when its retirement list is unchanged. After recursive deletion, metadata is
  merged into a fresh item read: concurrent answers/status and newly retired IDs survive. The legacy pass also re-reads before
  saving only retirement metadata. With no retired IDs, cleanup never reads jobs or owners.
- Old #29 data uses the versioned `reply-sessions-1` upgrade: scan at most 30 days of worker logs once, taking only `fresh`
  reply-session IDs for their exact item. Unknown histories and the existing privacy-retention policy remain unchanged.
- Manual proof: `node scripts/prove-reply-retention.mjs`. Five production dispatches on a fictional Temp root leave exactly
  two local and synced histories. Job/owner/other-item references survive, released references converge, invalid IDs are refused,
  legacy logs converge once, subsequent cleanup scans zero logs, and retained history is byte-identical.
- Early answer runs are sequential with intake. A message arriving during the turn is read afterward and causes the normal
  rerun; the early redraft is a preview, and send-time checks (including the separately shipped owner-send hold check) still apply.

## #29: compact reply sessions and answer-first dispatch

- Every item reply run uses a fresh UUID; the self-contained prompt carries the thread, owner answer, prior draft,
  work, and up to 2k characters of completed-job summary/findings. Job runs and private questions about jobs keep their sessions.
- The latest reply session is saved and backed up without changing old histories. Continue uses it when newer than the job;
  active jobs/relays still own their sessions. Legacy items without a reply-session timestamp retain the old target.
- Rewrites retain prior draft source-chat provenance, including unknown-read holds, and completed-job findings.
  Findings are snapshotted on the job result (at most 12); legacy completed jobs snapshot the item's old findings on read,
  without rerunning. Reply facts merge by label, newest wording wins, and unrelated reply facts never become job facts.
  No approval, owner-send, send-time PR check or sharing gate is weakened.
- Answer runs on a kicked tick start before intake/sweep, restricted to the answered IDs. Intake follows those runs, avoiding
  stale probe/intake writes. Same-tick news still queues a new turn for normal dispatch; news received during a model turn
  still uses report-held. Normal budgets and terminal holds apply.
- A redraft can reuse item-specific PR evidence for under ten minutes. Missing/invalid/old timestamps force the normal read;
  send-time evidence and explicit review jobs are unchanged.
- Applying an answer completes its page submission with "Redrafting with your answer" before the worker starts.
  Same-batch approved direct changes still start first, preserving the approval fast path.
- Worker logs include fresh/session ID, inputTokens/calls aliases and existing usage/tool/warm fields. Answer-dispatch logs
  include answer-to-dispatch and tick-to-dispatch milliseconds.
- Manual proof: `node scripts/prove-redraft-latency.mjs`, isolated Temp homes and actual installed runtime.
  Ten resumed-history and ten fresh redrafts use a local stub charging 1 s/10k estimated input tokens plus 1.5 s/call.
  Stub numbers are not real-provider latency or browser-render latency. Card wording/stale-job display remain card-owner work.
- Allowed change-tool formats (#28) are compact proposal references: property names, type, required, enum and numeric/length/item
  bounds only, no descriptions, and at most one nested field level (including local definition references). The shared
  reply/job/promise/tracker formatter reads the cache without scanning servers or changing its full validation schemas.
  The entire shape block ends with `(shapes truncated; propose only fields shown)`; missing required formats must be reported,
  never invented. Required fields precede optional ones; truncation keeps complete fields/JSON and does not grant tools.
  Its budget is 2,300 characters, deliberately below PE's 4k ceiling: a 4k block measured +16.6% input on the fictional redraft,
  exceeding the +10% target. Old reports/data and approved execute prompts are unchanged; there is no migration or save-line change.
  `node scripts/prove-review-report.ts` covers the reference boundaries and unchanged full-schema call validation.
  `node scripts/prove-compact-shapes.mjs` runs three fresh real dispatch/submit/apply journeys on the installed runtime with
  ten fictional cached write tools: no shapes, the former full schemas, and compact shapes. Its local stub uses the same
  estimated-input formula as the #29 proof, not a provider tokenizer, and requires each compact call to stay within +10%
  of the no-shapes control. All homes and writes stay in Temp; the proof drains its host and stops its model server.
  Measured calls: no-shapes 6,911 / 7,046; full schemas 17,092 / 17,227 (38,850 schema characters);
  compact 7,566 / 7,701 (+9.48% / +9.30% versus no-shapes). All three save the same fictional draft.

Final manual measurement (ten each, actual runtime, delayed local stub):

| Measurement | Resumed history p50 / p90 | Fresh reply p50 / p90 |
| --- | --- | --- |
| Worker wall time | 13,215 / 13,604 ms | 5,711 / 5,806 ms |
| Estimated input per model call | 44,138 / 45,016 tokens | 6,838 / 6,978 tokens |

All ten fresh runs were warm, with one report-tool call each. Reworded findings replace their old label, reply-only facts
expire, and unknown-read holds survive a known shared audience. The real tick reads same-tick news and redrafts it, records
answer dispatch within 1.5 s, acknowledges before the model turn, and writes the production page snapshot without errors.
An actual resumed job question and a captured Continue command select their expected sessions. The proof host drains;
no proof session is written in the owner's home. The existing host-tools proof also passes. PE diff review: ok.

## #27 step 2 fix: an item's thread survives a join or detach after the page loaded (PE review of 52ce1bd4)

- **The bug.** The code index assumed `partOf` never changes, but intake's `addPart`, the worker's join and `repairParts` change it.
  After the runner joined an item to a home, the page server's stale index left the clicked part out of its own thread.
- **The fix.**
  - `itemThread` always includes the clicked item.
  - It takes the home's parts from `home.work.parts` (read fresh) together with the index, and reads each to confirm
    `partOf === home.id`.
  - `workflow()` and `save()` refresh the item's index entry. The comment now says `partOf` can change.
- **Proof** (fictional root, stub model (quota); the page loads, then a separate runner process joins A2 into A1, then detaches
  it with `repairParts`):

  |  | Before the fix | After |
  |---|---|---|
  | A2's one-thread projection right after the join | Not equal to the whole | Equal |
  | After the detach, and for the home A1 | Equal | Equal |

  The clicks (stale Send, fresh Later) answered as the whole projection does in both versions. Before the fix that was only
  because the miss fell back to the whole projection.
- **Re-run on the inert owner-shape copy:**
  - 114/114 items with identical item actions, at most 31 reads;
  - the whole page byte-identical;
  - Later, Dismiss and Send 26–36 reads.

## #27 step 2 follow-up: Send no longer reads every proposal; scoped() keys must name their folder

- **resolvePageIntent** looks up a reminder or knowledge proposal only when the item is no workflow, as its `expect` already
  preferred the workflow. Every Send used to read all proposals: 232 files on the owner's copy.
- **`scoped()`** throws for a key that isn't `<kind>:<folder>`, so a new derived value can't escape write invalidation (PE review
  of step 1, note 1).
- **Inert copy of the owner's root** (Temp, 114 items, page server in-process, 12 clicks, stub model (quota)):
  - Later, Dismiss and Send: 26–36 reads, at most 48 ms each (Send was 260 reads before this). Receipts: 4 reads, ≤ 12 ms.
  - The page: 540 reads, about 1 s.
  - A knowledge action (K1) still goes through the whole projection: 542 reads, 1.07 s, 202.

## #27 step 2: a page action projects only its item's thread; code index; answer and knowledge lookups by name

PE spec `engineer-store-read-model.md`, step 2.
- **One-thread projection.** `reactProjection(store, query, visit, { only: code })` runs the same body on the item's thread only:
  its home and parts, found through `Store.itemThread`, which is how `place()` groups them. Their jobs come with them.
  - `snapshot(store, now, only)`, `view(…, snap)` and `nextView({ only })` leave out the page-wide parts: knowledge to review,
    tiles, boot lines, details, Done rows from the logs, the week count, and the knowledge-proposal loop. The "Why it waited" line
    is left out too; its hourly count reads every item, and no action depends on it.
- **resolvePageIntent** finds an item's own action (`A12/approve`) in that thread's projection. A row, Done or page action still
  uses the whole projection.
- **Store indexes.**
  - `byCode` keeps a per-process index of each workflow file's code and `partOf`, which are fixed when the item is made.
    - The folder listing finds new and removed files; only new files are read.
    - The item is read to confirm it is the one asked for.
    - A code the up-to-date index lacks is no workflow's.
    - `workflows()` fills the index, so a page load warms it.
  - `answered`/`answerById` look at this machine's own answer file before listing the folder.
- **Knowledge.** `read("card:topic/card#id")` reads that one card file when its front matter says it is that card; otherwise it
  reads all cards, as before.
- **Proof.** Stub model (quota).
  - **Inert copy of the owner's root (114 items):** the one-thread projection offers exactly the full projection's 408 item
    actions on every item (id, kind, label, rev, expect, staleness, effect, input, availability, resolved answer). It reads at most
    31 files (median 22).
  - **Whole page before and after:** byte-identical (1,591,521 chars).
  - **Fictional 235-item root in OneDrive, 20 clicks:** reads per action 487 → 18–19; p95 0.83 s → 26 ms; receipt reads
    237 → 4, 8 ms. Before step 1 it was 58,094 reads and 37.9 s.
  - **Unchanged behaviour:** the card proofs, the refused/replay/422/Send-once checks, and a page action through the whole
    projection.

## #27 step 1: page actions and receipts read each file once; writes update the read scope

PE spec `engineer-store-read-model.md`, step 1.
- **Scopes.** `/api/v1/actions` (each synchronous submit attempt) and `/api/v1/result` now run inside `readScope`. It is a
  writing scope, `{ writes: true }`, so each read hands out its own copy (`structuredClone`): the action path changes what it reads
  before it saves.
- **Write-through instead of clearing.**
  - `writeText`/`writeJson` keep the parsed value they wrote, add the file to its folder's cached listing, and drop that folder's
    `records:` entry and any `scoped` key derived from a folder above the file.
  - `appendLine` changes nothing: logs are read from disk.
  - `moveTo` updates both folders.
  - New `removeFile` does the same for deletes; the store's receipts and open-window deletes use it.
- **Measured.** Fictional 235-item root inside the OneDrive folder, 20 clicks of Dismiss, Later and Send, page server in-process,
  stub model (quota).

  |  | Before | After |
  |---|---|---|
  | Reads per action | 58,094–58,329 | 486–487 |
  | Action p95 | 37.9 s | 0.83 s |
  | Read, log, read in one scope | 2 disk reads | 1 |
  | Receipt reads | 238 | 237 (step 2) |

  Unchanged: a stale click gives 409 and a refused receipt; a replay returns the same receipt; a reused id gives 422; Send sent once.
  The card proofs (held Send, Send anyway, Redraft, send-edit, 2a) still pass.

## Card state: fixes from the PE review of 0b, the 2a edited reply and #40 document failures

- **B1, his own version on a held card.**
  - A page `send` with the owner's text on a held item restamps the hold's digest for his text and carries it as `sendReview`
    (apply.ts, send case). `heldSend` and the later ask-edited and new-message checks then pass for the same message.
  - This is safe: the page's exact rev hashes `reason`, so he typed it on the card that showed the hold.
  - A typed chat `send` stays held, and is now refused before his text replaces the draft. Before this, a refused send kept the
    text, and Send anyway's digest never matched again.
- **B2.** Held mode always leads with Send anyway; the `preview` exemption is gone from the rule and `checkCard`. An edit or a
  redraft clears `wf.reason`, so an edited draft is mode `reply` (G48).
- **2a after an edit (PE step-4 condition 2).** When the owner edited the reply and switched back to the answer:
  - the fold reads "Your edited reply · not sent" and shows his edit;
  - the send next to Answer is "Send your edited reply" (send-edit).
- **#40 (PE doc-read item 5).**
  - "no decoder", "encoded binary" or "base64" in a failure's reason or routes counts as fixed, so Try again leads (A76).
  - "Couldn't open …: no access | too large to open | too much content to open | not a Word, PowerPoint or Excel file" is a
    content failure: Write the reply yourself leads, Try again follows (as G44).
- **Golden.** Rows can assert `more`.
  - G49–G51: the document causes, through `cardFacts`.
  - G52–G54 and G56–G57: ⋯ for reply, holding, reply-with-question and held.
  - G55: held with a preview still leads with Send anyway.
  - 57/57. The dead `send` helper is removed.
- **Not done here (PE: an engine item).** Sending a holding reply still closes the item. It needs its own PE line, before #29e.
## Card state: a held Send offers Send anyway (PE follow-up to step 3)

SEND (0.2.32) holds the owner's Send with a structured `wf.reason` when the asker edited the ask, wrote again, or no reply looks
needed. Step 3 never read it, so such a card showed a plain Send that the engine refused every time (PE review of 09f9d57).
- **`cardFacts`:** `held = { kind, digest, who, why }` from `wf.reason` when there is a draft. It outranks the status-prose
  `notSent`.
- **`cardState`:** a new mode `held`, placed before `not-sent`. The editor is the reply.
  - **Ask edited, or wrote again:** primary **Send anyway**, secondary Redraft and Later, ⋯ Dismiss. The warn line is "Kim edited
    the question after you approved." or "Kim wrote again after you approved."
  - **No reply needed:** Send anyway, then Skip and Later. The warn line is "Delegate thinks no reply is needed: …".
  - **An edited draft under a hold:** a plain Send, because the edit gives a new digest (SEND B2).
- **`checkCard`:** a held card without an edit must offer Send anyway.
- **Projection:** Send anyway and Redraft use the chat's own verbs, the answers "Send anyway" (which becomes `ok` with the held
  reason's digest) and "Redraft". There are no engine changes, and exact staleness keeps them to the card the owner saw.
- **`ItemCard`:** draws both in the bar; Skip moves from ⋯ into the bar.

**Proof** (fictional root, stub model (quota), Edge)
- **Golden:** `card-golden: 48/48 pass` (G45–G48: one row per hold kind, plus an edited draft under a hold).
- **Kim:** her ask was edited in the stub Teams source, then Send from New. The engine held it (`ask-edited`), and the card
  showed Send anyway · Redraft · Later with "Kim edited the question after you approved." in New and Classic at 1280 light and
  New at 400 dark.
- **Sam:** stored as SEND's `holdSend` stores it, with its own `reviewDigest`. Same buttons, with "Sam wrote again after you
  approved." (In the live tick, Sam's new message was read before the Send, so it went out: a SEND-engine ordering question, noted
  for that builder.)
- **Ana:** SEND's `keepApprovedDraft`, then Send anyway · Skip · Later.
- **A plain chat `ok` while held** was refused, and nothing was sent. **Send anyway from New** sent Kim's and Ana's drafts once
  each. **Redraft from Classic** started one rewrite of Sam's, from his new message.

## Card state from one place, step 4: the card renders by mode (#34)

- **One box, one primary.** `ItemCard` draws the projection's primary and never picks its own. A card with a question and a draft
  follows the designer's two modes (question-and-draft):
  - **2a (question + holding draft):** the answer box opens, the draft folds read-only ("Delegate's draft so far · not sent"), and
    "Edit and send the draft instead" switches.
  - **2b (question + full draft):** the reply box opens, with "💬 Delegate also asks: …" and "Answer instead" under it.
  - **Switching:** keeps both typed texts (`CardUi.mode`), moves the focus into the box that opens, and announces the switch.
    Ctrl+Enter clicks the open box's primary.
  - **Labels:** "Answer and draft reply" / "Answer and redraft"; the answer box says "only Delegate sees it".
- **One failure shape.** The failed block keeps its line and "What it tried". Try again and Write the reply yourself are both in the
  bar, the one `retryHelps` picks as primary. Write the reply yourself opens an empty, focused box whose own button sends the text.
- **Offered ⊆ drawn.** Try again and Review again are drawn whenever offered and not primary, and the old `others` approve filter is
  gone. The card marks `data-undrawn` if any offered action has nowhere to be drawn.
- **Two fixes found by the proof:**
  - Draft-only cards no longer offer an undrawn "Answer instead".
  - 2a also offers Send your version, so its switch opens an editable reply.
- **Not built in this step, noted for the PE:**
  - Q/E shortcuts.
  - State 4, "redrafting" (needs #29e's receipt).
  - After Send holding reply on 2a, the card returning to state 1 with the question still open: the engine closes the item on any
    send, as before.
  - The flip to Write after a second failure with the same cause: `cardState` supports it, but `repeats` isn't read from the log
    yet.
  - New's row line 3 by mode.

**Proof** (fictional root, stub model (quota), Edge)
- **Golden:** `card-golden: 44/44 pass in 1.7 ms`.
- **One card per state (1, 2a, 2b, 3) and two failures (content; a failed job), in New and Classic at 1280 light and New at 400
  dark:** each has exactly one editable box outside Details and one `data-primary`. Every offered action is drawn, and there's no
  leak and no "Send decision".
  - 1: Answer and draft reply.
  - 2a: Answer and redraft, with Send holding reply.
  - 2b and 3: Send.
  - Content failure: Write the reply yourself, then Try again.
  - Failed job: Try again, then Write the reply yourself.
- **2a:** an answer typed, switched to the draft and edited, then switched back: both texts kept, focus in the open box, and the
  reply mode's primary became Send your version. Ctrl+Enter in answer mode queued exactly the answer and sent nothing.
- **2b (Classic):** Send sent the draft once.
- **Failures:** Write the reply yourself opened an empty, focused box and sent exactly the typed text once; Try again queued once.

## Card state from one place, step 3: the projection offers what cardState names (#34)

- **Projection:** `react-projection.ts` builds `cardFacts` for every item and calls `cardState`. For items waiting on the owner it
  offers exactly the primary, secondary and ⋯ actions the state names, plus Send your version whenever the reply box is the
  editor, with the same bindings as before. The item gets `mode`, `editor` and `block3`.
  - **The primary:** `primaryActionId` is the state's primary.
  - **The warning:** `attention` is the state's warn line; a refused send no longer shows "(Error: …)".
  - **The failure block:** `runFailed` is the current failure, whichever field recorded it.
  - **Removed:** `recoveryCodes`, the nested attention ternaries, and the `:257` rule that hid Send whenever a question was open.
- **Engine:** an `ok` from the page's own Send (`a.page`, the exact card the owner saw) now sends a draft that still has a question
  open (rules 10 and 11). A typed "ok A48" still answers "A48 is not ready: …".
- **`ItemCard`:** the card no longer picks its own primary (the old line 80), and it shows no answer box when the editor is the
  reply. The rest of rendering by mode is step 4.
- **Found by the inert-copy check, and fixed with golden rows first:**
  - G43, A57/A61 "the PR approval could not be verified": `not-sent` keeps Send, since the engine re-checks the approval on every
    Send. This departs from the spec's "no primary", to avoid taking away a Send that works today.
  - G44, A90, a "Not finished: …" with nothing else: `cardFacts` reads it as a content failure, so it shows the failure card with
    Write the reply yourself instead of `unknown`.

**Proof**
- **Golden:** `card-golden: 44/44 pass in 1.5 ms`.
- **Inert copy:** the real projection over a copy of the owner's root (23 Oct copy, without sessions; no Teams, tool servers or
  runner). 12 cards wait on the owner; with a draft but no Send: 0; Answer leading over a draft: 0; invariant breaks: none. Before
  this step, the same copy had A57/A61 (not-sent) and A90 (unknown) unplaced by any rule.
- **Fictional root, stub model (quota), Edge in New and Classic at 1280 light and New at 400 dark:**
  - A48 (question + draft): Send is the primary, and it sent once from New.
  - A179 (question + holding draft): Draft reply leads, with Send holding reply in the bar; that sent once from Classic.
  - A37 (a job that failed 4 days ago, then a newer holding draft): Send holding reply.
  - A128 (refused): Send, with "Didn't send: your approval isn't on PR 1732433 yet."
  - No id or "Error:" leaks, and no invariant breaks.

## Card state from one place, steps 1–2: the rules and their golden cases (#34)

Following `engineer-card-state-devspec.md`. Nothing uses these yet; step 3 wires the projection to them.
- **`src/core/card-state.ts`:** `cardState(facts)` is the PE's ordered rule list: agent-wait, own-reply, failed, review-again,
  declined, not-sent, your-step, choices, answer, answer-with-holding, reply-with-question, changes, holding, reply, unknown. The
  first rule that holds decides the mode, the primary, the secondary and ⋯ actions, the one editable box, block 3, and the single
  warn line. The action names are the projection's existing kinds.
  - **`currentFailure`:** the newest candidate wins, and one older than the draft is dropped (the #33 rule, in one place).
  - **`retryHelps`:** Try again leads for other/tool/stopped failures, or a cause fixed since, and only under 2 repeats.
  - **`checkCard`:** the invariants. No action twice; a draft can be sent outside the modes that name why not; an older failure
    never decides; no `unknown`; the warn line never leaks an id or "Error:"; an answer box only with Answer.
- **`src/core/card-facts.ts`:** `cardFacts()` turns an item, its job and the card view into `CardFacts`. The failure candidates are
  the item's failed run, its failed job, and a stopped wait. A not-sent reason comes from its status prefix. Also the hold,
  own reply, declined review and failed promise.
- **Departures from the spec, noted for the PE:**
  - A failed promise check stays an approve ("Check again"), since that is what its action does.
  - When retrying won't help a review, the "Review it yourself" link leads and Try again is secondary.
- **`scripts/card-golden.ts`:** a proof script, not a test (queue #34). It has 42 rows: G1–G15 one per rule, G16–G30 the past bugs
  (A37, A50, A57, A61, A76, A120, A128, A129, A177, A178, A179, A88, #15, #18, #22), and G31–G42 edge cases. Run it with
  `node scripts/card-golden.ts`.
  - Result: `card-golden: 42/42 pass in 2.5 ms`.
  - With the "newer draft beats an older failure" rule removed, G16 (A37) fails with exactly that regression, then passes again
    once the rule is back.

## Verify the host's offered tools before a draft (#39)

Before sending a prompt, initialize the session's tools and read actual SDK metadata. Require `delegate_worker-submit_report`,
the requested worker tools (including a change run's process-backed `make_change`), and only owner proxies actually registered
with `defineTool`. Resting, failed, stale-catalog and remote/CLI-only owner tools are not registration promises: log their absence
without a host fault. `host-session-tools` records the offered count/names, all missing requested names and `missingRequired`.
A missing required tool sends no prompt, logs `host-tools-missing`, and immediately runs the same item on spawn through #19b's
existing breaker. A no-report answer explicitly naming an unavailable worker/extra tool also takes that path. Match full tool names,
including hyphens, with bare aliases only for Delegate's worker tools. A saved or salvageable report prevents a duplicate run.
The after-turn prose check considers only extra tools and Delegate's own worker tools, not owner tools. A no-report answer naming
an intentionally resting owner server stays on the host, without a strike or cold fallback.

Old data gets versioned upgrade `probeMark.hostToolsUpgrade: 1`: once, scan at most 14 days of worker logs and the corresponding
failed-run transcript interval. Requeue only the latest host no-result failure whose answer explicitly names an unavailable tool,
with no later sent reply or revised draft. Ordinary content/spawn failures stay untouched. `host-tools-requeued` keys the old
workflow/run to prevent replay if the upgrade is interrupted. Completed upgrades never reread those historical logs.

**Cause and limits.** Missing offered-tool verification and setup retry let an unavailable-tool answer become an owner-facing
failure. Historical logs cannot prove actual SDK tool loss or a registration race. The persistent server list correctly excludes
the in-process worker tools. The three cold starts investigated followed two app updates (the version is in the host hash) and a
Saturday idle stop (20 minutes, not the weekday 540-minute setting). No per-run server restart was found; no warmth policy changed.
Host start/replacement logs now include version/hash evidence.

**Proof** (manual script, fictional Temp root, isolated Copilot/local/config/cache/data, real installed SDK/runtime and spawn CLI,
stub model, two 25-second MCP servers). Cold initialization took 26.4 s and offered the report tool; ten virtual work-hours minutes
later the same host replied in 1.4 s, warm, with both servers connected only once. A requested resting library server stayed
optional: warm, no strike, absence logged. Removing registered report/owner/change tools fell back before a model request.
An unavailable-report answer redrafted through real dispatch; a valid report and an ordinary model error did not retry.
Two injected host faults opened #19b's breaker and the third request spawned without calling the host. Recovery requeued only
eligible history, converged under replay and read no logs after its upgrade marker. No owner session directories were added;
all proof host/MCP processes stopped. No unit tests or live-root writes.

The committed focused regression is `node scripts/prove-host-tools.mjs`: it proves actual cold/warm report submission with a
resting requested server, no strike, separate missing/required telemetry, full-name matching and cleanup on an isolated Temp root.
The broader delayed-server/fallback/recovery script was also run for the measurements above; its injected breaker uses a fast
stub spawn so the five-second backoff cannot expire while a real 25-second spawned server starts.

## Settings stays fast while an action waits for its saved result (#27 b, c, d)

**The blocker, reproduced.** The test root was a fictional one in the OneDrive-synced folder with 400 items. A pending page action
was polled every second while another process held its receipt lock for 8 s, as the runner does while it saves the result, and
another process rewrote item files for 12 s.
- **Before:** the receipt poll held the page server's only thread in `withReceiptLock`'s `Atomics.wait` spin: `page-slow GET
  /api/v1/result 8362 ms, lockMs 8022`, `page-stall 8332`. A page load took 7.5 s and one Settings request failed outright.
- **After, same root and load:** Settings answered in 355 ms or less, receipt polls in 727 ms or less, page loads in 750 ms or
  less.

**The fix (b).** The page server never waits on its thread for another process.
- `withReceiptLockNow` takes the lock at once or returns `BUSY`. A lock left by a gone process, or by this process outside any
  receipt action, is taken over.
- A receipt poll that finds the lock busy reads what is saved, without the lock and without writing; the next poll sees the rest.
- A page action's submit (`submitIntentWhenFree`) retries every 50 ms between turns of the thread, for up to 10 s, then answers 503
  with "check it again before acting". While a submit waited 5 s for a held lock, Settings answered in 5–7 ms, with no stall.
- The runner and the AI chat keep the blocking lock, as before.

**An empty tick (d).** The tick log line now has `allMs` and the store time split: `readMs`/`reads`, `writeMs`/`writes`,
`waitMs`. On the 400-item OneDrive root an empty tick took about 3.1 s, almost all of it 6,462 store file reads (about 16 per item);
writes and OneDrive sleeps were near zero. The VM's 13–20 s fits the same reads on a slower synced store; its own tick lines will
confirm it, and cutting those reads is a separate fix.

**Still for the owner's VM:** one session's `page-slow`/`page-stall` lines, before and after, and Settings' first paint while an
action is pending (c).

## A drafted reply can always be sent, and says why it waited (#33)

A37 had a drafted holding reply but offered only "Draft reply". The cause: its review job had failed four days earlier, for a cause
fixed since. That put the item in recovery, which forced the answer as the primary. `ItemCard` never draws an approve action except
as the primary, so Send was gone. The same stale failure kept the "It needs the repo …" warning. And `wf.decision` was empty after
the answer redraft, so Details said nothing about why the reply waited.

- **(a) Recovery yields to a newer draft.** A failed job puts its item in recovery (answer first) only while there is no draft
  written after the failure (`revAt` later than the job's `updatedAt`). With a current draft, the primary is Send or Send holding
  reply, as on any card.
- **(b) An offered send is never hidden.** When another action leads, an offered approve sits next to it in the bar, labelled
  "Send holding reply" for a holding draft.
- **(c) Why it waited.** `whyWaited()` in `policy.ts`, beside `decide()`, gives up to two plain parts:
  - **The rule that didn't apply, and why:** no rule names the person, a rule covers other chats or other kinds of asks, it needs
    more evidence, it's on hold, it always drafts, or automatic replies are off or at their hourly limit.
  - **The check that held the draft:** a blank, a PR vote, an approval or other commitment, a holding reply, the owner's edit, a
    correction, a channel, open work, promised changes, labeled content with guests, an unreadable file, a private source, or low
    evidence.
  - **A rule that would have sent it** but for one check says so ("your rule for Sam would have sent it, but …").
  - The page computes this for every waiting draft, answer redrafts included, with the same context `decide()` uses
    (`policyContext` in `autosend.ts`, now shared by its three callers). Details shows "Why it waited: …".
- **(d) The stale warning goes.** The card's warning uses the failed job's error only while the item is in recovery; otherwise it
  shows the item's own status.
- **Not changed:** with a question as well as a draft, the page still offers no Send (that card is #31's design decision).

**Proof** (fictional root, stub model (quota)). A37's shape: in the group "Acme live-site", Sam asked "can you approve?" about a
PR. The review job failed 4 days ago with "It needs the repo …", and a holding draft came later. The rule R1 covers Kim and Sam in
1:1 chats only.
- **The card (Edge, New and Classic at 1280 light, New at 400 dark):** the primary is "Send holding reply", with no repo warning.
  Details reads "Why it waited: no automatic-reply rule covers this chat; replies about PR approvals always wait for you."
- **A draft older than the failure:** recovery still leads ("Draft reply"), and "Send holding reply" is in the bar, in New and
  Classic.
- **Send holding reply (Classic):** the reply was posted once, and A37 is done.
- **A covered 1:1:** Kim's draft, with a card source and a live one, was sent by rule R1 by itself, as before.

## Settings slow after an action: measure first (#27 a)

On the owner's VM, Settings sat on "Loading settings..." for about a minute right after an action. The endpoint itself is fast on
the owner's data (152 ms), so the page server's thread was busy or blocked. The page server is its own process (`delegate open`
runs it as a child), not the runner's.

**Instrumented, nothing changed.**
- `fsTime` in `fs.ts` counts, per process, time spent in store reads (with a count), writes (with a count), sleeps while OneDrive
  or antivirus held a file (the rename retry), and receipt-lock waits (both spin loops in `state.ts`).
- The page server logs `page-slow` for any request over 1 s: route, status, total ms, `lockMs`, `readMs`/`reads`,
  `writeMs`/`writes`, `waitMs`, `jsonMs`, and `buildMs` (the rest: building the view). A request that overlapped another shares
  the process counters.
- It also logs `page-stall` when its thread was held over 1 s (a 500 ms heartbeat came late): every request waited then, whichever
  held it.
- Next: one owner session on the VM names the real blocker; then (b) to (d).

## The AI host stays warm through the work day (#25)

The live log showed host runs starting in 14–18 s: each came right after `host-started`, and the host stopped seconds later (quiet
hours) or after 20 min idle. The 2 s start was only met within 20 min of a previous run.

**Measured** (a). The worker event now records `via: "host" | "spawn"`. On host runs it also records `warm`: true when the host was
there before the run (the client didn't start it for this call) and every tool server the run uses was already connected.

**Kept through work hours** (b).
- A System advanced setting, **Keep the AI host ready for** (`agent.hostIdleMin`, default 540 minutes, one working day). It applies
  during work hours, the existing `isWorkHours`: Monday to Friday, 9:00 to 18:00 in the owner's time zone.
- Outside work hours the host still stops after 20 minutes idle, and quiet hours still stop it.
- The host reads the setting each idle check, so a change needs no restart.

**Started with the day** (c). The first check of each work day, outside quiet hours, starts the host, so the first reply is warm
too. It is recorded as `warmDay` in `host-start.json` before the start, so it is tried once a day; runs still start a host as
before.

**Settings › System** (d).
- The AI host row reads "On, warm since 10:00 AM (Copilot CLI x): replies start in seconds. It uses about 365 MB of memory while it
  waits." (365 MB is the owner's measurement.)
- Its help gives the work-hours rule; the new row's help gives the same memory note.

**Proof** (fictional root, stub model (quota), a stub tool server). A proof-only clock (a `--import` preload shared through
`NODE_OPTIONS` by the tick, the page server and the spawned host) moved `Date` without waiting.
- **Monday 10:00 IST, first check:** `host-started`, `host-prewarmed`. The second check did nothing.
- **First reply:** started in 1.4 s, `via=host warm=true`.
- **+30 min:** after the host's real 30 s idle check it was still alive (the old 20 min rule would have stopped it). The next reply
  started in 1.4 s, `warm=true`.
- **Saturday 12:00:** a reply started a fresh host (`warm=false`, 3.6 s). 25 min idle stopped it (`idle`); a weekend check didn't
  pre-warm.
- **Monday 21:50, then 22:01:** a reply at 21:50, then quiet hours stopped the host 11 min later (`quiet hours`); a quiet-hours
  check didn't pre-warm.
- **Edge:** the Settings line and row in New and Classic at 1280 light, and New at 400 dark.

## Items blocked before #17 get the failed-run card (#26)

A job that ran out of routes before #17 left its item with the retry's stop text as its status, and with no question, no draft and
no `runFailed`. So `ItemCard` showed the bare "Your answer / Draft reply" card. #17(b) gives that shape only to new blocks, and #11's
repair covered only setup failures. A76 and three others were left like this on the owner's root.

**The repair** (`repairBlocked` in `dispatch.ts`, once per root via `probeMark.blockedRepairAt`, beside #11's). It picks open
`needs_human` items with no question, draft or `runFailed`, whose job is done and whose status is a `retry.ts` stop text:
"Tried N times; ", "Blocked: ", "Needs the asker: " or "Still not ready after N hours; ".
- Each gets `runFailed: { kind: 'content', why, tried, job }`, read from that text. `why` is its first sentence; `tried` is the list
  after ". Tried: ". The time is the job's `retry-stopped` log line.
- The card is then #17(b)'s: "Delegate couldn't draft this at <time>: <why>", "What it tried", **Try again** (it queues the job with
  a fresh session and, now, every read tool), Write the reply yourself, Later and Skip.
- It logs `repair-blocked` with the codes once. Nothing runs by itself: a content failure waits for the owner's Try again.

**Proof** (fictional root, stub model (quota)). Item A1 was made into A76's shape: a doc review with "Tried 3 times; Available
readers return only the v7 prefix ending within Section 5.2 of the Acme spec. … Tried: <3 routes>" and a done job. A2 had the same
status, but with a question.
- **Before the check:** A1 had the bare card, with two text boxes and "Draft reply".
- **After one check:** `repair-blocked ["A1"]`. A1 showed "Delegate couldn't draft this at 11:50 AM: …", "What it tried (3)" with
  the routes, and Try again as the primary button, with no answer box. A2 was unchanged.
- **Edge:** New and Classic at 1280 light and 400 dark.
- **Try again in New:** one `run-retried`; the job was queued with a new session and then started once; A1 went to
  `waiting_on_task`.
- **Not repeated:** the next check logged nothing, and running the repair again by hand found nothing.

## A tool server that can't start: one Settings row, not a banner (#24)

0.2.26 put a top banner on the owner's page for an optional server in his own AI CLI tool settings, one whose program isn't
installed on that machine: "Couldn't start github here (Connection closed; it said: operable program or batch file. …)". That was
half of Windows' "'X' is not recognized as an internal or external command, operable program or batch file.", with no command, no
file and no way out.

**The reason, in plain words** (`diagnose` in `catalog.ts`). It reads the server's whole stderr, the error and what the AI CLI said:
- **A missing program:** "not recognized as an internal or external command", "program not found", ENOENT or "command not found"
  give "the program '<command>' isn't installed".
- **Settings:** an unset `${VAR}` gives "it needs VAR, which isn't set where Delegate runs".
- **Sign-in:** 401/403, unauthorized, token or sign-in give "it couldn't sign in: check its token or sign-in".
- **Anything else:** "it stopped as it started (exit code N)". The server's words are quoted only when short enough to quote whole,
  never as a cut-off tail.

**Retries.** A missing program waits until the config file that names the server changes (its mtime and size are kept in the
catalog), or until the owner presses Retry. Other causes keep the 1 h, then 6 h steps (#23).

**Settings › Tools, one row per server.**
- **The row:** "<name> (in your AI CLI's tool settings, ~/.copilot/mcp-config.json) can't start on <machine>: <reason>. Delegate
  works without it." A server from Delegate's own settings names config.json instead.
- **The buttons:** **Retry** (the next check tries it) and **Don't use this server**.
- **Don't use this server:** a per-machine ignore, `tool-servers.json` in the local folder. That server is never started, listed or
  offered on this machine, and the host doesn't connect it. Its row says so, with **Use this server again**.
- These are immediate page actions under `settingsActions["tool-server:<name>"]`, the same in New and Classic.

**The top of the page.** A failure no longer sets Health. Each check, `serverBanners` (`server-needs.ts`) raises `catalog:<name>`
only while an open item needs the server: a change not yet made that calls one of its tools, or, for `ado`, an item about a PR. It
names those items and points to Retry in Settings › Tools. Any other `catalog:` banner, including 0.2.26's, is cleared.

**Proof** (fictional root, stub model (quota), the AI host on). Servers: one whose program doesn't exist, and one that exits with
"401 Unauthorized"; Health started with 0.2.26's banner.
- **First check:** one try each, read as "the program 'acme-not-installed-xyz' isn't installed" and "it couldn't sign in". The old
  banner went, a reply was drafted, and the top of the page stayed empty in New and Classic.
- **Retries:** at +8 h the missing program was not tried, while the sign-in one was. After the CLI config file was edited, it was
  tried once.
- **Edge, Settings › Tools:**
  - New: both rows name the command, the file and the machine.
  - Don't use: the row says it isn't used, and a forced listing skipped it.
  - Classic: Retry, then Use again: both said "tries it again at the next check", and the next check tried both.
  - Screenshots at 1280 light and 400 dark.
- **Banner:** `ado` with a missing program and a PR review queued (A2) gave one top banner naming A2 in New and Classic. It went
  once A2 was done.

## Tool servers that can't be listed: back off, say why, list through the AI CLI (#23)

The owner's live log showed one `catalog-failed {server:"github", error:"Connection closed"}` per check: the retry window (10 min)
equalled the check interval.

**Backoff** (`catalog.ts`).
- A failure now records `fails` and `retryAt`: the next try is 1 h later, then every 6 h.
- The count resets when the server lists, or when its config changes (the spec key now includes a remote server's url).
- Setup's own listing (force) still tries at once.
- The last good list stays in use meanwhile, as before.

**A plain reason.**
- `McpClient` keeps the end of the server's stderr. A failure then reads, for example, "Connection closed; it said: acme: cannot
  reach the license server".
- A config that names an unset `${VAR}` reads "it needs ACME_TOKEN_X, which isn't set where Delegate runs".
- Settings › Tools shows the reason, "Drafts aren't given its tools" and when it tries again.
- With no AI host to ask, a remote (url-only) server, which Delegate's client can't open, gets "Delegate can't list X's tools
  itself: it's a remote server the AI CLI signs in to. Its tools aren't offered to drafts."

**Listing through the AI CLI** (#23c). A probe on a fictional home found that the CLI runtime under the AI host connects every
server in the CLI's own `mcp-config.json`, with its own sign-in for remote ones, even with `enableConfigDiscovery: false`, and
`session.rpc.mcp.listTools` returns their tools with schema and annotations.
- The host's new `/list` opens a short session that never reaches the model, waits for the named servers, lists them, and deletes
  the session.
- The catalog asks it for every remote server, and for any command server Delegate's own client can't start. Those catalogs are
  marked `via: 'cli'`.
- Their reads are offered to drafts, and both paths call them on the CLI's own connection: one process per run loads that config
  too, and the host doesn't warm-connect them.
- A command server the CLI can't start either keeps its own plain reason, with "the AI CLI couldn't start it either".

**The AI host** (#23d).
- Warm connect skips a server that is waiting for its retry time, connects it on first use once that time passes, and gives up
  on a listing after 30 s, so a hung server never holds a run.
- **Revised from #19b:** a server the host can't start is no longer a host fault. `/call` answers "not here", so the change uses
  Delegate's own client, with no strike: a broken server must not set the host aside for every reply.

**Found on the way** (#19).
- Parallel first runs could each start a host. `ensureHost` is now single-flight in a process.
- On the host, a server that is both in the CLI's config and proxied runs on the CLI's own connection, which takes priority over
  a same-named proxy. It raised no permission request, so replies still read.

**Proof** (fictional root, stub model (quota); servers: one needing an unset `${ACME_TOKEN_X}`, one that exits with a stderr line,
and a loopback remote server):
- **First check:** each broken server was tried once, and the host logged one `host-server-failed` each before the catalog knew
  about them. The remote server was listed via the CLI (2 tools; `get_ticket` read offered, `close_ticket` not).
- **Runs:** the reply read the remote ticket on the host, and on one process per run.
- **Next two checks:** no tries and no server events; drafts unaffected.
- **Clock:** +61 min retried once (then a 6 h step); +2 h nothing; +7 h 05 min retried once.
- **Config:** changing the args started again at the first step; a working server cleared the count and Health.
- **/call** to a server the host can't start: the change used the caller's own client twice, with 0 strikes.
- **Single-flight:** three parallel `ensureHost` calls gave one pid and one `host-started`.
- **Cleanup:** no listing sessions were left behind.
- **Edge:** Settings › Tools lines in New and Classic at 1280 light and 400 dark, including the remote line with `agent.host`
  false.

## Resident AI host: a host that can't run sets itself aside (#19b)

The host loads the SDK from the owner's CLI package, which can change on a CLI update. Before this, a host that answered pings but
couldn't open sessions failed every reply, and the next check sent it to the same host again.

**What counts as a host fault.** Faults are counted only when the run, or the change, never got through the host:
- **/run:** the session could not be created or resumed, or `sendAndWait` threw before the session log showed an
  `assistant.turn_start` or `tool.execution_start` for this run. The host answers 502 `{hostFault}`.
- **/call:** the tool server could not start or list its tools on the host, so the call was never made. The host answers 502
  `{hostFault: 'server'}`. A call that may have been made stays `lost`, as before.
- **Not a fault:** a model or tool error after the turn began. It stays the run's own failure (200, exit code 1).

**What the client does** (`client.ts`):
- **On a fault:** it logs `host-fault` and counts a strike in `host-start.json`. Then it makes **the same run** on one process at
  once (`runAgent`; dispatch's session restore and backup wrap both), or the same change on its own client.
- **On reaching the limit:** `hostFaultLimit(cfg)` faults in a row (`agent.hostFaults`, default 2, set in one place) drain the
  host, log `host-disabled`, and set `disabledUntil` from the existing BACKOFF (5 s, 30 s, then 2 min per disable since the last
  good run). `ensureHost` returns nothing until then, so every run uses one process.
- **On success:** a good run or call resets the strikes and the disables.
- **In Settings:** the System "AI host" row shows "Not used: the AI host failed twice; using one process per run until <time>".

**Proof** (fictional root, stub model (quota)). A stub SDK package (DELEGATE_COPILOT_PKG) wraps the CLI's SDK and breaks it on
demand.
- **createSession throws:**
  - Each run is drafted on spawn in the same check.
  - The 2nd fault drains the host, and inside the window no host starts.
  - After the 5 s window the host is tried again. Two more faults set it aside for 30 s, and a reply inside that window goes out
    on one process.
  - Once healthy, the host runs again and the counts reset.
- **Fault after resume opened:** the same item and session are drafted on spawn. events.jsonl goes from 1 to 2 user messages,
  every line parses, and the backup matches.
- **The stub model returns 400:** exit 1 twice, no strike, and the same host is kept.
- **/call to a server that can't start:** the call falls back to its own client twice, and then the host is disabled.
- **Settings row in Edge:** checked in New and Classic, and at 400 dark.

## Resident AI host, step 7: two machines, and the host on the page (#19)

**Two machines.** The tick already stands down on a machine that isn't the runner before it reaches any host code, so only the
runner starts a host. Every 5 minutes the host now drains and exits ("another machine reads the chats") when either:
- the config names another runner (the owner's "move Delegate here", effective at once); or
- another machine holds the lease.

**On the page.** Settings › System (under More, in New and Classic) has an "AI host" row, read from `host.json` and the pid,
without asking the host anything. It says:
- "On for 1 h 15 min (Copilot CLI 1.0.103)…";
- "Not running: it starts with the next AI run";
- or "Off: <why>, so each AI run starts its own process" (`hostOff`: turned off in config, a custom AI command, Claude, or no CLI
  SDK found).

Proof (two fictional machines with their own `DELEGATE_LOCAL` and `COPILOT_HOME`, one root; each tick in its own process; stub
model (quota)):
- The runner pc-a's tick drafted on a host it started; standby pc-b's tick was skipped ("the runner is pc-a") and wrote no
  `host.json`.
- After the owner moved Delegate to pc-b, pc-a's tick was skipped, and pc-b's tick drafted on its own new host.
- pc-a's host stopped at its 5-minute check (300 s), logged `host-stopped: another machine reads the chats`; pc-b's host kept
  running.
- In Edge, the Settings row showed the not-running, on, and off states in New and Classic.

**Not built on the host yet:** job runs (reviews, change runs, trackers) still start one detached process each. Moving them needs
detached host sessions that `checkJobs` can watch like pids.

## Resident AI host, step 6: approved changes on the warm connection, memory, quiet hours (#19)

**Direct changes (#7(E)) on the host.** `executeDirect` now gets `hostCaller(store, cfg)` from the tick. The call goes to the
host's `/call` endpoint, which checks the arguments against the warm connection's cached schema and makes the call there, with no
`listTools` or cold start per call. The fallbacks:
- **The host never took the call** (none, refused connection, or not connected to that server): it falls back to `mcpCaller`, a
  client per call, as before.
- **The host took the call and then went away:** that is a `LostResponse` ("may or may not have been done"), never tried again.
- **The server says it has no such tool:** the catalog is marked stale, as `mcpCaller` does.

**Quiet hours.** The host stops at its next 30-second check once quiet hours begin with nothing running, as it already did after 20
minutes idle. The first tick with work starts it again.

Proof (fictional Temp roots, real tick and `executeDirect`, stub PR reader, stub ADO-like server that waits 25 s before
`initialize`, stub model (quota)):
- **Approving a review with a comment, a vote and a reply:**
  - with the host off, a client per call: ok → done in 51.1 s (`job-direct` 2 in 50.9 s);
  - on the warm host: ok → done in 0.2 s (`job-direct` 2 in 0.1 s);
  - both made the thread comment and the vote once, sent the reply once, and used no AI run.
- **Memory (the host and every process under it):** 365 MB idle in 5 processes (host, CLI runtime, ADO stub), and 461 MB while 3
  runs drafted at once. Real tool servers will add their own size.
- **Quiet hours** set to start now: `host-stopped: quiet hours` after 25 s. Once they ended, the first tick with work started the
  host once.

## Resident AI host, step 5: health and falling back (#19)

- **A tool server that exits:** `McpClient` drops its connection on close (`onclose`), so the next call starts the server again. A
  call in flight returns a tool failure to the model, and the run continues or reports why it could not finish.
- **A host that goes away mid-run:** the run returns "Could not start: the AI host stopped during the run", which goes through the
  existing start-failure path ("Trying again on the next check", up to 3 tries). The next `ensureHost` starts a new host.
  Logged `host-lost`.
- **A host whose process is alive but does not answer** is stopped before a new one starts, so two hosts never share runs.
- A changed config hash (model, command, servers, CLI or Delegate version) drains the old host, which finishes its runs and exits,
  and starts a new one, as step 1 built. `agent.host: false` keeps one process per run.

Proof (fictional Temp root, real tick and dispatch, stub model (quota), fictional `globex-tracker` stub server):
- **Tracker killed mid-call:** the stub tracker was killed 1 s into a slow `get_thing`. The run ended "Not finished: the
  globex-tracker tool server stopped" with the connection error in what it tried.
- **Next run:** it drafted in 1.8 s on the same host, through a new tracker process.
- **Host killed mid-run:** the item showed "Trying again on the next check". At the next check a new host started and the run
  drafted.
- **`agent.model` changed:** the old host was drained (`host-replaced: config changed`, `host-stopped: drained`) and the run drafted
  on the new host.
- **`agent.host: false`:** the run drafted on the spawn path, and the host's run count did not move.

## Resident AI host, steps 3-4: runs side by side, and kept apart (#19)

No code change was needed: dispatch's pool already caps reply runs at `maxParallel`, and the host takes concurrent runs up to
`maxParallel + jobs.parallel`. Each run has its own session, with memory, custom instructions and config discovery off, and the
proxies share only the warm tool connection.

Proof (fictional Temp root, real tick and dispatch on the host, stub model (quota) whose every turn waits 1 s and whose draft names
every `CANARY-*` it can see in its request):
- **Concurrency:** four asks in four chats in one check.
  - Three runs overlapped (0.2-3.4, 0.2-3.6 and 0.2-3.7 s). The fourth started at 3.5 s, when a slot freed, and ended at 6.8 s.
  - The whole check took 6.9 s.
- **Isolation, one after another:** A's ask carried `CANARY-ACME-7`, and A's draft named it. B then asked for any canary it had
  seen and drafted "none"; B's session log has no `CANARY-ACME-7`.
- **Isolation, in parallel:** the same result.

## Resident AI host, step 2: Delegate's worker tools in-process (#19)

The two worker tools left after #21, `submit_report` and `image_read`, are now plain functions in `src/worker/tools.ts`
(`reportTaker`, `readImage`), one implementation for both callers:
- The per-run worker MCP server (`mcp/server.ts`) wraps them as before.
- The host defines them as in-process tools, bound to the run's workflow and run id. `submit_report` is checked against the
  report's own zod schema (`REPORT`), and the model sees it as JSON Schema.

So a host run starts no worker server process. A run that asks for any other worker tool (a change run's `make_change`) still gets
the per-run server for it.

The design's "a reply run is not offered `acme-chat-List*`" is superseded by #21 (owner-approved). Reply runs now get the chat
server's reads, and provenance comes from the session log.

Proof (same fictional root and stubs as step 1, stub model (quota); at every stub-model turn the proof counts this tree's
`cli.ts mcp` processes):
- The spawn path showed 1 at each of its 3 turns; the host runs showed 0 at all 9.
- Each host run called `globex-tracker-get_thing` and the in-process `delegate_worker-submit_report`, and drafted.
- Warm starts dropped to 1.3 s and 1.1 s (from 2.1 s and 2.0 s), since there is no worker server to start.

## Resident AI host, step 1: one runtime, tool servers connected once (#19)

Design: reviews/advisers/engineer-resident-ai-host.md.

**Assumption checks ([A]s) settled first:**
- The owner's CLI (1.0.103) works as the SDK runtime.
- A custom tool named with `-` is accepted and called.
- Sessions write `COPILOT_HOME/session-state/<id>/events.jsonl`.

**Deviation from the design.** The host does not add `@github/copilot-sdk` to `package.json`. It loads the SDK the owner's
installed CLI ships (`<pkg>/copilot-sdk/index.js`; `host/locate.ts cliPackage`), so the SDK and the runtime always speak the same
protocol. The npm SDK also carries native optional packages that the esbuild bundle can't hold.

**The runtime.** It is started as `node <pkg>/index.js`, because the VS Code `copilot` shim can't find the CLI when `COPILOT_HOME`
is redirected. Only the plain `copilot` command is hosted. A workplace wrapper, the Claude flavor, `agent.host: false`, or a CLI
with no SDK keep one process per run (`hostOff`).

**`delegate host`** (`host/host.ts`) is a detached process the tick starts through `ensureHost` (`host/client.ts`).
- **State file:** `LOCAL_DIR/host.json` with pid, loopback port, token, the CLI version, and a config hash (command, model, tool
  servers, CLI and Delegate versions).
- **Warm servers:** it connects each of the owner's tool servers once and lists their tools.
- **Per run:**
  - it offers each tool the run may use as an in-process proxy, with the server's own schema, calling the warm connection;
  - it creates the item's session, or resumes it when its log exists;
  - it sends the prompt, then disconnects, so the next resume reads from disk and #16's restore and backup (done by `dispatch`
    around the run) stay correct;
  - only reads under the run's folders and its offered tools are approved;
  - `enableConfigDiscovery`, custom instructions and memory are off.
- **Delegate's own worker tools** still come from the per-run worker server as a session MCP server; step 2 moves them in-process.
- **Model provider:** the owner's `COPILOT_PROVIDER_*` settings are passed to each session as its provider, since an SDK session,
  unlike the CLI, does not read them.
- **Leaving:** it exits after 20 minutes idle, on drain, or when another machine holds the runner lease.

**Starting and falling back.**
- `ensureHost` reuses a live host with the same config hash. On a mismatch it drains the old host and starts a new one.
- It waits up to 15 s for a new host, with a backoff of 5 s, 30 s and 2 min after failures.
- `hostRunner` sends reply runs to the host and falls back to `runAgent` when there is no host, or it is draining or busy. A host
  that goes away mid-run gives a failed run, retried as today.
- Jobs still start one process each.

Proof (fictional Temp root, real tick and dispatch, stub model (quota) on loopback through `COPILOT_PROVIDER_*`, stub tool servers
`acme-chat` and `globex-tracker` that wait 25 s before answering `initialize`):
- **Spawn path:** one draft started in 27.5 s and took 30.3 s in total.
- **Host:** it started once (0.9 s), and each server was ready once (25.4 s).
- **Runs 1-3 on the host:**
  - run 1 waited for the cold servers (start 27.5 s);
  - runs 2 and 3 started in 2.1 s and 1.9 s and took 3.2 s and 3.0 s in total, so p50 start is 2.1 s;
  - each called `globex-tracker-get_thing` through a proxy and `delegate_worker-submit_report`, and drafted;
  - each session's `events.jsonl` was written and backed up to `<root>/sessions/<id>`.

## readsOf checked against real Copilot session logs (#21b)

The reply provenance from #21 was proven on stub-written events, so `readsOf` was run read-only over the 139 real CLI 1.0.x
session logs in the owner copy (counts only; nothing from them was kept).

The event shape matched: `mcpServerName: "teams"`, `mcpToolName`, `arguments.chatId`, and string `result.content`. One case did
not. A large result is replaced by "Output too large to read at once (N KB). Saved to: <path>" plus a preview, and the old parser
called every such result unknown. That would have held 25 of 139 logs. Fixes in `provenance.ts`:
- A Teams read whose arguments name its chat (`chatId`, or team and channel) is known from them, whatever its result.
- A saved result is read from its file. Only a search whose file is gone, or which has no result or never finished, is unknown.
- Chat ids are matched percent-encoded and JSON-escaped, without decoding the whole text.
- Each Teams call records how its chats were known, or why they could not be (`ReadCall`). A held reply logs `reads-unknown` with
  the reasons.

Results on the real logs:
- 553 Teams read calls; 513 parsed (92.8%); 509 with chat ids. 471 were known from their arguments, 42 from results.
- All 40 unknowns are searches whose saved file is gone from this machine (temp files from the owner's runs). At run time the file
  is still there.
- The 4 parsed searches with no chat ids are empty results.
- 6 knowledge card reads were mapped. These logs predate #21, so knowledge was mostly read through the old wrapper.

`src/runner/provenance.fixtures.json` holds fictional events in the observed shape: a saved `ListChatMessages` known from its
arguments, a `GetChatMessage`, a search with hits, a search read from its saved file, a search whose file is gone, an empty
search, and a failed call. `readsOf` gave chats A, B, C, D with exactly one unknown ("saved file gone"), as the fixture expects.
The #21 proof (steps 1-3) still holds.

## Off the record moves a chat's facts out of the cards runs read (#21 step 4, §2 accepted)

Runs now read the knowledge files directly, so Delegate can't filter what they see. Marking a chat off the record therefore moves
its learned facts out of the owner's cards into `knowledge-offrecord/<chat>.json` in the storage folder, which no run is given
(`offrecord.ts`, `FilesKnowledge.moveOut`/`moveBack`). Each line is kept with its position. Leaving 'off' (normal again, from the
chat command or the Settings "Mark normal again", or switching to private) puts the lines back where they stood.

What doesn't move:
- A fact that carries the owner's own "remember" source.
- Team cards: they are shared with teammates. A run that reads one is still held by need to know, through the card's source chats.

A run that read the chat with Teams' own tools is held as off the record (`markedHold`). Learning from it was already dropped. The
Settings confirm now says the set-aside facts come back.

Proof (fictional Temp root):
- **Mark off:** chat B's learned decision left the cards and was kept in `knowledge-offrecord/`, which is not in the run's
  folders. The owner's corrected B fact stayed.
- **Hold:** a run whose log shows it read B was held "which you marked off the record".
- **Unmark from Settings in Edge (New):** the confirm said "Facts set aside from it come back to your knowledge"; both card files
  were byte-identical to before.
- **Unmark from the chat command:** off, then normal, gave byte-identical cards again (`offrecord-moved:1`,
  `offrecord-restored:1`).

## Use the tools that are already there: no wrapper worker tools (#21, steps 1-3)

Design: reviews/advisers/engineer-native-tools.md.
- **What a run read.** New `src/runner/provenance.ts` `readsOf(slice, k, dirs)` reads the run's slice of Copilot's session log
  (`tool.execution_start`/`_complete`). It collects:
  - chats named in a Teams read's arguments, and every chat id or message link in its result;
  - for a built-in `view`/`grep`/`glob` touching the knowledge folders, every chat behind each card file it read;
  - searches (tool, query, hit count; never result text).
- **Unknown reads hold.** A Teams result that can't be parsed (saved to a file, truncated), a Teams call that never finished, or
  an empty log gives `unknown`. A drafted reply is then held: "It searched your chats and I couldn't tell which ones it read".
- **Wiring.** `dispatch.ts runReads` replaces `takeRead` for reply runs. The ask and promise runs no longer clean up provenance
  files, since none are written.
- **Teams reads for replies.** A Copilot reply run now gets Teams' own read tools (`workerTools` drops `UNTRACKED` for Copilot). A
  Claude run has no Copilot log, so it keeps the filter.
- **Wrappers removed.** `knowledge_search`, `knowledge_read`, `history_search` and `doc_read` leave the workers. The worker MCP
  serves `submit_report` (and `make_change` in change runs) plus `image_read`. That is the §4 fallback, because the CLI's `view`
  returning images to the model could not be checked with the quota out. The owner's own AI chat keeps every tool.
- **Prompts.** `knowledgeLine` (in the reply, ask and job prompts) says where the cards are, their line format, to find with
  `grep` and read with `view`, and how to cite. reply, job, ask, learn and bootstrap now name `grep`/`view`, the chat server's own
  search and the document server's own read tool.

Proof (fictional Temp root, real tick, stub worker (quota) that writes the session-log events a run writes, fictional `teams`
stub server):
- **readsOf:** a fixture with GetChatMessage (B), a search naming C and D, and a grep of the card whose source is chat E gave chats
  B, C, D, E and both searches. A truncated result, and an empty log, each gave `unknown`.
- **Run setup:** the reply run's `--available-tools` had `teams-ListChats` and `teams-SearchTeamsMessages`, with only
  `submit_report` and `image_read` from Delegate. Its prompt carried the knowledge line and none of the old tool names.
- **Auto-send rule for Kim in room A (Sam is in A but not in chat B):**
  - reading B was held ("Uses something from Acme leads, and Sam is not in it"), and the owner's ok then sent it once;
  - reading only A plus a card from E (everyone in A is in E) was sent by the rule;
  - with E marked private, it was held "which you marked private";
  - with B off the record, it was held "which you marked off the record".
- **Sources:** the cited card shows as a Knowledge source linking to E on the page's item.

## A review ask split over two messages is one ask (#22)

`review-gate.ts` `reviewAsked`: a room ask counted only when one message held both the ask and the PR. The owner's A178 shape
("please review", then the PR link in its own message) was refused as "nobody asked you". Now, in a room, a pending message with
the PR's link counts when the same person asked for a review in the item's thread within 15 minutes, in either order. A link
alone, or an ask by one person and a link by another, is still refused. Stored messages have no reply-to id, so a reply to the ask
counts only through the same-person window.

Proof (fictional root, real tick, stub worker (quota), stub PR reader, fictional ado stub):
- **Split ask, same person:** Priya's "please review", one check, then her separate PR link message. That item passed the gate,
  the review job read the file via `ado-repo_file`, and the card showed "Reviewed it. One point: …" in New and Classic.
- **Link alone:** Sam's link alone was refused ("nobody asked you"), and closed quietly as before.
- **Different people:** Kim's ask plus Sam's link were both refused.

## Newer facts replace older ones in Knowledge (#20)

Design: reviews/advisers/engineer-knowledge-supersede.md.
- A `Claim` may carry `replaces` (citations as `knowledge_search` prints them). `propose()` (`supersedes`) applies one target
  as an in-place update only when all five gates hold:
  - G1: the entry exists;
  - G2: the claim's source is no older;
  - G3: a team entry is never overwritten by a private claim (`Knowledge.homeOf`);
  - G4: one target per claim;
  - G5: not from an off-record chat unless the owner said it.
- A refused ref is logged `supersede-refused` with its reason, and the claim goes on as before (usually an add).
- The update keeps the entry's id, type and card. Its sources are the new ones only. `Op.was` holds the replaced text, and Undo
  restores it through `applied.prev`. Logged `knowledge-superseded`.
- The stale re-propose path carries `replaces`. Withdrawing the source message undoes the replacement first
  (`undoSuperseding`), so the old fact comes back instead of both being lost.
- An update now writes where its entry lives (`homeOf`). Before, a topic present in both layers sent it to the other card, where it
  was stale on every apply and re-proposed each tick.
- Search breaks equal scores by the newest source date, after not-expired, in both the file and the layered search.
- `learn.md` and `bootstrap.md` say when to use `replaces`.
- Done › Learned reads `Replaced: "old" → "new"`. `renderProposal` says `replaces "old" with`. To learn shows "Replaces: …" under
  the fact in New and Classic.

Proof (fictional Temp root, real knowledge files, stub worker (quota) returning fixed claims):
- **Scenario 1:** one entry saying Monday, with the new source only, the Done gist, and Undo bringing Friday back.
- **Scenario 2:** an older history claim was refused (`older`) and added separately; Monday ranks first.
- **Scenario 3:** a wrong target was applied (the known residual risk), shown in Done, and undone.
- **Scenario 4:** a 1:1 claim against a team entry was refused (`private over team`) and added privately.
- **Scenario 5:** withdrawing the Monday message brought Friday back with its own source.
- **Scenario 6:** a stale card gave a fresh K that is still an update with `was`.
- **Scenario 7:** with `reviewLearning` on, the K waited and showed "replaces"; skip left Friday.
- **Scenario 8:** the same source updated in place, the same text only merged sources, and `remember` saved as before.
- **Search:** equal scores came newest first; an unrelated query kept its old order.
- **Real learn job:** through the tick, the prompt carried the rule, and the stub worker's `replaces` was applied with the sent
  message as the only source.
- **Display:** Done › Learned and To learn in New and Classic, 1280 light and 400 dark, with no overflow.

## Generic read tools, step 6: a review that can't read a file (#17)

**Prompt.** `job.md` now tells review workers: when the PR's change list leaves out a file's content (too large, binary or
generated), read the file at the PR's head commit with the repository's file-read tool, such as `repo_file`, before deciding it
can't be reviewed. When nothing can read it, the blocker names the file and its size.

**Blocked card (queue #17 b).** A job that runs out of routes with no question and no reply now becomes a failed run, like #11's
card (`runFailed` gains `tried` and `job`):
- The status is one line, `Couldn't finish: <why>`, never the whole blocker.
- The card says "Couldn't finish the review of PR N at <time>: <why>." with:
  - **Review it yourself**, which opens the PR (`PrRef.url`);
  - a "What it tried (n)" fold;
  - when read tools are off, "Some read tools are off …" with **Allow all read tools** (the Settings save) and a link to Settings.
- Actions: **Try again** is primary, then Later and Skip. A review offers no "Write the reply yourself" and no answer box.
- Try again queues the job again, with its tries reset and a fresh session. It logs `run-retried` with the job.

Proof (fictional Temp roots, real `migrate()` and tick, stub PR reader, fictional `ado` stub server whose `get_changes` omits a
1.2 MB threat model and whose `repo_file` returns it). The stub worker (quota) calls the server only through the tools in its
`--available-tools`, built by the real `buildArgs`.
- **Old defaults, migrated:** the job was offered `ado-repo_file` and read `/models/invite-register.tm7` at c0ffee1 (the server
  log and the session log both show `ado-repo_file`). The review finished with "Reviewed it. One point: …".
- **Hand-trimmed list:** the job was not offered `repo_file` and stopped after 2 runs with the blocked card, the same in New and
  Classic at 1280 light and 400 dark: the reason line, the PR link, What it tried (4), Allow all read tools, Try again and Later,
  with Skip under ⋯ and no answer box. Allow all read tools cleared `deny`. Try again re-queued the job, which read the file, and
  the card showed the finished review.

## Generic read tools, step 5: Settings › Tools your drafts may read (#17)

A new block under "You and your replies", after "Changes Delegate may propose", in both New and Classic. It is the shared
`features/ToolsSettings.tsx`; each experience passes its own switch row and class names (design §5).

What it shows, from each server's catalog (`settings.ts` `toolSpecs` and `toolsView`):
- Each server is folded to one line, such as "ado: 10 of 12 read tools on · 1 not placed". Opened, it has a switch per read;
  off adds it to `agent.deny`.
- Each tool it can't place shows its description and reason, with **Allow as read**. Allowing first asks inline: "Drafts will be
  able to call it without asking you." Allow adds it to `allowRead`, and the row becomes a switch. A tool that has become a write
  since the page was drawn is refused at save.
- A deny or allow entry the server no longer offers shows as "Not offered by ado now: …".
- A server that can't be listed shows a plain line (the MCP error code is stripped).
- When the list is trimmed or anything is off, **Allow all read tools** clears `deny` and `toolsTrimmed`.

Tool rows carry a `group` (the server) in the Settings contract, so they stay out of the "Changes" switches. The old fixed row
"Tools drafts may read" shows only before the migration.

Proof (Edge, fictional Temp root, stub worker (quota)):
- **Servers:** fictional acme-stub, ado, teams, and a down globex-docs.
- **New:** Allow as read on frob went through Cancel (nothing saved), then Allow. The config got `allowRead`, the next run's tools
  included frob, and the row turned into a switch whose help says it was allowed.
- **Switch round trip:** list_things off removed it from the run's tools; on restored it.
- **Classic:** Allow all read tools gave `deny []`, put ado wiki back in the run's tools, and the button went away.
- **Both:** the down server's line showed, ado showed "Not offered by ado now: old_tool", and dark at 400 px had no horizontal
  overflow.

## Generic read tools, step 4: the tools migration (#17)

The data schema is now 2. `admin.ts migrate` (1 → 2) backs up `config.json` as `config.backup-<date>.json` in the root, runs
`tools-migrate.ts` `migrateTools` and logs `tools-migrated` (design §3). An old `agent.tools` allow list is converted:
- Built-ins (no server prefix) stay in `tools`.
- **All defaults present:** for each server whose old setup defaults (`OLD_READ_DEFAULTS` plus `site().read`, now data only) are
  all in the list, the server gets every read. Tools the owner added go to `allowRead`.
- **Hand-trimmed:** a server with a default missing keeps the owner's choice as `deny` (that server's catalog reads not in his
  list), and the config gets `toolsTrimmed`.
- **Not listed yet:** a trimmed server never listed on this machine goes to `pendingTrim`, with the old list in `trimmedFrom`.
  Workers keep that server's old part, never all its reads. The tick settles it after the first listing (`finishTrim`, logged
  `tools-migrated` `why: deferred`).

The setup tools step now writes the new shape: built-ins plus `deny: []`. A list passed to the step, or an old one, is converted
the same way. The step then lists the servers and says "N read tools from <servers>; M more it can't place wait for you in
Settings". `READ_DEFAULTS` is gone from `setup.ts`. The Settings change switch and the "Tools drafts may read" row use
`workerTools`.

Proof (fictional Temp roots, real `migrate()` and tick, fictional `ado` and `teams` stub servers; stub worker (quota)):
- **A** (old defaults plus `ado-repo_file`): `deny []`, `allowRead [ado-repo_file]`, a backup file, `tools-migrated
  all-reads`, and jobs get all 12 ado reads. A second migrate said "Data is up to date."
- **B** (no wiki tools, ado listed): deny holds repo_file, repo_branch, repo_repository, repo_search_commits, search_wiki and
  wiki; `toolsTrimmed`; jobs get the 6 he kept.
- **C** (same list, ado down): `pendingTrim [ado]` and the old 6 kept. A tick with ado still down changed nothing; a tick with ado
  up wrote the same deny as B and logged `deferred`.
- **D** (fresh setup tools step): built-ins, `deny []`, "14 read tools from ado, teams; 1 more it can't place …".

## Generic read tools, step 3: runs get every read tool (#17)

`catalog.ts` `workerTools(cfg, kind)` builds a run's read tools (design §2). It is used for reply runs (`dispatch` `runOne`,
`promise`), what-next runs (`runAsk`) and jobs (`startJobs`, including execute jobs). `buildArgs` passes the list through
unchanged. A run's tools are:
- the owner's built-ins (`agent.tools`);
- plus every **read** in the cached catalogs;
- plus `agent.allowRead`;
- minus `agent.deny` (`<server>-<tool>` or `<server>-*`);
- minus `UNTRACKED` Teams reads for reply runs.

A config with no `deny` (not migrated yet) keeps its old list exactly. While a server is in `pendingTrim`, it keeps only its part
of the old list (`trimmedFrom`), never all its reads. `refuseStart` and the jobs and promise checks now run `unsafeRead` on that
list, with each tool's own listing from the catalog. New optional config fields: `deny`, `allowRead`, `toolsTrimmed`,
`pendingTrim`, `trimmedFrom`.

Proof (fictional Temp roots, real tick, stub worker (quota), fictional `acme-stub` and `teams` servers, args from the real
`buildArgs`):
- **Migrated** (`deny: []`):
  - The reply run got get_thing, list_things and repo_blob, and no teams reads.
  - The review job also got teams-ListChats and SearchTeamsMessages.
  - Neither run got thing_write, send_note, delete_all, frob or SendMessageToChat.
- **Legacy:** each run got exactly the old list.
- **Deny** get_thing and `teams-*`, with `allowRead` frob: get_thing and every teams tool were gone, and frob was added.
- **`allowRead` thing_write:** the run was refused ("never a read tool") before it started.

## Generic read tools, step 2: each server's tool catalog (#17)

`src/runner/catalog.ts` lists each of the owner's tool servers that this machine can start (not Delegate's own servers, and not
remote servers). It classifies every tool and caches the result in `LOCAL_DIR/catalog/<server>.json`, never in the synced root
(design §2). The cache holds `serverInfo` name@version, a hash of the tool names, annotations and schemas, and a hash of the
server's command and args.

The tick lists servers while the chats are read and waits for the listing before `dispatch`. Under `NODE_TEST_CONTEXT` it lists
nothing. A server is listed again when:
- its cache is a day old;
- its command or args changed;
- it sent `notifications/tools/list_changed`;
- a change called a tool it says it lacks ("has no tool" marks the cache stale).

A failed listing keeps the last good list and waits 10 minutes before trying again. Health `catalog:<server>` then says "Couldn't
list X's tools since <first failure>; using the list from <time>". A server never listed contributes no reads.

The lost-session retry in `mcp-client.ts` no longer uses the `ADO_READS` list. It retries only a tool the classifier calls read,
using the server's own listing. A tool annotated read-only is retried only when it is also annotated `idempotentHint`.

Proof (fictional Temp root, real tick, stub worker (quota), fictional `acme-stub` server):
- The first tick cached get_thing, list_things and repo_blob as read; thing_write, send_note and delete_all (falsely annotated
  read-only) as write; frob as unknown.
- A second tick did not list again.
- With the server down and the cache stale, the list was kept, Health named both times, and the next tick did not retry.
- Version 2.0.0 (new args) was listed again, added search_things and cleared Health.
- A call to a missing tool marked the cache stale.
- The retry rule allowed only list_things and repo_blob.

## Generic read tools, step 1: one classifier for any MCP tool (#17)

`src/core/tool-class.ts` `classifyTool(server, tool)` says whether any tool reads or changes things, with no server names in it
(design: reviews/advisers/engineer-generic-read-tools.md §1). Annotations decide first (`readOnlyHint: false` or
`destructiveHint` is a write); then any write evidence wins (a name ending in `write`, `run_pipeline`, a write verb as the first
word, or as the second after a one-word namespace when the tool has no action enum, or any write action in its enum); then a read
annotation, a read verb, or an action enum whose every value reads makes a read; anything else is unknown, never a read. A
description that says it sends, creates, deletes, posts, approves, modifies or updates only demotes a read to unknown. `unsafeRead`
now asks the classifier, so the backstop and the classifier never disagree. The old hard-coded lists live as test data in
`src/core/tool-class.fixtures.json` (54 tools, with the action enums the servers list). Proof (script, no server): 0 mismatches;
the design's stub tools came out as specified (`get_thing`, `list_things`, `repo_blob` read; `thing_write`, `send_note` and
`delete_all`, which is annotated read-only, write; `frob` unknown); `wit_query` is unknown (its "wiql" action names no verb) and
will be offered under Allow as read; the existing `unsafeRead` expectations in tick.test.ts all still hold.

## A person answering the owner is a Catch up line, never silent noise (queue-new #18)

The reply prompt (`reply.md`) says a person writing to the owner in a 1:1, or answering his own message, is never noise: with no
reply needed it still gets an `fyi`. As a backstop, a run that closes such an item with nothing (`intent: none`, no reply, no
`fyi`) gives it one (`answersOwner`: any 1:1 message from a person, or a group message right after the owner's own within a day;
senders named like bots are left out): "Kim replied · no reply needed" with their words as the gist, logged `fyi-kept`. Fictional
root, stub worker (quota) that always reports intent none with no reply or fyi: a 1:1 "thank you! sorry, wrong person" after the
owner's message and a group "got it, thanks Robin!" right after his message became Catch up rows in New and Classic Done; a release
bot's post and group chatter ("lunch anyone?") stayed silent.

## A session history that differs between machines resolves itself, quietly (queue-new #16)

When the synced copy of an item's AI history and a machine's own copy are not prefixes of each other, the machine holding the
runner lease (it runs the items) keeps the other copy once and makes its own history the shared copy, so later backups move
forward and no run writes another conflict file. Another machine keeps its copy once and notes it. Conflict copies are named by a
hash of their content (`events.conflict-<hash>.jsonl`), so the same history is never saved twice. The note is one plain line,
"Item A1's AI history differed between two machines; Delegate kept both and continues on <runner>", shown in Settings › Updates and
system › More, never as a banner; it clears when the runner resolves it, and each pass clears notes that no open item or job uses
(`pruneSessionNotes`). Fictional root, two fake machines (two Store machines, two COPILOT_HOMEs in Temp), stub worker (quota): the
other machine wrote one conflict copy over two runs and the note; the page had no banner and Settings showed the line; the runner's
backup made its history the shared copy, kept the other copy once and cleared the note; another run wrote no new conflict copy;
a seeded note for an unused session was pruned (`session-note-pruned`) while the open item's stayed; New and Classic Home showed no
banner.

## An item the owner answered in Teams shows his own reply, not Delegate's unsent draft (queue-new #15)

`card()` (view.ts) now checks how a done item closed: when the owner replied himself (`closedBy: replied`, not sent by Delegate),
the card carries `ownReply` (the owner's message that answered the ask, else his last one, with its time and Teams link) and
`unsent` (Delegate's draft). It drops the draft, the question, the choices, the share hold and warning facts, which were all
about a draft that never went. The card shows "You replied in Teams · <time>" with the owner's words, Reopen only under ⋯, and
"Delegate's draft (not sent)" in Details. Fictional root, stub worker (quota): with Classic's focus view open on an item that had
a draft and a share hold, the owner answered in Teams (a Teams reply to the ask); the card then showed "You replied in Teams ·
12:18 AM" with his words, no "Your reply to Kim", no draft, no answer box and no "Need to know" warning, and Details showed the
unsent draft. An item Delegate sent keeps its sent reply and gets no `ownReply`.

## A message on open work is news: no "No news" right after the owner replies (queue-new #13)

`ownerStep` now moves open work's `checkAt` to now plus 3 days, and `due` takes the newest activity (the last step, or the last
message in the item's or its parts' threads, from anyone) as news: within 3 days of it the check moves to that time plus 3 days
and does not fire. "No news … since" quotes that newest activity. Once per store, `repairNoNews` sends a "No news" question
that was asked after newer activity back to open work, checked again in 3 days (`repair-no-news`). Fictional root, stub worker
(quota), times moved by rewriting the stored times: with the check date 6 hours past, the owner's reply kept the item open with
the next check in 3 days; 4 days later with no messages exactly one "No news … since <reply day>" card appeared, and the next
check added none; an A39-shaped item went back to open on load, logged; New showed "Waiting on you · 0" and Classic "All clear".

## A PR review card shows code facts only: no builds, no votes, no warnings (queue-new #8)

The review prompt (`job.md`) now says: when reviewing someone else's PR, do not read or report builds, checks or CI, and do not
report the owner's own or his reviewer group's vote; another reviewer's blocking vote may go in `summary` as one plain line; only
the owner's own PR notes its newest build on a recheck. As a backstop, `finishWork` drops a review's context facts about builds,
pipelines, checks or CI and about votes (`reviewNoise`), and makes the rest `info`, so they never force must-see; a watch (a job
with `every`) or the owner's own PR keeps them. The card now shows info facts in a "Found on PR N · Author" block (they were not
shown before); warnings stay at the top. Fictional root, stub worker (quota), stub review job returning four warn facts (two code
findings, "Live votes and dependency", "Newest builds"): the item kept the two code facts as info, was not must-see, and the card
showed 0 warning lines and "Found on PR 4800001 · Alex Chen" with the two findings in New and Classic at 1280; a watch job kept
all four, including the build blocker, as warnings.

Read-time `normalizeReport` also removes legacy review facts labelled "Live vote(s)",
"Newest build(s)", or dependency followed by vote(s), and text saying "These are CI facts".
This stays within its review-only filter: Not reviewing gate facts and non-review/watch facts
keep their existing behavior. No state rewrite or new card branch is needed.

## bug 10-22 Classic Settings chips were reset to the page top

Classic's shell now follows the same screen/sub-route boundary as New. A
Settings section or key owns its own scroll and focus, including direct links;
the parent no longer schedules a later scroll-to-top over it. Other screen
changes still reset and focus main, and Ongoing section links keep their
existing section-scroll path.

Section and row targets use the rendered sticky section-index height and its
CSS top inset, plus a12px gap. This avoids the generic section80px scroll margin
overriding the Settings offset, and keeps headings and focused deep-link fields
below all chip rows when the index wraps on narrow screens. The existing
open-fold and preventScroll focus behavior is unchanged.

Edge fictional-root proof at1280light/400dark: all five chips selected and
placed their headings12px below the sticky index (about117px/181px from the
viewport top), without a second jump. pollIdle direct links and cold reloads
opened the advanced fold and focused the exact row at the same offset. Browser
Back/Forward retained section navigation. Home and plain Settings/Ongoing
screen changes returned to0, with main focused; Ongoing/running still scrolled
to its section. Zero config changes, setting/action submissions, overflow or
browser errors; no AI or owner data was used.

## A PR review leaves spec questions to the PR's author, and names its PR on the card (queue-new #10)

The review prompt (`job.md`) keeps `question` for what the owner alone decides (approve with a thread open, review at all) and
sends a product or spec choice to the PR's author as a proposed comment. As a backstop, `finishWork` turns a review report's
`question` that offers a choice between options and asks nothing of the owner (`specChoice`) into a proposed comment on that PR,
addressed to its author (`prAuthor`, saved at each PR read): "Alex, should grandfathering cover …". Items from a PR job carry
`prLabel` ("PR 4800001 · Alex Chen"), shown in "Delegate needs to know", in warning facts and in the changes heading. An ask about
a different PR than the open item's own opens its own item (`join-refused`, by intake). Fictional root, stub worker (quota), stub
review job and PR reader: the A48-shaped review question became "Ask Alex on PR 4800001: …", a change under "When you send", with
no "needs to know", in New and Classic at 1280; "Approve with the open thread … unresolved?" stayed the owner's question, headed
"Delegate needs to know · PR 4800011 · Alex Chen"; a second PR asked in the same 1:1 became its own item.

## A join needs a shared subject; parts never bring other PRs; related asks show their chat (queue-new #9)

`joinWhy` decides every join of an item into another's work: the same typed link (an item about a PR the home is not about never
joins), or the same chat and asker. The worker's `partOf` goes through it, and a home whose own ask names no link takes no worker
join; a refusal is logged as `join-refused` with the reason. `homeNamed` matches only the home's own links (its asks and its PR
job's key, `ownLinks`), never links its parts brought, and a message naming another PR as well does not join. A part's report
never adds a second PR to a home that has one. When a card's asks span several chats, the list says "N related asks" and each
line shows where it was asked ("1:1", "in Web check-in"). Once per store, `repairParts` detaches parts that share no subject with
their home, keeps their state, drops the links only they brought, and logs `part-detached` per part. Fictional root, stub worker
(quota) reporting `partOf`: an ask about another PR from another chat was refused ("it is about PR 4600099, and A1 is about PR
4600001") and a later mention of that PR elsewhere did not join; a home with no link of its own took no join; a same-PR ask from
a group joined and showed "2 related asks" with "1:1" and "in Web check-in" in New and Classic at 1280; an A48-shaped root (a 1:1
home with a PR job and 6 parts from 2 other chats) came out as the home alone with its own PR, 6 parts detached, nothing sent.

## A failed AI run is a reason on the card, never a question; setup failures wait and re-run (queue-new #11)

A run with no result sets `runFailed: { at, kind, why }` instead of the old "Check this item, then answer or skip it" question.
The card shows "Delegate couldn't draft this at 11:51 PM: the run stopped without a result." with Try again as the primary
(re-runs the item once), "Write the reply yourself" (opens a reply editor and sends the owner's words), Later, and Skip under ⋯;
no answer box. Sign-in and missing-CLI failures join model and quota as agent holds (`agentSetupFailure` kinds `auth` and
`cli`, tried again every 10 minutes), so a setup failure keeps the item in Working with the reason and re-runs it when the hold
clears. Once per store, `repairRunFailures` re-queues open items with the old question whose last logged worker error is a setup
failure (`repair-requeued`), and turns the others into a failed run with its reason. Fictional root, stub worker (quota): a
"model not available" failure kept the item in Working, then it ran once more after the model changed; repair re-queued exactly
the 7 setup-failed items of 9 (once only), left the content failure as a reason and the done item alone; the no-result card
showed the reason and time with Try again, which re-ran once and showed the new draft, and "Write the reply yourself" opened the
editor, in New and Classic at 1280 light and 400 dark.
## bug 10-22 Classic Focus queue clipped beside a short card

The desktop queue is a sticky viewport-height flex column: its heading does not
shrink, and the remaining list area owns scrolling with a zero minimum height.
The column clips overflow rather than letting off-screen queue rows enlarge
the document; only the inner list is a scroll container.
The Focus grid reserves the same minimum height independently of the card.
Only desktop Focus uses the matching 16px bottom inset; the old 96px page
padding would push the sticky column above its top boundary at document end.
Narrow layout is unchanged, including not mounting the queue at <=960px.

Before the fix, Edge1280x1400 with25 fictional asks placed the short-card queue
heading above the viewport and ended its list near794px at document bottom.
This is a layout boundary repair, not another virtualized-list implementation;
the shared ViewportList and its target/keyboard behavior are retained.

Verified in Edge with25 fictional asks, short and expanded long cards, and
document top/middle/bottom at1280x1400 and1280x800 light. The queue stays
at80px (81px at initial layout), its list ends16px above the viewport bottom,
and the last row is reachable through the inner scrollbar. All52 j/k and
left/right-arrow navigation steps kept the selected row in view. At400x860
dark the queue remains unmounted; both card shapes scroll as before, with
no horizontal overflow, browser errors or item submissions. No AI was run.

## A50: no vote the backstop would refuse, nothing half-made, groups the owner confirmed, and changes made without an AI run (queue-new #7)

(A) Each PR read re-gates a vote already on the card (`regateVotes` in `probePRs`): when the owner's role is outside
MAY_REVIEW, the vote leaves the card (item and job alike) for a to-do with the reason and is kept as `heldVotes`; it comes back
when a later read lets him vote. With role "none", Add me is offered. (B) Before a non-vote change in an approved batch,
`makeChange` reads every vote in it (`batchVoteBlocked`); if one cannot be cast, nothing else is made ("Not made: it was
approved together with …"). (C) `owner.reviewerGroups` / `owner.notReviewerGroups` (full "[Org]\Group" or short name) count in
`ownerRole`; Settings › You and your replies › "Your reviewer groups" edits them; a PR group in neither list is asked about once
on the card using the multi-select/typed-name contract above, and the answer is saved and the PR read again. (D) Each change made or refused
is a work step ("Made: … (ref)", "Not made: … (why)"), and a card whose approved batch partly ran shows "Done: … Not done: …"
above the actions. (E) An approved batch whose changes all carry their exact call is made in the same pass through
`makeChange` (`executeDirect`, run marked `direct`), with no AI run; a batch with any change lacking a call keeps the change run.
Fictional root, stub worker (quota), stub PR reader, stub tool-server caller: a vote proposed while the owner was a direct
reviewer left the card with the reason once only an unknown group reviewed the PR, and the card asked about that group (New
and Classic at 1280); ok then made nothing; "yes" saved the group and brought the vote back; ok made the comment and the vote
(69 and 85 ms after ok) and sent the reply within 0.2 s, with two "Made:" steps and no AI run; a PR with new commits before
the batch made nothing; a batch whose second comment failed at the server showed "Done: comment on PR … Not done: …, ADO
500 …" in New and Classic. Note for the test phase: tests that drive the change run through `procs.start` for fully specified
changes now take the direct path.

## A reply is checked against Azure DevOps only when it claims a vote; several PRs are each checked (queue-new #12)

Before #12, any reply with "approv" in it (or any reply to an approval ask) went through the owner-vote check, so a review that
withholds approval ("Not ready to approve. …") was held when the owner is a reviewer only through a group, and a review of three
PRs was held with "no unambiguous PR link". Now `approvalClaim` decides: the owner's own approval or vote (`claimedVote`), a named
reviewer's approval (`othersApproval`, #6), or nothing. Withholding, conditional and future words claim nothing and go with no PR
read; proposed votes keep their own checks before they are cast (#7). The PRs a claim is about (`claimedPrs`): numbers in the
claiming sentences, else every PR the ask named when the reply says "all three", "both" or "each", else the item's one PR; each is
placed by its own link (`prRefFor`: ask, thread, work links, the draft's and job's sources, a vote's call) and read on its own. A hold
names the PR: "the reply says PR N is approved, but your vote there is No vote", "does not say which PR it means; the ask names
PR A, PR B, PR C", or "no link to PR N was found to read it (found links for …)". Fictional root, stub worker (quota), stub PR
reader: a withholding review with the owner in a group only sent once with no PR read; "all three look ready for approval" on
three PRs sent once with no read; "I approved all three" with one vote at 0 was held naming that PR; with all three approved it
sent after three reads; "I approved it" on three PRs was held asking which; a PR with no link was held naming it; "Priya has
approved" kept #6 (sent at 10, redrafted at 0); "I will approve once the build is green" sent with no read.

## A57: a titled link keeps its URL, and a reply about others' approval is checked against their votes (queue-new #6)

`htmlToText` now keeps an anchor's http(s) address after its text when they differ ("Pull request 1741355: … (https://…/
pullrequest/1741355)"); a link whose text is its own address is unchanged, so every send-matching comparison (both sides go
through `htmlToText`) stays the same. `prOf` also takes the project and repo from a full link to the same PR number in the
draft's or the job reply's sources, for items stored before this. A reply whose every approval sentence reports someone
else's state ("X has approved", "approved by X", "… approval is still pending") no longer needs the owner's vote: the reviewer
named closest before "has approved" must have voted 5 or more, and "pending" needs an active PR not yet approved by all;
otherwise it is redrafted with the reason. Any first-person claim keeps the strict path. Fictional root, stub worker (quota),
stub PR probe: the A57 shape (ask stored without URL, draft sources with it, owner not a reviewer, Priya 10) sent once
after one PR read; the same ask as HTML stored the URL and sent once; Priya 0 redrafted ("their vote … is No vote");
"I approved it." held ("the owner reviewer vote is missing"); an ask naming two PRs held ("no unambiguous PR link").

## Latency (c): how often Teams is checked after activity is a setting, shown honestly

Settings › Updates and system › More has "After activity, check every" (`poll.fastMin`, 0.5 to 5 minutes in half-minute
steps, a comma accepted) and "Keep checking that often for" (`poll.fastForMin`, 1 to 30), next to "Check Teams every"; the
defaults are 15 idle (at least every 5 in work hours) and, after activity, every 1 minute for 10 minutes (owner, 22:30; was
5 minutes). Number fields use `inputMode="decimal"`. A gap under a minute keeps a tenth as slack
instead of 10 s, so 0.5 means about 27 s; a minute or more keeps 10 s. `status.reading.next` carries the schedule's next
check; New's status reads "Checked 10:35 PM · next check in 15 min" and Classic's "On · 0 runs today · next check in 15 min"
("within a minute" or "now" when close, never a seconds countdown, since the page refreshes about every 20 s). Measured on a
fictional root, stub worker (quota): with 0.5 and the resident runner, Teams reads came at 0, 27 and 55 s after activity
(with the default 1: 0 and 51 s); Check now while the runner was waiting read Teams 0.1 s later; in New and Classic at 1280
light and 400 dark, 0.3 was refused ("in steps of 0.5") and 0,5 and 10 saved.

## Latency (a): an approval is acted on in seconds, not on the next scheduler minute

The `tick` command now stays resident for up to `DELEGATE_RESIDENT_SEC` seconds (default 50; 0 turns it off), holding the
tick lock. Each second it asks `wakeFor`: a Check now (kick), a waiting answer (respecting back-off and source health), a
job on this machine whose process has ended, or a due check. On one, it runs a tick at once (forced for a finished job).
Inside a tick, jobs an answer approved start in the same pass (`startJobs` right after the early and the late
`applyAnswers`), not one tick later. Measured on a fictional root with a stub worker (quota), approving a drafted change
with a reply: before, the change was made after 63 s and the reply posted after 120 s (two scheduler passes); after, the
change was made after 4.1 s and the reply posted after 4.3 s (3 s of that is the stub change run).

## Latency (b): drafts run in a pool, not in batches

`dispatch` keeps `maxParallel` runs going (default 3) and starts the next queued item the moment any run ends, instead of
waiting for the slowest run in a batch of three. Measured on a fictional root with a stub worker (quota), six asks seen in
one pass, one run of 6 s and five of 1 s: before, the three asks behind the slow run were drafted after 7.2 s (p90 7.3 s);
after, they were drafted at 2.2 to 3.3 s, and nothing waited on another item's run.

## Card redesign, part 4: real-data shapes (designer-card-redesign.md S9)

A long message shows 6 lines and "Show the whole message (N characters)", opened in a box that scrolls past 360 px; above
20,000 characters only the first 1,800 reach the card (the row shows 200), with Open in Teams for the rest. A reply over
400 characters shows its count under the box. Details shows the first 5 sources, then "+ N more"; "Progress: X of N steps
done" with the goal, the open steps (▸ the current one), who does each and where in words, and the done steps folded with
✓ and no strikethrough; "What happened, newest first", 4 until "Show all". Item codes and raw references (part:, job:,
sent:, owner:) are turned into words or removed in the projection. A decision the owner must make has its own block and
box ("Your decision (Delegate continues from it)"). A holding reply reads "Holding reply to <name>, in <chat> · says you
are on it; not the answer yet" with "Send holding reply". A PR review gets "Delegate's review of PR <n>" (verdict, the
PR line, each finding), then the reply to the chat, then "On PR <n> (Azure DevOps)" with a checkbox per comment and for
the vote; the primary says all of it ("Send reply, comment and approve", "Send reply and comment" without the vote).

## Card redesign, part 2: the Now list (designer-card-redesign.md S3, with S8's row time)

Sections are "Waiting on you", "Delegate is on it · N now · M in line" (running and in-line rows; rows waiting on Delegate
never sit in "Waiting on others"), "Waiting on others" and "Catch up"; the summary reads "N need you · Delegate: A now,
B in line · C waiting on others". A row is three lines: who · "in <chat>" or "1:1 chat" · when they wrote (S8 compact,
warning color past 2 working days) · ↗; their message; then what you'll do with it ("Your reply:", "Holding reply:",
"Your step:", "Delegate needs to know:") or Delegate's headline and reason. No code is drawn (tooltip only), no row has
a free-text box (your step has Update), "Draft a reply to" reads "Delegate will draft a reply to", a group message's chip
is "Posted to everyone", and one being judged reads "Delegate is checking whether <name>'s message needs you". These are
React-projection changes; today's pages keep their wording. Reply rows keep Open, not Send: a row shows one line of the
reply, and the owner's rule (10-21) is that a reply is sent only from where its whole text is visible.
S8 in New: rows, the card head and Done rows show when the person wrote in one format (`10:42`, `Yesterday`, `Tue`,
`Oct 12`; "Sent <full date and time>" on hover), from the newest message when they wrote again, else "added <time>";
past 2 working days the time is in the warning color; a row relabels itself after midnight without a reload.

## Card redesign, part 1: the shared card (designer-card-redesign.md S1, S2, S4, S7 terminal rule)

`features/ItemCard.tsx` is the one card for New's opened row and, once the Classic builder wires it (S5), Classic's Needs-you
card. Blocks, in order: their message (avatar · name · "in <chat>" or "1:1 chat" · sent time with the code as tooltip ·
Open in Teams; the bubble; "Show N earlier messages" in place; every warning, never folded); what you'll send (the reply,
editable in place and labelled "Your reply to <first name>, in <chat>", which makes the primary "Send your version"; or
"Delegate needs to know" with Your answer; choices and the meeting; your step with How did it go? and "Draft my update to
<name>"); "When you send, Delegate will also" (changes as checkboxes, to-dos kept, the watch); the actions (primary ·
Later · ⋯ with Edit in Teams, Dismiss, Continue in a terminal); and one collapsed Details line (why, sources, progress,
history, changes already handled, Ask Delegate; it opens while an ask is pending). Several asks in one conversation show
"N asks in this conversation", replacing the "Open item" buttons. "Open on your computer" is "Continue in a terminal",
named "on <machine>" when the runner is elsewhere and unavailable with its reason when no runner reads or the window is
open; `status.reading.here` carries the page server's own machine. `SentTime`, `AsksList`, `firstName`, `whereOf` and
`sentAt` are exported for Classic; `card.css` comes with the card.

## Edit habits: drafts follow how the owner keeps editing (Core 10 J6, pm-edit-habits.md)

Each owner-edited send (never a rule send, never an off-record chat) logs `edit-style` with the kinds code can measure:
shorter, longer, bullets, a greeting added or removed, a closing line such as "Thanks!", and an added link. The learn run
adds tone and language as one optional `style` field. Three edited sends of one kind within 14 days, in 1:1 or group
chats, with none of the last 3 edited sends there going the other way, become one H suggestion. Its scope is the narrowest
the evidence allows: one person, one chat, or every reply; a language is always per person. Kinds found together in a
scope come as one suggestion, at most one new suggestion a day, and a kind turned on, waiting, snoozed or declined is not
offered again for that scope. Turn on saves a learned rule with `style`; the generated Learned block in rules.md shows
it; Settings › What it knows shows it with its words editable (Save style), Remove, and Undo during the undo window.
Editing against an accepted style 3 times offers to remove it.

Guard (Engineer check): a style rule never decides. `decide()` skips it, so it can't shadow a send, ack or ignore rule;
`suggestions()` ignores it. Only the drafting prompt reads it, and only the styles that fit the item's person or chat.
Proved with stub workers (quota) on fictional roots: the spec's checks 1-7 (including Robin's style not reaching Kim's
draft, Edit, Undo, and the negative cases), a style rule listed before a send rule for the same person still sending
exactly once, and Settings Turn on, Save style and Undo in New and Classic at 1280 light and 400 dark.
## bug 10-22 Classic image labels exposed internal media keys

MessageBubble, thread text, asks lists and row previews hide only the internal
inline key inside an image marker. The label remains, such as "[image: Acme
chart]". Ordinary inline text is unchanged. Stored asks, thread lines and media
keys are untouched, so the worker can still open the original image.

## bug 10-22 E73: saving signature text changed approved-reply signing

An unchanged signature save is a no-op, including the default text while
config.signature is absent. A changed signature captures the current effective
signApproved value rather than changing it implicitly. Legacy custom-signature
configs keep their existing effective value; only the explicit signing setting
changes that choice. The help no longer promises an implicit switch-on.

## bug 10-22 Classic Daily summary help had no Settings path

Keep today's help-only summary template and chat wording, but link directly to
Settings / Daily summary (summaryAt). It closes the chooser and focuses the
working setting; it does not create an automation or change its schedule.

## bug 10-22 E82: an existing pasted message still offered Make an item

Classic's missed-message field reuses the server's link lookup before offering
creation. An existing message names its item and offers Open; lookup failures
are explicit, not assumed absent. The action also rechecks exact chat/message
identity before saving, protecting a race or an older page. A successful save
has one result, not both an inline duplicate and the page-wide receipt.

## bug 10-22 Classic question with an existing draft

The shared card always exposes Your answer for a real pending question, even
when an old draft remains after a refused invite. Draft reply is the primary
until the question is answered; a reply is not sent while collecting that answer.
Explicit owner editing and work-decision/holding-reply paths remain distinct.

## Classic S1-S5/S8/S9: one card, shared messages and sent times

The adapter also passes the matching placement when this item is its actor,
just as New does. Work-step, kept-to-do and Track primaries therefore retain
their actual action context. Edge1280/400 showed the same primary/labels in
both experiences and queued exactly one "Issues found: 403" work answer.

- ClassicCard is now only a routing adapter to ItemCard, including multi-ask
  navigation and retained snapshots; no second card layout, editor or action
  mapping remains. Classic keeps its shell, queue, tabs and feedback rows.
- Shared ItemCard has an explicit read-only snapshot mode: no action buttons,
  editable reply or Ask submission is mounted. Local Details/thread folds remain
  usable. The existing pin/revision resolver also accepts Classic's visited
  fallback, preserving exact-revision safety and retained text.
- Classic queue and Home use shared sentAt/SentTime instead of creation time;
  queue codes move into time tooltips, with message then chat on separate lines.
  Ongoing and Done use MessageBubble and SentTime for messages and activity,
  while keeping their existing watch, Undo and feedback controls.
- Signed AI replies show the canonical sendText in the shared editor; changing
  it is still an owner edit, with no second signature. Huge queue/Home previews
  are bounded to 200 characters, not merely visually ellipsized.
- Edge1280light/400dark: normalized shared card DOM was identical; signed
  preview, retained stale edit/disabled Send, snapshot0actions/0editable fields,
  four-part ask switching, scroll-limited long message and 1,801-character huge
  bubble passed. Owner edit sent once exactly; Home Watch made1watch, Needs me
  reached Needs you after a stub draft, controls0tabs/body1target, no overflow/errors.

## Classic S5/S7: direct Teams links and shared accessible hover text

Final coverage includes labelled local feedback controls (visible labels win
over longer ARIA names), the App version select, tab counts and Ongoing
interval/code hints. All use the same map and matching hidden descriptions.

- Approved design: direct Open in Teams in the card head, plus sibling external
  links on queue/Home needs rows, never nested anchors or item submissions.
- Local buttons use the same hover map as action buttons, retaining explicit
  item-specific text. Every hover has matching hidden description text. Plain
  Send/Cancel/Close stay without unsolicited titles. Hint covers chips/links.
- Exact-blocked approval uses the stale disabled reason, not an input hint.

## bug 10-22 E08/E40/Core10 J2/J8: unrelated asks reused another home

- Before: Robin's incident 5091 message entered his PR 2203 home while its
  goal and plan still described the review. A worker `same` also let Rex's
  fresh ask enter Ria's hour-old failed item.
- Same-sender identity and most-recently-updated are no longer join evidence.
  A deterministic join needs a unique recent candidate and matching typed
  entity, substantial topic evidence, or a real reply link without a conflicting
  entity. Ambiguous messages become their own visible item immediately; their
  ordinary worker may resolve same-ask ambiguity after intake, not before.
- Eligibility uses the latest owned inbound message, never a background save.
  Thirty minutes, a failed job/run, a previous send, or an incompatible entity
  blocks a worker join. An AI `same` cannot override these boundaries; FYIs and
  intent-none reports cannot join asks. Work homes keep their own plan/steps.
- If a worker supplies only an invalid `same`, one bounded redraft omits the
  other candidates; a repeated invalid join becomes an explicit owner question,
  not an infinite retry or an empty successful result.
- A valid cross-sender join updates the quoted ask and primary asker to the
  newest owned inbound message, retaining the earlier askers for mentions.
  Every successful join invalidates the old approval/send time.
- Observed with a stub worker, both experiences at 1280 in Edge: Ines kept one
  item for floor and room; Robin's incident got its own code and the old review's
  goal, done-when and three plan steps were unchanged; Rex and a fresh ask beside
  a failed item stayed separate even when the stub proposed `same`. Intake
  persisted all four messages in 86 ms before worker dispatch. One explicit
  send per experience quoted Ines's newest room ask exactly, with no duplicate.
  A valid Kim join made Kim's new ask the quote and retained Ines as an asker.
  No browser errors, overflow, real AI or new owner sessions.

## bug 10-22 R4 J8: an automatic reply sent an unfilled blank

- The reply playbook previously required `____` for missing facts. It now asks
  for the missing fact in `question`, or reports `goalMet: false` with a blocker;
  a sendable reply has complete supported words. The report schema and shared
  worker gates say the same thing.
- A shared gap check covers underscore runs, standalone XX/TODO/TBD, bracketed
  missing/insert/fill markers, angle/brace gap slots and double-brace templates.
  It does not treat ordinary Markdown, URLs, type comparisons or JSON objects
  as blanks. Missing attachments remain covered by the existing source gate.
- Draft scheduling and due-rule sends hold in Needs you with the existing worker
  question, clear approvals/send time, and log `rule-held-gap`. Direct Send and
  OK refuse with "This reply still has a blank: fill it or edit" before changes
  are approved; the last send gate checks again, including the signature.
  A filled owner edit still waits for its own explicit Send.
- The same check covers automatic acknowledgement text and each due reminder's
  actual outgoing text. A reminder with a blank pauses without incrementing
  its count, records the reason in Health and logs `rule-held-gap`.
- Observed in Edge, New and Classic at 1280: stub blank held with the worker's
  original question, zero posts; direct Send returned the stated refusal.
  Answer to preview to owner edit to Send posted exactly the edited text once.
  A legacy scheduled blank moved to Needs you, a reminder paused at count zero,
  and OK on a blank with changes approved nothing and made no external reads.
  All twelve gap-marker shapes were detected; seven ordinary text/code/link
  shapes were unaffected. No real AI, browser errors or new owner sessions.

## bug 10-22 E79: AI quota and unavailable-model failures looked like item failures

- Classify the provider's monthly-quota/402 and unavailable-model failures as
  account setup, not per-item retry failures. Keep a durable configuration-
  scoped hold and shared Health reason. New drafts, questions, promise checks,
  reminder judgments, owner-reply judgments and background jobs wait together;
  ordinary approved/rule sends do not depend on AI availability.
- Copilot workers use their own `--log-dir` beneath the existing local run
  folder. Classification reads only that run's logs, including the provider's
  actual `retry_after_ms` (milliseconds) or `retry_after` (seconds), never another
  session's old logs. The banner says about how long remains, or omits a time
  when the provider gave none; it never invents one.
- A provider retry time or changed AI configuration releases the hold. Changing
  a model does not reuse an old model's failure. Raising an external budget
  alone is not observable while runs are paused; an AI configuration change
  also permits a fresh try before the provider's retry time.
- Work jobs wait queued with the actual reason and without spending per-job
  retry attempts. An execute run without a report keeps its existing safety
  behavior: disarm its approval and require review, never replay a change just
  because the budget or model changed.
- Placement distinguishes AI availability from the reader and send availability:
  queued AI work is Waiting, while a scheduled reply can still go out. Both
  card styles use the existing attention surface for the exact setup reason,
  and row Next text names the quota retry time or unavailable-model wait rather
  than promising "next cycle". Classic Ongoing marks these rows Held instead
  of drawing a running progress bar.
- Manual acceptance: real-process quota and model-error stubs, both experiences
  at 1280 light/400 dark, no repeat starts while held, and resume after changed
  configuration or the provider retry time. No real AI or owner data.
- Observed: each error affected an already-started reply run and background job;
  subsequent dispatch/job-start calls started zero processes. Work stayed
  queued with no transient retry, ordinary approved send posted once, and
  changing the model or reaching the exact retry boundary released three
  waiting runs. All 16 card captures showed the actual reason, no generic
  failure, no horizontal overflow and no browser errors; zero new owner sessions.

## bug 10-22 R2 J1: owner-reply AI failure blocked Send and left stale Health

- Before: an unrelated owner FYI plus a real-process stub returning HTTP 402
  left the draft unsent with "Sends wait", even after an explicit owner OK.
- Send now uses reply-target evidence, normalized whole-draft matches and saved
  ask-specific judgments only. It never starts an AI classification on the
  critical path. An unknown judgment informs in Health; it does not bypass
  any ordinary send gate, or block an approved or rule-authorized send.
- Intake also recognizes the owner's draft text without AI, including a
  surrounding message, but not a word fragment or words inside an old quote.
  An exact match is closed as "You sent it yourself".
- Unknown checks retain the unquoted owner words and the exact ask revision.
  Existing failed checks retry on the next cycle even with no new owner post;
  successful checks, or having no relevant open checks left, clear Health.
  A newly failed check is not immediately repeated in the same cycle.
- Manual acceptance: a 402 stub, an explicit Send once, a rule send once,
  owner-text and reply-link duplicate prevention, and recovery in one cycle,
  through both React experiences on isolated fictional roots. No real AI.
- Observed in Edge at 1280: each experience posted one explicit reply and one
  signed rule reply; replay and the second rule attempt posted nothing. Exact
  owner posts at intake and pre-send used zero classification runs, with no
  duplicate send. The warning was visible before Send and absent after one
  successful recovery cycle (333/213 ms with the stub). A legacy refusal also
  cleared in one cycle without changing thread order or the approval revision.
  Zero browser errors and zero new owner Copilot session entries.
- Follow-up: the pre-change approval path also uses this non-gating fallback;
  it had retained the old unknown-check refusal. Existing actual-owner-reply,
  changed-message, exact approval, write allowlist and change-ledger gates stay.
  In Edge, both experiences accepted the explicit approval with an unrelated
  owner FYI and queued only the allowed change, with zero owner-check AI runs.
  An exact owner post instead closed as "You sent it yourself", with no approval,
  change or duplicate post. No real external effect was run by this proof.

## PR-review gate: review or vote only when asked and a reviewer (owner rule 10-23)

A PR review job (the worker's `pr:` job, `jobForRecheck`, or the forced recheck) starts only when someone asked the owner
to review this PR (his own answer or message counts; a room message must name the PR), and the live PR read shows him
as a reviewer: by name (required or optional, not declined), or in a reviewer team he belongs to (`core_list_project_teams`,
`mine: true`, cached hourly per project) whose vote is below approved. Never on his own PR. Otherwise the item says why
(`reviewDecline`), with no job:
- not on the list, team approved, or a group he can't be matched to: "Add you as an optional reviewer" as its one
  change (`update_reviewers`, add only `owner.upn`, refused in `refusal()` otherwise). Once made, the review starts;
- his own PR, or declined in Azure DevOps: a question, no Add me;
- PR unreadable: held; the 10-minute PR check restarts it when the PR can be read, or when he becomes a reviewer;
- a room message: closed quietly with the reason.
The owner's own "review PR N" (or "review <PR link>") in the self-chat counts as asked and reruns the open item about
that PR; with no such item he is told how to start one, never left without an answer. A team that already approved
reads "Not reviewing: your group already approved PR N".
Votes follow the same rule: one from a reply run becomes a to-do with the reason, a review job's vote is dropped when
he is no longer a reviewer, and `make_change` casts no vote unless the PR read right before it shows him as a reviewer.
With no Azure DevOps reader set up, only the ask check applies (no vote can be cast there).
Proved on fictional roots with the real tick, stub workers and a stub PR reader with reviewers and teams; the page
shows the decline with its reason and Add me in New and Classic at 1280 light and 400 dark.

## E98: New's automation chooser matches today's New

Today's New reaches its automation chooser (Remind someone, Watch something, Daily summary) from the automations
address, and from Back on the reminder form. Its "+ Remind someone" opens the form directly. React New did the same,
except that the address opened the reminder form. The address now opens the chooser in both experiences.
Proved on a fictional root in New at 1280 light and 400 dark:
- `#automations/new` opened "New automation, step 1 of 2" with the three choices.
- "+ Remind someone" opened the form (step 2), and Back returned to the chooser.
- No automation was created.

## reminder recipients: real people in test chats, never "[as Name]" personas, and an empty list says why

The reminder recipient list (and `findChat` for a typed name) skipped test chats entirely, so test runs had no
one to choose and no reason shown. A test chat is a real chat. Its group chat, or a real person in a 1:1, can now
be chosen. A "[as Name]" persona (id `test:*`) is never listed or matched. When the list is empty, the page says
why and when people appear, and mentions personas when that is the reason. The note is shown in the shared reminder
sheet ("Send to") in New and Classic.

Proved on fictional roots in New and Classic at 1280:
- **Real people and groups:** a test group chat played with personas, a persona 1:1 and a real person's 1:1 offered "Pat Real" and the group, never Kim or Ines. `findChat` resolved Pat and the group, and refused Kim.
- **Personas only:** the list was empty, and both sheets explained why.

## bug 10-23 E08: a same-asker follow-up in a group chat started a second item

Ines asked the owner by name (A9537, drafted), then followed up in the same group chat without naming him. A message
that doesn't name the owner skipped routing and went to group judgment, which started A9545 beside A9537's
half-answering draft. Now such a message from someone who already has a live item in that chat joins it, decided by
code before any judgment (reason "same asker follow-up"). Like any ask that joins, it withdraws an ok and marks the old
draft with "1 new message" while it is redrafted with both messages. Unaddressed messages from others still go to group judgment. A draft written
by the inline run now also resets the new-message count, as a job's draft already did, so the mark clears once the new
draft covers the message.

Proved on a fictional root with real intake and dispatch, a stub source and a stub worker:
- **Join:** Ines's follow-up joined A1 (2 messages, running, the old draft marked "1 new message" in New), and the redraft prompt had both questions.
- **Redraft:** the new draft answered both, with the mark cleared, in New and Classic at 1280.
- **Control:** Paz's unaddressed question still started a group-judgment item.

## legacy E16: an invite stored in the old meeting shape, made or refused with a redraft offer

An invite proposed before calendar calls were converted is stored as `{ subject, start, minutes, attendees }`.
- **Converted at execution:** `makeChange` converts it with `toolShape`, so the owner's calendar tool gets exactly `{ subject, attendeeEmails, startDateTime, endDateTime, timeZone }` in UTC, in one call.
- **Refused when it cannot be converted:** `refusal()` now checks the converted shape, and `inviteShapeProblem` names the gap: no readable start, no subject, or old fields left. This runs at approval and at execution.
  - The refusal happens before any call: nothing is created, and the reply (which says the invite was sent) is not sent.
  - The item asks one question: answer to have Delegate draft the invite again.
- **Card:** the owner's own refused approval carried no typed words, so the card now adopts the new revision with the offer, never the stale banner. A refusal of the owner's typed words still keeps them.

Proved on a fictional root with a stub calendar MCP server that has the real CreateEvent schema, approving from the page in New and Classic at 1280:
- **Readable start:** the legacy invite made exactly one call, with `startDateTime 2026-10-26T06:00:00`, `endDateTime 06:30:00` and `timeZone UTC`. Then the reply was sent once.
- **Unreadable start:** zero calls, no reply, the card showed the reason, the redraft question and Draft reply.
- **R3 checks:** still pass in all four.

## spec S6 and S7: no loading view on a switch, and one hover text per control

S6:
- Every view's code is listed once (`data/views.ts`).
- `components/preloadable.ts` renders a view directly once its code is loaded. React's lazy fallback, and its 300 ms throttle, never show for a loaded view. The choice is fixed per mount.
- The page loads its first view with the data, the rest of its experience once the page arrives, and the other experience when the browser is idle, at most 3 s later.
- A switch before that code arrives keeps the screen, dimmed (0.55) with a small spinner, until it does.
- The page query is not fetched again when the other experience mounts.
- Classic's unscoped `.experience-choice` rule is scoped to `.classic-experience`, so loading Classic's code early never restyles New's header.

S7:
- `domain/hover.ts` is the one map from action kind (or label, for row actions) to hover text. The server's `meaning` wins.
- `[clause|fallback]` segments drop cleanly when a value is missing. Send, Cancel, Close and other self-explanatory labels get none.
- The shared `ActionButton` sets `title` and an `aria-describedby` hidden copy, so New and Classic say the same thing.
- A disabled button says why: "Pick an option first.", "Type your answer first.", "Changed since you looked…", a busy, expired or submitted state, or "Offline: reconnect to act." first when offline.
- New's chips and codes use the exported `chipHover` and `codeHover`. Classic can use the same exports for its own chips.

Proved on the owner-store copy, navigation and hover only:
- The other experience's code loaded within 4 s, both ways. Switching drew with no "Loading" text and no extra page read.
- With Classic's code delayed 3 s, a switch kept New dimmed and showed no Loading text.
- First tab switches took 160–330 ms, down from 360–470.
- Titles equal their descriptions, none has a command, no plain label has one, and every title starts "Offline" when offline.
- On a fictional choice card, both experiences' disabled primary says "Pick an option first.", then "Type your answer first." after choosing Other.

## bug 10-23 R3: the owner's own Draft reply came back as "Changed since you looked"

New and Classic set `interacting` when the owner presses the primary button, and nothing clears it. The owner's own
answer was adopted correctly: the pin was released once its receipt applied. Then the answer field's cleanup edited
the old revision, still `interacting`, which pinned the card again to the snapshot of that moment, where the item
was still drafting. The new draft then looked like someone else's change: Classic showed the stale banner over
the old choices with Send disabled, and New kept the card without Send. Now a card is pinned only at the revision
on screen, so a late edit to an older revision never pins a newer one. New also shows today's "New draft from your
answer. Not sent yet." line under a preview draft, as Classic does.

Proved on a fictional root in a live session with no reload, using a stub worker, in New and Classic at 1280 light
and 400 dark. Other answer → Draft reply → the answer is applied (drafting) → 5 s later the redraft lands. The new
draft shows with Send and the line about 1.4 s later, never the stale banner. A genuine foreign change while the
owner types still shows the stale banner within 0.5 s and keeps the typed text.

## bug 10-23 perf: every tab took 7 s on the owner's store

On a copy of the owner's store (99 MB), the page took 6.4 to 7.7 s and Settings 6.5 to 7 s.
A CPU profile named one cause: each page re-read every proposal file once per proposal.
`pageManagementRev` and the learned-row check call `store.proposal(code)`, which reads all 232 files each time.
`byCode` reads all 114 items the same way. Settings built the whole page only to name its chat actions.

Fixes:
- A page request reads inside `readScope`: each file is read and parsed once per request, and lists come back as copies.
- Between requests, a file is read again only when its time, size or file id changed (every write replaces the file).
  Outside page requests (the runner) nothing is kept, and any write clears the request's reads.
- Knowledge cards are parsed once per request.
- Git is asked for the version in the background, never on a request.
- Settings names its chat actions without building the page.
- In the React app, the first page read starts with the script, together with the first view's code. The app renders as soon as its code arrives, instead of waiting out React's 300 ms fallback throttle. The other views of the same experience load after the first page.

Measured in-process (warm): page 6.8 s → 0.17–0.2 s, Settings 6.9 s → 4–15 ms, Numbers 63–84 → 30–40 ms.
A cold first page now takes 0.4–0.6 s.
In Edge, New and Classic at 1280 and 400: first load 0.69–0.81 s, every tab switch 68–470 ms.
Page, Settings and Numbers bodies are identical to the old code's on the same store.

## bug 10-23 E40: a promised check-back re-pointed another subject's failed watch

A reply promising to check back on an incident re-pointed the item's existing PR watch
to the incident, while that job stayed failed with no next check, so nothing ever ran.
Now a promise about another subject starts its own watch job; a failed or stopped watch
is replaced, not reused; and every watch it leaves has a next check (an update keeps the
earlier next check, or sets one). The item gets a step that names the replaced watch.

The PR watch had failed because its CLI worker ended 44 s into the run, in the middle of
a read-only tool call, with no output and no report (not ended by Delegate). One check
like that failed the watch for good. Now a check that ends without a result is a missed
check: the watch checks again in 15 minutes, the item gets a step that says so, and only
three misses in a row stop it, with the reason on the item. Proved on a fictional root
with a stub worker. The promise starts its own watch, which runs at once, then not at 239
minutes and runs at 241. A missed check is retried, and three misses stop it with the
reason. New (card) and Classic (Ongoing, In progress) show it at 1280 light and 400 dark.

## bug 10-23 E97: `u` undid the wrong reply in a live session

New and Classic picked the first done entry with an undo in object order. A page
delta appended the newly sent A1 after older rows, so `u` undid A9. The shared
snapshot now carries `lastUndoId`, the undo action of the newest undoable done entry
by time, and both experiences use it. A page delta also carries a table's server
order when a merge would not keep it, and the client rebuilds the table in that
order. Proved on a fictional root in a live session with no reload (New and Classic,
1280 light and 400 dark): after sending A1, `u` undoes A1 and A9 is untouched.

## bug 10-23 E16 (addition): an invite claim without an invite, and a free slot with no invite

A reply saying "I've sent the invite" is sent only after the invite is made
(the change runs first), but when the invite failed or was left out, "send
only the reply" could still post the claim. send() now holds any reply that
says an invite went while the item's invite is not made, with why on the card
and receipt. Before ok, the card lists the invite under the changes and offers
"Make 1 change and reply". An explicit ask to book or send an invite, for a
free slot too, must carry the invite change: the playbook says so, and a run
whose draft only agrees ("works for me") gets a question to redo it with the
invite (invite-ask-unmet). Proven with the stub calendar MCP with the real
schema: a real worker on a free Tue 16:30 booking offered "Book the requested
time" with the invite (attendees, time, 30 minutes), 0 writes before ok; a
reply-only stub got the question; a failed invite's reply-only send was
refused in New and Classic; one ok still makes one CreateEvent, then the reply.

## bug 10-23 E60/E83: Done lost an open item's sent replies, and group rows had no Teams link

(a) Done listed an item's reply only while the item was done or open with a
send. After A9801 reopened for a follow-up ask, its two logged rule replies
vanished from Done (no Replies filter), while Numbers counted "2 of 2 replies".
Done now also lists every logged send (owner or rule, not reminders) that no
listed item shows, from the send log: an earlier reply of an item that is open
again, or an earlier reply of the same item. Its words are the sent words, its
link is the sent message, and it carries no feedback actions (those act on the
item's current reply). (b) Teams links were never built for test chats, so the
real G3 group's rows had none. A test chat whose id is a real Teams chat or
channel thread now links like any other; a made-up demo id still does not.
Today's pages share the same view, so they gain both too. Proven on a fictional
root: React New and Classic at 1280 light and 400 dark, and today's New: All 4,
Replies 2 (both "by rule R9801", each "Open in Teams"), Catch up 2 with links;
Numbers says 2 of 2.

## bug 10-23 E17: an inline screenshot never reached the worker

A screenshot pasted inline (<img src="data:image/png;base64,…">) became
"[image: alt]" with no link, because only Graph hostedContents links were kept,
and a new item's history stripped images entirely. The worker could not open
it and could fall back to knowledge (a polluted card said "A999 and it's
okay"). Now intake keeps an inline data-URI image in the store (state/media,
by content key) and the thread line reads "[image: alt inline:<key>]", which
image_read opens. An image with no link that can be opened is marked "(it
cannot be opened here)". The reply playbook says to open images before
answering from them, and when one cannot be read, to say so and never describe
or guess it from knowledge. Proven with the real Copilot CLI worker (isolated
COPILOT_HOME, zero owner sessions), a real PNG rendered in Edge and a planted
"A999 and it was okay" note: the worker opened inline:<key> and drafted
"ACME-4821 … Blocked, waiting on the Globex certificate"; an unopenable image
got "I can't read the screenshot here. Could you paste its text?". New and
Classic at 1280 show both drafts.

## bug 10-23 E16: a booked invite could never be created

The worker copied the meeting payload { subject, start, minutes, attendees }
into the calendar CreateEvent call, and the tool rejected it ("Unknown argument
'attendees'; parameters: subject, attendeeEmails, startDateTime, endDateTime,
timeZone…"), so no invite could be made. Every proposal now goes through
toolShape (in vet, and again right before the call): the meeting shape, or
offset times, become { subject, attendeeEmails, startDateTime, endDateTime,
timeZone: 'UTC' } with the end at start + minutes. Before any write, the
change run reads the tool's own input schema and refuses unknown or missing
arguments without calling it, with the tool's parameter list as the reason.
The reply playbook names the tool's arguments and says the reply tells them
the invite was sent (it goes after the invite is made), never asking them to
send it. Proven with a stub calendar MCP with the real parameters: the old
shape is refused uncalled; picking "Book 11:30 IST" shows the mapped call in New
and Classic; one ok makes exactly one CreateEvent with exactly those arguments,
then one reply. A real worker run drafts "I've sent an invite for 11:30".

## bug 10-23 E36: an explicit recheck was answered inline, and claimed a recheck

"Freshly recheck and re-review PR N if ready" was answered by the reply run as
status_next_step with a drafted reply. jobForRecheck needs intent pr_review and
no reply, so the review job never ran, while the draft and work step said
"Rechecked the live PR state" from the runner's status read only. Now an
explicit recheck, re-review, review-again or approve-if-ready ask (not a
negated one) on an item with a PR goes to that PR's review job, whatever
intent or reply the reply run gave (log recheck-routed). Its draft is dropped,
and its work step says the review is running instead of claiming a recheck.
The prompt also says the runner's PR facts are a status read, never a review.
A job saved as done drops any old error. Proven with the real Copilot CLI
(isolated COPILOT_HOME) and a stub read-only ADO server: the reply run drafted
inline (hadReply), was routed, the review job ran, and New and Classic show its
fresh not-ready result with no vote proposed; a stub inline status report is
routed the same way.

## bug 10-23 E11: merged test asks lost their speaker, and a merge dropped an asker

In a test group the owner speaks as others with "[as Name] …". Only classify()
rewrote that; a new item's thread history (create()) kept those lines as the
owner's, and joinInto kept the destination's copy of a joined message over the
source's rewritten one. So joined asks read as the owner's own and were closed
with no draft. Now asSpeaker() rewrites history lines too, and a joined message
keeps the line of the item that owns it. Separately, a merged item recorded
every asker, but the prompt told the worker only to answer the marked lines, so
it answered the newest asker. The prompt now lists each asker's unanswered asks
and requires the reply to name and answer each one (or ask the owner). A
placeholder question ("None.") is dropped, so it no longer hides Send. Proven
with the real Copilot CLI worker (isolated COPILOT_HOME, zero owner sessions):
"[as Mei]" and "[as Omar]" asks merge into one item with both lines theirs and
the draft "@Mei and @Omar, … room 4.2"; Rita's two questions plus Lucia's get a
draft naming and answering both. New and Classic at 1280 offer Send.

## bug 10-23 E88: the first 500-row redraw cascaded at 400 px

The first update after load committed up to four times: the data commit, then
a ResizeObserver measurement (setMeasurement), a frame's range update, and a
re-measure of rows newly in range. At 400 px rows wrap, so estimates miss
more and the cascade showed (17.8/13.4/18.8/15.1 ms). ViewportList now reads
the drawn rows' heights in the layout effect of the commit that drew them,
and works out the range from those fresh offsets synchronously (at most three
passes a frame, then the next frame). A measured height no longer re-renders
by itself: spacers only stand for rows not drawn, so only a range change needs
a commit. Measured on the same fixture in Edge (5 runs each): New 400 dark
3.5-7.4 ms, 1280 light 3.5-7.6 ms, mostly one commit, never a cascade. Direct
target, j, focus kept offscreen, end of list and Classic's queue target are
unchanged against the build before.

## bug 10-23 R4: a lost MCP answer re-sent a rule reply

The MCP client reconnected and called the tool again after any session-lost
error (-32001), sends included. A Teams post that landed before its answer was
lost was posted twice. Now only tools on a read allowlist (List*/Get*/Search*/
Find*/Read*/Fetch* and known Azure DevOps reads) are called again. Any other
tool reconnects and throws LostResponse, never repeated. A Teams send then reads
the chat (or channel replies) back: our exact words, posted since the attempt,
are recorded as that message id; not found, the item is held: "Not sure it was
sent; check Teams…", on the row (Why) and both cards, and no rule, retry or
tick sends it again. A change run's lost write keeps its "calling" record
(may have been made, not repeated); a vote is decided by reading the PR again.
Proven with a stub Teams MCP on a fictional root: post-then-drop gives one post
and its id recorded; drop-before-post gives one call, no post, held, with no
resend over three ticks; React New and Classic at 1280 and 400 show it.

## bug 10-23 E33: a Claude tool with no Claude Code name was retried 3 times

With flavor claude and a read tool like "fictionalreader", the adapter's error
was wrapped as "Could not start <full CLI path>: Error: …" and cut to 160
characters, losing the tool name and "no known Claude Code name". The
setup-error match then missed it, so the start was retried 3 times and counted
3 AI runs. The adapter now throws a typed setup error, worded without the
command path, and the tool names are checked before a run is counted or
started. One shared pattern (SETUP_REFUSAL) classifies every setup refusal
(write tool as read tool, shell in a clone, unknown Claude tool) for runs and
jobs: refused once, never retried, kept whole. The shared row's "Why" note no
longer repeats "Delegate". Proven on a fictional root with the real adapter
and no CLI spawned: 3 dispatch passes, 0 runs, one run-start-refused; React New
row and card and React Classic card at 1280 light and 400 dark.

## bug 10-23 E34: an earlier turn's send blocked the reply to a newer ask

The send gate treated any send kept on the item (`wf.sent`) as "a reply to this
message already exists". Intake starts a new turn (clearing it) only for an
open or done item, so a fresh ask on an item in another state kept the previous
turn's send, and the owner's reply to the new ask was refused. Each send now
records the inbound ask it answered (`sent.askMsgId`); the gate counts it as a
duplicate only when that ask is the item's newest inbound ask or later (a send
recorded before this field: when it went after the newest ask). Proven on a
fictional root in New and Classic at 1280: the new ask's reply sends once; a
second send for the same ask, and a legacy record after the newest ask, are
both refused as duplicates.

## bug 10-23 E33: a run refused at start showed no reason

A write tool listed as a read tool stops the run before it starts: the item
goes to needs_human with status "Could not start: … is never a read tool …"
and no question. The projection carried the status, but nothing rendered it:
New's row said "Answer Kim: <ask>" and the card offered a blank answer (today's
New card even said "Nothing to do"). The shared row now adds "Why: Delegate
could not start: …" (today's New and React New), and the projection puts the
status in the card's attention line, which React New and React Classic show.
Proven on a fictional root with the real start refusal (0 runs): React New
1280 light and 400 dark (row and card), React Classic 1280, today's New 1280.

## bug 10-23 E35 (addition): tags and times are not PR numbers; vote claims are checked

The approval check read one whole bounded statement and counted every number
as a PR id, so a run-tag prefix (and a time) failed it. It now drops a leading
[tag], checks each sentence that speaks of approval on its own, and counts only
numbers written as a PR ("PR N", "pull request #N", ".../pullrequest/N", or a
bare number right after "approve(d)"). Owner words that claim a vote is in
place ("my vote is now Waiting for author", "I approved it") are checked
against the live vote and held with why if it differs; verified owner words go
without a PR re-read redrafting them. Proven with the real worker (isolated
COPILOT_HOME, zero owner sessions), tag prefix plus several sentences, New and
Classic at 1280.

## bug 10-23 E35: the owner's own edited reply was redrafted away

The owner sent "I will not approve PR N until its build is green. …" as their
own words. The send-time approval check (meant for AI drafts that claim an
approval the PR doesn't show) only accepts one bounded sentence, so it rejected
the text, dropped the owner's draft and redrafted, with no word to the receipt.
Now the owner's own typed words go as written; only words that say an approval
is already made ("I approved it", "LGTM") are checked against the live vote,
and then held (text kept, state needs_human) with why on the card and receipt.
Every refusal on this path, including the AI-draft redraft and an unverifiable
PR, now tells the answer why. Proven with the real Copilot CLI promise mapper
(isolated COPILOT_HOME, zero new owner session entries) in New and Classic at
1280: one exact send, no vote, the conditional promise kept as a to-do and a
build watch, receipt "Sent A9001 to Robin."; stub checks for the held claim
(both experiences, card and receipt say why) and the AI redraft receipt.

## bug 10-23 E28: an explicit vote ask ended as a status-only draft

A fresh "set my review vote to WaitingForAuthor" ask on an item whose open work
still said Next "reply that the live vote is Approved; no change needed" (from
a run that briefly read Approved) got a reply that only reported the live
NoVote, with no vote proposed. The worker trusted the stale Next and steps over
the new ask. The prompt now says the runner's PR evidence and the newest >>
messages override older Next, steps and plan, and that an ask to set the
owner's vote, when the live vote differs, is answered by proposing exactly
that vote (or goalMet false with why). The engine also refuses a silent miss:
when a plain, unconditional "set my vote to X" ask gets no pending X vote, no
question, no choices and no blocker while the PR is active and the vote differs,
the item asks the owner to redo it with the vote or skip. Proven with the real
Copilot CLI worker on a fictional root with the same wording and stale context
(New and Classic, 1280 light: one pending WaitingForAuthor vote at the live
head, approve offered, 0 cast, 0 sent), and a stub status-only report showing
the question.

## bug 10-23 E55: a rule reply held while the owner is active said it sends at a past time

When a rule reply falls due while the owner is Available and was active in the
last 10 minutes, the engine keeps it scheduled and sets only its status
("Held: you are active in Teams"). New's row and card still said "Delegate
sends it at <past time>". The shared row now shows a Held chip and "Delegate
holds it because you are active in Teams; sends it once you step away"; the
Classic running row carries the held status as its detail. Proven on a
fictional store: React New 1280 light and 400 dark (row and card), today's
New, and React Classic Ongoing; 0 sends.

## bug 10-23 E26: failed approved run asks for directions, not a stale approve

After an approved change run dies, recovery fails the job and asks the owner
to answer with directions or skip. Today's pages render that as a question,
and the engine refuses ok while a question is open. The projection offered
approve anyway, so Classic hid it and New could expose a refused action.
Do not offer approve while a needs_human question is open (except the
no-draft promise-check retry). The answer reruns; old submissions are
refused. Proven: stale executor marker recovery on fictional data in both
experiences, zero calls/sends, and the Draft reply path still working.

## bug 10-23 E49: stop or extend only a promised check-back

Active work.watch supplies canonical extend-watch and stop-watch actions.
New cards/waiting rows render them; Classic progress receives stop-watch
alongside its existing interval/Extend. Classic RowActions must include that
kind (coordinator notified), not confuse it with classic-close.
A dedicated unwatch owner verb stops only the check-back job: queued work
cannot start, a local running check is stopped first, failed kills retain
it with an explicit reason, and shared/remote runs are not killed here.
Clear the watch pointer and record a quiet step, retaining work, plan,
drafts, effects, to-dos, global control and all unrelated jobs.
Management revision includes the watch id/horizon, so an old Stop cannot
stop a replacement check-back. Extend keeps the existing 7-day behavior.

## bug 10-23 E49: save a quiet watch baseline

The first promised check-back now records its result ref without news or
waking work, and finishCheck persists that baseline without touching the
item's timestamp. An identical repeat finds the ref and stays quiet; only a
new result wakes once. Report merge/done behavior is otherwise unchanged.
Prove baseline, first repeat, genuine change, replay and stop condition
through the real job-result path; work itself never closes.

## bug 10-23 E48: Catch up Watch uses the existing FYI action

Now's structured Watch was incorrectly queued through the done-item guard.
Use the same immediate watchItemTarget binding as Done Catch up, including
default target/until, exact revision, date validation and interruption
semantics. One live watch per FYI, watchFrom=catchup, and watchedAs on the
source; never a message. Existing Done and Classic paths keep the same
binding. Prove New row clicks at both widths and replay without duplicates.

## bug 10-23 E43: retain a completed build's code-read fact

The build probe marks a successful step correctly; mergePlan later erased
done when the worker omitted it. Keep the mark for the same build AND project,
along with its seen state. A new build/project inherits neither; existing
deploy-ring retention stays. Prove baseline quiet, success news once, worker
report omitting done, unchanged recheck quiet, and completed checklists in
both experiences. No new probe or AI run on the unchanged result.

## bug 10-23 E41: owner commitment cards name You

The shared card uses startedBy=owner to name You, rather than treating its
absent external asker as Someone. Both page versions/experiences inherit it;
ordinary named and unknown external askers are unchanged. Prove proposed
owner work at both widths, including Skip without tracking or sending.
The normalized person also retains that owner identity when the row or
history populates it later; their unknown external-asker fallback must not
overwrite the card's You.

## bug 10-23 E37: dismiss a pending retry

Reuse today's card-menu Dismiss on a queued retry in both React experiences.
Skipping cancels an exclusive retry immediately (and a retry which started
before the click), while a failed kill keeps the item open and shared work
needed by another parent continues. Existing skip semantics preserve open
work when only its reply is dismissed. The New retry line uses the rendered
next text/time, not a raw {at} template. Prove both widths/experiences, no
later worker/send, shared-parent preservation and failed-kill refusal.

## bug 10-23 E26: concurrent receipt writes must not lose an approval

Every atomic temp file includes machine, PID and a per-write random identity,
still under the existing .tmp-* ignore/reader convention. A page submission's
prepare/queue/recovery/completion transaction uses its own inter-process lock.
Receipt merges retain accepted, processed, refused and uncertain facts and
terminal detail; a stale prepared/queued write cannot erase a terminal result.
Completion appends its detail against the current record under the same lock.
An ENOENT on persistence re-reads and recomputes instead of failing the answer
on a consumed temporary file. Other I/O errors remain explicit.
Prove simultaneous Windows writers plus a real Edge approval on fictional
data, with stable answer identity, one effect and one reply. No tests.
Measured on Windows: two processes made 4200 receipt update attempts plus
1400 shared-file writes with zero errors. Terminal processed/refused/uncertain
states and detail survived late writes. Two forced lost-temp ENOENT cases
re-read correctly (a stronger terminal result and a needed rewrite).
Classic Edge: one approval, one fictional -5 vote, then one reply; final
receipt accepted/applied, no lost approval, no leftover temp/lock files.

## bug 10-23 worker prompt/config retention

Prompts now have a deterministic private folder beside their own MCP config.
Reply finish (including error/timeout/start failure), detached child close,
job supervisor completion/restart/confirmed cancellation, and Continue close
remove only that run's prompt folder and config. Failed kills retain files.
On a new launch, prune matching prompt/config artifacts older than one day,
including old randomly named prompt folders; keep a verified live owner.
Logs, session history, unrelated files and the store root are untouched.
Cleanup errors are explicit (reply error/console or supervisor health/log).
Prove with fictional Temp files and real child processes, including a real
Copilot worker, without running tests or writing the real root.

## bug 10-23 E90: withdrawn change permission is visible before ok

Both React experiences project the current refusal reason on each pending
change, not only an executor's historic failure. Removing a deploy target
therefore explains on the card why it cannot be made; restoring it removes
that current-permission reason. Check only the selected changes in apply
before any PR/build/ring probe, and keep the executor's permission guard.
The existing exclude/reword/explicit-reconfirm path remains unchanged.
Prove removal after display, fresh and cached cards, zero preflight reads,
zero deploys/replies, and allowed permission still reaching preflight.

## bug 10-23 E88: large changing queues

ViewportList measures actual row heights, reserves scroll space, overscans
three rows, retains focused/open/edited rows, and exposes set size/position.
Small lists stay fully rendered. Resize/scroll range updates are scheduled
on an animation frame; synchronously feeding range changes back through a
layout effect could recurse when opening an offscreen card.
Classic keyboard navigation uses all server ids, not only mounted links.
Visit history is kept without rendering the queue twice on every poll.

The page query ingests once per valid fetch and avoids a redundant deep
comparison. Opt-in ETag deltas (four bounded server snapshots) carry changed
fields, grouped equal changes and referenced values. Unknown/evicted ETags
receive the existing full response; unchanged snapshots still return 304.
The original complete schema validates full pages. Delta shape, base,
references, new/replaced entities and every changed field are checked;
only unchanged, already-validated fields are reused. Clearing an optional
field replaces its entity so old draft/question data cannot survive omission.
No server root or action authorization changes.

Manual Edge proof: all 500 ids remain accessible; only visible/overscan and
retained rows mount. Focus and scroll survive updates; an offscreen private
edit survives scroll, j/k traverses unmounted items, direct A1499 opens its
latest card, and Find reaches A1488 while keeping the unsent row. Existing
visibility-based seen tracking observes actual mounted viewport rows.
Delta/full content equivalence (apart from request clocks), optional
clearing, additions, seven malformed-update refusals, 304 and full fallback
were inspected. The private Ask action still emits only Ask in both UIs.

Performance is improved but E88's strict arrival-to-commit <16ms budget is
NOT yet met consistently on the target PC. Baseline New 66-110ms / Classic
41-54ms; current measured viewport commit is about 4-6ms, full pipeline
typically 17-22ms / 15-20ms with slower cold updates. Do not call that a pass
or substitute the render-only measurement. Keep E88 open for further work.

## bug 10-23 E51: show complete reminder bounds and rotation

Reuse describe(a) (the exact sentence Classic already shows) as New row
context, and the existing projected automation.sentence in its opened body.
No clipping: max sends, end date, all texts and rotation stay visible at
400px too. No new controls, schema or scheduler behavior. Coordinator
reviewed PM/design in the existing session before implementation.

## bug 10-23 E50: code-like words are not typed commands

The shared forPage filter previously removed any quoted sentence containing
Q3, V2, E50 or an item code. Only suppress quoted command-shaped text with
an actual command verb and item prefix, or an explicit say/type/reply
instruction. Reminder/ask/draft quotes retain ordinary code-like words.
Prove tagged and Q3 reminder headlines in New and Classic, plus a quoted V2
work headline, and confirm real chat command hints are still hidden.

## bug 10-23 E38: waiting is not always someone else's move

The New empty Your move summary counts the server-provided next owner, not
the section name. Distinguish Delegate's work/retries, other people's steps,
and steps nobody owns; unknown ownership is simply waiting. Include retained
row revisions and bootstrap work. No workflow/placement rule is reimplemented
in the client. Prove nobody, Delegate retry, person, mixed and quiet stores in
real Edge at both widths; a nobody/retry-only store must never say it is
waiting on someone else.

## bug 10-23 E37: name what a not-ready check awaits

New's pending not_ready row now names blocker.waitFor (or the blocker reason
if absent) and the scheduled check time. It does not render the finite
transient/tool retry counter for this wait kind. Other retry kinds keep their
existing counter; paused/off scheduling gates stay unchanged. Prove a queued
build-991 wait in real Edge at 1280 light and 400 dark, with its exact next
check, plus the ordinary transient retry counter and Classic unchanged.

## bug 10-23 E35: first mobile row click must stay on its button

Focusing a New row revealed its previously display:none item code. At narrow
widths that added a heading line, moved Check again/Skip between pointer-down
and pointer-up, and cancelled the click. Reserve the code's space with
visibility:hidden; open/focused rows reveal it without moving controls.
Real Edge baseline reproduced zero mobile requests and working desktop.
Prove both first-click actions at 400 dark and 1280 light: one correct request,
retry marks promise pending, Skip clears it, no repeat chat message.

## bug 10-23 E18: private Ask owns its keyboard

The shared Ask field consumes Enter before either card shortcut sees it.
Ctrl/Command+Enter submits only Ask; single-line Classic also submits plain
Enter, while multiline New keeps plain Enter as a newline. Composition and
key repeat never submit. Card-level shortcuts also explicitly exclude Ask.
Prove with real Edge key presses in both experiences: one private question,
no approval/send request, no outgoing chat message, unchanged draft.

## bug 10-23 Windows worker command length

Every worker launch (reply, detached job and interactive continuation) writes
its complete prompt to a private run folder beside its MCP configuration.
Only a short file-reading instruction goes in argv. The new read permission
is the prompt folder alone, never the store root or another item's thread.
The normal read-only view/Read tool loads it on both supported agent flavors.
Remove the prompt and adjacent MCP configuration once the run ends;
continuation reads its saved CLI session rather than retained prompt files.
Prove on Windows with a real Copilot CLI worker, a fictional store, 4096-byte
profile/rules/index and a thread that would exceed the 32767-character limit.
Measured on this PC: original argv 74376 characters, file 74028 characters,
new argv 651 characters. Real installed CLI read the full file through view,
then submitted a needs_human report through the scoped worker MCP (exit 0).
No store-root permission and no send/change tool were granted.

## bug 10-23 E31: actionable work reports must wait for the owner

settle and the later no-response branch both ignored choices/effects when
there was no top-level reply/question. Share a hasDecisions predicate so
those reports stay needs_human and defer reported work closure. Choices
are a complete owner decision, not a reason to requeue the PR review job.
Preserve exact call/head fields inside option effects through the same
schema as top-level effects; the old option schema silently stripped them.

Picking a ready option prepares only its reply/effects, using the normal
carrier helper and keeping busy/shared-write gates. It sends nothing until
the explicit approval. Refused effects remain blocked with their reason.
Effect-only reports also receive an approval carrier; successful execution
without a reply rests/closes work instead of claiming a send failure.

Manual fictional proof in both Edge experiences: active work, schema-parsed
report with two options and no top-level reply/question, choices visible;
pick option 2, preview exactly its call and reply, one ok performs only its
effect then sends only its reply. No option-1 call/reply and no worker rerun.
Also prove no-decision reports still settle and effect-only reports need
approval but do not attempt an empty send. No tests or review chats.
Done and stale-queued review carriers were both covered. Preview made zero
calls/sends; an unapproved make_change was refused. Saved approval replays
returned the original receipt with no new answer/call/send; a fresh stale
submission was refused. Disabled write permission kept the chosen reply
blocked with its reason, rather than sending a claim about an unmade change.

## bug 10-23 vote-receipt-turn: external reset and fresh ask

Dispatch previously collected made markers from the reusable job result and
matched only the operation. A later ask could therefore inherit an older
vote's done time even though the live owner vote was reset to No vote.
Stamp server-owned effect provenance with the workflow/message turn(s) that
proposed it. Keep operation identity unchanged for write-ledger deduplication.
Reply redrafts retain only their own still-present same-proposal receipts;
never harvest done markers from an old job result. Votes additionally require
the fresh live vote and head to match under the existing sameVote policy
(negative votes are exact; positive approvals retain their existing equivalence).
Unknown live state grants no
completed vote marker. Job reports, options and promised-change proposals
also receive turn provenance; shared job results retain their parent turns.

Generic carryMarks never imports a vote's done marker from another list.
Other receipts/uncertainty transfer only within the same proposal. PR reads
clear stale vote receipts on the item and its carrier when a verified active
PR shows a different vote or reviewed head, including already-saved records.
Describe the newly pending change before the owner's next approval.
Historical logs/receipts remain unchanged.
Approval also rechecks completed vote receipts: an old Send-only approval
cannot silently become authorization to recast a reset vote. Clear the stale
receipt and show the newly required change for a fresh explicit approval.
Preflight blocks are recorded as refused outcomes, not successful actions.

Manual fictional proof: New vote (-5), external reset to 0, fresh tagged
Classic ask, pending new proposal, one ok casts -5 again exactly once and
sends one reply. A same-turn redraft with the live vote still -5 retains its
receipt and sends without another vote. Also cover same-turn reset, no-live
evidence and generic list adoption so they cannot resurrect old receipts.
No tests or new review chats; no real-root writes or real external calls.

## bug 10-23 row-entities: Done Q&amp;A and other message-derived rows

Grep found raw lastAsk, sent/owner reply, FYI line/gist, waiting message,
watch and work-summary text reaching shared row fields. Apply the
existing htmlToText once at those presentation boundaries, before clipping.
Done full sent text and its short quote are independently derived from raw
evidence; Catch up's already-decoded ask fallback is not decoded again.
Numbers fallback rows now inherit decoding from itemRows rather than applying
it a second time. Immutable per-send Numbers/exporter decoding stays as is.

Normalize read-only card asks/thread context for Classic row consumers, but
leave editable unsent drafts, pending reminder bodies, stored workflow/message text, ids, links,
commands, placement decisions and approval revisions unchanged. Next's row
previews, quotes, work facts and to-do labels are display-only copies.
Manual fictional proof checks today's New and React New/Classic at 1280
light and 400 dark for Done, Now, Catch up and Waiting, plus Numbers and
single decoding of amp;amp. No tests or new review chat.

## bug 10-23 E26/E27: answered recheck left queued work

The earlier recheck fallback treated even a complete reply/vote proposal as a
job handoff. A direct answer could then use a carrier still queued for work,
so the accepted page approval was refused as "still working on a new result".
Handoff only when the report carries neither reply nor proposed effects,
including contradictory reports that also name job. Keep the direct answer,
its sharing checks and the existing approval/execution path.

A fresh complete proposal supersedes unstarted work on its exclusive carrier;
clear that stale work queue/retry state, not the valid new-result guard at ok.
If another item still needs the queued work, use a separate changes carrier
without cancelling that review. Running work, executing changes and shared
pending changes keep their gates. Recover the already-saved regression at ok
only for a complete promised reply with no pending input and an exactly
matching effects list on the queued carrier.
Record the completed reply and its result time on reused/new carriers, so an
older no-reply verdict cannot suppress this newer turn's actual reply.

Manual fictional proof: an incomplete recheck resumes its original review
session once; a complete WaitingForAuthor vote/reply does not start a review
and one page ok casts the vote then sends one reply. Repeat with a stale
queued carrier and with a persisted refused-proposal shape. Verify genuine
pending/running work stays blocked and another item's queued review survives.
No tests, new review chats, real-root writes or real external calls.

## bug 10-23 H2: one-row middle-width header

The non-overlapping header fix wrapped at intermediate widths (99px high).
At 861-1200px compact the status and selectors instead: preserve every tab,
count, wordmark and existing action in one 56px desktop row. Healthy status
is a dot; warnings retain short non-colour wording. The full status/time and
machine are in its accessible name, native title and Radix hover/focus
tooltip; Escape dismisses the tooltip without starting an action.
Keep the existing narrow menu through 860px, full wording above 1200px,
and non-shrinking navigation with wrap as an exceptional-content safety net.
Scope layout rules under header-inner so Classic stays unchanged. PM/design
review used the existing coordinator session; no new chat or test. Manual
Edge proof sweeps every integer width 400-1440 in both themes, with healthy
and long stale status, plus representative controls and keyboard tooltips.

## bug 10-23 Numbers HTML in historical exchanges

Historical sent logs and saved thread text can contain HTML/entity spellings.
Numbers' immutable send context and fallback item rows now expose plain ask
and sent text, shared by today's page and both React experiences. The feedback
exporter's quoted corrections and fact extraction use the same conversion.
Keep raw logs/lessons, case identity hashes, counts and exact source links.

Extend the existing htmlToText: strip tags first, then decode once. Decode
decimal/hex numeric Unicode scalars and common Teams named entities; preserve
unknown names and invalid/out-of-range/surrogate numeric entities. A decoded
lt stays text, never markup. Preserve ordinary less-than/greater-than text.
No new dependency or lockfile change. Manual fictional proof covers Numbers
in all three versions, raw and thread-derived asks, edited sent words,
exported correction notes/facts and unchanged source ids. No tests.

## bug 10-23 E26/E27: fresh PR review after an excluded vote

A reply report could say a fresh review was ready without reporting job.
Only report.job resumed the completed PR session. For an incomplete recheck
without a reply or proposed effects,
a pr_review classification and one unambiguous PR matching this item's
completed/failed review now resume that job with the new ask, including
after a done item detached its job. No status-only or unrelated ask is
routed this way. A new review starts a fresh turn, withdrawing earlier
votes and stale refusal to-dos, including failed or excluded votes, but
preserving kept promises, unresolved non-vote writes and their gates.

The observed missing vote was not an exclusion veto: the report spelled
call.tool as tool:action, which the exact allow-list correctly rejected.
Normalize that spelling only when its suffix matches args.action, before
the existing allow-list, forbidden-operation, PR-target and head checks.
Conflicting suffixes remain refused. Clarify the worker prompt and schema.
New reports do not inherit off/error marks from earlier votes.

Manual proof on fictional stores with a stub PR probe: a fresh inbound
resumes the completed session, receives a new review result and offers one
Approved vote in both experiences. Nothing changes or sends before ok;
one ok makes only that vote, then sends the reply. An excluded/failed prior
vote does not veto the fresh proposal. Keep unrelated asks, stale-head and
disallowed-call gates, and no-reply verdict safety. No tests or review chats.

## bug 10-23 Y2: Numbers group heading capitals

New's 4-week reply groups rendered mixed case instead of today's capitals.
Apply text-transform: uppercase only to section-h inside new-numbers.
Keep source strings, counts, links and Classic styles unchanged. Manual
Edge at 1280 light and 400 dark confirms all three groups render uppercase.
H1 remains fixed by a6b8b19; no header change. No tests or review chats.

## bug 10-23 sent-ask-identity

send previously logged askAtOf, which returns the first owned inbound after
the latest owner message. Page sends need not be echoed into the saved thread,
so later turns kept that first askAt. Immediately before sending, capture the
latest owned non-owner inbound from the workflow's asker and log both its
askAt and askMsgId. Other participants and newer unowned context are excluded.
Retain the id in slim Numbers events (still no words/names), prefer it in
Numbers and the correction exporter, and preserve askAt fallback for old
records. Never rewrite old log lines/week files. Manual three-turn/three-send
proof on one fictional item checks raw events, Numbers asks and exported links.
No tests, typechecks or new review chats.

## bug 10-23 stale-draft-new-turn (P0 E26)

Reproduced in Edge: finishWork with needs_human, effects [] and no reply kept
the preceding Acme draft; New and Classic offered enabled Send. Reopen now
uses newTurn, which also clears edited-send learning state. Starting a job
withdraws a reply draft. applyReport and finishWork always replace absent
reply with no draft, including early return/settlement paths.
Shared currentDraft rejects an already-saved prior draft when the current
completed work verdict has no reply. Completed results get an immutable at
timestamp; only legacy results fall back to updatedAt and matching verdict.
Shared view and direct-send/page guards use that predicate. Page revisions
include revAt so even unchanged words cannot reuse approval from an older
turn. Project a no-reply verdict into the existing attention/status block.
Manual proof: both Edge cards, old captured intent and queued approval
refusal, already-saved bad record defense, and normal current sends. No
tests/typechecks, new review chats, owner config or real external writes.

## bug 10-23 correction-export-identity

Several edits on one code/day exported the same id and the newest inbound
link. Derive deterministic event-specific ids from recorded time, machine
and correction/send identity. Resolve the original inbound from its matched
sent log and retained thread (shared sendContext), never current lastMsgId.
New lessons retain send/ask ids and askAt; old lessons match raw send evidence.
Unavailable or ambiguous original evidence is reported and skipped.
Merge deduplicates within a batch and across reruns. Unambiguously matched
legacy ids/links are migrated without changing hand-labelled expectations.
Manual export of five fictional corrections verifies stable unique ids,
five original inbound links, zero additions on rerun and preserved labels.

## bug 10-23 counted-send-context

Numbers previously grouped repeated item codes and resolved one mutable
workflow row, losing sent words after a newer inbound. Keep all numeric
definitions/codes unchanged; add parallel presentation keys for counted
send lists. Each stable send key resolves its own raw sent log and original
thread context, never current lastAsk/draft/sent. Both React experiences
and today's shared Numbers renderer use the keys; Done is unchanged.
Slim week files remain text-free. Missing/redacted words stay unavailable,
not replaced with current words. Historical entries have no mutable actions.
Manual Edge verifies five edited sends, five distinct original asks/source
links, preserved counts and no newer-unsent substitution.

## bug 10-23 header-overlap

New's desktop nav could shrink below its links' intrinsic width while the
status and selectors stayed fixed, causing overlap at 861-1100 pixels.
Like Classic, preserve the nav's intrinsic width and allow the header items
to wrap instead of painting over tabs. Let header height grow, including
narrow layouts; position the menu below the actual header. No controls are
removed. Manual Edge geometry across 400..1440, especially 861/900/1024/1100,
in light/dark with both Checked and long Not checked since statuses.

## bug 10-23 source-session-lost: one fresh MCP connection

McpClient call and texts share a single bounded session-recovery path. MCP
error code -32001, or an error containing -32001 / Session not found, closes
the old SDK client and retries the same tool and arguments once on a new
stdio connection. Tool-error results are checked before output truncation.
The second failure is returned normally; unrelated errors never retry and
successful results retain their existing parsing. Concurrent old failures
cannot close a replacement client. No general transport/timeout retry loop.
Manual stdio proof records connection starts, calls, shutdown and terminal
failure counts, for both call and texts. No tests or typecheck.

## bug 10-23 X6/X7: Ask and Numbers wording

Name New Done's Ask field with its actual row code, retaining the same
Field key/id and action input. Rename both Numbers selectors to Window;
remove Classic's caption period (New already has no period). Manual Edge
at both requested sizes checks code-specific fields on different reply
rows, Ask more focus, both window selectors and unchanged window queries.
No tests or typecheck.

## bug 10-23 X5: New keyboard help is shortcut-only

The verifier confirmed today's New Now footer has no Keyboard shortcuts
button; the latest coordinator direction reverses the E96 addition. Remove
only New's footer opener and its now-unused focus fallback selector. Keep
the complete d184fef list and ? handler, modal key guard, Close/Escape and
prior-focus/main restoration. Classic is unchanged. Manual Edge at both
requested sizes verifies quiet-footer controls, list contents and focus.

## bug 10-23 X1: no problems banner on New Numbers

Verifier 6443019 corrected the earlier N4 scope: today's Numbers summary
and counted lists have no problems banner. Exclude only the shared Problems
component when the New screen is Numbers. Keep it on the other tabs, and
keep Numbers loading/transport errors and header status untouched.
Manual Edge at 1280 light and 400 dark checks summary/lists and banner
retention on Now, Done and Settings. No tests or typecheck.

## bug 10-23 E08: Check now in New Settings

Baseline comparison: all 25 setting rows were present, but New lacked both
Check now controls and the complete conditional Details runner/log panel.
Extract Classic's retry control into a shared single-action helper, showing
only the retry-source result under row:retry. Insert beside pollIdle Save
and in More > Details > Runner; retain the legacy status placement under
pollIdle (Runner is button-only). Details uses existing snapshot data gated
by Show details and precedes Changed by setup. Log wraps at narrow widths.
No runner/protocol changes. Audit regular/advanced rows, saves, switches,
habit actions, rule removal, navigation, model usage and setup-only values
against today's New. Manual Edge must trigger actual isolated demo-source
cycles from both locations at both sizes, not merely accept an HTTP result.

## bug 10-23 worker-catalog

Copilot workers disable built-in MCP servers and clean inherited built-in
GitHub/MCP-app/feature-experiment flags, while preserving COPILOT_HOME.
Reply and Ask runs with no report and a new "MCP tool catalog changed" log
entry get at most one fresh-session retry. Inspect only log bytes appended
by that attempt so an old error cannot trigger a new retry. Existing or
salvaged reports prevent a retry. Each actual run counts against the daily
cap; exhausted caps and retry decisions are logged. Recheck owner/window
and pending-work gates before retrying. Ask retries do not replace a job's
session. No prompt tells the AI how to recover; this bounded gate is code.
Build and one real CLI worker on isolated fictional data, no tests/global
Copilot changes. Operator E07 remains the real external-system proof.

## bug 10-23 worker-root-files

Copilot CLI 1.0.103 separates file-path access from tool permission. Workers
were told to read root profile.md/rules.md without a root path grant.
Include those files and the optional knowledge index directly in reply,
Ask and non-execution job prompts, capped at 4096 UTF-8 bytes per file with
an explicit truncation note. Missing files say none; unreadable files still
raise the normal start failure rather than silently losing owner rules.
Keep existing secret scrubbing. Do not add a root grant or allow-all-paths.
Build and manually inspect fictional prompt content, then use an isolated
real CLI worker when available; no tests or owner/global config changes.

## bug 10-22 summary-template correction: help-only parity

Revert 51f2aa1 as requested. Today's template is help-only, not a schedule
editor. Settings remains the one existing summaryAt setter; summary engine
code is unchanged. Preserve the shared picker's description and activated
chat-help wording, with no settings POST, config change or new automation
when clicked. Manual Edge compares today's description/help and verifies
New and Classic at desktop light and narrow dark. No tests edited or run.

## bug 10-22 G5: Holding reply row marker

Latest coordinator direction requires section 8a to demand a chip in this
exact location. It does not: 8a names goal-retry Holding reply, Send holding
reply and Retrying capability, not the duplicate Your move row marker.
Remove only the projection's extra chip. The headline already identifies
the holding reply; opened-card label, held draft, explicit send and retry
lines remain unchanged. This supersedes earlier section-7-based retention.
Manual proof at both sizes checks chip absence and holding/retry controls.

## bug 10-22 N8: Find names PR search

Repro: Find's placeholder and label omitted PR. Restore today's exact
"Find a person, chat, PR or number, or paste a Teams link" for both. Search
resolution is unchanged. Manually enter a fictional PR number and clear it
at desktop light and narrow dark.

## bug 10-22 N3: New Settings parity

Repro: New Settings added Reading and watches controls and omitted today's
AI-chat guidance; its Off label was rewritten by the React API. Remove only
the extra Settings group; preserve FYI Watch, automation-picker Watch
something, health actions when offered, and Classic reading controls.
Restore the exact guidance and stop overriding the server's original update
Off option. No settings behavior, parser or write path changes.

## bug 10-22 N2: Numbers Catch up controls

Repro: counted Catch up rows had only a source link. Resolve their real
activity entity from the existing normalized snapshot and render the same
New Entry used by Done, including Watch, Needs me and the exact watch gate.
Count-only/missing activity rows keep the existing read-only fallback; do not
invent action offers. Manual proof creates named watches and promotes named
FYIs from Numbers at desktop light and narrow dark.
The shared Entry also needs its existing new-done style scope; without that
scope the row loses its flex layout and concatenates its text. Preserve the
scope on the Numbers row and remove the outer double padding.

## bug 10-22 N4: problems on every New screen

Repro: a health problem appeared on Now but disappeared on Done, Numbers and
Settings. Extract the existing notice without changing actions or details,
then mount its single host in the New shell above the selected screen.
Manual proof covers Now, every Done filter, Numbers and all Settings anchors
at desktop light and narrow dark. Classic's separate banner stays unchanged.

## bug 10-22 C6: failed-job answer controls

Repro: failed jobs used Try again/Directions for trying again instead of
today's Your answer/Draft reply. Compare bindings: both use the answer verb
with the exact owner-entered text, not a special retry command. Restore the
labels and keep Skip's skip verb. Add an optional recovery flag to action data
so Classic Home/card keep recovery behavior without depending on a display
label. The separate stopped-work Try again command is unchanged. Manual
Edge exercises answer and skip on fictional failed jobs in both experiences.

## bug 10-22 C8: system-theme name

Repro: both headers named the system-following theme Auto. Share today's
theme-label values (same as your system, light, dark) in React's existing
interface model for visible text,
tooltip and accessible name. Theme storage and cycling are unchanged.
Manual proof cycles all three states in both experiences and verifies
system following with light/dark system emulation.

## bug 10-22 C5: feedback's accessible recipient

Repro: Done's Not right? buttons did not name the affected recipient.
All three shared Entry surfaces and Classic activity now use today's
"Tell Delegate the reply to <first name> was not right" accessible name,
with unchanged visible wording and feedback commands. Fall back to the plain
label when no person name exists. Verify row scope and feedback opening in
both experiences and sizes with fictional data.

## bug 10-22 C4: follow-up from Done

Repro: expand a sent reply with a private Ask thread; New lacked Classic's
Ask more controls. Add one per note only when that row's private ask editor
exists. It focuses the same row's editor without sending, respects busy/stale
blocking and leaves the existing explicit Ask action as the only submit.
Manual Edge follows through to a newly stored private question on that item.

## bug 10-22 C2: New reminder sheet controls

Repro: + Remind someone used generic selects/time input without quick people,
Back or today's Create automation label. Reuse OngoingSheet with direct
reminder entry, not a second implementation: quick people, Someone else,
time list, repeat buttons, Back to templates and exact preview. Scope its CSS
by the shared sheet class so it works in New. Its existing action identity,
recipient revision and double-submit gates remain unchanged. Close New's sheet
only after its own successful applied submission; retain edits on refusals or
when changed during submission. Route-driven creation uses the same single
sheet. Existing Classic entry remains unchanged. Manual Edge includes both
sizes, custom recipient, Back, every repeat choice and persisted reminders.

## bug 10-22 C3: problem report wording

Repro: Report a problem had no prompt placeholder and its submit repeated the
opener's label. Restore "What went wrong, and what should it have done?" and
"Send to the feedback log" in the shared form only; leave the action/opener
identity intact. Manual proof submits fictional reports from New and Classic,
checks their feedback-log entries and preserves blank-input gating.

## bug 10-22 E96/E97 (C9): keyboard help

Repro: New's quiet footer had no Keyboard shortcuts button and the key list
omitted working shortcuts. Add the coordinator-requested footer opener without
changing its other controls. List every implemented New shortcut. Capture the
opener, restore focus on Close/Escape (fallback to its replacement or main),
and ignore background keys while a modal is open. Manual Edge proof at
1280 light and 400 dark includes Close/Escape, question-mark entry and no
navigation/action from keys behind the dialog. No tests edited or run.

## bug 10-22 C1: New Catch up deadlines

Repro: Done > Catch up > Watch offered only a date input. Restore No date,
Today, Friday and Next week using Classic's fixed deadline helpers. Keep the
choice separate from its date and recalculate on submit, including Friday
meaning next Friday when already Friday. Existing exact watch approval,
cleared until text and deduplication remain unchanged. Build and manually
exercise each choice and create a watch in Edge; no test files or runs.

## G2 failed-job directions

Keep the exact runner-generated retry question only when the workflow status
starts with "The job did not finish:" and the question names that workflow's
own code with the exact generated sentence. Use today's forPage formatting for
that question and its question-row headline. Other hints, attention text and
AI-authored variants remain filtered. The existing answer and dismiss actions
retain their local, idempotent submission paths; neither sends a reply.

## G4 quiet New footer

Keep PageTools as the single sheet/result host, with a quiet presentation for
Now's reminder and report controls, named channels and child version/update
content. Resolve the selected sheet from all server page actions so route-opened
forms still work even when the visible control list is restricted.
Reading Pause/Resume, Check now, watch creation and watch-detail management
remain in Settings > Updates and system. FYI Watch remains on its row; Find
retains missed-message creation. No extra toolbar heading appears on Now.

## G6 Waiting row inspection

Waiting rows without a local primary action omit the redundant Open/Hide
control. Their existing row-title button retains keyboard activation and
aria-expanded, and opens/closes the same workflow or standalone card. Direct
local nudge/close actions remain unchanged. Empty control wrappers occupy no
layout space.

## G8 shared version identity

New and Classic use one version-label formatter: Version tag (code), or
Version code when there is no tag, omitted when code is unavailable. This
matches today's pages and uses the same server versionFor metadata, not the
React asset hash. Update-check controls and update state remain unchanged.

## Look lifecycle repair

Observe the stable New main root for lazy row mounts and removals. Schedule
geometry scans on DOM, scroll, resize and visibility changes; each row must
remain at least 25% visible for 1.5 seconds, measured against the smaller of
its height and the viewport for tall opened cards. Hidden tabs and leaving
the route cancel dwell. Saving retains the current look's chips; the next
look reads the latest ingested projection. React Classic's opened-card seen
mark is the designer's accepted intentional divergence from legacy Classic.

## Standalone placement cards

New standalone cards resolve entities from the placement subject's pinned
snapshot or the current entity store, not the workflow-only item selector.
Resolve placement, automation and offered actions from that same snapshot;
an incomplete offer shows the changed-item status instead of a partial card.

## Directional toggle gates

Reminder Pause/Resume binds the displayed automationApprovalRev; global
Pause/Resume binds the displayed status state. Refuse changed expectations
before resolving the current binding so a drawn Pause never becomes Resume.
Reminder queued commands retain the existing apply-time automation guard.
Keep absolute End/Stop and additive draft/Ask/report intents unchanged.

## E45 implementation decision

Keep exact raw to-do identities on the server-authored action's todoIds. The displayed
offer's expectation digests ids, text and kept-at timestamps, rather than
using a newest timestamp as identity. Its revision and expectation use that
digest; the engine receives the explicit identities, not a time cutoff.
Row bindings select the named oldest
task; card bindings select the listed tasks. Resolve only those bound ids
into the existing mark-todos page guard. New tasks may cause a refusal but
can never broaden a submitted action. Preserve the engine's doneTodos apply
step and chat/self-chat close semantics.

Classic Close and due-work Close use exact workflow expectations and are
unavailable while kept tasks remain, with a reason pointing to their listed
completion control. Keep Track, Wait and failed-job recovery unchanged.
Page results keep "stays open" as a standalone sentence without chat hints.
Classic Ongoing's existing action slot instead offers counted completion
with an exact list and confirmation naming all its texts, so to-do-only rows
remain actionable without adding a second navigation mechanism.

The separate draft-promise follow-up restores card.todos as optional item data for draft
promises; it is distinct from normalized kept todoIds. New renders the
warning before follow-up watching while the draft offers Send your version;
after sending, only the kept list remains. Classic's presenter is owned separately.
Draft promises participate in workflowApprovalRev so a changed warning refreshes
the card and invalidates both stale submissions and queued approvals.

M4b secondary-screen follow-up: Numbers retains supplied gist/work in its counted
lists. Done partitions pin-aware entries using the accumulating visit-stable New
id set, with keyed sibling entries so grouping never reparents an editor.
Grouped entry headings are h3 below h2 group labels; ungrouped/closed entries
remain h2. Find is the sole missed-message entry point. See
[the handoff](../reviews/react-parity-m4.md) for browser proofs and remaining
New-side ownership. The owner has reassigned this builder to React Classic.

## React Classic

Classic is a separate presentation under `src/web/react/classic/`. The React
entry defaults to New; `#classic/...` selects the in-app Classic shell without
changing the machine's `ui: react` choice or reloading the page. Returning to New
uses `#now`. Both experiences share the normalized store, revision pins, receipt
recovery and typed action gates.

The optional v1 `classic` page metadata projects the existing Classic view:
ordered Needs-you ids, Home tiles and Also-for-you tiles, Catch-up activity ids,
running work with bootstrap progress, ongoing work with check dates, and debug
runner details. Counts and membership stay on the server. Classic-only offered
action ids reuse existing continue/close/every/extend/ok verbs; the browser never
formats commands. Shared Done, Numbers, Settings and Knowledge retain one
implementation and adapt their navigation to the selected experience.

Classic uses server-derived done-by presets, item-scoped seen marks and a
visit-local focus queue. Home reuses the shared Done entry for Watch and Needs
me, including revision pins when freshness changes. Leaving New ends its look
session; switching experiences preserves the normalized store and unsent edits.
Offline is driven by browser connectivity as well as fetch errors, because a
paused query need not fail. A stable disabled fieldset blocks actions offline;
the direct Undo shortcut is gated too. Read-only snapshot routes expose no
executable item actions.

Browser validation completed on fictional temporary stores with real Chrome:
default New and both toggles; exact edited send and Undo; selected fact saving,
Edit and Skip; exact 120-minute watch tuning and seven-day extension; Got it and
isolated Stop; reminder Start/Pause/Resume/End and weekly creation without an
immediate send; watch creation with exact target, completion text, date and push
choice; progress Close, waiting draft/Dismiss and named-channel isolation;
bootstrap 1/2 progress; health retry without false recovery; missed-message and
feedback persistence; Settings persistence; exact Numbers list membership;
read-only snapshot and keyboard behavior; offline recovery; and a composing Home
watch input retaining its node, focus, selection and text while polling changes
freshness. Desktop 1280x800 and narrow 400x860 light/dark captures were inspected,
with no horizontal overflow or browser page errors.

Only `npm run build` was run per commit under the owner's current directive.
No test suite, typecheck pass, CI, push or publish was run for Classic.
The walkthrough scripts and stores are temporary/session-local, not committed
test coverage. The shared action/card implementation and its remaining New-side
work stay with the New builder.

### Classic visual fidelity follow-up

Merged the owner's `react-all` integration once before continuing. Home and the
Classic shell now use the legacy tokens, dimensions, compact needs previews,
sentence icons/emphasis, amber health treatment and short shared time formatter.
Knowledge membership comes from the server's pending-fact tile, not the total
normalized proposal count. The conditional destination is named To learn.

Keep the two independent selectors in the existing Menu: Experience changes
only the React route; App version retains the existing machine-version switch.
At 1100px and below the navigation also joins Menu, before it can overlap status.
The tile breakpoint remains 860px, and the 52px mobile header begins at 600px.
Compact Catch-up is an opt-in shared Entry presentation; other Entry callers
retain the default markup and action/revision implementation. Current server top
rows lead the list. An actively edited noncurrent row may remain, labelled as
retained, without contributing to the new count or remaining count.

Real Chrome comparison against the legacy renderer used identical fictional
temporary stores at 1280x800, 900x800 and 400x860 in both themes. Inspected paired
captures and checked actual header rectangles, not just document overflow.
All six combinations had no collision, overflow or page error. The long
table-shaped ask remained one clipped line; eight needs showed four avatar rows
and the correct remainder. Reviewed 1 PR had its original icon and emphasized
number. Amber backgrounds, header heights, desktop frame and 44px/36px needs
numbers matched. Catch-up top membership/order and its 4-new/1-more arithmetic
matched the legacy page exactly.

The same real-server walkthrough also proved background seen changes retain
the Watch editor's DOM node, focus, selection and words through composition
events; closing that editor removes the zero-new section. Mark all read applied
to four fresh updates. Applying the pending fact removed both To learn entries.
The relocated New/Classic selector retained an unsent reply edit, and the theme
button cycled Light/Dark/Auto/Light. These are session-only browser proofs, not
a committed test pass. The underlying visit timestamp remains New-owned.

### Classic supporting-screen implementation plan

Use dedicated Classic Done/ActivityRow presenters over useDoneEntries,
useDoneLook and useActivityCard. Keep stable activity-id siblings across grouping.
Extract Classic Why and conversation blocks from the accepted card and reuse
them for sent history; no complete New/Classic live card inside Done. Use the
displayed row's typed actions for Undo/feedback/watch and preserve newer/blocked
state, field focus/composition and private-answer updates.

Ongoing and its sheets, and Numbers/Settings/To learn are independent presentation
workstreams with separate files/CSS. Existing queries, validation, revision pins,
receipt gates and runner verbs remain shared. Classic.tsx alone selects the
Classic lazy screens; any shared metadata change must preserve New's copy.

Check each surface against identical fictional legacy/React stores, then against
an isolated owner-data copy with all browser write requests blocked and no AI or
runner dispatch. Capture desktop/narrow in both themes, prove typed actions only
in fictional stores, record each Classic Done/Missing cell, build and commit by
surface. Tests/typecheck/CI/publication remain deferred.

Done milestone evidence: paired Chrome captures at 1280/400 in light/dark;
empty, quiet-only, fresh-only, earlier-only and mixed lists; five typed action
families; exact replacement-send correction gate; retained DOM/focus/selection/
composition across an arriving fresh row. The accepted Needs-you walkthrough
still passes all 11 actions after extracting Why and private conversation.
The implementation review found two corrections, now browser-proven: keep shared
watchBy canonical ISO-date-or-empty across Home and Done (including successful
pin cleanup), and derive pending disclosure state from the same current private
notes rendered beside pinned historical sends. Current owner-copy verification
is read-only and remains a distinct acceptance step.

Supporting-screen integration is now browser-verified. Final paired fictional
captures cover seven supporting routes at 1280/400 in both themes. A fresh
fictional action walkthrough checks all four Numbers windows and every exact
grouped/deduplicated counted list, including actual DOM witnesses for both gist
and work (SC-265), source links and copied anonymous summary. Settings Save,
switch persistence, section draft retention and original fixed help pass.
To learn selected save, Edit/Skip, stale-save gate, pinned zero-live navigation
and saved-fact placement in Done/Learned pass. The creation alias opens the
Classic picker. Only presentation changed in the final correction: Home-only
footer, no Numbers health banner, success-colored meter, legacy tool typography
and narrow fact actions.

The final isolated owner-copy comparison produced 96 captures covering Home,
Needs you, Done All/Replies/Catch up, Ongoing, Numbers, loaded Settings, To learn
and picker/reminder/watch sheets at both widths/themes. Zero browser runtime
errors, horizontal overflows or attempted/dispatched browser writes. Finite
sheet animations are settled before capture. No live data mutations or AI.
Build passed; no repository tests, typecheck or CI were run for this milestone.

### Classic Needs-you implementation plan

Replace only Classic Focus's New ItemCard caller with a dedicated Classic Card,
porting legacy card sections and all five bodies into React. Reuse
useCardPresentation/useEdit/useShowLatest, ActionButton/ActionState and shared
browser-copy helpers. Extract the existing controlled card field/source helpers
for both renderers; preserve their focus/composition handlers unchanged.
No legacy HTML insertion, new runner command or duplicated approval engine.

Queue rows retain visit order but show server-current membership/counts and
Classic's compact toolbar. Its Previous/Next and keyboard use the same live
codes; handled rows remain explicitly selectable. Port scoped Classic CSS, not
global New classes. Restore the visible desktop machine-version selector and
move that control into Menu only at narrow widths. Compact Home activity omits
quoted asks; noncompact Done remains unchanged.

Build first, compare temporary-store legacy/React in real Chrome at desktop and
narrow in light/dark, then exercise exact edited send/Undo, selection/Other,
review exclusions, sources/Ask, stale typing, handled navigation and version
controls. No suites, typecheck, CI or committed tests during this milestone.

### Classic Needs-you browser acceptance

The milestone now uses a dedicated Classic card, not New's ItemCard layout.
Shared prerequisites are isolated in commit `9855e7d`; the Classic renderer and
rebuilt distribution follow separately. Both bounded implementation/diff
reviews closed their findings after corrections.

Real Chrome compared identical fictional stores at 1280×800 and 400×800, light
and dark. The queue is 272 px wide on desktop, hides below 960 px, clips its
preview to one line, and shows avatars, first names and codes. The pager is
28 px tall. The representative reply card measures 722.61 px versus Classic's
723.67 px on desktop, and 922.61 px versus 920.67 px on narrow. Message/draft/
metadata content, message background and card width match. All five card
families load, and version/status/theme controls do not overlap at 1280, 1100,
900 or 601 px. Home Catch-up retains title, summary and metadata without a
quoted ask.

Session-only browser walkthroughs submitted eleven typed actions through the
real server and runner to a fictional source. They checked exact edited send,
single-choice preview, Other and multi-choice routing, selected review changes,
private Ask click/Enter exactly once, and persisted due-work Wait/Close. A
separate walkthrough undid the exact send. No AI runs or external sends occurred.
Pinned edits retained DOM identity, focus, selection, composition and words
across a changed revision; stale sending was disabled. Current private answers
appeared without discarding the stale editor. Blank Other survived blur and
refresh. Missing entities retained their cached card/editor, while handled
navigation counted only live items. Review number keys, reply-only's edit gate,
Ask's focus indicator, declined version switching and the narrow version menu
were checked. New's extracted textarea retained its identity/focus/selection
across a revision and an experience roundtrip. No page errors were observed.

Only `npm run build` ran as the commit gate. Formal tests and typecheck remain
deferred by the owner's rebuild directive. This is fictional-store acceptance,
not a new owner-data comparison or live AI/source integration claim.

Status: M1, M2 and M3 complete. All four screens and supporting sheets are
implemented and browser-proven. The final M4 scenario inventory follows.
Status: React New implementation and its complete scenario inventory are done.
All four screens, current cards, supporting sheets and lifecycle actions have
fictional-store browser evidence. React Classic/toggle integration and the
owner's deferred formal-test phase are separate, not signed off here.
Schema version: 1.
Reviews: [spec](../reviews/react-spec.md), [action safety](../reviews/react-actions.md),
[UI and narrow safety follow-ups](../reviews/react-ui.md).

Current delivery rule (owner update at 11:37/11:47): build and verify features
in a real fictional-store browser. Per commit run build only. Tests and
typecheck return after parity in separate sessions; no CI or publication here.
The earlier full-run and mutation records below are historical evidence, not
instructions to repeat those checks.

## Goal and boundaries

Build the New experience beside the existing page, including the capabilities
currently reachable only from Classic. Keep one server, one runner, one approval
path and four tabs: Now, Done, Numbers, Settings. Do not migrate stored workflows.
The preview is opt-in per machine. Neither switching nor rendering sends a reply.
The existing page changes only to offer the three-version menu.

## Layers

Dependencies point downwards. Components use data hooks, never endpoints or
command strings. Data hooks use services and domain types. Services use domain
types. Domain code has no React, browser, filesystem or store imports.

| Layer | Responsibility |
| --- | --- |
| `src/web/react/components/ui` | Owned shadcn/Radix primitives |
| `src/web/react/features/*` | Screen and card parts; render data and emit intents |
| `src/web/react/data` | Query lifecycle, normalized Zustand entities, narrow selectors, revision-keyed interface state |
| `src/web/react/services` | Token-aware API client, edge parsing, action submission and result polling |
| `src/web/react/domain` | Serializable v1 contracts, ids, revisions, pure selectors |
| `src/web/react-api.ts` | Server projection and action registry using existing view, nextView and runner entry points |

The browser never calls whoseMove, decides eligibility, invents row actions or
formats commands. The server projects existing view data into the v1 envelope.
No imports from the old renderer. Server-only dependencies must not enter Vite.

## Store schema (designed before implementation)

All entity tables are `Record<Id, Entity>`; references are ids, not embedded copies.
Ids describe projection identity, not private storage ids. Text is plain text,
never trusted HTML. Missing optional fields mean unavailable, not fabricated.

| Table | Fields |
| --- | --- |
| items | id/code, rev, kind, personId?, chatId?, at, ask?, thread (who, text, at, owner), question?, status, newCount, earlier?, before?, draftId?, changeIds, workId?, todoIds, sourceIds, noteIds, actionIds, teams?, openOn?, context, choices?, picked?, meeting?, promise?, follow?, debug?, why (reason?, confidence?, gaps, searched?), job?, replyOnlyActionId?, reviewAgainActionId? |
| people | id, name, initials, hue |
| chats | id, name, group, guests |
| drafts | id, itemId, rev, text, commitment, preview, holding? |
| changes | id, itemId, rev, n, summary, target, system, action, detail?, meaning?, state (`proposed`, `approved`, `made`, `uncertain`, `left-out`) |
| work | id, itemId, goal, next?, waiting?, due, proposed, home?, stepIds, planIds, reportActionId?, yours (what, check?), then (owner, what, you?), total, happened |
| planSteps | id, workId, position, what, owner, done, now?, where?, build? |
| workSteps | id, workId, at, what, news |
| todos | id, itemId, code, text, at, done |
| sources | id, itemId, kind, label, href?, stale?, locked? |
| notes | id, itemId, at, question, answer?, sourceIds |
| doneEntries | id, code, kind, personId, sentence, at, by, ask?, said?, text?, teams?, href?, undoUntil?, work?, high?, inTeams?, gist?, watch?, watchedAs?, own?, rule?, fresh?, noteIds, sourceIds, why?, msgs |
| watches | id/code, what, last, changedAt?, update, rev, every?, endsAt?, by?, nextAt?, from?, actionIds |
| automations | id/code, sentence, to, text, when, state, why?, next?, count, rev, actionIds |
| knowledgeProposals | id/code, rev, topic, home, factIds, actionIds |
| facts | id, proposalId, type, text, who?, date, href?, private |
| placements | id/homeCode, itemId/act, section, rule, position, kind, headline, facts (who?, where?, at, verb?, quote?, notes?, until?, also?, promise?), next (owner, what?, at?)?, warn?, chips, rowRev?, teams?, gist?, fresh?, when?, msgs, subjects, personId?, workId?, todoIds, actionIds |
| actions | id, subjectId, rev, kind, label, staleness (exact/none), effect (sends/changes-system/local), expect?, needsConfirm?, meaning?, input? |
| health | id/key, text, since, actionIds |
| channels | id, name, link, actionIds |
| waiting | id/code, to, chat, text, at, link?, actionIds |

Page metadata contains schemaVersion, fetchedAt, owner, serverNow, seen,
sectionOrder and ordered placement ids, summary (off, paused, minute, handled,
catchup count/worth), status, tiles, also, details, catchUp.top, running, progress,
people (reminder recipients), ui (including noted), version (including checkedAt)
and settings. Person ids use projected subject/asker identity, not a name. Numbers remains a
separate query keyed by window; its rows use the same Done presentation.

The current projection cannot prove every effect's execution state. Only
pending changes from ItemCard are `proposed`; never infer `made` from a sent reply.
Unknown outcome remains `uncertain`. The durable call ledger stays on the server.

Zustand holds these normalized projections for selection, plus interface state:
route, find, sheet and `byRevision[code@rev]` containing editText?, answerText?,
askText?, reportText?, selectedOptions, excludedChanges, folds, pendingIds?,
result?. No result or edited draft is keyed by code alone. TanStack Query owns
fetches, retries, polling, structural sharing and invalidation; the normalized
store is a selector index of the latest successful query, not another cache.
Polling failures retain the last view with an explicit error and retry button. The normalized tables are an index of the query snapshot; no
independent fetch or stale-time policy exists in Zustand.

Dirty or pending cards pin their displayed entity snapshot and revision. A newer
fetch shows "Newer version available" without replacing the fields. Show new
version confirms discarding unsent text. Once accepted, the new revision never
inherits old text, folds or results. Pinning is tested during IME and pending
actions, not just on identical refresh data.

## One item, end to end

1. A token-authenticated fetch gets schema v1 from existing view and nextView.
2. Edge validation rejects an incompatible response visibly. Successful fetches
   normalize atomically, retaining equal entities so unchanged rows do not render.
3. useNowSections returns server-ordered placement ids. A memoized row selects
   one entity. Open changes only the interface route and records seen.
4. useItemCard resolves linked entities. Card parts remain replaceable; the
   unapproved redesign does not ship. Native text inputs stay mounted across
   refresh, including selection and IME composition.
5. A button emits `{submissionId, action, item, rev, expect?, input?}`. The server validates the offered
   action against a fresh projection, validates input and rejects a stale revision
   before enqueuing a structured existing runner answer. Free text is never
   concatenated into parseVerbs: a shared structured enqueue entry point preserves
   one subject and the exact text. Chat parsing remains in the chat entry point.
   Change meaning is visible before ok. Manual Undo eligibility matches the
   runner and refuses expired windows before queuing.
6. Accepted ids are polled, never resubmitted. Pending is not success. Applied
   results invalidate data; refusal is visible; timeout offers Check again, not
   another send. Results remain attached to the submitted revision. Each click
   has one UUID submissionId persisted in browser session storage until resolved,
   with its receipt persisted on the server and de-duplicated on the
   server. A lost response says "Not sure it went through. Checking..." and looks
   up that receipt; sending stays disabled, including after reload, until known.
7. Undo is offered for every server-advertised unexpired send, including manual
   sends. It never claims to reverse effects already made.

### Versioned API contract (M2 gate)

- GET /api/v1/page: normalized Snapshot v1, no executable command strings.
- POST /api/v1/actions: maximum 20 KB, strict discriminated input. Text is a
  separate field; picks/exclusions are bounded arrays of offered numbers.
  Edited replies plus excluded changes are explicitly refused, matching today.
- GET /api/v1/result?submission=: accepted ids and current result, or unknown.
- GET /api/v1/numbers?window=: existing counted rows and totals.
- Status: 202 accepted with ids, 200 immediate result (including no-id actions),
  409 stale, 410 no longer offered, 422 invalid input. Unknown outcome is not
  represented as successful or refused.
- exact staleness for approvals, send/edit, pick and undo; none for read, Later,
  Pause and non-destructive navigation. Workflow revisions are canonical SHA-256
  approval digests over lifecycle, conversation, draft, ordered stable change and
  option identities/meaning, sent message, open to-dos and actionable work. Logs,
  status and housekeeping timestamps do not change editor identity. Automation
  and proposal approvals use equivalent content-derived digests. The existing
  revAt timestamp is separately carried to the older runner gate.
- The same approval precondition is rechecked at apply before positional choice/
  exclusion mapping or the legacy correction path. Undo binds the sent-message
  identity; Mark done carries exactly the shown to-do ids. Row presentation
  timestamps remain separate; the newest shown to-do time is its selection bound.
- Waiting entries have no approval revision today: their follow-up/dismiss
  actions use staleness none, and only draft or remove the waiting record.
- Registry also covers health, update, report, missed, watch/unwatch, automation,
  first-time note and mark-read. No component formats a command.
- Tests inject literal ", ok A9" into edits, answers, reports and note reuse:
  exactly one structured answer must retain the full text on the intended item.
- Tests drop an accepted response, reload and double-submit one submissionId:
  one answer only, with the original receipt recoverable.

## Growth

- New kind: add server projection and a registered body component; shared header,
  Why, sources, actions and Ask remain unchanged.
- New section: add server section metadata; generic section iteration needs no
  placement rules in the browser.
- New screen: add a lazy module and navigation entry, with a query/resolver.
- New action: add server registry entry and typed input contract; components
  render offered action data rather than format another command.
- Additive v1 fields remain compatible. Breaking changes get a new API version.

## Build and validation

Vite emits self-contained assets to dist/web-react; scripts/build.ts includes
them in INTEGRITY. Runtime needs no dev dependencies. Serve only manifest-owned
assets with the existing token and localhost checks; no arbitrary path reads.
All asset requests retain ?t, including cold lazy imports and preload CSS; a
fixture browser test is the gate for the chosen manifest-owned URL rewriting.
The preview has its own CSP; external links use no-referrer and allowed schemes.
Missing chunks after an update offer Reload without discarding unsent edits.
When version.code changes, proactively reload only when there is no unsent or
pending work. Otherwise disclose the update and let the owner reload later.
Heavy screens load lazily. Typecheck covers both pages; old page goldens stay
unchanged except for the menu. Fixture servers use temporary stores only.

Milestone gates: targeted red/green behavior tests, mutation checks, typecheck,
build/integrity checks, publish cleanliness, full suite once before commit,
separate-session review and inspected desktop/mobile light/dark screenshots.
Measure a 500-row update in a production browser; report the timing and method,
not just a threshold assertion. No real-owner data is needed or accessed.

## Decisions

- bug 10-22 catchup-row-controls (owner, 0.2.1): a row's interactive controls
  must never become its surrounding Teams navigation. Explicitly isolate
  buttons, watch fields, labels and local disclosures at the React Catch up
  article boundary, after each control runs its own handler. Preserve native
  form defaults; prevent control-zone anchor defaults only if an
  enclosing link exists. Use the original event path even when a control
  removes itself during its handler. The ordinary source anchor is untouched.
  Apply the shared boundary to Classic Done/Numbers, Classic Home's compact
  rows and New Done/Now. No new hover text: today's Watch and Needs me have no
  title/aria-description. Initial standalone legacy/React checks did not
  reproduce the owner's runtime; verify the explicit boundary with a
  surrounding navigation listener as well as ordinary links, rather than
  claiming that baseline reproduction. Manual Edge acceptance1280light and
  400dark: Watch saves exactly one tracker, Needs me moves its item to
  Needs you/Your move, neither opens Teams, and the body link still does.
  Fictional store/effects only; no tests or changes to runner verbs.
  Before/after scope: standalone baseline passed; with a surrounding
  navigation listener, the old Watch opened both its form and a Teams tab.
  The fixed bundle isolates all controls at both sizes in all four React
  surfaces, with zero ancestor activations and one explicit source tab.
  Mark the controls zone too: disabled buttons use pointer-events:none and
  must not turn a click through their footprint into row navigation.
  A containing-anchor check preserves Watch but cancels its link default;
  a native submit inside a row still submits once.

- bug 10-22 E16.classic.invite-attendees (R2): the meeting strip reduced
  attendee identities to three decorative, aria-hidden initials. Show every
  attendee label from the existing meeting projection (names and emails as
  supplied), like New, beneath the meeting time with an Attendees label.
  Keep the Classic avatar stack decorative; do not limit the identity list
  to its first three people. Wrap long names/emails at narrow widths. Visible
  text is preferable to initials or hover-only titles, which cannot identify
  invitees reliably on touch or for assistive technology. No new lookup,
  recipient inference, change payload or approval behavior.
  Manual Edge acceptance: fictional invite proposal, 1280 light and 400 dark,
  same-initial names and a fourth invitee all readable before approval;
  names remain visible when the selectable change is toggled, zero effects.
  Build only; no tests. Keep the separately held E57 patch out of this commit.

- bug 10-22 E12.real-g1-unrelated-owner-post-not-a-reply (R2): an owner FYI
  closed an unrelated room ask merely because it named the asker. Neither a
  name mention, one open item, nor a 1:1 message proves an answer. Preserve
  Teams reply-to/messageReference and Skype quote target IDs: a link to the
  item's ask is evidence. Otherwise classify the owner's new words against
  all open asks and their context in one read-only AI run; only explicitly
  selected item IDs may close. Quoted old words are not a new answer.
  Use the same check during intake and immediately before approving/sending.
  Persist the per-item verdict with the owner message and the ask ID so the
  pre-send check can reuse it but cannot apply it to a newer ask. An unrelated
  owner post must not reset the ask's age. Failed/invalid AI judgments surface
  health and hold sends; they never mean "already replied" or permission to
  duplicate a possibly real reply. True contextual and linked replies still
  close their items, not other asks. Build plus manual New/Classic 1280 proof
  on a fictional root with isolated real CLI; no tests.
  Proof: the real CLI rejected the named-room FYI and unrelated 1:1 FYI,
  leaving all asks and their original ask times intact. A contextual answer
  closed only the ownership ask; a Teams messageReference closed the date
  ask with no extra AI run. Both experiences show the true replies in Done.
  Before Send, an unread unrelated FYI allowed one exact approved reply;
  an unread genuine owner answer closed as replied with zero duplicate
  sends. An unavailable judgment CLI held the reply with visible health,
  not a false answered state. COPILOT_HOME and both XDG homes isolated;
  zero new owner session entries.

- bug 10-22 E24.real-literal-not-learned-as-facts (R2): edited sends remain
  literal messages, not commands or factual evidence for item-code topics.
  Skip learning inputs that contain A/K/R/H item codes or parsed controls;
  log why. Carry the original sent text/source on learning jobs; recheck it
  at report acceptance (including old jobs), reject code/control claims and
  bind accepted facts to the actual send, not an AI-invented citation.
  The learning playbook permits descriptive facts only, never instructions,
  quoted examples, requests or to-dos. Legitimate factual corrections remain.
  On successful reply Undo, durably mark its source withdrawn, remove that
  source from personal/team knowledge and proposal rows, and retire only
  entries with no independent source left. Preserve other sources and facts,
  including the owner's unrelated Markdown notes. Late learning/bootstrap
  reports cannot recreate a withdrawn-source fact. Knowledge Undo must not
  restore a withdrawn source from an older entry. Failed message withdrawal
  leaves knowledge intact. Build and manual fictional-root/real-CLI proof;
  no tests or changes to the literal-send control parser.
  Proof: New/Classic 1280 sent the literal text exactly with zero learning
  jobs and no control state change. Real isolated CLI learned a Thursday
  factual correction but no claim from an instruction-only send. Undo of
  the literal send removed seeded pre-fix A999/R999 facts; Undo of the factual
  send removed its learned fact. A two-source fact kept its independent
  source. Both Done views show only that supported fact after withdrawal.
  A late source report cannot revive the pollution; personal/team withdrawal
  also preserves unrelated Markdown notes. Zero new owner session entries.

- bug 10-22 E25.classic.real-unchanged-signed (R2): the projection already
  carries the exact approved sendText, including the configured signature,
  separately from the editable raw draft. Classic must display sendText when
  present, just as React New does. Keep the raw text for editing: owner-written
  words are deliberately not auto-signed. Do not format or append signatures
  in the browser. Ranked cases: signed AI draft, explicit ok, already-signed
  draft (one signature), signing disabled, owner edit (no signature added).
  Alternatives were browser-side signing (duplicates server policy) or raw
  preview (hides part of the approved send). Use the existing canonical field;
  this is an approved parity repair, with no new layout or action.
  Manual Edge acceptance at 1280 light and 400 dark: preview equals the actual
  sent text byte for byte, including its signature; one ok sends it once.
  Build only, no tests or shared engine changes.

- L7b (SEND): the shared sender formatter strips every trailing copy of the
  configured, first-name-expanded signature/automated marker before appending
  exactly one canonical suffix. Matching is case-insensitive and ignores trailing
  whitespace; markers inside the reply body are unchanged. Owner/rule replies,
  acknowledgements, scheduled automations and withdrawal text share this formatter.
  Owner edits, literal replies and corrections still do not gain a signature,
  but a suffix already present in their text is normalized the same way. The
  correction ledger stores the exact normalized text sent. New owns the editor's
  separate muted suffix preview; no browser or projection change is needed here.

- R12a foundation (slice 2, not the full authorization rollout): `core/limits.ts`
  is the ordered A10 catalog for the limits card, including guests/outside people
  and the assertion that no capability names a complete/merge/abandon/delete,
  reviewer/branch-change, deploy or release action. `productLimits` supplies the
  page copy with the effective hourly cap. The product ceiling is three automatic
  messages per chat per hour; configuration may lower it, including to zero,
  never raise it. Invalid stored values read as zero, without throwing in the
  runner or a page build, and emit one shape-only warning per process. Settings
  rejects writes outside the whole-number range zero to three; code-owned writers
  use the strict `checkHourlyCap` validator, not the tolerant read helper. Reply
  decisions, their runner policy context and scheduled automations share the cap.
  R12a 2/3 routes automatic replies, acknowledgments, standing sends and final
  engine-comment permission through `authorize`; reasons include `blockedBy`
  only for automatic actions. Owner-approved sends retain the earlier guards,
  with no new never-list, guest/outside or cap hold. Outgoing text and tool
  arguments use the shared secret scrubbers. `approvedReplyText` scrubs before
  page approval hashes are built, so removing a secret does not make an
  otherwise unchanged owner Send fail its approved-text digest check.
  The strictest matching grant wins: draft = shortcut > ignore > ack > send.
  Review is its own PR lane: send/ack never match a PR review, and matching
  draft/shortcut/ignore beats review. Named people beat a group on equal kinds;
  read-back conflict detection remains separate from this runtime winner.
  Newly supported widening group grants stay inert until 3/3 gives them the
  per-line confirmation lifecycle; existing review groups and narrowing
  draft/shortcut groups can use verified internal membership.
  Trusted guest/external roles or a differing member tenant identify outside
  IDs in the optional cached `outside` field. Neither names nor domains count.
  Existing caches without that field are re-read; a failed read clears their
  old safe-guest result. The Teams factory accepts owner ID as a fourth argument,
  required from HOST's `sourceFor` call to compare tenant IDs; absent owner
  tenant evidence stays unknown and automatic sends wait.
  Compile lifecycle and usage counts follow in R12a 3/3; the catalog is not yet
  a new UI.

- R28 contract: `src/core/ways.ts` is the SEND-owned boundary for the rule page.
  `wayLines(store, cfg)` and `suggestions(store)` are read-only; readBack is an
  exact three-string tuple built in code, never composed in React. Writers take
  Store first; all existing-line/suggestion mutations require the snapshot's
  textHash, including Off, Delete, Undo and answering an unclear line. A stale
  hash returns `This line changed; your text is kept`. Confirm is the sole
  widening-grant activation action. These functions currently throw `not yet`;
  no runtime route calls them until the engine implementation is complete.
  PE's contract correction adds the Reading status (switch disabled, no timing
  promise, empty third read-back line), returned immediately by add/edit and
  an on-switch awaiting compilation, plus owner/learned/setting source chips.
  Suggestions expose at most one open card and the dated not-now/never history;
  accepting carries the owner's edited text. Dismiss, six-second Undo and
  Reconsider remain engine verbs; HOST owns the 14/60-day timers. `needsHim`
  owns the nav count: waiting confirmations, unclear lines, drift prompts and
  an open suggestion. `limitsCard(cfg)` owns effective-policy lookup for the
  limits card, including safe handling of an invalid stored cap.

- bug 10-22 E13.classic.real-answer-preview-send (R3): the server already
  supplies a question type, answer action and optional placeholder draft.
  Match today's Classic question body: always show Your answer; do not show
  that placeholder as Your reply or offer Edit reply on a question. Ranked
  cases: question with placeholder, question without draft, answer-to-preview,
  explicit ok, reopened question, failed-job directions, choices and reviews.
  Keeping the placeholder beside the field or treating it as an editable reply
  would differ from today's question card. Retain the existing answer/preview
  action gate, not a second send path. A successful old Current item fallback
  receipt must not describe a reopened question as skipped: show today's
  "Nothing is sent yet. You will see the reply first." guidance when its
  revision is obsolete. Preserve actual refusal/uncertainty and receipt data.
  This is the coordinator's approved parity repair, not a new UI design.
  Manual Edge acceptance: fictional roots, 1280 light and 400 dark, answer
  produces a preview with zero sends; one ok sends the exact preview once.
  Both Done rows independently show that preview. Replaying the same saved
  submission keeps one send; a new submission using the old ok gets 410,
  and another apply pass still leaves one send. The dismissed/reopened
  question reproduces the old Skipped fallback and now shows the guidance.
  Build only; no tests or shared engine/API changes.

- bug 10-22 E55.classic.owner-active-held-time: a due scheduled reply held
  by recent owner activity showed its correct Held status but still claimed
  Sends at a past time. Today's Classic shows the held status, not a send-time
  promise. When running-row detail starts with Held:, suppress the scheduled
  time sentence and do not fall back to a work-progress bar. Keep the existing
  held explanation, rule/text headline and Hold action. Unheld scheduled rows
  retain their send time. Manual Edge 1280 light/400 dark from real dueSends
  with ownerLastAt one minute ago and Available presence: scheduled retained,
  zero sends. Presentation only; no runner/projection changes or tests.

- bug 10-22 E49.classic.promised-checkback-stop: In-progress rows projected
  the existing stop-watch action but filtered it out before RowActions, leaving
  only Close/Mark to-dos done. Include stop-watch beside classic-close, retaining
  the existing ghost styling and classic-extend Timing action. Stop uses the
  shared unwatch verb, not Skip/Close. Manual Edge 1280 light and 400 dark on
  fictional open work: Stop ends only its check-back, clears scheduling, leaves
  work and owner to-dos open and the original sent reply intact; zero sends.
  No runner/projection changes or new layout. Build only, no tests.

- bug 10-22 E88.classic.viewport-integration: shared ViewportList integration
  replaced the Classic-only queue, losing narrow unmounting/memoized links.
  Its document-scrolling target was also reset by Classic route scroll, leaving
  direct A599's queue link far below the viewport. Restore media gating at
  960px and memoized QueueItem on top of the shared ViewportList, not another
  window. Add an opt-in scrollable mode to ViewportList using its own list
  scrollTop/clientHeight and nearest-target scrolling; existing document-list
  callers keep their behavior. Remove old fixed row heights; shared measured
  row sizes plus gap govern offsets. Preserve pins and visit snapshot cache.
  Manual 500-row Edge at 1280 light/400 dark: direct A599, keys/pager, scroll,
  pin/latest edits and handled/removed visited fallback. Report measured redraw
  ms explicitly; no tests, test-file edits or typecheck.
  Observed native polling ingest-mark to DOM: desktop 7.2/7.0/5.2 ms; narrow
  11.8 ms. JSON decode 2.3-5.6 ms and validation 11.0-14.3 ms are separate,
  so do not claim whole data-arrival-to-DOM <16 ms. Direct A599 queue link
  stays visible with document scroll zero; narrow mounted queue links zero.

- bug 10-22 E90.classic.current-policy-reason: Classic's ActionButton used
  shared live unavailability to disable/title approvals, but never printed the
  reason next to the primary. Show the current action's unavailable.reason
  beside the disabled approval, including when the card is pinned. The New
  builder owns the shared policy projection and pre-apply refusal; do not
  duplicate allowlist logic here. Manual Edge both sizes with a removed-ring
  policy reason; no action can queue and typed text stays. Full shared
  allowlist-after-proposal acceptance is separately rechecked after integration.

- bug 10-22 E88.classic.large-queue-redraw: Classic built all 500 queue links
  even when hidden at 400px, then repeated the whole render to save visit
  snapshots. Do not mount the hidden queue. For >80 entries, preserve the same
  list/pager but window its scrollable queue to 18 fixed-height rows with
  spacers; selecting off-window cards scrolls their queue position into view.
  Memoize unchanged queue items. Retain historical snapshots in a ref and
  update visit order only when IDs arrive, not every poll. No shared store
  changes. Manually measure 500-row delivery/render, focus/edit/scroll retention,
  last-row navigation and narrow reachability; report timing rather than
  assuming the shared 16ms whole-ingest target is met.

- bug 10-22 E93.classic.family-member-reachability: a family lead collapsed
  its member out of the Classic queue and marked a directly opened member as
  settled, hiding its pending draft. Include needs_human family members in
  Classic's own needs IDs and provide explicit per-member card links using
  existing placement subjects. Cards/actions remain keyed by exact member,
  never the family home. New grouping/runner unchanged. Manual Edge both
  sizes: lead -> member -> lead, distinct draft/person/chat, send member once,
  lead draft and state untouched.

- bug 10-22 E79.classic.reading-health: an hour-old or never-checked source
  falsely showed healthy On. Preserve On/runs for recent checks, but use the
  existing reading off/never states for Not checked since / Not checked yet
  and warning status. Pause/Stop/offline keep precedence. Header is focusable
  with full status/last-check/machine label/title at narrow widths where text
  hides. No data/runner change. Manual Edge 20/60/never and paused/stop cases.

- bug 10-22 E55.classic.scheduled-send: a rule-scheduled reply appeared as
  generic Running with only Open on your computer. Reuse its existing scheduled
  placement headline and exact Hold action, expose sendAt on Classic Running,
  and show a semantic send time instead of an indeterminate work bar. Hold
  applies the existing later verb to the exact scheduled item; no new send
  or runner behavior. Manual Edge 1280 light/400 dark, Hold before due and
  confirm scheduled send is cancelled with no outbound chat message.

- bug 10-22 E37.classic.job-diagnostics: blocked/exhausted holding cards
  suppressed all run-failure attention and Running cards omitted retry reason.
  Keep the long grey block removed, but add an inspectable run-detail disclosure
  with a concise reason (full blocked/routes/exhaustion text retained inside).
  Running rows show stored status or typed retry reason/time/attempt/routes
  from their own job. No retry scheduling or action changes. Manual Edge both
  sizes with blocked two-route, scheduled transient and exhausted cases.

- bug 10-22 E35.classic.failed-promise-skip: a failed promise mapping offered
  Check again/Later but hid the existing Skip action in More. Show the existing
  exact dismiss action beside the primary for promise cards, just as recovery
  and proposed-work cards do. Skip drops only the target promise; sent message
  remains, no new send or retry. Build/manual Edge at 1280 light and 400 dark.

- bug 10-22 E31.classic.non-review-change-selection: a reply/promised
  non-review card with two plain comment effects offered Post 2 comments and
  reply, but rendered only Also summaries with no selectable rows. Reproduce
  with pending exact comment calls lacking PR/ring meaning or errors. Always
  render the existing shared-in-card change list for non-review pending
  effects, including exact target/content/arguments and current selection
  count. Remove the redundant Also summary; review layout stays unchanged.
  Reuse existing excluded-input approval and revision/receipt gates; no
  runner/projection changes. Manual Edge 1280 light and 400 dark: uncheck one
  of two, approve once, actual makeChange ledger applies only the kept exact
  comment, then checkJobs sends one reply. No tests or test-file edits.

- bug 10-22 R1.classic.numbers-exchange-clamp: after per-send original
  context landed, long multiline asked/You text rendered in full in every
  Classic Numbers list. Reproduce with a counted send containing twelve-line
  original ask and reply. Match today's CSS-only two-line ellipsis for each
  exchange line, normalizing visual whitespace without truncating stored/DOM
  text. Keep the exact counted-send Open in Teams link as today's full-exchange
  path. Scope only counted ask/said, not other text, Catch-up or New. Manually
  compare 1280 light and 400 dark, including two-line geometry, full text
  retention, source identity and unaffected short rows. Build only; no tests.

- bug 10-22 Y1.classic.numbers-byline: counted non-reply rows without a by
  field must show only time/source, as today's Classic does, not the person's
  name. Reproduce with a closed item under Numbers > handled. Match today's
  row-kind byline rules: reply/review retain person/chat/by, other rows show
  by only (learned rows omit it). Preserve semantic time/source and fallbacks.
- bug 10-22 Y3.classic.ask-apostrophe: the Needs you Ask note used a straight
  apostrophe in item's session. Match today's typographic item’s session.
  Cosmetic text only; Ask input/action unchanged. Both corrections manually
  compared with today's fictional Classic at 1280 light and 400 dark; one
  build/commit, no test files or test runs.

- bug 10-22 classic-home-extra-keyboard-button: Home ended with an extra
  Keyboard shortcuts footer button absent from today's Classic. Remove only
  that footer; keep the existing ? shortcut, help dialog and focus-pager key
  button. Version/update/report stay in Home's existing grouped line. Manual
  Edge Home and pager help open/close at 1280 light and 400 dark; no key handler
  or action changes.

- bug 10-22 classic-card-wording: reproduce a low-confidence card and a
  holding draft at desktop. Classic used lowercase low confidence and a fixed
  send shortcut label. Capitalize the displayed confidence label and derive
  the key hint from the same pinned/current card presentation as its primary
  button, so holding drafts say send holding reply (and edits stay accurate).
  The narrow hint strip remains hidden; no key handler/action changes. Manual
  paired Edge 1280 light and 400 dark, including low confidence, holding and
  normal send labels.

- bug 10-22 classic-numbers-empty-by: a counted closed item whose by field is
  empty rendered Name · · time. Join only present name/chat/by metadata before
  the existing semantic time/source link. Missing-item and missed-message
  fallbacks remain unchanged. Manual Edge fictional no-by row and normal
  Catch-up rows at 1280 light and 400 dark; no counting/action changes.

- bug 10-22 classic-numbers-catchup-actions: reproduce Numbers > handled/asks
  with a recent counted FYI: the static Classic row had a check icon and no
  Watch or Needs me. Follow New's counted-row approach by resolving the current
  typed Catch-up activity and reusing Classic ActivityRow, including its exact
  watch form, deadline controls, Needs me action, receipts and staleness guard.
  Older rows without a current activity keep static inspection with an eye
  icon, not a fabricated action. Scope borders to the Numbers list wrapper.
  No runner/action/revision changes. Manual Edge 1280 light and 400 dark on
  fictional rows; actual tracker creation and Needs me handoff verified.

- bug 10-22 classic-menu-app-version-place: at 400px, open Classic A20,
  choose App version Classic then React. The old code reloaded a legacy page
  with an unsupported classic/ address, then dropped the card's address when
  returning, landing on the start screen. After a successful preference save,
  map to the selected legacy experience's supported address and remember the
  exact React/legacy route pair in session storage. Preserve the legacy address
  when choosing React; restore the prior React place only while that address
  still matches, so intentional navigation in legacy is not overwritten.
  Failed/discard-cancelled switches do not alter the route. Existing legacy
  Classic/New flips keep their prior shared-tab behavior. Manual 400px Edge
  card and Ongoing subsection round trips via both app versions; build only.
  The small legacy-address adapter stays within the React client boundary;
  importing the old page's pure routing helper is prohibited by the build.
  Restore the Ongoing section after its first snapshot arrives, not only when
  the hash changes: cold version reloads otherwise kept the URL but left the
  requested section below the viewport. Polling does not reset the scroll.

- bug 10-22 classic-menu-experience-place: at 400px, open A20 and switch
  Experience to New then Classic via the menu. The old mapping went to Now
  then Home, losing the card; Ongoing sub-sections were also lost. Map open
  Classic cards to their New row, and remember the last switch's exact route
  pair in the existing navigation store so an unchanged return restores the
  original card/sub-section. Shared screens keep their normal equivalent
  route mapping; navigating elsewhere invalidates the paired return naturally.
  No server command or item write. Manual Edge card and Ongoing round trips,
  including unsent edit preservation, at 400px light/dark; build only.

- bug 10-22 N5.classic.settings-copy: the earlier experience-aware Settings
  fix already restores Waiting on others and on Home. Reproduce the remaining
  mismatch by opening Updates: React rewrote the server's Off option as check
  manually in both API and client, and rendered an unstyled More disclosure.
  Scope the API's New wording to New; remove the Classic client override.
  Keep the server's exact
  Off: run "delegate update" yourself label, and style More as today's uppercase
  section heading. No option values, settings save path or New UI changes.
  Manually verify all four requested strings, save Off in the fictional store,
  reload and check the disclosure in Edge at 1280 light and 400 dark.

- bug 10-22 N6.classic.holding-card: reproduce a holding draft with a long
  failed-run status, commitment=true, promised todos and a plan owned by them.
  Classic must not inject the run-status block above the holding reply. Keep
  the commitment warning even with Yours to do, render the canonical Others
  plan role as today's them, and name the Ask field with its actual item code.
  Add a minimal optional attentionKind to distinguish reply-changed safety
  notices from run failures; hide only holding run failures in Classic, never
  the explicit reply-changed refusal. New keeps all existing attention text.
  No mutation action/revision changes. Manual Edge at both required sizes,
  including the reply-changed warning and an actual fictional Ask handoff.

- bug 10-22 N1.classic.numbers-exchange: reproduce Numbers > handled, asks
  or replies with a closed replied item. React hid ask/answer in a collapsed
  Replied to summary and showed grey Work: Closed text. All lists now render
  the existing ask/said fields as the visible first-name asked / You exchange,
  including the in-Teams marker, with the existing work summary as a chip
  (green when Closed). Keep codes, source links, repeated-send counts and
  missing-file fallbacks. No new data or counting/runner behavior. Manual
  paired Edge at 1280 light and 400 dark; build only, no tests.

- bug 10-22 classic-snapshot-decision-detail: reproduce with snapshot A3/A6/A5:
  the abbreviated React snapshot omitted choice labels, exact proposed
  changes, meeting, context, work and sources present in today's snapshot.
  Reuse ClassicCard in explicit readOnly mode, with current snapshot entities,
  no pinned/transient edit state, autofocus, mutation menu/footer/Ask, editable
  fields or action receipts. Choice/change inputs are disabled; thread/why
  disclosure uses local folds only. Keep rich sections, promises, notes and
  Teams/source links. Snapshot headings nest h3 under Needs you. Mounting
  useCardPresentation/useEdit reads state or creates callbacks only; ClassicWhy
  contains only inspection links/disclosures. Global snapshot keyboard refusal
  stays. Normal focused-card behavior and action gates remain unchanged.
  Manually inspect decision detail, attempted shortcuts and retained live
  edits in Edge at 1280 light and 400 dark; no test files or test runs.

- bug 10-22 classic-home-version-group: reproduce on Home with daily checks:
  update/report were detached from version/status and the footer said every
  1440 minutes with a full locale timestamp. Restore the existing Classic
  grouped line, once-a-day/hour/minute wording and short checked time; keep
  keyboard help and the safe reload banner. Existing server version.last
  rollback metadata must survive the shared schema (optional to/rolledBack),
  so a failed new version is not mislabeled Up to date. No new producer or
  update action is added. Details remain under Settings > More. Manually
  inspect normal, failure and rollback metadata in Edge at both sizes.

- bug 10-22 classic-numbers-window-alignment: reproduce at 1280px on Numbers.
  A shared heading pseudo-element consumed flex space after the window/range,
  leaving them beside the subtitle rather than at the right edge. Suppress
  that spacer only for Numbers at every width (previously mobile only), and
  align its header controls with the subtitle. Other tools keep their layout.
  Manually compare desktop light and narrow dark Edge with today's Classic.

- bug 10-22 classic-mobile-keyboard-legend: reproduce by opening a focused
  reply at 400px; React showed a wrapping desktop key legend below it while
  today's Classic hides that strip. Hide only classic-key-hints at 600px and
  below. Keep the pager help button, keyboard dialog and shortcut handlers.
  Manually check 1280 light and 400 dark in Edge; no test files or runs.

- bug 10-22 classic-settings-places: reproduce in React Classic Settings,
  Updates and system: Look for updates incorrectly points to Now, and the
  unanswered-asks label says Waiting. Pass the requested experience into
  settingsView before its wording transformation. Classic retains Home and
  Waiting on others; React New and legacy defaults keep their current words.
  No settings keys, values, write paths or action gates change. Approved in
  the separate Classic parity spec review; prove manually in Edge, no tests.

- bug 10-23 G9.classic.reader-time: today's Classic Home version line does not
  display reader identity or timestamp. Remove React Classic's added Reading
  on/Last reader line rather than introducing a new date format. Keep the
  shared reading metadata for status/health and leave New unchanged.

- bug 10-23 G3.classic.missed-message: Home restores the inline missed-link form
  with Make an item, reusing paste-missed and shared page-form capture/consumption.
  Editing a completed form clears its resolved receipt, as opening the shared
  sheet does, so a new attempt is not mistaken for the previous submission.
  Pending/uncertain receipts remain protected. Server validation and intake
  remain authoritative; queued links become items
  when the runner reads them, not at HTTP acceptance. Keep only update/report
  tools on Home, without the extra heading; Check now retains its existing
  Settings timing/source-health entry points, with no new Pause surface.
  Use section padding for the 28px gap above Also
  for you so heading margins cannot collapse it.

- bug 10-23 E41.classic.track: the proposed-work card reuses the exact offered
  Track action from New's track placement as its primary action. No new command,
  parsing or runner branch. Skip stays beside Track; answer text remains
  available to revise the proposal. Track applies ok to clear proposed, open
  the work and schedule checkAt; no reply is sent.

- bug 10-23 G1.classic.failed-home-hint: Home's peek uses the offered Try again
  recovery action to identify failed items and renders the requested answer/
  retry-or-skip guidance. Do not fall back to the raw incoming ask when command
  hint scrubbing removes the old question. Ordinary Home headlines are unchanged.

- bug 10-23 E38.classic.failed-job: reuse New's stopped placement to include
  recoverable failed items in Classic's created-time-ordered Needs you queue,
  excluding them from Running and its count. Existing answer(text) and skip
  handlers provide Try again with directions and Skip; expose both on the
  Classic card with existing exact management guards. The non-tracker answer
  path stores ownerAnswer and moves to running for worker replanning; it does
  not blindly restart the old job. Ordinary running items and New row actions
  retain their placement and commands.

- Classic promise/to-do parity follows the existing designer review, not a new
  interaction. The card renders projected current-draft todos before Send, with
  the warning icon. Kept todoIds have a distinct earlier-reply label and the
  existing E45 counted exact-ID action beside their visible texts. Exclude that
  action from the Send footer; show its revision-keyed pending/result state even
  after the completed list disappears. Preserve the generic commitment warning
  only when the concrete promise texts are absent. No E45 close-work behavior
  changes.

- Classic offer audit (bug 10-22 classic-offer-staleness): every management
  offer now defaults to an exact entity revision, cached once per entity in
  a projection. Its queued answer carries a manage guard rechecked against the
  same decision state and relevant watch settings before applying. This closes the interval
  between click-time validation and runner application; timestamps alone miss
  changed watch news or job-only end-date changes.

  Follow-up (bug 10-22 classic-management-bookkeeping): workflow management
  revisions explicitly select visible state/text, draft/choices/changes, open
  promises, work details, news/acknowledgement and watch interval/condition/end
  settings. Never hash the whole workflow or a job's nextAt, state, result or
  updatedAt: routine checks must not invalidate Stop/Extend. Workflow updatedAt,
  newCount and private notes are also excluded. Automation management reuses
  automationApprovalRev plus the displayed pause reason, not execution counters,
  next-send bookkeeping or updatedAt. For management offers only, click-time
  comparison uses the semantic expectation rather than also requiring the row
  timestamp to match. All explicit approval/Undo/E45 gates still compare both
  tokens and keep their own engine guards.

  | Offer kinds | Audit outcome |
  | --- | --- |
  | classic-ack-watch | Added exact workflow/news/ack and watch-job revision; stale acknowledgement cannot hide a later update. |
  | stop-watch, extend-watch, interval | Exact decision revision includes visible workflow state/text and every/until/endsAt; excludes cycle bookkeeping. |
  | classic-interval, classic-extend | Same exact workflow/watch-job guard for In progress controls. |
  | toggle, end | Added exact automation revision and queued recheck. |
  | follow-up, dismiss-waiting | Added exact waiting-record revision and queued recheck. |
  | accept-habit, defer-habit, never-habit, remove-rule | Added exact habit revision and queued recheck. |
  | review-again, answer, later, dismiss, ask, continue, report, classic-continue | Added exact management revision and queued recheck; no new command or effect. |
  | needs-me, non-approval row actions | Added exact workflow/waiting management revisions; row approvals keep their existing send gates. |
  | skip-facts | Added exact proposal-management revision and queued recheck. |
  | pause-resume | Added exact control-state revision and queued recheck. |
  | retry-source, check-update, mark-all-read, report-problem, paste-missed, watch-something | Added exact control-state revision before immediate execution; mark-all-read still validates the displayed time. |
  | stop-channel, health fixes | Added exact displayed channel/health revision before immediate execution. |
  | approve, approve-again, send-edit, pick, reply-only, use-note, reopen | Existing exact approval/reply/note gates retained. |
  | undo, wrong, incomplete, unneeded | Existing exact sent-message identity and feedback gates retained. |
  | save-facts, edit-fact, undo-facts | Existing exact proposal gates retained. |
  | watch-fyi | Exact source revision and cleared-until handling added in the separate watch prerequisite. |
  | classic-start | Existing exact automation Start guard retained. |
  | todo-done, todo-row-done, classic-close, classic-work-close, classic-work-wait | E45's exact displayed-ID and close-work helpers retained unchanged. |
  | remind-someone, chat-normal | Existing exact recipient/privacy gates retained. |

  Direct settings saves keep their existing settings-revision endpoint; this
  audit changes offered actions only. Non-page chat/runner answers have no page
  guard and retain their previous behavior. No owner data or Teams action is
  needed to prove the gate.

- Watch-fyi is an exact-revision immediate action: compare before execution,
  preserve an explicitly empty until string through the existing engine API
  (undefined would reinsert its AI condition). Shared ActionButton optionally
  prepares dynamic input at click; existing callers retain eager inputs.
  Keep preset identity separately from its date and clear it on custom-date
  edits or successful form consumption.

- Classic header retains the existing data and edit-discard App version gate;
  desktop Experience follows status, mobile Experience stays in Views. Restore
  860/560 px breakpoints and scope theme-button dimensions so New's open-menu
  full-width theme rule cannot move Classic's theme and Views offscreen.

- Classic E64 reuses the server's exact-revision `undo-facts` offer in Done,
  taking back the whole learned proposal with no client-side expiry. Per-fact
  undo and a hidden details-only action were rejected. Optional shared
  ActionButton accessible/pending labels preserve other callers' defaults.
  The reply-only `u` selector and snapshot remain unchanged.

- Exclude Finder's ignored .DS_Store metadata from shipped-file hashing. It is
  not a release asset; including it makes a clean integration build depend on
  an untracked local file. Keep real hidden assets such as Vite's manifest,
  and leave the local metadata file untouched.

- Closed Open-only rows subscribe only to their shown primary action, including
  any pinned snapshot. They do not create card-presentation/edit/mutation hooks
  until local controls actually need them. Keep the same DOM and pinned-input
  behaviour rather than virtualizing away editors or changing the layout.
  Cache bounded native hour/minute labels by instant, timezone offset and
  browser language rather than freezing an Intl formatter's timezone; keep
  the same options and invalid-date output. Stable row facts are memoized
  separately from changing headlines, with a shared local-day/timezone key so
  relative labels change across midnight and timezone changes. A changed entity
  revision already proves inequality; do not serialize both versions merely
  to rediscover it. Equal-revision and unversioned metadata still use the
  existing full-content comparison.

  Production Chrome, fictional 500-row draft changes: ingest through React
  layout-effect completion measured 15.0, 10.4 and 10.3 ms after an initial
  36.2 ms baseline. This excludes network, JSON parsing and compositor paint.
  Actual local controls, selected changes, edited send/Undo and focus/IME
  retention were driven again; day rollover and changed metadata still update.
  Live UTC/New York/Tokyo switches match native time labels without reloading.

- Promise checks run after the owner's words were sent. Preserve their
  conditional/refused-action to-dos with the existing keepTodos helper at that
  send's time; merely appending turn-local todos made them invisible in both
  experiences. Keep only newly returned text, so completed earlier to-dos do
  not return. Do not invent browser-side placement or send another message.

- A failed promise's Check again is local work, not an external change: it
  requeues inspection without sending or voting. Classifying it as an external
  change incorrectly hid the row control behind Open. Keep its exact revision
  binding and the promise-specific Skip wording. Actual votes still require
  opening their meaning and approving, preserving New's no-row-changes rule.

- Seen tracking follows displayed row identities and real-news timestamps, not
  every polling revision. New rows join viewport observation, and an open row
  saves again after newer news. Reusing a mount-only observer missed both;
  depending on whole snapshots would continually cancel the dwell timer.
  Pinned edits retain their shown placement and cap marks at that snapshot's
  time, so undisplayed newer messages are not accidentally acknowledged.

- Keyboard navigation resolves both a section route and an open placement
  before choosing its queue. From Working, j/k stay in Working instead of
  accidentally opening Your move. Keep the existing section-local keyboard
  model rather than inventing a second global pager.

- Keep New's compact Done rows rather than restoring a second full card inside
  each exchange. Eligible quiet closures expand to the existing revision-bound
  Reopen-and-draft field/action; reopening never sends. Sent details retain
  confidence, sources and gaps, plus available searched places labelled as
  current item context rather than invented historical evidence. Leaving the
  controls unreachable would lose parity; nesting the whole card duplicates it.
  Classic's shared Entry branch remains unchanged.

- An active-session/window hold is recorded as a refusal on both answer and
  final-send paths. Holding it safely is not successful completion: show the
  alert and keep the exact edit available for a deliberate retry after the
  window closes.

- Page forms capture only their owned raw fields at submission. A successful,
  certain receipt consumes that group only if none changed and no composition
  is active, including completion after the sheet unmounts. Accepted unchanged
  sheets close like New; later typing stays open. Reopening starts a fresh UI
  attempt without replaying the old submission. Interval no-ops are refusals,
  so their input is not consumed. New's tool dialog uses the existing centered
  sheet dimensions and product tokens. Only the still-pending submission may
  complete a UI receipt; duplicate or older deliveries cannot consume new work.

- Find filters current results without unmounting revision-pinned unsent work.
  Reuse the same dirty-state predicate and server-provided pinned placements;
  show retained work separately from the match count. Hiding an active editor
  when a new draft stopped matching the query lost focus despite keeping its
  words in the store. Explicit review/close remains the owner's choice.

- Keep the existing revision-pinned editor mechanism: fresh paired browser
  checks retained the same node, focus, selection and words through actual
  question/source polls and a move to Working. React ignores composing Escape;
  today's New blurs on that synthetic event. A refused queued edit keeps later
  typing. No replacement state engine was needed.

- A nonempty change-approval hold is a refusal, not a successful application.
  Persist that flag through the existing reply/outcome path so the page shows an
  alert, retains the owner's selection and permits a deliberate retry after the
  permission is restored. The empty hold that successfully queues work remains
  accepted.

- Habit choices keep New's compact primary Turn on and secondary Not now/Never,
  with the exact server evidence and learned provenance. Chat-normal controls
  retain their existing confirmation and revision guard; a classification
  changed while the confirmation is open is refused rather than cleared.

- New's manual update control lives once in the shared footer, not again among
  Now's tools. It uses the existing typed check-update action and updater,
  retaining the existing unsent-edit reload guard. Fictional browser validation
  suppresses the real updater process with the existing DELEGATE_NO_KICK seam;
  it does not update this shared checkout. A tool section shows results only
  for its own offered controls, so the footer acknowledgement is not duplicated.

- A changes-and-reply approval carries its reply digest through the existing
  approved-work context to the final sender. If the signature or reply changes
  while the work finishes, keep made changes but hold the reply for review;
  neither silently substitute the new signature nor freeze an obsolete one.
  Store the actual signed body separately from learning's raw text, so expanded
  Done history is immutable even when signature settings later change. The
  existing retention sweep clears both copies together.

- The approved AI reply preview uses the sender's shared signature formatter,
  including first-name expansion and duplicate suppression. Raw draft text stays
  separate for owner edits, which do not gain a signature. Signed presentation
  changes invalidate the shown revision; queued page approvals also recheck the
  expected reply digest before applying. The Classic-owned renderer can consume
  the additive `draft.sendText` field without changing its edit field.

- New Settings keeps the server's field kinds, option text and setup guidance
  verbatim, with suggestions before standing instructions and a separate
  permission-switch group. Reuse New's narrow, grouped rows rather than adding
  another settings editor. Metadata deep links open More and focus selects too.

- The New facts destination retains today's To learn heading, personal/team
  destination, selected count, fact types and linked person/date provenance.
  Keep the owner-requested single-fact Edit in addition to Save and Skip;
  these continue through the same revision-pinned typed actions.

- New Done opts into compact exchanges and expandable sent details; Classic's
  shared Entry remains unchanged by default. Reusing the whole open-item card
  repeated the chat, ask and draft in sent history, so New keeps only its
  revision-pinned feedback, sources and private Ask. Empty filters are hidden;
  quiet closures live only beneath Catch up, as in today's New.

- Numbers uses the existing server model and rule table, with New's compact
  cards and read-only Done-style counted rows. Reusing interactive Done entries
  would expose unrelated actions; grouped duplicate sends instead stay one row
  with an explicit multiplicity. Styles are scoped to New, not Classic.
- Numbers fetch errors replace old figures rather than leaving stale totals
  beneath an error. The window select stays mounted through counting/retry.

- Paired New parity: reuse the existing typed local row actions and keep Tell
  below the metadata, as today's New does. Keeping every action behind Open was
  simpler but hid New's local work controls. Sends and external changes still
  require Open; no browser command parsing was added.
- Single-choice selection requests its typed preview immediately, like New;
  multi-choice and Other keep their explicit draft action. No selection sends.
- An inline work-only history uses the server's newest-first placement history;
  an approval card keeps its chronological card history. The two normalized
  histories are not interchangeable.

| Decision | Options considered | Choice and reason |
| --- | --- | --- |
| Documentation location | External specs; repository-local specs | Local dev-spec, pm-spec and design-spec: the brief restricts writes to this worktree; no external spec or real-data writes |
| Layout | Rebuild Classic; adopt unapproved card redesign; preserve New and current card | Preserve approved New layout and current card anatomy; swappable card parts allow a later redesign |
| Data ownership | Browser placement; existing view directly; normalized v1 adapter | Server-normalized v1 over existing functions; avoids duplicate rules and enables typed actions |
| Routing | Router library; hash navigation | Hash navigation initially; four screens and item links do not justify another runtime |
| Action safety | Browser command formatting; server registry | Server registry with fresh revision and offered-action checks; runner remains unchanged |
| Settings | New settings engine; existing settings endpoint | Existing saveSetting and metadata; no duplicated validation |
| Styling | Artifact theme; product tokens | Product visual.md tokens are authoritative for this app; not a standalone HTML artifact |
| Review | Subagents; linked independent chat | Separate linked review session, as the owner's process requires |
| Scope honesty | Placeholder tabs claimed complete; milestone gates | Preview remains explicitly incomplete until parity tests and the scenario matrix prove it |
| Restart directive, section 8a | Tests before screen; browser-first | Build each screen and prove its real fixture-server browser flow first, then add the cheapest useful unit/invariant coverage. Approval race gates still run in browser before activation |
| Extra M1 rebase | Keep old engine; integrate current truth gates | Rebase onto 9078007, preserve its send boundary/PR reconciliation/work/intake/placement changes, and retain the optional React apply-time preconditions |
| Class composition | External cn package; owned utility | Replace cn with a local clsx + tailwind-merge helper. It handles conditional classes and caller overrides; all lock URLs remain public-registry URLs |
| New header sizing | Native select intrinsic size; reserved allocation | M1 introduced the native version select with no size constraints. Its longest unselected option and platform font/control metrics can resize the header. Reserve a 148 by 28 CSS-pixel control inside a nonshrinking positioned menu; do not delay or weaken the first-screen assertion |
| Review P0 action safety | Command strings; structured enqueue | Shared structured enqueue and persistent submission receipts are required before M2; no React action ships before adversarial text and lost-response tests pass |
| Revision changes | Replace fields; pin dirty/pending snapshot | Pin the displayed revision, disclose newer data, and explicitly confirm discarding input |
| Panel/snapshot | Try to mount React; preserve supported renderer | Panel falls back to New, snapshot stays Classic; React preview is browser-only |
| Test runners | node:test only; requested component stack | Keep Vitest/Testing Library as explicitly selected by owner, alongside fixture-backed node:test browser tests |
| Schema drift | Manually remember fields; coverage assertion | Projection tests must account for every existing view/card/row field, mapped or explicitly dropped |
| Classic extras | Add tabs; place in existing surfaces | Watches/reminders and channel management in Now Waiting footer/sheet; the approved Since line replaces Home tiles; missed-message paste in Find; knowledge queue linked from Now minute line; update/report/version in footer |
| Activity edits | Component-local fields; normalized revision fields | Feedback and watch forms use the same pinned revision mechanism as drafts. Retain the old activity when a replacement send changes its row id; block editing another version of that item until explicit discard |
| Receipt retention | Bounded outcome log; durable completion | Carry an optional submission identity on queued answers and persist runner text/refusal at completion. Preserve completion across the enqueue/save race. Older archived answers with missing detail terminate as explicit uncertainty, never a replay or fabricated success |
| Edit consumption | Any changed revision after an ack; confirmed carried words | Consume an edited reply only if its submitted words exist in the new draft or sent activity. Uncertainty, refusal, newer text, focus, composition and changed selections keep the pin |
| Redraw budget | Recompare all entities; respect Query identity | Reuse identical Query-owned references before deep comparison. All 500 headlines must change in the benchmark; unchanged polling is not proof of a redraw |
| Milestone integration | Dead imports until each milestone; integrated lazy screens | Wire all lazy screens with the shell in M2, then finish their explicit M3 acceptance separately. Do not expose placeholder screens or claim the inventory complete prematurely |
| Settings provenance | Drop metadata; retain evidence | Show learned-rule evidence alongside its scope and Remove control. Setup-only values remain readable, labelled as managed during setup rather than exposing chat commands as the page's controls |
| Screen refresh | Poll all queries; query per screen | Numbers fetches on open/window/remount, not page polling, focus or reconnect. Settings retains mounted drafts on failed refresh and advanced deep links open the containing More fold |
| Working preview delivery | Stop for complete M4; ship the working integrated app first | Rebase M2/M3 onto c8815d3 and commit the requested corrections plus intact verified work. M4's inventory remains explicit about outstanding proof rather than delaying the usable app |
| Row text | Raw-message fallback; New server headline and Next | Preserve New headline after command-hint removal; never substitute lastAsk. Project New's owner/Next phrasing as data, formatting its time placeholder locally |
| Time format | Full locale timestamps; duplicate helpers; shared New helper | Extract the existing pure short-time formatter into the React domain and re-export it from legacy format.ts. Explicitly allow just that pure file in the legacy bundle boundary; no behavior change to old rendering |
| Open work | Long request first; Next and checklist first | Use the approved New work-first ordering and collapse asks over 240 characters with full text accessible. The card timeline references its chronological namespace, not the row's recent-first timeline |
| Card navigation | Every Now row; current visible section | Count/traverse the open row's section after Find filtering; do not count hidden sections or capped Catch up entries |
| Navigation keys | Separate global sequence; same visible scope as buttons | j/k and arrow keys use the same current-section and Find scope as Previous/Next. This keeps the count meaningful for both mouse and keyboard users |
| Poll payload | Download full JSON every interval; conditional fetch | Hash all observable snapshot content except clock-only now/fetchedAt, return ETag/304, and retain at most ten validated query/token snapshots in the service. A stable initial Since fallback avoids clock-only invalidations on a never-viewed store |
| Prepared recovery | Requeue; refuse without validation; validate then refuse | Store the validated intent with its prepared receipt. Re-resolve if its answer is missing, persist exact stale/unknown/invalid refusal, and still never enqueue from GET or retry. Legacy prepared records remain terminal interruptions |
| Reminder disappearance | Current-only standalone references; pinned snapshot | Open reminder cards resolve from the same pinned entities as their rows. Ending a reminder must not leave a mounted row dereferencing a removed placement |
| Parallel experience ownership | Split New screens; split experiences | Owner reassigned all React New surfaces to this branch. M4b owns React Classic and its in-app toggle under classic/. Keep App changes small; do not edit that folder. The already-finished New screen edits stay in this delivery |
| Grouped part actions after rebase | Home-only needs cards; every needs-human subject | Main groups needs cards under their home. Build canonical actions for every needs-human workflow, including separately owned parts; all existing exact/apply-time guards still apply. A browser regression proves only the chosen part queues |
| Numbers without a stored item | Call every missing row a missed message; distinguish log history | Only an actual missed-message record gets that explanation. A removed workflow says its code is no longer on file and its log line still counts, matching the existing page |
| Supporting event times | Raw ISO/full locale strings; shared short forms | Numbers events, watch check times, bootstrap progress and footer read/update times use the same short formatter as rows/cards. Date-only bounds remain dates |
| Narrow New status | Separate mobile renderer; remove status; compact shared DOM | Keep one accessible DOM/action path. Place status and Undo controls beside their text, fold extra problems/age, and remove duplicate paused text. Direct 400x860 geometry keeps Your move above 430px with no horizontal overflow |
| Visual baseline | New styling from memory; side-by-side same-data rendering | Capture immutable New/React baselines before editing, then compare both on the same cloned fictional store at both widths/themes. Freeze only the fixture clock so Undo/relative times remain comparable |
| New presentation ownership | Embed the legacy renderer; cosmetic CSS over old markup; owned matching components | Use New's actual tokens/spacing with owned Header, icons, compact row facts and inline-card variants. Keep App integration small and do not import legacy rendering or command handlers |
| Visit summary | Read the latest view mark; retain the visit cursor | After React HTML builds, capture the existing visitSince result once for its page projection. Explicit since precedes lastViewed, and polls do not mark another visit. This fixes the demonstrated New/React summary discrepancy |
| Experience note | Independent browser flag; existing per-machine noted state | Expose optional showExperienceNote from ui.noted and dismiss through the existing /ui noted-only save. Failure keeps the note visible; success preserves the selected version and survives reload |
| Inline card context | Repeat full header/pager; keep the row context | Remove Now's pager and visual duplicate person/chat header only. Keep an accessible name, inline work-first content, one More control, and the full header for Done/other contexts |
| Visual/action parity | Copy New's direct row command handlers; preserve Open-only safety | Match avatars, metadata, link icon and primary button treatment while keeping row buttons Open-only. Do not add row sends, direct command parsing or a second approval path for a screenshot match |
| Combined branch integration | Rebase builders again; merge the coordinator's resolved branch | Merge react-all once, fast-forwarding to e93a0f5. Preserve the integrated Classic/toggle and the New visual milestone; do not edit another worktree or merge to main |
| Missing visit cursor | Coerce missing since to the latest mark or a day ago; preserve its meaning | Pass a visit object whose presence distinguishes an intentionally absent first-ever cursor from an omitted projection argument. Snapshot since stays absent, as on the old page; a separate stable fallback is only for New's Since line |
| Shared count correction | Patch browser badges; reuse the old view and freshness helpers | Keep Done and Catch up computed from the existing helpers over the same workflow/seen snapshot. Correcting the cursor restores the counts without changing UI arithmetic, ownership or action bindings |
| Shared header styling | Apply New's structural display rule to all headers; target its actual frame | New's block frame rule requires its direct header-inner child. Classic retains its flex header and responsive navigation while New's visual treatment stays unchanged |

## Combined visit/count checkpoint

- Merged react-all once. The branch already contained the New visual pass and
  the other builder's Classic/toggle implementation.
- A fictional first-ever visit reproduced old Classic Done 4 versus React 2:
  React had replaced an absent since with a fabricated 24-hour cursor. The
  visit object now preserves absence instead of falling through to the newly
  written load mark or display fallback.
- Direct Chrome comparison against the old Classic view/freshness helpers:

  | State | Old Done / Catch up | React Done / Catch up |
  | --- | --- | --- |
  | Existing visit, earlier cursor | 4 / 4 | 4 / 4 |
  | First-ever visit, mixed-age history | 4 / 2 | 4 / 2 |
  | Two item marks within the visit | 2 / 4 | 2 / 4 |

- Rendered Classic badges/headings and You left text use that same cursor.
  First-ever Classic says In the last day, not a fabricated leaving time.
  API reads do not mark another look; polls, in-app toggles and reload retain
  the actual cursor. Conditional responses remain empty 304s, and an item
  approval binding is unchanged across visit operations.
- Inspected integrated New/Classic at 1280x800 and 400x860, light/dark. New
  retains avatars, filled Open, compact metadata/source icons, Checked pill,
  theme icon and health-line styling. Narrow Classic navigation is usable.
  This walkthrough posts no item action and uses no owner data.
- Build and direct browser checks only. No tests, typecheck, CI or publication.

## New visual checkpoint

- Separate spec and bounded implementation review approved the visual plan;
  see [the visual review](../reviews/react-visual.md).
- Built the committed-output app and drove the real server in Chrome with
  fictional stores only. Captured Now, open work and open reply for New and
  React at 1280x800 and 400x860, each light/dark: 24 final screenshots plus
  before captures. Every final image was inspected in side-by-side grids.
- Header, leading health and summary x/y/width/height match New exactly in
  the measured fixture at both widths. List start x/y/width also matches.
  Total list height is intentionally not equal when old New exposes direct
  row Tell/Mark done controls that React keeps behind Open.
- Raw, unmasked screenshot differences remain nonzero. Work views differed
  by 2.41-2.43% at desktop and 4.16% narrow. Now/reply differences are larger
  because preceding row controls change heights, the version label differs,
  and missing-message fixtures retain the honest item-created time label.
  This is not a pixel-zero claim.
- Direct clicks verified the narrow menu, icon theme cycle, note save failure/
  success/reload, stable Since and 304 polls, both More menu placements,
  Escape closing More without collapsing its item, exact Copy details,
  and text/focus/selection/composition retention through a changed poll.
  Existing paused/Ask/Undo/resume and other lifecycle paths were exercised.
- A clipped bottom More popup was found during the walkthrough and corrected:
  bottom controls remain in flow; the top menu alone is bounded and scrollable.
- Per the owner directive, build and real-browser inspection only. No test
  suite, typecheck, CI, release, public scan or owner-data action was performed
  for this visual milestone.

## Review disposition

P0-1..3 and P1-1..4 are design requirements above and hard M2 implementation
gates. M1 offers only the version menu and an explicit foundation screen, with
no item actions. P1-5..6 require M1 cold-asset, CSP and fallback tests. P1-7
requires the pinned parity inventory before M2. P1-8 is reflected in status.
P2 suggestions on clocks, links, distinct revisions, contrast and measurements
are accepted. Query-only data ownership is not adopted because the brief
explicitly requires normalized Zustand entities; duplication is limited to a
read-only projection index. Self-contained means all files are committed under
dist, not one HTML file.

## Milestones

- M1 complete: schema, scaffold, menu and served build work.
  Public-only lock URLs are retained. The owner's actual clean install contract
  was verified with fresh caches in isolated temporary directories: production
  installed 102 packages, development installed 302, without changing either
  manifest or lock. Direct public-network npm requests remain unavailable.
  Earlier metadata returned inconsistent older versions; official public release
  tags confirm React v19.3.1, Tailwind v4.3.3 and Zustand v5.0.15. The inference
  that these versions were private or nonexistent was incorrect.
- M2 complete: typed layers, Now, every current row/card kind, server-owned
  actions, private Ask, holding replies, work, changes, Undo and refresh safety.
- M3 complete: Done, Numbers and Settings, including filters, exact feedback,
  learned provenance, habits, privacy controls and retained screen edits.
- M4 React New complete: Classic-only capabilities are placed in the approved
  New surfaces and all 61 U / 286 master scenarios are classified in
  [the New acceptance](react-parity.md). Five future U cases remain explicitly
  out of migration scope. React Classic is owned by the separate builder.

## M2 verification checkpoint

- Real Chrome against fictional temporary stores and the real local server:
  every row kind, exact edited sends, preview-before-send choices, selected
  changes, private sources/Ask, separate PR approvals, holding/retrying/stopped
  work, reports, to-dos, Find, knowledge, sheets and all four screens.
- Stale submission and apply-time races, double click, dropped POST response,
  reload while receipt checking remains blocked, rotated outcome logs and
  exact-target Undo are covered. Activity forms retain focus/selection/IME and
  typed watch text when records change.
- Full gate: 896 Node cases; 894 passed initially. The two failures were the
  16.2 ms worst redraw and a reopen assertion observing the queued message.
  Identical-entity reuse removed redundant serialization; the reopen test now
  awaits the matching applied receipt. Both failed cases passed their focused
  rerun. All 13 component/resolver cases passed.
- Changed-row production benchmark after the optimization: 7.30 ms median,
  14.30 ms maximum/p95, 15 updates with all 500 headlines changed. Includes
  normalized index reconciliation and React commit; excludes network, query
  parsing/cache work, layout and paint. Projection: 170.51 ms; JSON 1,576,730
  bytes uncompressed. These are local measurements, not a cross-platform claim.
- Twenty screenshots inspected: Now/card/Done/Numbers/Settings, each at
  1280x800 and 400x860, light and dark. No horizontal overflow; navigation
  clears the sticky header; codes do not wrap and chart baselines align.
- 63 cumulative genuine mutation kills, including selected primary counts,
  pinned activity retention, discard protection and durable completion.
  An initially invalid mutation baseline was not counted: the lost-response
  test now holds receipt blocking through reload rather than racing unroute.
- Heavier screens are lazy. Current build sizes are recorded in the milestone
  summary. All tests write under temporary roots; no owner data, AI, push or
  publication was used.

## M3 verification checkpoint

- Browser-proven Done feedback/watch retention and exact-send targets; Numbers
  counted lists and anonymous copy; all Settings fields and model details.
- Additional real-browser checks cover Numbers fetch cadence through six real
  page polls, focus and reconnect, advanced Settings links opening More,
  retained focus/text after a failed refresh, all three habit choices, learned
  evidence/Remove and cancelled/confirmed chat privacy changes.
- Full Node suite: 899 cases, 898 passed initially. A non-reply completion
  assertion timed out; its diagnostic also waited on the already-removed row.
  It now awaits the exact applied receipt and asserts that receipt's text is
  rendered. The focused seven-action case passed. No production cause was
  established for the old timing-only assertion. All 13 React cases pass.
- Full-run changed-row measurement: median 8.00 ms, maximum/p95 13.40 ms;
  projection 93.61 ms and 1,576,730-byte JSON. Same measurement scope as M2.
- Four additional learned-rule screenshots inspected at both required sizes
  and themes. Evidence, scope and controls are readable without overflow.
- Three new genuine mutation kills for provenance, command-free setup labels
  and Numbers reconnect policy: 66 cumulative. Baseline passed first.

## M1 verification checkpoint

- Typecheck and build pass with the installed dependencies.
- Initial full node suite: 804 tests, 788 initially passed. The 15 failed golden
  cases differed only in the approved version menus; all 15 passed after those
  nodes alone were updated. The failed narrow-menu switch test passed after its
  selector was updated. An independent byte comparison confirmed all 176 changed
  golden files have no non-menu differences.
- After adding the shared typed boundary, the full node suite ran for that new
  shared-path scope: 824 tests, 821 initially passed. Three brand/scenario
  invariant failures were fixed and all three reran green. No flakiness loops.
- Seven StrictMode component/resolver tests passed.
- Eleven focused post-review tests passed: real-server serving, public-registry
  URL invariant, build integrity/freshness, client-source boundary, cold lazy
  JS/CSS tokens, snapshot fallback, no-JavaScript escape, failed-chunk recovery,
  and an isolated installed bundle with no node_modules (including a missing
  preview-build fallback). These runs do not prove public installation.
- Thirty-seven mutation operators were killed across foundation, recovery,
  client boundary, typed actions, edge contracts, revision store, apply-time
  identity guards and the test-worker resource cap.
- Inspected 1280x800 and 400x860 screenshots in both themes. No horizontal scroll.
- Current foundation JS: 282.81 KB raw / 91.37 KB gzip; CSS: 15.21 KB raw / 3.99 KB
  gzip, with a lazy foundation chunk. Item screens are not activated in this build.
- No 500-row redraw, server projection or payload measurement yet: M1 has no rows.
- M1 is a local commit only. publish:check runs after the commit because it scans
  committed files; no pushing or publishing is authorized.
- Both P1 recovery/snapshot findings were closed by the separate plan reviewer.
  Error recovery intentionally offers Continue in New and Reload, not another
  full version menu. The token-gated GET escape is recovery-only and supports
  only New/Classic; normal switching still uses POST /ui.

## Action safety checkpoint

The shared enqueue entry now accepts structured answers, not reparsed text.
Receipt UUIDs are separate from monotonic ULID answer identities, preserving the
runner's time order. Refusals persist. An interrupted prepared submission never
queues on a read or retry: it recovers an existing answer/outcome or becomes a
terminal refusal. Dirty/pending revisions stay pinned; future UI actions are
disabled per item while any submission is pending.

Fifteen focused backend tests pass; ten action-rule mutants were killed. One
canonical-row mutant initially survived because the fixture did not exercise
that path. Adding the promise fixture and an explicit nonempty-coverage assertion
made the test fail for the mutant. Card and placement work timelines use separate
projection ids, so one cannot overwrite the other's ordering.

The final full gate is green: 834 node tests plus 8 StrictMode component/resolver
tests, with typecheck and shipped-byte build checks. An earlier unbounded run
finished its assertions but retained two browser-test workers. The default test
command now limits file concurrency to four, avoiding browser oversubscription;
the bounded full run exits cleanly with no skipped tests.

### Additional decisions

- Keep the current, matching React/DOM stable pair confirmed by public release
  provenance. Do not downgrade based on inconsistent registry metadata.
- Verify reproducibility using the owner's permitted install path and unchanged
  public-only lock; do not claim a direct public-network install was tested.
- Search reuses the existing server-side Find model rather than duplicating its
  Teams-link and numeric matching rules in the browser.
- Native recovery controls remain independent of the lazy item screens, so the
  owner always has a path back even when a chunk is unavailable.
- Public CI on b330b46 proved clean npm ci on all six OS/Node runners. The Mac
  network is not used to judge public package availability. The one Linux/Node24
  first-screen failure is addressed by the bounded menu allocation and a browser
  stress regression: change native control font metrics and the longest hidden
  option, then force a real data refresh; header size, row position, viewport
  width and owner scroll must stay fixed. The test fails when sizing is removed.
  The exact Linux CI failure is not claimed reproduced on macOS; CI rerun is
  still the cross-platform verification.
- Necessary safety deviation from "runner unchanged": no verbs or workflow
  engine were added, but new page answers carry an optional apply-time guard.
  Existing chat/classic callers remain unchanged. A pre-enqueue check alone
  cannot prevent two tabs sending a correction or an effect index shifting
  before apply. The narrowly scoped backstop and its cross-tab/sub-entity race
  tests were independently reviewed before any item UI was activated.
- Placements, including closed subjects, are indexed from the existing `place`
  function and share its snapshot with `nextView`. Activity entries remain a
  separate history of what happened. The approved Catch up/to-do rules are not
  replaced by a new browser or projection-specific ownership classifier.
- Source links accept HTTPS only; all supported server-generated chat/review
  links already use it. Unsupported schemes remain readable labels, never
  executable links. The public-content check also caught a coincidental product
  substring in a local history variable; it was renamed for clarity rather than
  weakening the deny list.

## 0.2.46 I34 (decision 45): the page previews the automated marker, it never signs

PE 05:30 (I34), PM A R43, Designer designer-automated-marker.md. The marker means "Delegate wrote this and nobody changed it";
SEND's markerFor decides it on the server. The page only previews it, from the projection's own marker string (draft.marker), and
never appends it: "Send your version" and "Send your edited reply" send his words exactly as typed.

- The reply box is one frame holding the textarea and, when the marker is configured, a fixed footer row with the marker. The
  footer is a sibling of the textarea (not in its value): it can't be selected, typed into or deleted, and clicking it puts the
  caret at the end of his words. It shows only while the box equals the draft, trailing whitespace aside; one changed character
  removes it and shows 'Your words: sent without "<marker>".' under the box; editing back restores it.
- The textarea's description is "Teams will add: <marker>" while the footer shows, or the muted line once edited. A polite live
  message fires once per change of state, never per keystroke or on first render.
- Write the reply yourself never shows a footer; once he has typed, the same muted line explains why, when a marker is known.
- New's row line 3 ("Your reply: …") shows his words only, never the marker. Read-only drafts and the "draft so far" fold still
  show what is delivered.
- Boxes without a configured marker are unchanged (no frame).

## 0.2.46 PE 01:13:27Z nit 4: a countdown button never moves its neighbours

A button with a countdown ("Undo 0:42", then "Undo window closed") changes its label on a timer. It reserves its widest label at
mount: the closed wording and the countdown with every digit as 0, as hidden layers in the same grid cell, with tabular digits.
Later labels swap in place, so the button's width and its neighbours' positions never change. Other buttons are unchanged.

## 0.2.46 decision 46 (3)-(4), PE 06:23:42Z B: the 600 ms shift-then-press guard

A pointer press on an ActionButton does nothing when the button's viewport top moved by 4 px or more within the 600 ms before
pointerdown, unless the move was his own: wheel, touchmove, scroll keys, a pointerdown outside any control (the scrollbar), opening
or closing a card ([aria-expanded]/summary), input in the same card, or a scroll that continues one of those. App-initiated moves
(scrollIntoView, Find's Open, anchoring, late content) are not excepted. Enter or Space is never refused. A refusal shows the
existing muted line ("The card changed as you clicked. Nothing was done; check and click again.") and never synthesises a click;
the console logs '[guard] refused <kind>' (codes only). Event-driven: a DOM change, resize or scroll schedules one measurement of
the mounted buttons in the next frame; nothing runs when idle. A settle under 4 px (fonts, a scrollbar) can't put another control
under the pointer, and the stored top only advances when a move is recorded, so drift still adds up.

Follow-up (PE 06:39:54Z A (a), CR 06:40:30Z B1): the guard measures BOTH axes, viewport top and left, 4 px each, so a sideways
slide within a bar (8e077af7's 31 px wider-label case) is refused like a vertical one. Every pointer press is judged on its own: the
refused flag is cleared at each pointerdown before the check, so a refused press released off the button leaves nothing behind.
Only a pointer-originated click (event.detail > 0) is ever refused; a keyboard click (Enter or Space, detail 0) always acts. The
catalogued refusal count is deferred to 0.2.47 (a client-event route plus SEND's 'page.guard.refused'); 0.2.46 keeps the codes-only
console line.

## 0.2.46 C2 companion (SEND 07:39:56Z Q): the chat-normal confirmation names an untitled group by its place

The "Mark normal again" confirmation on a marked chat ("Stop treating <chat> as private/off the record/shareable within your org?")
names the chat as placeOf(store, { id, name })?.sentence ?? the stored name, the same helper SEND's setChatLevel uses. An untitled
group whose stored name is its raw id, "Group chat" or a member's name reads "your group with Dev, Kim +1" (or "a group chat" with no
cached names); a titled chat or a 1:1 keeps its stored name. No new wording or formatter; the action key and privacy level are unchanged.

## 0.2.46 Left for you from wf.left (Left-for-you contract; PE 07:35:05Z rule 5; PM A R35 (d))

The card's "Left for you" lines come only from wf.left (HOST's merge, ae4ebc9b). No reader matches stored wording (rule 1): the
projection's "Not made for you" split of kept to-dos, its "Couldn't prepare" regex and the refused-from-to-dos parse are gone, and so
is next.ts's REFUSED split. A pre-0.2.46 refusal string is a plain kept to-do line, shown whole (rule 6).

- **Words** (rule 2, web/model/left-words.ts): what he does from action.verb/pr/target ("Merge PR 4200002.", "Cast your vote on PR 5.",
  "Answer Kim's question on PR 5." for a reply to the asker's quote); a quote is shown as a quotation; why only behind "Why?".
- **Source line** (PM forms, no thread ids or raw links): "Kim asked in a comment on PR <n> · Tue ↗", "Kim asked in <place> · Tue ↗"
  (1:1: "Kim asked you"), "From your reply to Kim · Tue ↗", "From Delegate's review of PR <n> · Tue ↗"; the link opens source.href.
  Refusals add "· Why?".
- **One button per kind** (page-only): other-pr with a suggested reply, "Copy reply · open thread ↗" (copies, opens the thread, then
  "Reply copied: paste it in the thread." only when the copy happened, else "Couldn't copy"); setting-off, "Turn it on in Settings"
  (#settings/<key>; Settings focuses that row); pr-lifecycle and deploy with a PR link, "Open PR ↗". Promises have none.
- **Ticks, Undo and the two line verbs** (decision 53, PE 08:05:12Z; SEND 5e0c865a): every open line has a tick in the same list as his
  kept to-dos, kept first then lines, the order the server binds ("tick n" is its n-th id). "I've done these" binds that list to
  SEND's separate leftRev (never workflowApprovalRev, so a new or cleared line can't stale a Send), passes the ids in page.todoIds,
  and HOST's doneTodos clears ticked lines as owner/ticked. Undo is the existing 6 s window before anything is sent (P0-07): nothing
  reaches the server inside it, so no server undo is needed. An incomplete line offers "Ask Delegate again" and an old-invite line
  "Draft the invite again" (HOST's left-ask-again / left-draft-invite, the line id in Answer.text, leftRev bound, draft only). A left-
  only item's card leads with "I've done these". A plain page Close is not offered while lines are open (SEND refuses it).
- **Seen done** (rule 5): a line HOST's probe cleared as seen-done shows once, "✓ Done (seen on PR <n>): <words>", with its source and no
  button, on the first visit whose cursor is older than cleared.at; the next visit no longer shows it, and nothing is stored per view.
  It never counts as left in the row line.
- **Placement:** factsOf counts todos as openTodos + openLeft, so an item that went done automatically with open lines stays a
  todo row (core/whose.ts:52); its row line and Classic Ongoing's "Left for you:" use the first kept to-do, else the first line.

## bug 10-25 G3 (decision 52): a Catch up row named an untitled group by its raw chat id

Every group label in page text goes through placeOf, with the existing A120 words: the Catch up attribution (view.ts itemRow,
'<first> · ' + placeOf(...).row), the In progress row's chat (view.ts, .row), Numbers' reply rows (numbers.ts, ' in ' +
.sentence) and the page result line (result-line.ts, the projection's chat.place.sentence). A titled group keeps its name; an
untitled one reads 'in a group with <first> +N' (row) or 'your group with …' (sentence), or 'in a group chat' / 'a group chat'
with no cached names; never a raw id.
A receipt that kept an untitled group's raw chat id (stored before 0.2.46's writer fix) loses it on the page: the result line
reads just the name (decision 52 C(1)). Numbers' label leaves out the send's own asker, as the reply rows do.
## Owner 13:41 (25 Oct): item keys swapped, k = next, j = previous (PM 08:15:34Z)

New (Now) and Classic (Focus): k moves to the next item and j to the previous one. The arrows stay spatial and unchanged, → next and
← previous; no Up/Down (they scroll the page). Copy, as the PM wrote it: Classic's hint bar "k next · j previous"; both help dialogs
"k or →: Next item" and "j or ←: Previous item". The send hint is unchanged (the OS-specific hint is not in this scope). With no item
open, j still opens the first one (the index clamps), as before.

## 0.2.47 DD4-C1: the report form says whose step it is and what the button does (PE R4; PM decision 4; Designer DD4)

Same contract, copy only. The your-step report form (New and Classic, one ItemCard) leads with the context line "**Your step (from
<day>):** <step>." (normal weight, bold lead-in), where <day> is work.waitingOn.since, carried as the read-only yours.since only when
the work waits on him; without it the line reads "Your step: <step>.". S2's "Then Delegate shares the result with <asker>, after your
OK." is removed (a build check line, when there is one, stays on its own). The primary is "Draft the update to <first>", still
disabled until a result is picked. Under it, on its own row in the bar (it wraps at 400 px): "Delegate drafts it from your result.
Nothing is sent until you press Send."; the form's old "Nothing is sent. You see the draft first." goes, so the card says it once. The
S7 hover for that button: "Delegate drafts your update to {name} from your result. Nothing is sent until you press Send." No engine or
schema change; card goldens unchanged (none named this text). Not in scope: C2a, C3, Stop tracking, the Dismiss menu, re-checks.

## 0.2.47 C4, the page half: an owner-wait "no news" row offers his own step, not a nudge (PE 09:25:25Z (2); PM round 3/4)

Paired with HOST 492f22b6 + 46c19ee6 (the question words and the shared waitsOnOwner); neither half ships alone. When the open work
waits on HIM (runner/work.ts waitsOnOwner(wf, s.me), the same identity set askWhatNext uses), the check-date row reads "Still on your
list since <Tue 20 Oct>: <his step>." (waitingOn.since in his time zone; next.what, else the goal) and offers, with existing verbs only:
[Report how it went] (the row's {text} primary, which opens the card with the existing your-step report form, the same answer verb),
[Remind me in 3 days] (wait <code>: 3d) and [Close it] (close <code>). No follow-up draft to the asker. The report form is exposed for
that row exactly as for a your-step row. Every other check-date row (waiting on other people) is unchanged, as are the trigger, status,
placement and consent (workflowApprovalRev). The row button's hover is the Designer's S7 line for Report how it went.

## 0.2.47 prAnchor.also: "Also mentions PR <n>" from the anchor (architecture 43(d); pairs with HOST 4d0cbf6b)

HOST stores the other PRs a multi-PR ask named on the item's first anchor (prAnchor.also, frozen) and no longer writes an
"Also mentions" context line. The card shows the info fact "Also mentions: PR <a>, PR <b>" from that list, only while the anchor holds
as prTarget honours it: the item isn't done or redacted, the anchor's message is still among its messages, and prTarget returns the
anchor's PR (no conflict). An older item may still carry the retired context line of that label until its report is replaced; when
the structured line shows, it replaces that one, so the card never shows both. An anchor without also (older data) shows nothing; no
backfill or guessing. Guards still use prTarget, not this line.

## 0.2.47 H1 consumer: chips from the stored suggested answers; redaction and the page digest include them (decision 57)

HOST 23ea9d40 stores a question's suggested answers apart from its words (wf.questionHint {answers}). The card's answer chips come
from it when the record has that field, and only while wf.question is non-empty, so a hint left after a question was cleared stays
inert (CR 10:17:09Z). The quote match on the question text ('"<code>: <answer>"') is kept only for older records with no questionHint
field. store/retention.ts's redaction sweep clears questionHint with question (privacy-mandatory: its field list is explicit), and
store/page-revision.ts's page digest includes questionHint, so a same-words question with new suggested answers refreshes the chips. No
parser, schema or send/repair behaviour change; SEND's own question writers clear it in their commit (same cut).

## 0.2.47 A76: the reply that went, as a sent bubble (decision 55; designer-sent-reply SR2-SR6, PM 09:58:23Z)

The projection adds Item.sent = {at, teams?, text, by: you|rule, holding?}, only when wf.sent.msgId is present, its Undo window is
over (undoUntil absent or past), sendText ?? text is present, and no newer turn exists (!revAt || revAt <= sent.at). Otherwise it is
omitted and today's card stays; it is never inferred from read-only status, copy or status text. teams is the sent message's Teams
link (messageLink, test-chat guarded); without it the ↗ is dropped. With item.sent, the reply slot shows the head line "You replied to
<first> · <time> ↗" ("Delegate replied to <first> by itself", "You sent a holding reply to <first>") and the delivered text, marker
included, in the same MessageBubble as their message (the S9 six-line clamp, "Show the whole reply (N characters)", opened up to
360 px, keyboard-scrollable, the toggle naming its count and controlling the bubble), with the own-message tint. No "Your reply to"
heading and no pre-send count line. MessageBubble's new label/controlsId/noun props default to today's, so their-message markup is
unchanged. The rule-sent "because you wrote…" line is omitted: the history row carries only the rule id, no frozen words. Unsent
drafts (editable or read-only) are unchanged and never clamped. One ItemCard serves New and Classic.

## 0.2.47 SETTINGS-IDLE-180: Check Teams every, 1 to 240 (Coordinator 11:59:02Z/12:02:38Z, PE 11:53:23Z, PM 12:02:02Z final words)

web/settings.ts pollIdle: the validator takes a whole number from 1 to 240 (was 60; PE found no technical cap, PM chose 240), error
"Give a whole number from 1 to 240.". The help, now a function of the saved value, says what the interval paces and what wakes sooner:
"How often Delegate does its routine checks (new messages, PR changes, follow-ups) when nothing is going on: about every <N> minutes
(1 to 240). Some work wakes it sooner: what you approve here, scheduled sends and your watches, and it checks more often for a while
after a reply goes out. If you choose 15 minutes or less, it checks about every 5 minutes during your work hours." Above 60, the
existing save-result line reads "Saved. When things are quiet, Delegate may take up to about <N/60> hours to notice new messages or PR
changes. What you approve here and scheduled sends aren't delayed, and your watches keep their own schedule." (N/60 to the nearest
half hour, "1 hour" singular) as the whole save line, the PM's words exactly with no "It applies from the next cycle" suffix
(spec.savedLine; PE 12:04:54Z); at 60 or less the save
line is unchanged. Both UIs draw these rows and save results from settings.ts, so New and Classic match with no layout change. The
watch clause is true only with HOST's same-cut due-tracker companion (tick.ts reschedule); the runnerSilent health formula is
excluded. Old data: none, every saved value stays valid.

## 0.2.47 COST-USAGE, New half: Numbers › AI USE and the per-item "What it used" line (pm-usage-cost.md; PE 11:28:00Z, PE FINAL launch-window rule 12:29:36Z / PM CLOSE 12:35Z; Coordinator 12:17:26Z)

core/numbers.ts: slim() keeps, for every log line with a runKind, a compact run event (kind, models, modelCalls, tokensIn/out,
toolCalls, ms, runId, workflowId, job, machine; no text), and each machine's first line of each release (v), so week files and the
live log feed usage like the other numbers. usageRuns dedupes by runId across machines and copies. useOf sums each field over the
runs that measured it and leaves it undefined (shown "unknown", never 0) when none did; a row with no runs is a measured 0.
reported = the run logged any usage field; X of Y = reported of runs. The PM's 8 rows map runKind: draft; review+job; ask;
reminder; rule; owner-reply; promise; change and any unknown kind = Other (runKind is read as the logged string; RunKind is HOST's).
A run's model is its first (most-used) model; a run that reported none is only in the Total. coverageSince (PE 12:23:15Z): the
latest, across the machines that ran something in the window (read from every run line, before the runId dedupe), of each one's first line with release >= 0.2.47; undefined while
one has none. FINAL launch-window rule: a window ending after coverageSince is AFTER, with totals, models and X of Y over
[max(start, coverageSince), end] and AU2's "Counted since <date>" when clipped; a window ending before, or with an older-release
machine, is BEFORE: the AU2 subline "Owner-reply and promise checks not included before <date>." ("…not included." without a
date; with no 0.2.47 machine yet, PM 12:49:18Z: "Not fully counted yet: checks of your own replies and promises are included after
Delegate's next update."), no totals, no X of Y, no bars, and every breakdown cell "not counted". Bars: weeks wholly before have no value and the text
"not counted" (never 0); the coverageSince week counts from it, its hover "Counted since <date>". No "Fully counted since",
"partial" or "lower than" words.
web/numbers.ts usageModel: the words and cells, the same for both UIs. Credits line (PM 11:40Z), the headline "<window>: N AI
runs · T tokens", "Usage reported for X of Y AI runs", "<Y−X> runs didn't report usage" with the kinds as its hover, k/M with the
full number as abbr title, and the column hovers (Tokens is the PM's; the other four PM-confirmed 12:49:18Z). Numbers are
not links (PM rule-2 exception); "How is this counted?" carries USAGE_RULE. Copy a summary is unchanged.
features/AiUse.tsx + ai-use.css, mounted in New and Classic Numbers between Promises and Copy a summary: the tab's window select
drives it; Details is a disclosure (aria-expanded, collapsed after, the breakdown open before); real tables with th scope; under
560 px of section width each row stacks as a block, no horizontal scroll.
AU4: usedLines(store) maps an item to "What it used: N AI runs · T tokens · <time> · <model>", counting only what its reporting runs
reported, plus "(<k> run(s) didn't report usage)" when some didn't; "What it used: N AI runs · usage unknown" only when none did (PM 12:49:18Z); a run counts for its workflowId, a job run only when that job serves exactly one item, owner-reply never. Cached:
older weeks are counted once until one of their files changes, this week and last on each log change. Projection: Item.used and
DoneEntry.used; ItemCard draws it last in Details, just before Ask (Classic's pane is the same card); New and Classic Done draw it
last in the expanded row. Old data: none migrated; pre-0.2.47 windows stay BEFORE.

## 0.2.48 COUNT58 B1, the New reader: C4's date from ownerStepSince (PE 15:01:41Z; CR 14:57:57Z B1; pairs with HOST 0dd125cd)

With HOST's union ownerNext, waitsOnOwner is also true for an explicit next 'you' with no waitingOn, so the check-date row's
"Still on your list since <day>" headline and its facts date read core/whose.ts ownerStepSince(work, createdAt)
(waitingOn.since, else the last step, else when the item began) instead of waitingOn!.since: no TypeError on that shape, and the
last-step date. Words unchanged; ownerNext's three accepted cases unchanged; no migration. The DD4-C1 "yours.since" line already
reads waitingOn.since only when it names him, so it is unchanged.

## 0.2.48 COUNT58 + B3-min, the New half: "need you" is exactly needsYou; "Left for you · M" (PE decision 58 + 14:43:24Z + 15:01:41Z; Designer CC1-CC3 and DD3; Coordinator 10:47:56Z; on HOST 4603924e/0dd125cd and New e52c63cc)

next.ts factsOf: job.setup when the job's error is an agentSetupFailure (quota, model, sign-in, CLI); work.next is core/whose.ts
ownerNext (the one derivation C4's waitsOnOwner reads; next.ts's own nextWho is gone, workOf uses ownerNext too). Rows are built by
rule wherever HOST's rules place them: in-terminal (Waiting on others) "Open in a terminal on <machine>", Next "You're working on
this in a terminal · since <time>" (the window's since), primary Take it back, caption "Nothing is sent"; your-step and todo
(Left for you) with today's row bodies; setup-hold (Delegate is on it) with the job's goal, a "Why" note holding the setup failure's
own text, and Delegate "waits for an available AI model / for AI quota / until the AI is set up on this machine". NextView gains
left. Projection: section 'left' "Left for you" last; Classic needsIds drops items open in a terminal (Ongoing shows them, with
progress.terminal and Take it back). New Now: the section header and the summary's "N need you" are the move rows, so N equals its
rows; "Left for you · M" is a collapsed disclosure (aria-expanded, aria-label "Left for you, M") at the end of Now with the PM
subline "Your own steps. Nothing here needs a decision now."; each row is one line, the step in his verbs, muted "from <first>,
<Ddd D Mmm>", ↗ to Teams, and the line opens the item inline. Rows are oldest first by that date, ties by the item's opened time
(Designer CC4 (c): obligations list the oldest first, as Your move does). The group opens by itself for Find or an open left row; his own
collapse or open holds until a new reason (another left row's route, a different Find), and collapsing with a row open returns to Now
(CR 16:05:39Z B3). A Waiting-on-others row keeps A206's no-button rule except in-terminal
(Designer CC2.6). Classic: the Ongoing summary tile adds "· M left for you", M the same threads as New's group. Old data: none.
