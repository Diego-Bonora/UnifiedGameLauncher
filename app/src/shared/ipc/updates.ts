import { z } from 'zod'

export { UPDATES_CHANNELS } from './updates-channels'
export type {
  UpdateActionResult,
  UpdateSetEnabledResult,
  UpdateState,
  UpdateStatus
} from './updates-channels'

const setEnabledSchema = z.strictObject({ enabled: z.boolean() })

// Only main imports this file (it needs zod). null for anything but
// `{ enabled: boolean }`.
export function parseSetEnabledRequest(raw: unknown): { enabled: boolean } | null {
  const result = setEnabledSchema.safeParse(raw)
  return result.success ? result.data : null
}
