# Owner-approved sends (#35, #37)

The PE-approved send contract keeps the page's exact-revision guard first.
Sending never calls a model. Rule-based sends retain their stricter checks.

## Author edits

Teams `lastEditedDateTime` becomes `RawMsg.editedAt` and is stored on each
thread message. Reaction changes to `lastModifiedDateTime` are not edits.
If edit metadata is absent, the shared `contentKey()` compares content without
URL, image-reference, mention-markup, case, punctuation or whitespace differences.
Equal keys, or at most two changed words with no changed digit, date or negation,
are cosmetic for an owner send. The latter relaxation never applies to rule sends.

A cosmetic or conversion-only refresh changes the stored thread text and metadata
only, never `lastAsk`, `revAt` or `pending`. It logs `edit-ignored`.

## Durable approval and card integration

`ownerSend` snapshots the approved draft before preflight. A no-reply worker
report cannot erase it: `keepApprovedDraft()` restores the snapshot and sets
`needs_human`. Old `approved` fields are also recognized before rerunning;
normal drafting never scans approval logs. This protection is explicit in reply
and job report application, not in persistence: `Store.save()` never changes
domain state. Every new turn, a replacement reply report, an intentional Edit,
Redraft, Skip or close ends that approval and clears its reason. Successful
sending clears it too.

The shared card data exposes `reason` unchanged from `wf.reason`:

- `ask-edited`: `msgId`, `before`, `text`, `at`, `digest`. Show old/new words and
  when the asker changed them. Offer **Send anyway / Redraft**.
- `asker-wrote-again`: `msgId`, `text`, `at`, `digest`. Show the exact newer ask.
  Offer **Send anyway / Redraft**.
- `no-reply-needed`: `why`, `digest`. Show "Delegate thinks no reply is needed
  now: <why>. Your approved draft is kept." Offer **Send anyway / Skip**.

The card-state owner must map those fields into the existing not-sent pattern;
this change adds no card component branch. Send `verb: answer, text: send anyway`
to confirm the current reason, or `verb: answer, text: redraft` to explicitly
redraft using the changed ask. Use the normal Skip action. Page actions must
retain their normal current `expect` revision. The confirmation is bound to the
draft, effects and message; a subsequent change holds again.

Only an unclaimed newer message classified as an ask from the asker holds an
owner send. Context posts and asks claimed by other open items do not. There is
no automatic rerun of an owner Send. Existing deletion, duplicate, PR-evidence,
effect and page-safety checks remain in force.

## Last legacy restoration

`restoreApprovedDrafts()` runs once before dispatch, guarded by the
`draft-restore-37` timestamp in `state/upgrades.json`. The marker is written even
when there are no recoverable items; subsequent ticks and process restarts do not
scan the logs again. It needs retained log evidence:
the latest owner answer is `ok`/`send`, the forced-new-message rerun occurs beside
that receipt (state is logged before the answer receipt), and a no-reply report
follows within ten minutes. The draft comes from an earlier archived reply report,
never from a guess. Already drafted, sent, redacted, skipped or explicitly closed
items are excluded. Restoration logs `draft-restored`; the next dispatch does
nothing. Missing archives or evidence leave the item untouched.

This is the PE-authorized last log-keyed repair, not a `probeMark` repair.
The card-state owner should move it into the versioned upgrade chain at step 6.

## Proof

Run `node scripts/prove-send.ts`. It uses real intake, dispatch, apply, send,
page-revision and card-data paths, with a stub worker and Teams source. All data,
CLI homes and local state live in a newly created Temp directory and are removed
afterward. It is a standalone journey proof, not a unit test or CI addition.
One read-only E2E check of an edited Test Meeting message is pending: after a
message is edited in that chat, read it with GetChatMessage and record whether
`lastEditedDateTime` is present. This proof does not access live Teams or edit
metadata there; missing metadata is explicitly covered by the content-key fallback.
