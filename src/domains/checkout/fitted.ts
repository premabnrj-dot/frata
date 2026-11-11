import { cleanMobile } from './mobile'

// =============================================================================
// FILE: src/domains/checkout/fitted.ts — WHICH PRICE CHECKOUT SHOWS AND SENDS (shop stress test 2026-11-11). The bag's
// quote (/api/shop/quote) has no phone, so it can't know that a first-order offer or a per-phone limit doesn't fit a
// returning shopper; placement can, and answers 409 "changed" with the price for that phone. Re-asking the phone-less
// quote priced the next tap wrong again, and the shopper looped for good. The placement's quote is kept, under the key
// of what it was priced for, and shown until the bag, the phone, the pincode or the code changes. Pure.
// =============================================================================

/** What a placement's price depends on. The phone as stored (cleanMobile), so "98765 43210" and "+91…" are one key. */
export function fitKey(bag: readonly { variantId: string; qty: number }[], phone: string, pincode: string, code: string | null): string {
  return JSON.stringify([bag.map((b) => [b.variantId, b.qty]), cleanMobile(phone) ?? phone.trim(), pincode.trim(), code ?? null])
}

/** The placement's quote while it still describes this checkout; otherwise the bag's. */
export function shownQuote<Q>(fitted: { key: string; quote: Q } | null, key: string, live: Q | null): Q | null {
  return fitted && fitted.key === key ? fitted.quote : live
}
