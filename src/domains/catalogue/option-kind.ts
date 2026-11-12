// =============================================================================
// FILE: src/domains/catalogue/option-kind.ts
//
// WHAT AN OPTION IS, BY ITS NAME — the one rule (products PR·3; it replaced seven copies of /^colou?rs?$/ and
// /^sizes?$/). A colour option gets swatches, photos per colour and `color` in structured data; a size option a size
// chart. Names are compared as typed in any form (NFC, trimmed, case-blind). "Print" is a pattern, not a colour: it gets
// none of the colour treatment. Which option is THE colour when there are two (Print and Colour, Shade and Colour) has
// one answer, by precedence (colourIndex): a save keeps the swatches of the option they were made for. Imports nothing:
// the shop's buy box carries it.
// =============================================================================

export type OptionKind = 'size' | 'colour' | 'other'

const norm = (name: string) => name.normalize('NFC').trim().toLowerCase()
const SIZE = new Set(['size', 'sizes', 'साइज़', 'साइज'].map((x) => x.normalize('NFC')))
/** Colour words, best first: an exact "Colour" beats "Shade" beats "रंग" when a product has more than one. */
const COLOUR_RANK = new Map<string, number>([['colour', 0], ['color', 0], ['colours', 0], ['colors', 0], ['shade', 1], ['shades', 1], ['रंग', 2]].map(([k, v]) => [String(k).normalize('NFC'), v as number]))

export function optionKind(name: string): OptionKind {
  const n = norm(name)
  if (SIZE.has(n)) return 'size'
  if (COLOUR_RANK.has(n)) return 'colour'
  return 'other'
}

/** The index of THE colour option among `names` (or -1): the best-ranked colour word, the first of equals. */
export function colourIndex(names: readonly string[]): number {
  let best = -1, rank = Infinity
  names.forEach((name, i) => { const r = COLOUR_RANK.get(norm(name)); if (r !== undefined && r < rank) { rank = r; best = i } })
  return best
}
