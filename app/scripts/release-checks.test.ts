import { describe, expect, it, vi } from 'vitest'
import {
  commitProblem,
  draftProblems,
  expectedFiles,
  githubRequest,
  publishedReleaseFor,
  runStep,
  tagCommit,
  tagProblem,
  uploadAsset,
  type Release,
  type ReleaseAsset
} from './release-checks.mjs'

// latest.yml exactly as electron-builder 26 wrote it for a local NSIS build.
const LATEST_YML = `version: 0.1.0
files:
  - url: UnifiedGameLauncher-0.1.0-setup.exe
    sha512: fkb/quJiYbKy99rWwkp19RwojPLDci5bblx2sdwHnL0qEzok9f09vfsBWo3F3aYsjfa4eCfQzvsAeZTwT2et2g==
    size: 89639711
path: UnifiedGameLauncher-0.1.0-setup.exe
sha512: fkb/quJiYbKy99rWwkp19RwojPLDci5bblx2sdwHnL0qEzok9f09vfsBWo3F3aYsjfa4eCfQzvsAeZTwT2et2g==
releaseDate: '2026-10-25T00:35:32.816Z'
`

const FILES = {
  'latest.yml': 366,
  'UnifiedGameLauncher-0.1.0-setup.exe': 89639711,
  'UnifiedGameLauncher-0.1.0-setup.exe.blockmap': 96144
}

function release(tag: string, draft: boolean, assets = Object.entries(FILES)): Release {
  return {
    tag_name: tag,
    draft,
    assets: assets.map(([name, size]) => ({ name, size, state: 'uploaded' }))
  }
}

describe('tagProblem', () => {
  it('accepts v plus the package version', () => {
    expect(tagProblem('v0.9.0', '0.9.0')).toBeNull()
  })

  it('refuses a tag for another version', () => {
    expect(tagProblem('v0.9.1', '0.9.0')).toContain('expected "v0.9.0"')
  })

  it('refuses a tag without the v', () => {
    expect(tagProblem('0.9.0', '0.9.0')).toContain('expected "v0.9.0"')
  })

  it('refuses prerelease and other non-plain versions, even with a matching tag', () => {
    for (const version of ['0.9.0-rc.1', '0.9', '01.0.0', '1.0.0+build']) {
      expect(tagProblem(`v${version}`, version)).toContain("isn't a plain X.Y.Z")
    }
  })
})

describe('publishedReleaseFor', () => {
  it('finds a published release under either tag spelling', () => {
    expect(publishedReleaseFor([release('v0.9.0', false)], '0.9.0')).toBeDefined()
    expect(publishedReleaseFor([release('0.9.0', false)], '0.9.0')).toBeDefined()
  })

  it('ignores drafts and other versions', () => {
    const releases = [release('v0.9.0', true), release('v0.9.1', false)]
    expect(publishedReleaseFor(releases, '0.9.0')).toBeUndefined()
  })
})

describe('expectedFiles', () => {
  it('names latest.yml, the installer and its blockmap from the real file', () => {
    expect(expectedFiles(LATEST_YML, '0.1.0')).toEqual(Object.keys(FILES))
  })

  it('refuses a latest.yml for another version', () => {
    expect(() => expectedFiles(LATEST_YML, '0.9.0')).toThrow('for version 0.1.0')
  })

  it('refuses a path that is not a bare installer name', () => {
    for (const path of [
      '../../proc/self/environ',
      'sub/App-0.1.0-setup.exe',
      '..-setup.exe',
      'App.zip'
    ]) {
      const yml = LATEST_YML.replace('path: UnifiedGameLauncher-0.1.0-setup.exe', `path: ${path}`)
      expect(() => expectedFiles(yml, '0.1.0')).toThrow("isn't a plain installer file name")
    }
  })

  it('refuses a latest.yml without a path', () => {
    expect(() => expectedFiles('version: 0.1.0\n', '0.1.0')).toThrow('no `path`')
  })
})

describe('draftProblems', () => {
  it('passes when the one draft holds every file at its built size', () => {
    const releases = [release('v0.1.0', true), release('v0.0.9', false, [])]
    expect(draftProblems(releases, '0.1.0', FILES)).toEqual([])
  })

  it('reports a missing draft, even when a published release has the tag', () => {
    expect(draftProblems([release('v0.1.0', false)], '0.1.0', FILES)).toEqual([
      'No draft release for v0.1.0 was found.'
    ])
  })

  it('refuses two drafts for the same version', () => {
    const releases = [release('v0.1.0', true), release('0.1.0', true, [])]
    expect(draftProblems(releases, '0.1.0', FILES)[0]).toContain('2 drafts')
  })

  it('reports every missing, unfinished or wrong-sized file', () => {
    const draft: Release = {
      tag_name: 'v0.1.0',
      draft: true,
      assets: [
        { name: 'latest.yml', size: 366, state: 'starter' },
        { name: 'UnifiedGameLauncher-0.1.0-setup.exe', size: 5, state: 'uploaded' }
      ]
    }
    expect(draftProblems([draft], '0.1.0', FILES)).toEqual([
      'latest.yml is "starter", not uploaded.',
      'UnifiedGameLauncher-0.1.0-setup.exe is 5 bytes on GitHub but 89639711 bytes in the build.',
      'UnifiedGameLauncher-0.1.0-setup.exe.blockmap is missing from the draft.'
    ])
  })
})

const TAG_SHA = 'aaaaaaa1111111111111111111111111111111111'
const RUN_SHA = 'bbbbbbb2222222222222222222222222222222222'

describe('commitProblem', () => {
  it('passes when the tag points at the run commit', () => {
    expect(commitProblem('v0.9.0', TAG_SHA, TAG_SHA)).toBeNull()
  })

  it('refuses a run whose commit the tag no longer points at', () => {
    expect(commitProblem('v0.9.0', TAG_SHA, RUN_SHA)).toContain('now points at aaaaaaa')
  })

  it('refuses a tag that is gone', () => {
    expect(commitProblem('v0.9.0', null, RUN_SHA)).toContain('no longer points at a commit')
  })
})

describe('tagCommit', () => {
  function getFrom(answers: Record<string, unknown>) {
    return async (path: string) => answers[path] ?? null
  }

  it('reads a lightweight tag straight from its ref', async () => {
    const get = getFrom({
      '/repos/o/r/git/ref/tags/v0.9.0': { object: { type: 'commit', sha: TAG_SHA } }
    })
    expect(await tagCommit(get, 'o/r', 'v0.9.0')).toBe(TAG_SHA)
  })

  it('follows an annotated tag to its commit', async () => {
    const get = getFrom({
      '/repos/o/r/git/ref/tags/v0.9.0': { object: { type: 'tag', sha: 'tagobject' } },
      '/repos/o/r/git/tags/tagobject': { object: { type: 'commit', sha: TAG_SHA } }
    })
    expect(await tagCommit(get, 'o/r', 'v0.9.0')).toBe(TAG_SHA)
  })

  it('answers null for a missing tag', async () => {
    expect(await tagCommit(getFrom({}), 'o/r', 'v0.9.0')).toBeNull()
  })
})

describe('githubRequest', () => {
  const answer = (status: number, body: unknown = {}): Response =>
    new Response(status === 204 ? null : JSON.stringify(body), { status })

  it('tries again after a network error and a 5xx', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(answer(502))
      .mockResolvedValueOnce(answer(200, [1]))
    expect(await githubRequest('/x', 't', { fetchImpl, delayMs: 0 })).toEqual([1])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('names the request and the network cause when it gives up, never the token', async () => {
    const error = new TypeError('fetch failed', {
      cause: Object.assign(new Error('x'), { code: 'ECONNRESET' })
    })
    const fetchImpl = vi.fn().mockRejectedValue(error)
    const request = githubRequest('/repos/o/r/releases?page=1', 'secret', { fetchImpl, delayMs: 0 })
    await expect(request).rejects.toThrow(
      'GET /repos/o/r/releases failed after retries: fetch failed (ECONNRESET).'
    )
    await expect(request).rejects.not.toThrow('secret')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('gives up after three 5xx answers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer(503))
    await expect(githubRequest('/x', 't', { fetchImpl, delayMs: 0 })).rejects.toThrow(
      'GitHub answered 503'
    )
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('answers null for 404 and 204, and fails a 401 at once', async () => {
    const notFound = vi.fn().mockResolvedValue(answer(404))
    expect(await githubRequest('/x', 't', { fetchImpl: notFound, delayMs: 0 })).toBeNull()
    const noContent = vi.fn().mockResolvedValue(answer(204))
    expect(await githubRequest('/x', 't', { fetchImpl: noContent, method: 'DELETE' })).toBeNull()
    const rejected = vi.fn().mockResolvedValue(answer(401))
    await expect(githubRequest('/x', 't', { fetchImpl: rejected, delayMs: 0 })).rejects.toThrow(
      'GitHub answered 401'
    )
    expect(rejected).toHaveBeenCalledTimes(1)
  })

  it('sends the token, JSON bodies as JSON and bytes as octet-stream to a full URL', async () => {
    // A fresh answer per call: a Response body can only be read once.
    const fetchImpl = vi.fn<typeof fetch>(async () => answer(201))
    await githubRequest('/repos/o/r/releases', 'secret', {
      fetchImpl,
      method: 'POST',
      body: { draft: true }
    })
    await githubRequest('https://uploads.github.com/u?name=a', 'secret', {
      fetchImpl,
      method: 'POST',
      body: new Uint8Array([1, 2])
    })
    type Sent = { headers: Record<string, string>; body: unknown }
    const [jsonUrl, json] = fetchImpl.mock.calls[0] as [string, Sent]
    const [bytesUrl, bytes] = fetchImpl.mock.calls[1] as [string, Sent]
    expect(jsonUrl).toBe('https://api.github.com/repos/o/r/releases')
    expect(json.headers.authorization).toBe('Bearer secret')
    expect(json.headers['content-type']).toBe('application/json')
    expect(json.body).toBe('{"draft":true}')
    expect(bytesUrl).toBe('https://uploads.github.com/u?name=a')
    expect(bytes.headers['content-type']).toBe('application/octet-stream')
    expect(bytes.body).toEqual(new Uint8Array([1, 2]))
  })
})

type Request = (
  target: string,
  options?: { method?: string; attempts?: number }
) => Promise<unknown>

describe('uploadAsset', () => {
  const ASSETS = '/repos/o/r/releases/7/assets?per_page=100'
  const UPLOAD = 'https://uploads.github.com/repos/o/r/releases/7/assets?name=latest.yml'

  it('deletes a same-named file left by an earlier run, then uploads once', async () => {
    const request = vi.fn<Request>(async (target) =>
      target === ASSETS
        ? [
            { id: 1, name: 'latest.yml' },
            { id: 2, name: 'other.exe' }
          ]
        : null
    )
    await uploadAsset(request, 'o/r', { id: 7 }, 'latest.yml', new Uint8Array([1]), 0)
    expect(request.mock.calls.map(([target, options]) => [target, options?.method])).toEqual([
      [ASSETS, undefined],
      ['/repos/o/r/releases/assets/1', 'DELETE'],
      [UPLOAD, 'POST']
    ])
    expect(request.mock.calls[2]?.[1]).toMatchObject({ attempts: 1 })
  })

  it('after a failed upload, deletes the half-uploaded file before trying again', async () => {
    let uploads = 0
    const request = vi.fn<Request>(async (target) => {
      if (target === ASSETS) return uploads === 0 ? [] : [{ id: 9, name: 'latest.yml' }]
      if (target === UPLOAD && ++uploads === 1) throw new Error('POST failed')
      return { id: 10 }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(
      await uploadAsset(request, 'o/r', { id: 7 }, 'latest.yml', new Uint8Array([1]), 0)
    ).toEqual({
      id: 10
    })
    expect(request.mock.calls.map(([target]) => target)).toEqual([
      ASSETS,
      UPLOAD,
      ASSETS,
      '/repos/o/r/releases/assets/9',
      UPLOAD
    ])
  })

  it('gives up after three failed uploads with the last error', async () => {
    const request = vi.fn<Request>(async (target) => {
      if (target === UPLOAD) throw new Error('POST failed')
      return []
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(
      uploadAsset(request, 'o/r', { id: 7 }, 'latest.yml', new Uint8Array([1]), 0)
    ).rejects.toThrow('POST failed')
    expect(request.mock.calls.filter(([target]) => target === UPLOAD)).toHaveLength(3)
  })
})

// A small in-memory GitHub: the tag ref, the release list (paged, with
// drafts) and the asset endpoints. Like the real one, asset ids are unique
// and stable, a delete removes exactly that asset, and a second file with
// the same name is refused with 422. Every call is recorded so a test can
// check what was and wasn't done.
interface FakeRelease extends Release {
  id: number
  name?: string
}
interface FakeOptions {
  method?: string
  body?: unknown
  attempts?: number
}
interface Call {
  method: string
  target: string
  options: FakeOptions
}
interface FakeGitHub {
  request: (target: string, options?: object) => Promise<unknown>
  calls: Call[]
  releases: FakeRelease[]
  uploads: () => Call[]
  creates: () => Call[]
  listings: () => Call[]
}

function fakeGitHub({
  tagSha = RUN_SHA as string | null,
  releases = [] as FakeRelease[],
  createAnswer = undefined as unknown,
  uploadsLand = true
} = {}): FakeGitHub {
  let nextReleaseId = 100
  let nextAssetId = 1000
  for (const release of releases) {
    for (const asset of release.assets) asset.id ??= nextAssetId++
  }
  const calls: Call[] = []
  const request = async (target: string, rawOptions: object = {}): Promise<unknown> => {
    const options = rawOptions as FakeOptions
    const method = options.method ?? 'GET'
    calls.push({ method, target, options })
    const url = new URL(target, 'https://api.github.com')
    const path = url.pathname
    if (path === '/repos/o/r/git/ref/tags/v0.1.0') {
      return tagSha === null ? null : { object: { type: 'commit', sha: tagSha } }
    }
    if (path === '/repos/o/r/releases' && method === 'GET') {
      const perPage = Number(url.searchParams.get('per_page') ?? 30)
      const page = Number(url.searchParams.get('page') ?? 1)
      return structuredClone(releases.slice((page - 1) * perPage, page * perPage))
    }
    if (path === '/repos/o/r/releases' && method === 'POST') {
      if (createAnswer !== undefined) return createAnswer
      const body = options.body as { tag_name: string; name: string; draft: boolean }
      const release: FakeRelease = {
        id: nextReleaseId++,
        tag_name: body.tag_name,
        name: body.name,
        draft: body.draft,
        assets: []
      }
      releases.push(release)
      return structuredClone(release)
    }
    if (path.startsWith('/repos/o/r/releases/assets/') && method === 'DELETE') {
      const id = Number(path.split('/').pop())
      const owner = releases.find((release) => release.assets.some((asset) => asset.id === id))
      if (owner === undefined) return null
      owner.assets = owner.assets.filter((asset) => asset.id !== id)
      return null
    }
    const release = releases.find(
      (candidate) => path === `/repos/o/r/releases/${candidate.id}/assets`
    )
    if (release !== undefined && url.host === 'api.github.com' && method === 'GET') {
      return structuredClone(release.assets)
    }
    if (release !== undefined && url.host === 'uploads.github.com' && method === 'POST') {
      const name = url.searchParams.get('name') as string
      if (release.assets.some((asset) => asset.name === name)) {
        throw new Error(`POST ${path} failed after one try: GitHub answered 422.`)
      }
      const bytes = options.body as Uint8Array
      const asset = { id: nextAssetId++, name, size: bytes.length, state: 'uploaded' }
      if (uploadsLand) release.assets.push(asset)
      return asset
    }
    throw new Error(`unexpected ${method} ${target}`)
  }
  const uploads = (): Call[] =>
    calls.filter((call) => call.target.startsWith('https://uploads.github.com'))
  const creates = (): Call[] =>
    calls.filter((call) => call.method === 'POST' && call.target === '/repos/o/r/releases')
  const listings = (): Call[] =>
    calls.filter((call) => call.method === 'GET' && call.target.startsWith('/repos/o/r/releases?'))
  return { request, calls, releases, uploads, creates, listings }
}

const DIST: Record<string, Uint8Array> = {
  'latest.yml': new TextEncoder().encode(LATEST_YML),
  'UnifiedGameLauncher-0.1.0-setup.exe': new Uint8Array(5),
  'UnifiedGameLauncher-0.1.0-setup.exe.blockmap': new Uint8Array(3)
}

type Step = Parameters<typeof runStep>[0]
type Context = Parameters<typeof runStep>[1]

function context(github: FakeGitHub, step: Step = 'publish'): [Step, Context] {
  return [
    step,
    {
      version: '0.1.0',
      tag: 'v0.1.0',
      repository: 'o/r',
      runSha: RUN_SHA,
      request: github.request,
      readDist: (name: string) => {
        const bytes = DIST[name]
        if (bytes === undefined) throw new Error(`no ${name} in dist`)
        return bytes
      },
      log: () => {},
      delayMs: 0
    }
  ]
}

function draft(id: number, tag = 'v0.1.0', assets: ReleaseAsset[] = []): FakeRelease {
  return { id, tag_name: tag, draft: true, assets }
}

function published(id: number, tag: string, assets: ReleaseAsset[] = []): FakeRelease {
  return { id, tag_name: tag, draft: false, assets }
}

describe('runStep', () => {
  it('before: passes without touching the build files', async () => {
    const github = fakeGitHub()
    const [step, ctx] = context(github, 'before')
    const readDist = vi.fn(ctx.readDist)
    expect(await runStep(step, { ...ctx, readDist })).toEqual([])
    expect(readDist).not.toHaveBeenCalled()
    expect(github.calls.every((call) => call.method === 'GET')).toBe(true)
  })

  it('before: refuses a published release, without touching the build files', async () => {
    const github = fakeGitHub({ releases: [published(7, 'v0.1.0')] })
    const [step, ctx] = context(github, 'before')
    const readDist = vi.fn(ctx.readDist)
    expect((await runStep(step, { ...ctx, readDist }))[0]).toContain('already published')
    expect(readDist).not.toHaveBeenCalled()
  })

  it('before: refuses a tag that points at another commit', async () => {
    const github = fakeGitHub({ tagSha: TAG_SHA })
    expect((await runStep(...context(github, 'before')))[0]).toContain('now points at')
  })

  it('publish: makes one draft, without retrying the create, and uploads all three files to it', async () => {
    const github = fakeGitHub()
    expect(await runStep(...context(github))).toEqual([])
    expect(github.creates()).toHaveLength(1)
    expect(github.creates()[0]?.options).toMatchObject({
      attempts: 1,
      body: { tag_name: 'v0.1.0', name: '0.1.0', draft: true }
    })
    expect(github.releases).toHaveLength(1)
    expect(github.releases[0]?.assets.map((asset) => [asset.name, asset.size])).toEqual([
      ['latest.yml', DIST['latest.yml']?.length],
      ['UnifiedGameLauncher-0.1.0-setup.exe', 5],
      ['UnifiedGameLauncher-0.1.0-setup.exe.blockmap', 3]
    ])
  })

  it('publish: reads each build file once, latest.yml included', async () => {
    const github = fakeGitHub()
    const [step, ctx] = context(github)
    const readDist = vi.fn(ctx.readDist)
    expect(await runStep(step, { ...ctx, readDist })).toEqual([])
    expect(readDist.mock.calls.map(([name]) => name).sort()).toEqual(Object.keys(DIST).sort())
  })

  it("publish: reuses an earlier run's draft, replacing its stale file and leaving other releases alone", async () => {
    const stale = { name: 'UnifiedGameLauncher-0.1.0-setup.exe', size: 1, state: 'uploaded' }
    const older = { name: 'latest.yml', size: 9, state: 'uploaded' }
    const github = fakeGitHub({
      releases: [published(6, 'v0.0.9', [older]), draft(7, 'v0.1.0', [stale])]
    })
    expect(await runStep(...context(github))).toEqual([])
    expect(github.creates()).toHaveLength(0)
    const installer = github.releases[1]?.assets.filter((asset) => asset.name === stale.name)
    expect(installer).toMatchObject([{ name: stale.name, size: 5 }])
    expect(github.releases[0]?.assets).toEqual([{ ...older, id: expect.any(Number) }])
  })

  it('publish: refuses a draft under the other tag spelling, uploading nothing', async () => {
    const github = fakeGitHub({ releases: [draft(7, '0.1.0')] })
    expect((await runStep(...context(github)))[0]).toBe(
      'A draft for tag "0.1.0" exists. Delete it and push v0.1.0 again.'
    )
    expect(github.uploads()).toHaveLength(0)
    expect(github.creates()).toHaveLength(0)
  })

  it('publish: refuses two drafts before uploading anything', async () => {
    const github = fakeGitHub({ releases: [draft(7), draft(8)] })
    expect((await runStep(...context(github)))[0]).toContain('2 drafts')
    expect(github.uploads()).toHaveLength(0)
  })

  it('publish: finds releases past the first page of 100', async () => {
    const others = Array.from({ length: 150 }, (_, index) => published(index + 1, `v0.0.${index}`))
    others.splice(120, 0, draft(500))
    const github = fakeGitHub({ releases: others })
    expect(await runStep(...context(github))).toEqual([])
    expect(github.creates()).toHaveLength(0)
    expect(github.releases[120]?.assets).toHaveLength(3)
    // Two pages for the checks, then two for the one poll that passes.
    expect(github.listings()).toHaveLength(4)
  })

  it('publish: a published release on page 2 still stops it', async () => {
    const others = Array.from({ length: 130 }, (_, index) => published(index + 1, `v0.0.${index}`))
    others.push(published(999, 'v0.1.0'))
    const github = fakeGitHub({ releases: others })
    expect((await runStep(...context(github)))[0]).toContain('already published')
    expect(github.uploads()).toHaveLength(0)
  })

  it('publish: checks again that no release is published, uploading nothing if one is', async () => {
    const github = fakeGitHub({ releases: [published(7, 'v0.1.0')] })
    expect((await runStep(...context(github)))[0]).toContain('already published')
    expect(github.uploads()).toHaveLength(0)
    expect(github.creates()).toHaveLength(0)
  })

  it('publish: checks again that the tag points at this commit, uploading nothing if it moved', async () => {
    const github = fakeGitHub({ tagSha: TAG_SHA })
    expect((await runStep(...context(github)))[0]).toContain('now points at')
    expect(github.uploads()).toHaveLength(0)
    expect(github.creates()).toHaveLength(0)
  })

  it('publish: refuses a tag for another version before any request', async () => {
    const github = fakeGitHub()
    const [step, ctx] = context(github)
    expect((await runStep(step, { ...ctx, tag: 'v0.2.0' }))[0]).toContain('expected "v0.1.0"')
    expect(github.calls).toHaveLength(0)
  })

  it('publish: a create answer without a release fails clearly, before uploading', async () => {
    const github = fakeGitHub({ createAnswer: null })
    await expect(runStep(...context(github))).rejects.toThrow(
      "GitHub didn't return the new draft release for v0.1.0."
    )
    expect(github.uploads()).toHaveLength(0)
  })

  it('publish: reports files that never showed up, after polling the draft three times', async () => {
    const github = fakeGitHub({ uploadsLand: false })
    const problems = await runStep(...context(github))
    expect(problems).toHaveLength(3)
    expect(problems[0]).toBe('latest.yml is missing from the draft.')
    // One listing for the checks, then three polls.
    expect(github.listings()).toHaveLength(4)
  })
})
