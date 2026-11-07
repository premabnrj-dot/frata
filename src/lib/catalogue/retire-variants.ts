import 'server-only'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { owedSql } from '@/lib/db/order-predicates'
import { variants } from '@/lib/db/schema-catalogue'
import { orderLines } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/catalogue/retire-variants.ts
//
// A SIZE OR COLOUR REMOVED FROM A PRODUCT (1D gap fix, impact review
// 2026-11-07). One that was ever ordered is ARCHIVED — its order lines keep
// pointing at it, so a cancel can put its stock back — and one never ordered is
// deleted. One with pre-orders still to pack is refused: they could never be
// packed. The variants are locked first, so a checkout cannot add an order line
// between the check and the delete. Added back, an archived combination returns
// as the same variant (one row per combination: variants_tenant_product_options).
// =============================================================================

export async function retireVariants(tx: Tx, tenantId: string, ids: string[], now = new Date()): Promise<{ ok: true; archived: string[]; deleted: string[] } | { ok: false; error: string }> {
  if (!ids.length) return { ok: true, archived: [], deleted: [] }
  // In id order, as checkout locks them (no deadlock); from here no order line can be added to these.
  const locked = await tx.select({ id: variants.id, values: variants.optionValues, owed: owedSql(tenantId, now) }).from(variants)
    .where(and(eq(variants.tenantId, tenantId), inArray(variants.id, ids))).orderBy(variants.id).for('update')
  const waiting = locked.filter((v) => v.owed > 0)
  if (waiting.length) return { ok: false, error: `${waiting.map((v) => v.values.join(' · ')).join(', ')} ${waiting.length === 1 ? 'has' : 'have'} pre-orders still to pack. Pack or cancel them first.` }
  const sold = new Set((await tx.selectDistinct({ id: orderLines.variantId }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.variantId, ids)))).map((r) => r.id))
  const archived = ids.filter((id) => sold.has(id)), deleted = ids.filter((id) => !sold.has(id))
  // An archived SKU is freed for reuse (the SKU index is partial on sku is not null).
  if (archived.length) await tx.update(variants).set({ archivedAt: now, sku: null }).where(and(eq(variants.tenantId, tenantId), inArray(variants.id, archived)))
  if (deleted.length) await tx.delete(variants).where(and(eq(variants.tenantId, tenantId), inArray(variants.id, deleted)))
  return { ok: true, archived, deleted }
}

/** The product's archived combinations, to bring one back instead of inserting a second row for it. */
export const archivedVariants = (tx: Tx, tenantId: string, productId: string) =>
  tx.select({ id: variants.id, optionValues: variants.optionValues }).from(variants)
    .where(and(eq(variants.tenantId, tenantId), eq(variants.productId, productId), isNotNull(variants.archivedAt)))
