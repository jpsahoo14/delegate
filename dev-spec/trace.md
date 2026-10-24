# Read-only trace timeline

Run `delegate trace <code|traceId|submissionId|runId> [--content]`.
The command reads today's and the previous UTC day's state logs from every
machine, matching structured local host log lines, and stored reports for
correlated runs. It does not start a host, run work, scan session folders,
repair data, update settings or write logs.

Output is timestamp-ordered JSONL with `source` and `failureStep` on failures.
Exact trace/run/submission links join the timeline; item codes select all their
traces within the window. Similar item codes and partial IDs do not match.
Stored run reports contribute counts and blocker status, never prose by default.

The telemetry catalogue classifies events. Content-class events are omitted
unless `--content` is explicit; unclassified legacy events retain only a fixed
metadata field set, not arbitrary payloads. Secrets are scrubbed even with
content enabled. Malformed/partial lines are counted on stderr without echoing
their text; filesystem failures remain errors. An empty result is explicit.

`node scripts/prove-trace.ts` uses only a fictional Temp root, checks the real
source CLI, and snapshots file bytes and modification times to prove no writes.
`node scripts/prove-trace.ts --bundle` verifies the built CLI.
