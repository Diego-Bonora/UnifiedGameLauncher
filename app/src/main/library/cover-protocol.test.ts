import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/nonexistent' },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }
}))

import { handleCoverRequest, type CoverProtocolDeps } from './cover-protocol'

function fakeDeps(files: string[], contents = 'image-bytes'): CoverProtocolDeps {
  return {
    listFiles: async () => files,
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
    expect(deps.readFile).toHaveBeenCalledWith('10.jpg')
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
