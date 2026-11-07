// =============================================================================
// FILE: src/domains/orders/amounts.ts
//
// WHAT AN ORDER'S MONEY COMES TO AFTER IT IS PLACED — one function each, read
// by the console, the shopper's page, the packing slip, the invoice and the
// refund line, so none of them works it out again (plan review 2026-11-07).
// Pure; paise. Reads what was stored at placement (checkout/quote.ts); only
// `charged()` recomputes, from the STORED rates, for the two cases that need
// it: a capture after a switch to COD (the COD fee comes off) and an order
// placed before 1D (its lines have no charge shares yet).
// =============================================================================

import { shareCharges, type ChargeShare } from '@/domains/tax/gst'
import { currentMethod, type OrderMoments } from './order-state'

export type StoredLine = { taxableValue: number; gst: number; gstBps: number; chargeTaxable: number | null; chargeGst: number | null }
export type StoredOrder = Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt' | 'cancelledAt'> & {
  subtotal: number; shipping: number; codCharge: number; gstTotal: number; total: number; pricesIncludeGst: boolean
}

/**
 * The charges (delivery + COD fee) spread over the lines at their stored rates, and the order's GST and total
 * from them. Matches checkout's own figures for the same charges (gst.test.ts); a pre-1D order gets its
 * shares from here.
 */
export function charged(lines: Pick<StoredLine, 'taxableValue' | 'gst' | 'gstBps'>[], o: Pick<StoredOrder, 'subtotal' | 'shipping' | 'pricesIncludeGst'>, codCharge: number) {
  const shares: ChargeShare[] = shareCharges(lines.map((l) => ({ bps: l.gstBps, taxable: l.taxableValue })), o.shipping + codCharge, o.pricesIncludeGst)
  const gstTotal = lines.reduce((a, l) => a + l.gst, 0) + shares.reduce((a, s) => a + s.chargeGst, 0)
  return { shares, gstTotal, codCharge, total: o.subtotal + o.shipping + codCharge + (o.pricesIncludeGst ? 0 : gstTotal) }
}

/** Each line's share as stored, or (an order placed before 1D) worked out from the stored rates. */
export function sharesOf(lines: StoredLine[], o: StoredOrder): ChargeShare[] {
  if (lines.every((l) => l.chargeTaxable !== null && l.chargeGst !== null)) return lines.map((l) => ({ chargeTaxable: l.chargeTaxable!, chargeGst: l.chargeGst! }))
  return charged(lines, o, o.codCharge).shares
}

/** What the courier collects at the door: the total on a COD order not paid online and not cancelled, else nothing. */
export const collect = (o: StoredOrder) => (o.cancelledAt || currentMethod(o) !== 'cod' ? 0 : o.total)

/**
 * What reached the shop's Razorpay account. A capture after a switch has had its COD fee taken off by markPaid
 * (src/lib/orders/payment.ts, from 1D), so it is the total. An order paid after a switch BEFORE 1D still carries
 * the COD fee in its total; none existed in production (0 orders, 2026-11-07).
 */
export const paidOnline = (o: StoredOrder) => (o.paidAt ? o.total : 0)

/** What the merchant must send back in Razorpay when a paid order is cancelled (Frrata refunds nothing itself). */
export const refundDue = (o: StoredOrder) => (o.cancelledAt ? paidOnline(o) : 0)
