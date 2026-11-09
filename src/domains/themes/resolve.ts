import { manifestNear, manifestOf } from './catalogue'
import { choicesFor } from './choices'
import { LayerSchema, SettingsSchema, onColour, brandColourProblem } from './layer'
import { PRODUCT_LAYOUTS, SECTION_SCHEMES, SectionSchema, type SectionInstance } from './sections'
import { paletteProblem, readMenus, readSite, textOf, TEXT_STYLES } from './site'
import { FEEL_DEFAULTS, PAGE_DEFAULTS, PAIRINGS, type ChoiceKey, type Pairing, type ResolvedTheme, type Scheme, type SchemeKey, type ThemeLayer, type ThemeManifest, type ThemeSettings } from './types'

// =============================================================================
// FILE: src/domains/themes/resolve.ts — the ONE merge: manifest defaults → style → the merchant's layer.
// Pure. A stored layer is parsed again here; anything it names that the manifest does not allow (or that no
// longer parses) falls back to the manifest's value, so a layer can never make a theme render something it was
// not built for.
// =============================================================================

const pick = <T,>(want: T | undefined, allowed: readonly T[] | null, fallback: T): T => (want !== undefined && (!allowed || allowed.includes(want)) ? want : fallback)

/**
 * A stored layer's settings, key by key: a value this build can't read (an enum value from a newer build, after a
 * revert) drops only itself, never the rest of the merchant's look (architecture review 2026-11-09, finding 7).
 */
export function readSettings(raw: unknown): Partial<ThemeSettings> {
  if (!raw || typeof raw !== 'object') return {}
  const shape = SettingsSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // Own fields only: a stored key such as `constructor` must not reach a built-in (security review 2026-11-09).
    const f = Object.hasOwn(shape, k) ? shape[k] : undefined; if (!f || v === undefined) continue
    const r = f.safeParse(v); if (r.success && r.data !== undefined) out[k] = r.data
  }
  return out as Partial<ThemeSettings>
}

export function resolveTheme(m: ThemeManifest, layer: ThemeLayer): ResolvedTheme {
  const style = m.styles.find((s) => s.key === layer.style) ?? m.styles[0]!
  const parsed = LayerSchema.safeParse({ settings: {}, home: layer.home })
  const want: Partial<ThemeSettings> = readSettings(layer.settings)
  const d = { ...PAGE_DEFAULTS, ...FEEL_DEFAULTS, ...m.defaults } as ThemeSettings
  const c = <K extends ChoiceKey>(k: K): ThemeSettings[K] => pick(want[k] as ThemeSettings[K] | undefined, choicesFor(m, k), d[k])
  const settings: ThemeSettings = {
    pairing: pick(want.pairing, m.allowed.pairings, d.pairing),
    headings: c('headings'),
    size: c('size'),
    corners: c('corners'),
    buttons: c('buttons'),
    spacing: c('spacing'),
    photo: c('photo'),
    hoverPhoto: c('hoverPhoto'),
    phoneColumns: c('phoneColumns'),
    header: pick(want.header, m.allowed.headers, d.header),
    sticky: c('sticky'),
    bottomTabs: c('bottomTabs'),
    announcement: want.announcement === undefined ? d.announcement : want.announcement,
    footer: pick(want.footer, m.allowed.footers, d.footer),
    social: c('social'),
    motion: c('motion'),
    brandColour: want.brandColour === undefined ? d.brandColour : want.brandColour,
    gallery: c('gallery'),
    details: c('details'),
    card: c('card'),
    desktopColumns: c('desktopColumns'),
    collectionTop: c('collectionTop'),
    buttonShape: c('buttonShape'),
    buttonMotion: c('buttonMotion'),
    cardHover: c('cardHover'),
    entrance: c('entrance'),
    reveal: c('reveal'),
    buyBoxSticky: c('buyBoxSticky'),
    buyBar: c('buyBar'),
    footerScheme: c('footerScheme'),
    checkout: c('checkout'),
    labels: c('labels'),
    railCounter: c('railCounter'),
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
  // Site settings (Look v4): the merchant's palette paints the paper scheme (and a tint's accent and buttons); it was
  // contrast-checked at save and is again here (readSite drops a palette that no longer reads).
  const site = readSite(layer.site)
  // Checked against this style too: the palette keeps the theme's sale and saving colours and its tint.
  if (site.palette && paletteProblem(site.palette, [schemes.paper, schemes.tint])) site.palette = null
  if (site.palette) {
    const p = site.palette, onA = onColour(p.accent), onB = onColour(p.primary)
    schemes = {
      paper: { ...schemes.paper, bg: p.background, text: p.text, sub: p.muted, chip: p.surface, accent: p.accent, onAccent: onA, button: p.primary, onButton: onB },
      tint: { ...schemes.tint, accent: p.accent, onAccent: onA, button: p.primary, onButton: onB },
      ink: schemes.ink,
    }
  }
  const masks = m.allowed.heroMasks ?? ['none']
  const layouts = m.allowed.productLayouts ?? PRODUCT_LAYOUTS, schemesOk = m.allowed.sectionSchemes ?? SECTION_SCHEMES, videoOk = m.allowed.videoSections ?? []
  const spotlightOk = (m.allowed.imageTextLayouts ?? []).includes('spotlight'), scriptOk = !!m.allowed.heroScript
  const raw = parsed.success && parsed.data.home ? parsed.data.home : m.home
  const home = raw.flatMap((s): SectionInstance[] => {
    const p = SectionSchema.safeParse(s)
    if (!p.success || !m.allowed.sections.includes(p.data.key)) return []
    let x = p.data
    if (x.key === 'hero' && !masks.includes(x.mask)) x = { ...x, mask: 'none' }
    // Signal plan T1: a layout or scheme this theme doesn't offer falls back to today's default (never renders).
    if (x.key === 'products' && !layouts.includes(x.layout)) x = { ...x, layout: 'grid' }
    if ('scheme' in x && !schemesOk.includes(x.scheme)) x = { ...x, scheme: 'paper' }
    // V1: a theme that doesn't offer video in this section never renders one; the photo shows.
    if ((x.key === 'hero' || x.key === 'image_text') && x.video && !videoOk.includes(x.key)) { const { video: _drop, ...rest } = x; x = rest }
    // Signal 1.2 (S2): the Spotlight layout and the Hero's script line only where the theme offers them.
    if (x.key === 'image_text' && x.layout && !spotlightOk) { const { layout: _drop, ...rest } = x; x = rest }
    if (x.key === 'hero' && x.script !== undefined && !scriptOk) { const { script: _drop, ...rest } = x; x = rest }
    return [x]
  })
  return { key: m.key, version: m.version, style: style.key, schemes, settings, home, ...(m.rhythm ? { rhythm: m.rhythm } : {}), ...(m.scale ? { scale: m.scale } : {}), site, menus: readMenus(layer.menus) }
}

/**
 * A shop's look before it ever published: Classic, from the two settings it has always had (themes plan T0). The one
 * definition: the lazy baseline row on first publish and the first draft read it; migration 0034's backfill is its
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
  const m = manifestNear(row.themeKey, row.themeVersion)
  if (!m) return classicFromSettings(shop.accent, shop.displayFont)
  const s = (row.settings ?? {}) as { settings?: Partial<ThemeSettings>; home?: unknown[]; site?: unknown; menus?: unknown }
  return resolveTheme(m, { style: row.styleKey, settings: s.settings, home: s.home, site: s.site, menus: s.menus })
}

/** The CSS custom properties a section painted in `scheme` sets (the --store-* tokens the shop already uses). */
/** Theme Signal's band: the shop's FINAL accent as the ground (after the brand colour and the palette), its readable
 *  colour as the words and buttons. Derived here, never stored (architecture review finding 4). */
function signalScheme(t: ResolvedTheme): Scheme {
  const p = t.schemes.paper
  return { ...p, bg: p.accent, text: p.onAccent, sub: p.onAccent, line: p.onAccent, chip: p.accent, accent: p.onAccent, onAccent: p.accent, button: p.onAccent, onButton: p.accent, good: p.onAccent, bad: p.onAccent, sale: p.onAccent }
}

export function schemeVars(t: ResolvedTheme, scheme: SchemeKey | 'signal' = 'paper'): Record<string, string> {
  const s = scheme === 'signal' ? signalScheme(t) : t.schemes[scheme]
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
    '--store-h-scale': HSCALE[t.settings.size], '--store-space': GAP[t.settings.spacing], '--store-dcols': String(t.settings.desktopColumns),
    ...siteVars(t),
  }
}

const STROKE = { thin: '1', regular: '1.5', bold: '2' } as const
/** Site settings as custom properties (Look v4): the icon stroke, and each text style the merchant set (a style
 *  left alone sets nothing, so the storefront's own classes stay exactly as they were). */
function siteVars(t: ResolvedTheme): Record<string, string> {
  const out: Record<string, string> = t.site.icons.stroke !== 'regular' ? { '--icon-stroke': STROKE[t.site.icons.stroke] } : {}
  for (const k of TEXT_STYLES) {
    if (!t.site.text[k]) continue
    const x = textOf(t.site, k)
    Object.assign(out, {
      [`--t-${k}-d`]: `${x.desk}px`, [`--t-${k}-p`]: `${x.phone}px`, [`--t-${k}-w`]: String(x.weight),
      [`--t-${k}-f`]: x.family === 'heading' ? 'var(--store-display)' : 'var(--font-inter), system-ui, sans-serif',
      [`--t-${k}-c`]: x.upper ? 'uppercase' : 'none', [`--t-${k}-s`]: x.wide ? '0.08em' : 'normal',
    })
  }
  return out
}
export function settingAttrs(t: ResolvedTheme): Record<string, string> {
  return {
    'data-headings': t.settings.headings, 'data-buttons': t.settings.buttons, 'data-motion': t.settings.motion, 'data-hover': t.settings.hoverPhoto ? 'on' : 'off',
    'data-card': t.settings.card,
    // The 2.0 choices: an attribute only for a value that isn't today's, so a 1.x look's markup is unchanged.
    ...(t.settings.buttonShape !== 'theme' ? { 'data-button-shape': t.settings.buttonShape } : {}),
    ...(t.settings.buttonMotion !== 'press' ? { 'data-button-motion': t.settings.buttonMotion } : {}),
    ...(t.settings.cardHover !== 'none' ? { 'data-card-hover': t.settings.cardHover } : {}),
    ...(t.settings.entrance !== 'none' ? { 'data-entrance': t.settings.entrance } : {}),
    ...(t.settings.reveal ? { 'data-reveal': 'on' } : {}),
    ...(t.rhythm ? { 'data-rhythm': t.rhythm } : {}),
    ...(t.scale ? { 'data-scale': t.scale } : {}),
    ...(t.settings.header === 'overlay' || t.settings.header === 'float' ? { 'data-header': t.settings.header } : {}),
    // Theme Signal: labels as pills or plain, the rail counter, and the grotesk voice on buttons and prices.
    ...(t.settings.labels !== 'none' ? { 'data-labels': t.settings.labels } : {}),
    ...(t.settings.pairing === 'schibsted' ? { 'data-voice': 'grotesk' } : {}),
    // Look v4: one attribute per text style the merchant set (globals.css applies only those).
    ...Object.fromEntries(TEXT_STYLES.filter((k) => t.site.text[k]).map((k) => [`data-t-${k}`, ''])),
  }
}
