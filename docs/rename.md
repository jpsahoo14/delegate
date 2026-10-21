# Renaming the product

Every message, page label and command hint reads the name from `src/brand.ts`. `test/brand.test.ts` fails if the name is written anywhere else in `src/`.

## What a rename changes

1. `src/brand.ts`: `NAME` (shown to people) and `CMD` (the command they type).
2. `package.json`: `name` and the `bin` key, so the new command exists.
3. `skills/delegate/`: the folder name, `name:` and the heading in `SKILL.md`, and the phrases people say ("set up delegate", "move delegate here", "update delegate"). `SKILL_DIR` in `src/paths.ts` names the folder.
4. The bundle file name `dist/delegate.mjs` (`scripts/build.ts`, `CLI` in `src/paths.ts`).
5. `README.md` and `SETUP-PROMPT.md`.

## What a rename keeps

These are ids stored on people's machines. Changing them orphans existing installs unless a migration moves them first, so they stay as they are:

- The storage folder `<OneDrive>/Delegate` and the local folder `~/.delegate`.
- The tool server key `delegate` in Copilot and Claude configs.
- The background task names (`com.delegate.runner`, `Delegate Runner`) and launcher files `delegate-tick.*`.
- Environment variables `DELEGATE_*` and the page globals `window.DELEGATE*`.
- The session message envelope `[Delegate message <id> …]` in `src/mesh/inbox.mjs`: sessions on other machines match on it, so it changes only with a version bump of the envelope (`V`), and the extension folder `delegate-inbox`.
