// Guards against the 2026-09-20 bug recurring (see docs/lessons.md): the
// sandboxed preload (webPreferences.sandbox: true, required by
// docs/features/auth-roles.md) can only require() a small Electron
// built-in allowlist. electron-vite leaves npm dependencies as external
// requires rather than bundling them, so a dependency reaching preload
// through any import chain — even transitively — builds without error but
// crashes at runtime, silently, leaving window.api undefined and the
// window blank. This scans the built preload output for exactly that.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const preloadDir = join(import.meta.dirname, '..', 'out', 'preload')
const allowed = new Set(['electron'])

function isAllowed(specifier) {
  if (allowed.has(specifier)) return true
  if (specifier.startsWith('node:')) return true
  if (specifier.startsWith('.') || specifier.startsWith('/')) return true
  return false
}

// Matches both CommonJS require("x") and ESM import ... from "x" / import("x"),
// since the preload build output format is an electron-vite implementation
// detail we shouldn't assume stays CJS forever.
const IMPORT_PATTERN =
  /require\(\s*["']([^"']+)["']\s*\)|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|;)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm

const offenders = []
for (const file of readdirSync(preloadDir)) {
  if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue
  const text = readFileSync(join(preloadDir, file), 'utf-8')
  for (const match of text.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3]
    if (specifier !== undefined && !isAllowed(specifier)) {
      offenders.push(`${file}: ${match[0].trim()}`)
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "The preload bundle requires an npm package. Electron's sandboxed preload can only load a\n" +
      'built-in allowlist (see docs/lessons.md, 2026-09-20) — this crashes at runtime and blanks\n' +
      'the window. Keep everything preload/index.ts imports (even transitively) dependency-free.\n'
  )
  for (const line of offenders) console.error(`  ${line}`)
  process.exit(1)
}

console.log('preload bundle: no external npm requires found.')
