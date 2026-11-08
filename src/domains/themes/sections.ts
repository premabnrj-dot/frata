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
const scheme = z.enum(['paper', 'tint', 'ink']).default('paper')
const hidden = z.boolean().default(false)

/** A link inside the shop only: never an outside URL (spec § Sections rules). */
export const SHOP_PATH = /^\/(?:|products|products\/[a-z0-9-]{1,80}|collections\/[a-z0-9-]{1,80}|policies\/(?:shipping|returns|privacy|terms|contact))$/
export const shopPath = z.string().regex(SHOP_PATH)

/** One of the shop's own photos in Blob (the action stores only the URL acceptedBase rebuilt for this shop). */
export const ImageSchema = z.object({
  base: z.string().max(300),
  widths: z.array(z.number().int().positive()).min(1).max(4),
  width: z.number().int().positive(), height: z.number().int().positive(),
  alt: text(160).default(''),
  /** Ticked: empty alt on purpose (a pattern, a texture). Unticked with empty alt blocks publishing. */
  decorative: z.boolean().default(false),
})
export type ThemeImage = z.infer<typeof ImageSchema>

/** Text that is either typed or bound to a shop fact, so the theme shows the shop's own words (and they stay current). */
const bound = (max: number) => z.union([z.object({ from: z.enum(['shopName', 'tagline']) }), z.object({ text: text(max) })])

const button = z.object({ label: text(24), link: shopPath }).nullable().default(null)

export const HeroSchema = z.object({
  id, key: z.literal('hero'), hidden, scheme,
  /** text: words only (Classic) · image_text: words over a photo · split: photo beside words · image: photo only. */
  layout: z.enum(['text', 'image_text', 'split', 'image']).default('text'),
  heading: bound(60),
  text: bound(160).optional(),
  image: ImageSchema.nullable().default(null),
  button,
  position: z.enum(['bottom_left', 'centre']).default('bottom_left'),
  height: z.enum(['short', 'tall']).default('tall'),
  /** Atelier's arched photo; only where a theme allows it (manifest.allowed.heroMasks). */
  mask: z.enum(['none', 'arch']).default('none'),
})

export const CollectionTilesSchema = z.object({
  id, key: z.literal('collection_tiles'), hidden, scheme,
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

export const ProductsSchema = z.object({
  id, key: z.literal('products'), hidden, scheme,
  heading: text(40),
  source: SourceSchema,
  count: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(24)]),
  /** "See all" when the source has more than `count`: only where a page shows the whole list (Shop all, a collection). */
  viewAll: z.boolean().default(true),
  layout: z.enum(['grid', 'rail']).default('grid'),
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
  id, key: z.literal('image_text'), hidden, scheme,
  image: ImageSchema.nullable().default(null),
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

export const SectionSchema = z.discriminatedUnion('key', [
  HeroSchema, CollectionTilesSchema, ProductsSchema, PriceTilesSchema, PromisesSchema, ImageTextSchema, DropTeaserSchema, RichTextSchema, LogosSchema,
  ShopTheLookSchema,
])
export type SectionInstance = z.infer<typeof SectionSchema>
/** A section as written in a manifest or a stored layer: defaults may be left out. */
export type SectionInput = z.input<typeof SectionSchema>
export type SectionKey = SectionInstance['key']
export type SectionOf<K extends SectionKey> = Extract<SectionInstance, { key: K }>
export const SECTION_KEYS: SectionKey[] = ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos', 'shop_the_look']

/** How many of each a page may hold (spec § Sections). */
export const MAX_PER_PAGE: Record<SectionKey, number> = { hero: 3, collection_tiles: 3, products: 8, price_tiles: 1, promises: 1, image_text: 4, drop_teaser: 1, rich_text: 4, logos: 1, shop_the_look: 2 }
export const MAX_SECTIONS = 20

export const SECTION_NAMES: Record<SectionKey, string> = {
  hero: 'Hero', collection_tiles: 'Collection tiles', products: 'Products', price_tiles: 'Price tiles', promises: 'Shop by promise',
  image_text: 'Image with text', drop_teaser: 'Drop teaser', rich_text: 'Rich text', logos: 'Logos', shop_the_look: 'Shop the look',
}
/** The Add sheet's kinds (mockup "Add a section"); empty kinds are not shown. */
export const SECTION_KINDS: { name: string; keys: SectionKey[] }[] = [
  { name: 'Products', keys: ['products', 'price_tiles'] },
  { name: 'Collections', keys: ['collection_tiles'] },
  { name: 'Images and story', keys: ['hero', 'image_text', 'shop_the_look', 'drop_teaser', 'rich_text', 'logos'] },
  { name: 'Trust', keys: ['promises'] },
]
