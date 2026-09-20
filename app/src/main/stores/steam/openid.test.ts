import { afterEach, describe, expect, it } from 'vitest'
import {
  cancelSteamSignIn,
  openSteamSignInInBrowser,
  verifySteamOpenIdResponse,
  type OpenIdHttpDeps,
  type SignInDeps
} from './openid'

const STEAM_ID_64 = '76561197960287930'

function responseParams(claimedId: string): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimedId,
    'openid.identity': claimedId,
    'openid.return_to': 'http://localhost/uglauncher/openid/callback',
    'openid.response_nonce': '2026-09-20T00:00:00Zabc123',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'deadbeef=='
  })
}

function fakeHttp(responseBody: string): OpenIdHttpDeps {
  return { postCheckAuthentication: async () => responseBody }
}

describe('verifySteamOpenIdResponse', () => {
  it('returns the SteamID64 when Steam confirms the response is valid', async () => {
    const params = responseParams(`https://steamcommunity.com/openid/id/${STEAM_ID_64}`)
    const steamId64 = await verifySteamOpenIdResponse(params, fakeHttp('ns:...\nis_valid:true\n'))
    expect(steamId64).toBe(STEAM_ID_64)
  })

  it('returns null when Steam says the response is not valid', async () => {
    const params = responseParams(`https://steamcommunity.com/openid/id/${STEAM_ID_64}`)
    const steamId64 = await verifySteamOpenIdResponse(params, fakeHttp('ns:...\nis_valid:false\n'))
    expect(steamId64).toBeNull()
  })

  it('returns null for a malformed check_authentication response', async () => {
    const params = responseParams(`https://steamcommunity.com/openid/id/${STEAM_ID_64}`)
    const steamId64 = await verifySteamOpenIdResponse(params, fakeHttp('not the expected body'))
    expect(steamId64).toBeNull()
  })

  it('rejects a claimed_id on the wrong domain even if the check would say valid', async () => {
    const params = responseParams(`https://evil.example.com/openid/id/${STEAM_ID_64}`)
    const steamId64 = await verifySteamOpenIdResponse(params, fakeHttp('is_valid:true'))
    expect(steamId64).toBeNull()
  })

  it('rejects a claimed_id with a non-numeric id', async () => {
    const params = responseParams('https://steamcommunity.com/openid/id/not-a-number')
    const steamId64 = await verifySteamOpenIdResponse(params, fakeHttp('is_valid:true'))
    expect(steamId64).toBeNull()
  })

  it('returns null when claimed_id is missing entirely', async () => {
    const params = new URLSearchParams({ 'openid.mode': 'id_res' })
    const steamId64 = await verifySteamOpenIdResponse(params, fakeHttp('is_valid:true'))
    expect(steamId64).toBeNull()
  })
})

// These exercise the real loopback HTTP server and the real per-flow token
// matching — only the two genuinely external boundaries (opening a browser,
// calling Steam's real check_authentication endpoint) are stubbed. This is
// the code both original review findings (the pending-singleton race and
// the missing CSRF binding) were about, so it's worth the real integration
// coverage rather than leaving it to manual verification only.
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Simulates the browser hitting Steam's real redirect back to the app: a GET
// to the captured return_to URL carrying a valid-shaped claimed_id.
async function fetchCallback(returnTo: string, steamId64 = STEAM_ID_64): Promise<Response> {
  const claimedId = `https://steamcommunity.com/openid/id/${steamId64}`
  return fetch(`${returnTo}?openid.mode=id_res&openid.claimed_id=${encodeURIComponent(claimedId)}`)
}

function captureReturnTo(target: { resolve: (value: string) => void }): SignInDeps['openExternal'] {
  return async (url) => {
    target.resolve(new URL(url).searchParams.get('openid.return_to') ?? '')
  }
}

describe('openSteamSignInInBrowser', () => {
  // A failed assertion partway through a flow shouldn't leave a server
  // dangling and interfering with the next test.
  afterEach(() => {
    cancelSteamSignIn()
  })

  it('resolves with the verified SteamID64 once the browser completes the loopback callback', async () => {
    const returnTo = deferred<string>()
    const deps: SignInDeps = {
      openExternal: captureReturnTo(returnTo),
      http: { postCheckAuthentication: async () => 'is_valid:true' }
    }

    const flow = openSteamSignInInBrowser(deps)
    const callbackUrl = await returnTo.promise
    const response = await fetchCallback(callbackUrl)

    expect(response.status).toBe(200)
    await expect(flow).resolves.toEqual({ steamId64: STEAM_ID_64 })
  })

  it('resolves as failed when verification fails', async () => {
    const returnTo = deferred<string>()
    const deps: SignInDeps = {
      openExternal: captureReturnTo(returnTo),
      http: { postCheckAuthentication: async () => 'is_valid:false' }
    }

    const flow = openSteamSignInInBrowser(deps)
    const callbackUrl = await returnTo.promise
    await fetchCallback(callbackUrl)

    await expect(flow).resolves.toEqual({ failed: true })
  })

  it('resolves as cancelled when cancelSteamSignIn is called', async () => {
    const returnTo = deferred<string>()
    const deps: SignInDeps = {
      openExternal: captureReturnTo(returnTo),
      http: { postCheckAuthentication: async () => 'is_valid:true' }
    }

    const flow = openSteamSignInInBrowser(deps)
    await returnTo.promise
    cancelSteamSignIn()

    await expect(flow).resolves.toEqual({ cancelled: true })
  })

  it('rejects a request to a guessed callback path instead of the real per-flow token', async () => {
    const returnTo = deferred<string>()
    const deps: SignInDeps = {
      openExternal: captureReturnTo(returnTo),
      http: { postCheckAuthentication: async () => 'is_valid:true' }
    }

    const flow = openSteamSignInInBrowser(deps)
    const callbackUrl = await returnTo.promise
    const guessedUrl = new URL(callbackUrl)
    // Guaranteed different from the real, random per-flow path — never a
    // false match, unlike mutating a few trailing characters could risk.
    guessedUrl.pathname = `${guessedUrl.pathname}-guessed`

    const response = await fetch(guessedUrl.toString())
    expect(response.status).toBe(404)

    cancelSteamSignIn()
    await expect(flow).resolves.toEqual({ cancelled: true })
  })

  it('a stale in-flight verification from a cancelled flow cannot corrupt a later flow', async () => {
    // Regression test for the original pending-singleton race: cancelling a
    // flow while its verification round-trip is still in flight, then
    // immediately starting a new one, must not let the stale flow's delayed
    // settle hang or clobber the new flow.
    const checkAuth = deferred<string>()
    const verificationStarted = deferred<void>()
    const slowHttp: OpenIdHttpDeps = {
      postCheckAuthentication: () => {
        verificationStarted.resolve()
        return checkAuth.promise
      }
    }

    const returnToA = deferred<string>()
    const flowA = openSteamSignInInBrowser({
      http: slowHttp,
      openExternal: captureReturnTo(returnToA)
    })
    const callbackUrlA = await returnToA.promise

    // Kick off A's callback — it hangs inside verifySteamOpenIdResponse
    // until checkAuth resolves.
    void fetchCallback(callbackUrlA)
    await verificationStarted.promise

    // The user cancels A while that verification is still in flight.
    cancelSteamSignIn()
    await expect(flowA).resolves.toEqual({ cancelled: true })

    // A new flow starts right after — this is what the original bug let A
    // clobber.
    const returnToB = deferred<string>()
    const flowB = openSteamSignInInBrowser({
      http: { postCheckAuthentication: async () => 'is_valid:true' },
      openExternal: captureReturnTo(returnToB)
    })
    const callbackUrlB = await returnToB.promise

    // A's stale verification finally "arrives". Give its .then() chain a
    // couple of turns to run to completion before touching B.
    checkAuth.resolve('is_valid:true')
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))

    // B's real callback must still resolve B's own promise — the original
    // bug left this hanging forever, because A's stale settle had wiped the
    // shared `pending` slot out from under B.
    await fetchCallback(callbackUrlB)
    await expect(flowB).resolves.toEqual({ steamId64: STEAM_ID_64 })
  })
})
