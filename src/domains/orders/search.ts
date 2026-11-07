// =============================================================================
// FILE: src/domains/orders/search.ts
//
// What a search for orders means (the queue's one search box, 1D·4b): an order
// number (with or without its letters — "KS-1012", "ks 1012", "1012"), a name,
// or a phone (4+ digits typed as digits only). Pure, so its edge cases are
// tested; src/lib/queries/orders.ts turns it into SQL.
// =============================================================================

export const MAX_SEARCH = 60

export type OrderSearch = { like: string; number: number | null; phoneDigits: string | null }

/** LIKE wildcards and the escape character in what was typed match as text (Postgres's default escape is \). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export function parseOrderSearch(raw: string): OrderSearch | null {
  const q = raw.trim().slice(0, MAX_SEARCH)
  if (!q) return null
  const digits = q.replace(/\D/g, '')
  const numberLike = /^[A-Za-z]{0,6}[-\s]?\d{1,9}$/.test(q)
  return {
    like: `%${escapeLike(q)}%`,
    number: numberLike ? Number(digits) : null,
    // "KS-1004" is an order number, not part of a phone: phones match only on digits typed alone (review 2026-11-07).
    phoneDigits: /^[\d\s+-]+$/.test(q) && digits.length >= 4 ? digits : null,
  }
}
