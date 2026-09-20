import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { shell } from 'electron'

// Loopback path Steam redirects back to once the user finishes signing in.
// The random suffix is appended per-flow in openSteamSignInInBrowser — see
// the comment there for why a fixed path isn't enough.
const CALLBACK_PATH_PREFIX = '/uglauncher/openid/callback'

// Steam is a stateless ("dumb mode") OpenID 2.0 provider: no associate step,
// just checkid_setup followed by a check_authentication replay to verify.
// return_to/realm are per-flow: they carry the loopback server's actual
// (ephemeral) port and a random per-flow path, so they're built fresh for
// each sign-in attempt rather than being fixed constants.
export function buildCheckIdSetupUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  })
  return `https://steamcommunity.com/openid/login?${params.toString()}`
}

export interface OpenIdHttpDeps {
  postCheckAuthentication: (params: URLSearchParams) => Promise<string>
}

const realOpenIdHttp: OpenIdHttpDeps = {
  postCheckAuthentication: async (params) => {
    const response = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })
    return response.text()
  }
}

// Steam's claimed_id is always exactly this shape; never trust it without
// both this check and a successful check_authentication reply.
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

// The unit-testable core of the OpenID flow — no Electron dependency, so it
// can be exercised without a real network request or a real HTTP server.
// This confirms Steam's signature is genuine, but on its own does NOT bind
// the response to any particular sign-in attempt — see the per-flow token
// in openSteamSignInInBrowser for that half of the guarantee.
export async function verifySteamOpenIdResponse(
  params: URLSearchParams,
  http: OpenIdHttpDeps = realOpenIdHttp
): Promise<string | null> {
  const claimedId = params.get('openid.claimed_id')
  if (claimedId === null) return null

  const match = CLAIMED_ID_PATTERN.exec(claimedId)
  const steamId64 = match?.[1]
  if (steamId64 === undefined) return null

  // Replay every param Steam sent back, only flipping mode — this is the
  // OpenID 2.0 "dumb mode" verification Steam requires.
  const verificationParams = new URLSearchParams(params)
  verificationParams.set('openid.mode', 'check_authentication')

  const body = await http.postCheckAuthentication(verificationParams)
  if (!/(?:^|\n)is_valid\s*:\s*true/.test(body)) return null

  return steamId64
}

export type SteamSignInResult = { steamId64: string } | { cancelled: true } | { failed: true }

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

const SUCCESS_HTML =
  '<!doctype html><html><head><title>Signed in</title></head>' +
  '<body style="font-family: system-ui; padding: 2rem;">' +
  "<p>You're signed in. You can close this tab and return to UnifiedGameLauncher.</p>" +
  '</body></html>'

const FAILURE_HTML =
  '<!doctype html><html><head><title>Sign-in failed</title></head>' +
  '<body style="font-family: system-ui; padding: 2rem;">' +
  '<p>Something went wrong verifying your Steam sign-in. You can close this tab and try again from UnifiedGameLauncher.</p>' +
  '</body></html>'

export interface SignInDeps {
  openExternal: (url: string) => Promise<void>
  http: OpenIdHttpDeps
}

// Real deps default: opens the user's actual browser and calls Steam for
// real. Threaded through as a parameter (not hardcoded) so the concurrency
// and per-flow-token logic below — the highest-risk code in this file — can
// be exercised in tests without a real Electron process or real network
// calls, the same injectable-dependency pattern used elsewhere in main/.
const realSignInDeps: SignInDeps = {
  openExternal: (url) => shell.openExternal(url),
  http: realOpenIdHttp
}

interface PendingSignIn {
  settle: (result: SteamSignInResult) => void
}

// Module-level: only one sign-in flow can be waiting on a browser tab at a
// time. Starting a new one, or an explicit cancel, tears down whatever was
// still waiting rather than leaving an orphaned server listening.
let pending: PendingSignIn | null = null

export function cancelSteamSignIn(): void {
  pending?.settle({ cancelled: true })
}

// Steam's login page must open in the user's real default browser, not an
// embedded window — Steam's edge (Akamai) blocks Electron's embedded
// BrowserWindow outright (its default User-Agent identifies it as
// Electron), and this also matches how OpenID/OAuth providers generally
// expect desktop apps to behave. Since there's no in-app window to detect
// "the user closed it", the callback is caught by a real loopback HTTP
// server instead, following the same pattern CLI tools like `gh auth login`
// use.
export async function openSteamSignInInBrowser(
  deps: SignInDeps = realSignInDeps
): Promise<SteamSignInResult> {
  // Cancels the PREVIOUS flow (if any) via ITS OWN settle closure — that
  // call fully completes, synchronously, before this flow creates anything,
  // so it can never race with what follows.
  cancelSteamSignIn()

  return new Promise((resolve) => {
    // Local to this flow: guards this flow's own settle against firing
    // twice (e.g. a callback request racing the timeout). This is
    // independent of the shared `pending` slot, which a newer flow — or an
    // explicit cancel — may reassign or clear out from under this one at
    // any time; without this local flag, a stale settle from an old flow
    // could still race a newer flow's promise (see docs/lessons.md).
    let settled = false

    // A per-flow random token, not just a fixed path: without it, anyone
    // who completes their OWN legitimate Steam login during the window this
    // server is listening could hand their valid, Steam-signed callback to
    // this loopback port and get the app connected as THEM instead of the
    // real user — a login-CSRF gap common to loopback OAuth/OpenID flows.
    const flowToken = randomBytes(16).toString('hex')
    const callbackPath = `${CALLBACK_PATH_PREFIX}/${flowToken}`

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== callbackPath) {
        res.writeHead(404).end()
        return
      }

      void verifySteamOpenIdResponse(url.searchParams, deps.http).then((steamId64) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(steamId64 !== null ? SUCCESS_HTML : FAILURE_HTML)
        if (steamId64 === null) {
          console.warn('[steam] OpenID callback failed verification')
          settle({ failed: true })
        } else {
          settle({ steamId64 })
        }
      })
    })

    const settle = (result: SteamSignInResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      server.close()
      // Only clear the shared slot if it's still pointing at this flow — a
      // newer flow (or another cancel) may already have replaced it.
      if (pending?.settle === settle) pending = null
      resolve(result)
    }

    // Safety net if the user never finishes (abandons the tab, closes the
    // browser) — otherwise nothing would ever resolve this promise.
    const timeoutHandle = setTimeout(() => settle({ cancelled: true }), SIGN_IN_TIMEOUT_MS)

    pending = { settle }

    server.on('error', (err) => {
      console.warn('[steam] OpenID loopback server error:', err)
      settle({ failed: true })
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        console.warn('[steam] OpenID loopback server returned an unexpected address:', address)
        settle({ failed: true })
        return
      }
      const returnTo = `http://127.0.0.1:${address.port}${callbackPath}`
      const realm = `http://127.0.0.1:${address.port}/`
      // A deliberate, hardcoded, main-process-built URL to Steam's own
      // domain — not renderer-influenced input — so this intentionally
      // bypasses the steam://-style launch-protocol allow-list in
      // security/external-url.ts, which guards a different concern.
      deps.openExternal(buildCheckIdSetupUrl(returnTo, realm)).catch((err: unknown) => {
        console.warn('[steam] could not open the system browser for sign-in:', err)
        settle({ failed: true })
      })
    })
  })
}
