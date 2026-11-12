// =============================================================================
// FILE: src/domains/catalogue/indic.ts
//
// INDIAN SCRIPTS → LATIN LETTERS, for a product's address (handleFor): "लिनन कुर्ता" → "linan kurta", never dropped
// to "product-2" (plan 2026-11-12-product-import PI·0 · 3). Readable, not scholarly: no diacritics, ā is "a".
//
// The nine Brahmic blocks Unicode lays out alike (from ISCII) share ONE table by offset within the block:
// Devanagari, Bengali/Assamese, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam; the few letters a block
// puts elsewhere are its overrides. A consonant carries "a" unless a vowel sign or a virama follows; at the end of a
// word the northern scripts drop it ("kurta", not "kurataa"), the southern ones and Odia keep it ("putavai").
// Text is read composed (NFC): a two-part vowel sign (ো, ொ, ൊ) is one letter, o, never e + a; the nukta letters
// (क़, ড়) still come apart under NFC (Unicode never composes them), so the nukta rule sees them.
// Other text passes through unchanged. Pure, small: the editor runs it in the browser.
// =============================================================================

type Kind = 'consonant' | 'final' | 'sign' | 'virama' | 'nukta' | 'other' | 'break'
type Entry = [Kind, string]

const BASE = new Map<number, Entry>()
const put = (from: number, kind: Kind, latin: string) => latin.split(' ').forEach((l, i) => BASE.set(from + i, [kind, l === '_' ? '' : l]))
put(0x01, 'other', 'n n h')
put(0x04, 'other', 'a a a i i u u ri li e e e ai o o o au')
put(0x15, 'consonant', 'k kh g gh n ch chh j jh n t th d dh n t th d dh n n p ph b bh m y r r l l zh v sh sh s h')
put(0x3a, 'sign', 'o u')
put(0x3c, 'nukta', '_')
put(0x3d, 'other', '_')
put(0x3e, 'sign', 'a i i u u ri ri e e e ai o o o au')
put(0x4d, 'virama', '_')
put(0x4e, 'sign', 'e o')
put(0x50, 'other', 'om _ _ _ _')
put(0x55, 'sign', '_ _ _')
put(0x58, 'consonant', 'q kh g z r rh f y')
put(0x60, 'other', 'ri li')
put(0x62, 'sign', 'li li')
put(0x64, 'break', '_ _')
put(0x66, 'other', '0 1 2 3 4 5 6 7 8 9')

/** Where each block starts, whether it drops a word's last "a", and the letters it places differently. */
const BLOCKS: { start: number; dropsFinalA: boolean; own?: Record<number, Entry> }[] = [
  { start: 0x0900, dropsFinalA: true, own: { 0x72: ['other', 'a'] } },
  { start: 0x0980, dropsFinalA: true, own: { 0x4e: ['final', 't'], 0x70: ['consonant', 'r'], 0x71: ['consonant', 'w'] } },
  { start: 0x0a00, dropsFinalA: true, own: { 0x70: ['other', 'n'], 0x71: ['other', ''], 0x72: ['other', ''], 0x73: ['other', ''] } },
  { start: 0x0a80, dropsFinalA: true },
  { start: 0x0b00, dropsFinalA: false, own: { 0x71: ['consonant', 'w'] } },
  { start: 0x0b80, dropsFinalA: false },
  { start: 0x0c00, dropsFinalA: false, own: { 0x58: ['consonant', 'ts'], 0x59: ['consonant', 'dz'], 0x5a: ['consonant', 'r'] } },
  { start: 0x0c80, dropsFinalA: false, own: { 0x5e: ['consonant', 'l'] } },
  { start: 0x0d00, dropsFinalA: false, own: {
    0x54: ['final', 'm'], 0x55: ['final', 'y'], 0x56: ['final', 'l'],
    0x7a: ['final', 'n'], 0x7b: ['final', 'n'], 0x7c: ['final', 'r'], 0x7d: ['final', 'l'], 0x7e: ['final', 'l'], 0x7f: ['final', 'k'],
  } },
]

/** A consonant with a nukta under it: the sound it stands for (क़ q, ज़ z, फ़ f, ड़ r). */
const NUKTA: Record<string, string> = { k: 'q', kh: 'kh', g: 'g', j: 'z', ph: 'f', d: 'r', dh: 'rh', y: 'y' }

function entryOf(ch: string): { entry: Entry; dropsFinalA: boolean } | null {
  const cp = ch.codePointAt(0)!
  if (cp < 0x0900 || cp > 0x0d7f) return null
  const block = BLOCKS[(cp - 0x0900) >> 7]!
  const entry = block.own?.[cp & 0x7f] ?? BASE.get(cp & 0x7f)
  return entry ? { entry, dropsFinalA: block.dropsFinalA } : { entry: ['other', ''], dropsFinalA: block.dropsFinalA }
}

/** Latin letters for every Indian-script run in `text` (decomposed or not); everything else as it was. */
export function latinOf(text: string): string {
  let out = ''
  let pending = null as { latin: string; dropsFinalA: boolean } | null
  const flush = (wordEnds: boolean) => {
    if (pending) out += pending.latin + (wordEnds && pending.dropsFinalA ? '' : 'a')
    pending = null
  }
  for (const ch of text.normalize('NFC')) {
    const e = entryOf(ch)
    if (!e) { flush(true); out += ch; continue }
    const [kind, latin] = e.entry
    if (kind === 'consonant') { flush(false); pending = { latin, dropsFinalA: e.dropsFinalA } }
    else if (kind === 'sign') { out += (pending?.latin ?? '') + latin; pending = null }
    else if (kind === 'virama') { out += pending?.latin ?? ''; pending = null }
    else if (kind === 'nukta') { if (pending) pending = { ...pending, latin: NUKTA[pending.latin] ?? pending.latin } }
    else if (kind === 'final') { flush(false); out += latin }
    else if (kind === 'break') { flush(true); out += ' ' }
    else { flush(false); out += latin }
  }
  flush(true)
  return out
}
