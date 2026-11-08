import 'server-only'
import { and, asc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { cache } from 'react'
import { autopayStoppedPause, FEE_EXPOSURE_PAISE, pauseWindow } from '@/domains/plans/trial'
import { CAN_MANAGE } from '@/lib/auth/require-member'
import type { Membership } from '@/lib/db/platform'
import type { Tx } from '@/lib/db'
import { billingAccounts, frrataInvoices } from '@/lib/db/schema-billing'
import { shopTrials } from '@/lib/db/schema-trials'
import { withTenant } from '@/lib/db/tenant'

/**
 * Trials TR1·9: when a shop is paused for no autopay after its trial, or 7 days after autopay stopped (any shop) (no NEW orders; orders already placed carry on).
 * The one read of the rule (pauseWindow, src/domains/plans/trial.ts): the cached shop read carries only this window
 * (no amounts, ADR-0003) and checkout checks it again inside the order transaction. Null: never paused.
 */
export async function shopPauseIn(tx: Tx, tenantId: string): Promise<{ from: Date; to: Date | null } | null> {
  const f = await trialFactsIn(tx, tenantId)
  if (f) return pauseWindow(f.facts, f.mandateAt, f.revokedAt, f.exposedAt)
  // No trial: paused only when autopay stopped, 7 days on (owner, 2026-11-08: as a trial shop).
  const [a] = await tx.select({ revokedAt: billingAccounts.mandateRevokedAt }).from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId))
  return autopayStoppedPause(a?.revokedAt ?? null)
}

/**
 * A shop's trial facts, its autopay, and when its trial fees passed ₹2,000 before GST without autopay (owner,
 * 2026-11-08: the grace then starts early). Exposure: the unpaid, issued (non-test) invoices since sign-up, summed in
 * issue order; the moment is the issue of the one that crossed the line. Null: no trial.
 */
export async function trialFactsIn(tx: Tx, tenantId: string) {
  const [t] = await tx.select({ days: shopTrials.days, openWindowDays: shopTrials.openWindowDays, signedUpAt: shopTrials.signedUpAt, startedAt: shopTrials.startedAt, extendedAt: shopTrials.extendedAt, endedAt: shopTrials.endedAt })
    .from(shopTrials).where(eq(shopTrials.tenantId, tenantId))
  if (!t) return null
  const [[a], unpaid] = await Promise.all([
    tx.select({ mandateAt: billingAccounts.mandateAt, revokedAt: billingAccounts.mandateRevokedAt }).from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId)),
    tx.select({ issuedAt: frrataInvoices.issuedAt, taxable: frrataInvoices.taxable }).from(frrataInvoices)
      .where(and(eq(frrataInvoices.tenantId, tenantId), isNotNull(frrataInvoices.number), eq(frrataInvoices.testMode, false), gte(frrataInvoices.issuedAt, t.signedUpAt),
        sql`${frrataInvoices.total} > coalesce((select sum(p.amount) from frrata_payments p where p.invoice_id = "frrata_invoices"."id" and p.captured_at is not null), 0)`))
      .orderBy(asc(frrataInvoices.issuedAt)),
  ])
  let sum = 0, exposedAt: Date | null = null
  for (const i of unpaid) { sum += Number(i.taxable); if (sum > FEE_EXPOSURE_PAISE && i.issuedAt) { exposedAt = i.issuedAt; break } }
  return { facts: t, mandateAt: a?.mandateAt ?? null, revokedAt: a?.revokedAt ?? null, exposedAt }
}
export const pausedAt = (p: { from: Date | string; to: Date | string | null } | null, now: Date) =>
  !!p && now >= new Date(p.from) && (!p.to || now < new Date(p.to))


/** The pause window for the console's banner: owners and admins only, once per request. */
export const shopPauseFor = cache(async (m: Pick<Membership, 'tenantId' | 'role'>) =>
  (CAN_MANAGE as readonly string[]).includes(m.role) ? withTenant(m.tenantId, (tx) => shopPauseIn(tx, m.tenantId)) : null)
