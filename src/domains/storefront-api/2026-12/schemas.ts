// =============================================================================
// FILE: src/domains/storefront-api/2026-12/schemas.ts
//
// WHAT VERSION 2026-12 ANSWERS (spec docs/specs/2026-11-11-storefront-api.md § 3): every field named, every object
// strict (check:api refuses an open schema), text as text, money in paise, URLs https on Frrata's media store or the
// shop's own addresses. A released version only grows (released-api.test.ts): a new optional field passes, a removal,
// rename or narrowing fails. Field notes are `.describe()`d so they reach openapi.json; enums that may grow say so.
// =============================================================================

import { z } from 'zod'

const MAY_GROW = 'New values may appear. Show something sensible for one you don’t know.'
const paise = z.number().int().nonnegative()
const text = (max: number) => z.string().max(max)
const handle = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)
const https = z.string().max(500).regex(/^https:\/\/[a-z0-9.-]+(?:\/[^\s"<>]*)?$/)
const moment = z.string().datetime({ offset: true })

export const AVAILABILITY_KINDS = ['in_stock', 'low_stock', 'sold_out', 'preorder', 'made_to_order'] as const

export const Image = z.strictObject({
  sizes: z.array(z.strictObject({ width: z.number().int().positive(), url: https })).min(1).max(8)
    .describe('The same photo at each width, smallest first. Use them as srcset.'),
  width: z.number().int().positive().describe('The original’s width in pixels (with height: the aspect ratio).'),
  height: z.number().int().positive(),
  alt: text(200),
  colour: text(60).nullable().describe('The colour this photo shows (a value of the Colour option), or null.'),
})
export const Availability = z.strictObject({
  kind: z.enum(AVAILABILITY_KINDS).describe(MAY_GROW),
  left: z.number().int().positive().max(3).nullable().describe('How many are left, only when 3 or fewer.'),
  shipsBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('For a pre-order, the day it ships by (India).'),
  leadDays: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().describe('For made to order, days to ship, least and most.'),
})
const PRIOR = 'The lowest price in the 30 days before a recent cut. Show it struck through. Null when there was no cut.'
export const Price = z.strictObject({ min: paise, max: paise, priorPrice: paise.nullable().describe(PRIOR) })
export const OfferLine = z.strictObject({ label: text(200), ends: moment.nullable().describe('A real end only. Null when the offer has none.') })
const Seo = z.strictObject({ title: text(200), description: text(400) })

export const Card = z.strictObject({
  id: z.uuid(), handle: handle.describe('The product’s current address: /products/<handle>.'), title: text(200),
  price: Price.nullable().describe('Null when no size has a price yet.'),
  availability: Availability.nullable(),
  colours: z.array(z.strictObject({ value: text(60), family: text(40).nullable(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable() })).max(40),
  image: Image.nullable(),
  badge: text(60).nullable().describe('The one offer tag a card may carry, in the store’s words.'),
})

export const Variant = z.strictObject({
  id: z.uuid().describe('Use it in the cart link.'), values: z.array(text(60)).max(3).describe('One value per option, in the options’ order.'),
  price: z.number().int().positive(),
  priorPrice: paise.nullable().describe(PRIOR),
  mrp: paise.nullable().describe('The tag’s M.R.P., at or above the price. Never struck through.'),
  sku: text(64).nullable(), gtin: z.string().regex(/^\d{8,14}$/).nullable(),
  availability: Availability,
})
export const Story = z.strictObject({ title: text(120), text: text(1200), notes: z.array(text(200)).max(10), image: Image.nullable() })
export const SizeChart = z.strictObject({
  columns: z.array(text(40)).max(12),
  rows: z.array(z.strictObject({ size: text(20), values: z.array(z.number().nullable()).max(12) })).max(40),
  howToMeasure: text(2000),
}).describe('Measurements in centimetres.')
export const Product = z.strictObject({
  ...Card.shape,
  description: text(5000),
  options: z.array(text(40)).max(3),
  variants: z.array(Variant).max(300).describe('Sizes and colours with a price.'),
  images: z.array(Image).max(20),
  details: z.array(z.strictObject({ name: text(80), value: text(400) })).max(40)
    .describe('The product page’s rows, like fabric and care. The pack’s legal declarations too. Show every row.'),
  model: z.strictObject({ height: text(40), size: text(20) }).nullable().describe('The model in the photos.'),
  stories: z.array(Story).max(8),
  pairs: z.array(Card).max(2),
  sizeChart: SizeChart.nullable(),
  offers: z.array(OfferLine).max(4),
  seo: Seo,
})

export const Collection = z.strictObject({ handle: handle.describe('/collections/<handle>.'), title: text(200), description: text(2000), seo: Seo })
export const Collections = z.strictObject({ collections: z.array(Collection).max(500) })
export const Page = z.strictObject({
  products: z.array(Card).max(48), page: z.number().int().positive(), pages: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  truncated: z.boolean().describe('True when the catalogue has more than 600 listed products. Later ones are in no page yet.'),
})
export const CollectionPage = z.strictObject({ collection: Collection, ...Page.shape })
export const Search = z.strictObject({ q: text(60), products: z.array(Card).max(48) })
export const Offers = z.strictObject({ bar: z.strictObject({ text: text(300), ends: moment.nullable() }).nullable().describe('The offer in the store’s bar, while it runs.') })

const person = z.strictObject({ name: text(120), role: text(80), email: text(200), phone: text(20) })
const Zone = z.strictObject({
  name: text(60), charge: paise, freeAbove: paise.nullable(), days: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  payOnDelivery: z.strictObject({ on: z.boolean(), charge: paise, max: paise.nullable() }),
})
export const STORE_STATUS = ['open', 'opening_soon', 'paused'] as const
export const Shop = z.strictObject({
  name: text(120), tagline: text(200), language: z.enum(['en', 'hi']).describe(MAY_GROW), logo: https.nullable(),
  status: z.enum(STORE_STATUS).describe(`As of this answer. Show the store as closed unless it is "open". "paused" takes no new orders until pause.to. ${MAY_GROW}`),
  pause: z.strictObject({ from: moment, to: moment.nullable() }).nullable().describe('A pause the store has or will have. Check it against the clock.'),
  pricesIncludeGst: z.boolean(),
  payOnDelivery: z.strictObject({ on: z.boolean(), min: paise, max: paise, charge: paise }).describe('The store-wide rule. With zones, each zone’s own applies.'),
  delivery: z.strictObject({
    charge: paise, freeAbove: paise, dispatchDays: z.number().int().nonnegative(), metroDays: z.number().int().nonnegative(), restDays: z.number().int().nonnegative(),
    zones: z.array(Zone).max(50).nullable().describe('Delivery by area. A shopper’s PIN code picks the zone. The flat fields are then only the fallback.'),
  }),
  returns: z.strictObject({ kind: z.enum(['exchange_or_refund', 'exchange_only', 'refund_only', 'none']).describe(MAY_GROW), days: z.number().int().nonnegative() }),
  legal: z.strictObject({ legalName: text(120), address: text(400), customerCare: z.strictObject({ email: text(200), phone: text(20) }), grievanceOfficer: person })
    .describe('What India’s E-Commerce Rules ask every page of the store to show. Render it from here at runtime. Never copy it into code.'),
  policies: z.array(z.strictObject({ kind: z.enum(['returns', 'shipping', 'privacy', 'terms', 'contact']).describe(MAY_GROW), title: text(80), url: https })).max(10)
    .describe('The store’s policy pages, on Frrata. Link them from every page.'),
  social: z.strictObject({ instagram: z.string().regex(/^[A-Za-z0-9._]{1,30}$/).nullable(), whatsapp: z.string().regex(/^91\d{10}$/).nullable() }),
  seo: Seo,
  siteOrigin: https.nullable().describe('Your own address for the store, as it was set in Frrata.'),
  checkoutOrigin: https.describe('Where checkout, orders and policies live. The cart link (coming next) starts here.'),
})
