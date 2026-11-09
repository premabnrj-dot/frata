import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { discountCodes, discounts } from '@/lib/db/schema-discounts'
import { withTenant } from '@/lib/db/tenant'

/** The announcement bar's offer, uncached (storefront.ts wraps it as shopAnnouncement). */
export const coreAnnouncement = (tenantId: string) => withTenant(tenantId, async (tx) => {
  const [r] = await tx.select({
    title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, minSubtotal: discounts.minSubtotal, listed: discounts.listed,
    startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt, code: discountCodes.code,
  }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
    .where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true))).limit(1)
  if (!r) return null
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return { title: r.title, style: r.style, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), minSubtotal: Number(r.minSubtotal),
    code: r.listed && r.code ? r.code.toUpperCase() : null, startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt), startedAt: iso(r.startedAt), pausedAt: iso(r.pausedAt), endedAt: iso(r.endedAt), stoppedAt: iso(r.stoppedAt) }
})
