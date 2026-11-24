// =============================================================================
// FILE: src/domains/brand/patch.ts — A CHANGE TO A BRAND RECORD, AND THE RECORD IT MAKES (one-address plan P1·3; moved
// here from src/lib/content/save.ts for Studio's proposals, V3a plan docs/plans/2026-11-22-v3a-runtime.md R1, impact
// review). ONE shape and ONE merge: saveBrand parses and applies a person's patch with them, and Studio's
// `tokens_propose` is this same shape without the logo slots (an agent's logo is stored first, then saved), so a
// proposal a card draws is exactly what Apply will save. A colour that isn't one stays as typed so `brandProblems`
// names it. Pure.
// =============================================================================

import { z } from 'zod'
import { COLOUR_ROLES, DENSITIES, FONTS, LOGO_SLOTS, normalHex, RADII, type BrandRecord, type LogoSlot, type Radius } from './record'

const hex = z.string().max(9)
const palette = z.strictObject(Object.fromEntries(COLOUR_ROLES.map((r) => [r, hex.optional()])) as Record<(typeof COLOUR_ROLES)[number], z.ZodOptional<typeof hex>>)
const radius = z.union(RADII.map((r) => z.literal(r)) as unknown as [z.ZodLiteral<Radius>, z.ZodLiteral<Radius>])

/** Everything but the logo files: colours, fonts, corners and spacing. */
export const TokensPatch = z.strictObject({
  palette: palette.optional(),
  display: z.enum(FONTS).optional(),
  body: z.enum(FONTS).optional(),
  radius: radius.optional(),
  density: z.enum(DENSITIES).optional(),
})
export const BrandPatchSchema = TokensPatch.extend({
  logos: z.strictObject(Object.fromEntries(LOGO_SLOTS.map((s) => [s, z.string().max(300).nullable().optional()])) as Record<LogoSlot, z.ZodOptional<z.ZodNullable<z.ZodString>>>).optional(),
})
export type BrandPatch = z.infer<typeof BrandPatchSchema>
export type TokensPatchValue = z.infer<typeof TokensPatch>

/** The record a patch makes: colours normalised ("#fbf7f1" → "#FBF7F1"); a colour that isn't one stays as typed. */
export function applyPatch(live: BrandRecord, p: BrandPatch): BrandRecord {
  const pal = { ...live.palette }
  for (const r of COLOUR_ROLES) { const v = p.palette?.[r]; if (v !== undefined) pal[r] = normalHex(v) ?? (v as `#${string}`) }
  const logos = { ...live.logos }
  for (const s of LOGO_SLOTS) { const v = p.logos?.[s]; if (v !== undefined) logos[s] = v }
  return { logos, palette: pal, display: p.display ?? live.display, body: p.body ?? live.body, radius: p.radius ?? live.radius, density: p.density ?? live.density }
}
