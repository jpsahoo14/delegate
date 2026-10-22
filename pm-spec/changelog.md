# Engine fixes

| Date | Fix | Expected behavior and proof |
| --- | --- | --- |
| 2026-10-22 | Approval truth | All PR workers receive live evidence before drafting. Approval-sensitive replies need bounded, complete wording and evidence for the exact claimed PR; mixed/unknown wording redrafts even after execution. Supported negative statuses and other-PR future promises remain valid. Dropped votes, repeated ok and vote receipts never bypass factual checks. A valid live owner vote wins; unsupported votes are unknown. Only completed PRs with empty reviewers may use one successful, current-turn, fully scoped receipt for an unsent owed reply, without a known head conflict. Scope-less legacy receipts hold instead of supplying missing evidence. Failed/unavailable/malformed/ambiguous reads never fall back to receipts. Re-reviews and broader asks remain open. SC-430. |
| 2026-10-22 | Completed work and PR identity | Approval families leave Waiting after verified changes and a persisted reply, not while newer asks, other parts' obligations, or failed/unknown changes remain. Closing reports with an owed reply stay open and keep their watch until send succeeds. The send receipt is saved before family cleanup, and interrupted cleanup recovers without resending. Terminal reports merge into the actual home; part plans retain other obligations. Broader work and its useful watches stay open. SC-431. |
| 2026-10-22 | Placement coverage | Actual Classic and New assemblies use the same canonical placement and show one home row across the shared fixtures and all 48 nonterminal home/part state combinations. Sender waits and parts stay visible. "Nothing needed" is never closure evidence. SC-432. |
| 2026-10-22 | Goal fidelity | Plans, stale jobs, and part reports cannot replace the home goal or done-when. Only an explicit changed outcome tied to the home's new owned pending ask can authorize replacement. SC-433. |
| 2026-10-22 | Group asks and skip audit | Backlog and live candidates persist past the cursor, behind direct asks and within paced daily limits. Owner candidates have no silent two-message drop. Distinct PR asks retain their identities. Every skip uses a fixed reason and IDs/outcome only, including one budget-deferral record per deferred turn; no text, names, or error payloads. SC-434. |
| 2026-10-22 | Relevant FYIs | Relevant group updates and recaps can become Catch up without a mention; thanks and unrelated requests remain noise. The fictional eval harness prepares blind production prompts and scores independent model reports through dispatch, distinguishing FYI from ignore and checking required facts. These isolated judgments are not live workplace or PR-review validation. SC-435. |

## Preview changelog

2026-10-22: Designed React preview architecture and normalized schema before UI.
Added an opt-in foundation build and three-version menu. No item actions yet.
Existing Classic and New remain available. See R-REACT-01, 02 and 09.

2026-10-22: Rebased the React foundation onto the reconciled engine, replaced
the class utility package with an owned helper, and reserved the version menu's
layout allocation so native option/font metrics cannot resize the header.
