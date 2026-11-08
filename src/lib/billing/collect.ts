import 'server-only'
import { nextStep } from '@/domains/billing/collect'
import { beginBillingAttempt, billingAttemptResult, billingDue, billingNotice, billingUnsettled } from '@/lib/db/platform'
import { errName } from '@/lib/log'
import { billingGatewayIsTest, isBillingGatewayConfigured, orderPayments } from './gateway'

// =============================================================================
// FILE: src/lib/billing/collect.ts — THE DAILY COLLECTION RUN (billing B3). For each issued invoice still due, the next
// step from nextStep() (pure): a notice, an attempt (its payment row and its outbox row 'bill:attempt' in one
// transaction, sent by src/lib/billing/debit.ts), the day-14 acknowledgement, or nothing. Safe to repeat: the definers
// refuse a second unsettled attempt and the unique (invoice, attempt) holds. The shop is never blocked.
// =============================================================================

export type CollectResult = { looked: number; notices: number; attempts: number; acknowledged: number; skipped: number; settled: number }

export async function collectDue(now: Date, deadline = Infinity): Promise<CollectResult> {
  const out: CollectResult = { looked: 0, notices: 0, attempts: 0, acknowledged: 0, skipped: 0, settled: 0 }
  // First, settle what a lost webhook left open, so a stuck attempt never blocks the next.
  if (isBillingGatewayConfigured()) {
    for (const u of await billingUnsettled(120)) {
      if (Date.now() > deadline) break
      try {
        const items = (await orderPayments(u.order)).items
        const p = items.find((x) => x.status === 'captured') ?? items.find((x) => x.status === 'failed')
        if (p && (await billingAttemptResult(u.order, p.id, p.status === 'captured', p.error_description ?? null))) out.settled++
      } catch (e) { console.error('[billing] settle', u.paymentId, errName(e)) }
    }
  }
  const due = await billingDue()
  const test = billingGatewayIsTest(), configured = isBillingGatewayConfigured()
  for (const d of due) {
    if (Date.now() > deadline) { out.skipped++; continue }
    out.looked++
    const step = nextStep(d, now, test)
    try {
      if (step.kind === 'acknowledge') { await billingNotice(d.invoiceId, 'acknowledge', d.due, null); out.acknowledged++ }
      else if (!configured) continue // no gateway yet: notices and debits wait; the shop keeps working
      else if (step.kind === 'notice') { await billingNotice(d.invoiceId, 'debit_notice', d.due, step.debitAt); out.notices++ }
      else if (step.kind === 'attempt') { if (await beginBillingAttempt(d.invoiceId, step.attempt)) out.attempts++ }
    } catch (e) { console.error('[billing] collect', d.invoiceId, errName(e)) }
  }
  return out
}
