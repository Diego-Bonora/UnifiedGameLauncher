import { describe, expect, it, vi } from 'vitest'

// cover-files.ts imports `app` from electron only for the real folder path;
// nothing below touches the disk, but the import itself must still resolve.
vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import { COVER_URL_PREFIX } from '@shared/ipc/steam-channels'
import {
  coverIdFromFileName,
  coverUrlFor,
  detectImageExtension,
  findCoverFileName,
  isAnimatedImage,
  isValidCoverId,
  parseCoverRequest,
  readBodyWithLimit
} from './cover-files'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50
])

// Builds a PNG from (type, data length) chunks; only the chunk walk matters.
function pngWithChunks(...chunks: Array<[string, number]>): Uint8Array {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (const [type, length] of chunks) {
    parts.push((length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff)
    parts.push(...[...type].map((c) => c.charCodeAt(0)))
    parts.push(...new Array<number>(length).fill(0), 0, 0, 0, 0)
  }
  return new Uint8Array(parts)
}

// "RIFF" <size> "WEBP" "VP8X" <chunk size> <flags> ...
function webpVp8x(flags: number): Uint8Array {
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0x1e,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x58,
    0x0a,
    0x00,
    0x00,
    0x00,
    flags,
    0x00,
    0x00,
    0x00
  ])
}

describe('detectImageExtension', () => {
  it('recognizes JPEG, PNG and WebP by their first bytes', () => {
    expect(detectImageExtension(JPEG)).toBe('jpg')
    expect(detectImageExtension(PNG)).toBe('png')
    expect(detectImageExtension(WEBP)).toBe('webp')
  })

  it('rejects an empty body', () => {
    expect(detectImageExtension(new Uint8Array(0))).toBeNull()
  })

  it('rejects an HTML page that came back as a successful response', () => {
    expect(detectImageExtension(new TextEncoder().encode('<!doctype html><html>'))).toBeNull()
  })

  it('rejects a RIFF file that is not WebP', () => {
    const wave = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
    expect(detectImageExtension(wave)).toBeNull()
  })

  it('rejects a body cut off inside the signature', () => {
    expect(detectImageExtension(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(detectImageExtension(WEBP.slice(0, 10))).toBeNull()
  })
})

describe('readBodyWithLimit', () => {
  function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
        controller.close()
      }
    })
  }

  it('joins the chunks in order', async () => {
    const bytes = await readBodyWithLimit(streamOf([1, 2], [3], [4, 5]), 100)
    expect([...bytes]).toEqual([1, 2, 3, 4, 5])
  })

  it('returns an empty result for a missing body', async () => {
    expect((await readBodyWithLimit(null, 100)).length).toBe(0)
  })

  it('allows a body of exactly the limit', async () => {
    expect((await readBodyWithLimit(streamOf([1, 2, 3, 4]), 4)).length).toBe(4)
  })

  it('stops reading and cancels as soon as the limit is passed, even for an endless body', async () => {
    let pulls = 0
    let cancelled = false
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(4))
      },
      cancel() {
        cancelled = true
      }
    })

    await expect(readBodyWithLimit(endless, 10)).rejects.toThrow('size limit')

    expect(cancelled).toBe(true)
    // A streaming stream may pre-pull a little; what matters is that it stops.
    expect(pulls).toBeLessThan(10)
  })
})

describe('findCoverFileName', () => {
  it('matches only exact <appId>.<known extension> names', () => {
    const files = new Set(['10.webp', '20.gif', '30.jpg.tmp', '40'])
    expect(findCoverFileName('10', files)).toBe('10.webp')
    expect(findCoverFileName('20', files)).toBeNull()
    expect(findCoverFileName('30', files)).toBeNull()
    expect(findCoverFileName('40', files)).toBeNull()
  })
})

describe('isAnimatedImage', () => {
  it('treats a plain PNG, JPEG and simple WebP as still images', () => {
    expect(isAnimatedImage(pngWithChunks(['IHDR', 13], ['IDAT', 4], ['IEND', 0]))).toBe(false)
    expect(isAnimatedImage(JPEG)).toBe(false)
    expect(isAnimatedImage(WEBP)).toBe(false)
  })

  it('detects an animated PNG by its acTL chunk before the image data', () => {
    expect(isAnimatedImage(pngWithChunks(['IHDR', 13], ['acTL', 8], ['IDAT', 4]))).toBe(true)
  })

  it('ignores an acTL chunk that only appears after the image data', () => {
    expect(isAnimatedImage(pngWithChunks(['IHDR', 13], ['IDAT', 4], ['acTL', 8]))).toBe(false)
  })

  it('stops on a corrupt chunk length instead of looping', () => {
    const png = pngWithChunks(['IHDR', 13])
    png.set([0xff, 0xff, 0xff, 0xff], 8)
    expect(isAnimatedImage(png)).toBe(false)
  })

  it('detects an animated WebP by the VP8X animation flag', () => {
    expect(isAnimatedImage(webpVp8x(0x02))).toBe(true)
    expect(isAnimatedImage(webpVp8x(0x10))).toBe(false)
  })
})

describe('isValidCoverId', () => {
  it.each(['CON', 'nul', 'Aux', 'PRN', 'COM1', 'lpt9'])(
    'refuses the Windows device name %s',
    (id) => {
      expect(isValidCoverId('epic', id)).toBe(false)
    }
  )

  it('still accepts names that only start like a device', () => {
    expect(isValidCoverId('epic', 'Console')).toBe(true)
    expect(isValidCoverId('epic', 'COM10x')).toBe(true)
  })
})

describe('coverIdFromFileName', () => {
  it('returns the id of a finished cover file', () => {
    expect(coverIdFromFileName('steam', '10.jpg')).toBe('10')
    expect(coverIdFromFileName('epic', 'Sugar.png')).toBe('Sugar')
  })

  it.each([
    ['steam', 'Sugar.png'],
    ['epic', 'Sugar.png.tmp'],
    ['epic', 'Sugar.gif'],
    ['epic', '.png'],
    ['epic', 'noextension'],
    ['epic', 'a.b.png']
  ] as const)('returns null for %s file %s', (store, name) => {
    expect(coverIdFromFileName(store, name)).toBeNull()
  })
})

describe('coverUrlFor', () => {
  it('builds the same Steam URL the Steam cover cache and renderer use', () => {
    // cover-cache.ts and the renderer build Steam URLs from COVER_URL_PREFIX;
    // the protocol parses them with the STORES table. They must not drift.
    expect(coverUrlFor('steam', '10')).toBe(`${COVER_URL_PREFIX}10`)
    expect(parseCoverRequest(`${COVER_URL_PREFIX}10`)).toEqual({ store: 'steam', id: '10' })
  })

  it("builds each store's URL", () => {
    expect(coverUrlFor('steam', '10')).toBe('app-cover://covers/10')
    expect(coverUrlFor('epic', 'Sugar')).toBe('app-cover://epic/Sugar')
  })
})

describe('parseCoverRequest', () => {
  it('reads a Steam request', () => {
    expect(parseCoverRequest('app-cover://covers/10')).toEqual({ store: 'steam', id: '10' })
  })

  it("reads an Epic request and keeps the AppName's case", () => {
    expect(parseCoverRequest('app-cover://epic/Sugar')).toEqual({ store: 'epic', id: 'Sugar' })
    expect(parseCoverRequest('app-cover://epic/7786b355a13b47a6b3915335117cd0b2')).toEqual({
      store: 'epic',
      id: '7786b355a13b47a6b3915335117cd0b2'
    })
  })

  it('only ever resolves a normalized ..-path to an id inside the folder', () => {
    // The URL parser collapses this to "/10". That is still a legitimate
    // cover id; the file name is rebuilt from it, so nothing outside the
    // covers folder can be named.
    expect(parseCoverRequest('app-cover://covers/%2e%2e/10')).toEqual({ store: 'steam', id: '10' })
  })

  it.each([
    ['a different host', 'app-cover://other/10'],
    ['a different scheme', 'https://covers/10'],
    ['a non-numeric Steam id', 'app-cover://covers/abc'],
    ['a file name instead of an id', 'app-cover://covers/10.jpg'],
    ['an Epic file name instead of an id', 'app-cover://epic/Sugar.png'],
    ['a nested path', 'app-cover://covers/10/extra'],
    ['a nested Epic path', 'app-cover://epic/Sugar/extra'],
    ['a traversal attempt', 'app-cover://covers/..%2F..%2Fsecrets'],
    ['an Epic traversal attempt', 'app-cover://epic/..%2Fcovers%2F10'],
    ['an encoded traversal out of the folder', 'app-cover://covers/%2e%2e/%2e%2e/etc/passwd'],
    ['a query-only trick', 'app-cover://covers/?/10'],
    ['no path', 'app-cover://covers'],
    ['an empty Epic id', 'app-cover://epic/'],
    ['garbage', 'not a url']
  ])('returns null for %s', (_label, url) => {
    expect(parseCoverRequest(url)).toBeNull()
  })
})
