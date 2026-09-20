import { z } from 'zod'

// Only the fields used today. Steam's response carries a lot more
// (playtime, icon/logo hashes, stats flags) that later milestones may pick
// up — cover art (Step 4) builds its own CDN URL from appId rather than
// trusting img_icon_url, so it isn't captured here yet.
export interface SteamOwnedGame {
  appId: string
  title: string
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

// A malformed entry is dropped rather than failing the whole library — same
// "one bad entry shouldn't take down every other game" rule as the
// installed-games VDF parsing.
function parseOwnedGamesResponse(raw: unknown): SteamOwnedGame[] {
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
  http: OwnedGamesHttpDeps = realHttp
): Promise<SteamOwnedGame[]> {
  const raw = await http.fetchOwnedGames(steamId64, apiKey)
  return parseOwnedGamesResponse(raw)
}
