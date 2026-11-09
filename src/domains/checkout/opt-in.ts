// =============================================================================
// FILE: src/domains/checkout/opt-in.ts — the WhatsApp opt-in at checkout (Reviews R1 task 6; owner, 2026-11-09).
//
// UNTICKED by default: DPDP s.6 needs a clear affirmative act, and Meta needs an opt-in that names the business. The
// order stores when the shopper ticked it and which notice they read (`WA_OPT_IN_NOTICE`); a new wording is a new
// version, so what each shopper agreed to stays known. Null = never asked or said no: such an order is never messaged.
// =============================================================================

export const WA_OPT_IN_NOTICE = 'v1-en'

export const waOptInText = (shopName: string) => `Send me order updates and a review request from ${shopName} on WhatsApp`
