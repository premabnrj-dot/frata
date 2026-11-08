import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { invoice, type CreditReason } from '@/domains/orders/documents'
import { applies, invoiceNumber, seriesFits } from '@/domains/orders/work'
import { orderPrefix } from '@/domains/signup/slug'
import type { Tx } from '@/lib/db'
import { shopSettings, tenantCounters, tenants } from '@/lib/db/schema'
import { creditNotes } from '@/lib/db/schema-orders'
import { documentsFor } from './documents'
import { current, record, type Actor, type Done } from './work'

// =============================================================================
// FILE: src/lib/orders/credit.ts — ISSUING A CREDIT NOTE (Documents D3; plan finding 8). In the caller's tenant
// transaction (asMember CAN_MANAGE, audited), the order locked: only for an order whose invoice was issued and whose
// sale was then undone — cancelled after packing, or back at the shop — and only once. It reverses the invoice in
// full: the figures are the invoice's own, from the frozen rows. Its number comes from the shop's credit series
// (tenant_counters kind 'credit', per financial year), taken in the same transaction, so a refusal leaves no gap.
// =============================================================================

export async function issueCredit(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date()): Promise<Done<{ number: string }>> {
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!applies('credit', c.state)) return { ok: false, error: 'A credit note is for an order cancelled after packing, or one that came back.' }
  const [done] = await tx.select({ number: creditNotes.number }).from(creditNotes).where(and(eq(creditNotes.tenantId, tenantId), eq(creditNotes.orderId, orderId)))
  if (done) return { ok: false, error: `Already credited: credit note ${done.number}.` }
  const docs = await documentsFor(tx, tenantId, [c.o.number], 'invoice', now)
  const d = docs.orders[0]
  const inv = d ? invoice(d.o, d.lines, docs.shop) : null
  if (!inv) return { ok: false, error: 'No invoice was issued for this order (it was cancelled before packing): there is nothing to credit.' }
  const reason: CreditReason = c.state === 'cancelled' ? 'cancelled' : 'came_back'
  const [s] = await tx.select({ series: shopSettings.invoiceSeries, prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants)
    .innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  if (s?.series && !seriesFits(s.series)) return { ok: false, error: 'The credit note number would be longer than GST allows (16 characters). Shorten the invoice series in Settings › Taxes and invoices.' }
  const fy = fiscalYear(now)
  const [n] = await tx.insert(tenantCounters).values({ tenantId, kind: 'credit', period: fy, next: 2 })
    .onConflictDoUpdate({ target: [tenantCounters.tenantId, tenantCounters.kind, tenantCounters.period], set: { next: sql`${tenantCounters.next} + 1` } })
    .returning({ next: tenantCounters.next })
  const number = invoiceNumber({ series: s?.series ?? '', orderPrefix: orderPrefix(s?.prefix ?? '', s?.name ?? ''), fiscalYear: fy, n: n!.next - 1, kind: 'credit' })
  const t = inv.totals
  await tx.insert(creditNotes).values({ tenantId, orderId, number, againstInvoice: inv.number, reason, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.total, issuedAt: now, issuedBy: actor.userId })
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'credit_noted', now, { reason }), number }
}
