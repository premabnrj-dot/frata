import { parseRupees } from '@/domains/money/rupees'

// =============================================================================
// FILE: src/domains/catalogue/common-price.ts — THE PRICE MOST SIZES SHARE (Neel N2, plan § SSOT).
// A product has no price of its own; its variants do. The editor's "Price, ₹" (and "M.R.P., ₹") shows the price most of
// the live variants share and sets it on those sharing it and those with none — never on a variant priced on its own
// (the drawn XXL at ₹2,890). Which variants it writes to is fixed at the first keystroke (until the field loses focus) (`targetsOf`), so clearing the
// field, or typing through a value equal to an own price, never takes that variant. Prices are compared in paise.
// =============================================================================

/** No price yet: empty, unreadable, or 0. One test, read by the editor's "Empty only" too. */
export const unpriced = (text: string | undefined): boolean => {
  const p = parseRupees(text ?? '')
  return p === null || p === 0
}

/** The price (paise) most of these share; a tie takes the lowest; null when none is priced. */
export function commonPrice(texts: readonly string[]): number | null {
  const n = new Map<number, number>()
  for (const t of texts) {
    if (unpriced(t)) continue
    const p = parseRupees(t)!
    n.set(p, (n.get(p) ?? 0) + 1)
  }
  let best: number | null = null, most = 0
  for (const [p, c] of n) if (c > most || (c === most && best !== null && p < best)) { best = p; most = c }
  return best
}

/** The variants the common field writes to: those priced at the common price, and those with no price. */
export function targetsOf(rows: readonly { key: string; text: string }[]): string[] {
  const common = commonPrice(rows.map((r) => r.text))
  return rows.filter((r) => unpriced(r.text) || parseRupees(r.text) === common).map((r) => r.key)
}

/** "Sets 5 of 6 · XXL has its own price" — said under the field when some variant differs; null when all follow it. */
export function targetsWords(rows: readonly { key: string; label: string; text: string }[]): string | null {
  const t = new Set(targetsOf(rows))
  const own = rows.filter((r) => !t.has(r.key))
  if (!own.length) return null
  const names = own.length === 1 ? `${own[0]!.label} has its own price` : `${own.length} have their own price`
  return `Sets ${t.size} of ${rows.length} · ${names}`
}
