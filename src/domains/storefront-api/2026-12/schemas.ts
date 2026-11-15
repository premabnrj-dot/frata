// =============================================================================
// FILE: src/domains/storefront-api/2026-12/schemas.ts
//
// WHAT VERSION 2026-12 ANSWERS (spec docs/specs/2026-11-11-storefront-api.md § 3): every field named, every object
// strict (check:api refuses an open schema), text as text, money in paise, URLs https on Frrata's media store or the
// shop's own addresses. A released version only grows (released-api.test.ts): a new optional field passes, a removal,
// rename or narrowing fails. Field notes are `.describe()`d so they reach openapi.json; enums that may grow say so.
// =============================================================================

import { z } from 'zod'
import { ICON_NAMES } from '../../icons/names'

const MAY_GROW = 'New values may appear. Show something sensible for one you don’t know.'
const paise = z.number().int().nonnegative()
const text = (max: number) => z.string().max(max)
const handle = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)
const https = z.string().max(500).regex(/^https:\/\/[a-z0-9.-]+(?:\/[^\s"<>]*)?$/)
const moment = z.string().datetime({ offset: true })

export const POLICY_KINDS = ['returns', 'shipping', 'privacy', 'terms', 'contact'] as const
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
export const OfferLine = z.strictObject({ label: text(200), endsAt: moment.nullable().describe('When the offer ends. Null when it has no end.') })
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
// D2 (SA1b): a filtered list and its menu. A value is sent exactly as `facets` gives it; an id or value may grow.
export const FilterPage = z.strictObject({
  products: z.array(Card).max(48), page: z.number().int().positive(), pages: z.number().int().positive(),
  total: z.number().int().nonnegative().describe('Products matching the filter, among the first 600 listed.'),
  truncated: z.boolean().describe('True when the store has more than 600 listed products. Later ones are in no filter yet.'),
})
const facet = z.strictObject({ value: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40).describe('Send this exact value.'), label: text(60), count: z.number().int().nonnegative() })
export const Facets = z.strictObject({
  sizes: z.array(facet).max(100).describe('Values of the option the store calls Size. Send one as size=.'),
  colours: z.array(facet).max(100).describe('Colour families. Send one as colour=.'),
  prices: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9]{1,10}$/).describe(MAY_GROW), min: paise, max: paise.nullable().describe('Up to, not including. Null: no top.'), count: z.number().int().nonnegative() }))
    .max(10).describe('Bands over each product’s lowest price before offers. Send an id as price=.'),
  inStock: z.number().int().nonnegative().describe('Listed products in stock now (stock=in).'),
})
export const Search = z.strictObject({ q: text(60), products: z.array(Card).max(48) })
export const Offers = z.strictObject({ bar: z.strictObject({ text: text(300), endsAt: moment.nullable() }).nullable().describe('The offer in the store’s bar, while it runs.') })

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
  policies: z.array(z.strictObject({ kind: z.enum(POLICY_KINDS).describe(MAY_GROW), title: text(80), url: https })).max(10)
    .describe('The store’s policy pages, on Frrata. Link them from every page.'),
  social: z.strictObject({ instagram: z.string().regex(/^[A-Za-z0-9._]{1,30}$/).nullable(), whatsapp: z.string().regex(/^91\d{10}$/).nullable() }),
  seo: Seo,
  siteOrigin: https.nullable().describe('The brand’s own address for the store, as set in Frrata. Null when it runs on Frrata.'),
  checkoutOrigin: https.describe('Where checkout, orders and policies live. The bag link starts here: <checkoutOrigin>/cart?l=<size id>:<qty>,….'),
  cart: z.strictObject({ url: https.describe('<checkoutOrigin>/cart. Add ?l=<size id>:<qty>,… and, if you like, code= and the shopper’s utm_ tags.'), maxLines: z.number().int().positive(), maxQty: z.number().int().positive().describe('A larger quantity is lowered to this.') })
    .optional().describe('The bag link. It sends your shopper’s bag to the store’s checkout in one URL.'),
})

// ── Store content and pages (V1 SA1, on lane B's content layer: src/lib/queries/content.ts, queries/pages.ts) ──────────
const PATH = 'A path on the store, such as /products/<handle>, /collections/<handle>, /pages/<handle> or /policies/<kind>. Map it to your own site.'
const storePath = z.string().max(200).regex(/^\/[a-z0-9/-]*$/).describe(PATH)
const icon = z.enum(ICON_NAMES).nullable().describe(`An icon Frrata’s own store draws, or null. ${MAY_GROW}`)
/** A store page's address (the owner types it: pages/templates.ts HANDLE, double dashes allowed). */
const pageHandle = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/).describe('/pages/<handle>.')
const Link3 = z.strictObject({ label: text(40), link: storePath, icon })
const Link2 = z.strictObject({ label: text(40), link: storePath, icon, children: z.array(Link3).max(12) })
const Link1 = z.strictObject({ label: text(40), link: storePath, icon, children: z.array(Link2).max(12) })
const Menu = z.array(Link1).max(12).nullable().describe('Null when the store has not set this menu. Build your own then.')
export const PAGE_KINDS = ['about', 'faq'] as const
export const Announcement = z.strictObject({
  text: text(120), link: storePath.nullable(), scheme: z.enum(['paper', 'tint', 'ink']).describe(`Light, tinted or dark. ${MAY_GROW}`),
  endsAt: moment.nullable().describe('Hide it once the clock passes this. Null when it has no end.'),
})
export const Content = z.strictObject({
  announcements: z.array(Announcement).max(3)
    .describe('Bars running now, in the order to show them. A live offer (offers.bar) shows before any of them. A bar that starts later is not here yet.'),
  menus: z.strictObject({ main: Menu, footer: Menu, tabs: Menu.describe('The phone’s bottom tabs, each with an icon.') }),
  contact: text(160).nullable().describe('The store’s Contact line, or null.'),
  pages: z.array(z.strictObject({ handle: pageHandle, title: text(120), kind: z.enum(PAGE_KINDS).describe(MAY_GROW) })).max(20),
})
export const FaqItem = z.strictObject({
  question: text(80), answer: text(1200).nullable(),
  policy: z.enum(POLICY_KINDS).nullable()
    .describe(`Set when the answer is the store’s own policy page. Link to that page instead of showing an answer. ${MAY_GROW}`),
})
const Run = z.strictObject({ text: text(600), bold: z.boolean(), italic: z.boolean(), link: storePath.nullable() })
// One flat union on `kind` at every level (api-contract review M2): a site switches on one discriminator and skips a
// kind it doesn't know; a group holds leaves, columns hold leaves and groups.
const SKIP = 'New block kinds may appear. Skip a kind you don’t know.'
const leaves = [
  z.strictObject({ kind: z.literal('heading'), level: z.number().int().min(2).max(6).describe(`2 for the page’s first heading, 3 after. ${MAY_GROW}`), text: text(60) }),
  z.strictObject({ kind: z.literal('text'), paragraphs: z.array(z.array(Run).max(40)).max(12) }),
  z.strictObject({ kind: z.literal('image'), ratio: z.enum(['4:5', '3:4', '1:1', '16:9']).describe(MAY_GROW), image: Image }),
  z.strictObject({ kind: z.literal('button'), label: text(24), link: storePath }),
  z.strictObject({ kind: z.literal('questions'), items: z.array(FaqItem).max(12) }),
] as const
const Group = z.strictObject({ kind: z.literal('group'), blocks: z.array(z.discriminatedUnion('kind', [...leaves])).max(40).describe(`Blocks that belong together, as one card. ${SKIP}`) })
const Columns = z.strictObject({
  kind: z.literal('columns'), phone: z.enum(['stack', 'swipe']).describe(`How it shows on a phone. ${MAY_GROW}`),
  blocks: z.array(z.discriminatedUnion('kind', [...leaves, Group])).max(40).describe(`The columns, in order. ${SKIP}`),
})
export const StorePage = z.strictObject({
  handle: pageHandle, title: text(120), kind: z.enum(PAGE_KINDS).describe(MAY_GROW),
  blocks: z.array(z.discriminatedUnion('kind', [...leaves, Group, Columns])).max(100).describe(`The page, top to bottom. ${SKIP}`),
})
export const Faq = z.strictObject({ handle: pageHandle, title: text(120), items: z.array(FaqItem).max(12) })
