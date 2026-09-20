# Design Direction

## Audience & Tone
The author and a few friends who play across several stores. Fast, quiet, confident. The UI recedes and the games provide the color.

## Visual Language
Dark, cinematic, cover-art-first. Dark theme only in v1.

### Color Palette
Defined as CSS variables (design tokens):
- Background `#0B0B10`
- Surface `#14141C`, Surface-2 `#1C1C27`
- Border `#2A2A3A`
- Text `#ECECF3`, Muted `#9A9AB0`
- Accent `#8B5CF6` (electric violet), Accent-hover `#A78BFA`
- Success `#34D399`, Danger `#F87171`

Store badges use each store's own color, small only. The violet accent is deliberately distinct from every store's brand color so the app never looks official or endorsed.

### Typography
Display **Sora**, body **Manrope** (confirmed). Fonts are bundled locally, never loaded from a CDN, because the app must work offline.

### Spacing & Layout
Left sidebar (All / Installed / Favorites / per-store / Settings) plus a poster grid of 2:3 covers. Generous gaps, 8px spacing scale.

### Component Style
8-12px radius, subtle elevation, no hard borders. Covers lift on hover and get an accent focus ring. Skeleton loaders while loading. A small "Offline — showing saved library" pill when offline.

## What This UI Should Feel Like
Like a well-lit game shelf at night: dark and calm, covers front and center, controls out of the way. Nothing blocks the way from opening the app to pressing Play.

## What to Avoid
- Official-looking store branding
- Light theme (v1)
- Glassmorphism or neon overload
- Raw error strings (always friendly, e.g. "Reconnect your Steam account")
- Generic template-dashboard look

## Inspiration
Playnite (fullscreen mode), the Steam Library, Heroic Games Launcher.
