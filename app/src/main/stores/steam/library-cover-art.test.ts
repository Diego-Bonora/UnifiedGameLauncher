import { describe, expect, it } from 'vitest'
import {
  getLibraryCoverArtUrls,
  lookUpLibraryCoverArt,
  type LibraryCoverArtHttpDeps
} from './library-cover-art'

function fakeHttp(response: unknown): LibraryCoverArtHttpDeps {
  return { fetchStoreItems: async () => response }
}

const HOST = 'https://shared.akamai.steamstatic.com/store_item_assets/'

describe('getLibraryCoverArtUrls', () => {
  it('builds the cover URL by substituting the filename into the asset URL format', async () => {
    const http = fakeHttp({
      response: {
        store_items: [
          {
            appid: 220,
            assets: {
              asset_url_format: 'steam/apps/220/${FILENAME}?t=123',
              library_capsule: 'abc123/library_capsule.jpg'
            }
          }
        ]
      }
    })
    expect(await getLibraryCoverArtUrls(['220'], http)).toEqual({
      '220': `${HOST}steam/apps/220/abc123/library_capsule.jpg?t=123`
    })
  })

  it('omits an appId whose item has no assets (e.g. not a real store item)', async () => {
    const http = fakeHttp({
      response: { store_items: [{ appid: 220 }] }
    })
    expect(await getLibraryCoverArtUrls(['220'], http)).toEqual({})
  })

  it('drops a malformed entry instead of failing the whole batch', async () => {
    const http = fakeHttp({
      response: {
        store_items: [
          {
            appid: 220,
            assets: { asset_url_format: 'steam/apps/220/${FILENAME}', library_capsule: 'x.jpg' }
          },
          { appid: 'not-a-number', assets: { asset_url_format: 'x', library_capsule: 'y' } }
        ]
      }
    })
    expect(await getLibraryCoverArtUrls(['220', '999'], http)).toEqual({
      '220': `${HOST}steam/apps/220/x.jpg`
    })
  })

  it('returns an empty record for an unexpected response shape', async () => {
    expect(await getLibraryCoverArtUrls(['220'], fakeHttp('not an object'))).toEqual({})
    expect(await getLibraryCoverArtUrls(['220'], fakeHttp(null))).toEqual({})
  })

  it('splits requests into chunks and merges results, one failed chunk not affecting another', async () => {
    const appIds = Array.from({ length: 150 }, (_, i) => String(i + 1))
    let callCount = 0
    const http: LibraryCoverArtHttpDeps = {
      fetchStoreItems: async (batch) => {
        callCount += 1
        if (callCount === 1) throw new Error('network blip')
        return {
          response: {
            store_items: batch.map((appId) => ({
              appid: Number(appId),
              assets: {
                asset_url_format: `steam/apps/${appId}/\${FILENAME}`,
                library_capsule: 'library_600x900.jpg'
              }
            }))
          }
        }
      }
    }

    const result = await getLibraryCoverArtUrls(appIds, http)

    expect(callCount).toBe(2)
    // First chunk (ids 1-100) failed and contributed nothing; second chunk
    // (101-150) succeeded and is present.
    expect(result['1']).toBeUndefined()
    expect(result['150']).toBe(`${HOST}steam/apps/150/library_600x900.jpg`)
  })

  it('never runs more than the concurrency limit of chunk requests at once', async () => {
    // 500 appIds -> 5 chunks (CHUNK_SIZE 100), more than MAX_CONCURRENT_CHUNKS
    // (4) — this would burst 5 simultaneous requests at Steam's undocumented
    // endpoint without the cap. See docs/lessons.md's OpenID/Akamai entry for
    // why this codebase treats that as worth guarding against.
    const appIds = Array.from({ length: 500 }, (_, i) => String(i + 1))
    let active = 0
    let maxActive = 0
    const http: LibraryCoverArtHttpDeps = {
      fetchStoreItems: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return { response: { store_items: [] } }
      }
    }

    await getLibraryCoverArtUrls(appIds, http)

    expect(maxActive).toBe(4)
  })

  it('never throws when the http dependency rejects', async () => {
    const http: LibraryCoverArtHttpDeps = {
      fetchStoreItems: async () => {
        throw new Error('Steam Store Browse API responded with 429')
      }
    }
    await expect(getLibraryCoverArtUrls(['220'], http)).resolves.toEqual({})
  })
})

describe('lookUpLibraryCoverArt', () => {
  it('tells "no cover" apart from "could not ask"', async () => {
    let call = 0
    const http: LibraryCoverArtHttpDeps = {
      fetchStoreItems: async () => {
        call++
        if (call === 1) {
          // Asked and answered: 10 has a cover, 20 has none.
          return {
            response: {
              store_items: [
                {
                  appid: 10,
                  assets: {
                    asset_url_format: 'steam/apps/10/${FILENAME}',
                    library_capsule: 'c.jpg'
                  }
                },
                { appid: 20 }
              ]
            }
          }
        }
        throw new Error('offline')
      }
    }
    // 150 ids: two batches of 100 and 50; the second one fails.
    const ids = ['10', '20', ...Array.from({ length: 148 }, (_, i) => String(1000 + i))]
    const lookup = await lookUpLibraryCoverArt(ids, http)
    expect(Object.keys(lookup.urls)).toEqual(['10'])
    expect(lookup.failedIds).toEqual(ids.slice(100))
    expect(lookup.failedIds).not.toContain('20')
  })

  it('counts an unexpected response shape as "could not ask"', async () => {
    const lookup = await lookUpLibraryCoverArt(['10'], fakeHttp({ nope: true }))
    expect(lookup).toEqual({ urls: {}, failedIds: ['10'] })
  })
})
