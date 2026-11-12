import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { ShopRules, VariantRow } from '@/domains/checkout/quote'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { b2bAllowed, type TurnoverBand } from '@/domains/tax/rates'
import { DISCOUNT_STYLES, normalCode, type DiscountStyle, type DiscountTerms, type TypedCode } from '@/domains/checkout/discounts'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { productImages, products, variants } from '@/lib/db/schema-catalogue'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { deliveryIn } from './delivery'
import { pausedAt, shopPauseIn } from './trial-pause'
import { documentsFor } from '@/lib/orders/documents'
import { heldSql, holdingSql, momentColumns, owedSql, standingSql } from '@/lib/db/order-predicates'
import { discountUses, liveDiscountSql } from '@/lib/db/discount-predicates'
import { discountCodes, discountTargets, discountTiers, discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { collectionMembers, collectionMembersIn } from './storefront'
import { canTakeOnline, keysFor } from '@/lib/payments/keys'
import { hostApprovedIn } from './addresses'

// =============================================================================
// WHAT CHECKOUT READS (shopper-facing: check:tenant rule 6 — named columns
// only, no merchant cost, no secret). Each function takes a tenant transaction
// so placing an order reads under the same locks; the `…For` wrappers open
// their own for the read-only quote and order page.
// =============================================================================


/** The bag's variants as the quote reads them, with what is held and pre-ordered against each. */
export async function variantRows(tx: Tx, tenantId: string, ids: string[], now: Date, opts: { lock?: boolean } = {}): Promise<VariantRow[]> {
  const clean = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/.test(x)))].slice(0, 20)
  if (!clean.length) return []
  // Place-order locks the bag's variants, in id order (no deadlocks), before anything is counted.
  if (opts.lock) await tx.execute(sql`select id from ${variants} where tenant_id = ${tenantId} and id in ${clean} order by id for update`)
  const rows = await tx.select({
    variantId: variants.id, productId: products.id, handle: products.handle, title: products.title, status: products.status, publishAt: products.publishAt,
    options: products.options, values: variants.optionValues, sku: variants.sku, price: variants.price, compareAt: variants.compareAt, stock: variants.stock,
    whenOut: variants.whenOut, shipsBy: variants.shipsBy, leadMinDays: variants.leadMinDays, leadMaxDays: variants.leadMaxDays, preorderCap: variants.preorderCap, hsn: products.hsn, ownBps: products.gstBps, uqc: products.uqc,
    held: heldSql(tenantId, now),
    // Units owed to pre-orders not yet packed: stock that arrives for them is not for sale (plan review 2026-11-07).
    owed: owedSql(tenantId, now),
    preordered: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
      where l.tenant_id = ${tenantId} and l.variant_id = "variants"."id" and l.kind = 'preorder' and (${standingSql('o')} or ${holdingSql(now, 'o')}))`,
    image: sql<{ base: string; widths: number[] } | null>`(select json_build_object('base', i.base, 'widths', i.widths) from ${productImages} i
      where i.tenant_id = ${tenantId} and i.product_id = "products"."id" order by (i.option_value = any("variants"."option_values")) desc nulls last, i.position limit 1)`,
  }).from(variants).innerJoin(products, and(eq(products.id, variants.productId), eq(products.tenantId, tenantId)))
    .where(and(eq(variants.tenantId, tenantId), inArray(variants.id, clean), sql`${variants.archivedAt} is null`))
  return rows.map((r) => ({
    ...r, price: Number(r.price), compareAt: r.compareAt === null ? null : Number(r.compareAt), whenOut: r.whenOut as VariantRow['whenOut'],
    publishAt: r.publishAt ? r.publishAt.toISOString() : null,
    // No fallback to the shop's default HSN (migration 0070 backfilled it onto the products): quote() refuses a piece with no known rate.
  }))
}

export type CheckoutShop = ShopRules & { open: boolean; published: boolean; name: string; slug: string; gstin: string | null; returnDays: number; returnKind: string; whatsapp: string; online: boolean
  /** GST (plan 2026-11-09-gst-core-and-categories): the scheme while registered, the shop's state, whether business buyers may ask for a GST invoice. */
  scheme: Scheme | null; homeState: string | null; b2b: boolean }

/** The shop's checkout rules; `open` (taking NEW orders) read here, inside the transaction (not the 60 s cached lookup).
 *  `published`: live at all — an order already placed in a paused shop still finishes (switch to COD, retry payment). */
/** `host`: the address the shopper is on (quote, placing an order); online payment needs it approved in Razorpay (D1·8).
 *  Without it (a placed order's retry, its page) the order already chose: only the keys decide. */
export async function checkoutShop(tx: Tx, tenantId: string, host: string | null): Promise<CheckoutShop | null> {
  const [s] = await tx.select({
    name: tenants.name, slug: tenants.slug, publishedAt: shopSettings.publishedAt, gstin: shopSettings.gstin, pricesIncludeGst: shopSettings.pricesIncludeGst,
    shippingFlat: shopSettings.shippingFlat, freeShippingAbove: shopSettings.freeShippingAbove, codOn: shopSettings.codOn, codMin: shopSettings.codMin, codMax: shopSettings.codMax,
    codCharge: shopSettings.codCharge, codBlockedPincodes: shopSettings.codBlockedPincodes, dispatchDays: shopSettings.dispatchDays, metroDays: shopSettings.metroDays,
    restDays: shopSettings.restDays, returnDays: shopSettings.returnDays, returnKind: shopSettings.returnKind, whatsapp: shopSettings.whatsapp,
    gstScheme: shopSettings.gstScheme, homeState: shopSettings.homeState, b2bInvoices: shopSettings.b2bInvoices, turnoverBand: shopSettings.turnoverBand,
  }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  if (!s) return null
  const { gstScheme, homeState, b2bInvoices, turnoverBand, ...rest } = s
  const scheme = s.gstin ? (gstScheme as Scheme) : null
  return {
    ...rest, published: s.publishedAt !== null, open: s.publishedAt !== null && !pausedAt(await shopPauseIn(tx, tenantId), new Date()),
    registered: chargesGst({ gstin: s.gstin, scheme }), scheme, homeState: s.gstin ? s.gstin.slice(0, 2) : homeState,
    // Business invoices: a regular registration, the shop's switch, and under ₹5 cr until e-invoicing ships (rates.ts b2bAllowed).
    b2b: scheme === 'regular' && b2bInvoices && b2bAllowed(turnoverBand as TurnoverBand),
    shippingFlat: Number(s.shippingFlat), freeShippingAbove: Number(s.freeShippingAbove), codMin: Number(s.codMin), codMax: Number(s.codMax), codCharge: Number(s.codCharge),
    online: canTakeOnline(await keysFor(tx, tenantId)) && (host === null || await hostApprovedIn(tx, tenantId, host)),
  }
}

/**
 * The shop's live offers as the engine reads them: terms only — never a limit, a budget or a count leaves this
 * function (ADR-0003). An offer whose limit or budget is already reached is left out, so the bag never shows what
 * placement would refuse; placement re-counts under a lock and stays the authority (plan review 12).
 */
async function liveOfferRows(tx: Tx, tenantId: string, now: Date) {
  // The offer's ONE public code (label null) only: a creator code is never listed (O·2 plan review 2).
  const rows = await tx.select({
    id: discounts.id, title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, cap: discounts.cap,
    minSubtotal: discounts.minSubtotal, combinesWithPayment: discounts.combinesWithPayment, listed: discounts.listed, code: discountCodes.code, codeId: discountCodes.id,
    targets: discounts.targets, buyQty: discounts.buyQty, getQty: discounts.getQty, getBps: discounts.getBps, giftVariantId: discounts.giftVariantId, firstOrder: discounts.firstOrder,
    limitTotal: discounts.limitTotal, budget: discounts.budget,
  }).from(discounts)
    .leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
    .where(and(eq(discounts.tenantId, tenantId), liveDiscountSql(now)))
  const limited = rows.filter((r) => r.limitTotal !== null || r.budget !== null)
  const uses = await discountUses(tx, tenantId, limited.map((r) => r.id), now)
  const full = new Set(limited.filter((r) => { const u = uses.get(r.id); return (r.limitTotal !== null && (u?.n ?? 0) >= r.limitTotal) || (r.budget !== null && (u?.given ?? 0) >= Number(r.budget)) }).map((r) => r.id))
  const live = rows.filter((r) => !full.has(r.id) && (DISCOUNT_STYLES as readonly string[]).includes(r.style))
  if (!live.length) return { live, targets: [], tiers: [] }
  const ids = live.map((r) => r.id)
  // Targets (products, or collections resolved to their products now) and tiers, for the offers that have them.
  const [targets, tiers] = await Promise.all([
    live.some((r) => r.targets !== 'all') ? tx.select({ discountId: discountTargets.discountId, productId: discountTargets.productId, collectionId: discountTargets.collectionId }).from(discountTargets)
      .where(and(eq(discountTargets.tenantId, tenantId), inArray(discountTargets.discountId, ids))) : Promise.resolve([]),
    tx.select({ discountId: discountTiers.discountId, min: discountTiers.minSubtotal, percentBps: discountTiers.percentBps, amountOff: discountTiers.amountOff }).from(discountTiers)
      .where(and(eq(discountTiers.tenantId, tenantId), inArray(discountTiers.discountId, ids))),
  ])
  return { live, targets, tiers }
}
type OfferRows = Awaited<ReturnType<typeof liveOfferRows>>

/** Whether an offer targets a collection (its members are needed to price it). */
const needsMembers = (raw: OfferRows) => raw.targets.some((t) => t.collectionId)

/** The offers' terms, collections resolved with `members`. */
function offerTerms(raw: OfferRows, members: Record<string, string[]>): DiscountTerms[] {
  const { live, targets, tiers } = raw
  const productsOf = (id: string) => [...new Set(targets.filter((t) => t.discountId === id).flatMap((t) => (t.productId ? [t.productId] : members[t.collectionId!] ?? [])))]
  return live.map((r) => ({
    id: r.id, title: r.title, style: r.style as DiscountStyle, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), cap: r.cap === null ? null : Number(r.cap),
    minSubtotal: Number(r.minSubtotal), combinesWithPayment: r.combinesWithPayment, listed: r.listed, code: normalCode(r.code), codeId: r.codeId,
    targets: r.targets === 'all' ? 'all' : productsOf(r.id), buyQty: r.buyQty, getQty: r.getQty, getBps: r.getBps, giftVariantId: r.giftVariantId, firstOrder: r.firstOrder,
    tiers: tiers.filter((x) => x.discountId === r.id).map((x) => ({ min: Number(x.min), percentBps: x.percentBps, amountOff: x.amountOff === null ? null : Number(x.amountOff) })),
  }))
}

/** Placement: the live offers with collection members read now in `tx`, under its locks (never the 60 s cache). */
export async function liveOffers(tx: Tx, tenantId: string, now: Date): Promise<DiscountTerms[]> {
  const raw = await liveOfferRows(tx, tenantId, now)
  return offerTerms(raw, needsMembers(raw) ? await collectionMembersIn(tx, tenantId) : {})
}

/**
 * A typed code: the live offer it belongs to (its public code or a creator code), looked up on (tenant, upper(code))
 * inside the host's shop only — never across shops, never listed. Null when it is not a live offer's code.
 */
export async function codeFor(tx: Tx, tenantId: string, text: string | null | undefined, now: Date): Promise<TypedCode | null> {
  const t = normalCode(text)
  if (!t) return null
  const [r] = await tx.select({ discountId: discountCodes.discountId, codeId: discountCodes.id }).from(discountCodes)
    .innerJoin(discounts, and(eq(discounts.tenantId, discountCodes.tenantId), eq(discounts.id, discountCodes.discountId)))
    .where(and(eq(discountCodes.tenantId, tenantId), sql`upper(${discountCodes.code}) = ${t}`, liveDiscountSql(now))).limit(1)
  return { text: t, discountId: r?.discountId ?? null, codeId: r?.codeId ?? null }
}

/** The quote's four reads, independent, issued together inside one transaction (speed review 2026-11-11, P8: the path
 *  every bag and cart link lands on; they ran one after another). */
export async function quoteData(tenantId: string, ids: string[], now: Date, code: string | null, host: string, pin: string | null = null) {
  const { shop, rows, raw, typed, delivery } = await withTenant(tenantId, async (tx) => {
    // Delivery Zones: this PIN code's zone, rule and dispatch, in the same transaction (deliveryIn; speed review H2).
    const [shop, rows, raw, typed, delivery] = await Promise.all([checkoutShop(tx, tenantId, host), variantRows(tx, tenantId, ids, now), liveOfferRows(tx, tenantId, now), codeFor(tx, tenantId, code, now), deliveryIn(tx, tenantId, pin, now)])
    return { shop, rows, raw, typed, delivery }
  })
  // Collections resolved from the shop's cached members AFTER the transaction has closed: a cached loader inside it would
  // open a second connection while holding one (speed finding P4: the pool deadlocks at a drop).
  return { shop, rows, offers: offerTerms(raw, needsMembers(raw) ? await collectionMembers(tenantId) : {}), typed, delivery }
}

/** What the shopper's order page shows — masked address and phone (owner call 4). Found by the link token's hash only. */
export async function orderPage(tx: Tx, tenantId: string, tokenHash: string) {
  const [o] = await tx.select({
    ...momentColumns, id: orders.id, number: orders.number, subtotal: orders.subtotal, shipping: orders.shipping, codCharge: orders.codCharge,
    gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst, customerName: orders.customerName, phone: orders.phone, email: orders.email, city: orders.city, pincode: orders.pincode,
    arrivesFrom: orders.arrivesFrom, arrivesTo: orders.arrivesTo, returnDays: orders.returnDays, returnKind: orders.returnKind, razorpayOrderId: orders.razorpayOrderId,
  }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.tokenHash, tokenHash))).limit(1)
  if (!o) return null
  const lines = await tx.select({ title: orderLines.title, optionValues: orderLines.optionValues, qty: orderLines.qty, unitPrice: orderLines.unitPrice, imageBase: orderLines.imageBase,
    imageWidths: orderLines.imageWidths, kind: orderLines.kind, shipsBy: orderLines.shipsBy })
    .from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id))).orderBy(orderLines.position)
  // The offers it got: title, class and amount only (never an offer's id, limits or budget).
  const offers = (await tx.select({ title: orderDiscounts.title, class: orderDiscounts.class, amount: orderDiscounts.amount, method: orderDiscounts.method }).from(orderDiscounts)
    .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, o.id)))).map((d) => ({ ...d, amount: Number(d.amount) }))
  return { ...o, lines, offers }
}

/**
 * The shopper's own invoice (Documents D2): the order this token belongs to in THIS shop, its invoice documents only
 * once packed; null otherwise (not packed, wrong shop and wrong token look the same to the caller).
 */
export async function shopperInvoice(tenantId: string, hash: string) {
  return withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({ number: orders.number, packedAt: orders.packedAt }).from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.tokenHash, hash))).limit(1)
    return o?.packedAt ? documentsFor(tx, tenantId, [o.number], 'invoice') : null
  })
}
