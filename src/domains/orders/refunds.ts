// =============================================================================
// FILE: src/domains/orders/refunds.ts
//
// WHAT A PAID ORDER'S EDIT DOES WITH THE MONEY (order edit OE·2; plan docs/plans/2026-11-12-order-edit.md § Razorpay facts
// that shape OE·2; frata-integrations § Razorpay, refunds rechecked 2026-11-12). Pure; paise; no clock (now is passed).
//
// - A ledger per Razorpay payment: what can still be refunded = captured − the attempts that count (queued, being sent,
//   sent, processed). A failed or cancelled attempt gives nothing back. After a paid increase an order has two payments.
// - What the shopper has paid net = Σ captured − Σ counted refunds. A new total below it refunds the difference, above
//   it asks for the difference first; under ₹1 (Razorpay's minimum) either way, nothing moves: the shop absorbs it.
// - A refund is split over the payments, newest first, never on one 6 months old or more (Razorpay refuses a normal
//   refund then), each part at least ₹1.
// - An attempt's stage comes from its moments (order_refunds), never a status column.
// =============================================================================

/** Razorpay's smallest payment and refund: ₹1. */
export const MIN_PAISE = 100

/** One captured payment that paid this order: its Razorpay id, what it captured and when. */
export type Paid = { id: string; amount: number; at: Date }
/** An attempt's moments (order_refunds). */
export type RefundMoments = { cancelledAt: Date | null; sendingAt: Date | null; sentAt: Date | null; processedAt: Date | null; failedAt: Date | null }
export type RefundRow = RefundMoments & { id: string; razorpayPaymentId: string; amount: number; failure: string | null; retryOf: string | null; notBefore: Date }

export type RefundStage = 'queued' | 'sending' | 'sent' | 'processed' | 'cancelled' | 'failed'

export function refundStage(r: RefundMoments): RefundStage {
  if (r.cancelledAt) return 'cancelled'
  if (r.failedAt) return 'failed'
  if (r.processedAt) return 'processed'
  if (r.sentAt) return 'sent'
  if (r.sendingAt) return 'sending'
  return 'queued'
}

/** An attempt that takes money off the payment (or will): only failed and cancelled ones give it back. */
export const counts = (r: RefundMoments) => { const s = refundStage(r); return s !== 'failed' && s !== 'cancelled' }

/** What each payment can still refund. */
export function refundable(payments: Paid[], refunds: Pick<RefundRow, 'razorpayPaymentId' | 'amount' | keyof RefundMoments>[]): Map<string, number> {
  return new Map(payments.map((p) => [p.id, p.amount - refunds.filter((r) => r.razorpayPaymentId === p.id && counts(r)).reduce((a, r) => a + r.amount, 0)]))
}

/** What the shopper has paid for this order, net of every refund that counts. */
export const paidNet = (payments: Paid[], refunds: Parameters<typeof refundable>[1]) => [...refundable(payments, refunds).values()].reduce((a, b) => a + b, 0)

/** 6 months after a payment Razorpay can no longer refund it at normal speed; a day short of it, to be safe. */
export function tooOldToRefund(at: Date, now: Date): boolean {
  const limit = new Date(at)
  limit.setUTCMonth(limit.getUTCMonth() + 6)
  return now.getTime() >= limit.getTime() - 86_400_000
}

export type Settle =
  | { kind: 'none' }
  /** Lower by ₹1 or more: refunded, split over `parts`. */
  | { kind: 'refund'; amount: number; parts: { paymentId: string; amount: number }[] }
  /** Lower, but a payment that must carry it is 6 months old: refused before Save. */
  | { kind: 'too_old'; amount: number }
  /** Higher by ₹1 or more: the shopper pays it first (the edit waits). */
  | { kind: 'ask'; amount: number }
  /** Within ₹1 either way: nothing asked or sent (the edit applies). */
  | { kind: 'absorb'; amount: number }

/** What the new total means for the money already paid. `paid` null: not paid online (pay on delivery collects it). */
export function settleOf(newTotal: number, paid: { payments: Paid[]; refunds: Parameters<typeof refundable>[1] } | null, now: Date): Settle {
  if (!paid) return { kind: 'none' }
  const left = refundable(paid.payments, paid.refunds)
  const net = [...left.values()].reduce((a, b) => a + b, 0)
  const diff = newTotal - net
  if (diff === 0) return { kind: 'none' }
  if (Math.abs(diff) < MIN_PAISE) return { kind: 'absorb', amount: diff }
  if (diff > 0) return { kind: 'ask', amount: diff }
  let due = -diff
  const parts: { paymentId: string; amount: number }[] = []
  for (const p of [...paid.payments].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    if (!due) break
    const room = left.get(p.id) ?? 0
    if (room < MIN_PAISE || tooOldToRefund(p.at, now)) continue
    // Never leave a part under ₹1 for the next payment: take a rupee less here when that would happen.
    let take = Math.min(room, due)
    if (due - take > 0 && due - take < MIN_PAISE) take = Math.max(0, due - MIN_PAISE)
    if (take < MIN_PAISE) continue
    parts.push({ paymentId: p.id, amount: take })
    due -= take
  }
  return due ? { kind: 'too_old', amount: -diff } : { kind: 'refund', amount: -diff, parts }
}

/** Signed: what Save sends (+) or asks for (−) — the figure the panel showed, compared under the order's lock. */
export const dueOf = (s: Settle) => (s.kind === 'refund' ? s.amount : s.kind === 'ask' ? -s.amount : 0)

/** Why an attempt failed, in the merchant's words (our codes only: Razorpay's own words can quote a shopper). */
export const FAILURE_WORDS: Record<string, string> = {
  balance: 'Not enough balance in Razorpay: add funds, then try again.',
  too_old: 'Paid over 6 months ago: Razorpay can\'t refund it. Refund the shopper yourself.',
  disabled: 'Refunds are off for this payment in Razorpay: turn them on, then try again.',
  over: 'Razorpay shows part of this payment already refunded. Check Razorpay, then try again.',
  keys: 'Razorpay refused your keys: check them in Settings, then try again.',
  refused: 'Razorpay refused this refund. Check Razorpay, then try again.',
  failed: 'Razorpay could not complete this refund. Try again.',
}

/** A failure the merchant must act on before it is tried again (the rest are tried again by themselves). */
export const needsMerchant = (failure: string | null) => failure !== null && failure !== 'failed'

/** How many times a refund Razorpay failed after accepting it is tried again by itself, before it waits for Try again. */
export const AUTO_RETRIES = 2

/**
 * The refunds to show on the order: each chain of attempts (a first try and its retries) as its latest attempt. A failed
 * latest attempt is "not sent" with its cause and Try again; a cancelled one is not shown.
 */
export function refundChains<T extends Pick<RefundRow, 'id' | 'retryOf' | keyof RefundMoments>>(rows: T[]): T[] {
  const retried = new Set(rows.flatMap((r) => (r.retryOf ? [r.retryOf] : [])))
  return rows.filter((r) => !retried.has(r.id) && refundStage(r) !== 'cancelled')
}

/**
 * A refund on the order page, after its amount: "refund · sends at 10:52" (waiting out the Undo window), "refund · with
 * Razorpay", "refunded · 5–10 working days to reach the shopper", or "not sent" (its cause beside it). Why, when it was
 * not an edit's lower total: a payment that came after its change was dropped, or one at the order's old total.
 */
export function refundLine(r: RefundMoments & { cause: string; failure: string | null }, sendsAt: string): { words: string; failed: string | null } {
  const why = r.cause === 'after_drop' ? ' · paid after the change was dropped' : r.cause === 'old_order' ? ' · paid at the old total' : ''
  const s = refundStage(r)
  if (s === 'failed') return { words: `not sent${why}`, failed: FAILURE_WORDS[r.failure ?? 'failed'] ?? FAILURE_WORDS.failed! }
  if (s === 'queued') return { words: `refund · sends ${sendsAt}${why}`, failed: null }
  if (s === 'processed') return { words: `refunded · 5–10 working days to reach the shopper${why}`, failed: null }
  return { words: `refund · with Razorpay${why}`, failed: null }
}

/** The attempts before this one in its chain (to count automatic retries). */
export function chainLength<T extends Pick<RefundRow, 'id' | 'retryOf'>>(rows: T[], last: T): number {
  let n = 1, at: T | undefined = last
  while (at?.retryOf) { at = rows.find((r) => r.id === at!.retryOf); n++ }
  return n
}
