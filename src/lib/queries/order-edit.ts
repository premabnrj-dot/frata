import 'server-only'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Choice, EditFacts } from '@/domains/orders/edit'
import { firstName } from '@/domains/messaging/placeholders'
import { products, variants } from '@/lib/db/schema-catalogue'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { editFactsIn, roomOf } from '@/lib/orders/edit-facts'
import { variantRows } from './checkout'

// =============================================================================
// FILE: src/lib/queries/order-edit.ts
//
// WHAT THE ORDER PAGE'S "EDIT ITEMS" PANEL READS (OE·1): the facts the save plans from (lib/orders/edit-facts.ts),
// every size and colour of the order's products with how many can be had, and whom the email goes to — one read, one
// snapshot, when the panel opens; the browser prices each tap with the same pure planner. And "Add an item": the shop's
// pieces by title. Never a merchant's cost.
// =============================================================================

export type EditorLine = EditFacts['lines'][number] & { image: { base: string; widths: number[] } | null; kind: string }
export type EditorData = { facts: EditFacts; lines: EditorLine[]; options: Record<string, string[]>; to: string | null }

/** The panel's facts for one order of this shop, or null (not this shop's). */
export async function itemsEditor(tenantId: string, orderId: string, now = new Date()): Promise<EditorData | null> {
  return withTenant(tenantId, async (tx) => {
    const [[o], read] = await Promise.all([
      tx.select({ email: orders.email, name: orders.customerName }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))),
      editFactsIn(tx, tenantId, orderId, now, 'products'),
    ])
    if (!o || !read) return null
    const ids = [...new Set(read.live.flatMap((l) => (l.productId ? [l.productId] : [])))]
    const opts = ids.length ? await tx.select({ id: products.id, options: products.options }).from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, ids))) : []
    return {
      facts: read.facts,
      lines: read.facts.lines.map((l) => { const x = read.live.find((r) => r.id === l.id)!; return { ...l, kind: x.kind, image: x.imageBase && x.imageWidths ? { base: x.imageBase, widths: x.imageWidths } : null } }),
      options: Object.fromEntries(opts.map((p) => [p.id, p.options])),
      to: o.email ? firstName(o.name) || 'the customer' : null,
    }
  }, { snapshot: true })
}

export type AddResult = { productId: string; title: string; options: string[]; image: { base: string; widths: number[] } | null; choices: Choice[]; room: Record<string, number> }

/** "Add an item": up to 6 of the shop's pieces whose title matches, each size and colour with how many can be had. */
export async function itemsToAdd(tenantId: string, orderId: string, q: string, now = new Date()): Promise<AddResult[]> {
  const term = q.trim().slice(0, 60)
  if (!term) return []
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return withTenant(tenantId, async (tx) => {
    const found = await tx.select({ id: products.id, title: products.title, options: products.options }).from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.status, ['active', 'unlisted']), sql`${products.title} ilike ${like}`)).orderBy(asc(products.title)).limit(6)
    if (!found.length) return []
    const [vs, live] = await Promise.all([
      tx.select({ id: variants.id }).from(variants).where(and(eq(variants.tenantId, tenantId), inArray(variants.productId, found.map((p) => p.id)), isNull(variants.archivedAt)))
        .orderBy(variants.productId, variants.position, variants.id).limit(60),
      tx.select({ variantId: orderLines.variantId, qty: orderLines.qty, kind: orderLines.kind, stockTakenAt: orderLines.stockTakenAt }).from(orderLines)
        .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), isNull(orderLines.removedAt))),
    ])
    const ids = vs.map((v) => v.id)
    const rows = (await Promise.all(Array.from({ length: Math.ceil(ids.length / 20) }, (_, i) => variantRows(tx, tenantId, ids.slice(i * 20, i * 20 + 20), now)))).flat()
    const room = roomOf(rows, live, now)
    return found.map((p) => {
      const mine = rows.filter((r) => r.productId === p.id)
      return { productId: p.id, title: p.title, options: p.options, image: mine.find((r) => r.image)?.image ?? null, room: Object.fromEntries(mine.map((r) => [r.variantId, room[r.variantId] ?? 0])),
        choices: mine.map((r) => ({ variantId: r.variantId, productId: r.productId, title: r.title, values: r.values, price: r.price, hsn: r.hsn, ownBps: r.ownBps ?? null })) }
    }).filter((p) => p.choices.length)
  }, { snapshot: true })
}
