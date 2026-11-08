// =============================================================================
// FILE: scripts/cost-sentinels.mjs
//
// THE FIELD NAMES ONLY THE MERCHANT'S BOOKS HAVE — what the goods cost, what
// freight and fees take, what Frata charges. A shopper's browser must never
// receive one (ADR-0003). Read by scripts/check-client-bundle.mjs.
//
// Console pages render these on the server; a console CLIENT component that
// needs one takes a formatted string, never the cost object.
// Bare `cost` and `margin` are NOT here: `margin` is a CSS key.
// =============================================================================

// Offers (offers plan review 17): only names the server derives — an offer's remaining budget and its use count.
export const SENTINELS = ['cogs', 'forwardShipping', 'rtoShipping', 'gatewayBps', 'platformFee', 'adCost', 'codFee', 'unitCost', 'unit_cost', 'budgetLeft', 'useCount']
