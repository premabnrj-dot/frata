import { z } from 'zod'

// =============================================================================
// FILE: src/domains/themes/sections.ts — the section library's SAVE schemas (shape and limits only).
// Rules (themes plan, architecture review 2026-11-08):
//   - A schema changes only ADDITIVELY: a new optional field with a default, or a new enum value. A breaking change
//     is a new section key. __tests__/fixtures/stored-sections-v*.json must keep parsing (append, never edit).
//   - Shape here; whether a section can be published or shown is readinessOf() (facts, dates, alt text).
//   - Text is plain and length-capped; links are shop paths; nothing here is ever rendered as HTML.
// =============================================================================

const id = z.string().regex(/^[a-z0-9-]{1,40}$/)
const text = (max: number) => z.string().max(max)
/** Every scheme a section can wear: `signal` (theme Signal) is drawn from the final accent (schemeVars), never stored
 *  in a style. SECTION_SCHEMES is what a theme offers unless it says (allowed.sectionSchemes). */
export const ALL_SECTION_SCHEMES = ['paper', 'tint', 'ink', 'signal'] as const
export type SectionScheme = (typeof ALL_SECTION_SCHEMES)[number]
export const SECTION_SCHEMES: readonly SectionScheme[] = ['paper', 'tint', 'ink']
const scheme = z.enum(ALL_SECTION_SCHEMES).default('paper')
/** A short label above a section's heading (theme Signal: shown as a pill or plain where the theme offers labels). */
const label = text(24).default('')
const hidden = z.boolean().default(false)

/** A link inside the shop only: never an outside URL (spec § Sections rules). */
export const SHOP_PATH = /^\/(?:|products|products\/[a-z0-9-]{1,80}|collections\/[a-z0-9-]{1,80}|policies\/(?:shipping|returns|privacy|terms|contact)|pages\/[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?)$/
export const shopPath = z.string().regex(SHOP_PATH)

/** One of the shop's own photos in Blob (the action stores only the URL acceptedBase rebuilt for this shop). */
export const ImageSchema = z.object({
  base: z.string().max(300),
  widths: z.array(z.number().int().positive()).min(1).max(4),
  width: z.number().int().positive(), height: z.number().int().positive(),
  alt: text(160).default(''),
  /** Ticked: empty alt on purpose (a pattern, a texture). Unticked with empty alt blocks publishing. */
  decorative: z.boolean().default(false),
  /** Look v3: the point the photo keeps in view when a section crops it, in % from the left and top (null: centre). */
  focus: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).nullable().default(null),
})
export type ThemeImage = z.infer<typeof ImageSchema>

/** Text that is either typed or bound to a shop fact, so the theme shows the shop's own words (and they stay current). */
const bound = (max: number) => z.union([z.object({ from: z.enum(['shopName', 'tagline']) }), z.object({ text: text(max) })])

const button = z.object({ label: text(24), link: shopPath }).nullable().default(null)

/** V1: one of the shop's own videos (a `videos` row, checked to be the shop's at save); shown only where the theme
 *  lists the section in allowed.videoSections, and only once playable. The photo stays: it is the first paint and the
 *  fallback whenever the video can't play. */
const video = z.object({ id: z.string().uuid() }).optional()

export const HeroSchema = z.object({
  id, key: z.literal('hero'), hidden, scheme,
  /** text: words only (Classic) · image_text: words over a photo · split: photo beside words · image: photo only. */
  layout: z.enum(['text', 'image_text', 'split', 'image']).default('text'),
  heading: bound(60),
  text: bound(160).optional(),
  image: ImageSchema.nullable().default(null),
  video,
  button,
  position: z.enum(['bottom_left', 'centre']).default('bottom_left'),
  height: z.enum(['short', 'tall']).default('tall'),
  /** Atelier's arched photo; only where a theme allows it (manifest.allowed.heroMasks). */
  mask: z.enum(['none', 'arch']).default('none'),
  /** Signal 1.2 (S2): a handwritten line above the heading (Caveat), where the theme offers it (allowed.heroScript). */
  script: text(32).optional(),
})

export const CollectionTilesSchema = z.object({
  id, key: z.literal('collection_tiles'), hidden, scheme, label,
  heading: text(40).default(''),
  /** auto: the shop's collections that have products, in title order, first `count` · picked: these, in this order. */
  mode: z.enum(['auto', 'picked']).default('auto'),
  handles: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(8).default([]),
  count: z.number().int().min(2).max(8).default(6),
  shape: z.enum(['portrait', 'square', 'circle']).default('portrait'),
})

export const SOURCE_KEYS = ['newest', 'best_sellers', 'collection', 'under_price', 'on_sale', 'back_in_stock'] as const
export const SourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('newest') }),
  /** Ranked by delivered units over the window (server-side, ids only: ADR-0003). */
  z.object({ kind: z.literal('best_sellers'), days: z.union([z.literal(30), z.literal(90)]).default(90) }),
  z.object({ kind: z.literal('collection'), handle: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
  z.object({ kind: z.literal('under_price'), maxPaise: z.number().int().positive().max(10_00_000_00) }),
  z.object({ kind: z.literal('on_sale') }),
  /** Sold out a day or more, back in the last 30 days (variants.restocked_at, kept by the database). T2. */
  z.object({ kind: z.literal('back_in_stock') }),
])

export const ALL_PRODUCT_LAYOUTS = ['grid', 'rail', 'tabs'] as const
export type ProductLayout = (typeof ALL_PRODUCT_LAYOUTS)[number]
/** What a theme offers unless it says (allowed.productLayouts): tabs are Signal's. */
export const PRODUCT_LAYOUTS: readonly ProductLayout[] = ['grid', 'rail']
/** Tabs (theme Signal): up to 5 collections, up to 8 pieces each (speed review: the tab section stays under 80 kB of HTML). */
export const MAX_TABS = 5, MAX_PER_TAB = 8
export const ProductsSchema = z.object({
  id, key: z.literal('products'), hidden, scheme,
  heading: text(40),
  source: SourceSchema,
  count: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(24)]),
  /** "See all" when the source has more than `count`: only where a page shows the whole list (Shop all, a collection). */
  viewAll: z.boolean().default(true),
  layout: z.enum(ALL_PRODUCT_LAYOUTS).default('grid'),
  label,
  /** layout tabs: the collections, one tab each, by handle (the source is then ignored). */
  tabs: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(MAX_TABS).refine((t) => new Set(t).size === t.length, 'Each collection once.').default([]),
})

const band = z.object({ minPaise: z.number().int().min(0).nullable(), maxPaise: z.number().int().positive().nullable() })
export const PriceTilesSchema = z.object({
  id, key: z.literal('price_tiles'), hidden, scheme,
  heading: text(40).default('Shop by budget'),
  /** Under ₹X (min null) · ₹X–₹Y · Above ₹X (max null). Rupees typed, stored paise. */
  bands: z.array(band).min(1).max(4),
})

export const PROMISES = ['cod', 'free_shipping', 'returns', 'dispatch'] as const
export const PromisesSchema = z.object({
  id, key: z.literal('promises'), hidden, scheme,
  /** Which facts to show. The words come from the shop's settings, so a promise can't be false. */
  show: z.array(z.enum(PROMISES)).min(1).max(4),
})

export const ImageTextSchema = z.object({
  id, key: z.literal('image_text'), hidden, scheme, label,
  /** Signal 1.2 (S2): `spotlight` = words beside a wide photo or loop on a tile; absent = beside (every older theme).
   *  Offered where a theme lists it (allowed.imageTextLayouts). Optional, so older looks resolve exactly as before. */
  layout: z.enum(['spotlight']).optional(),
  image: ImageSchema.nullable().default(null),
  video,
  heading: text(60),
  text: text(600).default(''),
  button,
  side: z.enum(['left', 'right']).default('left'),
})

export const DropTeaserSchema = z.object({
  id, key: z.literal('drop_teaser'), hidden, scheme,
  heading: text(60),
  /** ISO date-time; the section hides itself once it has passed. */
  at: z.string().datetime({ offset: true }),
  image: ImageSchema.nullable().default(null),
})

const run = z.object({ text: text(600), bold: z.boolean().optional(), italic: z.boolean().optional(), link: shopPath.optional() })
export const RichTextSchema = z.object({
  id, key: z.literal('rich_text'), hidden, scheme,
  heading: text(60).default(''),
  /** Paragraphs of runs: the whole rich text a section can hold. Rendered node by node, never as HTML. */
  body: z.array(z.array(run).max(40)).max(12).refine((ps) => ps.flat().reduce((n, r) => n + r.text.length, 0) <= 1200, 'At most 1,200 characters'),
  align: z.enum(['left', 'centre']).default('left'),
})

export const LogosSchema = z.object({
  id, key: z.literal('logos'), hidden, scheme,
  heading: text(40).default('As seen in'),
  images: z.array(ImageSchema).max(8).default([]),
})

/** One photo, up to four pieces pinned on it (themes T2; Editorial 1.1). x and y are percentages of the photo. */
const pin = z.number().min(0).max(100)
export const ShopTheLookSchema = z.object({
  id, key: z.literal('shop_the_look'), hidden, scheme,
  image: ImageSchema.nullable().default(null),
  heading: text(60).default('Shop the look'),
  pieces: z.array(z.object({ handle: z.string().regex(/^[a-z0-9-]{1,100}$/), x: pin, y: pin })).max(4).default([]),
})

/** Signal 1.2 (S2): story cards fanned out, the middle one forward. Lenient (a blank one parses: autosave); fewer than
 *  three cards with photos shows nothing (readiness says so, never blocking). */
export const MAX_CARDS = 7
export const StoryFanSchema = z.object({
  id, key: z.literal('story_fan'), hidden, scheme, label,
  heading: text(60).default(''),
  text: text(160).default(''),
  cards: z.array(z.object({
    image: ImageSchema.nullable().default(null),
    title: text(40).default(''),
    link: shopPath.nullable().default(null),
  })).max(MAX_CARDS).default([]),
})

/** Signal 1.2 (S2): a full-bleed photo with a small line and a handwritten wordmark ("Made for" · "the long way"). */
export const StatementSchema = z.object({
  id, key: z.literal('statement'), hidden, scheme,
  eyebrow: text(24).default(''),
  wordmark: text(32).default(''),
  image: ImageSchema.nullable().default(null),
})

/** Theme Studio TS0b: ids of designs and of their blocks; stable across a theme's versions (carry-over by id). Never a
 *  name an object already has (a fill is a record keyed by block id: security review L1). */
export const BLOCK_ID = /^[a-z0-9-]{1,40}$/
const RESERVED_IDS = new Set(['constructor', 'prototype', '__proto__', 'tostring', 'valueof', 'hasownproperty'])
export const blockId = z.string().regex(BLOCK_ID).refine((v) => !RESERVED_IDS.has(v), 'That id is reserved')
/** A design's rich text: Rich text's paragraphs of runs, each run with words (an empty run can't hold a bare link). */
const designRun = run.extend({ text: z.string().min(1).max(600) })
const runChars = (ps: { text: string; link?: string }[][]) => ps.flat().reduce((n, r) => n + r.text.length + (r.link?.length ?? 0), 0)
export const DesignBodySchema = z.array(z.array(designRun).min(1).max(40)).max(12).refine((ps) => runChars(ps) <= 2000, 'At most 2,000 characters')
export const AccordionItemSchema = z.object({ q: text(80), a: text(600) })

/** What an owner wrote into one block of a design (unknown keys are stripped: what is stored is this parse's output),
 *  tagged with the block's kind (security M2, tenancy HIGH): a fill
 *  only ever lands on a block of its own kind, and every photo is found by its kind (cleanImages). Never a video:
 *  a design's one video is the section's own `video` (TS1). */
export const FillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: text(60) }),
  z.object({ kind: z.literal('text'), body: DesignBodySchema }),
  z.object({ kind: z.literal('image'), image: ImageSchema.nullable() }),
  z.object({ kind: z.literal('button'), label: text(24), link: shopPath }),
  z.object({ kind: z.literal('accordion'), items: z.array(AccordionItemSchema).max(12) }),
])
/** Each fill's caps equal its block's (blocks.ts uses the same text(), DesignBodySchema and AccordionItemSchema):
 *  keep them equal; a block with tighter limits must re-parse its fill in resolveDesign (security review LOW-3). */
export type Fill = z.infer<typeof FillSchema>
const MAX_FILLS = 40, MAX_FILL_CHARS = 10_000
/** The words (and link paths) a fill holds, piece by piece: counted as characters here, as bytes at the save. */
export function fillText(f: Fill): string[] {
  switch (f.kind) {
    case 'heading': return [f.text]
    case 'text': return f.body.flat().flatMap((r) => [r.text, r.link ?? ''])
    case 'image': return f.image ? [f.image.alt] : []
    case 'button': return [f.label, f.link]
    case 'accordion': return f.items.flatMap((i) => [i.q, i.a])
    default: return f satisfies never
  }
}
const fillChars = (f: Fill) => fillText(f).reduce((n, t) => n + t.length, 0)

/** Theme Studio TS0b: a section whose shape the theme fixes (a design, by id); the owner fills the blocks the theme
 *  marks, by block id. Shape and caps only: whether the design and its blocks exist is the manifest's (resolveDesign). */
export const DesignSectionSchema = z.object({
  id, key: z.literal('design'), hidden, scheme, label,
  design: blockId,
  fill: z.record(blockId, FillSchema)
    .refine((f) => Object.keys(f).length <= MAX_FILLS, `At most ${MAX_FILLS} fields`)
    .refine((f) => Object.values(f).reduce((n, x) => n + fillChars(x), 0) <= MAX_FILL_CHARS, 'At most 10,000 characters in one section')
    .default({}),
})

export const SectionSchema = z.discriminatedUnion('key', [
  HeroSchema, CollectionTilesSchema, ProductsSchema, PriceTilesSchema, PromisesSchema, ImageTextSchema, DropTeaserSchema, RichTextSchema, LogosSchema,
  ShopTheLookSchema, StoryFanSchema, StatementSchema, DesignSectionSchema,
])
/** The sections that may carry a V1 loop (where a theme lists them in allowed.videoSections): one list, read everywhere. */
export const VIDEO_KEYS = ['hero', 'image_text'] as const
export type VideoKey = (typeof VIDEO_KEYS)[number]
export type SectionInstance = z.infer<typeof SectionSchema>
/** A section as written in a manifest or a stored layer: defaults may be left out. */
export type SectionInput = z.input<typeof SectionSchema>
export type SectionKey = SectionInstance['key']
export type SectionOf<K extends SectionKey> = Extract<SectionInstance, { key: K }>
export const SECTION_KEYS: SectionKey[] = ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos', 'shop_the_look', 'story_fan', 'statement', 'design']

/** How many of each a page may hold (spec § Sections). */
export const MAX_PER_PAGE: Record<SectionKey, number> = { hero: 3, collection_tiles: 3, products: 8, price_tiles: 1, promises: 1, image_text: 4, drop_teaser: 1, rich_text: 4, logos: 1, shop_the_look: 2, story_fan: 2, statement: 2, design: 4 }
export const MAX_SECTIONS = 20

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
