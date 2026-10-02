import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/nonexistent' },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }
}))

import { handleCoverRequest, type CoverProtocolDeps } from './cover-protocol'

// Each store has its own folder; Steam's files are given as plain names,
// Epic's under the `epic` key.
function fakeDeps(
  files: string[],
  contents = 'image-bytes',
  epicFiles: string[] = []
): CoverProtocolDeps {
  return {
    listFiles: async (store) => (store === 'epic' ? epicFiles : files),
    readFile: vi.fn(async () => new Response(contents, { status: 200 }))
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('handleCoverRequest', () => {
  it('serves a cached cover', async () => {
    const deps = fakeDeps(['10.jpg'])

    const response = await handleCoverRequest('app-cover://covers/10', deps)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('image-bytes')
    expect(deps.readFile).toHaveBeenCalledWith('steam', '10.jpg')
  })

  it('serves an Epic cover from the Epic folder', async () => {
    const deps = fakeDeps([], 'epic-bytes', ['Sugar.png'])

    const response = await handleCoverRequest('app-cover://epic/Sugar', deps)

    expect(response.status).toBe(200)
    expect(deps.readFile).toHaveBeenCalledWith('epic', 'Sugar.png')
  })

  it('never serves a Steam cover through an Epic URL, or the other way round', async () => {
    const deps = fakeDeps(['10.jpg'], 'image-bytes', ['Sugar.png'])

    expect((await handleCoverRequest('app-cover://epic/10', deps)).status).toBe(404)
    expect((await handleCoverRequest('app-cover://covers/Sugar', deps)).status).toBe(404)
    expect(deps.readFile).not.toHaveBeenCalled()
  })

  it('returns 404 for a cover that is not cached', async () => {
    const deps = fakeDeps(['10.jpg'])

    const response = await handleCoverRequest('app-cover://covers/999', deps)

    expect(response.status).toBe(404)
    expect(deps.readFile).not.toHaveBeenCalled()
  })

  it.each([
    'app-cover://other/10',
    'app-cover://covers/../secret',
    'app-cover://covers/10.jpg',
    'app-cover://epic/Sugar.png',
    'app-cover://epic/..%2Fcovers%2F10',
    'not a url'
  ])('returns 404 without reading any file for %s', async (url) => {
    const deps = fakeDeps(['10.jpg'])

    const response = await handleCoverRequest(url, deps)

    expect(response.status).toBe(404)
    expect(deps.readFile).not.toHaveBeenCalled()
  })

  it('returns 404 instead of rejecting when the file vanishes after the listing', async () => {
    const deps = fakeDeps(['10.jpg'])
    deps.readFile = async () => {
      throw new Error('ENOENT')
    }

    const response = await handleCoverRequest('app-cover://covers/10', deps)

    expect(response.status).toBe(404)
  })

  it('returns 404 instead of rejecting when the folder cannot be listed', async () => {
    const deps = fakeDeps([])
    deps.listFiles = async () => {
      throw new Error('EACCES')
    }

    const response = await handleCoverRequest('app-cover://covers/10', deps)

    expect(response.status).toBe(404)
  })
})
