import 'server-only'
import { cache } from 'react'
import { and, desc, eq, ilike, like as like_, or, sql } from 'drizzle-orm'
import { orderLines, orders } from '@/lib/db/schema-orders'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings, tenants } from '@/lib/db/schema'
import { orderPrefix } from '@/domains/signup/slug'
import { inFlightSql, inTabSql, momentColumns, openSql, placedSql } from '@/lib/db/order-predicates'
import { QUEUE_TABS, SHIP_TABS, type QueueTab } from '@/domains/orders/order-state'
import { parseOrderSearch } from '@/domains/orders/search'

/** Rows a page (docs/specs/2026-11-07-orders.md § 1D·1). */
export const ORDERS_PAGE = 50

/**
 * The console's order list, newest first, one page of one queue tab at a time. The tab is tested with the SAME
 * predicate queueCounts counts with (inTabSql), so a list and its count can never disagree; a search narrows it,
 * and `matching` (a window count) says how many it found.
 * Filtered by tenant twice: the policy, and this where.
 */
export async function listOrders(tenantId: string, { tab = 'all', page = 1, q = '', now }: { tab?: QueueTab; page?: number; q?: string; now: Date }) {
  const search = searchSql(q)
  return withTenant(tenantId, (tx) =>
    tx.select({
      id: orders.id, number: orders.number, total: orders.total, customerName: orders.customerName, city: orders.city,
      ...momentColumns,
      items: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l where l.order_id = "orders"."id" and l.tenant_id = ${tenantId})`,
      // How many match (this tab and search), in the same query: the pager's "of N" — only when a search is on.
      // Without one the page reads queueCounts, and a window count would stop LIMIT from cutting the scan short.
      matching: search ? sql<number>`(count(*) over ())::int` : sql<number>`0`,
    }).from(orders).where(and(eq(orders.tenantId, tenantId), inTabSql(tab, now), ...(search ? [search] : [])))
      .orderBy(desc(orders.placedAt), desc(orders.number)).limit(ORDERS_PAGE).offset((page - 1) * ORDERS_PAGE),
  )
}

/** The search as SQL: name LIKE (escaped), the number, and phone digits (src/domains/orders/search.ts). */
function searchSql(raw: string) {
  const q = parseOrderSearch(raw)
  if (!q) return null
  return or(
    ilike(orders.customerName, q.like),
    ...(q.number !== null ? [eq(orders.number, q.number)] : []),
    ...(q.phoneDigits ? [like_(orders.phone, `%${q.phoneDigits}%`)] : []),
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
  return withTenant(tenantId, (tx) => queueCountsWith(tx, tenantId, now))
}

/** queueCounts inside a caller's transaction (Home reads its counts, oldest waits and risk in one, U·4). */
export async function queueCountsWith(tx: Tx, tenantId: string, now: Date): Promise<Record<QueueTab, number>> {
  const n = (tab: QueueTab) => sql<number>`(count(*) filter (where ${inTabSql(tab, now)}))::int`
  // The work tabs over OPEN orders only (orders_open_idx), the shipping tabs over orders IN FLIGHT only
  // (orders_inflight_idx); All is a plain count of placed orders.
  const ship = new Set<QueueTab>(SHIP_TABS)
  const work = QUEUE_TABS.filter((t) => t !== 'all' && !ship.has(t))
  const [r] = await tx.select(Object.fromEntries(work.map((t) => [t, n(t)])) as Record<QueueTab, ReturnType<typeof n>>)
    .from(orders).where(and(eq(orders.tenantId, tenantId), openSql()))
  const [f] = await tx.select(Object.fromEntries(SHIP_TABS.map((t) => [t, n(t)])) as Record<QueueTab, ReturnType<typeof n>>)
    .from(orders).where(and(eq(orders.tenantId, tenantId), inFlightSql()))
  const [all] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), placedSql()))
  return Object.fromEntries(QUEUE_TABS.map((t) => [t, Number(t === 'all' ? all?.n ?? 0 : (ship.has(t) ? f?.[t] : r?.[t]) ?? 0)])) as Record<QueueTab, number>
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
