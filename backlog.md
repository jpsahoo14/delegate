# React preview backlog

Repository-local tracking; external specifications remain read-only for this build.
Scenario range reserved for this branch: SC-400 through SC-419.

| Milestone | State | Evidence |
| --- | --- | --- |
| R10c live groups and owner-item completion | a2cca7df plus PE news correction in this commit; fix review pending | Review-start vote baseline, changed non-zero live vote/close-after-ask only; old context retained, receipts kept; head-change slice follows SEND merge |
| R20 review type/start-stamp prerequisite | Built in this commit; SEND completion verification and R10c lifecycle follow; PE review pending | Optional data only, code-read start head, failed-read clearing, awaited starts and fresh post-read guards; no new proofs |
| L2a reviewer-group answer engine | 56dde322 plus PE B1/B2 correction in this commit; fix review pending; L2b card separately owned | Text questions list cleaned groups; worker picks/card verbs preserved; shared groupChoices, one config write and PR re-read |
| Step-6 PE blocker B1 | Fixed in this commit; PE fix-only re-review pending | Real constructor reproduction and no-op proof; 40 upgrade journeys and schema-literal AST guard |
| Card-state step 6 | Built in this commit per PE A1/A2; official diff review pending | Pure compatibility + 50-item schema chain, stable workingSince; 35 legacy/lifecycle/concurrency journeys; no card/projection edit |
| #51 chat effect wording | Built in this commit; official PE diff review pending | 21 copy variants plus real approval receipt; send 26 and sharing 12 preserved |
| #27 tick phases and commit audit | Built/proven in this wiring commit; official PE diff review pending | API 29, retention 15, 20 ticks max 1,593 ms, real HTTP <=248 ms, cross-process send/job/PR/window safety |
| #27 async scope API | e5629416; PE approved API-only | scripts/prove-read-phases.mjs, now 29 invariants and separate I/O counters |
| #45 warm-only quick checks | Implemented in this commit; official PE diff review pending | scripts/prove-host-quick.mjs; eight-second local provider capped at 5,009 ms; normal worker unchanged |
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
