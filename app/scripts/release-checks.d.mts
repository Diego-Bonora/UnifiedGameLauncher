// Types for release-checks.mjs, which stays plain JavaScript so CI can run it
// with `node` before anything is installed or built. Kept by hand: nothing
// checks them against the .mjs, so change both together.
export interface ReleaseAsset {
  id?: number
  name: string
  state: string
  size: number
}
export interface Release {
  id?: number
  tag_name: string
  draft: boolean
  assets: ReleaseAsset[]
}
export function tagProblem(tag: string, version: string): string | null
export function publishedReleaseFor(releases: Release[], version: string): Release | undefined
export function expectedFiles(latestYml: string, version: string): string[]
export function commitProblem(tag: string, tagSha: string | null, runSha: string): string | null
export function githubRequest(
  target: string,
  token: string,
  options?: {
    method?: string
    body?: Uint8Array | object
    timeoutMs?: number
    attempts?: number
    fetchImpl?: typeof fetch
    delayMs?: number
  }
): Promise<unknown>
export function tagCommit(
  get: (path: string) => Promise<unknown>,
  repository: string,
  tag: string
): Promise<string | null>
export function draftsFor(releases: Release[], version: string): Release[]
export function uploadAsset(
  request: Request,
  repository: string,
  release: { id: number },
  name: string,
  bytes: Uint8Array,
  delayMs?: number
): Promise<unknown>
export function explain(error: unknown): string
export type Request = (target: string, options?: object) => Promise<unknown>
export function runStep(
  step: 'before' | 'publish',
  context: {
    version: string
    tag: string
    repository: string
    runSha: string
    request: Request
    readDist: (name: string) => Uint8Array
    log?: (message: string) => void
    delayMs?: number
  }
): Promise<string[]>
export function draftProblems(
  releases: Release[],
  version: string,
  files: Record<string, number>
): string[]
