import 'server-only'
import { quote, SEAT_PLANS, type Buy, type SeatPlan } from '@/domains/studio/prices'
import { paise } from '@/domains/money/paise'
import { billingGatewayIsTest, billingKeyId, createCustomer, createOrder, createSeatOrder, isBillingGatewayConfigured, orderByReceipt, orderPayments } from '@/lib/billing/gateway'
import { frrataSeller } from '@/lib/billing/seller'
import { beginPurchase, countConfirm, payments, system, type BuyRow, type CreditError } from '@/lib/db/partner-credits'
import type { Caller } from '@/lib/db/partners'
import type { PartnerOk } from '@/lib/auth/require-partner'
import { VERCEL_ENV } from '@/lib/env'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/studio/purchase.ts — BUYING STUDIO CREDITS AND THE SEAT (C1·3; plan docs/plans/2026-11-22-c1-credits.md, reviews
// of 2026-11-22). The order of things, every time:
//   1. the attempt row, committed (ADR-0008): the buyer, the seller and the GST frozen on it;
//   2. the gateway's order, made by OUR server for that attempt (a retry finds it by receipt);
//   3. Checkout in the browser; its answer only tells us to look: the server asks the gateway for the payments on OUR
//      order (tenancy H1) and the definer applies what it says — or the verified webhook does, whichever is first.
// Money is believed from nowhere else. Test keys move no money; on Production they buy nothing (security H1), and a live
// key never buys before Frrata's seller is real (security M2).
// =============================================================================

/** Real money: Production. A test lot never pays for anything here (security H1). */
export const realMoney = () => VERCEL_ENV === 'production'

export type Started = { ok: true; key: string; order: string; purchaseId: string; amount: number; customer: string | null; recurring: boolean }
  | { ok: false; error: CreditError | 'not_configured' | 'test_keys' | 'seller' | 'gateway' }

/** Why buying is refused here and now, before anything is written. */
export function buyingRefused(): 'not_configured' | 'test_keys' | 'seller' | null {
  if (!isBillingGatewayConfigured()) return 'not_configured'
  if (realMoney() && billingGatewayIsTest()) return 'test_keys'
  if (!billingGatewayIsTest() && frrataSeller().test) return 'seller'
  return null
}

/** Starts a purchase: the attempt row, then the gateway's order. A seat also makes (or reuses) the gateway's customer. */
export async function startPurchase(auth: PartnerOk, buy: Buy, method: 'upi' | 'card' | null = null): Promise<Started> {
  const refused = buyingRefused()
  if (refused) return { ok: false, error: refused }
  const c: Caller = { userId: auth.userId, sessionId: auth.sessionId, stepup: auth.stepup }
  const pay = await payments(c)
  if (!pay.ok) return { ok: false, error: pay.error }
  const d = pay.value.details
  if (!d?.legalName || !d.stateCode || !d.address) return { ok: false, error: 'details_first' }
  const seller = frrataSeller()
  const q = quote(buy, seller.gstin, d.stateCode)
  if (!q) return { ok: false, error: 'bad_input' }
  const test = billingGatewayIsTest()
  const seat = buy.kind === 'seat' ? SEAT_PLANS[buy.plan] : null
  if (seat && !method) return { ok: false, error: 'bad_input' }
  const row: BuyRow = {
    kind: buy.kind === 'seat' ? 'seat_start' : buy.kind, credits: q.credits, plan: buy.kind === 'seat' ? buy.plan : null, method: seat ? method : null,
    mandateMax: seat ? seat.mandateMax : null, taxable: q.taxable, cgst: q.cgst, sgst: q.sgst, igst: q.igst, test, invoiceTest: seller.test || test,
    seller: { name: seller.name, gstin: seller.gstin, address: seller.address, sac: seller.sac, prefix: seller.prefix, fy: seller.fy },
  }
  const begun = await beginPurchase(c, row)
  if (!begun.ok) return { ok: false, error: begun.error }
  const { id, receipt, total } = begun.value
  try {
    let customer: string | null = null
    let order = (await orderByReceipt(receipt))?.id ?? null
    if (seat) {
      const ctx = await system.ctx(id)
      customer = ctx?.customerId ?? null
      if (!customer) {
        const made = await createCustomer({ name: d.legalName.slice(0, 50), email: auth.partner.email, contact: auth.partner.phone })
        customer = await system.setCustomer(id, made.id)
      }
      if (!customer) return { ok: false, error: 'gateway' }
      order ??= (await createSeatOrder({ customer, method: method!, amount: total, maxAmount: seat.mandateMax, receipt })).id
    } else {
      order ??= (await createOrder({ amount: total, receipt })).id
    }
    await system.setOrder(id, order, false)
    return { ok: true, key: billingKeyId(), order, purchaseId: id, amount: total, customer, recurring: !!seat }
  } catch (e) {
    // The attempt stays; the hourly run closes it if no order or payment ever came of it.
    console.error('[credits] start', errName(e))
    return { ok: false, error: 'gateway' }
  }
}

export type Confirmed = { ok: true; state: 'added' | 'waiting' | 'declined' | 'refunding' } | { ok: false; error: CreditError | 'gateway' }

/**
 * After Checkout: asks the gateway about OUR order for this attempt and applies its answer. Idempotent and harmless for
 * any caller (it can only settle an attempt by what the gateway says), counted per person.
 */
export async function confirmPurchase(c: Caller, purchaseId: string): Promise<Confirmed> {
  const n = await countConfirm(c)
  if (!n.ok) return { ok: false, error: n.error }
  // Only the caller's own purchase (impact review: never prompt another partner's attempt).
  const mine = await payments(c)
  if (!mine.ok) return { ok: false, error: mine.error }
  if (!mine.value.purchases.some((x) => x.id === purchaseId)) return { ok: false, error: 'not_found' }
  const ctx = await system.ctx(purchaseId)
  if (!ctx?.orderId) return { ok: false, error: 'not_found' }
  try {
    const items = (await orderPayments(ctx.orderId)).items
    const done = items.find((p) => p.status === 'captured') ?? items.find((p) => p.status === 'failed')
    if (!done) return { ok: true, state: 'waiting' }
    const r = await system.apply({ order: ctx.orderId, payment: done.id, captured: done.status === 'captured', amount: done.amount, currency: done.currency,
      test: billingGatewayIsTest(), reason: done.error_description ?? null, token: done.token_id ?? null })
    if (r === 'applied' || r === 'duplicate') return { ok: true, state: done.status === 'captured' ? 'added' : 'declined' }
    if (r === 'failed') return { ok: true, state: 'declined' }
    // Money taken that can't buy (a changed amount, a second payment): it is going back (the hourly run refunds it).
    if (r === 'refund_due' || r === 'refund_pending') return { ok: true, state: 'refunding' }
    return { ok: true, state: 'waiting' }
  } catch (e) {
    console.error('[credits] confirm', errName(e))
    return { ok: false, error: 'gateway' }
  }
}

/** The price a person reads before choosing, with GST (no buyer state needed: 18% whatever the heads). */
export const seatPrice = (plan: SeatPlan) => paise(SEAT_PLANS[plan].price)
