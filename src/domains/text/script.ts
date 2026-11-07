// =============================================================================
// FILE: src/domains/text/script.ts
//
// WHICH SCRIPT A NAME IS WRITTEN IN, so the console can give Indic names the
// line height they need (1.8; frata-design-language § UX foundation rule 21).
// CSS cannot see the script of content (`:lang` reads an attribute, not the
// text), so <Name> asks this and sets data-script. Pure: no I/O.
// =============================================================================

export type Script = 'latin' | 'devanagari' | 'bengali' | 'gurmukhi' | 'gujarati' | 'tamil' | 'telugu' | 'kannada' | 'malayalam' | 'odia' | 'other'

/** Unicode blocks of the Indic scripts a shop's customers write their names in. */
const BLOCKS: [Script, number, number][] = [
  ['devanagari', 0x0900, 0x097f], ['bengali', 0x0980, 0x09ff], ['gurmukhi', 0x0a00, 0x0a7f], ['gujarati', 0x0a80, 0x0aff],
  ['odia', 0x0b00, 0x0b7f], ['tamil', 0x0b80, 0x0bff], ['telugu', 0x0c00, 0x0c7f], ['kannada', 0x0c80, 0x0cff], ['malayalam', 0x0d00, 0x0d7f],
]

/** The first non-Latin script in the text, 'latin' when it has none, 'other' for scripts outside the list. */
export function scriptOf(text: string): Script {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x0250) continue // ASCII, Latin-1, Latin Extended A/B
    if (cp >= 0x0300 && cp <= 0x036f) continue // combining accents (a decomposed é)
    if (cp >= 0x1e00 && cp <= 0x1eff) continue // Latin Extended Additional (Vietnamese)
    if (cp >= 0x2000 && cp <= 0x214f) continue // punctuation, currency (₹), letterlike symbols (™)
    const hit = BLOCKS.find(([, lo, hi]) => cp >= lo && cp <= hi)
    return hit ? hit[0] : 'other'
  }
  return 'latin'
}
