// =============================================================================
// FILE: src/domains/money/paise.ts
//
// MONEY IS AN INTEGER COUNT OF PAISE. Never a float of rupees: 0.1 + 0.2 is not
// 0.3, and a settlement reconciled in floats drifts by a paisa an order until
// the payout and the dashboard disagree. Razorpay's API speaks paise too.
// Rupees exist only at the edge, when a person types one or reads one.
// =============================================================================

export type Paise = number & { readonly __unit: 'paise' }

export function paise(n: number): Paise {
  if (!Number.isInteger(n)) throw new Error(`[money] paise must be an integer, got ${n}`)
  return n as Paise
}

/** "1,499.50" typed by a person → 149950. Rounds to the nearest paisa. */
export function fromRupees(rupees: number): Paise {
  return paise(Math.round(rupees * 100))
}

export function toRupees(p: Paise): number {
  return p / 100
}

export function sum(values: readonly Paise[]): Paise {
  return paise(values.reduce((a, b) => a + b, 0))
}

/** A rate in basis points (1% = 100 bps) applied to an amount, rounded half up. */
export function applyBps(amount: Paise, bps: number): Paise {
  return paise(Math.round((amount * bps) / 10_000))
}
