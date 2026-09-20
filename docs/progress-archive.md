# Progress Archive

> History only. Not loaded automatically. Newest at bottom.

## 2026-09-20
**Built:** docs only, no code: docs/spec.md, docs/features/auth-roles.md, docs/design/direction.md, docs/brand.md (new), CLAUDE.md, this file.
**Decisions:** v1 = Steam + Epic only (GOG/Ubisoft/Battle.net/EA in v2). Auto-updates IN v1 (electron-updater, Milestone 7; works unsigned). Windows only. Unsigned installer for v1; signing (SignPath free OSS program or Azure Trusted Signing) revisited before the M7 release. Epic built in two stages: installed detection + launch first, owned library separate and allowed to fail. electron-vite + npm + Vitest + ESLint + Prettier + Tailwind. Dark only, violet accent `#8B5CF6`, Sora + Manrope (bundled locally), cover grid + left sidebar. Working title UnifiedGameLauncher kept in one `APP_NAME` constant. Framework lives in `app/` with `src/shared`, `src/main/{ipc,security,storage,library,stores/{steam,epic}}`, `src/preload`, `src/renderer/src`.
**Next:** Milestone 0 scaffold.
**Blocked by:** nothing.
