import { z } from 'zod'
import type { EpicInstalledGame, EpicLaunchRequest } from './epic-channels'

export { EPIC_CHANNELS } from './epic-channels'
export type {
  EpicInstalledGame,
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
  installPath: z.string().min(1)
}) satisfies z.ZodType<EpicInstalledGame>

// The only payload that crosses the boundary from renderer input.
export const epicLaunchRequestSchema = z.object({
  appName: appNameSchema
}) satisfies z.ZodType<EpicLaunchRequest>
