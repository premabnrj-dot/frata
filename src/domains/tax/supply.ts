// =============================================================================
// FILE: src/domains/tax/supply.ts — intra- or inter-state supply, by state code. Its own small module (no rate table) so
// a browser page that shows a price with GST (Studio credits) doesn't load every HSN rate; ./gst re-exports both.
// =============================================================================

/** The state code a GSTIN belongs to (its first two digits), e.g. "08" Rajasthan. */
export const gstinState = (gstin: string | null) => (gstin && /^[0-9]{2}/.test(gstin) ? gstin.slice(0, 2) : null)

/**
 * CGST + SGST when the place of supply is the seller's own state, IGST otherwise (IGST Act s.10(1)(a): goods
 * moved to the buyer — the delivery state). Compared by STATE CODE: an order stores the delivery state by name.
 */
export function supplyKind(sellerGstin: string | null, supplyStateCode: string | null): 'intra' | 'inter' {
  const seller = gstinState(sellerGstin)
  return seller && supplyStateCode && seller === supplyStateCode ? 'intra' : 'inter'
}
