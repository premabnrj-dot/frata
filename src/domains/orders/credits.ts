// =============================================================================
// FILE: src/domains/orders/credits.ts — WHAT A CREDIT NOTE CREDITS (GST plan phase 2, docs/plans/2026-11-09-gst-core-and-
// categories.md § 2 and § 5b items 2–3). Pure; paise; the invoice's own rate on every line (a credit note keeps its
// invoice's rate and HSN, never today's).
//
//   - return:   lines or part quantities brought back after delivery: the goods' taxable value and GST pro rata by
//               quantity (the last unit takes what is left, so the sum never drifts); delivery is not credited.
//   - discount: a discount agreed BEFORE the sale, given afterwards (CGST s.15(3)(b), from 1 Nov 2026 by credit note
//               only): shared over the lines by what is left of them, taxed at each line's rate.
//   - goodwill: money back with no GST effect (no lines, no tax heads; never in GSTR-1).
//   - reversal: the invoice undone (cancelled after packing, came back): whatever is left, delivery's share included.
//   - restock:  a return's pieces back on the shelf (restockOf), never more than the line sold less earlier restocks.
// A credit note can't credit more than the invoice left: every function reads what earlier notes already took.
// =============================================================================

import { apportion, split } from '@/domains/tax/gst'

export const CREDIT_KINDS = ['reversal', 'return', 'discount', 'goodwill'] as const
export type CreditKind = (typeof CREDIT_KINDS)[number]

/** An invoiced line: goods (taxable, gst) and its share of the charges, at its rate. */
export type InvoicedLine = { lineId: string; qty: number; taxable: number; gst: number; chargeTaxable: number; chargeGst: number; bps: number }
/** What earlier notes took from a line (credit_note_lines). */
export type Taken = { lineId: string; qty: number; taxable: number; gst: number }
export type CreditLine = { lineId: string; qty: number; taxable: number; gst: number; bps: number }

/** What is left of each line: quantity, and value (goods plus the charges' share). */
export function leftOf(lines: InvoicedLine[], taken: Taken[]) {
  return lines.map((l) => {
    const t = taken.filter((x) => x.lineId === l.lineId)
    const sum = (k: 'qty' | 'taxable' | 'gst') => t.reduce((a, x) => a + x[k], 0)
    return { ...l, qtyLeft: l.qty - sum('qty'), taxableLeft: l.taxable + l.chargeTaxable - sum('taxable'), gstLeft: l.gst + l.chargeGst - sum('gst') }
  })
}

/** Lines brought back: `ask` is line id → quantity. Pro rata on the goods' value; the last unit takes the goods' remainder. */
export function returnCredit(lines: InvoicedLine[], taken: Taken[], ask: Record<string, number>): { ok: true; lines: CreditLine[] } | { ok: false; error: string } {
  const left = leftOf(lines, taken)
  const out: CreditLine[] = []
  for (const [lineId, q] of Object.entries(ask)) {
    if (!q) continue
    const l = left.find((x) => x.lineId === lineId)
    if (!l) return { ok: false, error: 'That item isn’t on this invoice.' }
    if (!Number.isInteger(q) || q < 0 || q > l.qtyLeft) return { ok: false, error: `At most ${l.qtyLeft} can be credited for that item.` }
    const takenQty = l.qty - l.qtyLeft
    const goodsTaxableTaken = Math.round((l.taxable * takenQty) / l.qty), goodsGstTaken = Math.round((l.gst * takenQty) / l.qty)
    const last = q === l.qtyLeft
    const taxable = last ? l.taxable - goodsTaxableTaken : Math.round((l.taxable * (takenQty + q)) / l.qty) - goodsTaxableTaken
    const gst = last ? l.gst - goodsGstTaken : Math.round((l.gst * (takenQty + q)) / l.qty) - goodsGstTaken
    out.push({ lineId, qty: q, taxable: Math.max(0, Math.min(taxable, l.taxableLeft)), gst: Math.max(0, Math.min(gst, l.gstLeft)), bps: l.bps })
  }
  if (!out.length) return { ok: false, error: 'Choose what came back.' }
  return { ok: true, lines: out }
}

/**
 * A discount agreed before the sale, given now: `amount` as the shopper reads it (with GST when prices include it),
 * shared over the lines by what is left of them and split at each line's rate. Never more than is left.
 */
export function discountCredit(lines: InvoicedLine[], taken: Taken[], amount: number, inclusive: boolean): { ok: true; lines: CreditLine[] } | { ok: false; error: string } {
  const left = leftOf(lines, taken).filter((l) => l.taxableLeft > 0)
  const room = left.reduce((a, l) => a + (inclusive ? l.taxableLeft + l.gstLeft : l.taxableLeft), 0)
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'A discount in rupees.' }
  if (amount > room) return { ok: false, error: `At most ₹${(room / 100).toLocaleString('en-IN')} is left on this invoice.` }
  const shares = apportion(amount, left.map((l) => (inclusive ? l.taxableLeft + l.gstLeft : l.taxableLeft)))
  return { ok: true, lines: left.map((l, i) => { const s = split(shares[i]!, l.bps, inclusive); return { lineId: l.lineId, qty: 0, taxable: Math.min(s.taxable, l.taxableLeft), gst: Math.min(s.gst, l.gstLeft), bps: l.bps } }).filter((l) => l.taxable + l.gst > 0) }
}

/** The invoice undone: everything left on every line, delivery's share included. Empty when earlier notes took it all. */
export function reversalCredit(lines: InvoicedLine[], taken: Taken[]): CreditLine[] {
  return leftOf(lines, taken).filter((l) => l.taxableLeft > 0 || l.gstLeft > 0 || l.qtyLeft > 0)
    .map((l) => ({ lineId: l.lineId, qty: Math.max(0, l.qtyLeft), taxable: Math.max(0, l.taxableLeft), gst: Math.max(0, l.gstLeft), bps: l.bps }))
}

/** A sold line, for restocking: its quantity, and whether its pieces came off a variant's stock (a variant still there, stock taken). */
export type SoldLine = { lineId: string; qty: number; stocked: boolean }

/**
 * What a return puts back in stock, line id → pieces: each credited line's quantity, never above what was sold on the
 * line less what earlier notes already put back, and only for a line whose stock was taken. Empty for any credit that
 * is not a return of pieces (discount lines carry qty 0). Lines with nothing to put back are left out.
 */
export function restockOf(lines: CreditLine[], sold: SoldLine[], prior: { lineId: string; restockedQty: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of lines) {
    const s = sold.find((x) => x.lineId === l.lineId)
    if (!s?.stocked || l.qty <= 0) continue
    const before = prior.filter((x) => x.lineId === l.lineId).reduce((a, x) => a + x.restockedQty, 0) + (out[l.lineId] ?? 0)
    const n = Math.min(l.qty, Math.max(0, s.qty - before))
    if (n > 0) out[l.lineId] = (out[l.lineId] ?? 0) + n
  }
  return out
}

/**
 * The last day a credit note can be issued against an invoice: 30 November after the end of the invoice's financial
 * year (CGST s.34(2), as amended), as the end of that day in IST. `invoiceDate` is the invoice's (packing) date.
 */
export function creditDeadline(invoiceDate: Date): Date {
  const ist = new Date(invoiceDate.getTime() + 5.5 * 3_600_000)
  const fyStart = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1
  return new Date(Date.UTC(fyStart + 1, 10, 30, 23, 59, 59, 999) - 5.5 * 3_600_000)
}
export const creditOpen = (invoiceDate: Date, now: Date) => now.getTime() <= creditDeadline(invoiceDate).getTime()
