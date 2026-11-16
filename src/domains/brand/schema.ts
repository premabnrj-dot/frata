// =============================================================================
// FILE: src/domains/brand/schema.ts — THE RECORD AS DATA (one-address plan P1·3): the shape saveBrand accepts, keeps in
// `brand_tokens.previous` and `brand_proposals.record`, and reads back. Capped and closed: a stored copy that doesn't
// parse is read as nothing (never trusted). Pure.
// =============================================================================

import { z } from 'zod'
import { COLOUR_ROLES, DENSITIES, FONTS, LOGO_SLOTS, normalHex, RADII, type BrandRecord, type Hex } from './record'

const hex = z.string().max(9).transform((v, ctx) => { const h = normalHex(v); if (!h) { ctx.addIssue({ code: 'custom', message: 'Type a colour like #8C1D2C.' }); return z.NEVER } return h as Hex })
const url = z.string().max(300).nullable()

export const BrandRecordSchema = z.strictObject({
  logos: z.strictObject(Object.fromEntries(LOGO_SLOTS.map((s) => [s, url])) as Record<(typeof LOGO_SLOTS)[number], typeof url>),
  palette: z.strictObject(Object.fromEntries(COLOUR_ROLES.map((r) => [r, hex])) as Record<(typeof COLOUR_ROLES)[number], typeof hex>),
  display: z.enum(FONTS),
  body: z.enum(FONTS),
  radius: z.union(RADII.map((r) => z.literal(r)) as unknown as [z.ZodLiteral<0>, z.ZodLiteral<4>]),
  density: z.enum(DENSITIES),
})

/** A stored copy back to a record, or null when it no longer parses. */
export function readRecord(v: unknown): BrandRecord | null {
  const r = BrandRecordSchema.safeParse(v)
  return r.success ? (r.data as BrandRecord) : null
}
