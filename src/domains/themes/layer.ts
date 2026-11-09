import { z } from 'zod'
import { ON_COLOUR } from './catalogue/kit'
import { choicesFor } from './choices'
import { contrast } from './contrast'
import { SECTION_NAMES, SectionSchema, MAX_PER_PAGE, MAX_SECTIONS, shopPath, type SectionInstance, VIDEO_KEYS, type VideoKey } from './sections'
import { MenusSchema, SiteSchema, menusProblem, siteProblem } from './site'
import { FOOTERS, HEADERS, HEADER_NAMES, PAGE_DEFAULTS, PAIRINGS, type Hex, type Scheme, type ThemeLayer, type ThemeManifest, type ThemeSettings } from './types'

// =============================================================================
// FILE: src/domains/themes/layer.ts — the merchant's layer: its save schema, the brand colour rule, switching
// themes (carryOver). Pure. (The publish dialog's change list went with Look v3: Publish is one line, owner 2026-11-09.)
// =============================================================================

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).transform((h) => h.toUpperCase() as Hex)
export const SettingsSchema = z.object({
  pairing: z.enum(PAIRINGS),
  headings: z.enum(['as_typed', 'upper']),
  size: z.enum(['compact', 'regular', 'large']),
  corners: z.enum(['square', 'soft', 'round']),
  buttons: z.enum(['solid', 'outline', 'underline']),
  spacing: z.enum(['airy', 'regular', 'compact']),
  photo: z.enum(['4:5', '3:4', '1:1']),
  hoverPhoto: z.boolean(),
  phoneColumns: z.union([z.literal(2), z.literal(3)]),
  header: z.enum(HEADERS),
  sticky: z.boolean(),
  bottomTabs: z.boolean(),
  announcement: z.object({ text: z.string().trim().min(1).max(80), link: shopPath.nullable(), scheme: z.enum(['paper', 'tint', 'ink']) }).nullable(),
  footer: z.enum(FOOTERS),
  social: z.boolean(),
  motion: z.enum(['subtle', 'none']),
  brandColour: hex.nullable(),
  // T2, additive (each optional; absent = PAGE_DEFAULTS).
  gallery: z.enum(['swipe', 'thumbs', 'rail', 'stack']),
  details: z.enum(['open', 'folded']),
  card: z.enum(['standard', 'centred', 'framed', 'tile']),
  desktopColumns: z.union([z.literal(3), z.literal(4)]),
  collectionTop: z.enum(['title', 'banner']),
  // 2.0, additive (absent = FEEL_DEFAULTS; which values a theme may use: choicesFor).
  buttonShape: z.enum(['theme', 'pill']),
  buttonMotion: z.enum(['press', 'lift', 'fill']),
  cardHover: z.enum(['none', 'lift', 'zoom']),
  entrance: z.enum(['none', 'fade', 'rise']),
  reveal: z.boolean(),
  buyBoxSticky: z.boolean(),
  buyBar: z.boolean(),
  footerScheme: z.enum(['paper', 'tint', 'ink']),
  checkout: z.enum(['standard', 'focused']),
  labels: z.enum(['none', 'pill', 'plain']),
  railCounter: z.boolean(),
}).partial()

/** A stored or submitted layer, checked for shape. Sections are checked one by one (and again at every read). */
export const LayerSchema = z.object({
  settings: SettingsSchema.default({}),
  home: z.array(z.unknown()).max(MAX_SECTIONS).optional(),
  // Look v4: site settings and menus, in the same layer (draft → publish → undo).
  site: SiteSchema.optional(),
  menus: MenusSchema.optional(),
})
export type StoredLayer = z.infer<typeof LayerSchema>

/** Why a layer can't be saved as it is (shape and limits only). Empty: it can be saved. */
export function layerProblems(layer: unknown): string[] {
  // Site settings and menus first: their problems in the merchant's words.
  const lr = (layer ?? {}) as { site?: unknown; menus?: unknown }
  const own = [siteProblem(lr.site), menusProblem(lr.menus)].filter((x): x is string => !!x)
  if (own.length) return own
  const p = LayerSchema.safeParse(layer)
  if (!p.success) return p.error.issues.map((i) => `${i.path.join('.') || 'look'}: ${i.message}`)
  const out: string[] = []
  const home = (p.data.home ?? []).map((s, i) => ({ i, r: SectionSchema.safeParse(s) }))
  for (const { i, r } of home) if (!r.success) out.push(`Section ${i + 1}: ${r.error.issues[0]?.message ?? 'not valid'}`)
  const counts = new Map<string, number>()
  for (const { r } of home) if (r.success) counts.set(r.data.key, (counts.get(r.data.key) ?? 0) + 1)
  for (const [k, n] of counts) if (n > MAX_PER_PAGE[k as SectionInstance['key']]) out.push(`${SECTION_NAMES[k as SectionInstance['key']]}: at most ${MAX_PER_PAGE[k as SectionInstance['key']]} on a page`)
  const ids = home.filter((h) => h.r.success).map((h) => (h.r.data as SectionInstance).id)
  if (new Set(ids).size !== ids.length) out.push('Two sections share an id')
  return out
}

/** The brand colour replaces the accent on the light schemes (paper, tint); it must read on each of them (spec § Theme settings). */
export function brandColourProblem(colour: string, schemes: Scheme[]): string | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) return 'Pick a colour.'
  for (const s of schemes) if (contrast(colour, s.bg) < 3) return 'Too light on this background. Pick a deeper shade.'
  if (contrast(colour, ON_COLOUR.light) < 4.5 && contrast(colour, ON_COLOUR.dark) < 4.5) return 'Text on it would be hard to read. Pick a deeper or lighter shade.'
  return null
}
/** Text on a brand-colour fill: white when readable, else ink. */
export const onColour = (c: string): Hex => (contrast(c, ON_COLOUR.light) >= 4.5 ? ON_COLOUR.light : ON_COLOUR.dark)

/**
 * Trying another theme: what the merchant set that the new theme allows comes across, the rest takes its defaults
 * (spec § Switching themes). Returns the new layer and, in words, what did not come across.
 */
export function carryOver(from: { manifest: ThemeManifest; layer: ThemeLayer }, to: ThemeManifest): { layer: ThemeLayer; lost: string[] } {
  // Another version of the same theme (Editorial 1.0 → 1.1): everything the merchant made comes across (T2 review).
  // A new major version (Minimal 1 → Studio 2, Editorial 1 → 2) is a new character: it is tried like another theme,
  // so only what the merchant chose comes across (impact review 2026-11-09).
  const major = (v: string) => v.split('.')[0]
  if (from.manifest.key === to.key && major(from.manifest.version) === major(to.version)) {
    const style = to.styles.some((s) => s.key === from.layer.style) ? from.layer.style : to.styles[0]!.key
    const parsed = (from.layer.home ?? []).map((s) => SectionSchema.safeParse(s)).flatMap((r) => (r.success ? [r.data] : []))
    const home = from.layer.home?.filter((s) => { const r = SectionSchema.safeParse(s); return r.success && to.allowed.sections.includes(r.data.key) })
    // Moving back a version (a recall) can drop a section the earlier version lacks: say so (T3 review).
    const lost = [...new Set(parsed.filter((s) => !to.allowed.sections.includes(s.key)).map((s) => `${SECTION_NAMES[s.key]} isn't in ${to.name} ${to.version}`))]
    return { layer: { style, ...(from.layer.settings ? { settings: from.layer.settings } : {}), ...(home ? { home } : {}), ...(from.layer.site !== undefined ? { site: from.layer.site } : {}), ...(from.layer.menus !== undefined ? { menus: from.layer.menus } : {}) }, lost }
  }
  const was = { ...PAGE_DEFAULTS, ...from.manifest.defaults, ...(from.layer.settings ?? {}) } as ThemeSettings
  const lost: string[] = []
  // Only what the merchant chose comes across, never the old theme's defaults: a new theme opens with its own
  // character (plan 2026-11-09-themes-three). Content (brand colour, announcement) always; a layout choice only if
  // the new theme offers that value.
  const mine = from.layer.settings ?? {}
  const settings: Partial<ThemeSettings> = {}
  if (mine.brandColour !== undefined) settings.brandColour = mine.brandColour
  if (mine.announcement !== undefined) settings.announcement = mine.announcement
  for (const k of ['corners', 'photo', 'gallery', 'details', 'card', 'desktopColumns', 'collectionTop'] as const) {
    const v = mine[k]; const list = choicesFor(to, k)
    if (v !== undefined && (!list || (list as readonly unknown[]).includes(v))) (settings as Record<string, unknown>)[k] = v
  }
  // Type the merchant picked in the customizer; Classic's is the font recorded from Settings before themes, so the new
  // theme's own type wins over it.
  if (mine.pairing !== undefined && from.manifest.key !== 'classic') {
    if (to.allowed.pairings.includes(mine.pairing)) settings.pairing = mine.pairing
    else lost.push(`The ${mine.pairing} type isn't in ${to.name}`)
  }
  if (was.header !== from.manifest.defaults.header) {
    if (to.allowed.headers.includes(was.header)) settings.header = was.header
    else lost.push(`The ${HEADER_NAMES[was.header]} header isn't in ${to.name}`)
  }
  const sections = (from.layer.home ?? from.manifest.home).flatMap((s) => { const r = SectionSchema.safeParse(s); return r.success ? [r.data] : [] })
  const kept = sections.filter((s) => to.allowed.sections.includes(s.key))
  for (const s of sections) if (!to.allowed.sections.includes(s.key)) lost.push(`${SECTION_NAMES[s.key]} isn't in ${to.name}`)
  // V1: the section comes across; its video stays only where the new theme offers video there (resolve drops it).
  if (kept.some((s) => (VIDEO_KEYS as readonly string[]).includes(s.key) && 'video' in s && s.video && !(to.allowed.videoSections ?? []).includes(s.key as VideoKey))) lost.push(`Videos aren't in ${to.name}; the photos show`)
  // Keep the merchant's own Home only if they changed it; an untouched Home takes the new theme's.
  const changed = JSON.stringify(from.layer.home ?? null) !== 'null'
  // Site settings are the theme's own (owner 2026-11-09: a new theme brings its palette, type and icons); menus are
  // content and come across.
  if (from.layer.site !== undefined) lost.push('Your site colours, text styles and icons')
  return { layer: { style: to.styles[0]!.key, settings, ...(changed ? { home: kept } : {}), ...(from.layer.menus !== undefined ? { menus: from.layer.menus } : {}) }, lost }
}
