import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME, PRIVACY_LAST_UPDATED } from './privacy-policy'

describe('privacy policy', () => {
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
