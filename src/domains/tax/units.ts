// =============================================================================
// FILE: src/domains/tax/units.ts — the unit a piece is sold in, as GST names it (UQC: Unique Quantity Code; GSTR-1's
// HSN summary and the invoice's quantity column). Pure. The list is the GST portal's codes a D2C shop uses.
// =============================================================================

export const UQCS = ['NOS', 'PCS', 'PRS', 'SET', 'PAC', 'BOX', 'KGS', 'GMS', 'LTR', 'MLT', 'MTR'] as const
export type Uqc = (typeof UQCS)[number]
export const UQC_NAMES: Record<Uqc, string> = {
  NOS: 'Numbers (pieces)', PCS: 'Pieces', PRS: 'Pairs', SET: 'Sets', PAC: 'Packs', BOX: 'Boxes',
  KGS: 'Kilograms', GMS: 'Grams', LTR: 'Litres', MLT: 'Millilitres', MTR: 'Metres',
}
/** Short, for an invoice's quantity column: "2 NOS". */
export const isUqc = (u: unknown): u is Uqc => typeof u === 'string' && (UQCS as readonly string[]).includes(u)
