# React secondary-screen parity

## Data and outcome

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
