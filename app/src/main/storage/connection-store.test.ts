import { describe, expect, it } from 'vitest'
import {
  clearSteamConnection,
  getSteamConnection,
  setSteamConnection,
  type ConnectionStoreDeps,
  type SteamConnection
} from './connection-store'

function fakeDeps(initial?: string): ConnectionStoreDeps {
  let content = initial
  return {
    readFile: async () => {
      if (content === undefined) throw new Error('ENOENT: connections.json')
      return content
    },
    writeFile: async (data) => {
      content = data
    }
  }
}

const CONNECTED: SteamConnection = { status: 'connected', steamId64: '76561197960287930' }

describe('connection-store', () => {
  it('defaults to disconnected when the file does not exist', async () => {
    expect(await getSteamConnection(fakeDeps())).toEqual({
      status: 'disconnected',
      steamId64: null
    })
  })

  it('defaults to disconnected when the file is corrupt JSON', async () => {
    expect(await getSteamConnection(fakeDeps('not json'))).toEqual({
      status: 'disconnected',
      steamId64: null
    })
  })

  it('defaults to disconnected when the saved shape fails validation', async () => {
    const deps = fakeDeps(JSON.stringify({ steam: { status: 'nonsense', steamId64: null } }))
    expect(await getSteamConnection(deps)).toEqual({ status: 'disconnected', steamId64: null })
  })

  it('round-trips a saved connection', async () => {
    const deps = fakeDeps()
    await setSteamConnection(CONNECTED, deps)
    expect(await getSteamConnection(deps)).toEqual(CONNECTED)
  })

  it('clears back to disconnected', async () => {
    const deps = fakeDeps()
    await setSteamConnection(CONNECTED, deps)
    await clearSteamConnection(deps)
    expect(await getSteamConnection(deps)).toEqual({ status: 'disconnected', steamId64: null })
  })

  it('preserves other top-level keys (e.g. a future epic connection) when writing', async () => {
    let written = ''
    const deps: ConnectionStoreDeps = {
      readFile: async () => JSON.stringify({ epic: { foo: 'bar' } }),
      writeFile: async (data) => {
        written = data
      }
    }

    await setSteamConnection(CONNECTED, deps)

    expect(JSON.parse(written)).toEqual({ epic: { foo: 'bar' }, steam: CONNECTED })
  })

  it('serializes concurrent writes instead of interleaving their read-modify-write', async () => {
    const events: string[] = []
    let fileContent = '{}'
    const deps: ConnectionStoreDeps = {
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

    await Promise.all([
      setSteamConnection(CONNECTED, deps),
      setSteamConnection({ status: 'disconnected', steamId64: null }, deps)
    ])

    // Without the write queue, both calls' reads/writes would interleave
    // (read-start, read-start, read-end, ...) and the second write could be
    // built from a stale read that never saw the first's result.
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
