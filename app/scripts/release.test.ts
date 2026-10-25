import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Runs the real command the way CI does. Only cases that stop before any
// request, so the test never reaches GitHub. What matters is the exit code:
// the command exists so that a failure can never pass silently.
function run(args: string[], env: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GITHUB_'))
  )
  return spawnSync(process.execPath, [join(import.meta.dirname, 'release.mjs'), ...args], {
    env: { ...clean, ...env },
    encoding: 'utf-8'
  })
}

const CI_ENV = {
  GITHUB_TOKEN: 'not-a-real-token',
  GITHUB_REPOSITORY: 'o/r',
  GITHUB_SHA: 'b'.repeat(40)
}

describe('release.mjs', () => {
  it('fails on a missing or unknown step', () => {
    for (const args of [[], ['after'], ['before', 'extra']]) {
      const result = run(args, CI_ENV)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('::error::Usage: node scripts/release.mjs before|publish')
    }
  })

  it('fails when GitHub Actions variables are missing', () => {
    const result = run(['before'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('::error::GITHUB_TOKEN is not set.')
  })

  it('fails on the problems a step reports, never printing the token', () => {
    const result = run(['before'], { ...CI_ENV, GITHUB_REF_NAME: 'not-a-version-tag' })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/::error::The tag "not-a-version-tag" doesn't match/)
    expect(`${result.stdout}${result.stderr}`).not.toContain('not-a-real-token')
  })
})
