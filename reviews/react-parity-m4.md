# React M4b handoff

The owner reassigned this builder to React Classic on 2026-10-22. Remaining
New-side items belong to the other builder. No forbidden New-side file was edited.

## Completed on a fictional temporary store and the real server

| Scenario | Result | Browser evidence |
| --- | --- | --- |
| U03 Other answer | Done | Exact `ownerAnswer` stored; rewriting, not sent |
| U25 holding reply | Done | Displayed draft sent; Undo removes that send |
| U51 fact Edit / Skip | Done | Edited proposal applied; skipped proposal dropped without application |
| U54 health fix | Done | Retry writes a fresh-read kick; does not falsely clear source failure |
| U30 watch interval / Stop | Done | Two-hour interval stored; selected watch stopped, other watch unchanged |
| U31 Extend 7 days / Stop | Done | Exactly seven days added; selected watch stopped |
| U33 reminder Pause / End | Done | Pause, Resume, End persist; schedule and second reminder unchanged; no immediate send |
| U34 named-channel Stop | Done | Only selected channel removed |
| U20 Wait 3 days / Close | Done | Exact three-day check window; work closes without sending; other work unchanged |
| SC-265 Numbers gist/work | Done | Exact counted-list membership, supplied details and source links; light/dark at both widths |
| SC-131 Done New/Earlier | Done | Pin-aware rows, visit-stable accumulating New ids, within-group order, heading states and restart |
| SC-277 one missed entry | Done | Find creates the exact missed link; duplicate sheet launcher removed |

The new browser file keeps five active tests: Numbers, two Done cases, one grouped
lifecycle proof, and Find. It retains explicit skipped cases for the owned-file
handoff below. Tests build a temporary React bundle and use temporary stores.

## Recorded New-side gaps

| Scenario | Status | Owning file |
| --- | --- | --- |
| SC-163 Copy details | Skipped | `src/web/react/features/ItemCard.tsx` |
| U57 / SC-124 / SC-175 update auto/cadence | Skipped | `src/web/react/App.tsx` (inline footer) |
| U58 ok/late/off/never reading wording | Skipped | `src/web/react/App.tsx` |
| SC-118 bootstrap progress | Skipped | `src/web/react-projection.ts`, `src/web/react/features/Now.tsx` |
| SC-251/252 also / waiting-since | Skipped | `src/web/react/features/Now.tsx` |
| SC-251 empty sections / quiet state | Skipped | `src/web/react/features/Now.tsx` |
| SC-279/282 narrow health banner | Skipped | `src/web/react/features/Now.tsx` |

## Validation and limits

Typecheck passed. The affected-tests command completed with 75 passes, ten
recorded skips and one unrelated existing grouped-PR-approval browser failure.
The independent lifecycle proof subsequently passed after correcting the helper
to recognize an already-open card after reload. No full suite was run. The latest
owner directive supersedes per-commit test gates: build only until parity.

Numbers and Done screenshots were inspected at 1280 x 800 and 400 x 860 in both
themes. No horizontal overflow. No real-data action was taken.

A proposed extra paused-reminder disclosure was discarded: the existing Now row
already retains paused reminders. The failed lookup had incorrectly expected an
Open button after reload, although the card was already open. No duplicate
reminder surface ships.
