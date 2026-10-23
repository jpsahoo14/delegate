# React secondary-screen parity

## Classic broken-feature recovery and Home parity (E38/E41, G1/G3/G9)

Data: failed jobs already have a state/error and New's server-derived stopped
placement and answer/skip commands. Proposed work already has a proposed flag
and an ok/skip command. Home has paste-missed, update/report actions and reader
metadata. Restore their Classic surfaces without new engine commands.

Ranked cases: (1) find a failed job in Needs you, never an indeterminate Running
row; (2) retry with directions and observe the engine accept those directions;
(3) Skip that failed item; (4) reject an obsolete recovery action; (5) read the
retry guidance instead of the raw ask on Home; (6) accept proposed work with
Track and observe work become open; (7) skip an unwanted proposal; (8) paste a
missed Teams link and observe intake create its item; (9) reject invalid links
and preserve text offline; (10) read Home with correct gaps/footer at desktop
and narrow widths in both themes.

Each numbered coordinator fix is a separate build/Edge/commit unit. No live
data or Teams sends. New's existing placement/actions and E45 behavior must
remain intact. Bookkeeping tolerance and real-change refusals remain intact.

## Classic draft promises and earlier to-dos

Use projected `item.todos` for promises made by the current draft, and the
displayed `todoIds`/`entities.todos` for kept promises from earlier replies.
Ranked cases: (1) see the current promise before Send; (2) distinguish earlier
work; (3) mark exactly the listed earlier IDs without sending or closing;
(4) refuse stale lists and retain new arrivals; (5) preserve Send/draft editing;
(6) no promise line without a draft; (7) desktop/mobile light/dark readability.
The agreed Principal Designer parity-gap sections 1 and 2 are the review and
acceptance; no new review or behavior change is introduced.

## Classic E64: take back a learned row

The server already offers `undo-facts` for each applied knowledge proposal with
an exact revision. Classic Done must expose it in All and Learned. It takes back
every fact on that row, not one selected fact, without a countdown while the row
remains in Done. Facts edited since learning and other proposals stay untouched.
No message is sent. The `u` shortcut remains reply-only.

Ranked cases: (1) take back a wrong learned row; (2) restore an older fact;
(3) preserve a fact edited since learning; (4) leave another proposal untouched;
(5) refuse a stale revision; (6) deduplicate a double click; (7) recover a lost
response without resubmitting; (8) disable offline; (9) hide on a snapshot.
Check the real local server and runner on a fictional temporary store in Edge,
including the one-fact and two-fact rows, at desktop/mobile in light/dark.

## Data and outcome

## Classic header parity

Use the existing tabs/counts, status, Experience and App version controls; no
new data or navigation. Ranked cases: desktop navigation, desktop experience
switching, mobile navigation, mobile switching, offline, snapshot, unsent edits,
keyboard escape/outside dismissal. Match the reviewed Classic parity-gap
section 5: inline above 860 px, menu at 860 px and below, App version in the menu
only at 560 px and below. Snapshot hides both selectors; offline disables both.

## Classic watch deadlines

Keep the existing Catch up Watch form and server watch action. Ranked cases:
start a dated watch, no date, clear an AI end condition, choose Friday on Friday,
submit after midnight, stale source, preserve a custom Home date, background
refresh, mobile layout. Exactly one preset is selected, and dates use the local
calendar at Start watching, not when the form opened. An explicitly empty
end condition stays empty. Stale sources change nothing. Pending-reply folds
remain unchanged and are verified per the agreed designer sections 6 and 7.

Numbers already receives `gist` and `work` on each counted activity row. Done
already receives an authoritative `fresh` flag and records visit-stable New ids,
including fresh arrivals during the visit. Show those fields without recalculating domain state.
Lifecycle actions already come from the server's offered-action registry.

## Scenarios, ranked

1. Read a counted FYI's gist without opening another screen.
2. Read the work associated with a counted reply.
3. See unseen Done activity before earlier activity, even if an older entry is new.
4. Keep the New group stable while the visit marks activity as seen.
5. Filter Done without losing its new/earlier distinction.
6. Edit or skip proposed facts and verify the saved proposal.
7. Change or stop a watch without touching another watch.
8. Pause or end one reminder without sending it.
9. Stop one named channel without changing other channels.
10. Wait or close overdue work without sending a nudge.

## Acceptance and negative cases

Use the real local server and a fictional temporary store. Assert stored results,
not just a success toast. No action runs on the owner's data. Existing action
gates remain unchanged. Edits remain attached to the submitted revision.
Group the filtered, pin-aware entries using the visit-stable id set. Keep the
same keyed entry under the same parent across seen updates and arrivals. Preserve
server order within each group. Reuse the focused replacement-send and Catch up
editor regressions to verify DOM identity, IME, selection and focus.

Numbers assertions cover supplied gist/work, exact counted-list membership,
existing attribution and links, and absence of mutation controls. The existing
Numbers tests retain coverage for old activity and no-item missed-message rows.

Find is the one missed-message entry point, so remove the duplicate missed-message
sheet launcher. Paused reminders already remain reachable on Now; reloading an
open reminder keeps it open. Do not introduce a second reminder control surface.

Other-builder files are not modified. Missing card, Now, projection, routing,
or inline app/footer behavior gets a named-file browser skip and handoff.
