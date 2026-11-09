/**
 * A product barcode (GTIN-8, UPC-A 12, EAN-13, GTIN-14) as Google reads it (search and sharing S2·3): digits only,
 * with a correct check digit. Spaces and hyphens typed between digits are dropped. Null: not a barcode.
 */
export function cleanGtin(text: string): string | null {
  const d = text.replace(/[\s-]/g, '')
  if (!/^(\d{8}|\d{12,14})$/.test(d)) return null
  const digits = [...d].map(Number), check = digits.pop()!
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check ? d : null
}
