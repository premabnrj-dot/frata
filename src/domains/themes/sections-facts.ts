// =============================================================================
// FILE: src/domains/themes/sections-facts.ts — the half of sections.ts a browser may load: the section library's lists,
// caps, names, words and search, no zod (page weight, 2026-11-23: the customizer and Console › Content read these and
// shipped all of zod, 26 kB gzipped, to every visit). sections.ts re-exports everything here; the save schemas stay
// there, on the server.
// =============================================================================

import type { SectionKey } from './sections'

/** Every scheme a section can wear: `signal` (theme Signal) is drawn from the final accent (schemeVars), never stored
 *  in a style. SECTION_SCHEMES is what a theme offers unless it says (allowed.sectionSchemes). */
export const ALL_SECTION_SCHEMES = ['paper', 'tint', 'ink', 'signal'] as const
export type SectionScheme = (typeof ALL_SECTION_SCHEMES)[number]
export const SECTION_SCHEMES: readonly SectionScheme[] = ['paper', 'tint', 'ink']
/** A link inside the shop only: never an outside URL (spec § Sections rules). */
export const SHOP_PATH = /^\/(?:|products|products\/[a-z0-9-]{1,80}|collections\/[a-z0-9-]{1,80}|policies\/(?:shipping|returns|privacy|terms|contact)|pages\/[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?)$/
export const SOURCE_KEYS = ['newest', 'best_sellers', 'collection', 'under_price', 'on_sale', 'back_in_stock'] as const
export const ALL_PRODUCT_LAYOUTS = ['grid', 'rail', 'tabs'] as const
export type ProductLayout = (typeof ALL_PRODUCT_LAYOUTS)[number]
/** What a theme offers unless it says (allowed.productLayouts): tabs are Signal's. */
export const PRODUCT_LAYOUTS: readonly ProductLayout[] = ['grid', 'rail']
/** Tabs (theme Signal): up to 5 collections, up to 8 pieces each (speed review: the tab section stays under 80 kB of HTML). */
export const MAX_TABS = 5, MAX_PER_TAB = 8
export const PROMISES = ['cod', 'free_shipping', 'returns', 'dispatch'] as const
export const MAX_CARDS = 7
export const BLOCK_ID = /^[a-z0-9-]{1,40}$/
/** TS1b: a design shows what the board draws, no more (architecture 2, 4; speed HIGH 2): a product grid 4 pieces,
 *  collection tiles up to 4, a featured product 1. */
export const GRID_PIECES = 4, MAX_TILES = 4
/** The sections that may carry a V1 loop (where a theme lists them in allowed.videoSections): one list, read everywhere. */
export const VIDEO_KEYS = ['hero', 'image_text', 'design'] as const
export type VideoKey = (typeof VIDEO_KEYS)[number]
export const SECTION_KEYS: SectionKey[] = ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos', 'shop_the_look', 'story_fan', 'statement', 'design']

/** How many of each a page may hold (spec § Sections). */
export const MAX_PER_PAGE: Record<SectionKey, number> = { hero: 3, collection_tiles: 3, products: 8, price_tiles: 1, promises: 1, image_text: 4, drop_teaser: 1, rich_text: 4, logos: 1, shop_the_look: 2, story_fan: 2, statement: 2, design: 4 }
export const MAX_SECTIONS = 20
/** TS1b: at most this many designs drawing pieces or collections on a page (the board's), and loops a Home plays
 *  (owner 2026-11-11: Frrata pays Mux per minute played; a look already past it keeps its loops). Here, not in blocks.ts,
 *  so the customizer's library and forms read them without the block catalogue. */
export const MAX_COMMERCE_DESIGNS = 2, MAX_LOOPS = 3

export const SECTION_NAMES: Record<SectionKey, string> = {
  hero: 'Hero', collection_tiles: 'Collection tiles', products: 'Products', price_tiles: 'Price tiles', promises: 'Shop by promise',
  image_text: 'Image with text', drop_teaser: 'Drop teaser', rich_text: 'Rich text', logos: 'Logos', shop_the_look: 'Shop the look',
  story_fan: 'Story fan', statement: 'Statement', design: 'Design',
}
/** The section library's kinds, in order (Look v3 § Sections); a kind with nothing the theme offers is not shown. */
export const SECTION_KINDS: { name: string; keys: SectionKey[] }[] = [
  /** TS0b: the theme's designs, first (the board); the library lists each design by name, never the bare key. */
  { name: 'Designs', keys: ['design'] },
  { name: 'Banners', keys: ['hero', 'drop_teaser'] },
  { name: 'Products', keys: ['products', 'price_tiles'] },
  { name: 'Collections', keys: ['collection_tiles'] },
  { name: 'Story', keys: ['image_text', 'story_fan', 'statement', 'shop_the_look', 'rich_text'] },
  { name: 'Trust', keys: ['promises', 'logos'] },
]

/** What the library says about each section, and the words it is found by (search: name, then words, then tags). */
export const SECTION_INFO: Record<SectionKey, { blurb: string; tags: string[] }> = {
  hero: { blurb: 'A big photo or your name, with one button', tags: ['banner', 'photo', 'top', 'cover', 'header image', 'welcome'] },
  drop_teaser: { blurb: 'A date for your next drop; hides itself after', tags: ['launch', 'countdown', 'coming soon', 'new collection', 'date'] },
  products: { blurb: 'New in, best sellers, a collection, a price, on sale', tags: ['grid', 'catalogue', 'new arrivals', 'bestsellers', 'sale', 'carousel', 'rail', 'back in stock'] },
  price_tiles: { blurb: 'Shop by budget, from your prices', tags: ['budget', 'price', 'under', 'cheap', 'affordable', 'rupees'] },
  collection_tiles: { blurb: 'Your collections as tiles or circles', tags: ['categories', 'category', 'circles', 'collections', 'shop by'] },
  image_text: { blurb: 'Your story beside a photo', tags: ['about', 'story', 'brand', 'maker', 'craft', 'photo'] },
  shop_the_look: { blurb: 'One photo, up to four pieces pinned on it', tags: ['lookbook', 'outfit', 'styled', 'pins', 'complete the look'] },
  story_fan: { blurb: 'Three to seven story cards, fanned out', tags: ['stories', 'cards', 'lifestyle', 'city', 'carousel', 'gallery', 'moments'] },
  statement: { blurb: 'A full-width photo with a handwritten line', tags: ['wordmark', 'banner', 'quote', 'script', 'tagline', 'full width'] },
  rich_text: { blurb: 'A few paragraphs in your words', tags: ['text', 'words', 'paragraph', 'note', 'size promise', 'made to order'] },
  promises: { blurb: 'Pay on delivery, exchanges, dispatch: from your settings', tags: ['trust', 'cod', 'cash on delivery', 'returns', 'exchange', 'shipping', 'free shipping'] },
  logos: { blurb: 'Press or partner logos', tags: ['press', 'as seen in', 'featured', 'partners', 'trust'] },
  design: { blurb: 'Made for your theme: fill its words and photos', tags: ['design', 'made for', 'block'] },
}

/** A section's name in the console: a design by its own name (Size help), never "Design" (impact review: one rule). */
export const sectionName = (s: { key: SectionKey; design?: string }, designs?: Record<string, { name: string }>) =>
  s.key === 'design' && s.design && designs && Object.hasOwn(designs, s.design) ? designs[s.design]!.name : SECTION_NAMES[s.key]

/** TS0b: the library's search over a theme's designs, by the same rule (every word; name, then line, then tags). */
export function searchDesigns<D extends { id: string; name: string; line: string; tags: string[] }>(query: string, ds: readonly D[]): D[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...ds]
  const score = (d: D) => { let t = 0; for (const w of words) { const s = d.name.toLowerCase().includes(w) ? 3 : d.line.toLowerCase().includes(w) ? 2 : d.tags.join(' ').toLowerCase().includes(w) ? 1 : 0; if (!s) return 0; t += s } return t }
  return ds.map((d, i) => ({ d, i, s: score(d) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.d)
}

/**
 * The library's search (pure): the sections whose name, words or tags hold every word typed, best first (a name
 * match before a words match before a tag match). An empty query keeps the order given.
 */
export function searchSections(query: string, keys: readonly SectionKey[]): SectionKey[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...keys]
  const score = (k: SectionKey) => {
    const name = SECTION_NAMES[k].toLowerCase(), info = SECTION_INFO[k], blurb = info.blurb.toLowerCase(), tags = info.tags.join(' ').toLowerCase()
    let total = 0
    for (const w of words) {
      const s = name.includes(w) ? 3 : blurb.includes(w) ? 2 : tags.includes(w) ? 1 : 0
      if (!s) return 0
      total += s
    }
    return total
  }
  return keys.map((k, i) => ({ k, i, s: score(k) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k)
}
