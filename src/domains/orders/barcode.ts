// =============================================================================
// FILE: src/domains/orders/barcode.ts
//
// CODE 128 (code set B) FOR THE PACKING SLIP'S ORDER NUMBER (1D·5): drawn by
// the page as SVG from these modules, never fetched from a barcode service
// (a third party would see every order number; tenancy audit 2026-11-07).
// Pure. The 106 symbol patterns are the standard's (ISO/IEC 15417), as bars
// and spaces of 1 module each ('1' bar, '0' space), checked against an
// independent implementation's table (python-barcode 0.15.1, read as data).
// =============================================================================

const PATTERNS = [
  '11011001100 11001101100 11001100110 10010011000 10010001100 10001001100 10011001000 10011000100',
  '10001100100 11001001000 11001000100 11000100100 10110011100 10011011100 10011001110 10111001100',
  '10011101100 10011100110 11001110010 11001011100 11001001110 11011100100 11001110100 11101101110',
  '11101001100 11100101100 11100100110 11101100100 11100110100 11100110010 11011011000 11011000110',
  '11000110110 10100011000 10001011000 10001000110 10110001000 10001101000 10001100010 11010001000',
  '11000101000 11000100010 10110111000 10110001110 10001101110 10111011000 10111000110 10001110110',
  '11101110110 11010001110 11000101110 11011101000 11011100010 11011101110 11101011000 11101000110',
  '11100010110 11101101000 11101100010 11100011010 11101111010 11001000010 11110001010 10100110000',
  '10100001100 10010110000 10010000110 10000101100 10000100110 10110010000 10110000100 10011010000',
  '10011000010 10000110100 10000110010 11000010010 11001010000 11110111010 11000010100 10001111010',
  '10100111100 10010111100 10010011110 10111100100 10011110100 10011110010 11110100100 11110010100',
  '11110010010 11011011110 11011110110 11110110110 10101111000 10100011110 10001011110 10111101000',
  '10111100010 11110101000 11110100010 10111011110 10111101110 11101011110 11110101110 11010000100',
  '11010010000 11010011100',
].join(' ').split(' ')

/** The stop symbol: 13 modules (its own pattern plus the final 2-module bar). */
const STOP = '1100011101011'
const START_B = 104

/** Characters code set B can carry: printable ASCII, space to tilde. */
export const encodable = (text: string) => /^[\x20-\x7e]{1,40}$/.test(text)

/** The symbol values for `text` in code set B, with its start symbol and checksum (mod 103). */
export function symbols(text: string): number[] {
  if (!encodable(text)) throw new Error('Code 128 B carries printable ASCII only, 1 to 40 characters')
  const values = [...text].map((ch) => ch.charCodeAt(0) - 32)
  const check = (START_B + values.reduce((a, v, i) => a + v * (i + 1), 0)) % 103
  return [START_B, ...values, check]
}

/** The barcode as modules ('1' bar, '0' space), without its quiet zones (the page leaves 10 modules each side). */
export function code128(text: string): string {
  return symbols(text).map((v) => PATTERNS[v]!).join('') + STOP
}

/** Bars as [x, width] in modules, for an SVG of `code128(text).length` modules wide. */
export function bars(modules: string): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue
    let w = 1
    while (modules[i + w] === '1') w++
    out.push([i, w]); i += w - 1
  }
  return out
}

export const PATTERN_COUNT = PATTERNS.length
export const patternFor = (value: number) => PATTERNS[value]
