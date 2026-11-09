import { z } from 'zod'
import { ON_COLOUR } from './catalogue/kit'
import { contrast } from './contrast'
import { ICON_NAMES, type IconName } from '../icons/names'
import { shopPath } from './sections'
import type { Hex, Scheme } from './types'

// =============================================================================
// FILE: src/domains/themes/site.ts — Site settings and menus (Look v4, owner-approved 2026-11-09). Pure.
// Site settings are the shop's design system: a palette of six roles, eight text styles, the icon library and its
// stroke. Menus are the shop's navigation. Both live in the look's layer (draft → publish → undo); a theme gives the
// starting values (owner: a new theme brings its own palette, type and icons; menus are content and come across).
// Absent = the theme's look exactly, so no 1.x or 2.x look moves until a merchant sets something.
// =============================================================================

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).transform((h) => h.toUpperCase() as Hex)

/** The six colour roles every shop has (names a merchant reads; none can be removed). */
export const PALETTE_ROLES = ['primary', 'accent', 'background', 'surface', 'text', 'muted'] as const
export type PaletteRole = (typeof PALETTE_ROLES)[number]
export type Palette = Record<PaletteRole, Hex>
export const PALETTE_NAMES: Record<PaletteRole, { name: string; use: string }> = {
  primary: { name: 'Primary', use: 'Buttons' }, accent: { name: 'Accent', use: 'Badges, links, prices off' },
  background: { name: 'Background', use: 'The page' }, surface: { name: 'Surface', use: 'Cards, bars, tiles' },
  text: { name: 'Text', use: 'Words' }, muted: { name: 'Muted', use: 'Second words' },
}

export const TEXT_STYLES = ['display', 'h1', 'h2', 'h3', 'body', 'small', 'button', 'price'] as const
export type TextStyleKey = (typeof TEXT_STYLES)[number]
export type TextStyle = { family: 'heading' | 'body'; desk: number; phone: number; weight: 400 | 500 | 600 | 700; upper: boolean; wide: boolean }
export const TEXT_NAMES: Record<TextStyleKey, string> = { display: 'Display', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', body: 'Body', small: 'Small', button: 'Button', price: 'Price' }
/** What every shop showed before text styles (the storefront's own classes), so a style left alone changes nothing. */
export const TEXT_DEFAULTS: Record<TextStyleKey, TextStyle> = {
  display: { family: 'heading', desk: 60, phone: 36, weight: 400, upper: false, wide: false },
  h1: { family: 'heading', desk: 30, phone: 24, weight: 400, upper: false, wide: false },
  h2: { family: 'heading', desk: 20, phone: 20, weight: 400, upper: false, wide: false },
  h3: { family: 'body', desk: 18, phone: 18, weight: 500, upper: false, wide: false },
  body: { family: 'body', desk: 16, phone: 16, weight: 400, upper: false, wide: false },
  small: { family: 'body', desk: 13, phone: 13, weight: 400, upper: false, wide: false },
  button: { family: 'body', desk: 14, phone: 14, weight: 500, upper: false, wide: false },
  price: { family: 'body', desk: 16, phone: 16, weight: 500, upper: false, wide: false },
}
/** Sizes a merchant may set, per style (px): big enough to read on a phone, small enough to fit. */
export const TEXT_RANGE: Record<TextStyleKey, [number, number]> = {
  display: [28, 96], h1: [20, 64], h2: [16, 48], h3: [14, 32], body: [14, 20], small: [11, 15], button: [12, 18], price: [13, 28],
}

export const ICON_LIBRARIES = ['line', 'duotone', 'solid'] as const
export type IconLibrary = (typeof ICON_LIBRARIES)[number]
export const ICON_STROKES = ['thin', 'regular', 'bold'] as const
export type IconStroke = (typeof ICON_STROKES)[number]

export type SiteSettings = {
  palette: Palette | null
  text: Partial<Record<TextStyleKey, Partial<TextStyle>>>
  icons: { library: IconLibrary; stroke: IconStroke }
}
export const SITE_DEFAULTS: SiteSettings = { palette: null, text: {}, icons: { library: 'line', stroke: 'regular' } }

const style = z.object({
  family: z.enum(['heading', 'body']), desk: z.number().int().min(11).max(96), phone: z.number().int().min(11).max(64),
  weight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]), upper: z.boolean(), wide: z.boolean(),
}).partial()
export const SiteSchema = z.object({
  palette: z.object(Object.fromEntries(PALETTE_ROLES.map((r) => [r, hex])) as Record<PaletteRole, typeof hex>).nullable(),
  text: z.object(Object.fromEntries(TEXT_STYLES.map((k) => [k, style])) as Record<TextStyleKey, typeof style>).partial(),
  icons: z.object({ library: z.enum(ICON_LIBRARIES), stroke: z.enum(ICON_STROKES) }),
}).partial()

/** Why a palette can't be used (null: it can): every pair a shop page puts together must read. */
export function paletteProblem(p: Palette): string | null {
  if (contrast(p.text, p.background) < 4.5) return 'Text is hard to read on the background.'
  if (contrast(p.muted, p.background) < 4.5) return 'Muted words are hard to read on the background.'
  if (contrast(p.text, p.surface) < 4.5) return 'Text is hard to read on the surface colour.'
  if (contrast(p.accent, p.background) < 3) return 'The accent is too faint on the background.'
  if (Math.max(contrast(ON_COLOUR.light, p.primary), contrast(ON_COLOUR.dark, p.primary)) < 4.5) return 'Button words would be hard to read on the primary colour.'
  return null
}
/** A theme style's paper scheme as a palette (where a merchant's palette starts). */
export const paletteOf = (s: Scheme): Palette => ({ primary: s.button, accent: s.accent, background: s.bg, surface: s.chip, text: s.text, muted: s.sub })

/** A size clamped to its style's range. */
export const clampSize = (k: TextStyleKey, n: number) => Math.min(TEXT_RANGE[k][1], Math.max(TEXT_RANGE[k][0], Math.round(n)))
/** A text style as set (over the defaults), sizes held to the style's range. */
export function textOf(site: SiteSettings, k: TextStyleKey): TextStyle {
  const t = { ...TEXT_DEFAULTS[k], ...site.text[k] }
  return { ...t, desk: clampSize(k, t.desk), phone: clampSize(k, Math.min(t.phone, TEXT_RANGE[k][1])) }
}

// ── Menus ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type MenuItem = { id: string; label: string; link: string; icon: IconName | null; children: MenuItem[] }
export type Menus = { main: MenuItem[] | null; footer: MenuItem[] | null; tabs: MenuItem[] | null }
/** Limits (Baymard 2026: subdivide past ~10; Shopify: 3 levels). */
export const MENU_LIMITS = { depth: 3, items: 12, tabs: 5, label: 40 } as const

const item: z.ZodType<MenuItem> = z.lazy(() => z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), label: z.string().trim().min(1).max(MENU_LIMITS.label), link: shopPath,
  icon: z.enum(ICON_NAMES).nullable().default(null), children: z.array(item).max(MENU_LIMITS.items).default([]),
}) as z.ZodType<MenuItem>)
const depthOk = (xs: MenuItem[], d = 1): boolean => xs.every((x) => (x.children.length ? d < MENU_LIMITS.depth && depthOk(x.children, d + 1) : true))
export const MenusSchema = z.object({
  main: z.array(item).max(MENU_LIMITS.items).refine((xs) => depthOk(xs), 'At most 3 levels').nullable(),
  footer: z.array(item).max(MENU_LIMITS.items).refine((xs) => xs.every((x) => !x.children.length), 'One level').nullable(),
  tabs: z.array(item).max(MENU_LIMITS.tabs).refine((xs) => xs.every((x) => !x.children.length && x.icon), 'Each tab needs an icon and no sub-items').nullable(),
}).partial()

/** The menus a shop shows: what the merchant made, else the ones made from its collections (as before menus). */
export function menusOf(set: Partial<Menus> | undefined, collections: { handle: string; title: string }[]): Menus {
  const fromCollections: MenuItem[] = [{ id: 'shop-all', label: 'Shop all', link: '/products', icon: null, children: [] },
    ...collections.slice(0, 5).map((c) => ({ id: `c-${c.handle}`.slice(0, 40), label: c.title.slice(0, MENU_LIMITS.label), link: `/collections/${c.handle}`, icon: null, children: [] }))]
  return { main: set?.main ?? fromCollections, footer: set?.footer ?? null, tabs: set?.tabs ?? null }
}
/** Soft warnings while editing (never refusals): long menus overwhelm shoppers (Baymard 2026). */
export function menuWarnings(xs: MenuItem[]): string[] {
  const out: string[] = []
  if (xs.length > 7) out.push('More than 7 top items: shoppers find fewer faster.')
  for (const x of xs) if (x.children.length > 10) out.push(`${x.label} has more than 10 items: split it.`)
  return out
}

// ── Reading a stored layer ──────────────────────────────────────────────────────────────────────────────────────
/** A stored layer's site settings, part by part: a part this build can't read drops only itself (as readSettings). */
export function readSite(raw: unknown): SiteSettings {
  if (!raw || typeof raw !== 'object') return SITE_DEFAULTS
  const r = raw as Record<string, unknown>
  const pal = Object.hasOwn(r, 'palette') ? SiteSchema.shape.palette.safeParse(r.palette) : null
  const palette = pal?.success && pal.data && !paletteProblem(pal.data as Palette) ? (pal.data as Palette) : null
  const text: SiteSettings['text'] = {}
  if (Object.hasOwn(r, 'text') && r.text && typeof r.text === 'object') {
    for (const k of TEXT_STYLES) {
      if (!Object.hasOwn(r.text, k)) continue
      const p = style.safeParse((r.text as Record<string, unknown>)[k]); if (p.success && Object.keys(p.data).length) text[k] = p.data
    }
  }
  const ic = Object.hasOwn(r, 'icons') ? SiteSchema.shape.icons.safeParse(r.icons) : null
  return { palette, text, icons: ic?.success && ic.data ? ic.data : SITE_DEFAULTS.icons }
}
/** A stored layer's menus, menu by menu (null: the shop's default for that menu). */
export function readMenus(raw: unknown): Partial<Menus> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Menus> = {}
  for (const k of ['main', 'footer', 'tabs'] as const) {
    if (!Object.hasOwn(raw, k)) continue
    const p = MenusSchema.shape[k].safeParse((raw as Record<string, unknown>)[k]); if (p.success && p.data) out[k] = p.data
  }
  return out
}
/** Why a submitted site block can't be saved (null: it can). */
export function siteProblem(raw: unknown): string | null {
  if (raw === undefined) return null
  const p = SiteSchema.safeParse(raw)
  if (!p.success) return 'Site settings: ' + (p.error.issues[0]?.message ?? 'not valid')
  return p.data.palette ? paletteProblem(p.data.palette as Palette) : null
}
/** Why submitted menus can't be saved (null: they can). */
export function menusProblem(raw: unknown): string | null {
  if (raw === undefined) return null
  const p = MenusSchema.safeParse(raw)
  if (!p.success) { const i = p.error.issues[0]; return `${i?.path[0] === 'tabs' ? 'Phone tabs' : i?.path[0] === 'footer' ? 'Footer menu' : 'Main menu'}: ${i?.message ?? 'not valid'}` }
  const ids = [...(p.data.main ?? []), ...(p.data.footer ?? []), ...(p.data.tabs ?? [])].flatMap(function all(x: MenuItem): string[] { return [x.id, ...x.children.flatMap(all)] })
  return new Set(ids).size === ids.length ? null : 'Two menu items share an id'
}
