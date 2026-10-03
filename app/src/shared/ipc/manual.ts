import { z } from 'zod'
import {
  hasValidArgsCharacters,
  hasValidTitleCharacters,
  MAX_ARGS_LENGTH,
  MAX_TITLE_LENGTH,
  type ManualAddRequest,
  type ManualCoverSourceRequest,
  type ManualIdRequest,
  type ManualRenameRequest,
  type ManualSetArgsRequest
} from './manual-channels'

export {
  MANUAL_CHANNELS,
  MANUAL_COVER_URL_PREFIX,
  MAX_ARGS_LENGTH,
  MAX_TITLE_LENGTH,
  hasValidArgsCharacters,
  hasValidTitleCharacters
} from './manual-channels'
export type * from './manual-channels'

// Only main imports this file (it needs zod).

// The UUIDs main makes with crypto.randomUUID: lower-case hex. The id also
// names cover files (covers-manual/), so nothing else is accepted.
export const MANUAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const manualIdSchema = z.string().regex(MANUAL_ID_PATTERN)

export const manualTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TITLE_LENGTH)
  .refine(hasValidTitleCharacters)

// Trimmed: leading or trailing spaces carry no meaning on a command line,
// and "  " would otherwise count as arguments that need confirming.
export const manualArgsSchema = z
  .string()
  .trim()
  .max(MAX_ARGS_LENGTH)
  .refine(hasValidArgsCharacters)

export const manualAddRequestSchema = z.object({
  title: manualTitleSchema,
  args: manualArgsSchema
}) satisfies z.ZodType<ManualAddRequest>

export const manualRenameRequestSchema = z.object({
  id: manualIdSchema,
  title: manualTitleSchema
}) satisfies z.ZodType<ManualRenameRequest>

export const manualSetArgsRequestSchema = z.object({
  id: manualIdSchema,
  args: manualArgsSchema
}) satisfies z.ZodType<ManualSetArgsRequest>

export const manualCoverSourceRequestSchema = z.object({
  id: manualIdSchema,
  source: z.enum(['steam', 'icon'])
}) satisfies z.ZodType<ManualCoverSourceRequest>

export const manualIdRequestSchema = z.object({
  id: manualIdSchema
}) satisfies z.ZodType<ManualIdRequest>
