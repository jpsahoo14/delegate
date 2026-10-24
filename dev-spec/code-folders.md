# Code folders on this computer (#44 part 1)

Separate-session PM/design review: approved after making the exact suppression
predicate and its clone-found/non-ADO regression cases explicit.
Copy-only follow-up: separate-session design review approved the PE 18:20
wording and plain-error plan before implementation.
Machine-identity follow-up: separate-session design review approved the scoped
Classic typography correction before implementation; New and the existing
heading/identity DOM stay unchanged.

## PM specification

The owner already has a checkout but is asked to clone it. First fix remote
identity, then make the machine's existing code-folder setting visible. This
setting is local, not shared config. No new tab or setup flow.

Data already available: machine name, saved code folders or existing automatic
guesses, cached remote-to-checkout map and last scan time. Page reads must not
scan directories or invoke git. Invalid old limited-ref keys invalidate the scan
at read time; the next runner lookup replaces the cache.

Ranked scenarios:

1. Existing limited-ref checkout is recognized; no misleading clone task.
2. Owner sees which folders this page server scans and the cached repositories.
3. Owner adds/removes an absolute existing folder on this machine.
4. Owner requests a fresh scan; the page queues it, the runner performs it.
5. Invalid input fails plainly without changing folders or shared config.

## Design specification

Compared alternatives:

- A single editable textarea: compact but makes adding/removing paths opaque
  and cannot explain automatically found folders per row.
- A folder list with Add/Remove and a cached repository summary: explicit,
  matches the required actions, reuses existing Settings styling. Selected.
- A separate repository-management page: unnecessary new navigation and controls.

Place one shared component in Settings > You in New and Classic, immediately
after the existing repos field. PM sign-off (18:03): heading "Where your code
is on this computer", with the machine name muted beneath. Explanation:
"Saved only on this computer, not in shared config. Other computers keep their
own list." Automatically guessed folders say
"Found automatically"; explicitly saved folders do not.

Each folder has Remove. One labeled input accepts an absolute folder and Add
saves the complete list using the existing local code-folder persistence helper.
Show cached repositories as "<repo name> · <path>", with the full remote on
hover, plus last-check time or "Not checked yet". The input placeholder uses
the page server's OS absolute form: C:\src or /Users/you/code.
"Find my clones now" only clears scannedAt; receipt:
"Delegate will look for your clones on its next check. This list updates then."
No success claim that clones have already been found.

Mutations use the existing Settings API and show its plain error/status line.
Do not write shared config for these machine-local actions. Removing the last
saved folder leaves an explicit empty list, not a return to automatic guesses.
Say "No folders: Delegate won't look for your code on this computer." and offer
"Use found folders again", which clears the saved override through the same
local persistence helper and queues the runner's next scan, never a page scan.
Directory checks validate absolute/existing/directory before persistence.

Copy polish (PE 18:20): keep the machine name only in the muted identity line;
use "this computer" in the input label, validation and save receipt. Preserve
the existing shared list design rather than adding controls or a diagnostic
panel. The machine identity keeps its muted color and 12.5px size even inside
Classic's setting-row typography; scope the override only to the identity
paragraph immediately beneath this heading, not every muted setting hint.
A missing folder says "That folder doesn't exist."; a non-folder says
"That path isn't a folder.". Other filesystem failures say "Couldn't check
that folder. Check that you have permission to open it, or choose another
folder." and log the diagnostic for troubleshooting, without showing errno
codes. No validation failure changes saved folders.

Clone hints are not owner tasks for remote ADO reviews. One exact-template
read-time helper supplies filtered todos to the card-data owner and the runner's
next save. Its exact predicate is
`todo === cloneTodo(remote) && (cachedCloneExists || readsThroughADO)`.
Both the clone-found/non-ADO branch and the remote-review branch hide the old
template immediately; neither filtering path scans directories. No free-text
matching or one-shot repair. Real test/build work without a clone keeps its task.

## Proof

Standalone Temp-root journey, stub model/source, isolated CLI/local homes:
six URL forms, real git checkout, invalid-cache rescan once, runner path log,
cached Settings data, invalid folder refusal, queued scan outside page request,
remote-review legacy clone todo suppression and cleanup. Browser-check both
experiences against the fictional root. No unit tests or owner data.
Also prove clone-found/non-ADO immediate suppression and next-save removal,
local-checkout-required/no-clone retention, and preservation of non-template
owner tasks even when their text discusses cloning.
The clone-found case is a local-build job with a non-PR key and
needsCheckout set, so it cannot pass through the ADO-review branch. With a scan
pending, the helper and card-data consumer must leave the local cache untouched;
the runner subsequently scans separately and persists the filtered todos.

Verified: nine fictional git/runner/HTTP journeys; New and Classic browser
checks for placement, OS input, Add/Remove, invalid input, empty-list reset,
repository hover and deferred-check receipt. The runner uses the shared helper
for persisted cleanup. The card-data pass-through is coordinator-approved;
the New builder owns adding the same helper to Store.save for other saves.
The copy-polish proof also checks exact HTTP refusal lines for relative,
missing, non-folder and invalid filesystem paths, logged diagnostics for other
failures, unchanged persistence after refusal, and the save/stale-remove
receipts. Browser-check the shared copy and missing-folder error in both New
and Classic.
Run `node scripts/prove-code-folders.ts --browser` after the build to verify
the exact heading and page-server machine identity once, muted immediately
beneath it, in both experiences at desktop/mobile widths in light/dark.
