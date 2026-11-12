import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import type { MethodLine } from '@/domains/checkout/discounts'
import type { QuoteLine } from '@/domains/checkout/quote'
import type { ChargeShare } from '@/domains/tax/gst'
import type { Tx } from '@/lib/db'
import { variants } from '@/lib/db/schema-catalogue'
import { orderLines } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/orders/lines.ts
//
// AN ORDER LINE AS SOLD. The one place a line's cost is read (for profit: stored on the line and the order, never
// returned to anyone: ADR-0003), and the one shape a sold line is written in. A sold line is a snapshot: what the
// shopper bought, at what price, how that way of paying priced and taxed it, and its share of the charges. A later
// change to the product never rewrites it.
// =============================================================================

/** Each variant's unit cost now (null: the merchant has not entered one). Server-only; never returned. */
export async function unitCosts(tx: Tx, tenantId: string, variantIds: string[]): Promise<Map<string, number | null>> {
  if (!variantIds.length) return new Map()
  const rows = await tx.select({ id: variants.id, cost: variants.unitCost }).from(variants).where(and(eq(variants.tenantId, tenantId), inArray(variants.id, variantIds)))
  return new Map(rows.map((r) => [r.id, r.cost === null ? null : Number(r.cost)]))
}

/** An order's cost of goods: each line's unit cost × its quantity, or null when any line's cost is unknown. */
export const cogsOf = (lines: { variantId: string; qty: number }[], costs: Map<string, number | null>): number | null =>
  lines.every((l) => costs.get(l.variantId) != null) ? lines.reduce((a, l) => a + costs.get(l.variantId)! * l.qty, 0) : null

/** A sold line's row: the line as quoted, as this way of paying priced it (`priced`), its share of the charges, its cost. */
export function lineSnapshot(l: QuoteLine, priced: MethodLine, share: ChargeShare, at: { tenantId: string; orderId: string; position: number; unitCost: number | null }): typeof orderLines.$inferInsert {
  return {
    ...share,
    lineDiscount: priced.discount, productDiscount: priced.productDiscount, taxableValue: priced.taxable, gstBps: priced.gstBps, gst: priced.gst,
    tenantId: at.tenantId, orderId: at.orderId, variantId: l.variantId, productId: l.productId, title: l.title, optionValues: l.values, sku: l.sku,
    imageBase: l.image?.base ?? null, imageWidths: l.image?.widths ?? null, qty: l.qty, unitPrice: l.unitPrice, compareAt: l.compareAt,
    hsn: l.hsn, uqc: l.uqc, unitCost: at.unitCost,
    kind: l.kind, shipsBy: l.shipsBy, leadMinDays: l.leadMinDays, leadMaxDays: l.leadMaxDays, position: at.position,
  }
}
