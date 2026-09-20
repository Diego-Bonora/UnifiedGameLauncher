# Brand

## Name
Working title: **UnifiedGameLauncher** (the repo name). A public name will be decided before the v1 release.
- The name lives in ONE constant (`APP_NAME`) plus the electron-vite/electron-builder `productName`. Nothing else hardcodes it.
- The AppData folder (`%APPDATA%\<APP_NAME>`) derives from it. Renaming later needs a data-migration note.
- The name must not contain store names or trademarks (Steam, Epic, GOG, Ubisoft, Battle.net, EA).

## Tagline
TBD.

## Voice
Plain and friendly. No jargon in user-facing messages. Errors always tell the user what to do next.

## Colors & Typography
See @docs/design/direction.md.

## Logo
TBD. It must not resemble any store's logo.

## Trademarks & Affiliation
- Store logos appear only as small "source" badges on games.
- The app must never look official or endorsed. The privacy policy and About screen state that it is not affiliated with Valve, Epic Games, GOG, Ubisoft, Blizzard, or Electronic Arts.
- Privacy policy draft: section 12 of @docs/sources/PROJECT_PLAN.md.
