import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { ShopRules, VariantRow } from '@/domains/checkout/quote'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { productImages, products, variants } from '@/lib/db/schema-catalogue'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { holdingSql, momentColumns, standingSql } from '@/lib/db/order-predicates'
import { canTakeOnline, keysFor } from '@/lib/payments/keys'

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
  const [settings] = await tx.select({ defaultHsn: shopSettings.defaultHsn }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
  const rows = await tx.select({
    variantId: variants.id, productId: products.id, handle: products.handle, title: products.title, status: products.status, publishAt: products.publishAt,
    options: products.options, values: variants.optionValues, sku: variants.sku, price: variants.price, compareAt: variants.compareAt, stock: variants.stock,
    whenOut: variants.whenOut, shipsBy: variants.shipsBy, leadMinDays: variants.leadMinDays, leadMaxDays: variants.leadMaxDays, preorderCap: variants.preorderCap, hsn: products.hsn,
    held: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
      where l.tenant_id = ${tenantId} and l.variant_id = "variants"."id" and l.kind = 'in_stock' and ${holdingSql(now, 'o')})`,
    // Units owed to pre-orders not yet packed: stock that arrives for them is not for sale (plan review 2026-11-07).
    owed: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
      where l.tenant_id = ${tenantId} and l.variant_id = "variants"."id" and l.kind = 'preorder' and l.stock_taken_at is null and o.packed_at is null and o.shipped_at is null
        and (${standingSql('o')} or ${holdingSql(now, 'o')}))`,
    preordered: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
      where l.tenant_id = ${tenantId} and l.variant_id = "variants"."id" and l.kind = 'preorder' and (${standingSql('o')} or ${holdingSql(now, 'o')}))`,
    image: sql<{ base: string; widths: number[] } | null>`(select json_build_object('base', i.base, 'widths', i.widths) from ${productImages} i
      where i.tenant_id = ${tenantId} and i.product_id = "products"."id" order by (i.option_value = any("variants"."option_values")) desc nulls last, i.position limit 1)`,
  }).from(variants).innerJoin(products, and(eq(products.id, variants.productId), eq(products.tenantId, tenantId)))
    .where(and(eq(variants.tenantId, tenantId), inArray(variants.id, clean), sql`${variants.archivedAt} is null`))
  return rows.map((r) => ({
    ...r, price: Number(r.price), compareAt: r.compareAt === null ? null : Number(r.compareAt), whenOut: r.whenOut as VariantRow['whenOut'],
    publishAt: r.publishAt ? r.publishAt.toISOString() : null, hsn: r.hsn ?? settings?.defaultHsn ?? null,
  }))
}

export type CheckoutShop = ShopRules & { open: boolean; name: string; slug: string; gstin: string | null; returnDays: number; returnKind: string; whatsapp: string; online: boolean }

/** The shop's checkout rules; `open` read here, inside the transaction (not the 60 s cached lookup). */
export async function checkoutShop(tx: Tx, tenantId: string): Promise<CheckoutShop | null> {
  const [s] = await tx.select({
    name: tenants.name, slug: tenants.slug, publishedAt: shopSettings.publishedAt, gstin: shopSettings.gstin, pricesIncludeGst: shopSettings.pricesIncludeGst,
    shippingFlat: shopSettings.shippingFlat, freeShippingAbove: shopSettings.freeShippingAbove, codOn: shopSettings.codOn, codMin: shopSettings.codMin, codMax: shopSettings.codMax,
    codCharge: shopSettings.codCharge, codBlockedPincodes: shopSettings.codBlockedPincodes, dispatchDays: shopSettings.dispatchDays, metroDays: shopSettings.metroDays,
    restDays: shopSettings.restDays, returnDays: shopSettings.returnDays, returnKind: shopSettings.returnKind, whatsapp: shopSettings.whatsapp,
  }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  if (!s) return null
  return {
    ...s, open: s.publishedAt !== null, registered: !!s.gstin,
    shippingFlat: Number(s.shippingFlat), freeShippingAbove: Number(s.freeShippingAbove), codMin: Number(s.codMin), codMax: Number(s.codMax), codCharge: Number(s.codCharge),
    online: canTakeOnline(await keysFor(tx, tenantId)),
  }
}

export const quoteData = (tenantId: string, ids: string[], now: Date) =>
  withTenant(tenantId, async (tx) => ({ shop: await checkoutShop(tx, tenantId), rows: await variantRows(tx, tenantId, ids, now) }))

/** What the shopper's order page shows — masked address and phone (owner call 4). Found by the link token's hash only. */
export async function orderPage(tx: Tx, tenantId: string, tokenHash: string) {
  const [o] = await tx.select({
    ...momentColumns, id: orders.id, number: orders.number, subtotal: orders.subtotal, shipping: orders.shipping, codCharge: orders.codCharge,
    gstTotal: orders.gstTotal, total: orders.total, pricesIncludeGst: orders.pricesIncludeGst, customerName: orders.customerName, phone: orders.phone, city: orders.city, pincode: orders.pincode,
    arrivesFrom: orders.arrivesFrom, arrivesTo: orders.arrivesTo, returnDays: orders.returnDays, returnKind: orders.returnKind, razorpayOrderId: orders.razorpayOrderId,
  }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.tokenHash, tokenHash))).limit(1)
  if (!o) return null
  const lines = await tx.select({ title: orderLines.title, optionValues: orderLines.optionValues, qty: orderLines.qty, unitPrice: orderLines.unitPrice, imageBase: orderLines.imageBase,
    imageWidths: orderLines.imageWidths, kind: orderLines.kind, shipsBy: orderLines.shipsBy })
    .from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id))).orderBy(orderLines.position)
  return { ...o, lines }
}
