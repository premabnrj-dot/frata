import { paise } from '@/domains/money/paise'

// =============================================================================
// FILE: src/domains/orders/offer-kept.ts — THE OFFER CARD'S BROWSER HALF (Neel N2b·2): the two figures the server worked
// out (offer-cost.ts) and the one sum the form does as the merchant types. It imports no cost engine, so nothing that
// reads a goods' cost can reach a browser chunk through it (security review 2026-11-15).
// =============================================================================

export type OfferExample = { keptAt0: number; perRupee: number }

/** What the piece keeps with `off` paise off it (the card's second figure). */
export const keptWithOff = (x: OfferExample, off: number) => paise(Math.round(x.keptAt0 - off * x.perRupee))
