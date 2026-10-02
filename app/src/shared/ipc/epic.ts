import { z } from 'zod'
import {
  EPIC_COVER_URL_PREFIX,
  type EpicInstalledGame,
  type EpicLaunchRequest
} from './epic-channels'

export { EPIC_CHANNELS, EPIC_COVER_URL_PREFIX } from './epic-channels'
export type {
  EpicClearCoverKeyResult,
  EpicCoverProblem,
  EpicCoverStatus,
  EpicInstalledGame,
  EpicSetCoverKeyResult,
  EpicLaunchFailure,
  EpicLaunchRequest,
  EpicLaunchResult
} from './epic-channels'

// Same character set the manifest parser accepts: the id ends up inside a
// com.epicgames.launcher:// URL, so nothing else is allowed through.
const appNameSchema = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/)

// Only main imports this file (it needs zod). `satisfies` ties the schema to
// the hand-written type so the two can't drift apart.
export const epicInstalledGameSchema = z.object({
  appName: appNameSchema,
  title: z.string().min(1),
  installPath: z.string().min(1),
  // Only a local cover URL may reach an <img src>.
  coverUrl: z.string().startsWith(EPIC_COVER_URL_PREFIX).nullable()
}) satisfies z.ZodType<EpicInstalledGame>

// The only payload that crosses the boundary from renderer input.
export const epicLaunchRequestSchema = z.object({
  appName: appNameSchema
}) satisfies z.ZodType<EpicLaunchRequest>

// SteamGridDB keys are 32 hex characters (checked against a real key on
// 2026-10-02). Surrounding spaces from a paste are trimmed first.
export const epicCoverKeyRequestSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{32}$/)
})
