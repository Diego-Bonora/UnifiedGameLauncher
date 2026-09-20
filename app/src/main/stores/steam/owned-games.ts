import { z } from 'zod'
import { getLibraryCoverArtUrls, type LibraryCoverArtHttpDeps } from './library-cover-art'

// Only the fields used today. Steam's response carries a lot more
// (playtime, icon/logo hashes, stats flags) that later milestones may pick
// up.
export interface SteamOwnedGame {
  appId: string
  title: string
  // null means no cover art was found for this app, not "not fetched yet" —
  // by the time this leaves getOwnedSteamGames, the lookup has already run.
  coverUrl: string | null
}

export interface OwnedGamesHttpDeps {
  fetchOwnedGames: (steamId64: string, apiKey: string) => Promise<unknown>
}

// Without an explicit timeout, a hung connection leaves this fetch pending
// forever — global fetch has no default one — which would leave the
// renderer's loading state spinning indefinitely with no error to show.
const FETCH_TIMEOUT_MS = 15_000

// Real deps default: a real call to Steam's Web API. Threaded through as a
// parameter (not hardcoded) so response parsing can be tested with fixed,
// fake payloads instead of a real network call and a real API key.
const realHttp: OwnedGamesHttpDeps = {
  fetchOwnedGames: async (steamId64, apiKey) => {
    const params = new URLSearchParams({
      key: apiKey,
      steamid: steamId64,
      include_appinfo: '1'
    })
    const response = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${params.toString()}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!response.ok) {
      throw new Error(`Steam API responded with ${response.status}`)
    }
    return response.json()
  }
}

// Steam always returns appid as a number; the rest of the app treats appIds
// as strings (matching SteamInstalledGame, and how they appear in steam://
// URLs and .acf filenames).
const steamApiGameSchema = z.object({
  appid: z.number().int().positive(),
  name: z.string().min(1)
})

interface ParsedGame {
  appId: string
  title: string
}

// A malformed entry is dropped rather than failing the whole library — same
// "one bad entry shouldn't take down every other game" rule as the
// installed-games VDF parsing.
function parseOwnedGamesResponse(raw: unknown): ParsedGame[] {
  const games = (raw as { response?: { games?: unknown } } | null)?.response?.games
  if (!Array.isArray(games)) return []

  return games.flatMap((entry) => {
    const result = steamApiGameSchema.safeParse(entry)
    if (!result.success) return []
    return [{ appId: String(result.data.appid), title: result.data.name }]
  })
}

export async function getOwnedSteamGames(
  steamId64: string,
  apiKey: string,
  http: OwnedGamesHttpDeps = realHttp,
  // A separate deps bag (not folded into OwnedGamesHttpDeps): this talks to
  // a different Steam API than fetchOwnedGames does, and passing `undefined`
  // here still lets getLibraryCoverArtUrls fall back to its own real deps.
  coverArtHttp?: LibraryCoverArtHttpDeps
): Promise<SteamOwnedGame[]> {
  const raw = await http.fetchOwnedGames(steamId64, apiKey)
  const games = parseOwnedGamesResponse(raw)
  if (games.length === 0) return []

  // A missing appId here just means no cover art was found for it — this
  // lookup failing entirely (see library-cover-art.ts) never throws, so it
  // can't take down the owned-games list it's decorating.
  const coverUrls = await getLibraryCoverArtUrls(
    games.map((game) => game.appId),
    coverArtHttp
  )
  return games.map((game) => ({ ...game, coverUrl: coverUrls[game.appId] ?? null }))
}
