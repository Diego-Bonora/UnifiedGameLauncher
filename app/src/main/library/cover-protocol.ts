import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { COVER_SCHEME, coverFileNameForRequest, coversDirPath, listCoverFiles } from './cover-cache'

// Must run before the app is ready (Electron rule for custom schemes).
// `standard` + `secure` are what let the renderer's CSP and <img> treat
// app-cover:// like a normal same-app resource. Nothing else is granted: no
// fetch API, no CORS, no service workers.
export function registerCoverScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: COVER_SCHEME, privileges: { standard: true, secure: true } }
  ])
}

// Read-only: serves a cached cover for exactly "app-cover://covers/<appId>".
// Everything else, including a valid-looking URL with no file behind it, is a
// plain 404 — the renderer's <img> then falls back to its placeholder.
export function registerCoverProtocol(): void {
  protocol.handle(COVER_SCHEME, async (request) => {
    const fileName = coverFileNameForRequest(request.url, new Set(await listCoverFiles()))
    if (fileName === null) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(join(coversDirPath(), fileName)).toString())
  })
}
