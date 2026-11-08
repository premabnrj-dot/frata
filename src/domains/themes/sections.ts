import { z } from 'zod'

// =============================================================================
// FILE: src/domains/themes/sections.ts — the section library's SAVE schemas (shape and limits only).
// Rules (themes plan, architecture review 2026-11-08):
//   - A schema changes only ADDITIVELY: a new optional field with a default. A breaking change is a new section
//     key. __tests__/sections-snapshot.test.ts fails any other change.
//   - Shape here; whether a section can be published or shown is readinessOf() (facts, dates, alt text).
//   - Text is plain and length-capped; links are shop paths; nothing here is ever rendered as HTML.
// T0 has the three sections today's Home is made of; T1 adds the rest of the library.
// =============================================================================

const id = z.string().regex(/^[a-z0-9-]{1,40}$/)
const text = (max: number) => z.string().max(max)
const scheme = z.enum(['paper', 'tint', 'ink']).default('paper')

/** Text that is either typed or bound to a shop fact, so the theme shows the shop's own words (and they stay current). */
const bound = (max: number) => z.union([z.object({ from: z.enum(['shopName', 'tagline']) }), z.object({ text: text(max) })])

export const HeroSchema = z.object({
  id, key: z.literal('hero'), hidden: z.boolean().default(false), scheme,
  layout: z.enum(['text']).default('text'),
  heading: bound(60),
  text: bound(160).optional(),
})

export const CollectionTilesSchema = z.object({
  id, key: z.literal('collection_tiles'), hidden: z.boolean().default(false), scheme,
  heading: text(40).default(''),
  /** Automatic: the shop's collections that have products, in title order, first `count`. */
  mode: z.enum(['auto']).default('auto'),
  count: z.number().int().min(2).max(8).default(6),
  shape: z.enum(['portrait']).default('portrait'),
})

export const SOURCE_KEYS = ['newest', 'collection', 'under_price', 'on_sale'] as const
export const ProductsSchema = z.object({
  id, key: z.literal('products'), hidden: z.boolean().default(false), scheme,
  heading: text(40),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('newest') }),
    z.object({ kind: z.literal('collection'), handle: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
    z.object({ kind: z.literal('under_price'), maxPaise: z.number().int().positive() }),
    z.object({ kind: z.literal('on_sale') }),
  ]),
  count: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(24)]),
  /** "See all" when the source has more than `count`: only where a page shows the whole list (Shop all, a collection). */
  viewAll: z.boolean().default(true),
})

export const SectionSchema = z.discriminatedUnion('key', [HeroSchema, CollectionTilesSchema, ProductsSchema])
export type SectionInstance = z.infer<typeof SectionSchema>
export type SectionKey = SectionInstance['key']
export const SECTION_KEYS: SectionKey[] = ['hero', 'collection_tiles', 'products']
