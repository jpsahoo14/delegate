# Working on Delegate

Before any change, read the owner's standing instructions in `HOW-WE-WORK.md` (in the project's spec folder, next to `backlog.md`). In short:

1. It must work correctly; prove it on the real thing.
2. Nothing that worked may break; run `npm test` before every commit.
3. The app stays simple: few tabs and buttons, AI work behind the scenes, one way to do each thing.

For any UI change:
- start from the data you have and want to show;
- rank the scenarios;
- compare two or three designs;
- write the PM and design spec, and get a review in a separate session before building.

Every rule gets a test that fails when the rule is broken. Tests never write outside the temp folder.
