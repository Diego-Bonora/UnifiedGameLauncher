import { describe, expect, it } from 'vitest'
import { clearSecret, getSecret, setSecret, type SecretStoreDeps } from './secret-store'

// A reversible fake "encryption" (base64 with a prefix) stands in for
// safeStorage: real DPAPI encryption isn't available under Vitest, and the
// logic under test (file shape, base64 framing, error handling) doesn't
// depend on the actual cipher.
function fakeDeps(options?: { initial?: string; encryptionAvailable?: boolean }): SecretStoreDeps {
  let content = options?.initial
  return {
    readFile: async () => {
      if (content === undefined) throw new Error('ENOENT: secrets.json')
      return content
    },
    writeFile: async (data) => {
      content = data
    },
    isEncryptionAvailable: () => options?.encryptionAvailable ?? true,
    encrypt: (plainText) => Buffer.from(`enc:${plainText}`, 'utf-8'),
    decrypt: (encrypted) => {
      const text = encrypted.toString('utf-8')
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext')
      return text.slice('enc:'.length)
    }
  }
}

describe('secret-store', () => {
  it('returns null for a key that was never saved', async () => {
    expect(await getSecret('steamApiKey', fakeDeps())).toBeNull()
  })

  it('returns null when the file does not exist', async () => {
    expect(await getSecret('steamApiKey', fakeDeps({ initial: undefined }))).toBeNull()
  })

  it('returns null when the file is corrupt JSON', async () => {
    expect(await getSecret('steamApiKey', fakeDeps({ initial: 'not json' }))).toBeNull()
  })

  it('round-trips a saved secret', async () => {
    const deps = fakeDeps()
    await setSecret('steamApiKey', 'ABCDEF0123456789ABCDEF0123456789', deps)
    expect(await getSecret('steamApiKey', deps)).toBe('ABCDEF0123456789ABCDEF0123456789')
  })

  it('never writes the plain value to disk', async () => {
    let written = ''
    const deps: SecretStoreDeps = {
      ...fakeDeps(),
      writeFile: async (data) => {
        written = data
      }
    }
    await setSecret('steamApiKey', 'ABCDEF0123456789ABCDEF0123456789', deps)
    expect(written).not.toContain('ABCDEF0123456789ABCDEF0123456789')
  })

  it('refuses to save when encryption is unavailable', async () => {
    const deps = fakeDeps({ encryptionAvailable: false })
    await expect(setSecret('steamApiKey', 'value', deps)).rejects.toThrow()
  })

  it('returns null instead of throwing when stored data fails to decrypt', async () => {
    const deps = fakeDeps({
      initial: JSON.stringify({ steamApiKey: Buffer.from('garbage').toString('base64') })
    })
    expect(await getSecret('steamApiKey', deps)).toBeNull()
  })

  it('clears a saved secret', async () => {
    const deps = fakeDeps()
    await setSecret('steamApiKey', 'value', deps)
    await clearSecret('steamApiKey', deps)
    expect(await getSecret('steamApiKey', deps)).toBeNull()
  })

  it('preserves other keys (e.g. a future epic token) when writing', async () => {
    let written = ''
    const deps: SecretStoreDeps = {
      ...fakeDeps({ initial: JSON.stringify({ epicToken: 'enc-epic' }) }),
      writeFile: async (data) => {
        written = data
      }
    }

    await setSecret('steamApiKey', 'value', deps)

    expect(JSON.parse(written)).toMatchObject({ epicToken: 'enc-epic' })
  })

  it('preserves another key even if its stored value is not a string', async () => {
    // A corrupted or unexpectedly-shaped OTHER secret must still round-trip
    // untouched — reading it as `unknown` (not filtering by type) is what
    // stops an unrelated setSecret/clearSecret call from silently deleting
    // it. getSecret's own type check is what makes reading it back safe.
    let written = ''
    const deps: SecretStoreDeps = {
      ...fakeDeps({ initial: JSON.stringify({ epicToken: { corrupted: true } }) }),
      writeFile: async (data) => {
        written = data
      }
    }

    await setSecret('steamApiKey', 'value', deps)

    expect(JSON.parse(written)).toMatchObject({ epicToken: { corrupted: true } })
  })

  it('serializes concurrent writes instead of interleaving their read-modify-write', async () => {
    const events: string[] = []
    let fileContent = '{}'
    const deps: SecretStoreDeps = {
      ...fakeDeps(),
      readFile: async () => {
        events.push('read-start')
        await new Promise((resolve) => setTimeout(resolve, 5))
        events.push('read-end')
        return fileContent
      },
      writeFile: async (data) => {
        events.push('write-start')
        await new Promise((resolve) => setTimeout(resolve, 5))
        fileContent = data
        events.push('write-end')
      }
    }

    await Promise.all([setSecret('steamApiKey', 'one', deps), setSecret('epicToken', 'two', deps)])

    expect(events).toEqual([
      'read-start',
      'read-end',
      'write-start',
      'write-end',
      'read-start',
      'read-end',
      'write-start',
      'write-end'
    ])
  })
})
