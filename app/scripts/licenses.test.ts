import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bundledPackageDirs,
  collectComponents,
  isAllowedLicense,
  licenseFilesIn,
  productionPackageDirs
} from './licenses.mjs'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'licenses-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writePackage(dir: string, manifest: object, files: string[] = ['LICENSE']): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  for (const file of files) writeFileSync(join(dir, file), 'license text')
  return dir
}

describe('isAllowedLicense', () => {
  it('accepts allowed ids and refuses others', () => {
    expect(isAllowedLicense('MIT')).toBe(true)
    expect(isAllowedLicense('OFL-1.1')).toBe(true)
    expect(isAllowedLicense('GPL-3.0')).toBe(false)
    expect(isAllowedLicense('UNLICENSED')).toBe(false)
  })

  it('needs one allowed choice with OR and every part with AND', () => {
    expect(isAllowedLicense('(MIT OR CC0-1.0)')).toBe(true)
    expect(isAllowedLicense('(GPL-3.0 OR MIT)')).toBe(true)
    expect(isAllowedLicense('(MIT AND GPL-3.0)')).toBe(false)
    expect(isAllowedLicense('(MIT AND ISC)')).toBe(true)
  })

  it('refuses malformed expressions', () => {
    expect(isAllowedLicense('MIT OR')).toBe(false)
    expect(isAllowedLicense('OR MIT')).toBe(false)
    expect(isAllowedLicense('MIT ISC')).toBe(false)
  })

  it('refuses exceptions, legacy objects and missing values', () => {
    expect(isAllowedLicense('Apache-2.0 WITH LLVM-exception')).toBe(false)
    expect(isAllowedLicense({ type: 'MIT' })).toBe(false)
    expect(isAllowedLicense(undefined)).toBe(false)
    expect(isAllowedLicense('  ')).toBe(false)
  })
})

describe('licenseFilesIn', () => {
  it('finds the usual spellings, all of them, and ignores look-alikes', () => {
    const a = writePackage(join(root, 'a'), {}, ['license.md', 'licenseCheck.json'])
    expect(licenseFilesIn(a)).toEqual([join(a, 'license.md')])
    const b = writePackage(join(root, 'b'), {}, ['COPYING'])
    expect(licenseFilesIn(b)).toEqual([join(b, 'COPYING')])
    const c = writePackage(join(root, 'c'), {}, ['LICENSE-MIT', 'LICENSE-APACHE', 'LICENSE.json'])
    expect(licenseFilesIn(c)).toEqual([join(c, 'LICENSE-APACHE'), join(c, 'LICENSE-MIT')])
    const d = writePackage(join(root, 'd'), {}, ['licenseCheck.json', 'README.md'])
    expect(licenseFilesIn(d)).toEqual([])
  })
})

describe('productionPackageDirs', () => {
  it('walks dependencies, including nested copies, but not dev or peer dependencies', () => {
    const app = writePackage(root, {
      name: 'app',
      dependencies: { a: '1' },
      devDependencies: { dev: '1' },
      peerDependencies: { peer: '1' }
    })
    const modules = join(app, 'node_modules')
    writePackage(join(modules, 'a'), { name: 'a', dependencies: { b: '2', '@s/c': '1' } })
    writePackage(join(modules, 'b'), { name: 'b', version: '1' })
    // a needs b@2, installed inside a's own node_modules.
    writePackage(join(modules, 'a', 'node_modules', 'b'), { name: 'b', version: '2' })
    writePackage(join(modules, '@s', 'c'), { name: '@s/c', dependencies: { a: '1' } })
    writePackage(join(modules, 'dev'), { name: 'dev' })
    writePackage(join(modules, 'peer'), { name: 'peer' })

    expect(productionPackageDirs(app).sort()).toEqual(
      [join(modules, '@s', 'c'), join(modules, 'a'), join(modules, 'a', 'node_modules', 'b')].sort()
    )
  })

  it("doesn't use a copy above the app's folder", () => {
    writePackage(join(root, 'node_modules', 'outside'), { name: 'outside' })
    const app = writePackage(join(root, 'app'), { name: 'app', dependencies: { outside: '1' } })
    expect(() => productionPackageDirs(app)).toThrow(/outside/)
  })

  it('skips an optional dependency that is not installed and fails on a missing one', () => {
    const app = writePackage(root, { name: 'app', optionalDependencies: { gone: '1' } })
    expect(productionPackageDirs(app)).toEqual([])
    writePackage(root, { name: 'app', dependencies: { gone: '1' } })
    expect(() => productionPackageDirs(root)).toThrow(/gone/)
  })
})

describe('collectComponents', () => {
  it('lists each name@version once, sorted', () => {
    const a = writePackage(join(root, 'a'), { name: 'zeta', version: '1.0.0', license: 'MIT' })
    const b = writePackage(join(root, 'b'), { name: 'alpha', version: '2.0.0', license: 'ISC' })
    const { components, problems } = collectComponents([a, b, a], {})
    expect(problems).toEqual([])
    expect(components.map((c) => `${c.name}@${c.version}`)).toEqual(['alpha@2.0.0', 'zeta@1.0.0'])
  })

  it('uses a reviewed exception for a package without a license file', () => {
    const bare = writePackage(join(root, 'bare'), { name: 'bare', version: '1.0.5' }, [])
    writeFileSync(join(root, 'bare.txt'), 'MIT text')
    const exceptions = { 'bare@1.0.5': { license: 'MIT', file: 'bare.txt' } }
    const { components, problems } = collectComponents([bare], exceptions, root)
    expect(problems).toEqual([])
    expect(components[0]).toMatchObject({ license: 'MIT', files: [join(root, 'bare.txt')] })
    // Another version is not covered by the exception.
    const newer = writePackage(join(root, 'newer'), { name: 'bare', version: '1.0.6' }, [])
    expect(collectComponents([newer], exceptions, root).problems).toHaveLength(2)
  })

  it("reports an exception whose text isn't in the repo", () => {
    const bare = writePackage(join(root, 'bare'), { name: 'bare', version: '1' }, [])
    const exceptions = { 'bare@1': { license: 'MIT', file: 'missing.txt' } }
    expect(collectComponents([bare], exceptions, root).problems[0]).toMatch(/missing/)
  })

  it('sorts by code unit, not locale', () => {
    const upper = writePackage(join(root, 'u'), { name: 'Zed', version: '1', license: 'MIT' })
    const lower = writePackage(join(root, 'l'), { name: 'abc', version: '1', license: 'MIT' })
    const { components } = collectComponents([lower, upper], {})
    expect(components.map((c) => c.name)).toEqual(['Zed', 'abc'])
  })

  it('reports every package with a refused license or no license file', () => {
    const gpl = writePackage(join(root, 'a'), { name: 'gpl', version: '1', license: 'GPL-3.0' })
    const bare = writePackage(join(root, 'b'), { name: 'bare', version: '1', license: 'MIT' }, [])
    const { problems } = collectComponents([gpl, bare], {})
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^gpl@1: license "GPL-3.0"/)
    expect(problems[1]).toMatch(/^bare@1: no license file/)
  })
})

describe('bundledPackageDirs', () => {
  it('needs the record of all three builds', () => {
    for (const target of ['main', 'preload']) {
      writeFileSync(join(root, `${target}.json`), JSON.stringify([{ dir: `/x/${target}` }]))
    }
    expect(() => bundledPackageDirs(root)).toThrow(/renderer\.json/)
    writeFileSync(join(root, 'renderer.json'), JSON.stringify([{ dir: '/x/react' }]))
    expect(bundledPackageDirs(root)).toEqual(['/x/main', '/x/preload', '/x/react'])
  })
})
