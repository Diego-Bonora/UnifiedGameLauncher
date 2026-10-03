import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  findSteamAppIdByTitle,
  titleMatchKey,
  type SteamSearchHttpDeps
} from './steam-title-search'

// A real answer, captured from the user's Mac on 2026-10-03 (the second item
// is trimmed: the captured output was cut off there).
const HOLLOW_KNIGHT: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'storesearch-hollow-knight.json'), 'utf-8')
)

const answering = (body: unknown): SteamSearchHttpDeps & { terms: string[] } => {
  const terms: string[] = []
  return {
    terms,
    search: async (term) => {
      terms.push(term)
      return body
    }
  }
}

describe('titleMatchKey', () => {
  it('ignores case, accents, trademark signs and punctuation', () => {
    expect(titleMatchKey('Pokémon™: Let’s Go!')).toBe(titleMatchKey('pokemon lets go'))
    expect(titleMatchKey('Half-Life: Alyx')).toBe(titleMatchKey('half life alyx'))
    expect(titleMatchKey('  DOOM   Eternal ')).toBe('doom eternal')
  })

  it('still tells different titles apart', () => {
    expect(titleMatchKey('Hollow Knight')).not.toBe(titleMatchKey('Hollow Knight: Silksong'))
    expect(titleMatchKey('Portal')).not.toBe(titleMatchKey('Portal 2'))
  })
})

describe('findSteamAppIdByTitle (real answer)', () => {
  it('finds the exact match, not the sequel listed next to it', async () => {
    const http = answering(HOLLOW_KNIGHT)
    expect(await findSteamAppIdByTitle('Hollow Knight', http)).toEqual({
      kind: 'found',
      appId: '367520'
    })
    expect(http.terms).toEqual(['Hollow Knight'])
  })

  it('matches however the user spelled it', async () => {
    expect(
      await findSteamAppIdByTitle('hollow knight: silksong', answering(HOLLOW_KNIGHT))
    ).toEqual({ kind: 'found', appId: '1030300' })
  })

  it('is a miss when no name matches exactly', async () => {
    expect(await findSteamAppIdByTitle('Hollow', answering(HOLLOW_KNIGHT))).toEqual({
      kind: 'miss'
    })
  })
})

describe('findSteamAppIdByTitle (other answers)', () => {
  it('skips results that are not apps, and malformed items', async () => {
    const body = {
      items: [
        { type: 'sub', name: 'Doom', id: 1 },
        { name: 'Doom' },
        { type: 'app', name: 'DOOM', id: 2280 }
      ]
    }
    expect(await findSteamAppIdByTitle('Doom', answering(body))).toEqual({
      kind: 'found',
      appId: '2280'
    })
  })

  it('reports a failed request or an unexpected answer as failed, not as a miss', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const offline: SteamSearchHttpDeps = {
      search: async () => Promise.reject(new Error('offline'))
    }
    expect(await findSteamAppIdByTitle('Doom', offline)).toEqual({ kind: 'failed' })
    expect(await findSteamAppIdByTitle('Doom', answering('<html>'))).toEqual({ kind: 'failed' })
    warn.mockRestore()
  })

  it('never asks Steam about a title that is only punctuation', async () => {
    const http = answering(HOLLOW_KNIGHT)
    expect(await findSteamAppIdByTitle('!!!', http)).toEqual({ kind: 'miss' })
    expect(http.terms).toEqual([])
  })
})
