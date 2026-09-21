import { describe, expect, it } from 'vitest'
import type { SteamOwnedGame } from '@shared/ipc/steam-channels'
import { applyFreshCovers, mergeFreshCovers } from './library-view'

const REMOTE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/cap.jpg'

function game(appId: string, coverUrl: string | null, title = `Game ${appId}`): SteamOwnedGame {
  return { appId, title, coverUrl }
}

describe('applyFreshCovers', () => {
  it('swaps in the local cover URL for a game whose cover finished downloading', () => {
    const shown = [game('10', REMOTE), game('20', null)]
    const fresh = [game('10', 'app-cover://covers/10'), game('20', null)]

    expect(applyFreshCovers(shown, fresh)).toEqual([
      game('10', 'app-cover://covers/10'),
      game('20', null)
    ])
  })

  it('never puts a remote URL back over a local one (an older snapshot must not win)', () => {
    const shown = [game('10', 'app-cover://covers/10')]
    expect(applyFreshCovers(shown, [game('10', REMOTE)])).toBe(shown)
  })

  it('never removes a cover because the fresh list has none', () => {
    const shown = [game('10', 'app-cover://covers/10'), game('20', REMOTE)]
    expect(applyFreshCovers(shown, [game('10', null), game('20', null)])).toBe(shown)
  })

  it('does not swap one remote URL for another', () => {
    const shown = [game('10', REMOTE)]
    expect(applyFreshCovers(shown, [game('10', `${REMOTE}?t=2`)])).toBe(shown)
  })

  it('does not accept a look-alike URL that is not the local scheme', () => {
    const shown = [game('10', REMOTE)]
    expect(applyFreshCovers(shown, [game('10', 'app-cover-evil://covers/10')])).toBe(shown)
    expect(applyFreshCovers(shown, [game('10', 'https://app-cover://covers/10')])).toBe(shown)
  })

  it('replaces a missing cover once one exists', () => {
    expect(applyFreshCovers([game('10', null)], [game('10', 'app-cover://covers/10')])).toEqual([
      game('10', 'app-cover://covers/10')
    ])
  })

  it('takes only the cover: titles and order stay as shown', () => {
    const shown = [game('20', REMOTE, 'Shown B'), game('10', REMOTE, 'Shown A')]
    const fresh = [game('10', 'app-cover://covers/10', 'Renamed'), game('20', REMOTE, 'Other')]

    const result = applyFreshCovers(shown, fresh)

    expect(result.map((g) => g.appId)).toEqual(['20', '10'])
    expect(result.map((g) => g.title)).toEqual(['Shown B', 'Shown A'])
    expect(result[1]?.coverUrl).toBe('app-cover://covers/10')
  })

  it('leaves a game alone when it is not in the fresh list', () => {
    const shown = [game('10', REMOTE), game('99', REMOTE)]
    const result = applyFreshCovers(shown, [game('10', 'app-cover://covers/10')])
    expect(result[1]).toBe(shown[1])
  })

  it('ignores games that are only in the fresh list', () => {
    expect(applyFreshCovers([game('10', REMOTE)], [game('30', 'app-cover://covers/30')])).toEqual([
      game('10', REMOTE)
    ])
  })

  it('returns the very same array when nothing changed', () => {
    const shown = [game('10', 'app-cover://covers/10')]
    expect(applyFreshCovers(shown, [game('10', 'app-cover://covers/10')])).toBe(shown)
    expect(applyFreshCovers(shown, [])).toBe(shown)
  })

  it('handles empty lists', () => {
    expect(applyFreshCovers([], [game('10', REMOTE)])).toEqual([])
  })
})

describe('mergeFreshCovers', () => {
  const ACCOUNT_A = '76561197960287930'
  const ACCOUNT_B = '76561197960287931'

  interface Shown {
    steamId64: string
    games: SteamOwnedGame[] | null
    error: string | null
    failures: number
  }

  function shown(steamId64: string, games: SteamOwnedGame[] | null): Shown {
    return { steamId64, games, error: null, failures: 2 }
  }

  it('upgrades the covers of the same account and keeps every other field', () => {
    const previous = shown(ACCOUNT_A, [game('10', REMOTE)])

    const result = mergeFreshCovers(previous, {
      steamId64: ACCOUNT_A,
      games: [game('10', 'app-cover://covers/10')]
    })

    expect(result).toEqual({
      steamId64: ACCOUNT_A,
      games: [game('10', 'app-cover://covers/10')],
      error: null,
      failures: 2
    })
  })

  it("ignores another account's list", () => {
    const previous = shown(ACCOUNT_A, [game('10', REMOTE)])

    expect(
      mergeFreshCovers(previous, {
        steamId64: ACCOUNT_B,
        games: [game('10', 'app-cover://covers/10')]
      })
    ).toBe(previous)
  })

  it('does nothing when there is no result yet', () => {
    expect(
      mergeFreshCovers(null, { steamId64: ACCOUNT_A, games: [game('10', 'app-cover://covers/10')] })
    ).toBeNull()
  })

  it('does nothing when the result has no games (nothing to upgrade)', () => {
    const previous = shown(ACCOUNT_A, null)
    expect(
      mergeFreshCovers(previous, {
        steamId64: ACCOUNT_A,
        games: [game('10', 'app-cover://covers/10')]
      })
    ).toBe(previous)
  })

  it('returns the very same object when no cover changes', () => {
    const previous = shown(ACCOUNT_A, [game('10', 'app-cover://covers/10')])
    expect(
      mergeFreshCovers(previous, {
        steamId64: ACCOUNT_A,
        games: [game('10', 'app-cover://covers/10')]
      })
    ).toBe(previous)
  })
})
