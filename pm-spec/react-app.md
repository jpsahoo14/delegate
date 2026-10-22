# React preview: product requirements

The preview preserves the New experience's four tabs and every existing action,
without changing the runner or silently switching an existing installation.
It is not approval for the proposed card redesign.

## Data first

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
- R-REACT-08: Every failure is visible, keyboard paths work, no command hints.
- R-REACT-09: No owner-data writes, AI calls, publishing or pushing during build.

Wrong targets, injected text, stale data, owner absence and double clicks must
not cause an unapproved send or effect. Untrusted content is rendered as text.

## UX-case walk

U01-U61 are parity obligations, not new requirements for the runner. Existing
implemented cases must work in React. Unbuilt manager digests, meeting summaries,
away briefings and dated promises remain explicitly not implemented rather than
fabricated. A final scenario matrix will link each implemented behavior to tests.
