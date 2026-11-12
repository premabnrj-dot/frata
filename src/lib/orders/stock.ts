import 'server-only'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { variants } from '@/lib/db/schema-catalogue'
import { orderLines } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/orders/stock.ts
//
// AN ORDER'S STOCK, PER LINE (frata-architecture § Record actions, "Stock is per line"). The one module that moves
// variants.stock for an order. A line is stamped (order_lines.stock_taken_at) when its stock leaves the shelf and
// cleared when it comes back, so a retry, a late capture or a cancel never takes or returns twice; a return's pieces
// (credit notes) come back by quantity. Each call moves its variants in id order — as variantRows locks them — so a
// variant is locked by its first update and two writers never wait on each other in a cycle. A transaction that moves
// stock BOTH ways (an order edit's swap: one size back, another taken) locks every variant it touches first, once, in id
// order (lockVariants). Each runs inside the caller's tenant transaction, under the order's lock.
// =============================================================================

type Line = { id: string; variantId: string | null; qty: number }

/** In variant id order (uuid order, as Postgres sorts them); a line without a variant (deleted) last. */
const byVariant = <T extends { variantId: string | null }>(xs: T[]) =>
  [...xs].sort((a, b) => (a.variantId === b.variantId ? 0 : a.variantId === null ? 1 : b.variantId === null ? -1 : a.variantId < b.variantId ? -1 : 1))

/** Lock these variants, once each, in id order: first in a transaction that moves stock both ways. */
export async function lockVariants(tx: Tx, tenantId: string, variantIds: (string | null)[]) {
  const ids = [...new Set(variantIds.filter((v): v is string => v !== null))]
  if (ids.length) await tx.select({ id: variants.id }).from(variants).where(and(eq(variants.tenantId, tenantId), inArray(variants.id, ids))).orderBy(variants.id).for('update')
}

/** Take the stock of lines not taken yet (as read by the caller). */
async function take(tx: Tx, tenantId: string, lines: Line[], soldOut: string[]): Promise<{ short: number; taken: number }> {
  let short = 0, taken = 0
  for (const l of byVariant(lines)) {
    if (!l.variantId) { short++; continue }
    const r = await tx.update(variants).set({ stock: sql`${variants.stock} - ${l.qty}` })
      .where(and(eq(variants.tenantId, tenantId), eq(variants.id, l.variantId), sql`${variants.stock} >= ${l.qty}`)).returning({ id: variants.id, stock: variants.stock })
    if (!r.length) { short++; continue }
    taken++
    if (r[0]!.stock === 0) soldOut.push(l.variantId)
    await tx.update(orderLines).set({ stockTakenAt: sql`now()` })
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, l.id), isNull(orderLines.stockTakenAt)))
  }
  return { short, taken }
}

/** Put back lines whose stock was taken (as read by the caller): each cleared once, its pieces back on the shelf. */
async function putBack(tx: Tx, tenantId: string, lines: Line[]): Promise<string[]> {
  const backInStock: string[] = []
  for (const l of byVariant(lines)) {
    const cleared = await tx.update(orderLines).set({ stockTakenAt: null })
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, l.id), isNotNull(orderLines.stockTakenAt))).returning({ id: orderLines.id })
    if (!cleared.length || !l.variantId) continue
    const [v] = await tx.update(variants).set({ stock: sql`${variants.stock} + ${l.qty}` })
      .where(and(eq(variants.tenantId, tenantId), eq(variants.id, l.variantId))).returning({ stock: variants.stock })
    if (v && v.stock - l.qty <= 0 && !backInStock.includes(l.variantId)) backInStock.push(l.variantId)
  }
  return backInStock
}

/**
 * Take the stock of these lines, those not taken yet. A line is stamped only when its stock is taken, so a second call
 * takes nothing. Returns the lines that could not be covered (no variant any more, or not enough on the shelf: a
 * capture after its hold expired and the piece sold — refund due); a line is taken whole or not at all. Variants taken
 * to 0 are pushed onto `soldOut`, so the caller refreshes the cached shop pages after its commit.
 */
export async function takeStockLines(tx: Tx, tenantId: string, lineIds: string[], soldOut: string[] = []): Promise<{ short: number; taken: number }> {
  if (!lineIds.length) return { short: 0, taken: 0 }
  return take(tx, tenantId, await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.id, lineIds), isNull(orderLines.stockTakenAt))), soldOut)
}

/**
 * Put back exactly the stock these lines took (per line, once): each taken line is cleared and its pieces return to
 * the shelf (a line whose variant was deleted is only cleared). Says which variants came back from 0, so the caller
 * refreshes the shop.
 */
export async function putStockBackLines(tx: Tx, tenantId: string, lineIds: string[]): Promise<string[]> {
  if (!lineIds.length) return []
  return putBack(tx, tenantId, await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.id, lineIds), isNotNull(orderLines.stockTakenAt))))
}

/**
 * Take the stock of an order's lines of `kind` not taken yet (in_stock: COD at placement or switch, online at capture;
 * preorder: at packing). See takeStockLines.
 */
export async function takeStock(tx: Tx, tenantId: string, orderId: string, kind: 'in_stock' | 'preorder' = 'in_stock', soldOut: string[] = []): Promise<{ short: number; taken: number }> {
  return take(tx, tenantId, await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), eq(orderLines.kind, kind), isNull(orderLines.stockTakenAt))), soldOut)
}

/** Put back every line of an order whose stock was taken. Cancel and a return that came back (outcomes.ts) both use it. */
export async function putStockBack(tx: Tx, tenantId: string, orderId: string): Promise<string[]> {
  return putBack(tx, tenantId, await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), isNotNull(orderLines.stockTakenAt))))
}

/**
 * Pieces back on their variants by quantity (a credit note's returned items: restockOf decides how many per line), in
 * variant id order. Says what each key (a line) actually put back — a variant deleted meanwhile puts back nothing — and
 * which variants came back from 0.
 */
export async function putBackPieces(tx: Tx, tenantId: string, pieces: { key: string; variantId: string; qty: number }[]): Promise<{ put: Record<string, number>; backInStock: string[] }> {
  const put: Record<string, number> = {}
  const backInStock: string[] = []
  for (const p of byVariant(pieces.filter((x) => x.qty > 0))) {
    const [v] = await tx.update(variants).set({ stock: sql`${variants.stock} + ${p.qty}` })
      .where(and(eq(variants.tenantId, tenantId), eq(variants.id, p.variantId))).returning({ stock: variants.stock })
    if (!v) continue
    put[p.key] = p.qty
    if (v.stock - p.qty <= 0 && !backInStock.includes(p.variantId)) backInStock.push(p.variantId)
  }
  return { put, backInStock }
}
