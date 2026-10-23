# React preview: product requirements

The preview preserves the New experience's four tabs and every existing action,
without changing the runner or silently switching an existing installation.
It is not approval for the proposed card redesign.

## Data first

### E49: manage a promised check-back without closing work

Existing work.watch points to the repeating job (every, nextAt, endsAt).
Priorities: extend its finite horizon, stop a queued check, stop an active
check safely, retain the work/plan/to-dos and every unrelated job. Offer the
same Extend 7 days and Stop used for other watches. Never implement Stop as
Skip reply, Close work or global Stop. Failed kills explicitly keep it live.

### E88: large queues remain responsive

Keep all 500 items, latest revisions, counts, ordering and actions in the
normalized store. A poll changing every headline must commit in under 16ms
from data arrival on the target PC. Focus, scroll, unsent edits and exact
approval revision guards must survive. Every item remains reachable through
scroll, Find, keyboard next/previous and direct routes. Small lists keep
their current layout. No pagination or extra buttons.

### E51: exact reminder bounds and rotation

Automation already owns its schedule, count limit, end date, texts and rotation.
Its existing server-generated sentence includes them all. Ranked scenarios:
1. Check a bounded reminder before starting it.
2. Confirm an active reminder stops after five sends or on its end date.
3. Inspect every rotating message and whether the last repeats or the run ends.
New rows and the opened reminder must show the same exact sentence as Classic,
without adding a control or changing the engine. Never imply only its first
message will be sent.

### H2: one-row desktop header at intermediate widths

The header already has four tab labels and counts, reading state/time/machine,
Experience and App version selects, and theme. Rank visible navigation first,
version choices second, and the full diagnostic status sentence third.
Between the existing narrow-menu breakpoint and 1200px, keep one desktop row:
all four tabs and both selects remain visible and usable. Show a compact
status dot with the full status/time in its tooltip and accessible name.
For a non-healthy state keep a short word beside the dot, so colour alone
never carries the warning. Keyboard focus reveals the same full text as hover.
No new control or alternate action. Preserve the existing narrow menu through
860px and full desktop wording above 1200px. At every width 400-1440, visible
controls stay within the viewport and never overlap.

### P0: draft belongs to the current turn

A reopened item must not retain a prior turn's draft, edited-send learning
state or approval. A worker/job report with no reply replaces the draft with
none, including work results that remain needs-human. The shared card shows
the current verdict, not unrelated old text or Send. Already-saved affected
records are also hidden and refused at send time. Approval revisions cover
the turn revision as well as its conversation/text. Normal current drafts
and owner edits still send only after the existing explicit approval gates.

### E2E: intermediate header widths and per-send history

Healthy Settings already offers retry-source unconditionally and renders both
Check now controls; prove it without another offer. Today's Done also hides
earlier replies when the newest turn is open: retain that behavior.

Use existing immutable send log records plus the retained thread to resolve
each counted send's original inbound, sender, sent words, time and Teams link.
Never substitute a newer unsent turn. Rank: read edited sends after a new ask;
inspect five sends on one item; follow the correct Teams message; compare
different counting windows; see missing/redacted history honestly; export
several corrections on one day; preserve hand-labelled eval cases; navigate
tabs at 900/1024/1100 pixels; keep status/version controls reachable.

Numbers counts stay unchanged; only presentation references become per-send.
Each correction export has a deterministic event-specific identity and the
original inbound link. Old records resolve through matching send logs/thread,
not the item's current last message. If evidence is unavailable, do not guess.

### X6/X7 wording parity

Use the existing activity code to name New Done's private Ask editor:
Ask Delegate about <code>, not about this. Both Numbers window selectors
are named Window, and the chart caption is The last 8 weeks without a period.
No data, action identity, input state or query behavior changes.

### E08: New Settings Check now and complete control parity

Use existing retry-source offers, settings rows, shared submission state and
snapshot details (runner and recent log). No new endpoint or runner behavior.
Ranked cases: force a read from the pollIdle row; inspect a stalled runner;
force a read from Runner details; save the read interval; enable Details;
review today's log; edit a regular setting; save a switch; manage a suggested
habit; inspect setup-only values. Every control in today's settingsView must
remain present, including conditional suggestion/rule controls.

Restore Check now beside pollIdle's Save and beside Runner inside More >
Details. Both use the existing retry-source intent, and show only that
action's shared row:retry status, never an unrelated page action's result.
Restore Details' runner text and newest-first log; keep the Show details
setting as the gate. Preserve all existing rows, saves, navigation, More,
AI model usage and Changed by setup values.

### Parity N4, N2, N3, N8, G5 and indirect controls

Existing data: health entities/actions, Numbers rows and activity entities,
settings rows, summaryAt config and shared action state. No AI fields needed.
Ranked scenarios: see problems on the affected tabs; act on a counted FYI; scan settings
without extra controls; find PRs; scan holding-reply rows; switch experiences
at narrow width; select merged items; copy counted totals; discover keys;
read today's daily-summary guidance.

Restore today's New surfaces: one shared problems banner above Now, Done and
Settings, but not Numbers (including its lists), per verifier X1 on 6443019.
Watch/Needs me on counted Catch up rows through existing activity actions,
no Reading and watches group in Settings, original AI-chat guidance and Off
wording, and the exact Find placeholder. Under the coordinator's tighter
G5 criterion, remove the extra Holding reply row chip: section 8a requires
holding/retry capability, not a chip in this location. Keep the headline,
opened holding reply, Send holding reply and Retrying behavior.

Daily summary stays help-only, exactly as today's picker. Its description
is 'Say it in chat: "send me a summary at 6 pm".'; clicking it shows
'Say it in chat: "send me a summary every day at 6 pm".'
Settings already owns summaryAt: do not add a second time editor, create an
automation, save config or touch the summary engine from this template.
This supersedes the briefly added schedule editor in 51f2aa1, now reverted.

Exact restored copy: Find a person, chat, PR or number, or paste a Teams link.
Settings guidance: Ask your AI chat "what do you know about me?" for the same
list. To change a rule you wrote, say "change my rules" there.
Update Off: run "delegate update" yourself.

### Control parity C1-C9

Use existing recipients, reminder defaults, activity notes, action offers and
theme/keyboard state. No new server or AI data is needed. Ranked scenarios:
watch a Catch up item with a preset deadline; remind a frequent person;
remind someone else; choose a recurring time; ask a follow-up on a sent reply;
report an incorrect result; identify feedback's recipient with a screen reader;
answer a failed job; discover shortcuts; follow system theme.

Restore today's controls rather than introduce new behavior: four fixed
watch deadlines, quick recipient buttons and a reminder editor with Back,
Ask more, complete key help, report-log wording, person-specific feedback
names, system-theme wording, and failed-job answer/draft wording. Keep the
existing action identities, staleness, deduplication and approval gates.
C7's more precise Mark to-do done remains intentional.
Verifier X5 on 6443019 reverses E96's footer addition: New Now has no Keyboard
shortcuts button. Keep E97/C9's complete list on ?; Close and Escape return
focus to the prior focused element, with main as the fallback.
### Classic screen parity follow-up

Use the existing version code/tag, update channel/interval/result and Classic
settings rows. No new data or AI output is needed. Ranked checks are: find an
update action beside its status; understand update timing; find the named
Classic screen from Settings help; scan a narrow focused card without desktop
keyboard hints; change the Numbers window beside its range; preserve the
existing report, update, keyboard-help and settings actions.
Restore today's Home version/status/action grouping and short time wording.
Settings must name Home and Waiting on others, not New's Now/Waiting.
Hide only the inline keyboard-hint strip on narrow cards; the keyboard-help
button and shortcuts still work. Align Numbers' window/range at the right of
its desktop heading. Existing failed-job recovery, learned Undo and narrow
card improvements remain; do not reproduce defects in the legacy page.
The read-only snapshot must retain the same decision information as a live
card: options, proposed changes and their targets, meeting/context, work,
promises and sources. It must not expose editing, submission or Ask controls.

### New parity gaps G2, G4-G6 and G8

Use today's server row headline, action offers, chips and version metadata;
no new AI fields. Preserve Teams message times (G7 is intentionally unchanged).
Ranked cases: failed-job directions; retry with owner words; skip failed work;
scan holding drafts; inspect Waiting by its row title; reminders from the quiet
footer; report a problem; update/version identity; watch an FYI; manage existing
watches/channels. Changes are parity corrections, not new capabilities.

G2 must retain the runner's specific failed-job question in the Now headline,
not replace the whole sentence with "Review this item". Its opened card retains
the answer field and Skip/Dismiss path; answering only queues a retry and never
sends a reply. Other command hints remain filtered.

G4 follows today's quiet Now footer: + Remind someone, named channels when
present, Version, Check for updates and Report a problem. Remove the extra
"More you can do" toolbar. N3 supersedes the prior Settings relocation:
keep FYI Watch on its row and creation through the automation picker; existing
watch controls remain on their rows and named channels in the quiet footer.
G5 originally retained the chip using design section 7. The coordinator's
latest exact-location criterion supersedes that choice: remove the row chip,
because section 8a does not require it there. The holding headline,
opened-card label, Send holding reply and retry line stay.
G6 removes only redundant Open/Hide controls on Waiting rows that have no
direct local action; clickable accessible row titles still open the details.
Do not remove direct nudge, close, reminder or other current local actions.
G8 shows Version tag (code), or Version code, from the same server version
metadata as today's New and Classic, rather than a React-only identity.

### New / Classic look parity

The server supplies row freshness and shared per-item seen marks. A look freezes
the visible New/Back chips until leaving Now. Only rows at least 25% visible for
1.5 continuous seconds in a visible tab count as seen, including opened rows.
Lazy-loaded rows must receive the same observer as rows present at app mount.
Returning to Now starts from the latest ingested projection, not a stale
render captured before the shared store ingested it.

Ranked scenarios: normal scan; fast toggle without a mark; return after a scan;
folded narrow sections; Classic Home without marks; opened Classic card;
unsent edit round trip; hidden tab; partial row; empty Needs you.
Accept the designer's deliberate divergence: an opened React Classic
Needs-you card marks its item after 1.5 seconds, unlike legacy Classic.
This is a stronger look than a row, and the seen state is shared.

### Standalone New actions

Reminder schedules and unanswered outgoing asks have normalized placement data
but no workflow item. Opening those rows must show their existing details and
actions, not a changed-item placeholder. Ranked cases: pause a reminder; resume;
end; inspect its exact text/schedule/recipient; draft a waiting follow-up; dismiss
an outgoing ask; preserve a pinned pending result; refuse stale schedule actions.
Reuse the existing card slot and server actions, with no new control or layout.

### E45: exact to-do completion

The server has stable kept to-do ids, text and kept-at timestamps. The row
names the oldest open to-do; an opened item lists all remaining to-dos. No new
AI data is needed. Ranked scenarios: finish the named row task; finish a
visible list; retain a task added after drawing; refuse a stale completed task;
leave work, watches and unrelated timestamps alone; close work separately;
keep chat close behavior; retain Track, Wait and failed-job recovery.

The row's Mark done marks only its named task, without a hidden "+N more".
The opened item's button names its displayed count and marks exactly that
list. A changed offer is refused, never widened. A result names the marked
tasks and says separately that work stays open. Close is unavailable while
kept tasks remain; it never doubles as completion of undisplayed tasks.
Classic Ongoing has no opened-item link for to-do-only work, so it offers a
counted Mark to-dos done action instead, with a confirmation listing every
bound task before submission. Cancelling changes nothing.

### Draft promise visibility

Before Send, show the draft's existing promised tasks as "Yours to do:" with
the warning icon, after changes and before the follow-up watch. This is not
the kept list from earlier replies. Ranked cases: ordinary promise; promise
plus changes/watch; earlier kept tasks plus a new promise; post-send removal.

Today the server provides needs-you cards, next-move rows, Done rows, status,
health, watches, automations, knowledge proposals, settings metadata and Numbers.
We need stable normalized ids, revision-scoped interface state and typed offered
actions. Code supplies those projections. No new AI fields or runs are required.

## Ranked scenarios (frequency times value)

1. Engineer scans 5-15 daily items, opens a reply and sends exactly what is shown.
2. Manager scans 50-200 FYIs, finds a person and notices unread or returning work.
3. Owner edits a draft while polling refreshes; text, focus and IME survive.
4. Owner approves selected changes only after seeing their meaning.
5. An item changes mid-decision; the old approval is refused without sending.
6. Owner answers a question or picks options, previews, then sends.
7. Owner checks a sent reply and undoes it during its available window.
8. Owner reports testing results and checks plan owners and remaining to-dos.
9. Owner checks watches, adds missed work and asks a private follow-up.
10. Owner checks Numbers or changes a setting, including model configuration.

## Requirements and negative cases

- R-REACT-01: Classic, New and React (preview) are selectable per machine.
- R-REACT-02: Existing screens, endpoints and runner behavior remain available.
- R-REACT-03: Rows open; rows never send. Every sending action shows exact text.
- R-REACT-04: Stale approvals fail before queuing; unknown outcomes are not retried.
- R-REACT-05: Every open subject appears once in server-decided placement.
- R-REACT-06: Polling preserves focus, edits, folds and composition; old-revision
  results and edits never appear on a new revision.
- R-REACT-07: Change meaning precedes approval; Undo does not undo prior effects.
- R-REACT-08: Every failure is visible, keyboard paths work, no command hints,
  except the exact runner-generated failed-job retry question, retained for
  parity in the row and card alongside working answer and dismissal controls.
- R-REACT-09: No owner-data writes, AI calls, publishing or pushing during build.

Wrong targets, injected text, stale data, owner absence and double clicks must
not cause an unapproved send or effect. Untrusted content is rendered as text.

## UX-case walk

U01-U61 are parity obligations, not new requirements for the runner. Existing
implemented cases must work in React. Unbuilt manager digests, meeting summaries,
away briefings and dated promises remain explicitly not implemented rather than
fabricated. A final scenario matrix will link each implemented behavior to tests.

## Classic scope amendment

React now also contains the existing Classic experience, not a Classic redesign.
Opening React without an experience route still shows New. The in-app experience
selector is separate from the per-machine Classic / New / React version menu.
Changing experience must not reload or discard unsent work.

The same ten ranked scenarios apply. Classic presents them through Home, the
Needs-you focus queue, Done, Ongoing, Knowledge, Numbers and Settings. Home keeps
the server's tiles, first four needs, top three Catch-up rows and Also-for-you
destinations. Ongoing retains progress/check dates, unanswered asks, updated and
quiet watches, named channels, running/bootstrap progress and reminder controls.
Its two-step automation sheet includes recipient shortcuts, an exact reminder
preview with the assistant marker, and watch done-by presets.

No count, placement, recipient target or runner verb is invented in the browser.
Read-only snapshots offer no actions. Offline pages retain the last data and
edits, disable actions, and become usable again when connectivity returns.
Existing shared action and revision gates remain authoritative.

## Classic visual parity corrections

Use today's Classic, not a new layout, for the existing ranked scenarios 1-3,
7 and 9. The server already supplies the ordered needs, person initials/hues,
tile sentences/counts, health dates, pending facts and Catch-up top/count.
No additional AI output or data-layer eligibility rule is required.

Home must show a large needs count, at most four avatar/first-name rows with
one-line ellipsized headlines, and the filled Start with button plus remaining
count. Sentence tiles keep their original icons and emphasize the number.
The greeting uses the shared short local time, a middle-dot separator and
singular/plural thing wording. Correcting the underlying visit timestamp remains
with the New builder.

The amber health line retains its icon, short Since time, inline additional
problem count and offered fix. Additional problems remain accessible without
turning the count into a separate disclosure row. The header uses the Classic
mark, filled Needs-you count, muted other badges, dotted run-status pill and
theme icon. Knowledge is reached through Also for you and the conditional
To learn tab while pending proposals exist, as in today's Classic.

Catch up stays below the tiles with the same server-selected top rows/count,
Mark all read and See all; pinned editors survive background freshness changes.
Verify long table-shaped asks, singular handling, zero/pending facts, multiple
health problems and Catch-up identity in a real fictional-store browser.

## Visual parity milestone

React New must look like the current New renderer on the same projected data,
not merely expose equivalent controls. Match its header, compact row facts,
avatars, primary Open, summary/note, inline card and health-line placement at
both required sizes/themes. Remove duplicate names and the extra pager.
No new AI, command strings, ownership rules or action effects are introduced.
Typed gates, unsent edits, keyboard paths and explicit source links remain.

## Classic supporting-screen parity milestone

Data first: Done already supplies typed activity kinds, person, exchange, source,
work label, timestamps, freshness, undo expiry, private notes and exact actions.
Ongoing supplies progress, unanswered asks, watches, channels, running jobs and
automations; existing forms supply validated recipient/schedule metadata.
Numbers and Settings have their own server queries. Pending Knowledge lives in
the conditional To learn tab; saved facts live in Done → Learned. Settings'
What it knows section concerns rules, suggestions and chat preferences, not a
saved-fact browser. Do not invent knowledge-library search.
No new AI output or runner decision is needed for these presentation changes.

Ranked scenarios (frequency × value): (1) scan sent exchanges and undo the exact
send, (2) skim/open Catch-up, (3) filter New versus Earlier, (4) inspect why a
reply was sent and give exact-send feedback, (5) inspect watch updates and change
their timing, (6) pause/resume/end a reminder, (7) create a watch/reminder with
exact text, (8) open the records counted by Numbers, (9) find/edit settings and
learned facts, (10) do the same on a 400 px dark screen without lost typing.
Both the engineer's small daily list and manager's large list use the same rows.

Preserve the complete U01–U61 inventory: this milestone changes presentation
for U07/U19/U22/U26–U34/U36/U41/U42/U45–U58; engine-only and future cases remain
unchanged. Nothing sends on opening, filtering, expanding, searching or switching
experience. Stale actions remain bound to their displayed revision/send.

Acceptance is per screen: identical fictional-store side-by-side Chrome first,
then an isolated read-only copy of owner data. Check 1280 and 400 px in both
themes; record Done/Missing proof per Classic surface in the parity inventory.
Only build is a commit gate; the formal test-writing pass remains deferred.

## Classic Needs-you visual parity milestone

Match the current Classic focus renderer, not the New card. Existing normalized
items already supply the person's initials/hue, chat/group/guests, message time,
ask/thread, type-specific question/context/options/meeting/changes/draft, work,
sources, notes and offered actions. No AI field or new action eligibility is
needed. Counts and live membership remain server-owned; the visit queue may
retain handled cards without counting them as still needing the owner.

Ranked cases for an engineer with 5-15 updates and a manager with 50-200:
1. Scan a ready reply and its original message before approving.
2. Navigate nine needs without a long incident table expanding the queue.
3. Edit the exact reply, keeping words and selection during refresh.
4. Answer a question or choose an option, including Other, before previewing.
5. Approve selected review changes with their exact details and recipient.
6. Read the meeting time, attendees and conflicts before choosing.
7. See newer data, pending/refused actions and an already-handled visit row.
8. Inspect sources, private-source warnings, work and the private Ask thread.
9. Use the narrow layout and keyboard without triggering actions from typing.
10. Switch app version independently of the React experience.

At desktop the left queue has a small-caps Needs you heading/count and compact
avatar, first-name/code and one-line ellipsized previews. The stage has the
Classic compact Back/Previous/position/Next/shortcuts toolbar, not an extra h1.
A dedicated Classic card reproduces the current Classic card anatomy and body
variants. It must not render New's ItemCard layout or its work-first hierarchy.
All actions still use shared typed gates, revision pins and receipt recovery.
The desktop app-version select is visible in the header; Experience remains in
Menu. Home Catch-up's normal rows contain only title, summary and metadata,
not an additional quoted ask.

Projection exception identified in the separate review: due-work Wait/Close
offered ids are not currently on the normalized card. Add that small explicit
server mapping under existing legacy eligibility; no new AI or runner behavior.
Retained visit cards must preserve identity/outcomes/feedback/Ask even when the
live entity disappears, while retaining any active pinned editor safely.
