import 'server-only'
import { monthStartIST, nextMonthStartIST } from '@/domains/time/month'
import { shopsToBill } from '@/lib/db/platform'
import { eachLimited } from '@/lib/outbox/drain'
import { errName } from '@/lib/log'
import { draftInvoice } from './draft'

// =============================================================================
// FILE: src/lib/billing/run.ts — THE BILLING RUN (billing B0): drafts every billed shop's invoice, shop by shop, each
// in its own transaction. Daily from the cron and on demand from Admin › Billing ("Run drafts"). It drafts this
// month's invoice until it is issued, then next month's — the shop's "month so far". Safe to repeat (draft.ts).
// =============================================================================

export type RunResult = { months: string[]; drafted: number; issued: number; failed: number; skipped: number }

/** The two months a run may draft: this one (until issued) and the next (the month so far). Nothing else. */
export const draftableMonths = (now: Date) => [monthStartIST(now), nextMonthStartIST(now)]

/** `deadline` (ms since epoch): shops not reached by then are skipped and counted; the next run drafts them. */
export async function runDrafts(now: Date, months: Date[] = draftableMonths(now), deadline = Infinity): Promise<RunResult> {
  const allowed = new Set(draftableMonths(now).map((m) => m.getTime()))
  if (months.some((m) => !allowed.has(m.getTime()))) throw new Error('runDrafts: only this month and next')
  const out: RunResult = { months: months.map((m) => m.toISOString()), drafted: 0, issued: 0, failed: 0, skipped: 0 }
  // In order: this month first, so an order billable before the 1st is billed on this month's invoice.
  for (const month of months) {
    const shops = await shopsToBill(nextMonthStartIST(month))
    await eachLimited(shops, 4, async (tenantId) => {
      if (Date.now() > deadline) { out.skipped++; return }
      try {
        const r = await draftInvoice(tenantId, month, now)
        if (r.invoiceId) out.drafted++
        else out.issued++
      } catch (e) { out.failed++; console.error('[billing] draft', tenantId, errName(e)) }
    })
  }
  return out
}
