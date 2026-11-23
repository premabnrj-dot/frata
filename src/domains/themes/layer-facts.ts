// =============================================================================
// FILE: src/domains/themes/layer-facts.ts — the half of layer.ts a browser may load: the brand colour's rules, no zod
// (page weight, 2026-11-23: the customizer's theme and site forms read these and shipped all of zod). layer.ts
// re-exports everything here.
// =============================================================================

import { ON_COLOUR } from './catalogue/kit'
import { contrast } from './contrast'
import type { Hex, Scheme } from './types'

/** The brand colour replaces the accent on the light schemes (paper, tint); it must read on each of them (spec § Theme settings). */
export function brandColourProblem(colour: string, schemes: Scheme[]): string | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) return 'Pick a colour.'
  for (const s of schemes) if (contrast(colour, s.bg) < 3) return 'Too light on this background. Pick a deeper shade.'
  if (contrast(colour, ON_COLOUR.light) < 4.5 && contrast(colour, ON_COLOUR.dark) < 4.5) return 'Text on it would be hard to read. Pick a deeper or lighter shade.'
  return null
}
/** Text on a brand-colour fill: white when readable, else ink. */
export const onColour = (c: string): Hex => (contrast(c, ON_COLOUR.light) >= 4.5 ? ON_COLOUR.light : ON_COLOUR.dark)
