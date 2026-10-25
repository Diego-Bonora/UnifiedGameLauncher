// A tag release (docs/features/release.md, section 7): the checks and the
// upload, run by scripts/release.mjs. CI runs `before` in the build job,
// ahead of the build, and `publish` in the publish job, which checks again,
// uploads the build's three files to a draft release and confirms the draft
// holds them. The publish job installs no dependencies: it is the only one
// with a write token, so no package's code ever runs where that token
// exists. That is why this uploads by itself rather than through
// electron-builder, and imports nothing at all.

// Plain X.Y.Z only. A suffix such as -rc.1 makes electron-updater treat the
// release as a prerelease channel, which v1 doesn't have.
const PLAIN_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function tagProblem(tag, version) {
  if (!PLAIN_VERSION.test(version)) {
    return `app/package.json's version "${version}" isn't a plain X.Y.Z version.`
  }
  if (tag !== `v${version}`) {
    return `The tag "${tag}" doesn't match app/package.json's version (expected "v${version}").`
  }
  return null
}

// electron-builder (and so electron-updater's view of releases) treats a
// release as the same one when its tag is either "v1.2.3" or "1.2.3", so both
// count here too.
function sameTag(release, version) {
  return release.tag_name === `v${version}` || release.tag_name === version
}

export function publishedReleaseFor(releases, version) {
  return releases.find((release) => !release.draft && sameTag(release, version))
}

// latest.yml is the file installed copies read; its `path` names the
// installer it describes, so the expected file names come from the build
// itself rather than from a copy of the artifactName pattern.
export function expectedFiles(latestYml, version) {
  const path = /^path: (.+)$/m.exec(latestYml)?.[1]
  const builtVersion = /^version: (.+)$/m.exec(latestYml)?.[1]
  if (path === undefined || builtVersion === undefined) {
    throw new Error('latest.yml has no `path` or `version` line.')
  }
  if (builtVersion !== version) {
    throw new Error(`latest.yml is for version ${builtVersion}, not ${version}.`)
  }
  // The name is joined to the artifact folder and read by the job that holds
  // the write token, so it must be a bare installer name: no folders, no "..".
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*-setup\.exe$/.test(path)) {
    throw new Error(`latest.yml names "${path}", which isn't a plain installer file name.`)
  }
  return ['latest.yml', path, `${path}.blockmap`]
}

// `files` maps each expected name to its local size. Every problem is
// reported, not only the first.
export function draftsFor(releases, version) {
  return releases.filter((release) => release.draft && sameTag(release, version))
}

// With two drafts the one the user would publish may be the empty one.
function tooManyDrafts(count, version) {
  return `There are ${count} drafts for v${version}. Delete the extras and push the tag again.`
}

export function draftProblems(releases, version, files) {
  const drafts = draftsFor(releases, version)
  if (drafts.length === 0) return [`No draft release for v${version} was found.`]
  if (drafts.length > 1) return [tooManyDrafts(drafts.length, version)]
  const problems = []
  for (const [name, size] of Object.entries(files)) {
    const asset = drafts[0].assets.find((candidate) => candidate.name === name)
    if (asset === undefined) problems.push(`${name} is missing from the draft.`)
    else if (asset.state !== 'uploaded') problems.push(`${name} is "${asset.state}", not uploaded.`)
    else if (asset.size !== size) {
      problems.push(`${name} is ${asset.size} bytes on GitHub but ${size} bytes in the build.`)
    }
  }
  return problems
}

// A GitHub Actions re-run keeps the commit of the original run. After the
// user re-tags a fixed commit, re-running the old failed run would otherwise
// overwrite the new draft's files with the old build.
export function commitProblem(tag, tagSha, runSha) {
  if (tagSha === null) return `The tag ${tag} no longer points at a commit.`
  if (tagSha !== runSha) {
    return `The tag ${tag} now points at ${tagSha.slice(0, 7)}, not at this run's commit ${runSha.slice(0, 7)}. Don't re-run an old run; push the tag again.`
  }
  return null
}

// Our own time limits, so a stalled request fails instead of holding the
// runner until GitHub's six-hour cap. An upload carries the ~90 MB installer.
const REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 10 * 60_000
const ATTEMPTS = 3
const RETRY_DELAY_MS = 5_000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// fetch's own message is often just "fetch failed"; the reason is in `cause`.
export function explain(error) {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? (error.cause.code ?? error.cause.message) : undefined
  return cause === undefined ? error.message : `${error.message} (${cause})`
}

// One request to the GitHub API. `target` is an API path, or a full URL for
// uploads (a different host). Network errors, timeouts and 5xx answers are
// tried again, so a hiccup right after a long build doesn't turn a good
// release red. 404 and empty answers give null; any other answer fails at
// once. Errors name the request, never the token.
export async function githubRequest(
  target,
  token,
  {
    method = 'GET',
    body,
    timeoutMs = REQUEST_TIMEOUT_MS,
    attempts = ATTEMPTS,
    fetchImpl = fetch,
    delayMs = RETRY_DELAY_MS
  } = {}
) {
  const url = target.startsWith('/') ? `https://api.github.com${target}` : target
  const label = `${method} ${new URL(url).pathname}`
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28'
  }
  let payload
  if (body instanceof Uint8Array) {
    headers['content-type'] = 'application/octet-stream'
    payload = body
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await wait(delayMs)
    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (response.status === 404 || response.status === 204) return null
      if (response.ok) return await response.json()
      lastError = `GitHub answered ${response.status}`
      if (response.status < 500) break
    } catch (error) {
      lastError = explain(error)
    }
  }
  throw new Error(`${label} failed after ${attempts > 1 ? 'retries' : 'one try'}: ${lastError}.`)
}

// An annotated tag's ref points at a tag object, which points at the commit.
export async function tagCommit(get, repository, tag) {
  const ref = await get(`/repos/${repository}/git/ref/tags/${tag}`)
  if (ref === null) return null
  if (ref.object.type === 'commit') return ref.object.sha
  if (ref.object.type !== 'tag') return null
  const tagObject = await get(`/repos/${repository}/git/tags/${ref.object.sha}`)
  return tagObject?.object.type === 'commit' ? tagObject.object.sha : null
}

async function listReleases(get, repository) {
  const releases = []
  for (let page = 1; ; page += 1) {
    const batch = await get(`/repos/${repository}/releases?per_page=100&page=${page}`)
    if (batch === null) throw new Error(`GitHub can't find the repository ${repository}.`)
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
}

// Uploads one file to the draft. A same-named file already there (from an
// earlier run for this tag, or an attempt that broke off halfway) is deleted
// first, since GitHub refuses a second one. The upload itself is tried once
// per attempt here, not inside githubRequest, so each retry starts from that
// clean slate.
export async function uploadAsset(
  request,
  repository,
  release,
  name,
  bytes,
  delayMs = RETRY_DELAY_MS
) {
  const assetsPath = `/repos/${repository}/releases/${release.id}/assets?per_page=100`
  const uploadUrl = `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`
  let lastError
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    if (attempt > 1) await wait(delayMs)
    const existing = (await request(assetsPath)) ?? []
    for (const asset of existing.filter((candidate) => candidate.name === name)) {
      await request(`/repos/${repository}/releases/assets/${asset.id}`, { method: 'DELETE' })
    }
    try {
      return await request(uploadUrl, {
        method: 'POST',
        body: bytes,
        timeoutMs: UPLOAD_TIMEOUT_MS,
        attempts: 1
      })
    } catch (error) {
      lastError = error
      console.log(`Upload of ${name} failed (${explain(error)}); trying again.`)
    }
  }
  throw lastError
}

// The whole of one step, with GitHub and the downloaded files passed in so
// tests can run it against a fake. Returns the problems found (empty when the
// step passed); a request that keeps failing throws instead.
// `readDist(name)` returns a file from the build job's artifact.
export async function runStep(
  step,
  {
    version,
    tag,
    repository,
    runSha,
    request,
    readDist,
    log = console.log,
    delayMs = RETRY_DELAY_MS
  }
) {
  const get = (path) => request(path)

  // Run in both steps: the tag can move, or a release be published, while
  // the build runs.
  const problem = tagProblem(tag, version)
  if (problem !== null) return [problem]
  const moved = commitProblem(tag, await tagCommit(get, repository, tag), runSha)
  if (moved !== null) return [moved]
  const releases = await listReleases(get, repository)
  const published = publishedReleaseFor(releases, version)
  if (published !== undefined) {
    return [
      `Release ${published.tag_name} is already published. Bump the version for a new release.`
    ]
  }
  if (step === 'before') {
    log(`Tag ${tag} matches the version and this commit; no published release has it.`)
    return []
  }

  // Each file is read once, so the latest.yml that was checked is the one
  // uploaded.
  const latestYml = readDist('latest.yml')
  const names = expectedFiles(new TextDecoder().decode(latestYml), version)
  const bytes = Object.fromEntries(
    names.map((name) => [name, name === 'latest.yml' ? latestYml : readDist(name)])
  )

  const drafts = draftsFor(releases, version)
  // A draft under the other spelling ("0.9.0" for "v0.9.0") has a tag that
  // doesn't exist; publishing it would make GitHub create that tag at the
  // default branch's newest commit, not the commit that was built.
  const otherSpelling = drafts.find((release) => release.tag_name !== tag)
  if (otherSpelling !== undefined) {
    return [`A draft for tag "${otherSpelling.tag_name}" exists. Delete it and push ${tag} again.`]
  }
  if (drafts.length > 1) return [tooManyDrafts(drafts.length, version)]
  // Created once, never retried: a retry after a lost answer would make a
  // second draft. A draft left by an earlier run for this tag is reused.
  const draft =
    drafts[0] ??
    (await request(`/repos/${repository}/releases`, {
      method: 'POST',
      body: { tag_name: tag, name: version, draft: true },
      attempts: 1
    }))
  if (typeof draft?.id !== 'number') {
    throw new Error(`GitHub didn't return the new draft release for ${tag}.`)
  }
  for (const name of names) {
    await uploadAsset(request, repository, draft, name, bytes[name], delayMs)
    log(`Uploaded ${name}.`)
  }

  // The release list can lag a few seconds behind the last upload.
  const sizes = Object.fromEntries(names.map((name) => [name, bytes[name].length]))
  let problems = []
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    problems = draftProblems(await listReleases(get, repository), version, sizes)
    if (problems.length === 0) break
    if (attempt < ATTEMPTS) await wait(delayMs)
  }
  if (problems.length === 0) {
    log(`The draft for ${tag} holds ${names.join(', ')}. Review and publish it by hand.`)
  }
  return problems
}
