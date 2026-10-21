# Review: React M1 against the dev plan

Separate-session, bounded check of the M1 working tree against `dev-spec/react-app.md` and the gate in
`reviews/react-spec.md` (Disposition). This is not a fresh design or security review. Only this worktree was
read. No real data was read. No code was edited.

How I checked:

- Ran `npm run typecheck` and `vitest run` (3 tests); both pass.
- Ran the targeted node tests: react-preview, react-preview-browser, build, golden and next-browser.
- Regenerated the goldens in a temporary copy, normalized the `uisw` switch/menu node, and compared them with
  HEAD's goldens. Every difference was the menu; there were no other byte differences.
- Rebuilt in a temporary copy. `dist/**` and `INTEGRITY.json` matched the worktree byte for byte.
- Grepped `dist/delegate.mjs` for runtime `vite`/`react` imports. There are none.

The golden and narrow-switch failures I hit were then fixed by the author: 176 goldens were regenerated with
menu-only changes, and the narrow test now uses `selectOption`.

**Verdict:** M1 matches the plan. Before the M1 commit:

- add the snapshot fallback test (P1-1);
- fix the page lock-out when the React build cannot load (P1-2).

M2 stays hard gated, unchanged.

## Conforms

| Plan item | Evidence |
| --- | --- |
| Foundation only | `App.tsx` is a disclosure screen with the version menu, the theme toggle and Continue in New. There is no item UI, action endpoint or command string. GET `/` in React mode does not call `visitSince`, so opening the preview marks nothing seen. |
| Build integration | `scripts/build.ts` imports Vite only at build time. INTEGRITY hashes `dist/web-react/**`. `build.test.ts` checks the shipped files against a fresh `vite build` (`write:false`) and builds the fixture. |
| Runtime without dev dependencies | `react-build.ts` uses only `node:fs`/`node:path`. The bundled runtime has no Vite/React import. React, Zustand and Query are bundled into the dist assets. |
| Token on assets | Token and host checks run before the `/web-react/` route. Only manifest-owned `.js`/`.css` files are served (others get 404). There are no arbitrary path reads. The browser test opens on a cold cache, loads the lazy chunk plus the preload CSS, checks that every asset carries `?t`, and gets 403 for each asset with the token stripped. |
| CSP | The old pages keep the original header unchanged, which closes item (d). The React page has its own policy with no inline script, plus `Referrer-Policy: no-referrer` and a `no-referrer` meta. |
| Old pages preserved | The goldens differ only in the menu (verified independently, above). `pickUi` maps `react` to `new`. `#ui=react` is deliberately unsupported (`hashUi`). The old page never caches `react`. |
| Panel fallback | `next-browser` panel test with `ui: react` saved draws New, offers no switch and writes nothing. `withUi` builds `next` for react, which the panel needs. |
| Switching is safe | Both pages: a failed save stays put and says so. Unsent text asks first. `store.answers()` stays empty. Another machine's choice is unchanged. |

## Findings

**P1-1. The snapshot fallback test with `ui: react` saved is missing. It is a named M1 gate.**
`writeSnapshot` renders `view()` without `withUi`, so the snapshot is Classic by construction. No test pins this.

- *Required:* add a test that saves `react`, writes the snapshot and asserts the Classic shell with no React
  assets or switch. It should fail if `withUi`/react is ever passed through.

**P1-2. A missing or broken React build locks the owner out of the page.**

- If `dist/web-react/index.html` or the manifest is missing or unreadable, `reactPage` throws and GET `/`
  returns 500 "The page could not be drawn". The panel has no switch, so there is no in-page way back.
- If the lazy `App` chunk fails (for example, an update replaced `dist/web-react` while a tab was open),
  `main.tsx` has no error boundary. Suspense leaves "Loading preview..." or a blank root, again with no switch.

*Required:*

- When the React build cannot be read, serve New (the old shell) and log the reason.
- Add a root error boundary that offers Reload and the version menu, which the plan already requires for
  missing chunks.
- Test both: delete the build in a temporary root, and abort the lazy chunk.

**P2-1.** GET `/` reads `get().ui()` twice: once to pick the page and once to pick the headers. If the choice
flips between the two reads (another tab or machine), the React page can get the old CSP, or the old page the
React CSP. Either is a blank page. Read the choice once.

**P2-2.** `test:react` (Vitest) is not part of `npm test`, so the "npm test before every commit" rule does not
cover the React unit tests. Chain them in, or document the second command in the release check.

**P2-3.** The omit-dev runtime is proven by inspection only. Add a cheap test: the runtime import graph of
`src/web/server.ts`/`dist/delegate.mjs` contains no `devDependencies` package.

**P2-4.** The asset route serves only `.js`/`.css` files, and token rewriting covers only JS string literals.

- Any future manifest asset would 404 (a font, an image, or a CSS `url()`).
- Make the build fail when the manifest lists any other type, so M2 cannot add one silently.

**P2-5.** Unlike `next-browser`, `react-preview-browser.test.ts` has no `{ skip }` guard for a missing
Playwright or Chrome. In my first run it failed once and then passed on rerun. I did not capture the cause. Add
the skip guard, and watch for flakiness in the switch, reload and wait sequence.

**P2-6.** On a machine set to `react`, the `#ui=new`/`#ui=classic` invite links are ignored: the server
serves the React page, and the hash never reaches the old page. This is acceptable for an opt-in preview, but
say so in the dev spec next to `#ui=react`.

**Note.** The old page's narrow "New" dot and `role=switch` were removed with the menu. That is within "menu
only", but the dot's `tried` behaviour is now unused for every version.

## M2 gate (unchanged)

All of these remain required:

- the structured enqueue, with the adversarial `, ok A9` tests;
- the submission-receipt tests (lost response, reload, double submit);
- the real-server manual Undo test;
- the pinned U01-U61 parity inventory.

Nothing in M1 weakens them.

## Disposition (re-check of the P1 fixes, 10-22)

This is a scoped re-check of P1-1 and P1-2 only. I read the `server.ts` GET `/` diff, `react-build.ts`,
`index.html`, `main.tsx`, `Recovery.tsx` and the new tests. I ran the three test files below; all 7 tests pass:

- `react-recovery-browser`;
- `react-installed`;
- `react-preview`.

I did not run the full suite again.

| Finding | Status | Evidence |
| --- | --- | --- |
| P1-1 snapshot fallback test | Resolved | `writeSnapshot` runs with `react` saved. The test asserts no `react-root`, the Classic shell (`#home` tab, no `data-ui`), no version menu, and that the saved choice is still `react`. It would fail if the snapshot followed the React choice. |
| P1-2 lock-out: build unreadable | Resolved | `reactPage` checks the manifest and `index.html` first. On failure, GET `/` serves New with a static alert under the old page's CSP, and logs the error. Tested on an installed copy without `node_modules` by renaming `dist/web-react`. |
| P1-2 lock-out: entry or lazy chunk fails | Resolved | `index.html` contains a static, token-carrying "continue in New" link inside `#react-root`, so it stays if the entry script never runs (tested with JavaScript off). `PreviewBoundary` catches a failed lazy `App` and offers Continue in New and Reload (tested by aborting the chunk). Both exits save `new`, and nothing is queued. |
| P2-1 one CSP decision | Resolved | One `react` flag picks both the page and the headers; the fallback clears it. |

New notes, P2 (none blocks M1):

- GET `/?ui=new|classic` saves the choice and redirects (303). It needs the token and localhost, so it is
  safe. It is a recovery-only second way to switch next to the menu: say so in the dev spec, and keep it
  limited to new/classic.
- The boundary offers Continue in New and Reload, not the full version menu that the plan's wording describes.
  Classic is one step away from New, which is acceptable for M1. Align the spec wording.
- Registry: the run included a test that rejects non-public registry URLs in the lockfile ("the public lockfile
  has no non-public registry URLs"), and it passed. You said the work to resolve the public versions is still
  in progress, so I make no claim that the tree is clean.

**M1 gate:** P1-1 and P1-2 are closed. M1 may be committed once the public-version work and the clean-tree
check (`publish:check`) are done. M2 stays gated, unchanged.
