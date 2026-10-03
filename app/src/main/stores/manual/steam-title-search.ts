import { z } from 'zod'
import { readBodyWithLimit } from '../../library/cover-files'

// Finding a manual game's Steam app id by its title
// (docs/features/library-tools.md, "Finding the Steam poster"). Steam's store
// search was checked with a plain request on 2026-10-03: no key, and each
// result carries `type`, `name` and `id` (fixtures/storesearch-*.json).

export interface SteamSearchHttpDeps {
  search: (term: string) => Promise<unknown>
}

// No default overall timeout on global fetch (see owned-games.ts).
const FETCH_TIMEOUT_MS = 15_000
const MAX_ANSWER_BYTES = 1024 * 1024

const realHttp: SteamSearchHttpDeps = {
  search: async (term) => {
    const params = new URLSearchParams({ term, l: 'english', cc: 'US' })
    const response = await fetch(`https://store.steampowered.com/api/storesearch/?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Only Steam's own answer counts.
      redirect: 'error'
    })
    if (!response.ok) throw new Error(`Steam store search responded with ${response.status}`)
    // Size-capped while streaming, like every download (a real answer is a
    // few KB).
    const body = await readBodyWithLimit(response.body, MAX_ANSWER_BYTES)
    return JSON.parse(new TextDecoder().decode(body))
  }
}

// Only the fields used; anything else in an item is ignored, and an item
// without them is skipped rather than failing the whole answer.
const itemSchema = z.object({
  type: z.string(),
  name: z.string(),
  id: z.number().int().positive()
})
const responseSchema = z.object({ items: z.array(z.unknown()) })

const TRADEMARK_SIGNS = /[®™©]/g
// Combining marks left after NFKD splits "é" into "e" + accent.
const COMBINING_MARKS = /\p{M}/gu
// Apostrophes join a word ("Let’s" is "lets", not "let s"); other
// punctuation and symbols separate words ("Half-Life: Alyx", "Half Life Alyx").
const APOSTROPHES = /['’‘ʼ]/g
const PUNCTUATION = /[\p{P}\p{S}]/gu

// The form a title and a Steam name are compared in: the spec's "exactly,
// ignoring case, accents, ®/™ and punctuation". Spaces are collapsed, so
// punctuation that sat between words doesn't leave a double space.
export function titleMatchKey(title: string): string {
  return (
    title
      // First: NFKD would turn "™" into the letters "TM".
      .replace(TRADEMARK_SIGNS, '')
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .replace(APOSTROPHES, '')
      .replace(PUNCTUATION, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  )
}

//  - found: the first app whose name matches exactly
//  - miss: Steam answered and nothing matched (remembered per title)
//  - failed: no usable answer (offline, Steam erroring); asked again later
export type SteamTitleSearch =
  { kind: 'found'; appId: string } | { kind: 'miss' } | { kind: 'failed' }

export async function findSteamAppIdByTitle(
  title: string,
  http: SteamSearchHttpDeps = realHttp
): Promise<SteamTitleSearch> {
  const wanted = titleMatchKey(title)
  // A title of only punctuation would match every such name.
  if (wanted === '') return { kind: 'miss' }
  let raw: unknown
  try {
    raw = await http.search(title.trim())
  } catch (err) {
    console.warn('[manual] Steam store search failed:', err)
    return { kind: 'failed' }
  }
  const parsed = responseSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[manual] Steam store search gave an unexpected answer')
    return { kind: 'failed' }
  }
  for (const item of parsed.data.items) {
    const result = itemSchema.safeParse(item)
    if (!result.success || result.data.type !== 'app') continue
    if (titleMatchKey(result.data.name) === wanted) {
      return { kind: 'found', appId: String(result.data.id) }
    }
  }
  return { kind: 'miss' }
}
