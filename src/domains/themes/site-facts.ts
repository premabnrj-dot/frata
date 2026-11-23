// =============================================================================
// FILE: src/domains/themes/site-facts.ts — the half of site.ts a browser may load: the palette's roles and its rule, the
// text styles, the icon choices, the menus' shape and limits, no zod (page weight, 2026-11-23: the customizer's site
// form and Console › Content's menus read these and shipped all of zod). site.ts re-exports everything here; the
// stored layer's schemas and their read stay there.
// =============================================================================

import { ON_COLOUR } from './catalogue/kit'
import { contrast } from './contrast'
import type { IconName } from '../icons/names'
import type { Hex, Scheme } from './types'

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
/** Why a palette can't be used (null: it can): every pair a shop page puts together must read. */
/** With `theme` (the style's light schemes, paper first): the colours the palette keeps from the theme (sale, saving
 *  and problem words, and the tint's background) must read on it too (impact review 2026-11-09: a dark background
 *  passed while the price-off words didn't). */
export function paletteProblem(p: Palette, theme?: Scheme[]): string | null {
  if (contrast(p.text, p.background) < 4.5) return 'Text is hard to read on the background.'
  if (contrast(p.muted, p.background) < 4.5) return 'Muted words are hard to read on the background.'
  if (contrast(p.text, p.surface) < 4.5) return 'Text is hard to read on the surface colour.'
  if (contrast(p.accent, p.background) < 3) return 'The accent is too faint on the background.'
  if (Math.max(contrast(ON_COLOUR.light, p.primary), contrast(ON_COLOUR.dark, p.primary)) < 4.5) return 'Button words would be hard to read on the primary colour.'
  const paper = theme?.[0]
  if (paper && Math.min(contrast(paper.sale, p.background), contrast(paper.good, p.background), contrast(paper.bad, p.background)) < 4.5) return 'Sale and saving words would be hard to read on this background. Pick a lighter one.'
  for (const t of theme?.slice(1) ?? []) if (contrast(p.accent, t.bg) < 3) return 'The accent is too faint on the theme’s tinted sections.'
  return null
}
/** A theme style's paper scheme as a palette (where a merchant's palette starts). */
export const paletteOf = (s: Scheme): Palette => ({ primary: s.button, accent: s.accent, background: s.bg, surface: s.chip, text: s.text, muted: s.sub })

/** A size clamped to its style's range. */
export const clampSize = (k: TextStyleKey, n: number) => Math.min(TEXT_RANGE[k][1], Math.max(TEXT_RANGE[k][0], Math.round(n)))
/** A text style as set (over the defaults), sizes held to the style's range. */
export function textOf(site: SiteSettings, k: TextStyleKey): TextStyle {
  const t = { ...TEXT_DEFAULTS[k], ...site.text[k] }
  return { ...t, desk: clampSize(k, t.desk), phone: clampSize(k, t.phone) }
}
export type MenuItem = { id: string; label: string; link: string; icon: IconName | null; children: MenuItem[] }
export type Menus = { main: MenuItem[] | null; footer: MenuItem[] | null; tabs: MenuItem[] | null }
/** Limits (Baymard 2026: subdivide past ~10; Shopify: 3 levels). */
export const MENU_LIMITS = { depth: 3, items: 12, tabs: 5, label: 40 } as const
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
/** Site settings the merchant hasn't changed from the defaults: stored as absent, so trying another theme loses nothing. */
export const siteIsDefault = (x: SiteSettings) => !x.palette && !Object.keys(x.text).length && x.icons.library === SITE_DEFAULTS.icons.library && x.icons.stroke === SITE_DEFAULTS.icons.stroke
