// Builds the "Open-source components" list (docs/features/release.md,
// section 3) and copies every shipped package's license text into
// out/licenses, which the installer carries next to the app.
//
// What ships comes from three places, and each is read from the source of
// truth rather than a hand-kept list, so a new dependency can't slip in:
// - the production dependency tree, which electron-builder packs into
//   app.asar (peer dependencies such as electron are not packed);
// - packages Vite bundled into main, preload or the renderer, recorded by
//   scripts/bundled-packages-plugin.ts during `electron-vite build`;
// - Electron itself.
//
// The list the About dialog shows is a committed file, so the renderer can
// import it in development too. `npm run build` fails when it no longer
// matches what ships; `npm run licenses` writes it again.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Permissive licenses only. Anything else fails the build until someone has
// read it and added it here on purpose.
export const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'OFL-1.1',
  'Python-2.0'
])

// Packages whose license can't be read from the package itself (no license
// file, or a legacy `licenses` array), each checked by hand. The text is kept
// in the repo under scripts/license-texts/, and the entry is for one exact
// version, so an update has to be looked at again.
// Shape: 'name@version': { license: 'SPDX id', file: 'scripts/license-texts/…' }
export const LICENSE_EXCEPTIONS = {
  // electron-updater's dependency. MIT in package.json; no license file in the
  // package or its repository.
  'lazy-val@1.0.5': { license: 'MIT', file: 'scripts/license-texts/lazy-val-1.0.5-MIT.txt' }
}

// A package.json `license` is an SPDX expression. With OR one allowed choice
// is enough; with AND every part must be allowed. WITH (license exceptions)
// and anything unreadable (such as "MIT OR") are refused, to be looked at by
// hand.
export function isAllowedLicense(expression) {
  if (typeof expression !== 'string') return false
  const tokens = expression.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)
  if (tokens.includes('WITH')) return false
  const wellFormed = tokens.every((token, index) =>
    index % 2 === 1 ? token === 'OR' || token === 'AND' : token !== 'OR' && token !== 'AND'
  )
  if (!wellFormed || tokens.length % 2 === 0) return false
  const ids = tokens.filter((token) => token !== 'OR' && token !== 'AND')
  const allowed = ids.map((id) => ALLOWED_LICENSES.has(id))
  return tokens.includes('AND') ? allowed.every(Boolean) : allowed.some(Boolean)
}

// Plain code-unit order, not localeCompare: the list is written on one
// machine and checked on another (the Windows CI), and locales can disagree.
function byText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

// The package's own license files. Names vary (LICENSE, license.md,
// COPYING, LICENSE-MIT plus LICENSE-APACHE for dual licenses); all of them
// are kept. "licenseCheck.json" and the like are not one.
export function licenseFilesIn(dir) {
  return readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying)([-.][\w.-]*)?$/i.test(name) && !/\.json$/i.test(name))
    .sort(byText)
    .map((name) => join(dir, name))
}

// Node's own lookup: the nearest node_modules/<name> from `fromDir` upwards,
// but never above the app's folder. A copy higher up (the repo root, the
// home folder) is not one electron-builder would pack.
function resolvePackageDir(fromDir, name, stopDir) {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (dir === stopDir || parent === dir) return null
    dir = parent
  }
}

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
}

// Every package folder reachable through `dependencies` and installed
// `optionalDependencies`, the same set electron-builder packs.
export function productionPackageDirs(appDir) {
  const found = new Set()
  const visit = (fromDir, manifest) => {
    const required = Object.keys(manifest.dependencies ?? {})
    const optional = Object.keys(manifest.optionalDependencies ?? {})
    for (const name of [...required, ...optional]) {
      const dir = resolvePackageDir(fromDir, name, appDir)
      if (dir === null) {
        if (optional.includes(name)) continue
        throw new Error(`${name} (needed by ${manifest.name}) isn't installed. Run npm install.`)
      }
      if (found.has(dir)) continue
      found.add(dir)
      visit(dir, readManifest(dir))
    }
  }
  visit(appDir, readManifest(appDir))
  return [...found]
}

// One record per build (scripts/bundled-packages-plugin.ts). All three are
// required: `npm run dev` writes only main's and preload's, and a list made
// from those would quietly leave out React and the fonts.
export function bundledPackageDirs(recordDir) {
  return ['main', 'preload', 'renderer'].flatMap((target) => {
    const file = join(recordDir, `${target}.json`)
    if (!existsSync(file)) throw new Error(`${file} is missing: run electron-vite build first.`)
    return JSON.parse(readFileSync(file, 'utf-8')).map((entry) => entry.dir)
  })
}

// Package names contain "/" for scoped packages; file names can't.
function licenseFileName(name, version) {
  return `${name.replace('/', '+')}@${version}.txt`
}

// Reads every package, checks its license, and returns the list for the
// About dialog plus the problems found (all of them, not just the first).
// An exception's `file` is relative to `baseDir` (the app folder).
export function collectComponents(dirs, exceptions = LICENSE_EXCEPTIONS, baseDir = '.') {
  const byKey = new Map()
  const problems = []
  for (const dir of dirs) {
    const manifest = readManifest(dir)
    const key = `${manifest.name}@${manifest.version}`
    if (byKey.has(key)) continue
    const exception = Object.hasOwn(exceptions, key) ? exceptions[key] : undefined
    const license = exception?.license ?? manifest.license
    const files = exception !== undefined ? [join(baseDir, exception.file)] : licenseFilesIn(dir)
    if (!isAllowedLicense(license)) {
      problems.push(`${key}: license ${JSON.stringify(license)} is not on the allow-list`)
    }
    if (files.length === 0) problems.push(`${key}: no license file in ${dir}`)
    else if (!files.every((file) => existsSync(file))) {
      problems.push(`${key}: license text ${files.join(', ')} is missing`)
    }
    byKey.set(key, { name: manifest.name, version: manifest.version, license, files })
  }
  const components = [...byKey.values()].sort(
    (a, b) => byText(a.name, b.name) || byText(a.version, b.version)
  )
  return { components, problems }
}

function main() {
  const appDir = join(import.meta.dirname, '..')
  const repoLicense = join(appDir, '..', 'LICENSE')
  const listFile = join(appDir, 'src', 'renderer', 'src', 'generated', 'licenses.json')
  const outDir = join(appDir, 'out', 'licenses')
  const write = process.argv.includes('--write')

  const dirs = [
    ...productionPackageDirs(appDir),
    ...bundledPackageDirs(join(appDir, 'out', 'bundled-packages')),
    join(appDir, 'node_modules', 'electron')
  ]
  const { components, problems } = collectComponents(dirs, LICENSE_EXCEPTIONS, appDir)
  if (problems.length > 0) {
    console.error('Some packages that ship with the app have a license problem:')
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(
      'Read the license, then add it to ALLOWED_LICENSES (or LICENSE_EXCEPTIONS) in scripts/licenses.mjs.'
    )
    process.exit(1)
  }

  const list = {
    appLicense: readFileSync(repoLicense, 'utf-8'),
    components: components.map(({ name, version, license }) => ({ name, version, license }))
  }
  const text = JSON.stringify(list, null, 2) + '\n'
  if (write) {
    mkdirSync(dirname(listFile), { recursive: true })
    writeFileSync(listFile, text)
    console.log(`licenses: wrote ${components.length} components to ${listFile}`)
  } else {
    // Compared as data, so a formatter touching the file isn't a failure.
    const current = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf-8')) : null
    if (JSON.stringify(current) !== JSON.stringify(list)) {
      console.error(
        'The open-source components list is out of date (a dependency or LICENSE changed).\n' +
          'Run `npm run licenses`, check the diff, and commit it.'
      )
      process.exit(1)
    }
  }

  // Wiped first, so a package that no longer ships doesn't leave its file.
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  // The app's own license; the packages' files are named after each package.
  copyFileSync(repoLicense, join(outDir, 'LICENSE.txt'))
  // A dual-licensed package's files go into one text, each under its name.
  for (const { name, version, files } of components) {
    const target = join(outDir, licenseFileName(name, version))
    if (files.length === 1) copyFileSync(files[0], target)
    else {
      const parts = files.map(
        (file) => `===== ${basename(file)} =====\n\n${readFileSync(file, 'utf-8')}`
      )
      writeFileSync(target, parts.join('\n\n'))
    }
  }
  console.log(`licenses: ${components.length} components checked, texts in ${outDir}`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
