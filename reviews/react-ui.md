# React M2/M3 bounded UI review

## Disposition

No new high-confidence P0 or P1 correctness bugs identified in this bounded
review. This is not a claim that every milestone or parity gate is complete.
No card redesign is requested.

## Scope and evidence

Read the React implementation spec, prior action-safety gates, current app shell,
feature screens, data hooks, interface state and normalized store. Inspected the
changed projection and submission contracts, including knowledge actions and
prepared receipts for immediate operations.

- Item actions retain server-issued action identity, revision and approval
  preconditions. The client persists a submission identity before posting and
  blocks another action for the same subject while its outcome is pending.
- Lost responses enter receipt checking rather than another POST. Reload recovery
  restores pending identities. Dirty and pending item cards use pinned snapshots;
  replacement is unavailable while pending.
- Knowledge save and edit actions carry exact revision preconditions. The server
  checks excluded fact positions and only advertises single-fact editing when
  applicable.
- Immediate operations save a prepared receipt before execution. Interrupted
  operations return an explicit unconfirmed outcome and are not replayed.
- The four main views are wired to their data and action surfaces. No new
  P0/P1 screen-parity defect was established by the inspected source.

The requesting session reports passing fixture-browser coverage for all four
views, stale edits, double clicks, lost responses, reload and Undo, IME and
selection preservation, folds, choices, reporting, holding and stopped states,
change subsets, settings, Numbers lists and anonymous summaries, supporting
sheets, private Ask and keyboard interactions. It also reports a production
500-row redraw measurement of 3.90 ms median and 5.30 ms p95 over 15 samples,
and public-only dependency installation on all six CI runners. These are supplied
results, not independently rerun evidence.

## Limits

Review stopped at the requested bounded source inspection. No full suite,
duplicate browser run, real-data access, other-worktree access, dependency
installation, implementation edits, commit or publication was performed.
The standing-instructions file was not found within this worktree; no external
location was accessed. This review follows the supplied owner directive and the
repository-local React spec.

## Narrow follow-up: feedback, reminders and pending edits

**Disposition:** no new high-confidence P0/P1 finding in these three fixes.
The inspected source addresses the reported races. This disposition is limited
to the paths below, not a fresh review of the application.

1. **Feedback targets the displayed send.** Feedback actions now carry exact
   revisions and expectations. Not needed declares a system-changing effect,
   explains conditional deletion and requires confirmation. The Done form
   displays that meaning. Queued feedback receives a `feedback-send` guard with
   the sent message identity; the apply-time gate rejects a missing or replaced
   send before feedback handling. The browser regression queues through the UI,
   replaces the sent message identity, applies the queue and asserts zero
   deletions and a visible refusal.
2. **Reminder recipients are checked before scheduling.** Remind-someone is
   advertised as sends/exact with a digest of the recipient list as both revision
   and expectation. Resolution builds a fresh projection and checks those values
   before immediate execution. When a recipient identity is supplied, the
   selected opaque identity and name must match that fresh list. The browser
   regression changes the list before POST resolution and asserts refusal, no
   new automation and preservation of reminder text.
3. **Refusal and newer text do not count as successful consumption.** The
   apply-time guard and exception handler record refused outcomes. Receipts
   propagate that bit and persist it on completion. Pin release requires an
   applied, accepted, non-refused result and a different current revision; newer
   edit, answer, Ask or report text, composition and separate revision edits
   prevent automatic release. Settings clear a saved draft only when its current
   value still equals the submitted value. The inspected browser regressions
   retain newer reply and answer text after queued actions, and retain newer
   settings text while a save response is held.

Verification was source inspection of these fixes and their named fixture-browser
regressions only. Their passing execution and browser-first order are reported by
the requesting session; no tests were rerun here. No broader traces, full suite,
real-data access, implementation edits, commit or publication were performed.

## Narrow follow-up: activity pinning and durable completion

**Disposition:** no new high-confidence P0/P1 finding established in this bounded
check of the coupled activity-form and receipt changes.

- **Activity identity and edits:** Done forms select revision-keyed state and
  resolve their row, linked entities and actions from the pinned snapshot.
  The Done entry index retains pinned rows even when a replacement send changes
  the activity id. Changed activity disables feedback/watch submission; a new row
  outside the pin is blocked from editing those forms. Feedback focus/composition
  and watch fields participate in retention. Explicit version replacement and
  app-version switching account for those unsent fields.
- **Durable completion:** the optional submission identity travels with the
  structured queued answer. Runner replies persist result text and refusal into
  that receipt, and final answer processing completes paths without a detailed
  reply. Refusal is accumulated rather than reset by final completion. The
  enqueue path preserves a completed record observed before its queued save.
  Receipt lookup and duplicate POST handling do not re-enqueue the action.
- **Rotated logs:** a completed receipt retains its detailed result independently
  of the bounded outcome log. An older, uncompleted receipt whose answer has
  already been archived but whose outcome is gone resolves with explicit
  uncertainty, not a fabricated success or another send. Uncertain/refused
  results cannot automatically consume pinned edits.

Inspected the fixture-browser regressions for replacement-send feedback
focus/selection/composition, changed Catch up watch text, cancellation of an
app-version switch, and lost response plus reload after outcome-log rotation.
Their assertions cover disabled stale forms, retained text, one original POST
and Undo of the intended send. Passing execution is reported by the requesting
session; this check did not rerun tests or independently exercise process races.
No unrelated features, real data or other worktrees were inspected, and only
this review document was changed.

## Narrow re-review: prepared recovery and conditional page fetch

**Disposition:** no new high-confidence P0/P1 false-success, replay or stale-gate
finding established in these two deltas.

- Prepared recovery stores the originally validated intent. Revalidation is
  restricted to non-immediate records without an existing answer or outcome.
  An `IntentError` becomes a persisted terminal refusal with its status and
  reason. Successful revalidation still falls through to the interrupted-action
  refusal; it does not execute the resolved operation or enqueue an answer.
  Existing-submission POST handling returns the receipt before the original
  enqueue path. GET recovery therefore does not introduce replay.
- The page ETag hashes the actual response content, including version, entities,
  offered actions and their preconditions, excluding only the two top-level
  clocks. Authentication precedes conditional handling. The initial Since
  fallback is stable for the server lifetime and does not override lastViewed.
  Changes to action eligibility or revision remain part of the hash.
- The client sends a conditional header only with a cached snapshot, caches only
  schema-validated page responses, separates entries by location query/token and
  Find query, and bounds retention to ten entries. An empty 304 returns that
  request's captured snapshot; a 304 without one fails explicitly. Submit and
  result requests do not opt into this cache.

Verification was limited to source inspection of these deltas and their immediate
control flow. The requesting session reports browser proof of an empty 304 and a
changed 200; that proof was not rerun or its tests reviewed here. No other
implementation review, build, suite, owner-data access, source change or push was
performed.

## Narrow re-review: grouped-part editable gate

**Disposition:** no new high-confidence P0/P1 finding in the one-line gate change.
Using snapshot workflows in `needs_human`, rather than the grouped home-card
list, restores existing canonical actions for an independently owned open part.
No other workflow state enters this editable set.

The surrounding item loop builds each card from its own workflow and binds its
actions and parsed commands to that card's code, revision and expectation.
The change does not substitute the grouping home's code or alter approval
preconditions. Source inspection therefore supports the intended part targeting;
it is not independent browser proof that selecting A701 queues A701 and never
A700. That targeted proof remains with the requesting session, which reports it
in progress. No tests or broader implementation review were performed here.
