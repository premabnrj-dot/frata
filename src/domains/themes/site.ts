import { z } from 'zod'
import { ICON_NAMES } from '../icons/names'
import { shopPath } from './sections'
import { ICON_LIBRARIES, ICON_STROKES, MENU_LIMITS, type MenuItem, PALETTE_ROLES, type Palette, type PaletteRole, SITE_DEFAULTS, type SiteSettings, TEXT_STYLES, type TextStyleKey, paletteProblem } from './site-facts'
import type { Hex } from './types'

// =============================================================================
// FILE: src/domains/themes/site.ts — Site settings and menus (Look v4, owner-approved 2026-11-09). Pure.
// Site settings are the shop's design system: a palette of six roles, eight text styles, the icon library and its
// stroke, in the look's layer (draft → publish → undo); a theme gives the starting values (owner: a new theme brings its
// own palette, type and icons). Menus are the store's navigation: their shape and limits live here, their rows in the
// store's content since V1 (src/domains/content/kinds.ts reads and saves them).
// Absent = the theme's look exactly, so no 1.x or 2.x look moves until a merchant sets something.
// =============================================================================

// The roles, styles, defaults, menus' shape and limits, and the palette rule live in site-facts.ts, which a browser may
// load (no zod).
export * from './site-facts'

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).transform((h) => h.toUpperCase() as Hex)

const style = z.object({
  family: z.enum(['heading', 'body']), desk: z.number().int().min(11).max(96), phone: z.number().int().min(11).max(64),
  weight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]), upper: z.boolean(), wide: z.boolean(),
}).partial()
export const SiteSchema = z.object({
  palette: z.object(Object.fromEntries(PALETTE_ROLES.map((r) => [r, hex])) as Record<PaletteRole, typeof hex>).nullable(),
  text: z.object(Object.fromEntries(TEXT_STYLES.map((k) => [k, style])) as Record<TextStyleKey, typeof style>).partial(),
  icons: z.object({ library: z.enum(ICON_LIBRARIES), stroke: z.enum(ICON_STROKES) }),
}).partial()

// ── Menus ───────────────────────────────────────────────────────────────────────────────────────────────────────
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
/** Why a submitted site block can't be saved (null: it can). */
export function siteProblem(raw: unknown): string | null {
  if (raw === undefined) return null
  const p = SiteSchema.safeParse(raw)
  if (!p.success) return 'Site settings: ' + (p.error.issues[0]?.message ?? 'not valid')
  return p.data.palette ? paletteProblem(p.data.palette as Palette) : null
}
