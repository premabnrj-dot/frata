import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { discountUses, fits, liveDiscountSql } from '@/lib/db/discount-predicates'
import { priorOrderSql } from '@/lib/db/order-predicates'
import { discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import type { Tx } from '@/lib/db'

// =============================================================================
// FILE: src/lib/orders/offers-fit.ts — WHETHER AN ORDER MAY STILL BE PAID AT ITS OFFERS after its hold ran out (a retry
// online, a switch to pay on delivery). Moved out of payment.ts as it is (OE·2, the size gate).
// =============================================================================

/**
 * After a hold ran out, whether the order may still be paid at its offers: each is still live (not paused, ended or
 * stopped by Frrata: "before paying, never after"), a first-order one is still the phone's first, and each limited
 * one still has room for it (the order's own use excluded), under a lock. Exported for its int test.
 */
export async function offersStillFit(tx: Tx, tenantId: string, orderId: string, phone: string, now: Date, way: 'prepaid' | 'cod' = 'prepaid'): Promise<boolean> {
  const all = await tx.select({ discountId: orderDiscounts.discountId, amount: orderDiscounts.amount, cls: orderDiscounts.class, method: orderDiscounts.method, firstOrder: discounts.firstOrder, live: sql<boolean>`${liveDiscountSql(now)}` }).from(orderDiscounts)
    .innerJoin(discounts, and(eq(discounts.tenantId, orderDiscounts.tenantId), eq(discounts.id, orderDiscounts.discountId)))
    .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId), isNull(orderDiscounts.removedAt)))
  // Only the offers the order would be paid at this way: paying online never needs the COD-only order offer, and paying
  // on delivery never the pay-online saving or an online-only order offer (offers per method, 0106).
  const mine = all.filter((m) => (way === 'cod' ? m.cls !== 'payment' && m.method !== 'prepaid' : m.method !== 'cod'))
  if (!mine.length) return true
  if (mine.some((m) => !m.live)) return false
  // A first-order offer: the phone may have ordered since this hold ran out (impact review) — same lock, same rule.
  if (mine.some((m) => m.firstOrder)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + ':phone:' + phone}, 0))`)
    const [had] = await tx.execute<{ yes: boolean }>(sql`select ${priorOrderSql(now, tenantId, phone, { except: orderId })} yes`)
    if (had?.yes) return false
  }
  const limited = (await tx.execute<{ id: string; limit_total: number | null; limit_per_phone: number | null; budget: string | null }>(sql`
    select id, limit_total, limit_per_phone, budget from ${discounts} where tenant_id = ${tenantId} and id in ${mine.map((m) => m.discountId)}
      and (limit_total is not null or limit_per_phone is not null or budget is not null) order by id for update`))
  const used = await discountUses(tx, tenantId, limited.map((l) => l.id), now, { phone, excludeOrder: orderId })
  return limited.every((l) => fits({ limitTotal: l.limit_total, limitPerPhone: l.limit_per_phone, budget: l.budget === null ? null : Number(l.budget) }, used.get(l.id),
    Number(mine.find((m) => m.discountId === l.id)!.amount)))
}
