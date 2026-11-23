// =============================================================================
// FILE: src/domains/checkout/says-online.ts — one rule of an offer's words, on its own (page weight, 2026-11-23): the
// checkout's offer rows read it, and importing offer-text.ts for it put every offer sentence in the checkout's first
// load. offer-text.ts re-exports it.
// =============================================================================

/** Whether a pay-online offer's own title already says online ("Pay online, save"), so no "(paid online)" after it. */
export const saysOnline = (title: string) => /online/i.test(title)
