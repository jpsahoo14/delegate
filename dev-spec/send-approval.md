# Owner-approved sends (#35, #37, #45)

## Reply marker (I34, decision 45; .46)

`markerFor(text, workflow, by, config)` in runner/send owns the delivered form.
Automatic replies always carry the marker. An unchanged Delegate draft follows
`signApproved`, except during `learnAfter`; owner-authored and edited replies
never carry it. Comparison strips a trailing preview marker and uses the send
path's existing HTML/whitespace normalization against the current draft.
A marker is stripped only as a standalone trailing line or block, not when its
words occur at the end of an ordinary sentence. `withMarker(required=false)`
removes the suffix rather than treating its presence as permission to sign.
The existing correction caller therefore gets the unsigned form; ack and
reminder paths retain the default required marker.

Successful workflow sends and acknowledgements log catalogued `marker`
metadata with item code, `applied` and `why` (`auto`, `approved`, `owner-edit`,
`owner-text` or `off`). No reply content is in this metadata event. HOST owns
the corresponding event hooks after successful correction and reminder sends
in apply/automations, using `owner-text`/false and `auto`/true respectively.
The page only previews the delivered form; New owns its paired I34 editor/footer
change. Stored drafts and sent history are not migrated. Final consent,
revision, claim and last-await source checks remain in place.

The PE-approved send contract keeps the page's exact-revision guard first.
Owner intent checks may use only the warm host's optional one-shot `quick` API,
never a cold CLI or the item's session. Rule sends retain their stricter checks
and never use the relaxed intent check.

## Stale Send anyway (decision 47)

Decision 51 carries the actual private 0.2.45 release (`b37d9356`) into the
reviewed SEND line without replacing its earlier `0730e90c` merge history.
The released PR-join helpers stay in runner/work; approval classifiers stay in
core/vote-claims and retain runner/work's compatibility exports. The telemetry
catalogue keeps both reply-marker and PR-anchor-conflict metadata. Generated
files are rebuilt from the combined source, not resolved by choosing one side.
This carry-forward does not change the consent or final-send checks below.

A page override consents only to the held digest shown on that card. New passes
the intent's `reviewed` into `Answer.sendReview`; the send dispatcher never
replaces it with the workflow's current digest. Missing or stale consent cannot
override a current hold, even when the page revision still matches because
intake has not yet stored the newer source message.

Editing a held reply restamps only the previously reviewed reasons for the new
draft. Unreviewed reasons retain their old digests and are not included in the
edit's new consent digest. Page sends perform a final fresh `threadSince` and
`heldSend` after all other asynchronous checks, immediately before calling the
external send. New related messages keep the draft and the updated hold with
"Not sent: Kim wrote again after you looked. Check and send again."
An owner reply or a reconciled earlier send also stops this final send.
The two reads share intent-check results only within that send, keyed by the
exact before/after messages, editions, draft and owner context. An unchanged read does not
consume another five-second model budget; any changed input is checked again.
If a final pass makes a new judgment, read the thread again before sending.
Continue until a pass uses only cached judgments. If that final recheck phase
takes five seconds, keep the draft and announce that the chat must be checked
again; never send on an unsettled or timed-out final pass (CR 02:50 B1).

Typed chat overrides bind to `holdNotice.digest`, the last hold announced by a
successful non-page refusal notice, never the current workflow digest. The
notice includes the held messages or edit and records its digest and time only
after delivery. Without a notice, or when its reasons have changed, Send anyway
refuses with a fresh notice; another confirmation can send that exact hold.
Clearing a hold for a new turn or draft also clears its notice. Both page and
typed chat sends make the final fresh check (PE 06:25 decision-47 addendum).
That ruling changes the existing fictional proof expectations: a chat override
after a page-only hold update or an unannounced no-reply result first gets a
notice, then confirms it. The send proof's automatic-send fixture supplies a
known internal membership response and checks the writer's active rule ID,
without bypassing either production authorization check.
PE 07:10 supersedes the earlier committed-proof request: keep the current-digest
and late-source reproductions outside the repository in Temp, run them on the
exact integrated stage, and record the commands, counts and outcomes in the
private release evidence. Add no proof journeys or P0 scenarios.
If a source read omits a stored,
unreviewed hold, that absence cannot clear it or grant consent. Keep the reason
bound to the current draft and show it again; an exact subsequent confirmation
can still send. A confirmed source deletion keeps its existing close behavior.
The E2E report's in-flight-poll explanation is plausible, not an established
cause. Only the exact integrated 0.2.45 stage can satisfy the browser gate.

This is a 0.2.45 release gate and applies to the same send path shipped in
0.2.44. A delay does not authorize a hotfix automatically: a narrower cut needs
a fresh Coordinator decision, CR review and both the page's reviewed-digest
transport and the engine checks together. Engine-only deployment fails closed
for held page overrides without that field. The fixed path is carried into
0.2.46 by merging the reviewed 0.2.45 chain, not rebasing or making a separate
port (decision 51). The extracted `runner/send.ts` retains the exact reviewed
`heldSend` and `send` bodies; the dispatcher retains the merged consent
transport. The extracted approval gate is unchanged. The merge resolution
requires CR review and the existing isolated decision-47 checks before any
0.2.46 SEND staging or further send-path/module-move work.

## Unknown membership (R34)

The first successful Teams members response per process records `members-shape`
as metadata: the union of member key names, counts of roles arrays/undefined/other,
only the known role enum words, and the number of nonempty tenant ids. No member
ids, names, emails or tenant-id values are captured. The source factory routes
the engine capture through `Store.log`; standalone adapters use stderr.
This probe does not relax the existing membership checks.

Automatic reply/ack decisions and standing sends record a membership wait only
when the audience is unknown and no guest/outside member was found. Organization
rules that cannot match an unknown audience also record that wait if a verified
internal audience would permit sending; this comparison never grants permission.
`state/membership-waits.json` deduplicates the held chat ids across restarts.
One `membership-waiting` health line shows the count without names or ids:
"Automatic replies are waiting: Delegate couldn't verify who is in 2 chats."
A clean membership read removes just that chat, including a read that positively
finds a guest; the last removal clears the line. Cached verified reads also clear
stale waits. Owner-approved sends and fail-closed authorization are unchanged.

## Forwarded-message shape capture

The first `forwardedMessageReference` attachment converted by a Teams source in
each process records `forwarded-message-shape` through the source logger.
It records field paths and value kinds only, including parsed JSON content;
no message text, sender, ids, timestamps or URL values are logged. The capture
is bounded to four levels, 32 keys per object, three array entries and 80
distinct path/kind pairs, with a truncation flag. Invalid JSON is recorded as
`invalid-json`, never as raw content or a parser error containing that content.
Keys outside `^[A-Za-z_][A-Za-z0-9_]{0,40}$` become `<key>`, so id-keyed
maps cannot disclose ids or emails. The once flag is set before inspecting or
logging the attachment. Capture failures emit a content-free stderr note and
never stop intake or retry the diagnostic on the next message.
Chat and channel reads share this capture. Conversion behavior is unchanged;
preserving forwarded text and links awaits the observed shape and PE plan.

## Vote-claim words

Approval detection matches whole vote words, not `approver` or `approvers`.
Future, conditional, negated and requested votes retain the existing non-claim
treatment; named reviewers keep their own classification, including `Kim approves`.
Remaining vote wording defaults to an owner claim, so unusual claims such as
`Just approved it` or `Gave my approval` never bypass the vote check.
Auxiliary/adverb prefixes such as `Have` and `Just` are not reviewer names.
The page and Send guard share this classification, including on edited drafts.
`APPROVAL_WORD` exports the non-global pattern from core/vote-claims for page
highlights; consumers needing global matching clone its source, not its word list.

## Untitled group chat places

Teams listing, lookup and gap-search results never name an untitled group or
meeting chat after the last sender or its id. Titled chats keep their title;
untitled groups fall back to `Group chat`. A one-to-one prefers the other
member's cached name when the owner id is known and exactly one other member is
cached; otherwise its existing fallback remains. Listing and gap search read one
cache snapshot each, without extra Teams calls or writes.

`groupChatPeople(store, chatId, ownerId, askerId)` in runner/sharing reads only
the existing members cache. It returns `{ names, count }` for the other members,
excluding the owner and asker. Names are first names, with a last initial when
first names clash; `count` includes cached members whose names are unavailable.
Unknown names return undefined; no remaining members returns an empty list.
New owns the card/row/source wording and truncation, not this data helper.
For these names and sharing's person labels, trailing parenthetical suffixes are
removed and `Last, First` becomes `First Last` before taking names/initials.
The shared `personName` export in core/format also normalizes the cached
one-to-one counterpart name; New can use it before taking headline first names.
No membership fetch, permission change or stored-title rewrite is performed.

## Structured work left for the owner

The pure vote classifier lives in core/vote-claims; runner/work keeps
compatibility re-exports during the ownership split. PR reference helpers
remain in runner/work until HOST's separate reference-helper move.
The send path and reply context live in runner/send; runner/apply retains
compatibility re-exports and calls the extracted helpers for owner answers.
The shared owner-answer receipt writer remains in runner/apply.
`okSendGate(store, cfg, wf, answer)` returns `{ refuse?, voteChecks }`.
It preserves the self-chat vote omission and Settings refusal order;
`refuse` carries the receipt text and refusal flag. HOST's dispatcher presents
that receipt and stops, or continues with live PR/deploy checks. It does not
merge LeftDraft records.

core/left-lines exports `LeftDraft`, `LeftKind`, `LeftAction`, `LeftSource` and
`LeftLine`, plus pure `leftRefusal(action, kind, details)` and `leftPromise(quote)`
constructors. A refusal requires its kind; producers supply action data, never
an id or a source. HOST owns workflow merge, stable ids, sources and clearing
in `Workflow.left`. Legacy strings are not parsed or migrated.

`core/setting-keys.ts` exports the Settings row namespace (`SettingKey`), its
static keys, and `settingKey(entry)`: a static entry stays unchanged, while a
catalog change becomes `change:<entry>`. Settings rows and refusal producers
share the helper; worker refusals validate the same namespace, including
dynamic `read:<tool>` and `allow:<tool>` rows. The Settings module re-exports
the type and helper for page consumers. New owns opening and focusing
`#settings/<key>`; producers never infer keys from copy.
Existing row keys, labels and save behavior are unchanged. Stored refusal
metadata is not rewritten; new worker output with an unknown key fails schema
validation rather than creating an unresolvable Settings target.

`vet.left` and `prepareEffectCalls.left` expose the refusal records.
`effectRefusal` returns the code-owned denial record; the existing `refusal`
string API reads its reason, preserving the send/execute gates. Settings
refusals carry the actual `change:<entry>` key (or `deployTo`); lifecycle,
incomplete, other-PR, old-invite and deploy refusals are classified where the
gate rejects them, never from their explanation. `deployBusyLeft` is the pure
constructor for HOST's deploy-busy branches. `leftText` generates the legacy
chat/status line from a record and preserves promise quotes. `vet.todos` instead
keeps the exact 0.2.45 `<effect.summary>. Not made for you: <why>` text alongside
each draft, including changes excluded by a deploy. The summary distinguishes
different refused changes; the legacy text is never parsed back into records.
`LeftAction.key` is required. Exact calls use a SHA-256 of tool plus recursively
key-sorted arguments, excluding only top-level transport correlation fields
`requestId`, `clientRequestId`, `correlationId` and `traceId`. PR, thread, build
and pipeline run ids remain significant. Missing calls use a whitespace-normalized
summary; promises use a whitespace-normalized quote. A refused comment carries
its first payload line in `action.quote`. Display quotes are verbatim prefixes,
clipped at a word boundary to at most 200 code points including the ellipsis.
Every quote carries code-assigned `quoteBy`: `delegate` for a refused comment,
`owner` for a promise, otherwise `asker`. Keys use the full input, never the
clipped display text. Normalization includes the key
when deduplicating, so distinct calls never collapse merely because their
display fields match. HOST includes this producer key in its line id hash.

`prepareReportCalls.left` includes incomplete proposals and folds them into
`Report.refused`, including the option number in the reason where relevant.
The worker report schema accepts structured refusals, including the suggested
reply/destination on another PR. Schema acceptance overwrites worker keys in
code before effect preparation can append code-made drafts. Worker keys are
bounded SHA-256 hashes of the structured refusal tuple and destination hrefs;
the generated suggested reply's wording is not identity. The full worker
quote survives repeated MCP/schema validation so recomputation is stable;
`normalizeReport.refused` clips its display quote without changing the key.
`normalizeReport.refused` retains kind, action,
settings and reply metadata, with compatibility `what`/`target`/`reason` display
fields generated from that record. It keeps `reply` and `pr` link fields only
for HTTPS URLs on dev.azure.com, a visualstudio.com subdomain,
teams.microsoft.com or teams.cloud.microsoft; otherwise it drops that field,
not the refusal line. Old prose remains plain content, not a
typed refusal or an inferred button. No new golden rows are added; legacy
report expectations reflect the deliberate removal of copy classification.

Regression (PE-approved): a pre-0.2.46 failed job with only a free-text refusal
now reads as an unknown failure; Try again leads while repeats are below two,
then Write. Current refusal producers write to the typed `todos`/`refused`
fields, not `job.error`. New owns switching G96 to a structured refusal fixture
in the same 0.2.46 stage, keeping its expectation that a current refused change
does not lead with Try again. No legacy copy parser or migration is added.
Additional legacy regressions from removing copy classification: to-dos retain
their raw engine reasons; tool-bearing reasons can sanitize to the same
"Review this step yourself." line and deduplicate. Legacy refusal context can
appear as informational review findings, while a "Refused change" fact keeps
its warning tone. Structured `refused[].reason` now uses the plain cause rather
than the removed friendly-wording translator. These display changes do not
authorize a change. HOST's merge and New's structured rendering must land in
the same stage before shipping new refusal lines.

HOST must consume these arrays when applying reports, choices and preparation
results and generate workflow ids/sources/lifecycle state. SEND does not
write `Workflow.left` or change the card-state/projection/rendering ownership.

Worker reports carry the question alone and optional `questionHint.answers`
for page chips. Normalization retains supplied metadata and ignores orphan
hints. Text rendering composes `Answer "A70: yes"` from the item code and suggested answers;
an empty hint uses "your answer". Old command-bearing questions remain unchanged
and are never parsed into hint metadata. HOST owns report application (copy
the hint with a question, clear it for previews and replaced questions),
engine-generated questions and the remaining lifecycle writers.
`normalizeQuestionHint` is shared with text rendering: answers become one
trimmed line without double/smart quotes, backticks or invisible format/joiner
characters, at most 60 Unicode code points and three
case-insensitively distinct answers. An item code anywhere, or a control verb
as the first word, drops the answer rather than repairing it. Both checks run
again after clipping, so truncation cannot create a code or command. The question
remains visible. HOST can use the same helper at its application boundary.

## Rule-governed job results

Catalog version 3 adds optional `when.results: true` to send grants. Ordinary
send grants do not cover completed review/investigation results. This permission
requires the existing line confirmation, with a version-3 grant and matching
text hash; old grants are not reinterpreted or widened. Read-back names review
and investigation results explicitly. Restrictive draft/ignore/ack/shortcut
rules still participate in the strictest matching decision; review permissions
remain in their existing review lane.

SEND exports `decideResult(store, cfg, wf, reply, facts)` from runner/autosend.
`ResultFacts` is code-owned completion data: destination `chatId`, the current
workflow `revAt` as `turn`, vetted `effects`, all report/vetting/refusal `todos`,
optional question/blocker/goalMet/context, and, for reviews,
`{ review: { pr, head } }`. HOST must first stamp the current turn and verified
review basis on the workflow, merge current effects/questions/to-dos and work,
then decide. No rule can override pending effects, unresolved/kept to-dos,
questions, a blocker, goalMet=false, Not reached context, an unverified review
basis, another destination or a stale turn.

The existing policy/authorization chain still checks membership, guests/outside,
caps, holds, confidence, promises, gaps, votes and secrets. Result mode relaxes
only the blanket open-work hold, not other safeguards. Quiet hours hold results;
delivery retains dueSends' owner-presence check. An ordinary send grant leaves
the result with `No rule sends results in this chat`. Ack/ignore decisions retain
a draft rather than acknowledging or dropping a result.

HOST integration contract: persist these facts per parent workflow as
`job.result.sendFacts[wf.id]`, beside the exact result reply, before the scheduled
send can be processed. The existing sendAt/dueSends and final automatic Send
check re-read the facts and rules through automaticDecision. A changed result
reply in that turn waits; missing facts on old results fail closed. There is no
upgrade, repair, scheduling of old results or new sending path. HOST owns
finishWork's call site, scheduling, persistence, receipt and nudge; New displays
the policy reason/read-back. SEND's API alone does not enable result sending.

## Structured failures (R31)

`normalizeReport` exposes optional structured `failure.cause` for the page's
failure-word table. An engine-stamped document failure, or an existing stored
content failure on the failed-card path, is classified only by the shared
canonical document-failure parser; stopped failures name
`run-stopped`. A known step can carry a structured retry time. Other free-text
errors do not acquire a guessed step, target, HTTP status or reason. Existing
structured causes survive normalization; Details keep the existing why/tried.

## Rule-line lifecycle (R12a)

`Store.rules()` reads `activeRuleGrants(root)`, a read-only reconciliation of
the current markdown and compiled line records. A changed or missing source
line cannot keep an old grant alive after it has a bound source. Every new source line appears as Reading;
the read does not repair files or infer approval. Legacy recorded approvals
are kept only for capabilities already supported by those rules, not newly
supported organization sends. Trusted learned/style metadata and grant ids
survive page edits and compilation.
Legacy bindings trim and collapse whitespace, while hashes retain the exact
source text. In a legacy file without line records, a confirmed, non-off grant
that passes the existing legacy predicate (non-widening, named accounts, or an
organization review grant) is also kept when its generated text does not match
the prose. Each such grant has its own confirmed `carried` line, with its
original id, action and scope, never unbound and never sent for compilation.
No historical edit check is invented: the old file has no reliable source hash.
Unsupported widening and other unbound compiled rules remain inert Waiting lines;
the reconciliation writer logs `rule-migration-unbound` with each rule id once.
Read-only views do not write logs or repair files. An actual edit to an existing
line still clears its compile and confirmation, including whitespace-only edits.

Unmatched legacy prose is kept as notes, not rule lines. It grants nothing,
does not enter the compile lane and does not duplicate the carried grants.
Migration and compile reconciliation write only the compiled record, its notes
and the source hash; the original markdown bytes are unchanged. The first
owner-initiated write keeps each note's text verbatim under a marked notes
heading that `ruleSourceLines` skips, and materializes the carried source lines.
After that, those lines follow ordinary source-edit/deletion checks.

New's notes contract is `wayNotes(store): WayNote[]`, with `id`, exact `text`,
`textHash` and a boolean `review` for the PR-review-specific not-on notice.
Show the notes once in a collapsed "Your notes from before (N)" block, outside
the normal line list. The list is what Delegate does; notes change nothing.
For review notes: "Not on. Make it a line to have Delegate review PRs this way."
`makeNoteLine(store,id,expectHash)` atomically removes the note and returns a new
Reading line through the normal compile/confirmation lifecycle.
`deleteNote(store,id,expectHash)` removes only the note. Both use the central
writer and refuse stale ids/hashes without granting anything.

All page mutations use the central non-spinning writer and compare the exact
current line text hash inside its fresh-read lock. An unrelated hand edit is
preserved rather than making every page write fail forever. Page add/edit and
inline answers never call setup's explicitly confirmed `writeRules` path.
Widening grants wait for `confirmLine`; narrowing applies when read. Off keeps
the confirmation, so the same confirmed words resume without another approval.
Delete retains a hash-checked Undo record; restoring it preserves its previous
approval and holds, rather than silently granting new authority.

HOST's compile-priority lane calls `rulesToCompile(store)` and then
`finishRuleCompile(store, id, expectedTextHash, rawOutput)`. The first reconciles
source drift through the same writer, including heading-only edits; the second
fresh-checks identity and text, validates structured output and refuses stale
or invalid completion. Both return no guessed permissions. Can't-yet/Partly
lines are read again after a catalog change. Previously supported narrowing
constraints stay active during that re-read; widening stays inert, and changed
compiled permissions clear approval. Identical compiled meaning can keep the
same recorded approval across a catalog update.

`ways.ts` builds each three-line read-back and status from this data. Its
`readBackLabel`, `readBackValue` and `statusText` are separate fields; the page
never needs to parse copy. `setting` is the bound Settings key for both actual
rules and redirects; only `redirect: true` means the latter. `ruleIds` supports
the Done filter and seven-day `byRule` counts, cached with the snapshot.
Conflicts describe overlap on both lines independently of the winning grant;
the existing strictest-wins policy still decides the action.
`linesToCheck` counts Waiting and Unclear without scanning usage logs, separately from the one open habit
suggestion in `needsHim`. Suggestions and their dismissal history now come from
HOST's `habitSuggestions`; dismiss, Undo and Reconsider call HOST's transitions,
without duplicating its timers or evidence rules. The displayed suggestion hash
is checked before Add it or dismissal. An unchanged Add it calls HOST's
`answerHabitResult` and retains the actual consent time and trusted metadata.

`addSuggestedRuleLine(store, text, {learned, style?, ruleId})` is the trusted
writer handoff for edited suggestions. It preserves the original grant id and
provenance, but creates only an unconfirmed Reading line. It does not accept the
habit or turn on the original rule. Edited `acceptSuggestion` checks the displayed
suggestion id and text hash, refuses blank words or edits to an already accepted
suggestion, then passes the edited text to HOST's `answerHabitResult`. HOST owns
the transition: writer refusals leave the habit unchanged; success accepts the
edited suggestion and returns its unconfirmed Reading line without activating
the original grant. Unchanged acceptance keeps its existing consent path,
including suggestions to remove a drafting style.
`undoAcceptSuggestion(store, id, expectHash)` takes the added line's id and
`textHash`, not the suggestion's H code. It checks the current learned line under
the shared rules-writer lock, then calls HOST's `undoAcceptHabit` with its trusted
habit key. HOST restores the exact saved pre-acceptance state and removes the
whole learned line atomically. Its refusals (including expired, edited, repeated
or stop-style acceptance) are returned unchanged; a stale line/hash or busy
writer is refused without changing anything. This Undo is not a dismissal and
does not advance the Not now/Never history.
Learned records are grouped by their habit key, so a multi-grant compiled line
survives unrelated habit writes without duplicate line ids or lost grants.
Legacy removal of one of its grants removes that habit's whole line.
UI wiring and the compile lane remain separate New/HOST handoffs.

Review-context labels starting with CI and coverage (also CI and test/code
coverage) are live status, alongside Live votes and Newest builds. A Coverage
label alone remains eligible to describe a code finding. Read-time normalization
omits them only from PR-review context facts; findings, trackers, non-review
items and the review gate's Not reviewing fact remain unchanged.

## PR vote claims (L1)

`changeSays` supplies only the action, location and text for lists and statuses.
Unused call arguments remain in `shown().detail` for Details, never appended to
the one-line form (R34). Previously stored statuses are not rewritten.

In self-chat, a bare `ok <code>` leaves every pending PR vote out of both the
item and its job before approving the remaining changes. Numeric selections
alone do not name a vote. The existing `ok <code>: vote` explicitly consents
to the shown vote; `ok <code>: Approved` (and the other named vote values)
consents only to that exact value. Negated, conditional, numeric or other
free-text bodies do not consent. No new command aliases are introduced.
The page's exact-revision actions are unchanged.

The omitted vote is retained as an unchecked effect with
`offReason: 'self-chat-ok'`, never marked made. Both effect lists retain that
reason, so editing a held reply cannot lose its omission notice.
An owner-send check survives delayed execution and is copied to sent checks,
history, status and the final receipt: "Your vote on PR 123 wasn't cast:
a plain ok never votes. Vote on the PR." Sending a reply does not create a
new vote-only action or promise a later self-chat approval command. Existing vote-claim checks
still hold a reply that falsely says the omitted vote was cast.

PR-review replies wait unless an explicit review rule covers them and the reply
is built from comment receipts. Replies mentioning approvals or votes always
wait for the owner. `decide()` and `whyWaited()` use the same
core vote-word detector; the runner re-exports it without a core-to-runner import.
Scheduled sends re-evaluate this policy before sending.

`aboutPr(store, wf, text?)` is the shared, read-only PR-context test exported
from `runner/apply.ts` (R18): an engine PR reference, PR-review intent, or a PR
link in the reply, last ask or asker's stored thread. New can import it instead
of maintaining a separate projection copy.

`isNonAdoPrLink(url)`, exported beside `voteSentences` in `runner/work.ts`,
recognizes HTTP(S) PR paths using `pull`, `pull-requests` or `merge_requests`,
including non-Azure enterprise hosts and PR subpages. Azure DevOps cloud hosts,
non-PR links and invalid URLs return false. It is a pure URL test, not a vote
claim or permission check. New combines it with `voteSentences` for the
uncheckable-vote warning; it never blocks an owner send or grants an auto-send.

## Rule-authorized PR comments and replies (R10a)

`reviewRuleFor()` is the shared matcher for policy, waiting reasons and the
named `reviewCommentHook` handover in `runner/jobs.ts`. Rules may narrow the PR's
reviewer groups; live eligibility still comes from `review-gate.ts`, never
from the rule. Settings writes the standard English line through `writeRules`,
marks it `source: 'settings'` with a text hash, and preserves its text on Off.
Multiple review rules are toggled together and shown as Custom.

Setup and Settings rule writes use the central `store/rules.ts` writer. It takes the
non-spinning `withRecordWriteNow` lock on `rules.compiled.json`, then starts
a fresh read of that file and `rules.md`. Existing-line edits compare the
exact text hash inside the lock; a changed source or line returns
"This line changed; your text is kept". Contention returns
"Delegate is saving another change; your text is kept. Try again."
Neither refusal writes a file or waits for the other writer on the page thread.
Both source and compiled writes are atomic file replacements under that lock.

`writeHabitRules(store, rules)` is the trusted habit-writer handoff. It changes
only learned rules, preserves current owner/Settings rules and pending line
records, keeps style/learning metadata, and refuses a changed source instead
of rebuilding over the owner's newer words. HOST must check its `{ok, why}`
result before recording acceptance or dismissal; until HOST switches its
`setRules` entry to this helper, the habits integration is not complete.
Per-line compilation, confirmation and the Settings facade are a later step;
the lock/writer foundation alone does not activate that interface.

The hook retains the current ask IDs before attaching the review job, captures
read provenance, and creates an isolated
comment-only carrier. Subset approval binds the exact IDs, text and turn; all
votes, held findings and excess comments remain proposed on the same workflow.
The executor never starts a model to execute that carrier. Each post rechecks
the current rule, pause/stop, safety policy, reviewer role, head, audience,
catalog-built call and existing threads. Unknown provenance stays held for
sharing; failures and uncertain writes never retry automatically.

At job completion, one live PR read must match HOST's `job.reviewStart` via
`sameHead` before `finishWork` stores `wf.reviewBasis = { pr, head, at }`.
A missing stamp, failed read or moved head grants no basis and no automatic
post/reply; findings stay proposed. `reviewAgain` records a live head only when
a start stamp exists for the same PR and the heads differ. A missing start is
not evidence of new changes. The missing-basis status mentions posting by rule
only for items covered by a review rule; other items retain their report summary.
A worker-reported commit and a proposed vote are never authority.
`reviewDone.head` and `reviewDone.reviewedAt` come from that basis. Each post
rechecks the live head against it, and a new turn clears it.

At most ten new comments post, High first, with deterministic severity tags.
Actual write receipts carry severity and `byRule`; `reviewDoneFacts` exports
the posted comments, lowercase severity counts and remaining exact IDs for New.
The reply frame counts only those receipts. Final failures permit a partial
count; for proposed findings, no posted comments or an uncertain receipt means
no automatic reply.
At most one summary sentence follows the frame, after vote, commitment,
source and audience checks; otherwise Details records the short-version reason.
The global auto-send switch stops both review comments and replies, including
an already queued batch. A verified review with an explicit empty findings list
and no proposed changes or unanswered question sends the clean-review frame,
"Reviewed PR <n>; no comments from my side." Its facts carry `clean: true`.
The engine records `Job.result.reviewClean` only at verified completion on an
active PR covered by a review rule, with no blocker, unmet goal, sender wait,
rejected proposal or preparation failure. Without a covering rule, or on a closed
PR, an empty done report retains the existing Nothing needed behavior per item.
An empty findings list alone never authorizes a clean-review reply.
This is distinct from findings that failed or were held: those still send
nothing when no comment was posted.
The normal send path rechecks the rule at its write boundary, retains the owner
item for the vote, and records `byRule` on its send and review events.
New owns the card/projection wiring; HOST owns close-on-vote and moved-head UX.

Vote sentences are classified in order: requests/future/conditional/withholding,
another reviewer's approval, then an owner claim for every remaining wording.
No vote word means no claim classification. Bounded live-vote matching includes
"Reviewed and approved", "Approved with one nit", rejection and requested changes.
Future/negative words after an already-completed vote claim do not exempt it.
Each comma, semicolon, dash or colon clause is classified independently. A
condition, question or request elsewhere in the sentence cannot hide a completed
claim; the full sentence is retained for its PR references. Past-tense "When I
approved it" reports a completed action, rather than a future condition.
The existing live PR check remains the authority. A recommendation is never
evidence of a vote. Same-Send effects execute first; a completed vote receipt
must match the PR, repository, head and current ask before it can support a
completed PR whose reviewer list is unavailable.

An unsupported owner claim preserves the approved draft and exposes
`wf.statusReason = { kind: 'vote-claim', text, at }`, retaining HOST's shared
lifecycle-reason shape. The sibling
`wf.voteClaim = { why, pr?, claim, vote?, digest, automatic?, canOverride? }`
contains the vote-only details. `text` is the final PM card/confirm copy; `why`
retains the specific live-check failure. A vote hold requires both the
`vote-claim` kind and the sibling details; a legacy `not-sent` reason is not a
vote hold. Clearing chat/vote holds preserves every non-vote lifecycle reason.
The digest covers the reply and live-check reason, and the page revision covers
the status reason and vote digest. Only page **Send anyway** on that exact revision
can override the same claim hold, after another live read; chat cannot override.
A changed draft basis (`canOverride: false`) or automatic hold (`automatic: true`)
cannot be overridden. Ordinary chat-reason digests and this digest are combined
when both are held. Overrides log only code, PR, claim and vote metadata.

Legacy automatic-send attempts redraft once, then preserve the second draft as
not sent. A replacement draft, explicit edit or new turn clears the hold.
Redraft starts a new retry budget. No owner-approved draft is redrafted by this
check. No new tests, proofs or golden rows are added under the owner's current
validation rule; PE reviews the eight cases with commit file-and-line references.

Card-owner handoff (no card changes here):

- Background PR polling retains its older approval-only definition of the owner
  writing. Non-approval uses of "rejected", "waiting for author" or "my vote"
  cannot make a vote refresh move the owner's own draft on. The broader live
  vote-claim check still applies at send time.
- `voteClaimGap(text, effects, lastKnownVote?)` is pure and exported from
  `runner/work.ts`. Its optional last-known value is
  `{ pr: number, vote?: number, head?: string }`; the result is
  `{ pr?: number, claim: number | 'approval', why: string }` or `undefined`.
  A proposed vote or matching live vote supports the warning; a made receipt
  additionally requires the last-known head. `why` uses the PM's final copy.
- Show the gap/held `text` above the bar, disable ordinary Send until the reply
  changes, and use the same copy to confirm page **Send anyway** with the current
  revision. Read held text from `statusReason.text` only for kind `vote-claim`
  with `voteClaim` present. Read `automatic`, `canOverride` and `digest` from
  `voteClaim`, not `statusReason`. Never offer override for `automatic` or
  `canOverride: false`. With no PR number, the copy says "this PR".
- **Add the vote** submits `verb: answer, text: add the vote` with the exact page
  revision. The engine builds an unapproved proposal from the carrier report's
  recommendation and existing PR scope. Normal approval makes the vote before
  sending the reply. No recommendation means no proposal.

## Author edits

Teams `lastEditedDateTime` becomes `RawMsg.editedAt` and is stored on each
thread message. Reaction changes to `lastModifiedDateTime` are not edits.
If edit metadata is absent, the shared `contentKey()` compares content without
URL, image-reference, mention-markup, case, punctuation or whitespace differences.
Equal keys, or at most two changed words with no changed digit, date or negation,
are cosmetic for an owner send. The latter relaxation never applies to rule sends.
Operational state changes (for example Mitigated to Active) are not treated as
typos: the revised PE's explicit owner-row regression requires an intent check.

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

The engine exposes `wf.reasons` through `holdReasons()`, falling back to the old
single `wf.reason`. It continues writing the first reason to `wf.reason` while
the card owner migrates both experiences. One `holdCheck()` collects edits,
all unclaimed asker asks, and an existing no-reply hold together.
Preservation marks synchronous report results pending; async dispatch and job
boundaries evaluate them once. Ordinary ticks do not repeatedly recheck holds.

- `ask-edited`: `msgId`, `before`, `text`, `at`, `digest`. Show old/new words and
  when the asker changed them; `changed` names the owner-relevant change.
- `asker-wrote-again`: `msgId`, `text`, `at`, `digest`. Show the exact newer ask.
  `changed` names the owner-relevant change.
- `no-reply-needed`: `why`, `digest`. Show "Delegate thinks no reply is needed
  now: <why>. Your approved draft is kept." Offer **Send anyway / Skip**.

The card-state owner must map ALL reasons into the existing not-sent pattern;
this change adds no card component branch. Send `verb: answer, text: send anyway`
to review the current chat reason set, or `verb: answer, text: redraft` to
explicitly redraft using all changed asks. Real-change reasons lead with Redraft,
otherwise Send anyway leads. Page actions send `sendReview: wf.holdDigest` and
retain the current `expect` revision, which hashes the full reasons. The digest
hashes sorted reason digests. Every current reason must have been reviewed: a
post after the click holds once with the new full set. Page-edited send text
restamps shown reasons; typed chat send cannot silently replace a held draft.

Only unclaimed asker asks reach the owner-intent check. Context posts and asks
claimed by other open items do not. There is
no automatic rerun of an owner Send. Existing deletion, duplicate, PR-evidence,
effect and page-safety checks remain in force.

## Changed-intent filter

After cosmetic comparison, reduce old/new asks to owner-name/first-name/alias
rows, rows containing draft-cited digit runs of at least five digits, and
non-row instructions/headers/questions. Remove other people's rows and normalize
dates, times, relative ages and parenthesized counts. Equal reduced text sends
without a model.
Matching non-row total headers such as "8 CRIs" and "10 CRIs" ignore only their
count when the rest of that header agrees with the old ask. Other header wording,
owner instructions and owner-row numbers remain meaningful. Identical reduced
editions are deduplicated before comparison and the model step, including when
only those paired totals and ages differ.

Otherwise the optional warm `host/client.quick(prompt, jsonSchema, 5000)` gets
only reduced old/new text and the draft. Only JSON `stillAnswers: no` with a
nonempty `changed` line holds. Yes, unsure, malformed, missing changed, missing
quick, host errors and the five-second hard timeout fail open. No retries.
The host owner supplies a fresh, no-tools fast-model session; SEND never calls
`ensureHost` for this path.

All new asker messages are ordered and reduced together, with at most one model
call for that batch. A later unchanged digest cannot hide an earlier new
question. The `asker-wrote-again` reason retains `msgIds` and exact `messages`;
its digest covers the complete batch. Legacy `msgId`, `text` and `at` remain for
card compatibility. Restamping, confirmation and Redraft use every message.
Deduplication affects the intent check only: holds and their digest still retain
all original message ids, texts and timestamps.

`owner-send-checked` logs step, result and elapsed milliseconds. A successful send
persists history in `wf.sent.checks` and `owner-send-history` events, plus work
steps when present: "Sent. Kim posted again at ...; nothing changed for you." or
"Sent. Kim posted again at ...; Delegate couldn't check it in time." The card
owner renders these as history only, never a post-send warning.
The engine formats the history timestamp as a short local clock time, using the
owner's configured time zone (or the runner's local zone when none is valid),
not raw ISO text.

Engine, HOST quick and the New/Classic card adaptation ship together.

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

Run `node scripts/prove-send.ts` and `node scripts/prove-send-holds.ts`.
They use real intake, dispatch, apply, send,
page-revision and card-data paths, with a stub worker and Teams source. All data,
CLI homes and local state live in a newly created Temp directory and are removed
afterward. It is a standalone journey proof, not a unit test or CI addition.
One read-only E2E check of an edited Test Meeting message is pending: after a
message is edited in that chat, read it with GetChatMessage and record whether
`lastEditedDateTime` is present. This proof does not access live Teams or edit
metadata there; missing metadata is explicitly covered by the content-key fallback.

## WYS Slice 1: positive inclusion (S1-3)

`Answer.include` carries stable `pageChangeId` values from the approve intent.
`Answer.page` retains its exact `expect` revision, `reviewed` hold digest and reply
digest. `workflowApprovalRev` now binds origins, evidence, reasons and ambiguity
groups as well as the calls. Missing metadata leaves legacy revision hashes
unchanged.

`effectConsent(workflow, answer)` in `core/page-approval.ts` is the pure preflight.
`okSendGate(store, cfg, workflow, answer)` consumes it and applies the selected
set to both the item and its carrier through the existing `only` writer. Unknown,
duplicate or ambiguous ids, insufficient group selections, and included votes
refuse the entire selection before that writer runs. An empty include list is
valid and excludes every pending change. Votes use their separate Approve path.

Nonlegacy chat approvals derive only asked/promised/note/rule changes, without
groups or votes. Suggestions stay excluded and the receipt adds
`<N> suggestions not included: tick them on Delegate's page.` Rule-driven review
execution also excludes suggested changes and unresolved groups before building
its authorized batch.

The policy's pending-change hold ignores suggested effects: a proposal is not a
promise the reply must carry out. All other pending origins, todos, follow-ups
and independent automatic-send checks retain their existing holds. HOST's
separate after-send path drops unrun suggestions on a successful rule send;
this policy correction neither approves nor executes them. Old items use the
same read-time origin check without a migration.

Old originless revisions retain the existing numeric/except path through the
shared `legacyEffectOrigins` read-time predicate. A mixed or origin-bearing
revision never falls back to that path. There is no migration or repair.

### HOST H1-1 handoff (required before integration)

The approve intent is `{kind: 'approve', expect, include: string[], reviewed?}`.
Map `include` to `Answer.include` without converting it into numeric exclusions;
keep `expect` and `reviewed` in `Answer.page`. Keep the existing page guard first.
For positive-inclusion revisions, invoke `okSendGate` against that guarded,
unchanged revision **before** numeric/except selection or replacing draft text.
Its returned `voteChecks` also carries omission notices; retain them in the
owner-send checks and final receipt even when the owner-send record is created
after the gate.

The current HOST caller still converts `except`, mutates numeric selection and
replaces edited reply text before its late gate call. H1-1 must bypass that
legacy preparation for positive-inclusion revisions and reject nonlegacy
`except` before its writer runs. Keep the dedicated vote Approve route separate
from this generic include list. SEND does not edit HOST's caller or New's intent
producer. This is a reviewed-provider handoff, not completed page wiring; Slice 1
cannot ship without H1-1, New's consumer, S1-4 and all other slice items.

## WYS Slice 1: action claims and promises (S1-4)

The six built-in write capabilities declare completed verbs, future verbs and
object words beside their existing catalog lines in `core/effects.ts`.
`changeClaim(effect)` resolves the descriptor from the exact call, not the
worker's summary. An unregistered capability supplies no promised attribution.
Recognized claims without a matching registered change still hold; this is a
bounded catalog classifier, not model-based language inference.

`core/action-claims.ts` exports:

- `actionClaimGap(text, effects, include)`: the first unsupported first-person
  completed-action claim, with capability, action, sentence, matching effect ids
  and warning text. Include uses `pageChangeId` values. Confirmed completed
  effects support a claim; uncertain, failed or unticked pending effects do not.
- `replyPromises(text, effects)`: future-action rows from the current draft,
  including any matching effect ids, for the before-Send projection.
- `attributePromise(text, effect, effects)`: an actual reply substring only when
  one distinct structured change is identified. Conditional futures, negations
  and ambiguous targets do not pre-tick a proposal.

All three reuse the vote classifier's exported `sentencesOf` and `clausesOf`.
Structured work-item/PR/comment/thread/build/pipeline ids and invitation
recipients constrain matches. A generic object is attributable only when the
report offers one distinct matching change. Origin verification runs after call
preparation so it attributes the final call, including rebuilt comments.

`okSendGate` checks the proposed/edited reply against the include set before
changing selection or approving execution. The final `send` path checks again
after the existing live vote-claim check, including automatic replies. A gap
keeps the draft and holds Send with `statusReason.kind = 'action-claim'`; an
existing vote-claim hold is never replaced. No migration or repair runs: legacy
numeric consent is unchanged, while the consistency check reads the current
reply and actual changes.

New owns the generalized live check endpoint and warning UI. It consumes the
same pure `actionClaimGap` and `replyPromises` exports on edited text and exact
include ids, alongside the existing vote result. No endpoint or card branch is
added by SEND. S1-5 adds the exact-revision Send-anyway path; this intermediate
source commit is not independently releasable.

## WYS Slice 1: exact-revision consistency override (S1-5)

The generalized check consumer uses `actionClaimConfirmation(gap)` for the PM's
exact confirmation copy and `actionClaimReview(workflow, text, include)` for its
review token. Only the confirmed page action carries `Answer.actionClaimReview`,
with the original exact `page.expect`, proposed reply and explicit include ids.
The token binds the revision, words and sorted selection. A stale, chat-only or
no-longer-applicable token refuses without changing or sending anything.

After checking it, `okSendGate` records a metadata-only
`workflow.actionClaimOverride` receipt and logs the catalogued
`action-claim-send-anyway {code, capability}` event. The receipt binds the item,
chat, ask, message ids, turn, reply, existing sent-message id, complete change
identities and included ids. It deliberately survives only selection flags and
execution receipts on those same changes: jobs may finish them before the reply
goes out. A changed reply, new turn, new ask, changed call or extra pending change
invalidates it. A plain new Send clears it. Old items have no receipt and receive
no override. No read-time repair or default authorization is added.

The final completed-action check requires actual completed changes, not merely
pending included changes. The valid owner receipt may bypass this consistency
hold (including the older unmade-invite consistency hold); rules cannot use it.
The live vote check still runs and cannot be bypassed by an action-claim token.
Decision-47 hold review and the post-change reply digest remain independent.

New must carry `actionClaimReview` from the confirmed generalized-check result to
the page answer without treating it as `sendReview`; HOST must keep the reviewed
S1-3 gate-before-mutation order. SEND's receipt survives the asynchronous changes
without a new HOST job field or a second approval writer. The UI confirmation and
intent producer remain other-owner integration work, not a completed page claim.

The gate's zero-selected-change early return uses the same candidate reply as
the claim check: `send.text` when supplied, otherwise the stored draft. Thus an
owner can send new words from a suggested-only item with no stored reply after
all suggestions are excluded. The caller does not need to change the draft (or
forge a revision) before checking consent. No candidate words and no selected
change still returns "Nothing was changed."

S1-4 corrective boundaries: generic "sent you the report" is not invitation
evidence. Calendar verbs require calendar-object words; "invited" itself is
invitation evidence and its recipient is checked against the call. Action claims
use the shared clause splitter's `keepNumberLists` mode, so "work items 4200123,
4200456" remains one action and both targets must be supported. Vote callers
retain the original default split, byte-for-byte expression and behavior.

The I-a amendment's unchanged-revision check is the gate's first refusal, also
for legacy-origin items. A zero-change early return requires both no stored
draft and no candidate text. HOST passes the existing `Answer.text`; it must not
replace the stored draft before this check.

## WYS Slice 1: selection event catalog (S1-6)

`telemetryEvent` admits `wys-include`, `wys-exclude` and `wys-dismiss` with
exactly `{code, effectKey, origin}`. All three are metadata events in
`TELEMETRY_CATALOG`; other fields are dropped with the existing diagnostic.
`effectKey` is the capability plus target kind, never the target id, summary,
reply, note, ask quote or a read-back label. `origin` is the verified effect
origin, not a new inference or an invented origin for legacy items.

HOST owns emitting these events at the actual serialized selection/dismissal
intent boundary. This catalog does not generate events from page reads, execute
changes, suppress suggestions or train habits. The dismissal producer follows
the reviewed I-b store and its exact-revision intent. `wys-note` and later-slice
learning are not activated here. Existing content-event retention is unchanged.

## WYS Slice 1: suggestion preparation and internal provider (S1-2)

Draft and work prompts receive actual item scopes from their runner callers.
The capability list intersects enabled changes with the cached catalog and
those scopes, rather than advertising every configured write to every item.
Unknown target kinds are not guessed. An optional calendar change needs a known
recipient identity; a display name alone is not evidence for another address.

`prepareReportCalls` prepares suggestions separately from requested changes.
An unbuildable or refused optional change creates no owner to-do or Left-for-you
line. Surviving suggestions pass `vet`, structured item-target matching, dedupe
against requested alternatives and each other, the actual reviewed dismissal
reader, the no-votes rule and a shared cap of three in report order. This also
covers effects downgraded to suggested origin and suggested choice effects.
Holding reports and rule reports have no suggestions. Selected proposals join
the executable `effects` lists with origin `suggested`; `suggested` is emptied
after preparation so read projections do not add the same proposal twice.
This does not grant consent: the reviewed inclusion gate still decides what runs.

`effectCapability` supplies the dismissal capability key: the exact call tool
plus its lower-case action when present, or `delegate:<action>` for an internal
effect. Its scope key is the reviewed `dismissKey(capability, target)`.

The exported `INTERNAL_ACTIONS` zod union and `InternalEffect` type admit only
`delegate/watch` with strict `{target, until}` and `delegate/check-back` with
strict positive-integer `{days}`. Neither permits a call. `internalEffectProblem`
is shared by refusal and `builtEffectProblem`; unknown actions or payload fields
are refused without a tool lookup. Internal suggestions are built by HOST, not
accepted from worker `suggested` data. The ordinary worker call builder still
requires an exact catalog call.

This is the provider-only order approved by PE: HOST next supplies the reviewed
`runInternalEffect(store, wf, effect)` executor returning a promise of
`{ok:true, ref?}` or `{ok:false, error}`. Only then does SEND wire `makeChange`
and its normal receipts. No internal producer or dispatch is activated here.
The Ways dismissal union also waits its same-cut New projection/schema consumer;
no fake Habit, Rule or compatibility reader is supplied.
`WayTurnedDown` exports that exact union now for the consumer to compile against;
`WaySuggestions` still returns only its existing habit rows until the reviewed
consumer can accept the suggestion variant.

### Legacy selection preflight (PE 17:16:59)

The unchanged revision check remains the first refusal in `okSendGate`.
Only the legacy result from `effectConsent` derives its effective include set
from the original pending change numbers: `except` leaves those numbers out,
`nums` keeps those numbers and `[0]` keeps none. The existing range refusal and
legacy vote path are retained. Claim checking and the denied-change scan use
that effective set, so an excluded change disabled in Settings does not block
the owner. Non-legacy revisions still require explicit ids and reject numeric
or except selection.

This preflight does not perform legacy `only` mutation or quote confirmation:
HOST must pass the original selection unchanged and call it before mutation,
then retain the existing legacy quote/vote behavior. It is not a second gate
to call after a selection has already renumbered pending changes.

### Producer and Ways consumer entry points

HOST's code-built deterministic producer can use `suggestionSelector(store, cfg,
items, existing)` from effect-preparation. The returned selector shares one
three-suggestion budget and dedupe set with `existing` and passes each candidate
through exact-call/internal-schema validation, vetting, item-target matching,
the actual dismissal store and the no-votes check. An accepted effect is returned
with suggested origin; a dropped optional candidate returns undefined. Worker
data still goes through `prepareReportCalls`, which never admits worker internal
effects. The producer remains responsible for not generating suggestions on
holding or rule sends, as the report path already enforces for its context.

The New consumer can compile against `WayTurnedDown` before the union producer
is connected. For its suggestion variant, Reconsider calls
`reconsiderSuggestion(store, row.key, row.kind)`; this routes directly to HOST's
real scoped dismissal writer, including its busy result. Existing habit calls
without that kind retain their existing transition. There is no key guessing,
fallback reader, fake Rule or second dismissal store. Returning the new rows
still waits the actual same-cut consumer handoff.
The bounded prompt also supplies the actual item target identities as data and
their accepted structured target spellings, so it does not ask the worker to
guess an id from a display label. These identities are not telemetry.

Preparation failures retain their originating proposal until provenance is
verified. Only verified requested work can create a refusal, question or
Left-for-you line. A failed unverified proposal is downgraded and dropped, in
both the main report and choices. Promise attribution still uses the final
prepared calls, not an invalid raw call that failed preparation.
Per the named scope-context exception, the only net host-runner edits are the
two prompt call arguments supplying workflows and their resolved PR targets.
Scope construction remains in the prompt/scope API; the host files have no new
imports or helper logic and remain host-owned.

### Slice 1: suggestion dismissal admission

The page's `dont-suggest` intent uses the real typed Answer/Parsed key and label
carrier. `enqueueParsed` preserves those fields only for that verb, with the
existing seen revision and submission identity. Its acknowledgement describes
a queued suggestion dismissal, never a Send or a completed dismissal.
The runner remains responsible for checking the current suggested scope,
scrubbed label, revision, busy state and uncertainty before storing a dismissal.
There is no chat parser syntax, effect-id mapping, extra PageApproval digest,
schema duplicate or compatibility bridge.

Page admission also preserves the resolved `include` and `actionClaimReview`
fields unchanged through the real `Parsed` carrier into the workflow Answer.
Only `from === 'page'` forwards them; chat answers never do. An empty include
stays empty, and a missing include or token stays undefined. Admission does
not select changes, reconstruct a token or relax the existing approval gate.
The named carrier exception changes only the `Parsed` type line; its owner
retains the rest of the parser and no new chat syntax is introduced.

### Slice 1: dedicated page vote consent

Origin-bearing page approvals carry a dedicated `vote` containing the vote's
`pageChangeId`, separate from `include`. Admission forwards it unchanged only
from the page. The consent gate requires the exact current revision and an
explicit include list, refuses this carrier on legacy revisions or chat
answers, and resolves it to exactly one pending effect with a structured vote
call. Votes in `include` remain refused, including a vote also named by the
dedicated carrier. Legacy page approvals retain their existing numeric form.

The send gate includes the validated vote in claim checks, pending-change
selection and refusal checks. An empty include plus a vote is not an empty
selection. Rule and chat paths do not acquire vote consent. HOST owns its
approved-selection caller and New owns the dedicated Approve resolver; each
needs its own reviewed successor. Execution still rereads the PR before
casting the vote.

### Slice 1: internal changes after Send

External changes keep their existing pre-send approval, execution and call
ledger. `isInternal` identifies the Delegate namespace, including invalid
internal proposals so they cannot fall through to an external tool.
`externalPending` excludes that namespace from the pending external list.
The execute prompt preserves original change indexes while listing external
changes only; `makeChange` refuses every internal index without a write.

HOST takes the pure `internalReceipt(wf)` only where approval is verified,
before clearing it. The receipt contains the item id, the approval timestamp
(or the stored item's update timestamp on a direct owner send), and pending
internal indexes with canonical identities excluding done/error. Rule
approvals produce no internal items. This is an in-memory handoff, not a new
post-send permission or a persisted approval.

HOST calls `makeInternalChanges` only after a successful Send or its approved
no-reply rest branches. The dispatcher consumes the receipt once, rechecks
each current index and identity, and refuses automatic retries of an uncertain
change. It calls the real typed internal executor and records done/error plus
the existing Made/Not made history step. Check-back clears the completed turn,
so its change receipts are retained for HOST's following commit. The dispatcher
does not set workflow state or use the external call ledger.

HOST owns the execute-decision, external-left-count and caller changes in
the job/apply paths. Failed-send, stale, held, tracker and other non-send
branches drop the receipt and leave the internal work pending for a new
approval. Those callers require their own reviewed successor; this API does
not activate them or the separate Ways runtime union.

### Per-PR review frame provider

Each PR unit owns its review basis, posting run and completed review facts.
Only the one asker reply is item-level. `UnitReviewRun`, `UnitReviewDone`,
`ReviewFrame` and `ReviewReply` define this boundary beside the existing review
fact helpers. Completed unit facts omit the scalar PR id: the unit owns it.

The pure `frameOf`, `unitForJob` and `reviewedUnits` readers inspect only the
unit list. Job matching uses `unit.job`, not the item's current job. Generic
readers preserve the caller's actual unit type without defining HOST's unit
schema or manufacturing workflow clones. No units means no unit review facts;
legacy scalar state is not a fallback.

HOST owns the unit fields and one-time migration. The later autonomy, policy
and send switch must follow that actual typed handoff; these types and readers
alone do not activate a review, migrate state or grant permission.

`UnitReviewCompleted` is the separate completion receipt on `ReviewFrame.completed`:
job id, result time, live completion head, verified flag, finding count and an
optional clean marker. A basis proves a revision, not completion; `done` records
rule-authorized posting and keeps its required rule id. A manual completion
never invents a rule id.

HOST owns the writer: only a done report with `goalMet !== false` and a review
result can produce a completion receipt. Missing, failed or stopped results
produce none. An unverified completion needs review again; rule posting requires a
verified completion matching its basis. Old manual items get no guessed
receipt. This additive type provider alone changes no writer or reader.

### Job-bound review references

Report comment preparation resolves a unit-backed PR review through
`unitForJob(item, report.workflowId)`. Every parent must resolve to the same
project, repository and PR before a comment builder receives a reference.
Missing unit matches or references cannot fall back to a scalar PR target.
Legacy records without units and non-review reports keep their existing
reference path.

Review completion likewise uses the actual job's matched review unit before
considering a legacy parent without units. A matched unit with no reference
produces no completion rather than borrowing another parent's PR. The live
completion read and start-head comparison remain unchanged. These readers
neither write completion receipts nor activate multi-PR orchestration.

### Per-unit rule-posting approval provider

`UnitReviewRun.approval` is required and holds the actual rule id, exact
effect ids, `keyOf` digest of precisely that posting subset and the unit's
review epoch. The later producer must write it with the unit's posting batch,
only for a verified completion matching the review basis. It must not derive
permission from the shared reply text, item revision or a completion alone.

HOST owns the review epoch and its invalidation, the per-unit execution guard
and migration. The guard must match the rule, job, epoch, unique pending
unit-PR effect ids and exact subset/result digests, excluding votes. Manual
approval and the separate asker-reply guard are unchanged. Old scalar rule
approvals are dropped fail-closed by that migration, never converted into
unit permission.

This type-only provider changes no producer, reader, executor or stored data.
The posting producer still needs the actual reviewed completion writer and
epoch/guard handoff; this declaration does not activate posting.

### Unit membership and same-read completion facts

The completion reader returns `factsOf(live)` from its existing PR read.
`ReviewCompletion.facts` and `UnitReviewCompleted.facts` are optional so a
failed read or an older receipt never acquires invented meaning. HOST owns
copying those facts and the title into its completion writer, and using the
unit's completed facts for `prMeaning` and `Effect.pr`. Facts are not permission;
no second read or data migration is added here.

For items with `prs`, suggestions are scoped to each referenced, unskipped unit.
A candidate must match a unit scope before the existing exact-call vetting.
The central three-suggestion cap, duplicate and dismissal checks, preparation,
owner-only Add me validation and exclusion of votes remain unchanged. Non-PR
scopes remain available even when there is no eligible PR; legacy items without
`prs` retain their scalar target.

The change executor still selects the parent whose actual approval covers the
job. A PR call must belong to a referenced unit when `prs` is present. A vote
also requires that unit's eligible reviewer role and a verified completion at
the unit's current head and the effect's reviewed head. The same backstop covers
votes coupled to other changes in the approved batch. The immediate live vote
read uses that unit's reference, never a different scalar PR, and remains the
call-time authority for status, meaning, head and role. Rule comment receipts
likewise link to their actual unit. Legacy no-unit behavior, the call ledger and
uncertain-write handling are unchanged.

Deploy and other non-PR calls retain the existing item PR context for validation.
For a native unit set, that context exists only when there is exactly one unit;
no PR is chosen from a multi-unit item. Calls naming a PR still require actual
unit membership, and malformed PR calls without `pullRequestId` remain refused.
This is a call-time rule for both existing and new items; no stored-data upgrade
or new pipeline argument is needed.

This is the consumer seam only, not a rule-posting producer or runtime-composition
approval. HOST's facts/title copy follows the reviewed SEND input separately.

### Requested-unit classifier handoff

The report input schema accepts optional `reviewPrs`, an array of positive
integer PR numbers. The reply worker reports only PRs the ask requests a review
of, not excluded PRs or context-only mentions. A review directive followed by
several links includes each requested linked PR. This is the same classifier
trust as the existing single `job` key, never permission to review or post.

HOST owns the typed report consumer, validation against the actual ask PR set,
deduplication, the narrowing-only deterministic exclusion check, per-turn
`requested` storage and requested-unit-only fan-out. Its existing deterministic
review-request check is necessary but not sufficient. For old or absent arrays,
only the scalar job-key unit can be requested, still under both deterministic
checks; there is no migration or all-unit fallback. This schema/prompt delivery
does not implement those HOST gates or activate posting.

### Native review posting and the shared reply

Rule posting consumes the current requested unit's actual verified completion,
original work job, result timestamp, basis, head and required epoch. It never
derives a request from a rule or a missing classifier field. The actual carrier
job is bound to that unit without replacing the shared item job. Its approval
stores the existing `keyOf` digest and unique selected effect ids together with
the real rule and current epoch, in the same update as the posting batch.
Only that PR's comments are considered; votes, unrelated units and the owner's
approval are not changed.

At the write boundary, the existing native `stillApproved` guard and fresh
unit reference, live head, reviewer role, confirmed rule, audience, exact-call,
thread-duplicate and ledger checks all still apply. Comment approval does not
depend on shared reply text or `revAt`. Current owner drafts, pending asks, raw
worker windows and already-replied turns hold automatic posting.

PR-comment sharing checks use the matched original unit job's reply sources,
read provenance and finding sources, never the combined draft's source union.
Unknown, restricted, chat-derived, private, stale or labeled sources still hold
the comment; the Teams reply retains its combined-draft sharing checks.

Receipts update only the matched unit and its original work provenance. Only
this batch's matched comment receipts merge into the original proposals; finding
identity also matches comments whose transport text gained a severity prefix.
Unrelated non-PR proposals, other units, existing receipts and proposal metadata
remain intact, including before the Teams reply succeeds. Clean
reviews need a real verified clean completion; an empty comment batch is never
an executable approval. Independent owner-only vote proposals stay untouched and
do not prevent a clean receipt. Uncertain writes retain their receipts and prevent an
automatic shared reply. HOST's existing composer remains the only reply
composer. SEND consumes its held `reviewReply`, checking the current turn,
exact draft, unique complete unit list and each unit's rule, epoch and current
verified head. The final send repeats those checks through the existing policy,
audience and send path; it never treats a stored completion or meaning snapshot
as consent.

Old scalar review state is not read as automatic permission. HOST's reviewed
load-time migration supplies native frames, or the review stays with the owner.
This source handoff does not waive remaining HOST reader integration or coupled
runtime acceptance, and introduces no new schema or migration.
