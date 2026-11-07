import 'server-only'
import { cache } from 'react'
import { and, desc, eq, ilike, like as like_, or, sql } from 'drizzle-orm'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings, tenants } from '@/lib/db/schema'
import { orderPrefix } from '@/domains/signup/slug'
import { inTabSql, momentColumns } from '@/lib/db/order-predicates'
import { QUEUE_TABS, type QueueTab } from '@/domains/orders/order-state'

/** Rows a page (docs/specs/2026-11-07-orders.md § 1D·1). */
export const ORDERS_PAGE = 50

/**
 * The console's order list, newest first, one page of one queue tab at a time. The tab is tested with the SAME
 * predicate queueCounts counts with (inTabSql), so a list and its count can never disagree. 1D·4b adds the
 * other tabs and search here rather than writing a second list.
 * Filtered by tenant twice: the policy, and this where.
 */
export async function listOrders(tenantId: string, { tab = 'all', page = 1, q = '', now }: { tab?: QueueTab; page?: number; q?: string; now: Date }) {
  const search = searchSql(q)
  return withTenant(tenantId, (tx) =>
    tx.select({
      id: orders.id, number: orders.number, total: orders.total, customerName: orders.customerName, city: orders.city,
      ...momentColumns,
      items: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l where l.order_id = "orders"."id" and l.tenant_id = ${tenantId})`,
      // How many match (this tab and search), in the same query: the pager's "of N" when a search is on.
      matching: sql<number>`(count(*) over ())::int`,
    }).from(orders).where(and(eq(orders.tenantId, tenantId), inTabSql(tab, now), ...(search ? [search] : [])))
      .orderBy(desc(orders.placedAt), desc(orders.number)).limit(ORDERS_PAGE).offset((page - 1) * ORDERS_PAGE),
  )
}

/**
 * Search by order number (with or without its letters: "KS-1012", "1012"), name, or phone (any 4+ digits).
 * At most 60 characters; LIKE wildcards in what was typed are matched as text.
 */
function searchSql(raw: string) {
  const q = raw.trim().slice(0, 60)
  if (!q) return null
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const digits = q.replace(/\D/g, '')
  const num = /^[A-Za-z]{0,6}-?\s*\d{1,9}$/.test(q) ? Number(digits) : null
  return or(
    ilike(orders.customerName, like),
    ...(num !== null ? [eq(orders.number, num)] : []),
    ...(digits.length >= 4 ? [like_(orders.phone, `%${digits}%`)] : []),
  )
}

/**
 * How many of ALL the shop's orders sit in each queue tab, in one query, from the same predicates the tabs use
 * (src/lib/db/order-predicates.ts). The Orders page reads it, and 1D·4b's tabs and U4's Home are to read it
 * too (the nav pill has its own lighter toConfirmCount below, on the same predicate), never a count over a list (a 100-row list once showed "14 to confirm" with 43
 * waiting; stress test 2026-11-07). Each filter re-derives the state; if this goes on every page, derive once
 * in a subquery and group by it.
 */
export async function queueCounts(tenantId: string, now: Date): Promise<Record<QueueTab, number>> {
  const n = (tab: QueueTab) => sql<number>`(count(*) filter (where ${inTabSql(tab, now)}))::int`
  const [r] = await withTenant(tenantId, (tx) =>
    tx.select(Object.fromEntries(QUEUE_TABS.map((t) => [t, n(t)])) as Record<QueueTab, ReturnType<typeof n>>)
      .from(orders).where(eq(orders.tenantId, tenantId)),
  )
  return Object.fromEntries(QUEUE_TABS.map((t) => [t, Number(r?.[t] ?? 0)])) as Record<QueueTab, number>
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number]

/** "KS": the letters an order number is shown with (KS-1001), from Settings or the shop's name. */
export async function orderPrefixFor(tenantId: string): Promise<string> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)))
  return orderPrefix(r?.prefix ?? '', r?.name ?? '')
}

/**
 * The nav pill (spec U · U·2a): how many orders wait in To confirm, over all of them — the To confirm tab's own
 * predicate, so pill and tab agree. React cache() keys it on the tenant alone for one request (the layout and a
 * page may both ask); `now` is taken inside, so the pill and the page's tabs differ by microseconds at most.
 */
export const toConfirmCount = cache(async (tenantId: string): Promise<number> => {
  const now = new Date()
  const [r] = await withTenant(tenantId, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), inTabSql('to_confirm', now))),
  )
  return Number(r?.n ?? 0)
})
