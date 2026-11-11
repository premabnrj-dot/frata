import 'server-only'
import { and, eq, gt, sql } from 'drizzle-orm'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { invoice, type CreditReason } from '@/domains/orders/documents'
import { creditOpen, discountCredit, restockOf, returnCredit, reversalCredit, type CreditKind, type CreditLine, type InvoicedLine, type Taken } from '@/domains/orders/credits'
import { gstHeads } from '@/domains/tax/gst'
import { applies, invoiceNumber, InvoiceNumberTooLong, MAX_IN_YEAR, seriesFits } from '@/domains/orders/work'

/** What a merchant reads when the year's credit series is full. */
export const CREDIT_SERIES_FULL = `This year's credit notes are used up (${MAX_IN_YEAR.credit.toLocaleString('en-IN')}). Shorten the invoice series in Settings › Taxes and invoices to make room, or ask Frrata.`
import { orderPrefix } from '@/domains/signup/slug'
import type { Tx } from '@/lib/db'
import { shopSettings, tenantCounters, tenants } from '@/lib/db/schema'
import { variants } from '@/lib/db/schema-catalogue'
import { creditNoteLines, creditNotes, orderLines } from '@/lib/db/schema-orders'
import { documentsFor } from './documents'
import { current, record, type Actor, type Done } from './work'

// =============================================================================
// FILE: src/lib/orders/credit.ts — ISSUING A CREDIT NOTE (Documents D3; plan finding 8). In the caller's tenant
// transaction (asMember CAN_MANAGE, audited), the order locked: only for an order whose invoice was issued and whose
// sale was then undone — cancelled after packing, or back at the shop — and only once. It reverses the invoice in
// full: the figures are the invoice's own, from the frozen rows. Its number comes from the shop's credit series
// (tenant_counters kind 'credit', per financial year), taken in the same transaction, so a refusal leaves no gap.
// A return after delivery can put its pieces back in stock ("Put these pieces back in stock", as Came back's tick):
// in the same transaction, once (with the note's own lines, which are final), never for a discount, goodwill or a
// reversal (cancel and Came back restock on their own), never above what the line sold less earlier restocks
// (restockOf). credit_note_lines.restocked_qty records it; ₹ kept takes those pieces' cost back off COGS.
// =============================================================================

/** This year's credit series is used up (past C9,999): thrown so the counter rolls back, said in words by the caller. */
export class CreditSeriesFull extends Error {}

/** What a credit note is for (GST phase 2). None: the whole invoice (what is left of it) when the sale was undone. */
export type CreditRequest =
  /** `restock`: put the returned pieces back on their variants' stock (lines whose stock was taken). */
  | { kind: 'return'; lines: Record<string, number>; restock: boolean }
  /** `agreed`: agreed before the sale (reduces GST, s.15(3)(b)); otherwise goodwill (no GST effect). `amount` as the shopper reads it. */
  | { kind: 'discount'; amount: number; agreed: boolean }

export async function issueCredit(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date(), req?: CreditRequest): Promise<Done<{ number: string; backInStock: string[] }>> {
  // A credit note is permanent and changes the shop's GST filings: the shop's own people only, never a Frrata support
  // visit (security review 2026-11-08; as the address, payment keys and logo).
  if (actor.kind === 'support') return { ok: false, error: 'Only the shop’s owner or an admin can issue a credit note.' }
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  if (!req && !applies('credit', c.state)) return { ok: false, error: 'A credit note is for an order cancelled after packing, or one that came back.' }
  if (req && !applies('part_credit', c.state)) return { ok: false, error: 'Items returned or a discount after the sale are credited once the order is delivered.' }
  const docs = await documentsFor(tx, tenantId, [c.o.number], 'credit', now)
  const d = docs.orders[0]
  const inv = d ? invoice(d.o, d.lines, docs.shop) : null
  if (!d || !inv) return { ok: false, error: 'No invoice was issued for this order (it was cancelled before packing): there is nothing to credit.' }
  // The time limit: 30 November after the invoice's financial year (s.34(2)). A goodwill credit has none (not a GST document).
  const goodwill = req?.kind === 'discount' && !req.agreed
  if (!goodwill && !creditOpen(inv.date, now)) return { ok: false, error: 'The time for a credit note against this invoice ended on 30 November after its financial year.' }
  // What earlier notes already took (a pre-0071 reversal took the whole invoice).
  const prior = d.credits.filter((x) => x.kind !== 'goodwill')
  if (prior.some((x) => !x.lines)) return { ok: false, error: `Already credited in full: credit note ${prior.find((x) => !x.lines)!.number}.` }
  const taken: Taken[] = prior.flatMap((x) => x.lines ?? [])
  const invoiced: InvoicedLine[] = d.lines.flatMap((l) => (l.id ? [{ lineId: l.id, qty: l.qty, taxable: l.taxableValue, gst: l.gst, chargeTaxable: l.chargeTaxable ?? 0, chargeGst: l.chargeGst ?? 0, bps: l.gstBps }] : []))
  const tax = inv.kind === 'tax_invoice'
  let lines: CreditLine[] = []
  let kind: CreditKind, reason: CreditReason
  if (!req) { lines = reversalCredit(invoiced, taken); kind = 'reversal'; reason = c.state === 'cancelled' ? 'cancelled' : 'came_back'; if (!lines.length) return { ok: false, error: 'Everything on this invoice is credited already.' } }
  else if (req.kind === 'return') { const r = returnCredit(invoiced, taken, req.lines); if (!r.ok) return r; lines = r.lines; kind = 'return'; reason = 'returned' }
  else if (req.agreed) { const r = discountCredit(invoiced, taken, req.amount, inv.pricesIncludeGst); if (!r.ok) return r; lines = r.lines; kind = 'discount'; reason = 'discount' }
  else {
    if (!Number.isInteger(req.amount) || req.amount <= 0) return { ok: false, error: 'An amount in rupees.' }
    // Never more than the invoice less everything credited so far, of any kind (unit-economics review 2026-11-09).
    const room = inv.totals.total - d.credits.reduce((a, x) => a + x.total, 0)
    if (req.amount > room) return { ok: false, error: room > 0 ? `At most ₹${(room / 100).toLocaleString('en-IN')} is left on this invoice.` : 'Everything on this invoice is credited already.' }
    kind = 'goodwill'; reason = 'goodwill'
  }
  // A bill of supply carries no GST: its lines credit the value only.
  if (!tax) lines = lines.map((l) => ({ ...l, taxable: l.taxable + l.gst, gst: 0, bps: 0 }))
  const heads = lines.reduce((a, l) => { const h = gstHeads(l.gst, inv.supply); return { cgst: a.cgst + h.cgst, sgst: a.sgst + h.sgst, igst: a.igst + h.igst } }, { cgst: 0, sgst: 0, igst: 0 })
  const taxable = kind === 'goodwill' ? (req as { amount: number }).amount : lines.reduce((a, l) => a + l.taxable, 0)
  const total = taxable + heads.cgst + heads.sgst + heads.igst
  const [s] = await tx.select({ series: shopSettings.invoiceSeries, prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants)
    .innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  if (s?.series && !seriesFits(s.series)) return { ok: false, error: 'The credit note number would be longer than GST allows (16 characters). Shorten the invoice series in Settings › Taxes and invoices.' }
  const fy = fiscalYear(now)
  // A goodwill credit has its own series (G0001…), so the GST credit series and GSTR-1's documents table stay clean.
  const series = kind === 'goodwill' ? 'goodwill' : 'credit'
  const [n] = await tx.insert(tenantCounters).values({ tenantId, kind: series, period: fy, next: 2 })
    .onConflictDoUpdate({ target: [tenantCounters.tenantId, tenantCounters.kind, tenantCounters.period], set: { next: sql`${tenantCounters.next} + 1` } })
    .returning({ next: tenantCounters.next })
  let number: string
  try { number = invoiceNumber({ series: s?.series ?? '', orderPrefix: orderPrefix(s?.prefix ?? '', s?.name ?? ''), fiscalYear: fy, n: n!.next - 1, kind: series }) } catch (e) {
    if (e instanceof InvoiceNumberTooLong) throw new CreditSeriesFull()
    throw e
  }
  // Pieces back in stock: a return only, when asked (the order is locked by current(), so earlier restocks are settled).
  const back = kind === 'return' && req?.kind === 'return' && req.restock ? await restockReturn(tx, tenantId, orderId, lines) : { restocked: {}, backInStock: [] }
  const [note] = await tx.insert(creditNotes).values({ tenantId, orderId, number, againstInvoice: inv.number, reason, kind, taxable, ...heads, total, issuedAt: now, issuedBy: actor.userId }).returning({ id: creditNotes.id })
  if (lines.length) await tx.insert(creditNoteLines).values(lines.map((l) => ({ tenantId, creditNoteId: note!.id, orderLineId: l.lineId, qty: l.qty, taxable: l.taxable, gst: l.gst, gstBps: l.bps, restockedQty: back.restocked[l.lineId] ?? 0 })))
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'credit_noted', now, { reason }), number, backInStock: back.backInStock }
}

/**
 * A return's pieces back on their variants (restockOf: lines whose stock was taken, never above what the line sold less
 * earlier notes' restocks), in variant order as putStockBack. Says what each line actually put back (a variant gone
 * meanwhile puts back nothing, so its cost is never added back) and which variants came back from 0.
 */
async function restockReturn(tx: Tx, tenantId: string, orderId: string, lines: CreditLine[]): Promise<{ restocked: Record<string, number>; backInStock: string[] }> {
  const sold = await tx.select({ id: orderLines.id, qty: orderLines.qty, variantId: orderLines.variantId, takenAt: orderLines.stockTakenAt }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId)))
  const prior = await tx.select({ lineId: creditNoteLines.orderLineId, restockedQty: creditNoteLines.restockedQty }).from(creditNoteLines)
    .innerJoin(creditNotes, and(eq(creditNotes.tenantId, creditNoteLines.tenantId), eq(creditNotes.id, creditNoteLines.creditNoteId)))
    .where(and(eq(creditNoteLines.tenantId, tenantId), eq(creditNotes.orderId, orderId), gt(creditNoteLines.restockedQty, 0)))
  const ask = restockOf(lines, sold.map((l) => ({ lineId: l.id, qty: l.qty, stocked: !!l.variantId && !!l.takenAt })), prior)
  const restocked: Record<string, number> = {}
  const backInStock: string[] = []
  for (const l of sold.filter((x) => x.variantId && ask[x.id]).sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)))) {
    const n = ask[l.id]!
    const [v] = await tx.update(variants).set({ stock: sql`${variants.stock} + ${n}` })
      .where(and(eq(variants.tenantId, tenantId), eq(variants.id, l.variantId!))).returning({ stock: variants.stock })
    if (!v) continue
    restocked[l.id] = n
    if (v.stock - n <= 0 && !backInStock.includes(l.variantId!)) backInStock.push(l.variantId!)
  }
  return { restocked, backInStock }
}
