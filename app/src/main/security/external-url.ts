// Only the official launchers may be opened outside the app. Anything else
// (http, file:, other apps' protocol handlers) could be abused by page content.
const ALLOWED_PROTOCOLS = new Set(['steam:', 'com.epicgames.launcher:'])

export function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

export function isAllowedExternalUrl(raw: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(raw).protocol)
  } catch {
    // An unparseable URL is never safe to hand to the OS.
    return false
  }
}
