import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Plugin } from 'vite'

// The licenses list (scripts/licenses.mjs) must name every npm package that
// ships. Packages in app.asar are found from package.json, but Vite also
// copies code from devDependencies (React, react-dom, scheduler, Tailwind's
// CSS) straight into the bundles, and nothing else records which ones. This
// plugin writes, per build, the packages whose code ended up in the output,
// to out/bundled-packages/<target>.json.
export const BUNDLED_TARGETS = ['main', 'preload', 'renderer'] as const
export type BundledTarget = (typeof BUNDLED_TARGETS)[number]

// The package folder a module id points into, or null for the app's own
// code. Ids can carry a "\0" prefix (Rollup's virtual modules, such as the
// CommonJS wrappers) and a "?query" suffix; the last node_modules segment is
// the package that owns the file, also for packages nested inside others.
export function packageDirFromModuleId(id: string): string | null {
  const path = id.replace(/^\0/, '').split('?')[0]!.replaceAll('\\', '/')
  const marker = '/node_modules/'
  const at = path.lastIndexOf(marker)
  if (at === -1) return null
  const rest = path.slice(at + marker.length).split('/')
  const nameParts = rest[0]?.startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
  if (nameParts.length === 0 || nameParts.some((part) => part === '')) return null
  return path.slice(0, at + marker.length) + nameParts.join('/')
}

// Rollup's virtual modules with no file behind them. Vite's own runtime
// helpers (the module-preload polyfill, the CommonJS interop helpers) are
// Vite's code; any other kind is unknown and stops the build, so a plugin
// that starts injecting someone else's code can't go unlisted.
export function virtualModuleOwner(id: string): 'vite' | 'unknown' | null {
  if (!id.startsWith('\0') || packageDirFromModuleId(id) !== null) return null
  // A bundled CommonJS file's require() of something left external (a Node
  // built-in, electron, a dependency): the code is that package's, which the
  // dependency walk already lists if it ships.
  if (id.endsWith('?commonjs-external')) return null
  const name = id.slice(1).split('?')[0]!
  if (name.startsWith('vite/') || name === 'commonjsHelpers.js') return 'vite'
  return 'unknown'
}

// The npm packages a CSS file pulls in with `@import 'name'` (Tailwind, the
// fonts). Tailwind's Vite plugin inlines those itself, so they never show up
// as module ids. Relative and URL imports are the app's own or not npm.
export function cssPackageImports(css: string): string[] {
  const names = new Set<string>()
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    const specifier = match[1]!
    if (/^(\.|\/|[a-z]+:)/i.test(specifier)) continue
    const parts = specifier.split('/')
    names.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!)
  }
  return [...names]
}

// Node's lookup: the nearest node_modules/<name> from `fromDir` upwards.
function findPackageDir(fromDir: string, name: string): string | null {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function bundledPackagesPlugin(target: BundledTarget): Plugin {
  let root = process.cwd()
  let recordFile = ''
  // Packages found while transforming, before the bundle exists.
  const fromCss = new Set<string>()
  return {
    name: 'bundled-packages',
    apply: 'build',
    configResolved(config) {
      root = config.root
      // Next to this build's own output folder (out/main, out/renderer…),
      // so the record lands in the same out/ folder however Vite was started.
      recordFile = join(
        resolve(config.root, config.build.outDir),
        '..',
        'bundled-packages',
        `${target}.json`
      )
    },
    transform(_code, id) {
      const path = id.split('?')[0]!
      if (!path.endsWith('.css') || packageDirFromModuleId(path) !== null) return null
      // Read from disk: by now other plugins may have rewritten the imports.
      if (!existsSync(path)) return null
      for (const name of cssPackageImports(readFileSync(path, 'utf-8'))) {
        const dir = findPackageDir(dirname(path), name)
        if (dir === null) this.error(`${path} imports ${name}, which isn't installed`)
        fromCss.add(dir)
      }
      return null
    },
    generateBundle(_options, bundle) {
      const dirs = new Set<string>(fromCss)
      const addId = (id: string): void => {
        const owner = virtualModuleOwner(id)
        if (owner === 'unknown') {
          this.error(`Unknown virtual module ${JSON.stringify(id)}: name its package here`)
        }
        const dir = owner === 'vite' ? findPackageDir(root, 'vite') : packageDirFromModuleId(id)
        if (dir !== null) dirs.add(dir)
      }
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          for (const id of Object.keys(output.modules)) addId(id)
        } else {
          // Fonts and other files a package's CSS points to. These names are
          // relative to the project root.
          for (const file of output.originalFileNames) {
            addId(isAbsolute(file) ? file : resolve(root, file))
          }
        }
      }
      const packages = [...dirs]
        .map((dir) => {
          const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
            name: string
            version: string
          }
          return { name: manifest.name, version: manifest.version, dir }
        })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      mkdirSync(dirname(recordFile), { recursive: true })
      writeFileSync(recordFile, JSON.stringify(packages, null, 2) + '\n')
    }
  }
}
