import { z } from 'zod'

export interface LibraryCoverArtHttpDeps {
  fetchStoreItems: (appIds: string[]) => Promise<unknown>
}

// No default overall timeout on global fetch — see owned-games.ts.
const FETCH_TIMEOUT_MS = 15_000

// IStoreBrowseService/GetItems is undocumented (it's what steamcommunity.com
// and the Steam client itself call internally, not part of the published
// Web API), unlike IPlayerService/GetOwnedGames used elsewhere in this app.
// It's used here because it's the only source — official or not — that
// returns the ACTUAL per-app asset filename: guessing a fixed path (the
// first approach tried) works for older titles but 404s for anything whose
// filename includes a content hash Valve started adding, or that simply
// isn't named "library_600x900.jpg" at all (confirmed: some apps use
// entirely different filenames, e.g. "portrait.png"). No API key needed.
const realHttp: LibraryCoverArtHttpDeps = {
  fetchStoreItems: async (appIds) => {
    const inputJson = JSON.stringify({
      ids: appIds.map((appId) => ({ appid: Number(appId) })),
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true }
    })
    const params = new URLSearchParams({ input_json: inputJson })
    const response = await fetch(
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?${params.toString()}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!response.ok) {
      throw new Error(`Steam Store Browse API responded with ${response.status}`)
    }
    return response.json()
  }
}

// Keeps each request's URL length well under typical server/proxy limits
// even for a large owned-games library.
const CHUNK_SIZE = 100

// A large library could split into many chunks — firing them all at once
// would burst a lot of near-simultaneous requests at an undocumented,
// internal Valve endpoint. This codebase has already been burned once by
// Steam's edge (Akamai) blocking traffic that looked automated (see
// docs/lessons.md, the OpenID embedded-window entry) — capping concurrency
// here is cheap insurance against the same class of problem.
const MAX_CONCURRENT_CHUNKS = 4

const storeItemSchema = z.object({
  appid: z.number().int().positive(),
  assets: z
    .object({
      // A template like "steam/apps/<appid>/${FILENAME}?t=<cache-bust>" —
      // library_capsule (below) is substituted into it.
      asset_url_format: z.string().min(1),
      library_capsule: z.string().min(1)
    })
    .optional()
})

const storeItemsResponseSchema = z.object({
  response: z.object({
    store_items: z.array(z.unknown()).optional()
  })
})

const ASSET_HOST = 'https://shared.akamai.steamstatic.com/store_item_assets/'

function buildCoverUrl(assetUrlFormat: string, libraryCapsuleFilename: string): string {
  return ASSET_HOST + assetUrlFormat.replace('${FILENAME}', libraryCapsuleFilename)
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

// Runs `tasks` with at most `limit` in flight at once — a fixed pool of
// workers, each pulling the next task off the shared queue as it finishes,
// rather than batching-and-awaiting in fixed-size groups (which would leave
// a worker idle if one task in a group is slower than the others).
async function runWithConcurrencyLimit(
  tasks: Array<() => Promise<void>>,
  limit: number
): Promise<void> {
  let nextIndex = 0
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++
      const task = tasks[index]
      // noUncheckedIndexedAccess can't see that `index < tasks.length` from
      // here — this is just that bounds check, made explicit.
      if (task === undefined) return
      await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
}

// Looks up the real cover-art URL per appId. An appId absent from the
// returned record means no cover art is available (or the app lacks a
// library_capsule asset entirely) — never an error the caller has to
// handle, matching this app's "missing art degrades quietly" convention.
export async function getLibraryCoverArtUrls(
  appIds: string[],
  http: LibraryCoverArtHttpDeps = realHttp
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  const tasks = chunk(appIds, CHUNK_SIZE).map((batch) => async () => {
    let raw: unknown
    try {
      raw = await http.fetchStoreItems(batch)
    } catch (err) {
      // One failed batch (network blip, rate limit) shouldn't blank out
      // cover art for every other batch that succeeded.
      console.warn('[steam] could not fetch a batch of library cover art:', err)
      return
    }

    const parsed = storeItemsResponseSchema.safeParse(raw)
    if (!parsed.success) return

    for (const item of parsed.data.response.store_items ?? []) {
      const itemResult = storeItemSchema.safeParse(item)
      if (!itemResult.success || itemResult.data.assets === undefined) continue
      result[String(itemResult.data.appid)] = buildCoverUrl(
        itemResult.data.assets.asset_url_format,
        itemResult.data.assets.library_capsule
      )
    }
  })

  await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_CHUNKS)

  return result
}
