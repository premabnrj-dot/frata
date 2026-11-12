// =============================================================================
// FILE: src/domains/orders/captured.ts — WHETHER A RAZORPAY CAPTURE IS THIS ORDER'S PAYMENT. Pure.
// =============================================================================

/** A capture is ours only for exactly the online total we asked Razorpay for, in INR (the webhook, a switch to COD that
 * finds one, a released hold and the payment check all ask this: security review 2026-11-11 LOW-3). */
export function capturedAsAsked(p: { amount: number }, checkout: unknown, currency: unknown = 'INR'): boolean {
  const asked = Number((checkout as { onlineTotal?: number } | null)?.onlineTotal ?? -1)
  return p.amount === asked && currency === 'INR'
}
