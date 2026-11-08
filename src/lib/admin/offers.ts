import 'server-only'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { tenants } from '@/lib/db/schema'
import { discounts } from '@/lib/db/schema-discounts'
import { runningOffers } from '@/lib/db/discount-predicates'
import type { StaffOk } from '@/lib/auth/require-staff'
import { offerStatus, type OfferStatus } from '@/domains/checkout/offer-status'
import { MAX_RUNNING_OFFERS } from '@/domains/checkout/offer-form'
import { auditStaff } from './audit'

// =============================================================================
// FILE: src/lib/admin/offers.ts — Admin › Offers (offers O·4): platform totals and the kill switch. Through
// frata_admin (ADR-0007; drizzle/0042): a shop's offers are read by the columns that say what an offer is and where it
// stands (never its terms, limits, budget, codes or uses); a stop sets only stopped_*; totals come from the definer
// app_admin_offer_totals, aggregates per shop. Status is offerStatus, as the shop sees it. Every write is audited in its
// own transaction. Staff role admin stops and resumes; support staff only see.
// =============================================================================

const moments = {
  startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt,
}

export type ShopOfferTotals = { tenantId: string; name: string; orders: number; given: number; live: number; stopped: number }

/** Every shop with an offer used since `since`, or a live or stopped one: orders using one, ₹ given, offers live now. By ₹ given. */
export async function offerTotalsForAdmin(staff: StaffOk, now: Date, since: Date): Promise<ShopOfferTotals[]> {
  void staff
  const db = adminDb()
  const [totals, open, names] = await Promise.all([
    db.execute<{ tenant_id: string; orders: string; given: string }>(sql`select tenant_id, orders, given from app_admin_offer_totals(${since.toISOString()}::timestamptz)`),
    db.select({ tenantId: discounts.tenantId, ...moments }).from(discounts).where(isNull(discounts.endedAt)),
    db.select({ id: tenants.id, name: tenants.name }).from(tenants),
  ])
  const by = new Map<string, ShopOfferTotals>()
  const nameOf = new Map(names.map((n) => [n.id, n.name]))
  const row = (id: string) => by.get(id) ?? (by.set(id, { tenantId: id, name: nameOf.get(id) ?? id, orders: 0, given: 0, live: 0, stopped: 0 }), by.get(id)!)
  for (const t of totals) Object.assign(row(t.tenant_id), { orders: Number(t.orders), given: Number(t.given) })
  for (const o of open) {
    const s = offerStatus(o, now)
    if (s === 'live') row(o.tenantId).live++
    else if (s === 'stopped') row(o.tenantId).stopped++
  }
  return [...by.values()].sort((a, b) => b.given - a.given || b.live - a.live || a.name.localeCompare(b.name))
}

export type AdminOffer = { id: string; title: string; style: string; status: OfferStatus; startsAt: Date; endsAt: Date | null; stoppedAt: Date | null; stopReason: string | null }

/** One shop's offers (newest 200), by the granted columns, with the status the shop sees. Null for an unknown shop. */
export async function shopOffersForAdmin(staff: StaffOk, tenantId: string, now: Date): Promise<{ name: string; offers: AdminOffer[] } | null> {
  void staff
  const db = adminDb()
  const [shop] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId))
  if (!shop) return null
  const rows = await db.select({ id: discounts.id, title: discounts.title, style: discounts.style, stopReason: discounts.stopReason, ...moments }).from(discounts)
    .where(eq(discounts.tenantId, tenantId)).orderBy(asc(discounts.endedAt), desc(discounts.startsAt)).limit(200)
  return { name: shop.name, offers: rows.map((r) => ({ id: r.id, title: r.title, style: r.style, status: offerStatus(r, now), startsAt: r.startsAt, endsAt: r.endsAt, stoppedAt: r.stoppedAt, stopReason: r.stopReason })) }
}

/** Stop an offer that has not ended, with Frrata's reason (shown to the shop). Audited. False if there was none to stop. */
export async function stopOffer(staff: StaffOk, tenantId: string, id: string, reason: string, now = new Date()): Promise<boolean> {
  return adminDb().transaction(async (tx) => {
    const r = await tx.update(discounts).set({ stoppedAt: now, stoppedBy: staff.userId, stopReason: reason })
      .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), isNull(discounts.stoppedAt))).returning({ id: discounts.id })
    if (!r.length) return false
    await auditStaff(tx, staff, { tenantId, action: 'offer.stop', target: id, detail: { reason } })
    return true
  })
}

/**
 * Resume an offer Frrata stopped (all three stopped_* cleared) — unless it has ended, or a started one would take the
 * shop past MAX_RUNNING_OFFERS (counted under the shop's offers lock, as a start is). Audited.
 */
export async function resumeOffer(staff: StaffOk, tenantId: string, id: string, now = new Date()): Promise<'resumed' | 'full' | 'none'> {
  return adminDb().transaction(async (tx) => {
    const [cur] = await tx.select({ startedAt: discounts.startedAt, endsAt: discounts.endsAt }).from(discounts)
      .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), isNotNull(discounts.stoppedAt)))
    if (!cur) return 'none'
    const wouldRun = !!cur.startedAt && (!cur.endsAt || cur.endsAt > now)
    if (wouldRun && await runningOffers(tx, tenantId, now) >= MAX_RUNNING_OFFERS) return 'full'
    const r = await tx.update(discounts).set({ stoppedAt: null, stoppedBy: null, stopReason: null })
      .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id), isNull(discounts.endedAt), isNotNull(discounts.stoppedAt))).returning({ id: discounts.id })
    if (!r.length) return 'none'
    await auditStaff(tx, staff, { tenantId, action: 'offer.resume', target: id })
    return 'resumed'
  })
}
