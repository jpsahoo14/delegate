# React preview M1: uncommitted diff review (10-22)

This review was done in a separate session. It covers the uncommitted diff only: `src/web/react/**`, `src/web/react-build.ts`,
`vite.config.ts`, `vitest.config.ts`, the edits to `server.ts`, `state.ts`, `model/ui.ts`, `control/{switch,fields}.ts`,
`view/next/switch.ts`, `scripts/build.ts`, `package*.json`, `INTEGRITY.json`, `dist/web-react`, and the new or changed tests.
I checked it against `dev-spec/react-app.md` and the gate decision in `reviews/react-spec.md`.
I did not access any real data or other worktrees, and I did not edit any code.
The M2 items (actions, receipts, enqueue and parity) are out of scope.

## What I verified directly

- **Typecheck:** `npm run typecheck` passes for all four projects.
- **Component tests:** `vitest run` passes 3/3.
- **Targeted tests:** `test/react-preview*.test.ts`, `test/build.test.ts` and `test/next-browser.test.ts` passed,
  except one stale narrow-menu test. The owner reports that test is fixed since. Its line 350 now uses `selectOption`.
- **INTEGRITY:** it lists every file under `dist/`, and every hash matches. There are no unlisted files under `dist`.
  `dist/web-react/.vite` is not git-ignored.
- **Bundle isolation:** the `react-client-boundary` plugin works under Vite 8 (Rolldown). In a temp fixture, the
  import `src/web/react/main.ts → ../../core/secret.ts` was rejected with
  "React client may only use src/web/react/". `dist/delegate.mjs` contains no `vite` import, and `dist` contains no
  `/Users/` paths.
- **Lazy-asset tokens:** the rewrite catches both the backtick `import(\`./App-*.js\`)` and the
  `__vite__mapDeps(["./App-*.js","./App-*.css"])` preload list. The App chunk's static import
  `./index-*.js?t=` resolves to the same URL as the entry, so one React instance loads.
- **Asset serving:** only files owned by the manifest are served. `.vite/manifest.json` itself is not served.
  Traversal and unknown names return 404, and a stripped token returns 403.
- **Review item (d) is closed:** the Classic/New CSP header is byte-identical to HEAD. The React page gets its own
  `script-src 'self'` policy (no `'unsafe-inline'`) and `Referrer-Policy: no-referrer`.
- **Panel fallback:** `pickUi` maps react to new, and `withUi` builds `next` for react, so the panel draws New with rows.
  The snapshot uses `view()` without `ui`, so it stays Classic.

## Findings

### 1. High: the lockfile now resolves 242 packages from an internal feed (distribution integrity)

At HEAD, `package-lock.json` resolved all 130 entries from `registry.npmjs.org`. Now 242 new entries resolve from
an internal package feed, including `cn`, vite, react and radix.

The repo is published publicly (`scripts/publish.ts`), so this causes two problems:
- It leaks an internal feed host.
- `npm ci` / `npm install` from the lockfile will fail for anyone without that feed's credentials.

The built-in publish deny patterns do not catch it.

**Fix:** regenerate the new entries against the public registry, for example with `npm install --registry=https://registry.npmjs.org/`
after removing them, or rewrite the `resolved` hosts. Then add a test asserting that every `resolved` URL in
`package-lock.json` starts with `https://registry.npmjs.org/`.

### 2. High: if the preview fails to load, the owner is locked out of Delegate

`GET /` serves `reactPage()` whenever `ui === 'react'`. The only way back to Classic or New is the select in `App.tsx`,
and `App.tsx` is a lazy chunk, so the menu only exists if the React app boots. There are three ways it can fail:
- `main.tsx` has `Suspense` but no error boundary. If the `App-*.js` or CSS chunk fails (a 404 after an auto-update
  replaces `dist/web-react`, a network error, or any render throw), React unmounts the tree. The page is blank, with no
  menu and no Reload. No `vite:preloadError` handler exists either.
- If `dist/web-react` or its manifest is missing or corrupt, `reactPage()` throws and `/` returns a plain-text 500.
- `#ui=new` cannot help: the server ignores the hash, and the React page has no hash handling.

There is no chat intent to switch back either. The only recovery is editing `state/ui/<machine>.json` by hand. That
leaves every pending approval unreachable, even though the spec says "Switch to New or Classic to keep using Delegate".

**Fix for M1:**
- Put an error boundary around the lazy App. It should render the version select (or a "Continue in New" button) plus
  Reload, and handle `vite:preloadError`.
- Put a static, server-rendered escape in `index.html` that works without JS. CSP blocks form posts, so this could be a
  link such as `/?t=…&ui=new` that `GET /` saves before drawing.
- Make a `reactPage()` failure fall back to drawing New instead of returning a 500.

**Tests:** a browser test that answers 404 for the App chunk and expects a working switch back, and a server test with
`dist/web-react` missing.

### 3. Medium: Vitest component tests are outside `npm test`

`package.json` adds `test:react` (vitest), but `npm test` still runs only `node --test test/*.test.ts`. Per
HOW-WE-WORK, `npm test` is the pre-commit gate. With this script, the three component tests are skipped, including the
failed-save test that keeps the preview open and shows an error. A regression there would not block a commit.

**Fix:** chain `vitest run` into `npm test`, or add a node test that runs it.

### 4. Medium: no committed test fails when the client boundary is broken

The boundary plugin is correct, as the temp probe above shows. But no test in the repo makes it fail. The owner's rule is
"every rule gets a test that fails when the rule is broken", and the spec says server-only dependencies must not enter
Vite. If someone removed or weakened the plugin, nothing would fail.

**Fix:** add a `build.test.ts` case that builds a fixture `src/web/react` importing `src/core/*` and expects the
build to be rejected. This mirrors the existing "a page that would carry server code stops the build" test.
Optionally also reject `node:` builtins: the plugin only checks `/src/` paths, so `import 'node:fs'` is externalized
with a warning rather than failing.

### 5. Low: unfriendly error text on some switch failures

`services/version.ts` calls `response.json()` before checking the status. A 403 (an expired token, `Open the link…`)
or an HTML error therefore surfaces a raw `SyntaxError` message in the alert. A rejected fetch shows `Failed to fetch`.
The preview still stays put, so this is safe.

**Fix:** check `response.ok` and the content type first, and map every failure to the friendly message.

### 6. Low: settings wording in the panel fallback

`src/web/settings.ts:186` rewrites settings text into New's wording only when `store.ui().ui === 'new'`. With `react`
saved, the panel draws New (via `pickUi`) but shows Classic wording, such as "Check for updates on Home".

**Fix:** use `!== 'classic'`, consistent with `withUi`.

### 7. Low: the CSP header comes from a second read of the choice

`server.ts` picks the page with `s.ui()`, then reads `get().ui()` again for the headers. A `POST /ui` landing between
the two reads can pair Classic/New HTML with the React CSP, which blocks the inline script and breaks that load. The
reverse pairing is harmless.

**Fix:** read `ui` once and use it for both the page and the headers.

### 8. Low: details in the asset handler

- The 500 path returns `String(error)`, which can include the absolute install path. The response is token-gated, so
  exposure is limited.
- The CSS is not rewritten. A future `url()` (for example, a font) would get 403 or 404. The browser test asserts that
  every `/web-react/` response is 200, so it would catch this. The rule is still worth noting in the spec.

### 9. Low: the theme toggle drops "auto"

The React theme toggle shares `delegate-theme` with the old page but only ever writes `light`/`dark`. After one toggle in
the preview, the Classic/New page loses `auto` (following the system) until it is reset there. This also happens in the
browser test's own temp profile only, so the test is unaffected.

## Gate items from the disposition

- **Closed:** (d) the CSP split; the cold lazy JS plus preload CSS token test; the React CSP header test; panel fallback
  with `react` saved; the menu-only golden diffs (per the owner's evidence: 176 files, only menu nodes changed).
- **Note:** there is no explicit snapshot-with-`react` test. `writeSnapshot` does not read `ui`, so the risk is low. A
  one-line assertion would make the gate literal.
- **No new scope:** nothing here asks for M2 actions or parity.

The blockers before commit are findings 1 and 2. Findings 3 and 4 are cheap and match the owner's standing rules.

## Disposition (10-22, same session)

The fixes listed below are as reported by the owner. I did not rerun tests or re-read the code. The only thing I
checked myself is that every `resolved` URL in `package-lock.json` is now on `registry.npmjs.org` (372 entries), and
that this review names no internal host.

| Finding | Status |
| --- | --- |
| 1 Lockfile feed | **Fixed, with one caveat.** Every `resolved` URL in the lock is on `registry.npmjs.org`, and a test guards this. The versions are real public releases: the projects' official GitHub releases confirm React 19.3.1, Tailwind 4.3.3 and Zustand 5.0.15. A separate session reports clean `npm ci --omit=dev` (102 packages) and `npm ci` (302 packages) with empty temporary caches, using the owner's default registry and an unchanged manifest and lock. It also reports that the build, types and component tests passed. `npm ci` checks every tarball against the lock's sha512 `integrity`, so the installed content is exactly what the lock pins. Caveat: no install has fetched directly from the public registry over the open internet, because that connection was unavailable. The release notes must say so; it is not claimed as verified. |
| 2 Recovery | Fixed. The missing-build fallback, the static no-JS escape and lazy-chunk recovery each have a test. |
| 3 Vitest outside `npm test` | Fixed. `npm test` now includes Vitest. |
| 4 Boundary test | Fixed. A client-boundary regression test was added. |
| 5 Version error text | Fixed. Errors now show the friendly message. |
| 6 Panel settings wording | Fixed. |
| 7 CSP double read | Resolved with one CSP decision per request. |
| 8, 9 Low details | No further action was requested in this review. |
| Snapshot gate | Fixed. A snapshot-with-`react` test was added. |

The owner reports 12 mutation operators killed, including recovery, snapshot and boundary.

**Gate (updated 10-22):** the code findings and the dependency finding are closed, so the commit gate is closed.
The public content is verified: the lock pins public URLs and sha512 hashes, the versions are confirmed by their
official releases, and clean installs with the owner's workflow match those hashes. One caveat remains: no install
has been made directly from the public registry over the open internet. Disclose it at publish, and rerun `npm ci`
from the public registry when that connection works. The installs, build and tests are as reported by the dependency
session. I checked only the lock's hosts and that this file names no internal host.
