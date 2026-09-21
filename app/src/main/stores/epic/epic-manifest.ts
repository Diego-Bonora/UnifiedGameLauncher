import { win32 } from 'node:path'

export interface EpicManifest {
  appName: string
  title: string
  installLocation: string
  catalogNamespace?: string
  catalogItemId?: string
}

// "skipped" is a normal answer (DLC, a non-game, a half-finished install);
// "invalid" means the file is broken or unsafe. Kept apart so only real
// problems get logged.
export type EpicManifestResult =
  { kind: 'game'; manifest: EpicManifest } | { kind: 'skipped' } | { kind: 'invalid' }

// AppName ends up inside a com.epicgames.launcher:// URL, so only accept the
// characters Epic's own ids use. Anything else is treated as a corrupt file
// rather than escaped and trusted.
const ID_PATTERN = /^[A-Za-z0-9_-]+$/

const MAX_TITLE_LENGTH = 200

// The manifest folder is writable by local software, so its text is not
// trusted. Control, invisible-formatting (zero-width, bidi overrides) and
// line-separator characters are removed so a title can't render blank or
// spoofed, and the length is capped by code point so an emoji is never cut
// in half.
function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const stripped = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
  const cleaned = Array.from(stripped).slice(0, MAX_TITLE_LENGTH).join('').trim()
  return cleaned.length > 0 ? cleaned : null
}

// Epic writes forward slashes ("C:/Program Files/..."). Requires an explicit
// drive letter: relative paths, rooted-but-driveless paths and UNC shares
// (\\host\share, which can make Windows contact a remote machine if
// anything later touches the path) are rejected.
const DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
function cleanInstallLocation(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  if (value.startsWith('\\\\') || value.startsWith('//')) return null
  if (!DRIVE_PATH_PATTERN.test(value)) return null
  const normalized = win32.normalize(value)
  // Steam's paths (built with join) have no trailing separator; match that so
  // paths from different stores compare equal. A bare "C:\\" keeps its one.
  return normalized.length > 3 && normalized.endsWith('\\') ? normalized.slice(0, -1) : normalized
}

function optionalId(value: unknown): string | undefined {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : undefined
}

// Parses one Data/Manifests/*.item file (plain JSON). Never throws — one bad
// file must not take down detection for every other installed game.
export function parseEpicManifest(text: string): EpicManifestResult {
  let raw: unknown
  try {
    // JSON.parse rejects a leading byte-order mark, which some tools add.
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return { kind: 'invalid' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'invalid' }
  const manifest = raw as Record<string, unknown>

  // Skip checks come first, on the raw fields: DLC, engines, plugins and
  // half-finished installs are normal and must not be reported as broken
  // just because their ids or paths look different (e.g. "UE_5.3").

  // A half-finished install or update isn't playable yet.
  if (manifest['bIsIncompleteInstall'] === true) return { kind: 'skipped' }

  // DLC and add-ons get their own manifest whose AppName differs from the
  // base game's; listing them would show phantom "games".
  // Only when AppName itself is present: a manifest with no AppName is
  // broken, not DLC.
  const rawAppName = manifest['AppName']
  const mainGameAppName = manifest['MainGameAppName']
  if (
    typeof rawAppName === 'string' &&
    rawAppName !== '' &&
    typeof mainGameAppName === 'string' &&
    mainGameAppName !== '' &&
    mainGameAppName !== rawAppName
  ) {
    return { kind: 'skipped' }
  }

  // Real games list "games" here; Unreal Engine, Twinmotion, Quixel and
  // plugins do not. Manifests without the field are given the benefit of the
  // doubt.
  const categories = manifest['AppCategories']
  if (Array.isArray(categories) && !categories.includes('games')) return { kind: 'skipped' }

  // Only what would be listed gets validated.
  const appName = rawAppName
  const title = cleanTitle(manifest['DisplayName'])
  const installLocation = cleanInstallLocation(manifest['InstallLocation'])
  if (typeof appName !== 'string' || !ID_PATTERN.test(appName)) return { kind: 'invalid' }
  if (title === null || installLocation === null) return { kind: 'invalid' }

  return {
    kind: 'game',
    manifest: {
      appName,
      title,
      installLocation,
      catalogNamespace: optionalId(manifest['CatalogNamespace']),
      catalogItemId: optionalId(manifest['CatalogItemId'])
    }
  }
}
