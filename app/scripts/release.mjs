// The command CI runs: `node scripts/release.mjs before|publish`. It reads
// GITHUB_REF_NAME (the tag), GITHUB_SHA, GITHUB_REPOSITORY and GITHUB_TOKEN,
// which GitHub Actions sets (the token is passed in by the workflow step),
// and runs one step of scripts/release-checks.mjs. Kept apart from that file
// so it runs unconditionally: a "was I started directly?" test that ever
// answered no would exit 0 having checked and uploaded nothing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { explain, githubRequest, runStep } from './release-checks.mjs'

// `::error::` lines show up as annotations on the workflow run.
function fail(problems) {
  for (const problem of problems) console.error(`::error::${problem}`)
  process.exit(1)
}

function requireEnv(name) {
  const value = process.env[name]
  if (value === undefined || value === '') fail([`${name} is not set.`])
  return value
}

const [step, ...rest] = process.argv.slice(2)
if ((step !== 'before' && step !== 'publish') || rest.length > 0) {
  fail(['Usage: node scripts/release.mjs before|publish'])
}
const appDir = join(import.meta.dirname, '..')
const token = requireEnv('GITHUB_TOKEN')

try {
  const problems = await runStep(step, {
    version: JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf-8')).version,
    tag: requireEnv('GITHUB_REF_NAME'),
    repository: requireEnv('GITHUB_REPOSITORY'),
    runSha: requireEnv('GITHUB_SHA'),
    request: (target, options) => githubRequest(target, token, options),
    // The build job's artifact, downloaded into dist/. expectedFiles only
    // lets bare file names through.
    readDist: (name) => readFileSync(join(appDir, 'dist', name))
  })
  if (problems.length > 0) fail(problems)
} catch (error) {
  fail([explain(error)])
}
