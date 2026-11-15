// =============================================================================
// FILE: src/domains/orders/pin-suggest.ts — ONE PIN CODE TO TAKE OFF PAY ON DELIVERY (Neel N2b·3, Settings board).
// "From your returns: add 302012 (3 of 12 came back)". Only a PIN with 10 or more orders that reached an outcome, whose
// came-back share is at least 10 points above the store's own, and not listed already. The highest share wins; a tie
// goes to the PIN with more outcomes. Counts in, one suggestion out. Pure.
// =============================================================================

export type PinOutcomes = { pin: string; outcomes: number; back: number }
export type PinSuggestion = PinOutcomes

export const MIN_OUTCOMES = 10
export const ABOVE_STORE = 0.1

export function pickPinToBlock(pins: readonly PinOutcomes[], store: { outcomes: number; back: number }, blocked: readonly string[]): PinSuggestion | null {
  if (store.outcomes <= 0) return null
  const base = store.back / store.outcomes
  const listed = new Set(blocked)
  let best: PinOutcomes | null = null
  for (const p of pins) {
    if (p.outcomes < MIN_OUTCOMES || listed.has(p.pin) || p.back / p.outcomes < base + ABOVE_STORE - 1e-9) continue
    if (!best || p.back * best.outcomes > best.back * p.outcomes || (p.back * best.outcomes === best.back * p.outcomes && p.outcomes > best.outcomes)) best = p
  }
  return best
}
