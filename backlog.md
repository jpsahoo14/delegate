# React preview backlog

Repository-local tracking; external specifications remain read-only for this build.
Scenario range reserved for this branch: SC-400 through SC-419.

| Milestone | State | Evidence |
| --- | --- | --- |
| #29 reply-history retention | Implemented in this follow-up; official PE diff review pending | scripts/prove-reply-retention.mjs; five runs retain two local/synced histories, jobs unchanged |
| #29 compact redraft runner | Done in this fix commit; PE ok; card display separately owned | scripts/prove-redraft-latency.mjs; delayed-stub warm p50 5,711 ms; dev-spec/react-app.md; docs/scenarios.md bug 10-24 #29 |
| #39 host tool setup and recovery | Done in this fix commit; PE ok, no unit tests | dev-spec/react-app.md; docs/scenarios.md bug 10-24 #39; scripts/prove-host-tools.mjs and broader isolated real-runtime proof |
| M1 architecture, schema, scaffold, version menu, served build | Done in this foundation commit; isolated installs verified | dev-spec/react-app.md; test/react-preview*.test.ts |
| M2 typed data/actions, Now and open card | Done, rebased as fbda41f on c8815d3 | reviews/react-ui.md; dev-spec/react-app.md; test/react-app-browser.test.ts |
| M3 Done, Numbers, Settings | Done, rebased as cfd6bf2 | pm-spec/react-app.md; test/react-app-browser.test.ts |
| M4 React New full parity | Implementation and New-side acceptance complete; formal test phase deferred by owner | dev-spec/react-parity.md |
| React Classic and in-app experience toggle | Separate builder owns classic/ and toggle integration | Owner coordinates the two branches |
| React Classic Needs-you visual/interaction milestone | Done in this milestone commit; formal tests deferred | Shared prerequisites 9855e7d; dev-spec/react-app.md browser measurements and action evidence |
| React New visual parity milestone | Done in this visual-pass commit; intentional safety/data-label differences disclosed | design-spec/react-app.md; reviews/react-visual.md; dev-spec/react-app.md |
| react-all integration and shared visit/count correction | Done in this integration-fix commit; merged e93a0f5 once | dev-spec/react-app.md; direct fictional-store New/Classic browser comparison |
