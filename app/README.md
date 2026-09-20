# UnifiedGameLauncher

Windows desktop app: one cover-art library for your Steam and Epic games.
Product background lives in `../docs/spec.md`.

## Commands

Run from this folder (Node 22 LTS, see `.nvmrc`):

- `npm run dev` starts the app with hot reload
- `npm test` runs the unit tests (Vitest)
- `npm run lint` / `npm run format`
- `npm run build` type-checks and builds
- `npm run dist` builds the Windows installer (must run on Windows, or in CI)

The icons in `build/` and `resources/` are the electron-vite placeholders and
must be replaced before the first release.
