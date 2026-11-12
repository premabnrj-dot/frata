import 'server-only'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { usedUpIds } from '@/lib/db/discount-predicates'
import { discountCodes, discounts } from '@/lib/db/schema-discounts'
import { withTenant } from '@/lib/db/tenant'

/**
 * The announcement bar's offer, uncached (storefront.ts wraps it as shopAnnouncement). Only a STARTED, unended offer
 * asking for the bar: a draft may ask for it too (it takes the bar when it starts), and ended ones keep `announce`, so
 * an unfiltered `limit(1)` could pick one of those and hide the live bar (shopper batch 2026-11-12). Among started,
 * unended offers at most one asks (the `discounts_one_announce` index); the order is only a tie-break. Paused,
 * scheduled or stopped is decided at render (offerStatus), from these timestamps. An offer used up for everyone (its
 * total limit or budget: usedUp) is not shown; the limit and budget never leave this function (ADR-0003).
 */
export const coreAnnouncement = (tenantId: string) => withTenant(tenantId, async (tx) => {
  const [r] = await tx.select({
    id: discounts.id, limitTotal: discounts.limitTotal, budget: discounts.budget,
    title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, minSubtotal: discounts.minSubtotal, listed: discounts.listed,
    startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt, code: discountCodes.code,
  }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
    .where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true), sql`${discounts.startedAt} is not null and ${discounts.endedAt} is null`))
    .orderBy(asc(discounts.startedAt), asc(discounts.id), asc(discountCodes.code)).limit(1)
  if (!r || (await usedUpIds(tx, tenantId, [r], new Date())).has(r.id)) return null
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return { title: r.title, style: r.style, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), minSubtotal: Number(r.minSubtotal),
    code: r.listed && r.code ? r.code.toUpperCase() : null, startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt), startedAt: iso(r.startedAt), pausedAt: iso(r.pausedAt), endedAt: iso(r.endedAt), stoppedAt: iso(r.stoppedAt) }
})
