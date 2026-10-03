import { describe, expect, it } from 'vitest'
import { STORES } from '@shared/stores'
import { LIBRARY_ENTRIES, screenLabel } from './navigation'

describe('LIBRARY_ENTRIES', () => {
  it('starts with All games, then every supported store in order', () => {
    expect(LIBRARY_ENTRIES[0]).toEqual({ screen: 'all', label: 'All games' })
    expect(LIBRARY_ENTRIES.slice(1).map((entry) => entry.screen)).toEqual(
      STORES.map((store) => store.id)
    )
  })

  it('uses plain store names, no logos or extra words', () => {
    expect(LIBRARY_ENTRIES.map((entry) => entry.label)).toEqual(['All games', 'Steam', 'Epic'])
  })
})

describe('screenLabel', () => {
  it('names every screen', () => {
    expect(screenLabel('all')).toBe('All games')
    expect(screenLabel('epic')).toBe('Epic')
    expect(screenLabel('settings')).toBe('Settings')
  })
})
