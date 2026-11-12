import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { products, variants } from '@/lib/db/schema-catalogue'
import { orderEditLines, orderEdits, orderRefunds } from '@/lib/db/schema-edits'
import { orderLines } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/email/edit-email.ts — WHAT AN `edited` EMAIL SAYS ABOUT THE MONEY (order edit OE·2). Read by the sender at
// send time from the edit its event names: a refund on its way (an edit that lowered a paid order's total), or the
// payment asked for (a higher total waiting for the shopper: the items it would have, since the order has not changed
// yet). A request paid or dropped before its email went is not emailed about.
// =============================================================================

export type EditEmail = { refund: number | null; ask: number | null; total: number; lines: { title: string; values: string[]; qty: number }[] | null; stale: boolean }

export async function editEmailIn(tx: Tx, tenantId: string, eventId: string): Promise<EditEmail | null> {
  const [e] = await tx.select({ id: orderEdits.id, asked: orderEdits.asked, paidAt: orderEdits.paidAt, droppedAt: orderEdits.droppedAt, totalAfter: orderEdits.totalAfter,
    refund: sql<string | null>`(select sum(r.amount) from ${orderRefunds} r where r.tenant_id = ${orderEdits.tenantId} and r.edit_id = ${orderEdits.id} and r.cause = 'edit' and r.retry_of is null and r.cancelled_at is null)` })
    .from(orderEdits).where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.eventId, eventId))).limit(1)
  if (!e) return null
  const waiting = e.asked !== null
  const lines = waiting ? await tx.select({ title: sql<string>`coalesce(${orderLines.title}, ${products.title}, '')`, values: sql<string[]>`coalesce(${orderLines.optionValues}, ${variants.optionValues}, '{}'::text[])`, qty: orderEditLines.qty })
    .from(orderEditLines)
    .leftJoin(orderLines, and(eq(orderLines.tenantId, orderEditLines.tenantId), eq(orderLines.id, orderEditLines.orderLineId)))
    .leftJoin(variants, and(eq(variants.tenantId, orderEditLines.tenantId), eq(variants.id, orderEditLines.variantId)))
    .leftJoin(products, and(eq(products.tenantId, variants.tenantId), eq(products.id, variants.productId)))
    .where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, e.id), eq(orderEditLines.side, 'after'))).orderBy(asc(orderEditLines.id)) : null
  return { refund: e.refund === null ? null : Number(e.refund), ask: waiting ? Number(e.asked) : null, total: Number(e.totalAfter), lines, stale: waiting && (!!e.paidAt || !!e.droppedAt) }
}
