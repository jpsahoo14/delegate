# Bounded read-tool scope

`workerTools(config, kind, scope?)` retains its full-catalog default.
`scopeTools` filters an already-read snapshot, including intent-specific tools.
Built-ins and unknown servers remain available. The existing deny, read-only,
clone/shell and sharing checks still apply.

The default server families are exported as `DEFAULT_TOOL_FAMILIES`.
`agent.toolFamilies` can override each server with `teams`, `ado`, `doc` or
`calendar`; invalid mappings are explicit setup errors. Replies keep Teams
and families represented by their links, attachments and known meeting/PR
data. PR and document jobs start with Teams plus their key's family. Other
jobs, trackers, automation, learning and rule-reading keep their existing
full tool paths.

A scoped tool/capability blocker permits one full-catalog escalation, counted
as another run. `job.fullCatalog` keeps subsequent attempts full. Partial
findings remain unfinished, and no review completion or send permission is
created. An owner's one-extra-run allowance starts full and cannot escalate
into another invocation.

Run logs record `tools: {offered, scoped}`: the count of selected configurable
tools (not the constant worker protocol), and whether scoping actually
removed any tools. Job run metadata preserves this across restarts. No
message, attachment, URL or prompt text is added to this telemetry.

Prompt builders receive the selected tool list through the existing
`Config.agent.tools` input. The worker-owned scoped-catalog instruction is a
separate provider handoff; no unreviewed prompt argument or model flag is
invented here.
