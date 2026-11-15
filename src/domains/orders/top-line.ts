import type { OrderState } from './order-state'

// =============================================================================
// FILE: src/domains/orders/top-line.ts — WHAT TO DO NOW, IN MONEY (Neel N2b, mockup § The top line, by state).
// The order page's first line and the phone's: one rule, in the order today's foot line used (each case outranks the
// ones below it). Drawn cases take the drawn words; the cases the board did not draw keep today's words, as do two
// sentences a merchant needs: the CA step after a payment that came after packing, and "ask the owner or a manager".
// Words and paise only: the page formats the money (₹ to the rupee) and the moments it passes in.
// =============================================================================

export type TopLine = { tone: 'calm' | 'warn' | 'bad' | 'ok'; line: string; sub: string | null }

export type TopLineFacts = {
  state: OrderState
  method: 'cod' | 'prepaid'
  paid: boolean
  /** Paid online after it was packed for Pay on delivery (paidAfterPacking). */
  paidAfterPacking: boolean
  /** Paid online after switching to Pay on delivery (paidAfterSwitch). */
  paidAfterSwitch: boolean
  /** What the courier collects (amounts.ts collect), paise. */
  owed: number
  /** What a cancel would send back (amounts.ts paidLeft), paise. */
  refund: number
  /** This person may cancel (refund due names who can). */
  canCancel: boolean
  /** Preformatted: "₹2,290" for paise, and moments the page already words. */
  inr: (paise: number) => string
  confirmedAt?: string | null
  paidAt?: string | null
  deliveredOn?: string | null
  cancelWhy?: string | null
  /** The risk check's first reason, for an order still to confirm. */
  riskFirst?: string | null
}

export function orderTopLine(f: TopLineFacts): TopLine {
  const { state, inr } = f
  if (f.paidAfterPacking && state !== 'cancelled') {
    return { tone: 'bad', line: 'Paid online after packing. Don’t collect cash.',
      sub: 'Tell the courier. If cash was collected too, refund the online payment in Razorpay. The invoice stays as issued. Ask your CA if it needs a credit note.' }
  }
  if (state === 'cancelled') {
    return f.refund ? { tone: 'bad', line: `Paid online, then cancelled. Refund ${inr(f.refund)} in Razorpay.`, sub: f.cancelWhy ?? null }
      : { tone: 'calm', line: 'Cancelled. Nothing to collect.', sub: f.cancelWhy ?? null }
  }
  if (state === 'refund_due') {
    return { tone: 'bad', line: `Refund ${inr(f.refund)} in Razorpay`, sub: `Paid after it sold out. Cancel it first.${f.canCancel ? '' : ' Ask the owner or a manager to cancel it.'}` }
  }
  if (state === 'delivered') {
    return f.method === 'cod' && !f.paid ? { tone: 'ok', line: `${inr(f.owed)} collected by the courier`, sub: f.deliveredOn ? `Delivered ${f.deliveredOn}.` : null }
      : { tone: 'ok', line: 'Delivered.', sub: f.deliveredOn ? `Delivered ${f.deliveredOn}.` : null }
  }
  if ((state === 'rto' || state === 'rto_received') && f.paid) return { tone: 'bad', line: 'Came back after it was paid online. Refund the shopper in Razorpay.', sub: null }
  if (state === 'rto' || state === 'rto_received') return { tone: 'bad', line: 'Coming back. Nothing was collected.', sub: null }
  if (state === 'lost' && f.paid) return { tone: 'bad', line: 'Lost by the courier after it was paid online. Refund the shopper in Razorpay.', sub: 'Claim it with the courier.' }
  if (state === 'lost') return { tone: 'bad', line: 'Lost by the courier. Nothing was collected.', sub: 'Claim it with the courier.' }
  if ((state === 'unconfirmed' || state === 'held') && !f.paid) return { tone: 'warn', line: 'Confirm it before you pack', sub: f.riskFirst ?? null }
  if (f.paidAfterSwitch) return { tone: 'calm', line: 'Paid online. Don’t collect cash.', sub: f.paidAt ? `Razorpay · paid ${f.paidAt}.` : null }
  if (f.owed) return { tone: 'calm', line: `Collect ${inr(f.owed)} on delivery`, sub: f.confirmedAt ? `Confirmed ${f.confirmedAt}.` : null }
  if (f.paid) return { tone: 'calm', line: 'Paid online. Collect nothing.', sub: f.paidAt ? `Razorpay · paid ${f.paidAt}.` : null }
  return { tone: 'calm', line: 'Not paid yet.', sub: null }
}
