# React actions: M2 safety-gate review

Scope: the uncommitted action path only. That is `src/web/react-projection.ts`,
`src/web/react-submissions.ts`, the `/api/v1` routes in `src/web/server.ts`, `enqueueParsed` in
`src/mcp/server.ts`, the `Store.writeAnswer`/`answerById`/`pageSubmission` methods, and
`test/react-{enqueue,actions-api,projection}.test.ts`. I checked them against `dev-spec/react-app.md` and the
P0/P1 action findings in `reviews/react-spec.md`. Dependencies and UI are out of scope. The public-registry
blocker still applies on its own.

Verdict (first pass): **do not activate React item actions yet.** There is one P0 and four P1s. The
re-check below covers the corrections. These parts held on the first pass:

- **Free text stays one field.** `enqueueParsed` never re-parses text. The runner parses only chat messages,
  never stored answers. The `, ok A9` tests pass on the intended item.
- **Manual Undo matches the runner.** The `undoUntil` gate in `enqueueParsed` matches `apply.ts` `undo()`.
  An expired window is refused, and nothing is queued.
- **A lost 202 response is safe.** Duplicate POSTs return one answer with the original receipt, including from a
  new `Store` and after the runner moves the answer to `done/answers`. A fingerprint mismatch is refused.
- **Exact actions are gated before enqueue.** Item cards' approve, send-edit, pick, reply-only and undo, and
  knowledge save, check the offered action, its revision and `expect` against a fresh projection.

## P0

**P0-1. Page answers are no longer applied in time order. An earlier page click can override a later Pause.**
`writeAnswer(a, submissionId)` names the answer file after the client UUID. `applyAnswers` relies on
`listJson`'s filename sort ("Apply owner answers in time order"). That works only because `ulid()` ids sort by
time. UUIDs do not:

- Current ULIDs start with `01…`, so almost every UUID sorts after every chat answer.
- Two page answers sort randomly relative to each other.

I reproduced this in a temporary store. I queued a page `resume` (UUID), then a later chat `pause` (ULID). In
198 of 200 runs, the runner would apply the pause first, then the earlier resume. Delegate ends up running
against the owner's last instruction. Both answers only need to be queued during the same tick, and a tick that
is drafting can take minutes. The same inversion affects automation Pause/Resume, Later/Draft, Undo/Wrong and
any two page actions on one item.

- *Fix:* keep answer ids as ULIDs. Generate the ULID when the submission is prepared, store it as
  `answerId` in `PageSubmission`, and call `writeAnswer(answer, record.answerId)`. Have `finish` look up
  `answerById(record.answerId)`, and return `ids: [answerId]`. The submission UUID becomes only the receipt
  key, so `writeAnswer` no longer needs to accept it.
- *Test:* queue a page action, then a later chat answer, then a second page action. Assert that
  `store.answers()` returns them in click order.

## P1

**P1-1. A lost refusal can never be recovered: the client stays on "Not sure it went through" forever.**
`submitIntent` runs `resolveIntent` before it saves anything. 409, 410 and 422 refusals, and refusals thrown by
`resolve`, are never recorded. If such a response is lost, the client does what step 6 requires: it calls
`GET /api/v1/result?submission=`. The server answers 404, "Keep checking; do not send it again", and keeps doing
so. The item stays disabled until the session ends. The fingerprint-mismatch 409 has the same problem, and it
uses the "stale" status code for a different meaning.

- *Fix:* when a submission is refused, save a `PageSubmission` with `phase: 'refused'`, the status and the
  text. Then `GET result` and a duplicate POST return the original refusal. Use a different code from 409 for
  identity reuse, for example 422 with its own text.
- *Test:* send a stale intent and discard the response. Assert that `GET result` returns the 409 refusal, that
  re-POSTing the same id returns it again, and that no answer is queued.

**P1-2. Crash recovery and `GET /result` enqueue without re-checking the action.**
A record stuck in `phase: 'prepared'` is finished by `finish()`. It calls `enqueueParsed(record.parsed, record.rev)`
directly, without `resolveIntent`. A crash between `savePageSubmission(prepared)` and `writeAnswer` leaves such a
record. Recovery is triggered by any later `GET /api/v1/result` or repeated POST. That can happen much later, for
example after the reload that step 6 asks for. At that point the action is not re-checked for being offered, for
its revision or for `expect`.

The runner's apply-time check covers only `ok`, and `edit` or `send` while changes remain. A plain
"Send your version" therefore goes out, possibly hours later, against a conversation the owner has not seen. A
GET also should not be able to send.

- *Fix:* store the validated `Intent` in the record. When a prepared record has no answer, run `resolveIntent`
  again before enqueuing. If it refuses, or the record is older than a short bound (for example 60 s), save it
  as refused with "Nothing was sent. Open the item again." `GET` should only read. Do this recovery from the
  POST retry, or from server startup.
- *Test:* create a prepared record for `A1/send-edit`, bump A1's revision, then call `GET result`. Assert that no
  answer is queued and the receipt is a refusal.

**P1-3. Row actions skip the approval gates and are labelled `local`.**
In `reactProjection`, row bindings are created with only `{ input }`. Every row action therefore gets
`staleness: 'none'`, no `expect` and `effect: 'local'`. Some row commands are approvals:

- The promise row, `ok A7` ("Make N changes" or "Check again"), makes system changes.
- `ok R…`, "Start reminding", starts sends.
- The track row, `ok A7`.

Through a row, these skip the 409/`expect` pre-check that the spec requires for approvals (§API contract,
P1-1). They are advertised as having no effect, so the client cannot show the change's meaning or ask for
confirmation before ok. The runner's apply-time check is not a full backstop here: `seenAt` is the
client-supplied `intent.rev`, which is never validated for `none` actions.

- *Fix:* do not mint a second binding for a verb the item card already offers. When the row command parses to
  `ok`, `send`, `edit`, `pick` or `undo` on a workflow, reference the item's existing action id (for example
  `${code}/approve`), so that its staleness, `expect`, `effect` and meaning apply. For automations, and for
  any `ok` that has no item action, set `staleness: 'exact'` and give an accurate `effect`.
- *Test:* for every placement action whose resolved verb is `ok`, `send`, `edit`, `pick` or `undo`, assert
  `staleness === 'exact'` and `effect !== 'local'`. Also assert that a stale `rev` on the promise row returns
  409 and queues nothing.

**P1-4. Normalized work entities have two writers with different ordering, so card timelines are wrong.**
The item loop writes `entities.workSteps['A7/work/step/0..5']` from `card().work.steps`, which is the last six
steps, oldest first. The placement loop then overwrites the same ids from `next` `work.happened`, which is the
last six steps, newest first. It also overwrites `planSteps['A7/work/plan/n']` and `work.total` with differently
built rows.

As a result, the opened card's `stepIds` resolve to steps in reverse order, and plan `owner`, `now` and `build`
depend on which loop ran last. Ids are meant to be projection identity (§Data model). The same id must not
mean two different rows.

- *Fix:* build work, plan and step entities once per work record, in one order. Give placements their own order
  as an id list, for example `happenedIds`, instead of rewriting the shared entities. Alternatively, use
  distinct id namespaces.
- *Test:* in the projection test, seed an item with more than one work step that also has a placement. Assert
  that `items[A].workId → work.stepIds` resolve in chronological order, and that no entity id is written by two
  loops with different content. One way is to build into a guarded map that throws on an unequal overwrite.

## Gate gaps (not bugs, but required before activation)

- The P0-2 test in `react-spec.md` asked for Undo through the real `serveInbox`. The current tests call
  `actResult` directly. Add a `POST /api/v1/actions` test for `…/undo` on a manual send, once inside the window
  (202 and one answer) and once after `undoUntil` (refused, nothing queued).
- No test double-submits two different submission ids for the same action concurrently. This is acceptable
  because each click has its own id. Note in the spec that the client disables the action while it is pending.

## Re-check of the corrections (second pass)

Scope: only the corrections to P0-1 and P1-1 to P1-4, and the Undo gate gap. I read
`react-submissions.ts`, the `Store.writeAnswer`/`PageSubmission` changes, the row and work blocks of
`react-projection.ts`, and the new tests. I did not run the suite; the owner is running focused tests and
mutation checks.

| Finding | Disposition | Evidence |
| --- | --- | --- |
| P0-1 answer order | **Resolved** | The `ulid()` `answerId` is made when the submission is prepared and written in the same synchronous call. `writeAnswer` refuses any id that is not a 26-character Crockford ULID. Within one process `ulid()` is monotonic, and across processes order is by wall clock, as it was before. The UUID is now only the receipt file name. The test queues page `resume`, then chat `pause`, then page `stop`, and asserts that click order is preserved. |
| P1-1 lost refusal | **Resolved** | When `resolveIntent` throws an `IntentError`, a `refused` record is saved with its status and text. `GET result` and a duplicate POST return the original status, for example 409. Identity reuse is now 422 with its own text. The test drops a stale response and checks both recovery paths, with no answer queued. |
| P1-2 crash replay | **Resolved** | `recover()` never calls `enqueueParsed`. If the `answerId` is found in an existing answer or outcome, the record is `queued`. Otherwise it is a terminal refusal: "Nothing was sent. Open the item again." Only the original POST, in the same synchronous call that saved `prepared`, can enqueue. Only one process serves a given tab, so no other server can mark a record refused while it is being written. |
| P1-3 row approvals | **Resolved in code; test partial** | A row `ok` reuses the card's `${code}/approve` when one exists. Other `ok`, `send`, `edit`, `pick` and `undo` rows on non-`W` subjects are now `exact`, with the card's `expect` and a `sends` or `changes-system` effect. A `close` that marks to-dos is `exact` on the newest to-do time, and the card's Mark done now uses the same time. The test asserts only `staleness`. A mutation that drops `expect` or sets `effect: 'local'` would survive it. Before activation, the test should also assert `effect !== 'local'` and `expect === items[code]`'s approval `expect` when the subject has a card. This is required test coverage; I found no remaining code bug. |
| P1-4 work id collisions | **Resolved** | Placement work now uses `row:<code>/work…` ids, disjoint from the item's `<code>/work…`. The test asserts that the card's steps are in chronological order and that the two sets of ids do not overlap. Side effect: placement `work` no longer inherits `due`, `proposed`, `next` or `waiting` from the card, so the row shows only its own fields. Rows render `next` from the placement, so this is not a safety issue. |
| Gate gap: real-HTTP Undo | **Resolved** | `POST /api/v1/actions` for `A1/undo` on a manual send returns 202, and the runner applies it: the item returns to `needs_human` and `sent` is cleared. After expiry, Undo is not offered (410), and `enqueueParsed` also refuses it (covered by `react-enqueue`). |

Note (not a bug): the row lookup of `${code}/undo` never finds the canonical action, because Done-entry actions are
built after the sections. No row offers `undo` today, so the fallback exact row action applies. Move the Done loop
first, or drop that branch, if a row ever offers Undo.

**Second-pass verdict:** P0-1 and P1-1 to P1-4 are closed in code. Once the P1-3 test is extended to cover
`effect` and `expect`, and the owner's focused tests and mutation checks pass, the action safety gates no longer
block activation. The public-registry dependency blocker still applies on its own.

## Gate coverage evidence (third pass, as reported by the owner)

I did not re-run tests or re-review the code for this pass. What follows is the owner's report.

- **P1-3 coverage strengthened.** A `seedPromise` fixture now checks four things for every row approval on a
  subject that has a card: `exact` staleness, an effect other than `local`, the canonical `${code}/approve`
  action id, and an `expect` equal to the card's. The test also checks that the fixture exercised at least one
  canonical approval, so it cannot pass with nothing to check.
- **Results.** 15 backend safety and projection tests pass. Ten new mutation operators were killed.
- **Canonical-reuse mutant.** It first survived on fixtures that did not exercise it. The strengthened fixture
  killed it on a focused rerun. This is documented.
- **Code since the second pass.** The only changes are this coverage and read-only search/screen DTO
  additions, which have no action path.

**Disposition:** the one condition left open in the second pass, P1-3's `effect`/`expect` coverage, is met. The
action safety gates (P0-1, P1-1 to P1-4 and the real-HTTP Undo gap) no longer block activation of React item
actions. The public-registry dependency blocker still applies on its own.

## Addendum: apply-time page precondition (after reviews/react-architecture.md P0-1 to P0-3)

Scope: `core/page-approval.ts`, the gate in `applyAnswers`, `resolvePageIntent`, and the `page` field written by
`enqueueParsed`. I also read `test/react-approval-races.test.ts`. I did not run any tests.

**Verdict: the gate is sound, and I found no P0 or P1 issues. It does not block activating item actions.**

- **Ordering.** The gate runs first for any answer that has `page`, before the `except`→`nums` mapping, the
  digit-to-pick rewrite and `applyOne`/`correct()`. `applyAnswers` runs at the start of a tick, before intake,
  so a stale change or option position never reaches `only()`. Old callers write no `page` field, so their
  behaviour is unchanged.
- **Identity.** `workflowApprovalRev` covers `state` and `draft`. It covers pending changes as ordered stable
  ids (call or payload, system, action, target, head), with their meaning, summary and `maybe`. It covers option
  ids, `question`, `meeting`, `sent.msgId`, open to-dos, and work goal, next and proposed. It leaves out
  `updatedAt`/`revAt`, `status`, the thread and logs.
  - Two consequences follow. A made or reordered change, or a reordered option, refuses the answer (arch P0-1).
    Any send changes `state` and `msgId`, so a second tab's `send` or `ok` is refused (arch P0-2).
  - Automation and proposal digests cover only owner-visible content. The runner's own counters are not in them.
- **Kinds.**
  - `send-reply` on a done item is refused outright. It can no longer become `correct()`.
  - `undo-send` checks `sentMessageId`, so a newer sent reply is never deleted (arch P0-3).
  - `mark-todos` checks the to-do ids against what was open at enqueue. A rev equal to the time of the newest
    displayed to-do ties those ids to the drawn set. It returns before the digest, so unrelated edits do not
    block Mark done.
- **Binding.** `page.expect` is the server digest at enqueue. It is checked equal to the `expect` the client
  echoed, so it is what the owner saw. Row approvals reuse the card's action, or get `exact` plus the same digest.
  Actions with `staleness: none` carry no guard, by design. They do not send or change systems.
- **Duplicates.** Before applying a `page` answer, `store.answered(id)` skips it if a file with the same id is
  already in `done/answers`, whatever the machine suffix.

Non-blocking (P2):

- After `sentMessageId` matches, `undo-send` still requires the full digest to be unchanged. If anything else on
  the item changes after enqueue, Undo is refused with "Nothing was deleted". For example, the asker replies,
  the item reopens and a new draft is written. It fails safe, and a refreshed page offers Undo again within the
  window. Consider returning after the message-id check, as `mark-todos` does, if this happens often in practice.
- The Mark done test marks only `t1` and then asserts `state === 'done'` while `t2` is still open. The item
  closing with an unseen to-do still open comes from the existing `close` behaviour, not from this gate. Check
  that `t2` still appears on a to-do row.
