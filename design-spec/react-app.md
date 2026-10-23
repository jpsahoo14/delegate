# React preview: design

## Alternatives considered

### E49: reuse watch controls on the promised check-back

Compare reusing Close/Skip (wrong lifecycle), a separate watch-management
screen (another way/place), and the existing Extend/Stop buttons (chosen).
Put them on New's opened work and waiting row; project Stop to Classic's
existing progress action list beside its existing interval/Extend controls.
Reuse current local-action styling, no new panel or tab. A stopped check
disappears as a watch, but the underlying work and to-dos remain visible.
Coordinator accepted this contract in existing session turn240 and queued
the Classic progress-filter wiring for its builder after integration.

### E88: render the viewport, retain the complete queue

Measured 500-row polls exceed the 16ms budget even after removing redundant
deep comparisons. Compare (1) only memoizing all 500 rows (still redraws every
changed row), (2) pagination (adds controls and hides existing navigation),
and (3) a measured-height viewport window (chosen). Keep real scroll height
with measured spacers, overscan adjacent rows, and retain expanded/focused
rows. Direct navigation must bring its target into view; Find and Classic
next/previous still use all ids. No visual redesign or new control.
Also incrementally validate only changed fields against the same schemas;
unchanged fields reuse their already-validated values, never unchecked data.
Review in the existing coordinator session before building.
Coordinator approved in existing session turn 216, requiring retained focus,
open/edited rows, visibility-based seen marks, full keyboard/Find/deep-link
access, row positions for screen readers, and unchanged-data-only reuse.

### E51: retain the engine's complete reminder sentence

Compare (1) a new collection of bound/rotation badges, which duplicates the
engine's formatting, (2) hiding bounds under More, which hides the stop rule
at approval, and (3) reusing the existing complete sentence used by Classic.
Choose (3). Keep the headline, show the complete sentence as row context and
opened-reminder body. It wraps normally at 400px. No new visual pattern,
control or approval path. Review in the existing coordinator session.
Coordinator approved in existing session turn 207: no chosen bound may be
cut off. The complete sentence wraps without clipping in rows and cards.

### H2: compact middle-width header (supersedes wrapping below)

Measured data: at 861-1024 the old desktop controls take two rows (99px);
the full-width Experience select alone reserves 148px. Compare (1) wrapping
(safe but not today's one-row layout), (2) moving tabs into the menu early
(hides navigation that today's keeps), and (3) compacting secondary status
and selectors while retaining the tabs. Choose (3).

At 861-1200px use a status dot; retain the full checked/not-checked time and
machine in the tooltip, with an explicit accessible status name. Keep the
wordmark and tab labels/counts. Reduce header gaps and the two select widths
to their actual option text (Experience 82px, App version 132px). Hide only
the redundant visible "Experience" word; its select keeps its accessible
name. Do not shrink, clip or overlay navigation. Keep the current <=860px
menu, theme action, and >1200px full status. Retain wrapping as a final safety
net for exceptional content, but normal and long-status fixtures must be one
56px row at desktop widths. Review in the existing coordinator session before
building; do not start a new chat.

Coordinator review approved the compact approach, with two conditions:
non-healthy states retain short text (Not checked, Paused, Offline, Late or
Attention), and keyboard focus reveals the full status just like hover.
Use the existing Radix tooltip primitive for focus, hover and Escape behavior;
the status is a named, focusable indicator, not a new action. Tighten only
middle-width header gaps, select widths and tab padding to fit the warning
word too. Keep full source status and machine in the accessible name.

### P0 stale-draft result

Do not solve this with a disabled Send over old text, or with a New-only
component check. Replace absent reply results in the engine, clear drafts
when starting a new turn/job, and use one shared current-draft predicate for
existing corrupted records. Both card experiences show the latest verdict
through the existing status block and omit old reply/edit/send controls.
Reject stale captured intents and queued approvals on the server. Preserve
normal current draft/owner-edit behavior; no review session is started.

### E2E: header and counted send history

For intermediate widths, compare hiding status (loses health), shrinking tabs
(still brittle), and Classic's non-shrinking navigation plus wrapping header
layout. Choose the last, keeping the narrow menu at its current breakpoint
and allowing a second header row when desktop controls cannot fit.

For repeated sends, compare one mutable item row with a count (wrong context),
repeating that same mutable row (still wrong), and stable per-send view keys
resolved from immutable log records. Choose per-send rows, preserving existing
exchange/source rendering in both experiences and all numeric definitions.
No historical row gets send/feedback actions bound to the newest draft.
Correction export keys include the event identity; missing original inbound
evidence is omitted rather than redirected to a new turn. Done parity stays
unchanged when today's page hides the earlier replies too.

### X6/X7 names and caption

Prefer today's item-specific Ask name over the ambiguous generic name when
several reply rows can be open. Keep layout and focus behavior unchanged.
Use Window in both Numbers experiences and remove the Classic-only caption
period; New's caption already matches. These are wording corrections only.

### E08 Settings controls

Compare another Reading and watches toolbar (already rejected), a single
global Check now (still unlike today's two precise entry points), and the
two existing Settings locations backed by one shared control. Choose the
third. Reuse Classic's retry offer and state presentation, filtering status
by retry action id so update/report results cannot appear as retry results.
Details remains under More, before Changed by setup, and renders only when
Show details is enabled. Keep the runner/log read-only and text wrapping
usable at 400 pixels. Audit every row/control against today's New before
claiming parity; do not add new features.

### N4/N2/N3/N8/G5 and indirect controls

Prefer reusing existing surfaces over a second implementation: lift the
problems component to the New shell except Numbers, matching verifier X1;
reuse the activity-entry Watch/Needs me
controls for Numbers; restore Settings copy without relocating controls to a
new invented toolbar. Existing Now health actions, Watch on FYIs and Watch
something in the automation picker remain; shared/Classic capabilities stay.
Remove only the duplicate Holding reply row chip, not its headline or card.

For Daily summary, retain today's help-only template. A static reminder
would not summarize; a time editor duplicates Settings and is a new feature.
The description says 'Say it in chat: "send me a summary at 6 pm".';
activation shows 'Say it in chat: "send me a summary every day at 6 pm".'
No schedule fields, save buttons, automation creation or config writes.
Keep the shared Classic picker on that same pre-51f2aa1 behavior.
Other indirect controls get manual proof before deciding any changes.

### Control parity C1-C9

Compare retaining generic inputs (less code, but slower and different from
today), duplicating today's entire page (unnecessary state and protocol
duplication), and restoring its controls around existing React action/data
helpers. Choose the third. Reuse Classic's fixed date presets and calculate
them again when submitting; retain manually selected date compatibility.
Reuse Classic's existing automation sheet: direct entry to the reminder
editor with five quick people and Someone else when there are more, a time
list and repeat buttons. Back opens its existing template picker with four
quick person shortcuts. Existing Classic automation navigation stays intact.
Keep unsent words when returning through the picker. Ask more focuses the same private ask
field, never sends on its own. Label-only corrections must not change commands.
Latest verifier X5 removes the E96 quiet-footer opener because today's New
has none. Keep the complete E97/C9 list opened by ?. Close and Escape return
focus to the prior element, or main if that element no longer exists.
Record manual repro and proof under bug 10-22 C1 through C9 (except C7).
### Classic screen parity follow-up

Compare keeping React's extra Home footer, hiding version/keyboard help, or
restoring today's grouped version/status/update/report line while retaining
the existing accessible keyboard-help control. Choose the third: no new
capability, route or action; shared action/receipt gates stay unchanged.
Existing version metadata supplies the short update interval and checked time.
Classic-only Settings wording names Home and Waiting on others. Hide the
inline keyboard legend at the same narrow breakpoint as today's Classic,
without hiding the pager's keyboard-help button. Remove the Numbers heading's
extra flex spacer so its existing picker/range use the right edge. Apply scan,
reply/decide, FYI, pending-owner, long-running and report-verdict cases without
changing their data or controls. Check manually in Edge on fictional data at
1280 light and 400 dark; no tests during the rebuild.
For snapshots, reuse the existing Classic card in explicit read-only mode
rather than maintaining a second abbreviated renderer. Discard transient
editing presentation, suppress mutation menus/forms/actions and autofocus,
disable choice/change inputs, and retain the rich sections and Teams links.
Existing snapshot keyboard refusal remains. This is inspection, not approval.

### New parity G2, G4-G6 and G8

Compare three approaches: keep React's extra toolbar/chips/buttons (diverges
and adds duplicate controls); hide all non-core actions (strands capabilities);
or restore today's quiet surfaces while keeping existing action entry points.
Choose the third. Failed-job rows reuse the exact generated retry question,
with the existing inline opened answer field and More > Dismiss. Do not relax
command filtering for arbitrary AI-authored text.

Keep the four-tab New layout and existing row-title opener. Waiting rows have
no redundant Open button when their only operation is inspection; real local
row actions stay. The latest G5 direction removes the extra row marker:
section 8a does not require it in this location. Keep the server headline
and opened card's Holding reply/Send holding reply.
The quiet footer groups reminder, named channels, version, update and report.
Use existing sheet controls and Settings for capabilities not on today's footer;
no new tab, button family or redesign. Version uses today's tag (code) format.
Apply UX scan, reply/decide, pending-owner action, FYI/watch, long-running work
and report-verdict cases unchanged. Verify desktop/narrow light/dark and gate
the existing failed-item answer/dismiss actions on fictional stores.

### Look lifecycle parity

Keep today's markers and layout. Compared fixed-delay observer startup
(timing-dependent), moving seen ownership into every lazy screen (duplicated
lifecycle), and observing row mounts under the shared New hook. Choose the
third: observe mounted rows as lazy content arrives, enforce the existing
25%/1.5-second rule, and cancel dwell on route or visibility changes.
Start each look with the latest shared projection after ingestion; keep its
chips frozen during the look. No new controls or navigation are introduced.
The existing UX scan/open/return cases apply unchanged.

### Standalone rows

Compared inventing workflow-shaped reminder records, showing a new sheet, and
using the existing normalized standalone card. Keep the card: read the placement's
displayed entities even when it has no workflow item, honoring any revision pin.
Show the server's exact reminder text, schedule, recipient and existing
Pause/Resume/End controls. Waiting asks retain their existing follow-up controls.
No redesign; the current scan/open and reminder UX cases remain unchanged.

### E45 and the draft promise line

Compared row completion designs: (1) a hidden "+N more" marks all tasks,
which permits unseen completion; (2) list every task on every row, which
destroys scan density; (3) mark only the named row task and keep a counted
list button inside the opened item. Use (3), as the owner decided.

The row reads "To do: Update the checklist" and Mark done. After completion
the next task occupies that row. The opened item lists each text and offers
"Mark to-do done" or "Mark 2 to-dos done". Its primary action uses that list,
not the row's single-task offer. Bind both offers to exact ids and content.
Close remains a separate action, disabled with an explanation until the
remaining kept tasks have been reviewed and marked from the opened item.
No layout, placement rule, send action or chat verb changes.

For Classic Ongoing, disabling Close alone would strand to-do-only rows.
Compared opening a new sheet, adding a navigation action, and reusing the
existing confirmation gate. Choose the gate: the control says "Mark 2 to-dos
done", the confirmation lists every bound text and says the work stays open.
Cancel sends nothing. Only after those tasks are done does actual Close
appear. The confirmation's offer uses the same exact list binding as a card.

For draft promises, either reuse the kept list (wrong meaning), hide them in
Why (unsafe before approval), or restore today's inline warning. Choose the
inline warning: "Yours to do: Update the checklist", after changes and before
"Then: watch". Kept tasks retain their own list and completion control.
Apply the existing U01-U61 cases unchanged; U18 gets the exact row/list scope
and pre-send warning. Validate desktop/narrow, light/dark, with fictional data.

| Alternative | Benefit | Cost |
| --- | --- | --- |
| Embed the old page inside React | Quick apparent parity | Keeps destructive redraws and untyped commands; not a migration |
| New four-tab layout, current card parts | Familiar, small navigation, incremental replacement | Requires genuine component and behavior tests |
| New card redesign and Classic layout rewrite | Could shorten cards | Unapproved design, duplicate layouts, unnecessary scope |

Choose the second. The approved New layout stays: Now, Done, Numbers, Settings.
Now has Your move, Delegate is working, Waiting, Catch up; section membership and
ordering are supplied by the server. Rows show who, what, where, when and Next.
Find filters existing rows without changing placement.

The card keeps today's anatomy: header, exact ask/thread, type-specific body,
Why and sources, action bar, private Ask thread. Its parts are separate components.
Change meaning and warnings never hide behind approval. Rows have Open, not Send.
No chat-command teaching text appears anywhere.

The version menu reads Classic / New / React (preview) at the top right in every
version. Switching with unsaved text requires explicit discard confirmation.
Only per-machine UI choice changes. Theme and compatible Done/Numbers/Settings
routes survive the switch.

Desktop uses the New page's bounded content column. At 400px navigation wraps,
fields remain full-width and card text stays readable. Use the product light/dark
tokens, visible focus, native labeled fields and reduced-motion support.
Sheets trap focus and return it on close; Escape closes the topmost surface.
Single-letter shortcuts do not run inside fields or during composition.

## Validation

Review this proposal separately before implementation. Capture and inspect
1280x800 and 400x860 in both themes. Check every U01-U61 obligation and the
repo scenario table. Verify refresh during editing, stale revisions, failures,
undo expiry and exact action payloads with fixture-backed browser tests.

## Working-preview correction (owner directive)

Keep the server's New headline and Next wording, rather than replacing a
headline with the beginning of a message. System instructions containing chat
commands are removed; original messages and exact outgoing words are not
rewritten. Use the same short local times as New, with the verified ask time.

For open work, show Next and the owned checklist before the request/body.
Long asks are collapsed behind Show full ask, preserving the entire text.
Previous/Next counts and traversal stay within the currently visible section
and Find results, not hidden Waiting/Working rows.

Retain the reviewed four-tab design, not a second navigation scheme. Legacy
creation/version hashes use the existing sheet or discard-confirmed switch.
Learned Settings rules show their existing provenance beside Remove.

At narrow widths, retain the same status and Undo actions but place them beside
their text. Fold health age and additional problems. Keep the Find label
accessible while showing its prompt in the input. Do not repeat the paused
message in both the summary and health banner. Your move must start above the
half-height point with status, Find, summary and Undo present.

## Classic scope amendment

The owner subsequently requested a faithful React port of today's Classic,
alongside New. This supersedes the earlier exclusion of a second presentation;
it does not approve a new Classic visual design. The ranked scenarios and the
existing Classic screen specifications remain the design source.

Three integration options were compared: embedding the old DOM renderer keeps
its destructive redraws; copying every card and secondary screen creates two
action implementations; a separate Classic shell over shared React cards,
screens and data preserves the layout without duplicating the safety protocol.
Use the third. New remains the initial experience.

Classic Home uses the existing server tiles and Catch-up membership. The focus
queue is beside the card on desktop and above it at narrow widths; handled
entries remain available during that visit. Ongoing groups the same progress,
waiting, watch, channel, running and automation data as today's Classic.
Secondary-screen navigation stays within the chosen experience. The local
experience selector never writes the machine's version setting.

Catch-up watch editors retain their keyed row and revision pin even when a
background read changes freshness. Action results belong to their item; global
results are announced once, not repeated under every channel or health issue.
Only watches with an end date offer Extend. A paused health banner supplies
Resume without a second identical Home control. Offline controls are disabled
without replacing the current card or its text.

Real Chrome checks use fictional temporary stores and the existing Classic
page for comparison. Inspect desktop/narrow light/dark captures, exact saved
targets and words, keyboard navigation, offline recovery and composition/focus/
selection preservation. Per the owner's rebuild directive, committed test
coverage and the full test pass are deferred until both experiences reach parity.

## Classic visual parity follow-up

The owner found six fidelity gaps in the port. Data and ranked scenarios remain
the ones above; implement no new screen, workflow or action.

Compared alternatives: (1) clip the current oversized tiles, which leaves the
missing avatar/count hierarchy and wrong frame; (2) load the old global CSS,
which risks changing New and shared cards; (3) port only the Classic frame,
Home and health selectors under the Classic root, reusing existing tokens,
icons, dates and typed controls. Choose (3), retaining the separately reviewed
shared card/action layer and New's integrated visual header.

Use the legacy 1200px frame, 56px header, 24px desktop inset, 14px tile gaps,
1.25:1:1 tile columns and two-row needs tile. Use its 44px needs number, 22px
avatars, first names, single-line ellipsis and primary Start with arrow.
Standard tiles have 30px icon blocks and sentences with the number at 28px.
At narrow widths, needs spans the two-column tile grid; use the existing
52px mobile header, 14px inset and 36px needs number.

The health line uses warn/warn-soft and existing radius/border tokens, a 20px
warning icon, inline Since and additional-problem wording, and the existing
fix. An inline accessible button may expand the remaining problem details;
it must not become a second fold heading. Header tab membership follows the
server's pending-fact count, with To learn rather than permanent Knowledge.
Keep the experience selector separate from the machine version control, both
inside the existing Menu at every width so neither selected value is clipped.
Desktop keeps the tabs, run pill and theme icon visible; at 1100px and below
navigation joins that menu before badges can collide with status. The tile grid
still changes at the legacy 860px breakpoint. At 600px use the 52px header and status dot with
accessible full wording. These integration controls must not widen the frame.
Check optional tabs/badges at 1280px, an intermediate width and 400px.

Needs-you counts the open queue; Done counts new entries; Ongoing counts updated
watches; To learn counts pending proposals. Omit zero badges and absent To learn.
The live React transport supplies Numbers and Settings; omit those live-only
destinations from the read-only snapshot. Health/offline and paused/stopped states
warn in the run pill, and one run stays singular.

Catch-up count and top ordering remain server-authoritative. A keyed row with
an active editor/pending action may remain after leaving that top list, marked
as a retained edit rather than another new item. It must not affect the new
count or remaining count (`count - server top length`), duplicate a top row, or
remain after its editor closes. Keep a zero-new section only for such retained
edits. Render the compact row through the same shared action/revision controls,
not another action implementation. Validate against the old page on an identical temporary
store, at both sizes/themes, including a long raw table and zero/pending facts.
Do not claim correction of the underlying visit time in this visual change.

## Visual parity with the current New renderer

The current New page is the visual baseline, not a new design. Compare both
renderers on an identical fictional store at 1280x800 and 400x860 in light and
dark. Owner-data comparisons remain read-only and are not required for these
changes.

Data already available: person initials/hue, compact row facts with askAt,
quotes and source link, server headline/Next, work steps/owners, reading
timestamp/state, health lines, summary parts and the per-machine noted flag.
No AI field or new ownership decision is needed.

Ranked cases: scan a ready reply; open a question; inspect work/checklist;
see a holding reply; find an item; notice a health/session conflict; scan on
400px; retain edits during polling; change theme; dismiss the first-time note.
All eight UX families remain covered by the existing component/data surfaces.

Alternatives considered:

1. Embed the old renderer. Rejected because that retains destructive redraw and
   command formatting instead of React state and typed actions.
2. Reuse New's structure, exact tokens and spacing in owned React components.
   Chosen. Keep the existing data/action hooks and stable form DOM.
3. Restyle the existing oversized React structure with CSS alone. Rejected
   because duplicate metadata, pager and separate quote blocks would remain.

Required differences to close:

- Logo mark, tab pill/badges, Checked status pill, bounded version select and
  a theme icon cycling Auto/Light/Dark, including narrow menu behavior.
- A single health line in New's placement before Find. Additional notices and
  age follow New's compact treatment; the clicked fix keeps its result.
- One wrapping summary line with unbroken parts, plus the existing dismissible
  Same items note. Preserve the actual visit start, not a newly marked view.
- Avatar/icon lead; compact attributed facts/quote/link icon; code visible only
  on open/focus; filled Open in Your move. Opening never sends.
- Inline expansion keeps its row context. Remove the pager and duplicate
  person/chat heading in Now only. Preserve full headings in Done/other uses.
- Work/checklist/report precede supporting details; no second card below the
  list. Keep selected part controls, source privacy, action gates and edits.

Use product tokens from the existing New page, including avatar colors and
button/health shadows. This is not a standalone themed HTML artifact.
The baseline is immutable. Capture before/after image diffs and layout boxes;
report remaining differences honestly, including intentional Open-only safety
where the old page still exposes an inline sending action.

## Classic supporting screens: presentation strategy

Alternatives: (A) reskin the New screens entirely with CSS (few files, but wrong
row anatomy and extra controls remain); (B) dedicated Classic presentations over
existing queries, state and typed actions (selected); (C) insert legacy HTML and
attach its command handlers (rejected: duplicates the action/revision engine).
Reuse controlled fields, source/Why rendering, private conversation and existing
validated sheets where their structure matches. Do not duplicate business rules.

Done uses Classic's maximum 880 px list, populated-only pill filters and compact
rows. Replies read as the exchange with avatar, metadata/source and work label;
other kinds use their own icon/title/gist. Undo stays on its displayed send.
Expandable sent details show exact text, Why, feedback and private Ask, never
New's nested work-first card. New/Earlier headings and quiet-close disclosure
follow the current Classic filter semantics. Catch-up opens Teams and retains
Watch/Needs me, including a revision-safe unfinished watch form.

Ongoing retains Classic's named sections and compact rows/cards, not a second
Now. Numbers retains its counted lists; Settings retains its section navigation,
advanced controls. Pending facts retain To learn while there are live proposals
or a protected unfinished proposal. Saved facts stay in Done → Learned; there is
no separate Knowledge library/search in current Classic. The remaining comparison will
record exact source-backed gaps before implementation.

At 400 px, lists and pills wrap without document overflow; forms remain usable,
the active section is visible, and dialogs fit the viewport and scroll internally.
Dark mode uses existing Classic tokens. Negative cases: no actions on opening,
no guessed targets/counts, no discarded newer typing, no stale or duplicate send,
no silent failed save, no synthetic future capabilities or owner-data writes.

### Reviewed supporting-screen constraints

Done resolves the displayed activity by `(code, activity id)` with
useActivityCard, not by the latest send for a code. Its text/Why/source ids stay
with that displayed row; current notes and matching note/source/action entities
update independently. Extract the current Classic Why/conversation blocks rather
than embedding a complete live card. Feedback and watch fields remain keyed to
their displayed revision, with explicit newer/blocked state.

Only populated filters appear (a selected retained editor stays reachable even
if its live count becomes zero). All excludes quiet closes; Replies includes
reviews; closed aliases Catch up. Only mixed fresh/earlier lists show New and
Earlier this week. Quiet closes appear only under Catch up, including when its
main list is empty. Keep Home's Mark all read; do not add it to Done. Render rows
with stable activity-id siblings so inserting headings/fresh arrivals cannot
remount fields. Membership/counts come from current server data; pinned rows do
not inflate badges. Keep server order within freshness groups.

Inline Undo uses the shared action expiry/countdown. Sent details become
expandable after Undo is unavailable; expiry must not destroy an unfinished
editor. Feedback preserves Wrong / Incomplete / Should not have replied and the
corresponding Draft a correction / Draft what was missing / Note it or Take it
back semantics, with the offered action's meaning and confirmation. Undo never
claims to reverse already-made external changes.

The supporting source comparison found these presentation gaps:
- Ongoing: compact progress/no-change/channel rows, two-column waiting/update/
  running cards, short timestamps, interval selects (including a custom current
  interval), watch plan and four-pixel progress bars; New automation in its header.
- Sheets: Classic template tiles/recipient chips, step header/footer, Back/Close,
  exact reminder preview/marker, watch deadline/Push, and full-width bottom sheet
  at 400 px. Reuse validated typed submissions and preserve drafts across steps.
- Numbers: server date-range header, handled See all, unboxed weekly columns,
  all existing metric/rule disclosures, grouped exact counted rows, guardrail
  card and anonymous-copy explanation. Use the existing success-color meter;
  omit the health banner here, as current Classic does. No new counting or
  guessed membership.
- Settings: maximum 760 px, sticky section index below the header, original
  grouping/order, fixed setup instructions verbatim, AI model explanation and
  system More. Preserve Classic server help instead of reversing New copy.
- To learn: maximum 720 px, Classic destination/header, selected fact count,
  type/privacy/source-author/date labels, action footer and empty guidance.
  At narrow width the primary Save fills the remaining action-bar width.
  Retain React's existing single-fact edit safely; do not invent multi-fact edit.
- The shell footer belongs to Home. Supporting screens retain their own details
  and controls; Settings keeps runner/log details in system More.

## Classic Needs-you fidelity

Data and ranked cases are in the matching PM milestone. Walked UX families
U01-U17 (reply/decide and changes), U18-U21 (owner actions), U22-U28/U59
(long work and private Ask), U29-U35/U60 (tracking), U36-U40 (owned work),
U41-U49 (Catch-up/sent), U50-U53 (knowledge), and U54-U61 (health/session).
This changes their Classic presentation, not their membership or runner verbs.
Panel and New rendering remain unchanged.

Alternatives:
1. Restyle New ItemCard. Rejected: its hierarchy and body ordering are different.
2. Embed legacy HTML. Rejected: loses React input identity and typed action state.
3. Port Classic's focus/card markup and scoped CSS, retaining shared card hooks,
   fields and ActionButton. Chosen: faithful anatomy without another action engine.

Port `classic/tabs/focus.ts`, `classic/card.ts` and all five `classic/cards`
body variants. Queue: 272px plus 28px gap; stage max 720px. Queue rows use a
22px avatar, first name and code on one line, a clipped preview below. Retained
handled rows use a check and muted state; the heading/pager counts current needs.
The compact toolbar has Back, a separator, Previous/position/Next, another
separator and the shortcuts icon. Hide the queue at the legacy narrow breakpoint.

The card order follows the legacy renderer: person/avatar/chat/time/menu and
message bubble/thread, optional Classic work block, the type's body/draft,
Why/details, action footer, private Ask thread. Do not lift New's This work,
Next and Checklist hierarchy above the message. Preserve all current review
selections, effect errors/uncertainty, holding/commitment warnings, choices and
Other, notes/use-in-reply, source privacy, follow-up/to-dos, and offered actions.
Use the existing editor/IME/pin hooks; stale exact actions stay disabled and a
newer revision never replaces typing. Handled cards stay in the visit queue and
show a short status, never an actionable obsolete draft.

At desktop place a bounded 148px app-version select between run status and
theme. Keep the independent Experience control in Menu. At 600px and below
move app version into Menu, with only one accessible version select at a time.
The existing 1100px navigation collapse leaves room for the extra desktop
control. Verify actual header rectangles, including the select.

Home's compact Catch-up suppresses the quoted ask and other full-history
supporting lines only in compact mode. Full Done entries remain unchanged.

Negative cases: table-shaped ask must not expand the queue; raw text is never
HTML; typing, composition and menu navigation never send; duplicate clicks
do not duplicate submissions; changed revisions cannot send old text; declined
version switching retains edits; no real sends or AI in temporary-store proofs.
Compare 1280x800 and 400x860 light/dark against identical legacy fixtures,
plus intermediate header layout. Check reply/send/Undo, question/choice/Other,
review selection, meeting, private Ask, stale edit preservation and handled
navigation in a real browser. Per owner: build only, no test-writing pass.

Separate review corrections:
- Expose optional `classic.workActionIds` for due legacy work cards, using the
  existing Wait 3 days/Close verbs and server-computed due eligibility. Bind them
  to the real workflow code with exact revision/apply-time guards. Display their
  receipt in the work section by action identity, not as a send result.
- Keep visit snapshots as well as ids, so removed entities remain reachable.
  A short retained card preserves identity/code, actual action outcome when
  available, applicable shared Done feedback and latest private notes/Ask.
  Absence alone says only that it left Needs you, never that a send succeeded.
  Pending/refused/uncertain outcomes remain explicit. An active edit keeps its
  pinned words/reachable card and disables obsolete exact actions.
- Pager/keys traverse live items only. A handled selection says N left, disables
  Previous, and Next chooses the following live visit row, falling back to the
  first live row. Retained rows remain directly selectable. Zero live needs
  retains a selected visit card but disables traversal; a fresh empty visit
  shows the legacy all-done state.
- Preserve `.item-card`, data-card-edit/data-field, primary activation and pointer
  pinning. Adapt keyboard selectors to explicit choice inputs, not the first
  fieldset. Ignore shortcuts in a card menu. Use the shared controlled fields
  unchanged for composition/focus. Hide the queue at 960px, matching legacy.
