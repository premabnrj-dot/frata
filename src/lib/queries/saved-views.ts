import 'server-only'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { filterQuery, parseFilters, type OrderFilters } from '@/domains/orders/filters'
import { QUEUE_TABS, type QueueTab } from '@/domains/orders/order-state'
import { filterSql, inTabSql } from '@/lib/db/order-predicates'
import { orders } from '@/lib/db/schema-orders'
import { savedViews } from '@/lib/db/schema-views'
import { withTenant } from '@/lib/db/tenant'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/queries/saved-views.ts — THE ORDERS LIST'S SAVED VIEWS (Neel N1c·2).
//
// A view is a queue tab and the filters, re-parsed on every read (parseFilters: a stored string never reaches SQL or
// an href as written). Their counts are ONE statement, its own transaction, streamed after the page (speed review:
// 189–212 ms at 150 k orders with JIT off over an `offset 0` subquery; never inside queueCounts' transaction).
// =============================================================================

export const MAX_VIEWS = 20
export type SavedView = { id: string; name: string; tab: QueueTab; filters: OrderFilters; query: string }

const tabOf = (t: string): QueueTab => ((QUEUE_TABS as readonly string[]).includes(t) ? (t as QueueTab) : 'all')

/** The shop's views in use, oldest first (the order they were saved in is the order of the tabs). */
export async function savedViewsFor(tenantId: string): Promise<SavedView[]> {
  const rows = await withTenant(tenantId, (tx) => tx.select({ id: savedViews.id, name: savedViews.name, tab: savedViews.tab, query: savedViews.query })
    .from(savedViews).where(and(eq(savedViews.tenantId, tenantId), isNull(savedViews.removedAt))).orderBy(asc(savedViews.createdAt)).limit(MAX_VIEWS))
  return rows.map((r) => {
    const filters = parseFilters(Object.fromEntries(new URLSearchParams(r.query)))
    return { id: r.id, name: r.name, tab: tabOf(r.tab), filters, query: filterQuery(filters) }
  })
}

/** How many orders each view holds now, in one statement; null if they could not be counted in time. */
export async function viewCounts(tenantId: string, views: SavedView[], now: Date): Promise<Record<string, number> | null> {
  if (!views.length) return {}
  return withTenant(tenantId, async (tx) => {
    await tx.execute(sql`set local jit = off`)
    await tx.execute(sql`set local statement_timeout = '800ms'`)
    // `offset 0` keeps the subquery whole: inlined, Postgres re-derived each order's state once per view.
    const sub = sql`(select * from ${orders} where ${orders.tenantId} = ${tenantId} offset 0) as "orders"`
    const cols = views.map((v, i) => sql`(count(*) filter (where ${inTabSql(v.tab, now)}${filterSql(v.filters, now) ? sql` and ${filterSql(v.filters, now)}` : sql``}))::int as ${sql.identifier(`v${i}`)}`)
    const [r] = await tx.execute<Record<string, number>>(sql`select ${sql.join(cols, sql`, `)} from ${sub}`)
    return Object.fromEntries(views.map((v, i) => [v.id, Number(r?.[`v${i}`] ?? 0)]))
  }).catch((err) => { console.error('[orders] view counts', errName(err)); return null })
}
