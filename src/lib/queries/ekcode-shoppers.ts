import 'server-only'
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { customerSessions, shopCustomers } from '@/lib/db/schema-customers'
import { orders } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/queries/ekcode-shoppers.ts — Console › Apps › EkCode (approved mockup v4, "Console › Apps": Overview
// and Shoppers). Only the shop's own tenant rows: its shoppers, their sign-in sessions and orders. Nothing from the
// vault (ekcode_*), so a shop never learns anything EkCode keeps for other shops.
// =============================================================================

export type EkcodeOverview = { signIns7: number; shoppers: number; newShoppers30: number; orders30: number; filled30: number }
export type ShopperRow = { id: string; name: string; phone: string; firstAt: Date; orders: number }
export type ShopperView = 'all' | 'no_order'

const DAY = 86_400_000

export async function ekcodeOverview(tenantId: string, now: Date): Promise<EkcodeOverview> {
  const d7 = new Date(now.getTime() - 7 * DAY), d30 = new Date(now.getTime() - 30 * DAY)
  return withTenant(tenantId, async (tx) => {
    const [[s], [c], [o]] = await Promise.all([
      tx.select({ n: count() }).from(customerSessions).where(and(eq(customerSessions.tenantId, tenantId), gte(customerSessions.createdAt, d7))),
      tx.select({ all: count(), fresh: sql<number>`count(*) filter (where ${shopCustomers.createdAt} >= ${d30.toISOString()}::timestamptz)`.mapWith(Number) })
        .from(shopCustomers).where(eq(shopCustomers.tenantId, tenantId)),
      tx.select({ all: count(), filled: sql<number>`count(*) filter (where ${orders.customerId} is not null)`.mapWith(Number) })
        .from(orders).where(and(eq(orders.tenantId, tenantId), gte(orders.placedAt, d30), isNull(orders.cancelledAt))),
    ])
    return { signIns7: s?.n ?? 0, shoppers: c?.all ?? 0, newShoppers30: c?.fresh ?? 0, orders30: o?.all ?? 0, filled30: o?.filled ?? 0 }
  })
}

/** A page of the shop's shoppers, newest first, with how many orders each placed; and the count of each view. */
export async function ekcodeShoppers(tenantId: string, view: ShopperView, page: number, size = 50) {
  // The outer row is named in full: drizzle writes a column bare in a one-table select, which inside the subquery
  // would mean the order's own column.
  const placed = sql<number>`(select count(*) from ${orders} o where o.tenant_id = "shop_customers"."tenant_id" and o.customer_id = "shop_customers"."id")`.mapWith(Number)
  const noOrder = sql`not exists (select 1 from ${orders} o where o.tenant_id = "shop_customers"."tenant_id" and o.customer_id = "shop_customers"."id")`
  return withTenant(tenantId, async (tx) => {
    const mine = eq(shopCustomers.tenantId, tenantId)
    const where = view === 'no_order' ? and(mine, noOrder) : mine
    const [rows, [counts]] = await Promise.all([
      tx.select({ id: shopCustomers.id, name: shopCustomers.name, phone: shopCustomers.phone, firstAt: shopCustomers.createdAt, orders: placed })
        .from(shopCustomers).where(where).orderBy(desc(shopCustomers.createdAt), desc(shopCustomers.id)).limit(size).offset(Math.max(0, page - 1) * size),
      tx.select({ all: count(), noOrder: sql<number>`count(*) filter (where ${noOrder})`.mapWith(Number) }).from(shopCustomers).where(mine),
    ])
    return { rows: rows as ShopperRow[], counts: { all: counts?.all ?? 0, no_order: counts?.noOrder ?? 0 } }
  })
}

