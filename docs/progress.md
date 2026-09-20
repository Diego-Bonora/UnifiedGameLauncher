# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 0 (setup) is done and verified end-to-end on Windows (installer built, installed, uninstalled cleanly). Milestone 1 (Steam installed games: detect + launch via `steam://`, no login) is fully built and locally verified on the Mac — `npm run typecheck`, `npm run lint`, `npm test` (20 tests) and `npm run build` all clean, `npm run dev` renders correctly — and passed two rounds of `/review` with all findings fixed. Not yet verified on Windows with a real Steam install, and not yet committed.

## In Progress
Nothing active. Milestone 1 code is done; waiting on Windows verification before committing.

## Next Up
Verify Milestone 1 on the Windows PC (real Steam install, at least one game: detection, `.acf` parsing, the `steam://` launch handoff), then commit and move to Milestone 2 (Steam sign-in + owned library via the Steam Web API).

---

## 2026-09-20 (Milestone 1: Steam installed games)
**Built:** `src/main/stores/store-provider.ts` (shared `StoreProvider` interface). `src/main/stores/steam/`: `vdf.ts` (Valve KeyValues parser), `app-manifest.ts`, `library-folders.ts`, `steam-registry.ts` (`reg query`-based `SteamPath` lookup), `steam-provider.ts` (composes the above with an injectable filesystem), `index.ts` — each with a `*.test.ts` beside it (20 tests total). `src/shared/ipc/steam-channels.ts` (zero-dependency channel names/types) and `steam.ts` (main-only zod schemas). `src/main/ipc/steam.ts` (the `getInstalledGames`/`launch` handlers). Preload/renderer wiring (`src/preload/index.ts`, `src/shared/api.ts`, `src/renderer/src/App.tsx` — a list UI with loading/empty/error states). New `app/scripts/check-preload-deps.mjs`, wired into `npm run build`, scans the built preload bundle for any npm `require`/`import` reaching it.
**Decisions:** Registry access shells out to `reg query` via `child_process.execFile` (static args, no shell interpolation) instead of a native registry package — avoids node-gyp/electron-builder complications; returns `null` off Windows so Mac dev degrades to an empty library, not an error. One VDF parser reused for both `.vdf`/`.acf` files instead of per-format regex scraping. `getLaunchUrl` returns a URL string instead of launching directly, keeping the `steam://` allow-list check centralized in the IPC handler. Provider filesystem calls are injectable so parsing/composition is unit-testable without Windows or a real disk.
**Fixed:** A real bug the user caught live — the sandboxed preload (`sandbox: true`) can only `require()` a small Electron built-in allowlist, not npm packages; a `zod` import reached it transitively through a shared IPC file, crashed the preload silently, and blanked the whole window. Fixed by splitting channel names/types (zero deps, preload-safe) from zod schemas (main-only) — see docs/lessons.md. Then ran `/review` twice: round 1 found and fixed a mislabeled `installDir`→`installPath` IPC field, a silently-swallowed Play-button failure (now a friendly message; main throws instead of no-op'ing), a decorative zod schema never actually enforced (now runs via `safeParse`, dropping bad entries), and no guard against the preload bug recurring (`check-preload-deps.mjs`, verified live by re-triggering and reverting the bug). Round 2 confirmed those and fixed two smaller gaps: the guard only matched CommonJS `require()` (now ESM `import` too), and the `scripts/**` ESLint exclusion was a blanket ignore (now scoped to just the TS-only rules that don't apply to plain JS).
**Next:** Verify on the Windows PC, then commit.
**Blocked by:** nothing.

## 2026-09-20 (Milestone 0: installer verified on Windows)
**Built:** nothing new. Ran "Build installer" from the Actions tab (green, 2m13s; the asar check found no root `/src`). Installed the artifact on a Windows PC and checked it by hand.
**Verified:** app opens with the right fonts and looks the same as `npm run dev` on the Mac; `%APPDATA%\UnifiedGameLauncher` (no "(dev)") is created; a second launch focuses the first window; uninstall removes the app and shortcut. Uninstall leaves `%APPDATA%\UnifiedGameLauncher` in place. That is electron-builder's default (`nsis.deleteAppDataOnUninstall: false`), it matches the privacy policy draft, and it is kept for v1.
**Decisions:** Artifact downloads from GitHub returned 404 in the browser on the PC until signed in to the right account; sign in first, or use `gh run download`. GitHub warns that `checkout@v4`, `setup-node@v4` and `upload-artifact@v4` use deprecated Node 20; not failing, bump later.
**Next:** Milestone 1.
**Blocked by:** nothing. Open items: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; bump the Node 20 actions.

## 2026-09-20 (Milestone 0: installer workflow)
**Built:** `.github/workflows/build-installer.yml` (runs on manual dispatch or `v*` tags, `windows-latest`, in `app/`): `npm ci`, lint, tests, `npm run dist`, an asar check that fails if a root `/src` was packaged, then uploads `dist/*-setup.exe` as a workflow artifact. Added `.gitattributes` (`* text=auto eol=lf`).
**Decisions:** Build-only, no GitHub Release is published until Milestone 7 (publishing is outward-facing). `permissions: contents: read`. LF everywhere because Windows runners check out CRLF by default and Prettier expects LF. Checked locally: `icon.ico` has a 256px image (electron-builder's minimum), lint and `prettier --check` are clean.
**Next:** push, run the workflow, read the result. The NSIS build and asar check could not be tested on macOS.
**Blocked by:** nothing. Open items: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; the asar `src/**` check is now automated but unproven until the first CI run.
