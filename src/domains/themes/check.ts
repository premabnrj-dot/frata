import { DesignSchema, designsCheck, designsOf } from './blocks'
import { contrast } from './contrast'
import { SECTION_KEYS, SectionSchema } from './sections'
import type { ThemeManifest } from './types'

// =============================================================================
// FILE: src/domains/themes/check.ts — THE check a theme manifest passes (Theme Studio spec § 5, TS0a). One function:
// the vitest `check:theme` calls it for every code manifest; the studio (TS2) calls it on save and on submit. Each
// problem is one line in words. Pure: no I/O.
// =============================================================================

/** Contrast floors (WCAG 2.2 AA, strict): words 4.5:1, the accent as a mark 3:1. */
const PAIRS: [string, (s: ThemeManifest['styles'][number]['schemes']['paper']) => [string, string], number][] = [
  ['text', (s) => [s.text, s.bg], 4.5],
  ['sub', (s) => [s.sub, s.bg], 4.5],
  ['accent', (s) => [s.accent, s.bg], 3],
  ['on accent', (s) => [s.onAccent, s.accent], 4.5],
  ['button', (s) => [s.onButton, s.button], 4.5],
  ['good', (s) => [s.good, s.bg], 4.5],
  ['bad', (s) => [s.bad, s.bg], 4.5],
  ['sale', (s) => [s.sale, s.bg], 4.5],
]

export const MAX_HOME_SECTIONS = 20

/** `previous`: the version this one follows, for "a minor only adds" (TS0b: designs and their block ids). */
export function themeCheck(m: ThemeManifest, previous?: ThemeManifest): string[] {
  const out: string[] = []
  if (!/^\d+\.\d+\.\d+$/.test(m.version)) out.push(`The version ${m.version} isn't major.minor.patch`)
  if (m.styles.length < 1 || m.styles.length > 5) out.push(`${m.styles.length} styles; a theme has 1 to 5`)
  if (new Set(m.styles.map((s) => s.key)).size !== m.styles.length) out.push('Two styles share a key')
  if (!m.allowed.pairings.includes(m.defaults.pairing)) out.push(`The default type pairing ${m.defaults.pairing} isn't allowed`)
  if (!m.allowed.headers.includes(m.defaults.header)) out.push(`The default header ${m.defaults.header} isn't allowed`)
  if (!m.allowed.footers.includes(m.defaults.footer)) out.push(`The default footer ${m.defaults.footer} isn't allowed`)
  for (const h of m.made?.headers ?? []) if (!m.allowed.headers.includes(h)) out.push(`Made-for header ${h} isn't allowed`)
  for (const f of m.made?.footers ?? []) if (!m.allowed.footers.includes(f)) out.push(`Made-for footer ${f} isn't allowed`)
  for (const k of m.made?.sections ?? []) if (!m.allowed.sections.includes(k)) out.push(`Made-for section ${k} isn't allowed`)

  if (m.home.length > MAX_HOME_SECTIONS) out.push(`Home has ${m.home.length} sections; at most ${MAX_HOME_SECTIONS}`)
  if (new Set(m.home.map((s) => s.id)).size !== m.home.length) out.push('Two home sections share an id')
  for (const s of m.home) {
    if (!(SECTION_KEYS as string[]).includes(s.key)) { out.push(`Home section ${s.id}: ${s.key} isn't in the library`); continue }
    if (!m.allowed.sections.includes(s.key)) out.push(`Home section ${s.id}: ${s.key} isn't allowed by the theme`)
    // The section's own schema refuses a source outside the list (never by cost: ADR-0003).
    const r = SectionSchema.safeParse(s)
    if (!r.success) out.push(`Home section ${s.id}: ${r.error.issues[0]?.message ?? 'invalid'}`)
    else if (r.data.key === 'design') { const id = r.data.design; if (!(m.designs ?? []).some((d) => d.id === id)) out.push(`Home section ${s.id}: design ${id} isn't in the theme`) }
  }

  for (const d of m.designs ?? []) { const r = DesignSchema.safeParse(d); if (!r.success) out.push(`Design ${String((d as { id?: unknown }).id ?? '?')}: ${r.error.issues[0]?.message ?? 'invalid'}`) }
  if ((m.designs ?? []).length && !m.allowed.sections.includes('design')) out.push('The theme has designs but doesn\'t allow the design section')
  const minor = previous && previous.key === m.key && previous.version.split('.')[0] === m.version.split('.')[0]
  out.push(...designsCheck(designsOf(m), minor ? designsOf(previous) : undefined))

  for (const st of m.styles) for (const [k, s] of Object.entries(st.schemes)) {
    if (!s) continue
    for (const [name, pick, floor] of PAIRS) {
      const [fg, bg] = pick(s)
      const ratio = contrast(fg as `#${string}`, bg as `#${string}`)
      if (ratio < floor) out.push(`${st.key}.${k} ${name} reads ${ratio.toFixed(1)}:1; needs ${floor}:1`)
    }
  }
  return out
}
