// =============================================================================
// FILE: src/domains/catalogue/stories-facts.ts — the half of stories.ts a browser may load: limits and the pairing
// rule, no zod (page weight, 2026-11-23: the product editor imported these and shipped all of zod, 26 kB gzipped).
// stories.ts re-exports everything here; the save's check stays there, on the server.
// =============================================================================

export const MAX_STORIES = 6, MAX_NOTES = 3, MAX_PAIRS = 2
export const STORY_LIMITS = { title: 60, text: 300, note: 60 } as const

/** What a shopper is offered for a paired piece: Add only with no options (one variant) and buyable; else Choose (its
 *  page), so a sized piece is never put in the bag without its size (architecture review 6). */
export const pairAction = (p: { options: string[]; variants: number }): 'add' | 'choose' =>
  p.options.length === 0 && p.variants === 1 ? 'add' : 'choose'

/** A piece as the editor's "Pair it with" card shows it (src/lib/queries/catalogue.ts reads it). */
export type Piece = { id: string; title: string; status: string; options: string[]; base: string | null; widths: number[] | null; price: number | null; sizes: number; buyable: boolean }
