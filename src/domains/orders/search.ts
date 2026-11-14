// =============================================================================
// FILE: src/domains/orders/search.ts
//
// What a search for orders means (the queue's one search box, 1D·4b): an order
// number (with or without its letters — "KS-1012", "ks 1012", "1012"), a name,
// or a phone (4+ digits typed as digits only). Pure, so its edge cases are
// tested; src/lib/queries/orders.ts turns it into SQL.
// =============================================================================

import { cleanMobile } from '@/domains/checkout/mobile'

export const MAX_SEARCH = 60

/** Which tests a search runs (N1c, speed review): a fast test is never ORed with the name's scan. `like` is null unless
 * what was typed is text; `awb` is an exact tracking number (couriers print digits or letters and digits, 8–40). */
export type OrderSearch = { like: string | null; number: number | null; phoneDigits: string | null; awb: string | null }

/** LIKE wildcards and the escape character in what was typed match as text (Postgres's default escape is \). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Phones are stored as 10 digits (cleanMobile): "+91 98765 43210" or "098765 43210" pasted from WhatsApp must match
 * them, so a country code or a trunk 0 in front of a full number is dropped, as cleanMobile does (shop stress test
 * 2026-11-11: those searches found nothing). A part of a number is searched as typed. */
const storedDigits = (d: string) => cleanMobile(d) ?? d

export function parseOrderSearch(raw: string): OrderSearch | null {
  const q = raw.trim().slice(0, MAX_SEARCH)
  if (!q) return null
  const digits = q.replace(/\D/g, '')
  const numberLike = /^[A-Za-z]{0,6}[-\s]?\d{1,9}$/.test(q)
  const digitsOnly = /^[\d\s+()-]+$/.test(q)
  const awbLike = /^[A-Za-z0-9-]{8,40}$/.test(q) && /\d/.test(q)
  return {
    // A name is searched only when what was typed is not a number, a phone or a tracking number.
    like: digitsOnly || numberLike || awbLike ? null : `%${escapeLike(q)}%`,
    number: numberLike ? Number(digits) : null,
    // "KS-1004" is an order number, not part of a phone: phones match only on digits typed alone (review 2026-11-07).
    phoneDigits: digitsOnly && digits.length >= 4 ? storedDigits(digits) : null,
    awb: awbLike ? q : null, // exact, as the courier printed it: `=` stays on its index under RLS
  }
}
