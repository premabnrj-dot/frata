import { manifestOf } from './catalogue'
import { SectionSchema } from './sections'
import { PAIRINGS, type Pairing, type ResolvedTheme, type SchemeKey, type ThemeLayer, type ThemeManifest } from './types'

// =============================================================================
// FILE: src/domains/themes/resolve.ts — the ONE merge: defaults → manifest → style → the merchant's layer.
// Pure. Anything a layer names that the manifest does not allow falls back to the manifest's value, so a stored
// layer can never make a theme render something it was not built for.
// =============================================================================

export function resolveTheme(m: ThemeManifest, layer: ThemeLayer): ResolvedTheme {
  const style = m.styles.find((s) => s.key === layer.style) ?? m.styles[0]!
  const paper = style.schemes.paper
  const schemes = { paper, tint: style.schemes.tint ?? paper, ink: style.schemes.ink ?? paper } satisfies Record<SchemeKey, typeof paper>
  const want = { ...m.defaults, ...layer.settings }
  const settings = {
    pairing: m.allowed.pairings.includes(want.pairing) ? want.pairing : m.defaults.pairing,
    header: m.allowed.headers.includes(want.header) ? want.header : m.defaults.header,
    footer: m.allowed.footers.includes(want.footer) ? want.footer : m.defaults.footer,
  }
  // A stored layer is parsed again here: a section that no longer parses (or that this theme does not allow) is
  // dropped, never rendered half-valid.
  const home = (layer.home ?? m.home).flatMap((s) => { const p = SectionSchema.safeParse(s); return p.success && m.allowed.sections.includes(p.data.key) ? [p.data] : [] })
  return { key: m.key, version: m.version, style: style.key, schemes, settings, home }
}

/** A shop that has never published a theme: Classic, from the two settings it has always had (themes plan T0). */
export function classicFromSettings(accent: string, displayFont: string): ResolvedTheme {
  const pairing: Pairing = (PAIRINGS as readonly string[]).includes(displayFont) ? (displayFont as Pairing) : 'fraunces'
  return resolveTheme(manifestOf('classic', '1.0.0')!, { style: accent, settings: { pairing } })
}

/** The CSS custom properties a section painted in `scheme` sets (the --store-* tokens the shop already uses). */
export function schemeVars(t: ResolvedTheme, scheme: SchemeKey = 'paper'): Record<string, string> {
  const s = t.schemes[scheme]
  return {
    '--store-paper': s.bg, '--store-ink': s.text, '--store-sub': s.sub, '--store-line': s.line, '--store-chip': s.chip,
    '--store-good': s.good, '--store-bad': s.bad, '--store-accent': s.accent,
  }
}
