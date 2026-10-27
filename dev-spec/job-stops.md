# Stopped jobs and owner-requested runs

A missing capability stops a job immediately, including tracker and learning
jobs. `job.stopped` records `{kind: 'capability', need?, at}`. The normalized
need is owner-facing state, not a tool identifier or an error. Stop log events
carry the job and kind, not the need.

Attaching another ask preserves retry history, spending, the stop, and any
holding reply. A teammate's contribution is news, not permission to restart.
Only a current owner note/message, Try again, or the page's `one-more` action
can grant another invocation. Ambiguous multi-job actions are refused rather
than choosing a job from history. The text-command parser is unchanged.

`job.oneMore` is a pending, single-use allowance. Starting a tracked worker
consumes it and records `job.run.oneMore`; restart recovery cannot spend it
again. A pre-start agent hold leaves it pending. The daily run cap refuses
the action without creating an allowance. Neither action resets the stop or
spending.

The extra invocation cannot schedule job-level retries or a wrap-up run.
Transient/tool retries inside that invocation remain the AI's choice. A
failure preserves the original stop and records a short reason in `job.error`.
A canonical successful completion clears the stop; successful reports normally
omit `goalMet`, and the existing completion checks still decide success.
Requests arriving during the invocation remain for owner review rather than
launching another invocation.
Holding replies wait for the owner's approval; no change or reply is approved
by requesting an extra run. Jobs without a stop retain their existing path.

## Per-job spending

`job.spent` records runs, known input/output tokens, unknown-usage runs, an
optional complete credit total, and the first observation time. Each active
AI run persists `run.spent` when charged, before terminal transitions, so
restart recovery cannot charge it again. Direct non-AI calls are excluded.
Missing token counts increase `unknownRuns`; they are not measured zeroes.
Credits remain absent once any counted run lacks complete/BYOK credit data.
Old completed runs and backfilled usage never seed this counter.

`agent.jobLimit`, when present, requires positive whole-number `runs` and
`tokens`. There are no chosen defaults. Immediately before a local or relay
run, the known totals and run count are checked. Reaching either creates a
sticky budget stop, preserving the limit snapshot in `stopped.limit` and the
original threshold in `stopped.basis`, and
leaving any holding reply for owner approval. Changing the setting does not
restart a stopped job.

The single-use owner allowance bypasses this check once, without resetting
spending. A tracker's next due scheduled check begins a new episode; retries,
missed-check retries, wrap-up and an extra-run allowance do not reset it.
