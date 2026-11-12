import 'server-only'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { storedTerms, type StoredTerms } from '@/domains/checkout/kept-terms'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { MAX_QTY, sellable, type VariantRow } from '@/domains/checkout/quote'
import type { EditFacts, KeptRow, SoldLine } from '@/domains/orders/edit'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import type { Tx } from '@/lib/db'
import { shopSettings } from '@/lib/db/schema'
import { variants } from '@/lib/db/schema-catalogue'
import { orderDiscounts } from '@/lib/db/schema-discounts'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { variantRows } from '@/lib/queries/checkout'

// =============================================================================
// FILE: src/lib/orders/edit-facts.ts
//
// WHAT AN ORDER EDIT IS PLANNED FROM (domains/orders/edit.ts), read inside the caller's transaction: the order panel's
// one read (queries/order-edit.ts) and the save under the order's lock (orders/edit.ts) read the same facts the same
// way, so the panel's total is the save's. Live lines and offers only; never a merchant's cost (that stays with the
// writer, lines.ts unitCosts).
// =============================================================================

export type LiveLine = typeof orderLines.$inferSelect
export type EditRead = { facts: EditFacts; live: LiveLine[]; rows: VariantRow[] }

/** At most this many variants are read for one order's panel (the order's products' sizes and colours). */
const MAX_VARIANTS = 200

/** The order's live offers with the terms they kept; null when one cannot be re-planned (a product offer before 0110). */
export async function keptRowsIn(tx: Tx, tenantId: string, orderId: string): Promise<KeptRow[] | null> {
  const rows = await tx.select().from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId), isNull(orderDiscounts.removedAt)))
  const out: KeptRow[] = []
  for (const r of rows) {
    const n = (x: string | number | null) => (x === null ? null : Number(x))
    const terms = storedTerms({ percentBps: r.percentBps, amountOff: n(r.amountOff), cap: n(r.cap), minSubtotal: Number(r.minSubtotal),
      tierMins: r.tierMins?.map(Number) ?? null, tierPercentBps: r.tierPercentBps, tierAmountsOff: r.tierAmountsOff?.map(Number) ?? null,
      targets: r.targets as StoredTerms['targets'], targetProducts: r.targetProducts, buyQty: r.buyQty, getQty: r.getQty, getBps: r.getBps, giftVariantId: r.giftVariantId,
      discountId: r.discountId, title: r.title, style: r.style as DiscountStyle, codeId: r.codeId })
    if (!terms) return null
    out.push({ rowId: r.id, kept: { terms, method: r.method as 'cod' | 'prepaid' | null, amount: Number(r.amount) } })
  }
  return out
}

/**
 * Pieces of each variant this order may hold on a new or changed line: what checkout could sell of it now (stock less
 * holds and what pre-orders are owed, a pre-order's cap, its status), with this order's own pieces of it back first.
 */
export function roomOf(rows: VariantRow[], live: Own[], now: Date): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.variantId, sellsAs(r, live, MAX_QTY, now).qty]))
}

type Own = Pick<LiveLine, 'variantId' | 'qty' | 'kind' | 'stockTakenAt'>
/** How `qty` of this variant sells now with the order's own pieces of it back: how many, and as what (in stock, pre-order…). */
export function sellsAs(r: VariantRow, live: Own[], qty: number, now: Date) {
  const own = live.filter((l) => l.variantId === r.variantId)
  const back = own.filter((l) => l.kind === 'in_stock' && l.stockTakenAt).reduce((a, l) => a + l.qty, 0)
  const pre = own.filter((l) => l.kind === 'preorder' && !l.stockTakenAt).reduce((a, l) => a + l.qty, 0)
  return sellable({ ...r, stock: r.stock + back, owed: Math.max(0, r.owed - pre), preordered: Math.max(0, r.preordered - pre) }, qty, now)
}

/**
 * The facts an edit is planned from. `variantIds`: the variants the request names (a save), or 'products' for every
 * size and colour of the order's products (the panel). Variants are read as checkout reads them (variantRows: no cost).
 */
export async function editFactsIn(tx: Tx, tenantId: string, orderId: string, now: Date, variantIds: string[] | 'products'): Promise<EditRead | null> {
  const [[o], live, offers, [shop]] = await Promise.all([
    tx.select({ shipping: orders.shipping, codCharge: orders.codCharge, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst, sellerGstin: orders.sellerGstin,
      sellerScheme: orders.sellerScheme, placedAt: orders.placedAt }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))),
    tx.select().from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), isNull(orderLines.removedAt))).orderBy(asc(orderLines.position), asc(orderLines.id)),
    keptRowsIn(tx, tenantId, orderId),
    tx.select({ shippingFlat: shopSettings.shippingFlat, freeShippingAbove: shopSettings.freeShippingAbove, codMax: shopSettings.codMax }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
  ])
  if (!o) return null
  const products = [...new Set(live.flatMap((l) => (l.productId ? [l.productId] : [])))]
  const ids = variantIds === 'products'
    ? (products.length ? (await tx.select({ id: variants.id }).from(variants).where(and(eq(variants.tenantId, tenantId), inArray(variants.productId, products), isNull(variants.archivedAt)))
      .orderBy(variants.productId, variants.position, variants.id).limit(MAX_VARIANTS)).map((v) => v.id) : [])
    : [...new Set([...variantIds, ...live.flatMap((l) => (l.variantId ? [l.variantId] : []))])].slice(0, MAX_VARIANTS)
  // variantRows reads up to 20 at a time; the chunks pipeline in this one transaction.
  const chunks = Array.from({ length: Math.ceil(ids.length / 20) }, (_, i) => ids.slice(i * 20, i * 20 + 20))
  const rows = (await Promise.all(chunks.map((c) => variantRows(tx, tenantId, c, now)))).flat()
  const lines: SoldLine[] = live.map((l) => ({ id: l.id, variantId: l.variantId, productId: l.productId, title: l.title, values: l.optionValues, qty: l.qty,
    unitPrice: Number(l.unitPrice), hsn: l.hsn, gstBps: l.gstBps, productDiscount: Number(l.productDiscount), stockTaken: !!l.stockTakenAt }))
  return {
    live, rows,
    facts: {
      lines, offers, room: roomOf(rows, live, now),
      choices: rows.map((r) => ({ variantId: r.variantId, productId: r.productId, title: r.title, values: r.values, price: r.price, hsn: r.hsn, ownBps: r.ownBps ?? null })),
      order: { shipping: Number(o.shipping), codCharge: Number(o.codCharge), total: Number(o.total), pricesIncludeGst: o.pricesIncludeGst,
        registered: chargesGst({ gstin: o.sellerGstin, scheme: (o.sellerScheme ?? 'regular') as Scheme }), placedAt: o.placedAt },
      rules: { shippingFlat: Number(shop?.shippingFlat ?? 0), freeShippingAbove: Number(shop?.freeShippingAbove ?? 0), codMax: Number(shop?.codMax ?? 0) },
    },
  }
}

/** Lock the order's live lines' variants and these, once each, in id order (before reading them: stock moves both ways). */
export async function editVariantIds(tx: Tx, tenantId: string, orderId: string): Promise<string[]> {
  const rows = await tx.select({ v: orderLines.variantId }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), sql`${orderLines.variantId} is not null`))
  return rows.map((r) => r.v!)
}
