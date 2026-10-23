# Secondary-screen parity presentation

## Classic recovery and Home parity, matching today's Classic

E38 alternatives: add Retry to Running (rejected: a failed job is not running);
invent a new error tab (rejected: extra navigation); reuse New's stopped-item
classification in Classic Needs you and existing answer/skip commands (chosen).
The focused failed card shows its error, a directions field, Try again and Skip.
It is actionable, not "no longer needs you"; no active progress bar. Ordinary
running items keep their existing controls. G1 is a separate change: Home shows
"Answer A37 to retry with directions, or skip it" for a recoverable failed item,
using the same recovery classification, not its raw ask.

E41 alternatives: keep Draft reply (rejected: does not accept work); add a
separate tracking sheet (rejected: unnecessary); reuse New's Track ok command on
the proposed-work card (chosen). Track and Skip are explicit. Track never sends
a reply; the accepted work stays tracked and the proposed flag clears.

G3 alternatives: leave generic PageTools on Home (rejected: hides the field and
adds controls absent today); duplicate them (rejected: two ways); restore the
inline missed-message form and keep only today's version/update/report controls
(chosen). Field placeholder: "Missed a message? Paste its Teams link here";
button: "Make an item". Keep pending/result/invalid-link feedback, offline
disabling and typed text across polling. Remove the Keep things working group;
Check now remains in the existing Settings timing/source-health controls; do
not add a new Pause surface where today's Classic has none.
Match today's gap above Also for you and the missed-message form.

G9: compare today's footer. Prefer removing the added Last reader line if absent
there; otherwise use the existing short-time formatter, never locale date/time.
No new footer or navigation controls. Validate desktop/narrow light/dark and
real stored effects on a fictional server, not only rendered labels.

The separate Opus design review approved these five parity fixes without
blockers before implementation (2026-10-23). Retry means the existing answer
path into worker replanning, not blindly requeuing the old failed job.

## Classic promise and earlier to-do placement

Alternatives: reuse "Yours to do" for both sets (rejected: confuses an unsent
promise with earlier work); leave the earlier completion action by Send
(rejected: ambiguous scope); separate the two lines and place the counted
completion action beside the earlier list (chosen, agreed designer sections
1 and 2). Under Also and before Then/watch, show the warning-icon line
"Yours to do: <this draft's promises>" only while a sendable draft exists.
Kept promises use "Still to do from your earlier reply: <all displayed texts>"
with the existing exact-ID "Mark to-do done"/"Mark N to-dos done" action below
that line, not in the Send footer. Preserve existing busy, stale and confirmation
gates. E45 owns In progress close controls; leave them unchanged.

## Classic E64 learned-row Undo

Data: Done rows already name the applied proposal's `undo-facts` action. Use that
action unchanged; never construct a command or a client-side eligibility window.

Alternatives: (1) per-fact Undo would invent a new engine feature and is rejected;
(2) hide Undo inside details would obscure recovery and is rejected; (3) put
**Undo learned facts** at the right of the row, where reply Undo appears, chosen
to match New and the reviewed Classic parity-gap design, section 3.

Keep the book icon, sentence, gist and timestamp. The accessible name identifies
the row: `Undo learned facts: <row description without Learned>`. While pending,
show `Taking it back...` and disable it. Keep the existing shared result and
stale-revision notices below the row. The button has no countdown, is disabled
offline and absent on snapshots. Do not extend the reply-only `u` shortcut.

The separate Principal Designer review approved this design and the optional
shared button props without blockers before implementation (2026-10-22).

## Alternatives

## Classic header parity

Alternatives: always hide Experience in the menu (current, rejected: desktop
discoverability); add a second header row (rejected: not today's Classic);
inline desktop selectors after status with the existing mobile menu (chosen,
as in the agreed designer review section 5).
At 1280 px: brand, tabs/counts, status, Experience, App version (148 px), theme;
no Views button. Hide the brand name before collapsing tabs at 860 px.
At 400 px: brand mark, title, status dot, theme, Views; the menu holds tabs,
Experience and App version. Keep accessible selector names and edit-discard gate.

## Classic watch deadlines

Keep the agreed inline form (designer parity gaps section 6). Alternatives:
compare dates to identify the preset (rejected: Friday and next week collide);
replace presets with only a calendar (rejected: loses today's simple controls);
store the chosen preset separately and resolve its date at submit (chosen).
Preserve the shared custom date when moving between Home and Done; changing a
custom date clears its preset. No extra controls or hidden default condition.

1. Keep one chronological list and New chips. Smallest markup, but older unseen
   entries stay buried. Rejected: it fails Done's new-first contract.
2. Split Done into New and Earlier sections, retaining the existing entry card,
   filters, and visit-stable New ids. Chosen: no new controls or domain logic.
3. Add a New-only filter or tab. Rejected: extra navigation and hides context.

Numbers keeps its existing counted-list card. Add the already supplied gist and
work as plain paragraphs, matching Done, rather than fetching or opening an item.
Hide absent values. Preserve source links, attribution and time.

Done uses level-two group headings and level-three entry headings. Show New
before Earlier, preserving server order within each group. If no entries are new,
show the existing list without an empty New section. Closed-with-nothing-to-know
stays in its existing disclosure.
Ungrouped and closed entries retain level-two headings; omit an empty Earlier
group. Group headings and entries remain siblings so a freshness change never
reparents a focused editor. Keep entry ids, open state and pin-aware hooks.

No new layout, tab, action, or styling system. Verify both 1280 x 800 and
400 x 860 in light and dark, with no horizontal overflow.

Removing the duplicate missed-message launcher leaves Find unchanged. A proposed
paused-reminder disclosure was rejected after correcting the browser helper:
paused reminders are already on Now, and reload restores an already-open card.
Keep one reminder control surface.
