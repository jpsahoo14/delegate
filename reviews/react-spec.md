# Review: React preview specs and dev plan

Separate-session, read-only review of `dev-spec/react-app.md`, `pm-spec/react-app.md` and
`design-spec/react-app.md` against HEAD `c1ead6c` (`src/web/server.ts`, `view.ts`, `next.ts`,
`src/mcp/server.ts`, `src/core/verbs.ts`, `src/runner/apply.ts`, `src/store/state.ts`, `src/web/app/**`).
No owner data, other worktrees or external spec folders were read. `HOW-WE-WORK.md`, the approved
`design-spec/new-experience.md` and the U01-U61 list are not in this worktree, so I checked New-layout parity
against the shipped New code (`src/web/app/view/next/*`) and `docs/scenarios.md`.

Verdict: **not ready to clear the gate.** The direction is sound: preserve the New layout, project on the
server, use a typed action registry and leave the runner unchanged. Three P0s are in the action path. Each
can send words the owner did not approve, or refuse an action the page advertises. Fix them in the spec, with
tests, before M2.

## P0

**P0-1. The command grammar lets free text start a second command. The registry must not re-parse strings.**
`parseVerbs` splits on commas and starts a new command at any segment that parses
(`src/core/verbs.ts` lines 46-52). I ran `parseVerbs` on these inputs:

| Input | Parsed |
| --- | --- |
| `send A7: Yes, ok` | send A7 "Yes", plus a bare `ok` (it goes to `latestPreview`) |
| `A7: Tuesday, ok` | answer A7 "Tuesday", plus a bare `ok` |
| `A3: Use this: The doc is ready, ok A9` | answer A3, plus **ok A9** |
| `A3: Issues found: 403, ok A9` | answer A3, plus **ok A9** |
| `wrong A3: missing link, send A9: hi` | wrong A3, plus **send A9 "hi"** |

Today's page builds commands from typed text and from text it did not write:

- `send ${code}: ${text}` and `${code}: ${answer}` in `model/derive.ts` (lines 58, 64, 76, 83).
- The your-step Tell and Report form.
- `markCommand` in `model/forms.ts`.
- `ask ${code}: ${q}` in `state/actions.ts` (line 209).
- `${code}: Use this: ${n.a}` in `control/clicks.ts` (line 68). Here `n.a` is AI-written text that a chat can
  influence, so one click on "Use this" can approve another item.

This breaks R-REACT-03 (exact text) and the negative case "injected text must not cause an unapproved send".
Dev-spec step 5 says the registry is "enqueuing the existing command". If that means building a string for
`actResult`, React inherits the bug.

- *Required:* move the per-subject logic out of `actResult` (state checks, already-done, the to-dos drawn up to
  the shown time, the multi-fact knowledge refusal, the undo checks) into
  `enqueue(store, {code, verb, text?, nums?, except?, again?}, shownAt, from)`. Both `actResult` (after
  parsing) and the React registry call it. Text stays one field and is never parsed again.
- *Test:* submit an edit `Yes, ok`, an answer `Tuesday, skip A9`, a report `403, ok A9` and a Use-this note
  containing `, ok A9`. Assert exactly one answer, on the right code, with the exact text, and nothing on A9 or
  the latest preview.
- Fixing the existing page is a separate change, but it should be scheduled: it is a live P0.

**P0-2. Undo for replies the owner approved is offered but refused.**
Commit `68cf373` and the dev spec (step 7: "including manual sends") offer Undo for every unexpired send, and
`runner/apply.ts` `undo()` supports it. But `actResult` refuses first:
`if (p.verb === 'undo' && !wf.sent?.byRule) … "I can't unsend a reply you approved yourself"`
(`src/mcp/server.ts` line 365). The browser tests post to a fake server, so they never reach this check.

- *Required:* fix the gate as part of P0-1's `enqueue`, so it matches the runner, before any React Undo.
- *Test:* use the real `serveInbox` with a temporary store. Undo a manual send inside its window and assert the
  answer is queued. Repeat after `undoUntil` and assert it is refused, with nothing queued.

**P0-3. A lost response can lead to a second send. Submissions need an idempotency key.**
If the response to an accepted POST is lost, today's page says "Nothing was sent. Try again"
(`state/actions.ts`, the `act` catch). A retried `send A7: …` passes the done check, because
`p.verb === 'send' && wf.sent` is allowed for corrections. The words go out twice.

R-REACT-04 says unknown outcomes are not retried, but the spec gives the client no way to learn the outcome.

- *Required:* the request carries a client `submissionId` (a UUID per click). The server records it with the
  answer, de-duplicates it and answers `GET result?submission=`.
- *Required:* a network error says "Not sure it went through. Checking…" and looks the outcome up. It never
  says "Nothing was sent", and the action stays disabled until the outcome is known.
- *Test:* double-click; and drop the response, then retry. Each must queue one answer.

## P1

**P1-1. The revision rules are undefined, and a blanket stale check would block harmless actions.**
`rev` today is a timestamp: `revAt ?? updatedAt` for items and watches, `updatedAt` for automations and
progress, `revAt` for knowledge. The runner compares `seenAt < revAt` at apply time, and only for `ok`, and for
`edit` or `send` when changes remain (`apply.ts` line 132). `updatedAt` changes on any runner touch. If the
pre-enqueue check refuses on any rev change, Later, Pause, Nudge, Mark read and Mark done will fail often on
items that are working.

- Define `rev` exactly as the runner's `seenAt` value. Do not use a projection hash.
- Add a per-action `staleness` field: `exact` for ok, send, edit, except, pick and undo; `none` for the rest.
- Keep the apply-time check as the authority. The pre-check only refuses earlier; between enqueue and apply
  the item can still change (a TOCTOU window).
- For ok, also send `expect` (a hash of the draft text shown) and compare it before enqueuing. That covers any
  draft change that forgets to bump `revAt`.
- `waiting` rows have no rev in `View` or in the table. Add one or mark them `none`.

**P1-2. `byRevision[code@rev]` conflicts with R-REACT-06.**
If edits are keyed by revision, a new revision during editing unmounts the field and the text disappears. The
current page solves this in `merge()`: a dirty card stays on its old version, shows that a newer version
exists, and keeps pending cards until their result arrives.

- *Specify:* while an item has unsent input or a pending action, the card stays pinned to the revision it
  shows. A "Newer version" notice offers Show new version, which asks before discarding the text. Submitting
  on the pinned revision is refused (P1-1).
- *Test:* poll during IME composition and during a pending action, then check that a later revision never
  shows the old text or result.

**P1-3. The schema is missing fields the current New page and card use.** Without these, parity cannot pass:

- items: `thread[]` (who, text, at, owner; this is "exact ask/thread"), `why.reason`, `why.confidence`,
  `why.gaps`, `why.searched`, `job`, `people`/`chat` details (group, guests).
- placements: `when`, `draft`, `msgs[]` (Find by pasted link, SC-277), the structured parts of `facts`
  (`quote`, `notes`, `until`, `also`, `promise`, `verb`), `next.at`, `next.owner`, `subjects`, `who`.
- work: `yours` (with its build check), `then`, `total`, `happened`, from `NextWork` and not only `WorkView`.
- doneEntries: `why`, `msgs`.
- metadata: `ui.noted` (first-time note), `also`, `details` (runner log), `catchUp.top`, `minute`, `handled`,
  `off`, `paused`, `running`, `progress`, the `people` list (the Remind someone form), `version.checkedAt`.
- people: ids derived from names merge two people with the same name. Use a projected stable id, for example
  from the asker id or the chat.

Add a check that every field `ItemCard`, `NextRow`, `NextWork`, `DoneRow` and `View` read is mapped or
explicitly dropped, so drift fails a test.

**P1-4. The action registry has no contract.** Specify:

- routes and methods, for example `GET /v1/page`, `POST /v1/act`, `GET /v1/result`, `GET /v1/numbers`, with
  body limits;
- status codes: stale 409, no longer offered 410, invalid input 422, accepted 202 with ids, answered on the
  spot 200 with text (`more`, check now, report, missed and watch return no ids);
- an input schema per kind: text length, `nums` and `except` against the change numbers, the report result
  enum, and the existing refusal of an edited reply combined with `except`;
- an `effect` class per action: `sends`, `changes-system`, `local`. Then "rows never send" is a tested rule,
  not a convention.

Non-item actions also go through the registry: retry, check update, report, missed, unwatch, the auto
switches, the first-time note, Mark all read and `/automate`.

**P1-5. Serving: CSP, token on lazy assets, updates during a session.**

- The current CSP is `script-src 'unsafe-inline'` and allows no `'self'` scripts, so the React page needs its
  own policy: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'` (Radix sets style
  attributes)`; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  Add `Referrer-Policy: no-referrer`, because the token is in the URL and sources link to other sites.
- Your plan is to rewrite manifest-owned relative imports to keep `?t`. Vite's `__vitePreload` builds the
  dependency URLs at runtime, CSS can contain `url()`, and the module-preload polyfill can fetch on its own.
  Rewriting minified output is fragile. A simpler option: Vite `base: './'` and serve under `/r/<token>/…`.
  Every relative chunk, CSS and preload URL then carries the token with no rewriting.
  If you keep the rewrite, add a real-browser test: open a lazy screen (Numbers or Settings) on a cold cache,
  then strip the token and expect 403 for the chunk, its CSS and its preload dependencies.
- An auto-update replaces `dist/web-react`, so an open tab's lazy chunks return 404. Specify what the current
  page already does: reload when `version.code` changes, unless the owner is typing. On a chunk-load error,
  show "Updated — reload". Edge validation of `schemaVersion` alone does not cover this.

**P1-6. Panel, snapshot and older readers with `ui: "react"`.**
`pickUi` returns the server's `ui` for the MCP panel. The panel cannot load separate assets, and the old
bundle has no React experience, so after "react" is saved the panel's behaviour is undefined. `hashUi` and
`cached()` only know new and classic.

- *Specify:* the panel and the snapshot draw New, or Classic, when the choice is react. `#ui=react` is either
  supported or deliberately not. The switch back keeps the localStorage cache consistent.
- *Test:* the panel renders with `ui: react` saved.
- Note: `saveUi` sets `tried` only for `new`; decide whether that is intended for react.

**P1-7. The parity scope is unverifiable and partly creeps.**

- U01-U61 and the approved New spec are only referenced. Add them, or a pinned in-repo copy or summary, with
  the planned matrix, so a reviewer can check them.
- The New page has things the four-tab statement omits: the `#knowledge` (To learn) route; the shortcuts
  `g h`, `u` (undo last), `?`, `/` and Esc; Done counts on the tab and the narrow menu; the first-time note;
  the undo strip; the footer (Remind someone, Channels with Stop, version, Check for updates, Report a
  problem); "Make it an item" from Find; Mark all read; the seen rules (marks 1.5 s after first shown, opened
  rows at once, only visible sections when narrow, not while hidden or in Find, up to `V.now`); document
  title; status pill; toasts and live region.
- "Capabilities currently reachable only from Classic" (M4) are not listed. Adding them to the New layout is a
  UI change that needs its own data, scenarios, designs and review under the owner's rules. Either list each
  one with its New placement for approval, or leave them in Classic for this preview.

**P1-8. Process.**
The spec says "implementation not started", but this worktree already has uncommitted dependencies, Vite
config, `scripts/build.ts`, `state.ts` and `server.ts` changes, and a red test (M1 plumbing). Update the status
line. Keep M1 limited to plumbing until the P0/P1 fixes are in the spec.

## P2

1. **One data owner.** The server already returns normalized v1 tables, so normalizing again into Zustand
   duplicates the Query cache. Keep the data in TanStack Query (`select` plus memoized selectors) and use
   Zustand, or `useSyncExternalStore`, only for interface state. That is one way to do each thing.
2. **One test runner.** Vitest, jsdom and Testing Library add a second runner next to `node:test` and the
   existing Playwright fixture tests (`test/next-browser.test.ts`). Prefer node:test plus the fixture browser
   tests; component-level tests can use Playwright component pages or plain React rendering under node:test.
3. **Clock.** The Undo countdown should use `serverNow` plus an offset, not the browser clock, so skew cannot
   show Undo after the server refuses it.
4. **Links.** Allowlist secure-web `href` schemes on the server and render every external link with
   `rel="noopener noreferrer"`.
5. **The two "rev" fields.** Placement `rev` (the row's draft revision, used to clear a row's result) and
   item `rev` are different; name them differently.
6. **"Self-contained" versus lazy screens.** Clarify which is meant: lazy chunks are fine with P1-5.
7. **500-row measurement.** Also record the payload size and the server projection time, `view` plus
   `nextView` per poll, not only the browser update time.
8. **Contrast.** The design spec should say that the shadcn defaults are overridden by the product tokens.

## Alternatives, briefly

| Topic | Spec | Suggested |
| --- | --- | --- |
| Enqueue | Format existing command | Shared structured `enqueue` used by `actResult` and the registry (P0-1) |
| Retry safety | Poll accepted ids | `submissionId` with server de-duplication and outcome lookup (P0-3) |
| Staleness | Reject any stale rev | Per-action `exact`/`none`, plus a draft-text hash for ok (P1-1) |
| Edits on refresh | `code@rev` keys | Pin dirty or pending cards to their revision with a "Newer version" notice (P1-2) |
| Asset token | Rewrite imports with `?t` | `base: './'` under `/r/<token>/` (P1-5) |
| Client data | Query plus normalized Zustand | Query only, Zustand for interface state (P2-1) |

## Disposition (re-check of spec corrections, 10-22)

This is a scoped re-check of the corrected `dev-spec/react-app.md` against the findings above. It is not a fresh
review. I also read the external `HOW-WE-WORK.md`, `design-spec/new-experience.md` and `design-spec/ux-cases.md`
(61 U rows). I did not open the real-data folder.

| Finding | Status | Note |
| --- | --- | --- |
| P0-1 comma injection | Resolved in spec | Structured enqueue; chat parsing only at the chat entry. The adversarial `, ok A9` tests are an M2 gate. |
| P0-2 manual Undo gate | Resolved in spec | Eligibility matches the runner, with an expiry refusal. Needs a real-server test (not the fake POST server) at M2. |
| P0-3 lost response | Resolved in spec | Persistent `submissionId` and receipt lookup; disabled until the outcome is known. Small gap below (a). |
| P1-1 staleness | Resolved | Per-action `exact`/`none`, rev sources, the apply-time gate stays authoritative, `expect` digest. Small gap below (b). |
| P1-2 pinning | Resolved | Pin dirty or pending cards, disclose newer data, confirm before discarding. |
| P1-3 schema | Resolved | Every listed field was added; there is a drift-coverage rule; person ids are not names. |
| P1-4 contract | Resolved | Routes, 20 KB limit, status codes, `effect`, non-item actions. |
| P1-5 serving | Mostly resolved | The `?t` rewrite is kept, gated by a cold lazy-import plus preload-CSS browser test. That is acceptable. Gaps below (c, d). |
| P1-6 panel/snapshot | Resolved | `pickUi` maps react to new for the panel; the snapshot stays Classic. Needs the M1 fallback test. |
| P1-7 parity/Classic extras | Resolved as a plan | The placements match the approved New spec (footer, Find's "Make it an item", the minute line, Waiting). "Home tiles become section counts" should read "the approved Since line replaces tiles" (new-experience.md §, N1b). It must not be a new surface. The pinned inventory against U01-U61 stays an M2 gate. |
| P1-8 process | Resolved | The status line is now accurate. |
| P2 | Accepted or justified | Vitest and normalized Zustand are kept as owner-selected; that is acceptable with the read-only index rule. |

Small remaining items. Each is P2, so it can be fixed in the spec during M1 without a re-review:

- (a) Say where the client keeps in-flight submission ids across a reload: browser storage, or a server lookup of
  open receipts by item.
- (b) `waiting` rows still have no rev. State their actions are `staleness: none`, or add a rev.
- (c) Add a proactive reload when `version.code` changes and the owner is not typing, as the current page does. Today
  the spec only reacts to a missing chunk.
- (d) In the M1 working tree, `server.ts` widened the shared CSP of the Classic and New pages to `'self'`, and the
  React page is served with that shared header, which still allows inline script. Per the spec, restore the
  old pages' header unchanged and give the React page its own CSP (no `'unsafe-inline'` script) plus
  `Referrer-Policy: no-referrer`.

**Gate decision.**

M1 may proceed as foundation only:

- scaffold, the three-version menu, the served build and a read-only foundation screen;
- no item actions, no action endpoint and no command strings.

M1 must close (d) and include these tests:

- cold lazy-asset tokens, including preload CSS;
- the React CSP header;
- panel and snapshot fallback with `ui: react` saved;
- Classic and New goldens unchanged except the menu.

M2 stays gated on:

- the structured enqueue with the adversarial text tests;
- the submission-receipt tests (lost response, reload, double submit);
- the real-server manual Undo test;
- the pinned U01-U61 parity inventory.
