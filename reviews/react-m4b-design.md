# React M4b spec and implementation-plan review

## Disposition

**Approved for implementation after plan clarification.** The revised PM and
design specs address the four findings below. Display supplied Numbers fields
and put New before Earlier, without new controls, fetching, or domain
calculations. This is plan approval, not implementation or release validation.
The subsequent PageTools scope addition is also approved as bounded below.

Reviewed 2026-10-22 in a separate review conversation. No subagents were used.
The requested GPT-6.1 Sol / extra-high reasoning / 1M context picker settings
could not be verified or changed through this conversation's available metadata.
This review must not be represented as proof that those settings were selected.

## Follow-up verification

Reread both revised specs on 2026-10-22:

- The PM now requires grouping filtered, pin-aware entries using the visit-stable
  id set, including fresh arrivals. The design retains keyed Entry siblings
  under the same parent, open state and existing hooks. This addresses the
  reparenting risk without introducing group containers.
- Grouped entries use h3 below h2 group headings; ungrouped and closed entries
  retain h2. Empty New/Earlier groups are omitted.
- Within-group order is preserved. The described accumulating freshness set
  agrees with the existing hook; neither server retention nor Home counts
  needs to change.
- Numbers explicitly preserves source fields and links, hides absent values,
  asserts counted-list membership, and excludes mutation controls. Existing
  old-activity and no-item coverage is identified for reuse.

The requesting chat also confirms that the focused IME/pin regressions will run
against the new markup and that the external standing instructions were read.
Those are supplied implementation commitments, not independently executed
results. Keep the detailed state-matrix and regression checks below as
verification obligations; no further design revision is needed for this bounded
change.

## PageTools addition: approved bounded scope

Reviewed the added PM requirement and three design alternatives against
[PageTools](../src/web/react/features/PageTools.tsx),
[the automation contract](../src/web/react/domain/contracts.ts),
[the offered automation actions](../src/web/react-projection.ts),
[ActionButton/ActionState](../src/web/react/features/ActionButton.tsx),
the existing Find launcher and SC-277. The browser reproduction is supplied by
the requesting chat, not independently rerun in this review.

**No blocking design finding.** The available automation data includes exact
text, recipient, schedule, state, revision and action ids. The projection already
offers Resume and End for paused reminders. A native Paused reminders disclosure
beside Watch details therefore restores reachability without changing Now
placements, adding a tab or introducing a second active-reminder action surface.
The missing paused-row controls in PageTools are consistent with the reported
symptom.

Implementation and verification gates:

- Select strictly `state === 'paused'`, key by automation id, omit the disclosure
  when empty, and show exact text, recipient and supplied schedule. Do not infer
  paused status from absent placements, or include active, proposed or ended
  automations.
- Render the automation's offered actions through the existing ActionButton
  with its subject/revision, not reconstructed commands or a global pause.
  Preserve pending, refusal and uncertain-result behavior. Resume re-enables
  future scheduled sends; it must not be presented as ending the reminder or
  silently changing its schedule.
- Keep result/error visibility after Resume or End removes the row from the
  paused list. Row-local ActionState alone cannot satisfy this: the existing
  app-level live result, action error and pending indicators must remain usable
  without changing App. Check both successful removal and a refused/stale
  action, not just a toast before the next snapshot.
- In the temporary-store browser fixture, pause reminder A and verify its
  disclosure row and exact fields; resume A and verify active state, unchanged
  schedule, no duplicate disclosure row and restored Now reachability. Pause
  again and end it through the disclosure; verify ended state and removal.
  Keep a second reminder unchanged throughout. Assert no immediate message send
  from these management operations; do not disable or redefine future scheduled
  sends as part of the test.
- Native summary keyboard interaction, visible action names, heading hierarchy
  and long reminder text need the same narrow/light/dark checks as the other
  presentation changes.

Removing the PageTools `paste-missed` launcher is correct for SC-277: Now's Find
already uses the offered `paste-missed` action for an unmatched Teams link.
Keep that action in the server registry and leave Find unchanged. Do not remove
the underlying capability when removing its duplicate launcher.

Updating the existing "Add a missed message" browser flow to use Find is an
approved, tightly coupled test change, not unrelated test cleanup. Preserve its
watch/reminder assertions. The replacement should verify the unmatched link
offers Make it an item, the submitted link is exact, finding alone sends no
command, and an item recognized after processing no longer offers creation
(including on Enter). Assert the duplicate launcher is absent.

The approved implementation scope now includes PageTools and that browser-test
adjustment in addition to the two previously approved feature screens. No Now,
projection, routing, app/footer or other-builder changes are authorized by this
addition. No implementation edits or tests were performed by this reviewer.

## Original findings (addressed by the clarified plan)

### 1. High: require pin-aware grouping and editor-preservation regressions

The PM spec says edits remain attached to the submitted revision, but the design
does not specify the source of grouped rows or how existing editors survive
polling. [Done](../src/web/react/features/Done.tsx) currently renders the result
of [useDoneEntries](../src/web/react/data/done.ts), which merges retained activity
from pinned snapshots into live entries. Grouping only live `entities.doneEntries`
would drop an old activity after a replacement send changes its id, losing its
visible unsent form. Grouping on each row's `fresh` flag would also disagree with
the visit-stable New marker after the server marks activity seen.

Required plan constraint: filter the merged entries, then partition them using
the existing `useDoneLook()` id set. Retain `row.id` identity, `openId`, and the
existing Entry hooks and action resolution. Do not key group containers by their
counts or freshness state; keys do not preserve a child moved between different
parents. Explicitly prevent an ordinary seen update from reparenting an editor.
Keep closed entries in their existing disclosure.

Required checks: with a feedback textarea focused, a selection made and IME
composition active, mark seen and then replace the send during polling. Verify
the pinned old entry remains visible, with the same DOM field, text, focus,
selection and revision; stale submission remains disabled and no POST occurs.
Repeat for an unfinished Catch up watch. Reuse the existing replacement-send and
changed-watch cases in
[the browser tests](../test/react-app-browser.test.ts), with the new sections
present, rather than treating a retained string in the store as proof of focus
preservation.

### 2. Medium: define heading levels for ungrouped and closed entries

The design specifies h2 groups and h3 entries, but also says to show the existing
list when nothing is new and to leave the closed disclosure unchanged. Entry
currently owns an h2. A blanket h2-to-h3 replacement would leave a no-new view
with h1 followed directly by h3; leaving Entry unchanged would make entries
siblings of their group headings.

Specify the hierarchy in every state: h1 Done; h2 New/Earlier with h3 entries
where those groups exist; h2 entries for the ungrouped fallback. Give the closed
disclosure a deliberate hierarchy as well, rather than making its entries h3
without an h2 parent. Omit empty groups; specify the earlier-only and new-only
states. Preserve the existing heading button's accessible name, keyboard
activation and `aria-expanded`, and Catch up's source-link heading.

Acceptance should query heading roles and levels for mixed, new-only,
earlier-only, filtered-empty and closed-disclosure views, and operate an entry
using the keyboard. The viewport checks alone do not establish accessibility.

### 3. Medium: correct the freshness lifetime and ordering acceptance

The PM's "ids that were new when this visit started" is incomplete.
[useDoneLook](../src/web/react/data/done.ts) initializes from authoritative
freshness, retains those ids when freshness clears, and adds subsequently
arriving fresh ids while mounted. Retaining this behavior needs no new hook.

State that New membership is visit-stable and accumulates newly arriving fresh
ids. Do not freeze the initial set, derive New from timestamps, or reset it when
changing filters. Partition the filtered merged list without sorting either
partition. This retains incoming order within groups; pinned-only entries are
already appended by the merge and do not have a newly defined server position.

For SC-131, explicitly test an older fresh row before a newer seen row, multiple
rows preserving within-group order, a poll that clears all fresh flags, a fresh
arrival during the visit, filter changes and return, and a remount/restart that
still shows earlier replies. Do not alter server-side seven-day retention or
Home's new-only count as part of this presentation change.

### 4. Medium: turn Numbers parity into measurable row-level acceptance

The data assumption is correct:
[the Numbers schema](../src/web/react/domain/screens.ts) already accepts optional
`gist` and `work`, while
[Numbers](../src/web/react/features/Numbers.tsx) renders neither.
No projection/schema change or extra fetch is necessary. Plain paragraphs
matching Done are sufficient for this bounded data-completeness fix.

The PM acceptance currently concentrates on lifecycle mutations and stored
results; it does not explicitly require assertions for its top two scenarios
or SC-265. Add fixtures for gist-only, work-only, both and neither; assert each
supplied value is visible, absent values produce no placeholder paragraph, and
ask/said, attribution, time and source links remain. Check long text at both
specified widths and themes.

For SC-265, assert the selected list renders exactly its counted rows, including
an entry older than Done's seven-day window and the pointed-message/no-item
fallback with its Teams link. Numbers must remain read-only: do not reuse the
interactive Done Entry or add its mutation controls just to share row markup.
Keep this check distinct from SC-131's seven-day Done retention.

## Minimal implementation and verification sequence

1. Clarify the constraints and state matrix above in the two specs.
2. Add failing focused tests for Numbers fields, Done grouping, freshness
   lifetime, heading states and retained activity editors.
3. Limit UI implementation to the two feature screens unless a demonstrated
   failure requires a separately reviewed scope change. Reuse the existing
   data hooks and action gates unchanged.
4. Run focused React tests and the existing activity-edit browser regressions.
   Prove the visual states against the real local server using a fictional
   temporary store, never the owner's store. Record fixture results separately
   from source-inspection conclusions.
5. Treat scenarios 6-10 as existing lifecycle regression checks or named-file
   handoffs, not authorization to expand this two-screen presentation change.
   Every skip should identify its scenario and owning file.

## Review limits and evidence

Source inspection covered the two requested specs, Numbers, Done, the Done hooks,
the Numbers schema, relevant activity hook implementations, SC-131/265 and the
existing focused activity-edit browser cases. No runtime correctness or visual
result is claimed. No tests were run: this is a pre-implementation spec review
and the only written file is this review record. No code, real data, other
worktree, dependencies or commits were changed.

`HOW-WE-WORK.md` was not found in this worktree or the bounded nearby spec-folder
lookup during the original review. The requesting chat subsequently reports
reading it from the external spec path. This reviewer has not independently
inspected that external file.
