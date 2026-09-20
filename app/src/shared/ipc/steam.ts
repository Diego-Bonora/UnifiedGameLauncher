import { z } from 'zod'
import type { SteamInstalledGame, SteamLaunchRequest } from './steam-channels'

export { STEAM_CHANNELS } from './steam-channels'
export type {
  SteamConnectionStatus,
  SteamInstalledGame,
  SteamLaunchRequest,
  SteamOwnedGame
} from './steam-channels'

// Only main imports this file (it needs zod for validation). Preload and the
// renderer import steam-channels.ts instead — see the note there.
// `satisfies` ties this schema to the hand-written type above so the two
// can't silently drift apart.
export const steamInstalledGameSchema = z.object({
  appId: z.string().regex(/^\d+$/),
  title: z.string().min(1),
  installPath: z.string().min(1)
}) satisfies z.ZodType<SteamInstalledGame>

// The only payload that actually crosses the boundary from renderer input.
export const steamLaunchRequestSchema = z.object({
  appId: z.string().regex(/^\d+$/)
}) satisfies z.ZodType<SteamLaunchRequest>

// SteamConnectionStatus gets no schema here: unlike the above, nothing
// crosses a trust boundary to produce it — it's built in main from data
// connection-store.ts already validates, plus a literal boolean. Re-parsing
// it here would only be checking main's own code against itself.

// Steam Web API keys are always exactly 32 hex characters. `.trim()` absorbs
// the stray whitespace copy-pasting from Steam's own key page tends to add.
export const steamApiKeyPayloadSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{32}$/)
})

// SteamOwnedGame gets no schema here either, for the same reason as
// SteamConnectionStatus above: stores/steam/owned-games.ts already validates
// Steam's raw API response entry-by-entry before this shape ever exists.
