// =============================================================================
// FILE: src/domains/brand/check.ts — WHAT A BRAND RECORD MUST MEET before it is saved (one-address plan P1·1). Every
// pair's contrast through src/domains/themes/contrast.ts (the one WCAG rule), fonts from the closed list, corners and
// spacing from their steps, a logo file's kind and width. The words are the mockup's (§ Words). Pure.
// =============================================================================

import { contrast, luminance } from '@/domains/themes/contrast'
import { COLOUR_ROLES, DENSITIES, FONTS, emptyRecord, isHex, LOGO_SLOTS, PAIRS, RADII, ROLE_NAMES, type BrandRecord, type ColourRole, type Palette } from './record'

/** A pair's ratio, as the chip shows it ("16.05"). */
export const ratio = (a: string, b: string) => contrast(a, b).toFixed(2)

export type PairCheck = { role: ColourRole; against: ColourRole; need: number; ratio: number; ok: boolean }

/** Every checked pair of a palette, in the page's order (the chips). */
/** A pair with a half-typed colour on either side is left out (the chips run on every keystroke). */
export function pairChecks(p: Palette): PairCheck[] {
  return COLOUR_ROLES.flatMap((role) => PAIRS[role].filter(([against]) => isHex(p[role]) && isHex(p[against])).map(([against, need]) => {
    const r = contrast(p[role], p[against])
    return { role, against, need, ratio: r, ok: r >= need }
  }))
}

/**
 * The field a failing pair is named at, and its words. "Text on accent" is fixed by changing the accent (mockup
 * screen 3), so that pair is named at the Accent field.
 */
export function pairProblem(p: Palette, c: PairCheck): { field: ColourRole; message: string } {
  const r = c.ratio.toFixed(2)
  if (c.role === 'on') {
    const darker = luminance(p.on) >= luminance(p.accent)
    return { field: 'accent', message: `Text on this accent is ${r}:1. Use a ${darker ? 'darker' : 'lighter'} one, ${c.need}:1 or more.` }
  }
  return { field: c.role, message: `${ROLE_NAMES[c.role]} on ${ROLE_NAMES[c.against]} is ${r}:1. Pick one with more contrast, ${c.need}:1 or more.` }
}

/** The fields a problem can be named at (the page's own field names). */
export type BrandField = ColourRole | 'display' | 'body' | 'radius' | 'density' | 'main'
export type BrandProblem = { field: BrandField; message: string }

/** Everything wrong with a record, one line a field (the first problem at each). Empty = it may be saved. */
export function brandProblems(b: BrandRecord): BrandProblem[] {
  const out = new Map<BrandField, string>()
  const add = (field: BrandField, message: string) => { if (!out.has(field)) out.set(field, message) }
  for (const role of COLOUR_ROLES) if (!isHex(b.palette[role])) add(role, 'Type a colour like #8C1D2C.')
  // "Text on this accent" first: it is the line the Accent field shows when both of its pairs fail (mockup screen 3).
  const checks = pairChecks(b.palette).sort((x, y) => Number(y.role === 'on') - Number(x.role === 'on'))
  for (const c of checks) if (!c.ok) { const pr = pairProblem(b.palette, c); add(pr.field, pr.message) }
  if (!(FONTS as readonly string[]).includes(b.display)) add('display', 'Pick a headings font from the list.')
  if (!(FONTS as readonly string[]).includes(b.body)) add('body', 'Pick a body font from the list.')
  if (!(RADII as readonly number[]).includes(b.radius)) add('radius', 'Pick one of the corner steps.')
  if (!(DENSITIES as readonly string[]).includes(b.density)) add('density', 'Pick Compact, Standard or Roomy.')
  for (const s of LOGO_SLOTS) if (s !== 'main' && b.logos[s] && !b.logos.main) add('main', 'Add a main logo first.')
  return [...out].map(([field, message]) => ({ field, message }))
}

// ── A logo file ─────────────────────────────────────────────────────────────────

/** Mockup § Words: "SVG, PNG or WebP. PNG and WebP at least 120 px wide." */
export const LOGO_MIN_WIDTH = 120
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const SVG_MAX_BYTES = 200 * 1024
export type LogoKind = 'svg' | 'png' | 'webp'

/** A file's kind from its first bytes (never its name or the browser's word). */
export function sniffLogo(bytes: Uint8Array): LogoKind | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 512)).replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg'
  return null
}

/** Why a file can't be a logo, in the page's words; null when it may be used. `width` for raster files. */
export function logoFileProblem(f: { kind: LogoKind | null; bytes: number; width?: number | null }): string | null {
  if (!f.kind) return 'Upload an SVG, PNG or WebP file.'
  if (f.bytes > (f.kind === 'svg' ? SVG_MAX_BYTES : LOGO_MAX_BYTES)) return f.kind === 'svg' ? 'This SVG is over 200 kB. Upload a smaller one.' : 'This file is over 2 MB. Upload a smaller one.'
  if (f.kind !== 'svg' && (f.width ?? 0) < LOGO_MIN_WIDTH) return `This logo is ${f.width ?? 0} px wide. Upload one at least ${LOGO_MIN_WIDTH} px wide.`
  return null
}

/**
 * The record a page draws (spec § 3, "the check"): the record with today's season, or, when that fails a rule made after
 * it was saved (a pair now under contrast, a season's accent on a background changed since), Frrata's default palette,
 * type, corners and spacing, keeping the store's logo files. Pure; the live pages and the console preview call it.
 */
export function renderRecord(r: BrandRecord, fallback: Palette): BrandRecord {
  return brandProblems(r).length ? { ...emptyRecord(fallback), logos: r.logos } : r
}
