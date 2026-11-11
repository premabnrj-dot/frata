// =============================================================================
// FILE: src/domains/money/usd.ts — what vendors bill Frrata, in integer micro-dollars (ADR-0004's rule, integer money,
// extended to vendor costs: amendment recorded in docs/plans/2026-11-11-guardrails-infra-a2.md). Vercel, Mux and
// Supabase bill in USD with fractions of a cent; one conversion point turns their decimals into integers. Pure.
// =============================================================================

export type MicroUsd = number & { readonly __unit: 'micro-usd' }

/** A vendor's decimal dollar amount (number or string) as integer micro-dollars; anything not a finite number is 0. */
export function microUsd(dollars: number | string | null | undefined): MicroUsd {
  const n = typeof dollars === 'string' ? Number(dollars) : dollars ?? 0
  return (Number.isFinite(n) ? Math.round(n * 1e6) : 0) as MicroUsd
}

export const usdOf = (m: MicroUsd) => m / 1e6
export const sumUsd = (xs: readonly MicroUsd[]) => xs.reduce((a, b) => a + b, 0) as MicroUsd
