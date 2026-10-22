# React preview

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

Status: M1, M2 and M3 complete. All four screens and supporting sheets are
implemented and browser-proven. The final M4 scenario inventory follows.
Schema version: 1.
Reviews: [spec](../reviews/react-spec.md), [action safety](../reviews/react-actions.md),
[UI and narrow safety follow-ups](../reviews/react-ui.md).

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
- M4 pending: Classic extras, scenario matrix and measured parity.

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
