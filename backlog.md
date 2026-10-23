# React preview backlog

Repository-local tracking; external specifications remain read-only for this build.
Scenario range reserved for this branch: SC-400 through SC-419.

| Milestone | State | Evidence |
| --- | --- | --- |
| M1 architecture, schema, scaffold, version menu, served build | Done in this foundation commit; isolated installs verified | dev-spec/react-app.md; test/react-preview*.test.ts |
| M2 typed data/actions, Now and open card | Done, rebased as fbda41f on c8815d3 | reviews/react-ui.md; dev-spec/react-app.md; test/react-app-browser.test.ts |
| M3 Done, Numbers, Settings | Done, rebased as cfd6bf2 | pm-spec/react-app.md; test/react-app-browser.test.ts |
| M4 React New full parity | Implementation and New-side acceptance complete; formal test phase deferred by owner | dev-spec/react-parity.md |
| React Classic and in-app experience toggle | Separate builder owns classic/ and toggle integration | Owner coordinates the two branches |
| React Classic Needs-you visual/interaction milestone | Done in this milestone commit; formal tests deferred | Shared prerequisites 9855e7d; dev-spec/react-app.md browser measurements and action evidence |
| React New visual parity milestone | Done in this visual-pass commit; intentional safety/data-label differences disclosed | design-spec/react-app.md; reviews/react-visual.md; dev-spec/react-app.md |
| react-all integration and shared visit/count correction | Done in this integration-fix commit; merged e93a0f5 once | dev-spec/react-app.md; direct fictional-store New/Classic browser comparison |
