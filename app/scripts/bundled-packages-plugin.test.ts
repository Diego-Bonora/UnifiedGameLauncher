import { describe, expect, it } from 'vitest'
import {
  cssPackageImports,
  packageDirFromModuleId,
  virtualModuleOwner
} from './bundled-packages-plugin'

describe('packageDirFromModuleId', () => {
  it('finds plain and scoped packages', () => {
    expect(packageDirFromModuleId('/app/node_modules/react/index.js')).toBe(
      '/app/node_modules/react'
    )
    expect(packageDirFromModuleId('/app/node_modules/@fontsource-variable/sora/index.css')).toBe(
      '/app/node_modules/@fontsource-variable/sora'
    )
  })

  it('takes the innermost package for nested copies', () => {
    expect(packageDirFromModuleId('/app/node_modules/a/node_modules/b/lib/x.js')).toBe(
      '/app/node_modules/a/node_modules/b'
    )
  })

  it("strips Rollup's virtual-module prefix and query suffixes", () => {
    expect(packageDirFromModuleId('\0/app/node_modules/react/index.js?commonjs-module')).toBe(
      '/app/node_modules/react'
    )
  })

  it('handles Windows paths', () => {
    expect(packageDirFromModuleId('C:\\app\\node_modules\\react\\index.js')).toBe(
      'C:/app/node_modules/react'
    )
  })

  it("returns null for the app's own code and virtual helpers", () => {
    expect(packageDirFromModuleId('/app/src/renderer/src/App.tsx')).toBeNull()
    expect(packageDirFromModuleId('\0commonjsHelpers.js')).toBeNull()
    expect(packageDirFromModuleId('/app/node_modules/')).toBeNull()
  })
})

describe('virtualModuleOwner', () => {
  it("names Vite's own helpers and flags other virtual modules", () => {
    expect(virtualModuleOwner('\0vite/modulepreload-polyfill.js')).toBe('vite')
    expect(virtualModuleOwner('\0commonjsHelpers.js')).toBe('vite')
    expect(virtualModuleOwner('\0some-plugin:runtime')).toBe('unknown')
  })

  it('leaves real files to packageDirFromModuleId', () => {
    expect(virtualModuleOwner('\0/app/node_modules/react/index.js?commonjs-module')).toBeNull()
    expect(virtualModuleOwner('/app/src/main.tsx')).toBeNull()
  })

  it('leaves the stand-ins for external requires to their own packages', () => {
    expect(virtualModuleOwner('\0node:fs?commonjs-external')).toBeNull()
    expect(virtualModuleOwner('\0electron?commonjs-external')).toBeNull()
  })
})

describe('cssPackageImports', () => {
  it('finds package imports, scoped or with a path, and skips relative and URL ones', () => {
    const css = [
      "@import '@fontsource-variable/sora';",
      '@import "tailwindcss";',
      "@import 'pkg/sub/file.css';",
      "@import './local.css';",
      "@import url('https://example.com/x.css');",
      "@import url('pkg2');"
    ].join('\n')
    expect(cssPackageImports(css)).toEqual([
      '@fontsource-variable/sora',
      'tailwindcss',
      'pkg',
      'pkg2'
    ])
  })
})
