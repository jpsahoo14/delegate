# React visual parity: separate spec review

**Disposition: approved for implementation, with the guardrails below.**
No high-confidence blocking functional, accessibility or scope defect was found
in the Visual parity plan. This clears the spec-review gate, not implementation
or visual acceptance.

## Evidence and scope

Read [the design spec](../design-spec/react-app.md), including Visual parity,
[the PM spec](../pm-spec/react-app.md), and the current New references:
[shell](../src/web/app/view/next/index.ts),
[rows](../src/web/app/view/next/row.ts),
[Now](../src/web/app/view/next/now.ts) and pertinent
[CSS](../src/web/app/app.css) tokens, header, row, inline-card and narrow rules.
The data inventory, ranked scenarios and three alternatives support reusing
New's presentation without importing its renderer or command actions.

## Implementation guardrails

- **Presentation is not action parity.** New's row renderer can execute
  `primary.command`, secondary commands and Tell forms. Do not port those
  handlers or command strings. A filled Open only opens; React's server-issued
  actions, exact-text previews, revision checks and pending gates remain intact.
- **Inline must not mean remount on refresh.** Moving the card into its row must
  retain stable subject/revision identity, pinned dirty state, focus, selection
  and IME composition. Remove only Now's duplicate heading and pager; keep a
  meaningful accessible card name and preserve Done/other card contexts.
- **Compact must not mean inaccessible.** Preserve quote attribution, ask time,
  full-ask access and a named source-link control. Icon-only theme controls need
  the current Auto/Light/Dark state in their accessible name; narrow navigation
  must retain keyboard operation, focus visibility and expanded state.
- **Health remains actionable.** One leading health line is appropriate, but
  additional problems/age must remain discoverable, not silently removed by
  copying narrow CSS. Keep conflict warnings, fix controls and the clicked
  fix's pending/result/error state reachable.
- **Summary and note are existing state, not new events.** Reuse the actual visit
  start and per-machine noted flag. Rendering, polling or changing theme must
  not reset either. Preserve summary destinations and Undo during Find. At
  400px, wrapping summary parts must not push controls outside the viewport.

The newer Visual parity section supersedes the earlier pager wording for Now
only. Avatar hues, filled Open, header pills/logo/theme icon, compact attributed
facts, one summary/note and inline work-first content are within scope.
Do not broaden this into a card redesign, new ownership logic or runner changes.

## Limits and acceptance

Implementation acceptance still requires identical fictional data at 1280x800
and 400x860, light/dark, plus before/after images and layout boxes; disclose the
intentional Open-only difference. The supplied 24-screen baseline/layout.json
was not independently inspected because it is outside the repository-only
review boundary. No visual or runtime pass is claimed.

`HOW-WE-WORK.md` was not found in this worktree; the local
[standing instructions](../AGENTS.md) and supplied owner rules were followed.
No source/other documentation edits, tests, typecheck, suite, CI, owner-data
access, commit, push or publication. Model picker settings were not verified.

## Coupled visit cursor and first-time note

**Disposition: approved as a narrowly coupled data correction.** Source confirms
that `reactProjection` currently prefers `lastViewed()` over explicit `since`,
whereas legacy root rendering calls `visitSince()`. The latter preserves a
visit's earlier cursor while marking the latest look. Reading that latest mark
explains the reported summary mismatch; the supplied screenshots were not
independently verified.

- Capture `s.visitSince() ?? initialSince` per server only after `reactPage`
  succeeds on the React root path. Failed rendering/fallback must not introduce
  an extra visit mark. Reuse the captured cursor for page API projections;
  explicit `since` takes precedence over `lastViewed()`. Do not recapture on
  polling or reset the cursor to each request's time.
- ETag stability means unchanged projected content within that visit, not an
  invariant across new visits, activity or note dismissal. Keep volatile request
  timestamps excluded. Do not make the cursor or note part of action revisions,
  expectations or binding identity.
- Exposing the existing noted state is within scope. If the optional field
  means "show first-time note", invert `ui.noted` explicitly; absence is not a
  dismissal. Existing `/ui` with only `{ noted: true }` preserves the selected
  version through `saveUiFrom`. Surface dismissal failure rather than claiming
  it persisted.

Checked only the coupled server root/API, projection and store visit methods.
No implementation changes or executions. Before implementation acceptance,
cover root/reload versus polling, first-ever fallback, unchanged-content ETag,
unchanged action bindings and note dismissal without version change using
temporary fictional stores. No expansion to other features is requested.

## Implemented milestone: bounded guardrail follow-up

**Disposition: no new high-confidence P0/P1 functional or accessibility defect
established in the inspected changes.** This is not a full regression,
accessibility audit or pixel-zero claim.

- Now row title/Open/Hide controls navigate only. Sending/reporting actions stay
  inside the opened card and use the existing typed action hook. Standalone
  subjects likewise expose actions only after opening.
- Inline cards retain the subject key, revision-keyed fields, module-level
  `Field` component and stable edit callback. Focus/blur, composition, pointer
  and shortcut paths remain wired to the existing pinned-state/action machinery;
  the opening focus effect does not depend on polling snapshots.
- Only Now passes `inline`. Its duplicate heading is visually hidden, not
  deleted from the accessible name; the Now pager is removed. Other card uses
  retain their heading. More, sources and selected-subject controls remain.
- Note dismissal POSTs only `{ noted: true }`, validates success, displays
  mutation errors and invalidates page data only on success. It does not
  optimistically claim persistence or change the selected version.
- The successful React root render captures the visit cursor; page polling
  reuses it without calling `visitSince()`. Explicit `since` now wins in the
  projection. Cursor/note changes do not alter action-binding code; volatile
  request timestamps remain excluded from the page ETag.
- Mobile menu uses a native button with expanded/control attributes; hidden
  controls are removed from navigation until opened. Theme cycling has a
  current-state accessible name. Escape/outside-pointer handling remains.
  Health's named details toggle remains available at narrow widths even when
  age/more text is hidden, exposing additional problems and their actions.

Inspected the named components/styles and their directly coupled hooks/API,
server/projection and existing pin/event paths only. Parent reports direct
Chrome passes for note 503/retry/reload without version change, stable
Since/304, menu/theme, paused/edit/Ask/Undo/Resume, Wait/Close, health,
work/report/rules; these are supplied results, not rerun here. Parent also
reports 24 final same-data images and matching measured header/health/summary/
list-top boxes at both widths, with intentional nonzero image differences.
External images were not inspected in this repository-bounded check.

Only this disposition was edited. No source edits, duplicate browser run,
tests/typecheck/suites/CI, owner-data access, commit, push or publication.
