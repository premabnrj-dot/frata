// =============================================================================
// FILE: src/domains/brand/outline.ts — A LOGO MADE OF OUTLINES ONLY (Studio spec docs/specs/2026-11-16-studio-agent.md
// § 4 `logo_propose`: "Text elements, rasters, filters" never; plan docs/plans/2026-11-22-v3a-runtime.md R1). An
// agent-drawn logo must look the same everywhere, so it may not lean on a font: its letters are paths. The SVG is first
// cleaned by the one cleaner (`cleanSvg`: scripts, links, rasters and unknown elements such as filters are refused or
// dropped there); this adds only the outline rule on the cleaned text. Pure.
// =============================================================================

import { cleanSvg, type SvgRefusal } from './svg'

export type OutlineRefusal = SvgRefusal | 'text' | 'empty'
export const OUTLINE_REFUSAL_WORDS: Record<'text' | 'empty', string> = {
  text: 'This logo uses a font. Draw its letters as shapes.',
  empty: 'This logo has nothing drawn in it.',
}

/** The cleaned SVG of an outline-only logo, or why not. */
export function outlineLogo(input: string): { ok: true; svg: string } | { ok: false; reason: OutlineRefusal } {
  const c = cleanSvg(input)
  if (!c.ok) return c
  if (/<(text|tspan)[\s>/]/i.test(c.svg) || /\sfont-family="/i.test(c.svg)) return { ok: false, reason: 'text' }
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line|use)[\s>/]/i.test(c.svg)) return { ok: false, reason: 'empty' }
  return { ok: true, svg: c.svg }
}
