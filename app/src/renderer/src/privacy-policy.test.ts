import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROJECT_URL } from '@shared/app-info'
import { PACKAGE_NAME, PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from './privacy-policy'

const appDir = join(__dirname, '..', '..', '..')

// Which service in "Who the app talks to" each host belongs to. A host main
// starts using that isn't here fails the test below: name it in the policy
// first, then add it here.
const HOST_SERVICES: Record<string, string> = {
  'api.steampowered.com': 'Steam',
  'store.steampowered.com': 'Steam',
  'steamcommunity.com': 'Steam',
  'shared.akamai.steamstatic.com': 'Steam',
  'www.steamgriddb.com': 'SteamGridDB'
}

// Strings in main that look like hosts but are never contacted.
const NOT_CONTACTED = new Set([
  // OpenID's namespace and identifier-select values, sent as text.
  'specs.openid.net',
  // The loopback server that catches the Steam sign-in, and the dev server.
  '127.0.0.1',
  'localhost'
])

function mainSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return mainSourceFiles(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function servicesInPolicy(): string[] {
  const section = PRIVACY_SECTIONS.find((s) => s.heading === 'Who the app talks to')
  return (section?.items ?? []).flatMap((item) =>
    typeof item === 'string' ? [] : [item.lead.replace(/:$/, '')]
  )
}

describe('privacy policy', () => {
  // Only hosts written out in full are seen: one built from parts, or sent
  // back by a service (image servers), still needs a reader's eye.
  it("names the service behind every literal host in main's code", () => {
    const hosts = new Set<string>()
    for (const file of mainSourceFiles(join(appDir, 'src', 'main'))) {
      // Comments may name made-up hosts (an example of a rejected URL).
      const code = readFileSync(file, 'utf-8').replace(/^\s*\/\/.*$/gm, '')
      for (const match of code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(match[1] ?? '')
    }
    expect(hosts.size).toBeGreaterThan(0)
    const services = servicesInPolicy()
    for (const host of hosts) {
      if (NOT_CONTACTED.has(host)) continue
      expect(HOST_SERVICES, `${host} is not mapped to a service`).toHaveProperty([host])
      expect(services).toContain(HOST_SERVICES[host])
    }
  })

  // Updates come from electron-builder.yml's publish block, not from a URL in
  // main's code, so the check above can't see them.
  it('names GitHub for updates, and updates come from this project only', () => {
    const config = readFileSync(join(appDir, 'electron-builder.yml'), 'utf-8')
    const publish = config.slice(config.indexOf('\npublish:'))
    const field = (name: string): string | undefined =>
      new RegExp(`^\\s+${name}:\\s*(\\S+)\\s*$`, 'm').exec(publish)?.[1]
    expect(field('provider')).toBe('github')
    expect(`https://github.com/${field('owner')}/${field('repo')}`).toBe(PROJECT_URL)
    expect(servicesInPolicy()).toContain('GitHub')
  })

  // The folder names in "Where it's kept" come from the package name; a
  // rename would make the policy point at folders that don't exist.
  it("uses package.json's name for the install folders", () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
    ) as { name: string }
    expect(PACKAGE_NAME).toBe(manifest.name)
  })

  it('has a real "Last updated" date', () => {
    expect(PRIVACY_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(PRIVACY_LAST_UPDATED))).toBe(false)
  })
})
