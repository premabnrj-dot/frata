import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { orderEditLines } from '@/lib/db/schema-edits'

// =============================================================================
// FILE: src/lib/orders/edit-held.ts — A CHANGE'S HELD PIECES GO BACK ON SALE (order edit OE·2). A leaf (it imports only
// the schema), so the order writers (work.ts cancel, edit-paid.ts, edit-capture.ts) share it without an import cycle.
// =============================================================================

/** A change's held pieces go back on sale (paid, dropped, refunded or cancelled): `held` to 0, so the partial index stays
 * small. The variants it held, for the caller's sold-out refresh. */
export async function releaseHeld(tx: Tx, tenantId: string, editIds: string | string[]): Promise<string[]> {
  const ids = typeof editIds === 'string' ? [editIds] : editIds
  if (!ids.length) return []
  const rows = await tx.update(orderEditLines).set({ held: 0 }).where(and(eq(orderEditLines.tenantId, tenantId), inArray(orderEditLines.editId, ids), sql`${orderEditLines.held} > 0`))
    .returning({ v: orderEditLines.variantId })
  return rows.flatMap((r) => (r.v ? [r.v] : []))
}
