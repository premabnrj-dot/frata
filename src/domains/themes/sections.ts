import { z } from 'zod'
import { ALL_PRODUCT_LAYOUTS, ALL_SECTION_SCHEMES, BLOCK_ID, MAX_CARDS, MAX_TABS, MAX_TILES, PROMISES, SHOP_PATH } from './sections-facts'

// =============================================================================
// FILE: src/domains/themes/sections.ts — the section library's SAVE schemas (shape and limits only).
// Rules (themes plan, architecture review 2026-11-08):
//   - A schema changes only ADDITIVELY: a new optional field with a default, or a new enum value. A breaking change
//     is a new section key. __tests__/fixtures/stored-sections-v*.json must keep parsing (append, never edit).
//   - Shape here; whether a section can be published or shown is readinessOf() (facts, dates, alt text).
//   - Text is plain and length-capped; links are shop paths; nothing here is ever rendered as HTML.
// =============================================================================

// The lists, caps, names and the library's search live in sections-facts.ts, which a browser may load (no zod).
export * from './sections-facts'

const id = z.string().regex(/^[a-z0-9-]{1,40}$/)
const text = (max: number) => z.string().max(max)
const scheme = z.enum(ALL_SECTION_SCHEMES).default('paper')
/** A short label above a section's heading (theme Signal: shown as a pill or plain where the theme offers labels). */
const label = text(24).default('')
const hidden = z.boolean().default(false)

export const shopPath = z.string().regex(SHOP_PATH)
/** One handle rule per kind (TS1b: architecture 12): a product's address is 1–100 characters, a collection's 1–80. */
export const productHandle = z.string().regex(/^[a-z0-9-]{1,100}$/)
export const collectionHandle = z.string().regex(/^[a-z0-9-]{1,80}$/)

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
  handles: z.array(collectionHandle).max(8).default([]),
  count: z.number().int().min(2).max(8).default(6),
  shape: z.enum(['portrait', 'square', 'circle']).default('portrait'),
})

export const SourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('newest') }),
  /** Ranked by delivered units over the window (server-side, ids only: ADR-0003). */
  z.object({ kind: z.literal('best_sellers'), days: z.union([z.literal(30), z.literal(90)]).default(90) }),
  z.object({ kind: z.literal('collection'), handle: collectionHandle }),
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
  layout: z.enum(ALL_PRODUCT_LAYOUTS).default('grid'),
  label,
  /** layout tabs: the collections, one tab each, by handle (the source is then ignored). */
  tabs: z.array(collectionHandle).max(MAX_TABS).refine((t) => new Set(t).size === t.length, 'Each collection once.').default([]),
})

const band = z.object({ minPaise: z.number().int().min(0).nullable(), maxPaise: z.number().int().positive().nullable() })
export const PriceTilesSchema = z.object({
  id, key: z.literal('price_tiles'), hidden, scheme,
  heading: text(40).default('Shop by budget'),
  /** Under ₹X (min null) · ₹X–₹Y · Above ₹X (max null). Rupees typed, stored paise. */
  bands: z.array(band).min(1).max(4),
})

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
  pieces: z.array(z.object({ handle: productHandle, x: pin, y: pin })).max(4).default([]),
})

/** Signal 1.2 (S2): story cards fanned out, the middle one forward. Lenient (a blank one parses: autosave); fewer than
 *  three cards with photos shows nothing (readiness says so, never blocking). */
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
const RESERVED_IDS = new Set(['constructor', 'prototype', '__proto__', 'tostring', 'valueof', 'hasownproperty'])
export const blockId = z.string().regex(BLOCK_ID).refine((v) => !RESERVED_IDS.has(v), 'That id is reserved')
/** A design's rich text: Rich text's paragraphs of runs, each run with words (an empty run can't hold a bare link). */
const designRun = run.extend({ text: z.string().min(1).max(600) })
const runChars = (ps: { text: string; link?: string }[][]) => ps.flat().reduce((n, r) => n + r.text.length + (r.link?.length ?? 0), 0)
export const DesignBodySchema = z.array(z.array(designRun).min(1).max(40)).max(12).refine((ps) => runChars(ps) <= 2000, 'At most 2,000 characters')
export const AccordionItemSchema = z.object({ q: text(80), a: text(600) })

const unique = <T,>(xs: T[]) => new Set(xs).size === xs.length

/** What an owner wrote into one block of a design (unknown keys are stripped: what is stored is this parse's output),
 *  tagged with the block's kind (security M2, tenancy HIGH): a fill
 *  only ever lands on a block of its own kind, and every photo is found by its kind (cleanImages). Never a video id:
 *  a design's one video is the section's own `video`; the video block's fill is its poster photo (TS1b). */
export const FillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: text(60) }),
  z.object({ kind: z.literal('text'), body: DesignBodySchema }),
  z.object({ kind: z.literal('image'), image: ImageSchema.nullable() }),
  z.object({ kind: z.literal('button'), label: text(24), link: shopPath }),
  z.object({ kind: z.literal('accordion'), items: z.array(AccordionItemSchema).max(12) }),
  // TS1b: commerce, video and date. Handles resolve only against this shop's own catalogue (the renderer).
  z.object({ kind: z.literal('product_grid'), source: SourceSchema }),
  z.object({ kind: z.literal('featured_product'), handle: productHandle }),
  z.object({ kind: z.literal('collection_tiles'), mode: z.enum(['auto', 'picked']), handles: z.array(collectionHandle).max(MAX_TILES).refine(unique, 'Each collection once.') }),
  z.object({ kind: z.literal('video'), poster: ImageSchema.nullable() }),
  /** ISO only (no clock in domains): "≤ 400 days ahead" is the save's (designsForSave, with `now`). Null: cleared. */
  z.object({ kind: z.literal('date'), at: z.string().max(32).datetime({ offset: true }).nullable() }),
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
    case 'product_grid': return f.source.kind === 'collection' ? [f.source.handle] : []
    case 'featured_product': return [f.handle]
    case 'collection_tiles': return f.handles
    case 'video': return f.poster ? [f.poster.alt] : []
    case 'date': return f.at ? [f.at] : []
    default: return f satisfies never
  }
}
const fillChars = (f: Fill) => fillText(f).reduce((n, t) => n + t.length, 0)

/** Theme Studio TS0b: a section whose shape the theme fixes (a design, by id); the owner fills the blocks the theme
 *  marks, by block id. Shape and caps only: whether the design and its blocks exist is the manifest's (resolveDesign). */
export const DesignSectionSchema = z.object({
  id, key: z.literal('design'), hidden, scheme, label,
  design: blockId,
  /** TS1b: the design's one loop (its video block's), a `videos` row of this shop's (cleanVideos); kept only where the
   *  design has exactly one video block and the theme lists `design` in videoSections (designsForSave, resolveTheme). */
  video,
  fill: z.record(blockId, FillSchema)
    .refine((f) => Object.keys(f).length <= MAX_FILLS, `At most ${MAX_FILLS} fields`)
    .refine((f) => Object.values(f).reduce((n, x) => n + fillChars(x), 0) <= MAX_FILL_CHARS, 'At most 10,000 characters in one section')
    .default({}),
})

export const SectionSchema = z.discriminatedUnion('key', [
  HeroSchema, CollectionTilesSchema, ProductsSchema, PriceTilesSchema, PromisesSchema, ImageTextSchema, DropTeaserSchema, RichTextSchema, LogosSchema,
  ShopTheLookSchema, StoryFanSchema, StatementSchema, DesignSectionSchema,
])
export type SectionInstance = z.infer<typeof SectionSchema>
/** A section as written in a manifest or a stored layer: defaults may be left out. */
export type SectionInput = z.input<typeof SectionSchema>
export type SectionKey = SectionInstance['key']
export type SectionOf<K extends SectionKey> = Extract<SectionInstance, { key: K }>
