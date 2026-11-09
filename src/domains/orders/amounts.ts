// =============================================================================
// FILE: src/domains/orders/amounts.ts
//
// WHAT AN ORDER'S MONEY COMES TO AFTER IT IS PLACED — one function each, read
// by the console, the shopper's page, the packing slip, the invoice and the
// refund line, so none of them works it out again (plan review 2026-11-07).
// Pure; paise. Reads what was stored at placement (checkout/quote.ts). Two recompute:
// `reprice()` — the ONE way a placed order is priced again (a switch to COD, a capture
// after a switch), through checkout's own priceMethod() from the order's stored lines and
// stored offers, so it can never disagree with the quote the shopper saw (offers plan
// review 4); and `charged()` — only for an order placed before 1D (no charge shares yet).
// =============================================================================

import { priceMethod, type MethodPrice } from '@/domains/checkout/discounts'
import { codFor, type Cod, type DeliveryRules } from '@/domains/checkout/delivery'
import { shareCharges, type ChargeShare } from '@/domains/tax/gst'
import { currentMethod, type OrderMoments } from './order-state'

export type StoredLine = { taxableValue: number; gst: number; gstBps: number; chargeTaxable: number | null; chargeGst: number | null }
export type StoredOrder = Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt' | 'cancelledAt'> & {
  subtotal: number; shipping: number; codCharge: number; gstTotal: number; total: number; pricesIncludeGst: boolean
  /** What Razorpay was asked for (checkout.onlineTotal, set once at placement); null on a COD order. */
  onlineTotal?: number | null
}

/**
 * The charges (delivery + COD fee) spread over the lines at their stored rates, and the order's GST and total
 * from them. Only for an order placed before 1D (no charge shares stored; no offers existed): reprice() is
 * everything else.
 */
export function charged(lines: Pick<StoredLine, 'taxableValue' | 'gst' | 'gstBps'>[], o: Pick<StoredOrder, 'subtotal' | 'shipping' | 'pricesIncludeGst'>, codCharge: number) {
  const shares: ChargeShare[] = shareCharges(lines.map((l) => ({ bps: l.gstBps, taxable: l.taxableValue })), o.shipping + codCharge, o.pricesIncludeGst)
  const gstTotal = lines.reduce((a, l) => a + l.gst, 0) + shares.reduce((a, s) => a + s.chargeGst, 0)
  return { shares, gstTotal, codCharge, total: o.subtotal + o.shipping + codCharge + (o.pricesIncludeGst ? 0 : gstTotal) }
}

/** What reprice() needs: the lines as sold, the offers the order got (order_discounts), and the stored charges. */
export type StoredPricing = {
  /** `productDiscount`: the product offers' part of each line, as stored at placement (never re-spread). */
  lines: { unitPrice: number; qty: number; hsn: string | null; productDiscount: number
    /** The line's stored rate: kept for a code the rate table lacks (the merchant's own rate at placement). */
    gstBps?: number | null }[]
  applied: { class: 'product' | 'order' | 'shipping' | 'payment'; amount: number }[]
  shipping: number; registered: boolean; pricesIncludeGst: boolean
  /** When the order was placed: its rates are the table's on that day (the tax the shopper saw), never today's. */
  placedAt?: Date
}

export type Repriced = MethodPrice & { codCharge: number }

/**
 * An order priced again for a way of paying: the order offer's stored amount, and (prepaid only) the pay-online
 * saving's stored amount, spread exactly as at placement, on the stored delivery. Never today's offers: the order
 * keeps the terms it was sold on. Paying on delivery: offered (and its fee) by today's rules on the bag after the
 * order offer — the same test as checkout's (quote.ts) — or `cod.offered` false and no price.
 */
export function reprice(s: StoredPricing, method: 'prepaid'): Repriced
export function reprice(s: StoredPricing, method: 'cod', rules: DeliveryRules, pincode: string | null): { cod: Cod; price: Repriced | null }
export function reprice(s: StoredPricing, method: 'cod' | 'prepaid', rules?: DeliveryRules, pincode?: string | null): Repriced | { cod: Cod; price: Repriced | null } {
  const order = s.applied.find((a) => a.class === 'order')?.amount ?? 0
  const lines = s.lines.map((l) => ({ gross: l.unitPrice * l.qty, qty: l.qty, hsn: l.hsn, productDiscount: l.productDiscount, own: l.gstBps ?? null }))
  const tax = { registered: s.registered, pricesIncludeGst: s.pricesIncludeGst, date: s.placedAt }
  if (method === 'prepaid') return { ...priceMethod(lines, order, s.applied.find((a) => a.class === 'payment')?.amount ?? 0, s.shipping, tax), codCharge: 0 }
  const cod = codFor(lines.reduce((a, l) => a + l.gross - l.productDiscount, 0) - order, rules!, pincode)
  return { cod, price: cod.offered ? { ...priceMethod(lines, order, 0, s.shipping + cod.charge, tax), codCharge: cod.charge } : null }
}

/**
 * The offers that saved on an order's items, as it is paid now: product and order offers always, the pay-online
 * saving only while it is paid online; never free delivery (that reads "Free"). One rule for the console and the shopper.
 */
export const savingsAsPaid = <T extends { class: string }>(offers: T[], method: 'cod' | 'prepaid') =>
  offers.filter((x) => x.class === 'product' || x.class === 'order' || (x.class === 'payment' && method === 'prepaid'))

/** Each line's share as stored, or (an order placed before 1D) worked out from the stored rates. */
export function sharesOf(lines: StoredLine[], o: StoredOrder): ChargeShare[] {
  if (lines.every((l) => l.chargeTaxable !== null && l.chargeGst !== null)) return lines.map((l) => ({ chargeTaxable: l.chargeTaxable!, chargeGst: l.chargeGst! }))
  return charged(lines, o, o.codCharge).shares
}

/** What the courier collects at the door: the total on a COD order not paid online and not cancelled, else nothing. */
export const collect = (o: StoredOrder) => (o.cancelledAt || currentMethod(o) !== 'cod' ? 0 : o.total)

/**
 * What reached the shop's Razorpay account: the online total Razorpay was asked for (and checks the capture against).
 * The order's own total can differ — a capture after a switch and after packing keeps the issued COD figures (COD fee
 * in, pay-online saving out). Orders without a stored online total fall back to their total.
 */
export const paidOnline = (o: StoredOrder) => (o.paidAt ? o.onlineTotal ?? o.total : 0)

/** What the merchant must send back in Razorpay when a paid order is cancelled (Frrata refunds nothing itself). */
export const refundDue = (o: StoredOrder) => (o.cancelledAt ? paidOnline(o) : 0)
