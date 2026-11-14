import 'server-only'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { currentMethod, orderState, type OrderState, type QueueTab } from '@/domains/orders/order-state'
import { risk, type Risk } from '@/domains/orders/risk'
import { orderPrefix } from '@/domains/signup/slug'
import { istDayStart } from '@/domains/time/day'
import { enteredAtSql, inTabSql, momentColumns, standingSql, openSql, orderItemsSql } from '@/lib/db/order-predicates'
import { shopSettings, tenants } from '@/lib/db/schema'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { queueCountsWith } from './orders'
import { riskFactsWith } from './order-risk'

// =============================================================================
// FILE: src/lib/queries/today.ts
//
// WHAT HOME SHOWS ONCE THE SHOP IS OPEN (docs/specs/2026-11-07-ux-today.md), in ONE read-only repeatable-read
// transaction (one snapshot), so the counts, the oldest waits, the next order and "N high risk" describe the same moment. The counts are queueCounts'
// own (the nav pill and the Orders tabs read the same predicates); risk is risk() over riskFactsWith, the order
// page's rules. Every statement names its tenant as well as running under the policy.
//
// The risk read runs in a savepoint with a 2 s statement timeout: at festive volume a slow one shows "Risk
// unavailable" (high: null) instead of holding Home, and never aborts the rest of the read.
// =============================================================================

const RISK_TIMEOUT_MS = 2000

export type NextOrder = {
  id: string; number: number; label: string; customerName: string; total: number; cod: boolean
  state: OrderState; since: Date; risk: Risk['level'] | null
  /** Where it goes and how many pieces ("Jaipur · 2 items", Neel § Screens · Home). */
  city: string | null; items: number
}

export type TodaySummary = {
  counts: Record<QueueTab, number>
  /** Oldest entry (enteredAt) in To pack and On hold; To confirm's is `next.since`. */
  oldest: { to_pack: Date | null; on_hold: Date | null }
  next: NextOrder | null
  /** The first five to confirm, oldest first (Home's "Next to confirm", Neel N1); `next` is the first of them. */
  nextFive: NextOrder[]
  /** High-risk orders waiting in To confirm; null when the risk read failed or timed out. */
  high: number | null
  /** Standing orders (placed, not cancelled) by IST day, over the last 7 IST days. Value in paise. */
  week: { day: string; orders: number; value: number }[]
}

const asDate = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)))

export async function todaySummary(tenantId: string, now: Date): Promise<TodaySummary> {
  return withTenant(tenantId, async (tx) => {
    const day = sql<string>`((${orders.placedAt} at time zone 'Asia/Kolkata')::date)::text`
    // Five reads at once in the one transaction (speed review P8: postgres-js pipelines them; they ran in turn).
    const [counts, [w], five, [p], week] = await Promise.all([queueCountsWith(tx, tenantId, now), tx.select({
      to_pack: sql<string | null>`min(${enteredAtSql(now)}) filter (where ${inTabSql('to_pack', now)})`,
      on_hold: sql<string | null>`min(${enteredAtSql(now)}) filter (where ${inTabSql('on_hold', now)})`,
    }).from(orders).where(and(eq(orders.tenantId, tenantId), openSql())), // open orders only: the partial index (1D·7)
    tx.select({ id: orders.id, number: orders.number, customerName: orders.customerName, total: orders.total, city: orders.city, ...momentColumns, entered: sql<string | null>`${enteredAtSql(now)}`,
      items: orderItemsSql(tenantId) })
      .from(orders).where(and(eq(orders.tenantId, tenantId), inTabSql('to_confirm', now)))
      .orderBy(asc(enteredAtSql(now)), asc(orders.number)).limit(5),
    tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants)
      .leftJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)),
    tx.select({ day, orders: sql<number>`count(*)::int`, value: sql<string>`coalesce(sum(${orders.total}), 0)::bigint` })
      .from(orders).where(and(eq(orders.tenantId, tenantId), standingSql(), gte(orders.placedAt, istDayStart(now, -6))))
      .groupBy(day),
    ])
    const prefix = orderPrefix(p?.prefix ?? '', p?.name ?? '')

    // Risk last, in a savepoint: a timeout rolls back only the savepoint (and its SET LOCAL), not the read; on success
    // the limit is put back by hand. Each of its two statements gets the 2 s, so the worst case is about 4 s.
    const facts = await tx.transaction(async (sp) => {
      await sp.execute(sql.raw(`set local statement_timeout = ${RISK_TIMEOUT_MS}`))
      const f = await riskFactsWith(sp, tenantId, { tab: 'to_confirm' }, now)
      // SET LOCAL outlives RELEASE: put the limit back, so nothing after this inherits it (impact review U·4).
      await sp.execute(sql.raw('set local statement_timeout to default'))
      return f
    }).catch((err) => {
      // 57014 is a statement timeout (drizzle wraps the error, so its name alone says only "Error").
      const code = (err as { cause?: { code?: string } })?.cause?.code
      console.error('[today] risk', code === '57014' ? 'timeout' : err instanceof Error ? err.name : 'error'); return null
    })
    const levels = facts ? new Map([...facts].map(([id, f]) => [id, risk(f).level])) : null

    const nextFive: NextOrder[] = five.map((n) => ({
      id: n.id, number: n.number, label: `${prefix}-${n.number}`, customerName: n.customerName, total: Number(n.total),
      cod: currentMethod(n) === 'cod', state: orderState(n, now), since: asDate(n.entered) ?? n.placedAt,
      // Missing from the map (it arrived after the risk read) is unknown, never another order's level.
      risk: levels?.get(n.id) ?? null, city: n.city, items: Number(n.items),
    }))
    const next = nextFive[0] ?? null

    return {
      counts, next, nextFive,
      oldest: { to_pack: asDate(w?.to_pack), on_hold: asDate(w?.on_hold) },
      high: levels ? [...levels.values()].filter((l) => l === 'high').length : null,
      week: week.map((r) => ({ day: r.day, orders: Number(r.orders), value: Number(r.value) })),
    }
  }, { snapshot: true })
}
