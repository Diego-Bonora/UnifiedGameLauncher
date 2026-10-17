import type {
  SteamConnectResult,
  SteamDisconnectResult,
  SteamSetApiKeyResult
} from '@shared/ipc/steam-channels'

// The only place Steam's connection, key-form and library-call problems are
// worded (library notices live in library-problems.ts), as plain functions so
// the wording can be unit tested (the renderer has no component test setup).
// Never raw error text; each line says what to do next. 'failed' is a call
// that broke outright, whose own message is never shown.

export function signInProblemText(
  problem: NonNullable<SteamConnectResult['problem']> | 'failed'
): string {
  switch (problem) {
    case 'failed':
      return 'Could not connect to Steam. Please try again.'
    case 'verifyFailed':
      return 'Could not verify the response from Steam. Please try again.'
    case 'cannotSave':
      return 'You signed in, but this PC could not save your Steam connection. Please try again.'
  }
}

export function apiKeyProblemText(
  reason: Extract<SteamSetApiKeyResult, { saved: false }>['reason'] | 'failed' | 'removeFailed'
): string {
  switch (reason) {
    case 'failed':
      return 'Could not save the API key. Please try again.'
    case 'removeFailed':
      return 'Could not remove the saved API key. Please try again.'
    case 'invalidKey':
      return "That doesn't look like a Steam Web API key. It should be 32 letters and numbers."
    case 'cannotStore':
      return "This computer can't securely store the key right now. Please try again."
  }
}

export function disconnectProblemText(
  problem: NonNullable<SteamDisconnectResult['problem']> | 'failed'
): string {
  switch (problem) {
    case 'removeFailed':
      return "Couldn't remove all your Steam data, so you're still connected. Please try again."
    case 'failed':
      return "Couldn't disconnect Steam. Please try again."
  }
}

export const LIBRARY_LOAD_FAILED_TEXT = 'Could not load your Steam library. Please try again.'
