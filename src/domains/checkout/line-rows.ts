// =============================================================================
// FILE: src/domains/checkout/line-rows.ts — A CODE-SITE CHECKOUT'S LINES WITH THE REMOVED ONES IN THEIR PLACE
// (one-address plan P2·4; owner call 3: "Removed <product>. · Undo" in the line's place). Pure: the stepper
// (src/components/storefront/checkout-stepper.tsx) draws what this returns.
// =============================================================================

/** A line the shopper removed on this page: what Undo puts back, and where its row stood. */
export type GoneLine = { variantId: string; qty: number; title: string; at: number }

/** What Undo puts back: the quantity the shopper had (the quote's, else what the bag asked for), at least one. */
export const goneOf = (l: { variantId: string; qty: number; requested: number; title: string }, at: number): GoneLine =>
  ({ variantId: l.variantId, qty: Math.max(1, l.qty || l.requested), title: l.title, at })

/** The rows to draw: the quote's lines (a removed one left out if the quote still has it), each removed line put back
 *  at the row it stood in, earliest first. */
export function lineRows<L extends { variantId: string }>(lines: readonly L[], gone: readonly GoneLine[]): ({ line: L } | { gone: GoneLine })[] {
  const rows: ({ line: L } | { gone: GoneLine })[] = lines.filter((l) => !gone.some((x) => x.variantId === l.variantId)).map((line) => ({ line }))
  for (const x of [...gone].sort((a, b) => a.at - b.at)) rows.splice(Math.min(x.at, rows.length), 0, { gone: x })
  return rows
}
