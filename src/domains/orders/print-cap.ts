// =============================================================================
// FILE: src/domains/orders/print-cap.ts — how many documents one print holds. Its own file (page weight, 2026-11-23):
// the orders queue's browser code reads it, and importing documents.ts for it shipped the documents' maths, GST and the
// whole HSN rate table to every Orders page. documents.ts re-exports it.
// =============================================================================

/** The most a print page prints at once (a bulk print of a queue page). */
export const MAX_DOCUMENTS = 50
