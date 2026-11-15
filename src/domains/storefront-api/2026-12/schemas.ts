// =============================================================================
// FILE: src/domains/storefront-api/2026-12/schemas.ts
//
// WHAT VERSION 2026-12 ANSWERS (spec docs/specs/2026-11-11-storefront-api.md § 3): every field named, every object
// strict (check:api refuses an open schema), text plain, money in paise, URLs https on Frrata's media host or the
// shop's own address. A released version only grows (released-api.test.ts): a new optional field passes, a removal,
// rename or narrowing fails. Enums that may gain values (availability, offers) are documented as "unknown values may
// appear" to partners.
// =============================================================================

import { z } from 'zod'

const paise = z.number().int().nonnegative()
const text = (max: number) => z.string().max(max)
const handle = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)
const https = z.string().max(500).regex(/^https:\/\/[a-z0-9.-]+(?:\/[^\s"<>]*)?$/)

export const AVAILABILITY_KINDS = ['in_stock', 'low_stock', 'sold_out', 'preorder', 'made_to_order'] as const

export const Image = z.strictObject({ base: https, widths: z.array(z.number().int().positive()).max(8), alt: text(200) })
export const Availability = z.strictObject({
  kind: z.enum(AVAILABILITY_KINDS),
  /** Only when 3 or fewer are left. */
  left: z.number().int().positive().max(3).nullable(),
  /** Pre-order: the day it ships by (YYYY-MM-DD, India). */
  shipsBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** Made to order: days to ship, least and most. */
  leadDays: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable(),
})
export const Price = z.strictObject({ min: paise, max: paise, compareAt: paise.nullable() })
export const OfferLine = z.strictObject({ label: text(200), ends: z.string().datetime({ offset: true }).nullable() })

export const Card = z.strictObject({
  id: z.uuid(), handle, title: text(200),
  price: Price.nullable(),
  availability: Availability.nullable(),
  colours: z.array(z.strictObject({ value: text(60), family: text(40).nullable(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable() })).max(40),
  image: Image.nullable(),
  /** The one offer tag a card may carry (the shop's own badge words). */
  badge: text(60).nullable(),
})

export const Variant = z.strictObject({
  id: z.uuid(), values: z.array(text(60)).max(3),
  price: paise,
  /** The lowest price in the 30 days before a recent cut (struck through); null when there was none. */
  priorPrice: paise.nullable(),
  /** The tag's M.R.P., never struck. */
  mrp: paise.nullable(),
  availability: Availability,
})
export const Story = z.strictObject({ title: text(120), text: text(1200), notes: z.array(text(200)).max(10), image: Image.nullable() })
export const SizeChart = z.strictObject({
  columns: z.array(text(40)).max(12),
  rows: z.array(z.strictObject({ size: text(20), values: z.array(z.number().nullable()).max(12) })).max(40),
  howToMeasure: text(2000),
})
export const Product = z.strictObject({
  /** `handle` is the product's current address: it differs from the one asked for when the product moved. */
  ...Card.shape,
  description: text(5000),
  options: z.array(text(40)).max(3),
  variants: z.array(Variant).max(300),
  images: z.array(Image).max(20),
  stories: z.array(Story).max(8),
  pairs: z.array(Card).max(2),
  sizeChart: SizeChart.nullable(),
  offers: z.array(OfferLine).max(4),
})

export const Collection = z.strictObject({ handle, title: text(200), description: text(2000) })
export const Collections = z.strictObject({ collections: z.array(Collection).max(500) })
export const Page = z.strictObject({
  products: z.array(Card).max(48), page: z.number().int().positive(), pages: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  /** The catalogue is longer than the API reads (600 products): later products are not in any page yet. */
  truncated: z.boolean(),
})
export const CollectionPage = z.strictObject({ collection: Collection, ...Page.shape })
export const Search = z.strictObject({ q: text(60), products: z.array(Card).max(48) })
export const Offers = z.strictObject({ bar: z.strictObject({ text: text(300), ends: z.string().datetime({ offset: true }).nullable() }).nullable() })

const person = z.strictObject({ name: text(120), role: text(80), email: text(200), phone: text(20) })
export const Shop = z.strictObject({
  name: text(120), language: z.enum(['en', 'hi']), logo: https.nullable(),
  pricesIncludeGst: z.boolean(),
  payOnDelivery: z.strictObject({ on: z.boolean(), max: paise, charge: paise }),
  delivery: z.strictObject({ charge: paise, freeAbove: paise, dispatchDays: z.number().int().nonnegative(), metroDays: z.number().int().nonnegative(), restDays: z.number().int().nonnegative() }),
  returns: z.strictObject({ kind: z.enum(['exchange_or_refund', 'exchange_only', 'refund_only', 'none']), days: z.number().int().nonnegative() }),
  /** What India's E-Commerce Rules ask a seller's website to show. Runtime data: render it, never compile it in. */
  legal: z.strictObject({ legalName: text(120), address: text(400), customerCare: z.strictObject({ email: text(200), phone: text(20) }), grievanceOfficer: person }),
  social: z.strictObject({ instagram: z.string().regex(/^[A-Za-z0-9._]{1,30}$/).nullable(), whatsapp: z.string().regex(/^\d{10,15}$/).nullable() }),
  siteOrigin: https.nullable(),
  checkoutOrigin: https,
})
