import { describe, expect, it } from 'vitest'
import { parseEpicManifest, type EpicManifest, type EpicManifestResult } from './epic-manifest'

// Shaped like a real Data/Manifests/*.item file: forward-slash paths, catalog
// ids and the category list Epic writes for games.
const base = {
  FormatVersion: 0,
  AppName: 'Sunflower',
  DisplayName: 'Fortnite',
  InstallLocation: 'C:/Program Files/Epic Games/Fortnite',
  LaunchExecutable: 'FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe',
  CatalogNamespace: 'fn',
  CatalogItemId: '4fe75bbc5a674f4f9b356b5c90567da5',
  MainGameAppName: 'Sunflower',
  AppCategories: ['public', 'games', 'applications'],
  bIsIncompleteInstall: false
}

function parse(overrides: Record<string, unknown> = {}, text?: string): EpicManifestResult {
  return parseEpicManifest(text ?? JSON.stringify({ ...base, ...overrides }))
}

function game(result: EpicManifestResult): EpicManifest {
  if (result.kind !== 'game') throw new Error(`expected a game, got ${result.kind}`)
  return result.manifest
}

describe('parseEpicManifest', () => {
  it('extracts a real-shaped manifest and normalizes the install path', () => {
    expect(game(parse())).toEqual({
      appName: 'Sunflower',
      title: 'Fortnite',
      installLocation: 'C:\\Program Files\\Epic Games\\Fortnite',
      catalogNamespace: 'fn',
      catalogItemId: '4fe75bbc5a674f4f9b356b5c90567da5'
    })
  })

  it('accepts a manifest without MainGameAppName, AppCategories or catalog ids', () => {
    const result = parse({
      MainGameAppName: undefined,
      AppCategories: undefined,
      CatalogNamespace: undefined,
      CatalogItemId: undefined
    })
    expect(game(result).catalogNamespace).toBeUndefined()
  })

  it('drops malformed catalog ids instead of rejecting the game', () => {
    const manifest = game(parse({ CatalogNamespace: 'a/b', CatalogItemId: 42 }))
    expect(manifest.catalogNamespace).toBeUndefined()
    expect(manifest.catalogItemId).toBeUndefined()
  })

  it('reads a manifest that starts with a byte-order mark', () => {
    expect(parse({}, '\uFEFF' + JSON.stringify(base)).kind).toBe('game')
  })

  it('reports invalid JSON or a non-object as invalid', () => {
    for (const text of ['not json', '', '[]', 'null', '42']) {
      expect(parse({}, text).kind).toBe('invalid')
    }
  })

  it('reports a missing or empty required field as invalid', () => {
    for (const field of ['AppName', 'DisplayName', 'InstallLocation']) {
      expect(parse({ [field]: undefined }).kind).toBe('invalid')
      expect(parse({ [field]: '' }).kind).toBe('invalid')
    }
  })

  it('rejects an AppName that could alter the launch URL', () => {
    for (const AppName of ['a/b', 'a?b', 'a b', 'a&b=1', '../x', 'a.b']) {
      expect(parse({ AppName, MainGameAppName: AppName }).kind).toBe('invalid')
    }
  })

  it('rejects relative and UNC install locations', () => {
    for (const InstallLocation of [
      'Games/Fortnite',
      '..\\Fortnite',
      '\\\\host\\share\\Fortnite',
      '//host/share/Fortnite',
      '/Fortnite',
      'C:Fortnite',
      'C:',
      '\\\\?\\C:\\Fortnite'
    ]) {
      expect(parse({ InstallLocation }).kind).toBe('invalid')
    }
  })

  it('normalizes install paths: no trailing separator, non-ASCII kept, bare drive kept', () => {
    expect(game(parse({ InstallLocation: 'C:/Games/Foo/' })).installLocation).toBe('C:\\Games\\Foo')
    expect(game(parse({ InstallLocation: 'D:\\Jogos\\Ação' })).installLocation).toBe(
      'D:\\Jogos\\Ação'
    )
    expect(game(parse({ InstallLocation: 'C:/' })).installLocation).toBe('C:\\')
  })

  it('strips invisible formatting characters and never cuts an emoji in half', () => {
    expect(game(parse({ DisplayName: 'A\u200bB\u202eC\u2028D\u0085E' })).title).toBe('ABCDE')
    expect(parse({ DisplayName: '\u200b\u202e' }).kind).toBe('invalid')
    const title = game(parse({ DisplayName: '😀'.repeat(300) })).title
    expect(Array.from(title)).toHaveLength(200)
    expect(title).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/)
  })

  it('does not report engines, DLC or incomplete installs as invalid even with odd fields', () => {
    const odd = { AppName: 'UE_5.3', DisplayName: undefined, InstallLocation: 'relative/path' }
    expect(parse({ ...odd, MainGameAppName: 'UE_5.3', AppCategories: ['applications'] }).kind).toBe(
      'skipped'
    )
    expect(parse({ ...odd, MainGameAppName: 'Other' }).kind).toBe('skipped')
    expect(parse({ ...odd, bIsIncompleteInstall: true }).kind).toBe('skipped')
  })

  it('cleans control characters out of the title and caps its length', () => {
    expect(game(parse({ DisplayName: 'Nice\u0000 \u001bGame\n' })).title).toBe('Nice Game')
    expect(game(parse({ DisplayName: 'x'.repeat(500) })).title).toHaveLength(200)
    expect(parse({ DisplayName: '\u0007\u0008' }).kind).toBe('invalid')
  })

  it('skips DLC, whose AppName differs from MainGameAppName', () => {
    expect(parse({ AppName: 'SomeDlc', MainGameAppName: 'Sunflower' }).kind).toBe('skipped')
  })

  it('skips non-games such as engines and plugins', () => {
    expect(parse({ AppCategories: ['public', 'applications'] }).kind).toBe('skipped')
    expect(parse({ AppCategories: [] }).kind).toBe('skipped')
  })

  it('skips incomplete installs', () => {
    expect(parse({ bIsIncompleteInstall: true }).kind).toBe('skipped')
  })
})
