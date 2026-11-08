import { manifestOf } from './catalogue'
import { LayerSchema, onColour, brandColourProblem } from './layer'
import { SectionSchema, type SectionInstance } from './sections'
import { PAIRINGS, type Pairing, type ResolvedTheme, type Scheme, type SchemeKey, type ThemeLayer, type ThemeManifest, type ThemeSettings } from './types'

// =============================================================================
// FILE: src/domains/themes/resolve.ts — the ONE merge: manifest defaults → style → the merchant's layer.
// Pure. A stored layer is parsed again here; anything it names that the manifest does not allow (or that no
// longer parses) falls back to the manifest's value, so a layer can never make a theme render something it was
// not built for.
// =============================================================================

const pick = <T,>(want: T | undefined, allowed: readonly T[] | null, fallback: T): T => (want !== undefined && (!allowed || allowed.includes(want)) ? want : fallback)

export function resolveTheme(m: ThemeManifest, layer: ThemeLayer): ResolvedTheme {
  const style = m.styles.find((s) => s.key === layer.style) ?? m.styles[0]!
  const parsed = LayerSchema.safeParse({ settings: layer.settings ?? {}, home: layer.home })
  const want: Partial<ThemeSettings> = parsed.success ? (parsed.data.settings as Partial<ThemeSettings>) : {}
  const d = m.defaults
  const settings: ThemeSettings = {
    pairing: pick(want.pairing, m.allowed.pairings, d.pairing),
    headings: pick(want.headings, null, d.headings),
    size: pick(want.size, null, d.size),
    corners: pick(want.corners, null, d.corners),
    buttons: pick(want.buttons, null, d.buttons),
    spacing: pick(want.spacing, null, d.spacing),
    photo: pick(want.photo, null, d.photo),
    hoverPhoto: pick(want.hoverPhoto, null, d.hoverPhoto),
    phoneColumns: pick(want.phoneColumns, null, d.phoneColumns),
    header: pick(want.header, m.allowed.headers, d.header),
    sticky: pick(want.sticky, null, d.sticky),
    bottomTabs: pick(want.bottomTabs, null, d.bottomTabs),
    announcement: want.announcement === undefined ? d.announcement : want.announcement,
    footer: pick(want.footer, m.allowed.footers, d.footer),
    social: pick(want.social, null, d.social),
    motion: pick(want.motion, null, d.motion),
    brandColour: want.brandColour === undefined ? d.brandColour : want.brandColour,
  }
  // 3 photo columns on a phone only with a squarer photo (spec § Theme settings).
  if (settings.phoneColumns === 3 && settings.photo === '4:5') settings.phoneColumns = 2
  const paper = style.schemes.paper
  let schemes: Record<SchemeKey, Scheme> = { paper, tint: style.schemes.tint ?? paper, ink: style.schemes.ink ?? paper }
  // The brand colour replaces the accent where it reads (it was checked at save; checked again: a stale layer can't paint unreadably).
  // On the light schemes only: a dark scheme keeps its own bright accent (a deep brand colour can't read on it).
  if (settings.brandColour && !brandColourProblem(settings.brandColour, [schemes.paper, schemes.tint])) {
    const c = settings.brandColour, on = onColour(c)
    schemes = { paper: { ...schemes.paper, accent: c, onAccent: on }, tint: { ...schemes.tint, accent: c, onAccent: on }, ink: schemes.ink }
  } else settings.brandColour = null
  const masks = m.allowed.heroMasks ?? ['none']
  const raw = parsed.success && parsed.data.home ? parsed.data.home : m.home
  const home = raw.flatMap((s): SectionInstance[] => {
    const p = SectionSchema.safeParse(s)
    if (!p.success || !m.allowed.sections.includes(p.data.key)) return []
    return [p.data.key === 'hero' && !masks.includes(p.data.mask) ? { ...p.data, mask: 'none' } : p.data]
  })
  return { key: m.key, version: m.version, style: style.key, schemes, settings, home }
}

/**
 * A shop's look before it ever published: Classic, from the two settings it has always had (themes plan T0). The one
 * definition: the lazy baseline row on first publish and the first draft read it; migration 0032's backfill is its
 * SQL twin (SQL can't import this; keep the two equal).
 */
export function baselineRevision(accent: string, displayFont: string) {
  const pairing: Pairing = (PAIRINGS as readonly string[]).includes(displayFont) ? (displayFont as Pairing) : 'fraunces'
  return { themeKey: 'classic', themeVersion: '1.0.0', styleKey: accent, settings: { settings: { pairing } } }
}

/** A shop that has never published a theme: its baseline, resolved. */
export function classicFromSettings(accent: string, displayFont: string): ResolvedTheme {
  const b = baselineRevision(accent, displayFont)
  return resolveTheme(manifestOf(b.themeKey, b.themeVersion)!, { style: b.styleKey, ...b.settings })
}

/** A published (or previewed) revision as stored, resolved; an unknown theme or version falls back to Classic. */
export function resolveStored(row: { themeKey: string; themeVersion: string; styleKey: string; settings: unknown } | null, shop: { accent: string; displayFont: string }): ResolvedTheme {
  if (!row) return classicFromSettings(shop.accent, shop.displayFont)
  const m = manifestOf(row.themeKey, row.themeVersion)
  if (!m) return classicFromSettings(shop.accent, shop.displayFont)
  const s = (row.settings ?? {}) as { settings?: Partial<ThemeSettings>; home?: unknown[] }
  return resolveTheme(m, { style: row.styleKey, settings: s.settings, home: s.home })
}

/** The CSS custom properties a section painted in `scheme` sets (the --store-* tokens the shop already uses). */
export function schemeVars(t: ResolvedTheme, scheme: SchemeKey = 'paper'): Record<string, string> {
  const s = t.schemes[scheme]
  return {
    '--store-paper': s.bg, '--store-ink': s.text, '--store-sub': s.sub, '--store-line': s.line, '--store-chip': s.chip,
    '--store-good': s.good, '--store-bad': s.bad, '--store-accent': s.accent,
    '--store-on-accent': s.onAccent, '--store-button': s.button, '--store-on-button': s.onButton, '--store-sale': s.sale,
  }
}

const RADIUS = { square: '0px', soft: 'var(--radius-sm)', round: '0.75rem' } as const // soft = rounded-sm, today's corners
const RATIO = { '4:5': '4 / 5', '3:4': '3 / 4', '1:1': '1 / 1' } as const
const HSCALE = { compact: '0.9', regular: '1', large: '1.12' } as const
const GAP = { airy: '1.4', regular: '1', compact: '0.7' } as const
/** The shell's custom properties and data attributes for the theme's settings (globals.css reads them). */
export function settingVars(t: ResolvedTheme): Record<string, string> {
  return {
    ...schemeVars(t),
    '--store-radius': RADIUS[t.settings.corners], '--store-ratio': RATIO[t.settings.photo], '--store-cols': String(t.settings.phoneColumns),
    '--store-h-scale': HSCALE[t.settings.size], '--store-space': GAP[t.settings.spacing],
  }
}
export function settingAttrs(t: ResolvedTheme): Record<string, string> {
  return {
    'data-headings': t.settings.headings, 'data-buttons': t.settings.buttons, 'data-motion': t.settings.motion, 'data-hover': t.settings.hoverPhoto ? 'on' : 'off',
  }
}
