import { describe, expect, it } from 'vitest'
import { getSteamInstallPath } from './steam-registry'

// What `reg query` prints for a set value (shape from Microsoft's reg docs;
// not captured from a real PC).
const output = (path: string): string =>
  `\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    ${path}\r\n\r\n`

// Shaped like the error execFile rejects with: `code` is the exit code.
function exitedWith(code: number | string): Error {
  return Object.assign(new Error('Command failed: reg query'), { code })
}

describe('getSteamInstallPath', () => {
  it('reads SteamPath from the registry output', async () => {
    const path = await getSteamInstallPath(
      async () => output('c:/program files (x86)/steam'),
      'win32'
    )
    expect(path).toBe('c:/program files (x86)/steam')
  })

  it('means "Steam not installed" when reg exits with 1 (key or value missing)', async () => {
    await expect(
      getSteamInstallPath(async () => {
        throw exitedWith(1)
      }, 'win32')
    ).resolves.toBeNull()
  })

  it.each([exitedWith(5), exitedWith('ENOENT'), new Error('timed out')])(
    'throws when the registry could not be read at all (%s)',
    async (error) => {
      // Not null: that would read as "no Steam" and hide every installed game.
      await expect(
        getSteamInstallPath(async () => {
          throw error
        }, 'win32')
      ).rejects.toBe(error)
    }
  )

  it('is null without asking the registry on other platforms', async () => {
    await expect(
      getSteamInstallPath(async () => {
        throw new Error('should not run')
      }, 'darwin')
    ).resolves.toBeNull()
  })
})
