// =============================================================================
// FILE: src/domains/brand/record.ts — WHAT A BRAND RECORD IS (one-address plan P1·1; spec
// docs/specs/2026-11-16-one-address-checkout.md § 5; mockup docs/mockups/2026-11-16-p1-brand.html, owner-approved
// 2026-11-16). A code-site store's logo files, eleven colour roles, two fonts from a closed list, one corner step and one
// spacing step. Theme shops keep their look (O19). Pure: no I/O.
// =============================================================================

import { PAIRING_NAMES, PAIRINGS } from '@/domains/themes/types'

/** The eleven colour roles, in the order the page lists them (owner call 6). */
export const COLOUR_ROLES = ['bg', 'panel', 'text', 'muted', 'accent', 'on', 'edge', 'line', 'good', 'warn', 'bad'] as const
export type ColourRole = (typeof COLOUR_ROLES)[number]
export const ROLE_NAMES: Record<ColourRole, string> = {
  bg: 'Background', panel: 'Panel', text: 'Text', muted: 'Secondary text', accent: 'Accent', on: 'Text on accent',
  edge: 'Control edge', line: 'Hairline', good: 'Success', warn: 'Warning', bad: 'Error',
}
export type Hex = `#${string}`
export type Palette = Record<ColourRole, Hex>
export const isHex = (v: unknown): v is Hex => typeof v === 'string' && /^#[0-9A-F]{6}$/.test(v)
/** "#fbf7f1" → "#FBF7F1"; anything else → null. */
export const normalHex = (v: unknown): Hex | null => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? (v.trim().toUpperCase() as Hex) : null)

/** The pairs each role is checked against, and the ratio it needs (WCAG 2.x: 4.5 for text, 3 for a control's edge). */
export const PAIRS: Record<ColourRole, readonly (readonly [ColourRole, number])[]> = {
  bg: [], panel: [], line: [],
  text: [['bg', 4.5], ['panel', 4.5]], muted: [['bg', 4.5], ['panel', 4.5]], accent: [['bg', 4.5]], on: [['accent', 4.5]],
  edge: [['bg', 3]], good: [['bg', 4.5]], warn: [['bg', 4.5]], bad: [['bg', 4.5]],
}

/**
 * Frrata's closed font list (owner call 2): the theme pairings' faces plus Mukta and Tiro Devanagari Hindi, all on
 * Google Fonts. Keys are stored; names are shown and answered by the API.
 */
export const FONTS = [...PAIRINGS, 'mukta', 'tiro'] as const
export type Font = (typeof FONTS)[number]
export const FONT_NAMES: Record<Font, string> = { ...PAIRING_NAMES, mukta: 'Mukta', tiro: 'Tiro Devanagari Hindi' }
const SANS = new Set<Font>(['inter', 'mukta', 'schibsted'])
/**
 * A font stack by FAMILY NAME, for what leaves Frrata (the API's answer, the kit's variables, emails): the site loads the
 * face itself. Frrata's own pages self-host their faces and use CSS variables instead (brandFamily in
 * src/components/shop-preview/fonts.ts).
 */
export const fontStack = (f: Font): string => `'${FONT_NAMES[f]}', ${SANS.has(f) ? 'system-ui, sans-serif' : 'Georgia, serif'}`

/** Corners (owner call 3) and spacing (owner call 4: fields 44, 48 and 52 px tall). */
export const RADII = [0, 4, 8, 12, 16] as const
export type Radius = (typeof RADII)[number]
export const DENSITIES = ['compact', 'standard', 'roomy'] as const
export type Density = (typeof DENSITIES)[number]
export const DENSITY_NAMES: Record<Density, string> = { compact: 'Compact', standard: 'Standard', roomy: 'Roomy' }
export const FIELD_HEIGHT: Record<Density, number> = { compact: 44, standard: 48, roomy: 52 }

/** The logo files: the main one is `shop_settings.logo_url`; the other three are optional (spec § 5). */
export const LOGO_SLOTS = ['main', 'mark', 'stacked', 'reversed'] as const
export type LogoSlot = (typeof LOGO_SLOTS)[number]
export const LOGO_NAMES: Record<LogoSlot, string> = { main: 'Main logo', mark: 'Mark', stacked: 'Stacked', reversed: 'On dark' }
export type Logos = Record<LogoSlot, string | null>

/** The record as saved and read: what `brand_tokens` and `shop_settings.logo_url` hold, typed. */
export type BrandRecord = {
  logos: Logos
  palette: Palette
  display: Font
  body: Font
  radius: Radius
  density: Density
}

/** What a store reads before its record is ever saved (mockup screen 2). */
export function emptyRecord(palette: Palette, logoUrl: string | null = null): BrandRecord {
  return { logos: { main: logoUrl, mark: null, stacked: null, reversed: null }, palette: { ...palette }, display: 'inter', body: 'inter', radius: 8, density: 'standard' }
}
