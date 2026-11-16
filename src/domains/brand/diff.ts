// =============================================================================
// FILE: src/domains/brand/diff.ts — WHAT CHANGED between two brand records: the save bar's count ("3 unsaved changes"),
// the Notices line ("4 logo files and 2 fonts."), and the owner's card on Brand ("Headings font · Inter → Tiro
// Devanagari Hindi"). Mockup screens 3–5. Pure.
// =============================================================================

import { COLOUR_ROLES, DENSITY_NAMES, FONT_NAMES, LOGO_NAMES, LOGO_SLOTS, ROLE_NAMES, type BrandRecord } from './record'

export type Change = { kind: 'logo' | 'colour' | 'font' | 'radius' | 'density'; label: string; from: string; to: string }

export function changesOf(a: BrandRecord, b: BrandRecord): Change[] {
  const out: Change[] = []
  for (const s of LOGO_SLOTS) if (a.logos[s] !== b.logos[s]) out.push({ kind: 'logo', label: LOGO_NAMES[s], from: a.logos[s] ? 'set' : '', to: b.logos[s] ? 'set' : '' })
  for (const r of COLOUR_ROLES) if (a.palette[r] !== b.palette[r]) out.push({ kind: 'colour', label: ROLE_NAMES[r], from: a.palette[r], to: b.palette[r] })
  if (a.display !== b.display) out.push({ kind: 'font', label: 'Headings font', from: FONT_NAMES[a.display], to: FONT_NAMES[b.display] })
  if (a.body !== b.body) out.push({ kind: 'font', label: 'Body font', from: FONT_NAMES[a.body], to: FONT_NAMES[b.body] })
  if (a.radius !== b.radius) out.push({ kind: 'radius', label: 'Corners', from: `${a.radius} px`, to: `${b.radius} px` })
  if (a.density !== b.density) out.push({ kind: 'density', label: 'Spacing', from: DENSITY_NAMES[a.density], to: DENSITY_NAMES[b.density] })
  return out
}

const NOUN: Record<Change['kind'], [string, string]> = { logo: ['logo file', 'logo files'], colour: ['colour', 'colours'], font: ['font', 'fonts'], radius: ['corner setting', 'corner settings'], density: ['spacing setting', 'spacing settings'] }

/** "4 logo files and 2 fonts." · "1 colour." — what a waiting change holds, in the Notices row. */
export function changeSummary(cs: readonly Change[]): string {
  const counts = (['logo', 'colour', 'font', 'radius', 'density'] as const).map((k) => [k, cs.filter((c) => c.kind === k).length] as const).filter(([, n]) => n > 0)
  const parts = counts.map(([k, n]) => `${n} ${NOUN[k][n === 1 ? 0 : 1]}`)
  if (parts.length === 0) return 'No changes.'
  const last = parts.pop()!
  return `${parts.length ? `${parts.join(', ')} and ` : ''}${last}.`
}
