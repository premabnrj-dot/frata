import 'server-only'
import { unreadNotices } from './notices'
import { cache } from 'react'
import { and, asc, desc, eq, ilike, isNull, like as like_, or, sql } from 'drizzle-orm'
import { orderEvents, orderLines, orders, shipments } from '@/lib/db/schema-orders'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings, tenants } from '@/lib/db/schema'
import { orderPrefix } from '@/domains/signup/slug'
import { filterSql, paymentKindSql, inFlightSql, inTabSql, momentColumns, openShipmentProviderSql, openSql, placedSql, orderItemsSql } from '@/lib/db/order-predicates'
import { QUEUE_TABS, SHIP_TABS, type QueueTab } from '@/domains/orders/order-state'
import { parseOrderSearch, type OrderSearch } from '@/domains/orders/search'
import type { OrderFilters } from '@/domains/orders/filters'
import { STATE_CODE } from '@/domains/checkout/states'
import { mainDomainIn } from './addresses'
import { riskFactsWith } from './order-risk'
import { errName } from '@/lib/log'
import { mainAddress } from '@/domains/addresses/names'
import { shopHost } from '@/lib/public-env'

/** Rows a page (docs/specs/2026-11-07-orders.md § 1D·1). */
export const ORDERS_PAGE = 50

/** What a list asks for: a tab, a page, a search and the filters (src/domains/orders/filters.ts). */
export type ListAsk = { tab?: QueueTab; page?: number; q?: string; filters?: OrderFilters; now: Date }

/**
 * The console's order list, newest first, one page of one queue tab at a time. The tab is tested with the SAME
 * predicate queueCounts counts with (inTabSql), so a list and its count can never disagree; the filters narrow both
 * alike (filterSql). A search looks through EVERY order whatever the tab (2026-11-12), under the filters. It fetches
 * one row past the page: a 51st means there is more ("50+", Neel N1c; no window count, which scanned every match).
 * Filtered by tenant twice: the policy, and this where.
 */
export async function listOrders(tenantId: string, ask: ListAsk) {
  return withTenant(tenantId, (tx) => listOrdersWith(tx, tenantId, ask))
}

export async function listOrdersWith(tx: Tx, tenantId: string, { tab = 'all', page = 1, q = '', filters = {}, now }: ListAsk) {
  const search = parseOrderSearch(q)
  const where = and(eq(orders.tenantId, tenantId), search ? searchSql(search, tenantId) : inTabSql(tab, now), filterSql(filters, now) ?? undefined)
  // A name or a phone is a scan of the shop's orders (no index helps a leading % under RLS): any search gets a ceiling.
  // It covers the rest of ordersPage's transaction too (the prefix, the risk facts): a timeout there fails safe.
  if (search) await tx.execute(sql`set local statement_timeout = '1500ms'`)
  return tx.select({
    id: orders.id, number: orders.number, total: orders.total, customerName: orders.customerName, city: orders.city,
    ...momentColumns,
    items: orderItemsSql(tenantId),
    // Shipped with a courier through Frrata: its tracking sets the outcome, so the row offers no Delivered (Ship S·0).
    byCourier: sql<boolean>`coalesce(${openShipmentProviderSql()} = 'shiprocket', false)`,
    // What the search matched, for the mark (N1c): the phone only when the phone was searched, the AWB only when one was.
    phone: search?.phoneDigits ? orders.phone : sql<string | null>`null`,
    awb: search?.awb ? sql<string | null>`(select s.tracking_number from ${shipments} s where s.tenant_id = ${tenantId} and s.order_id = "orders"."id" and s.tracking_number = ${search.awb} limit 1)` : sql<string | null>`null`,
  }).from(orders).where(where)
    .orderBy(desc(orders.placedAt), desc(orders.number)).limit(ORDERS_PAGE + 1).offset((page - 1) * ORDERS_PAGE)
}

/** One search as SQL, by what was typed (src/domains/orders/search.ts): a fast test is never ORed with the name scan. */
function searchSql(q: OrderSearch, tenantId: string) {
  if (q.like) return ilike(orders.customerName, q.like)
  return or(
    ...(q.number !== null ? [eq(orders.number, q.number)] : []),
    ...(q.phoneDigits ? [like_(orders.phone, `%${q.phoneDigits}%`)] : []),
    // Exact, on shipments (tenant_id, tracking_number): `=` keeps the index under RLS.
    ...(q.awb ? [sql`exists (select 1 from ${shipments} s where s.tenant_id = ${tenantId} and s.order_id = "orders"."id" and s.tracking_number = ${q.awb})`] : []),
  ) ?? sql`false`
}

/**
 * How many of ALL the shop's orders sit in each queue tab, in one query, from the same predicates the tabs use
 * (src/lib/db/order-predicates.ts). The Orders page reads it, and 1D·4b's tabs and U4's Home are to read it
 * too (the nav pill has its own lighter toConfirmCount below, on the same predicate), never a count over a list (a 100-row list once showed "14 to confirm" with 43
 * waiting; stress test 2026-11-07). Each filter re-derives the state; if this goes on every page, derive once
 * in a subquery and group by it.
 */
export async function queueCounts(tenantId: string, now: Date, filters: OrderFilters = {}): Promise<Record<QueueTab, number>> {
  return withTenant(tenantId, (tx) => queueCountsWith(tx, tenantId, now, filters))
}

/** queueCounts inside a caller's transaction (Home reads its counts, oldest waits and risk in one, U·4). */
export async function queueCountsWith(tx: Tx, tenantId: string, now: Date, filters: OrderFilters = {}): Promise<Record<QueueTab, number>> {
  // The in-flight count crossed JIT's threshold at the 10× seed (700 ms with it, 127 ms without; speed review N1c). Inside
  // Home's transaction this holds for its other reads too: each is a small indexed read that JIT never helped.
  await tx.execute(sql`set local jit = off`)
  const f_ = filterSql(filters, now) ?? undefined
  const n = (tab: QueueTab) => sql<number>`(count(*) filter (where ${inTabSql(tab, now)}))::int`
  // The work tabs over OPEN orders only (orders_open_idx), the shipping tabs over orders IN FLIGHT only
  // (orders_inflight_idx); All is a plain count of placed orders.
  const ship = new Set<QueueTab>(SHIP_TABS)
  const work = QUEUE_TABS.filter((t) => t !== 'all' && !ship.has(t))
  const [r] = await tx.select(Object.fromEntries(work.map((t) => [t, n(t)])) as Record<QueueTab, ReturnType<typeof n>>)
    .from(orders).where(and(eq(orders.tenantId, tenantId), openSql(), f_))
  const [f] = await tx.select(Object.fromEntries(SHIP_TABS.map((t) => [t, n(t)])) as Record<QueueTab, ReturnType<typeof n>>)
    .from(orders).where(and(eq(orders.tenantId, tenantId), inFlightSql(), f_))
  const [all] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), placedSql(), f_))
  return Object.fromEntries(QUEUE_TABS.map((t) => [t, Number(t === 'all' ? all?.n ?? 0 : (ship.has(t) ? f?.[t] : r?.[t]) ?? 0)])) as Record<QueueTab, number>
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number]

/** "KS": the letters an order number is shown with (KS-1001), from Settings or the shop's name. */
export async function orderPrefixFor(tenantId: string): Promise<string> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)))
  return orderPrefix(r?.prefix ?? '', r?.name ?? '')
}

/**
 * Everything one page of the Orders list needs, in ONE transaction (N1c, speed review: a keystroke was 3 transactions
 * and ~7 round trips): the rows and the shop's prefix together, then the risk facts of those rows. Risk unreadable →
 * null (rows say "Risk unavailable", never fail open). The counts are not here: a search asks for none.
 */
export async function ordersPage(tenantId: string, ask: ListAsk) {
  return withTenant(tenantId, async (tx) => {
    const [list, shop] = await Promise.all([listOrdersWith(tx, tenantId, ask), queueShopWith(tx, tenantId)])
    const page = list.slice(0, ORDERS_PAGE)
    const facts = await tx.transaction((sp) => riskFactsWith(sp, tenantId, { ids: page.map((o) => o.id) }, ask.now)).catch((err) => {
      console.error('[orders] risk', errName(err)); return null
    })
    return { list: page, more: list.length > ORDERS_PAGE, facts, ...shop }
  })
}

/** The queue's shop facts in one read: the order prefix and the default slip size (Settings › Documents, D2). */
async function queueShopWith(tx: Tx, tenantId: string): Promise<{ prefix: string; slipSize: 'a4' | 'label' }> {
  const [r] = await (tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name, slipSize: shopSettings.slipSize }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)))
  return { prefix: orderPrefix(r?.prefix ?? '', r?.name ?? ''), slipSize: r?.slipSize === 'label' ? 'label' : 'a4' }
}

/**
 * The nav pill (spec U · U·2a): how many orders wait in To confirm, over all of them — the To confirm tab's own
 * predicate, so pill and tab agree. React cache() keys it on the tenant alone for one request (the layout and a
 * page may both ask); `now` is taken inside, so the pill and the page's tabs differ by microseconds at most.
 */
/** The console nav's two counts in ONE transaction (speed review P8): orders to confirm, and this member's unread
 *  Frrata notices (capped at 10: the pill shows 9+). Per request, shared by both pills. */
/** What the shell shows on every page: the counts on Orders and Notices, and the store's address under its name (Neel
 * N1: the sidebar draws it; read here, in the same transaction, so the shell adds no request of its own). */
export const navCounts = cache(async (tenantId: string, userId: string): Promise<{ toConfirm: number; unread: number; address: string | null }> => {
  const now = new Date()
  return withTenant(tenantId, async (tx) => {
    const [[r], unread, [shop], domain] = await Promise.all([
      tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), inTabSql('to_confirm', now))),
      unreadNotices(tx, tenantId, userId),
      tx.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
      mainDomainIn(tx, tenantId),
    ])
    return { toConfirm: Number(r?.n ?? 0), unread, address: shop ? mainAddress(shopHost(shop.slug), domain) : null }
  })
})

export const toConfirmCount = cache(async (tenantId: string): Promise<number> => {
  const now = new Date()
  const [r] = await withTenant(tenantId, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), inTabSql('to_confirm', now))),
  )
  return Number(r?.n ?? 0)
})

/**
 * How many orders a tab holds under the filters (and a search, which covers every tab): the phone sheet's and the
 * "+ Filter" panel's "Show 25 orders", asked before the person looks (N1c). One count; JIT off.
 */
export async function countOrders(tenantId: string, { tab = 'all', q = '', filters = {}, now }: ListAsk): Promise<number> {
  const search = parseOrderSearch(q)
  return withTenant(tenantId, async (tx) => {
    await tx.execute(sql`set local jit = off`)
    if (search) await tx.execute(sql`set local statement_timeout = '1500ms'`)
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders)
      .where(and(eq(orders.tenantId, tenantId), search ? searchSql(search, tenantId) : inTabSql(tab, now), filterSql(filters, now) ?? undefined))
    return r?.n ?? 0
  })
}

/** The fields "+ Filter" can list values for, each a fixed SQL expression: a request names one, never writes one. */
const VALUE_SQL = { pay: () => paymentKindSql(), st: () => sql<string>`"orders"."state"` } as const
export type ValueField = keyof typeof VALUE_SQL
export const isValueField = (f: string): f is ValueField => f in VALUE_SQL

/**
 * A filter's values with how many orders each has, inside the tab and the OTHER filters (so a count says what picking
 * it would show). Its own transaction with an 800 ms ceiling (a named exception to the 100 ms query budget,
 * frata-architecture § Speed): a timeout returns null and the panel lists the values without counts.
 */
export async function filterValues(tenantId: string, field: ValueField, { tab = 'all', filters = {}, now }: ListAsk): Promise<{ value: string; n: number }[] | null> {
  const others: OrderFilters = { ...filters }
  if (field === 'pay') delete others.pay
  else delete others.states
  return withTenant(tenantId, async (tx) => {
    await tx.execute(sql`set local jit = off`)
    await tx.execute(sql`set local statement_timeout = '800ms'`)
    const v = VALUE_SQL[field]()
    const rows = await tx.select({ value: sql<string>`${v}`, n: sql<number>`count(*)::int` }).from(orders)
      .where(and(eq(orders.tenantId, tenantId), inTabSql(tab, now), filterSql(others, now) ?? undefined, field === 'st' ? sql`"orders"."state" <> ''` : undefined))
      .groupBy(sql`1`).orderBy(sql`2 desc`).limit(40)
    // orders.state is free text (assisted and imported orders): only names on the closed list can be a filter.
    return rows.filter((r) => field !== 'st' || r.value in STATE_CODE).map((r) => ({ value: r.value, n: Number(r.n) }))
  }).catch((err) => { console.error('[orders] filter values', errName(err)); return null })
}

/**
 * Quick look (N1c·4): one order by its number inside the member's shop — its named columns, its live lines (title,
 * options, qty, unit price; NEVER unit_cost), its last three events — in one transaction, three statements together.
 * Another shop's number finds nothing, as a missing one does.
 */
export async function peekOrder(tenantId: string, number: number) {
  return withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({
      id: orders.id, number: orders.number, customerName: orders.customerName, phone: orders.phone, addressLine: orders.addressLine, area: orders.area,
      landmark: orders.landmark, city: orders.city, state: orders.state, pincode: orders.pincode, total: orders.total, erasedAt: orders.erasedAt, ...momentColumns,
    }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.number, number)))
    if (!o) return null
    const [lines, events] = await Promise.all([
      tx.select({ title: orderLines.title, options: orderLines.optionValues, qty: orderLines.qty, unitPrice: orderLines.unitPrice }).from(orderLines)
        .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id), isNull(orderLines.removedAt))).orderBy(asc(orderLines.position)).limit(20),
      tx.select({ kind: orderEvents.kind, reason: orderEvents.reason, fields: orderEvents.fields, at: orderEvents.at }).from(orderEvents)
        .where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.orderId, o.id))).orderBy(desc(orderEvents.at)).limit(3),
    ])
    return { order: o, lines, events }
  })
}
