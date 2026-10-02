import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import {
  COVER_SCHEME,
  coverDirPath,
  findCoverFileName,
  listCoverFilesIn,
  parseCoverRequest,
  type CoverStore
} from './cover-files'

export interface CoverProtocolDeps {
  listFiles: (store: CoverStore) => Promise<string[]>
  readFile: (store: CoverStore, fileName: string) => Promise<Response>
}

const realDeps: CoverProtocolDeps = {
  listFiles: listCoverFilesIn,
  readFile: (store, fileName) =>
    net.fetch(pathToFileURL(join(coverDirPath(store), fileName)).toString())
}

// Must run before the app is ready (Electron rule for custom schemes).
// `standard` + `secure` are what let the renderer's CSP and <img> treat
// app-cover:// like a normal same-app resource. Nothing else is granted: no
// fetch API, no CORS, no service workers.
export function registerCoverScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: COVER_SCHEME, privileges: { standard: true, secure: true } }
  ])
}

// Read-only: serves a cached cover for exactly "app-cover://covers/<appId>"
// (Steam) or "app-cover://epic/<AppName>" (Epic), each from its own folder.
// Everything else is a plain 404 — the renderer's <img> then falls back to
// its placeholder. That includes a file that disappears between the folder
// listing and the read (antivirus, the user clearing the folder): the handler
// must never reject, or Electron logs an unhandled protocol error per image.
export async function handleCoverRequest(
  requestUrl: string,
  deps: CoverProtocolDeps = realDeps
): Promise<Response> {
  try {
    const request = parseCoverRequest(requestUrl)
    if (request === null) return new Response(null, { status: 404 })
    const fileName = findCoverFileName(request.id, new Set(await deps.listFiles(request.store)))
    if (fileName === null) return new Response(null, { status: 404 })
    return await deps.readFile(request.store, fileName)
  } catch (err) {
    console.warn('[covers] could not serve a cached cover:', err)
    return new Response(null, { status: 404 })
  }
}

export function registerCoverProtocol(): void {
  protocol.handle(COVER_SCHEME, (request) => handleCoverRequest(request.url))
}
