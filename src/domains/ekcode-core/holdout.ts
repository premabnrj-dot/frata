// =============================================================================
// FILE: src/domains/ekcode-core/holdout.ts — WHO DOESN'T SEE EKCODE, so "with vs without" compares like with like (spec
// § Goal; unit-economics review: pooled across shops). The id is a random first-party id the checkout keeps in the
// shopper's own browser — never a fingerprint (ADR-0009 point 6). Pure.
// =============================================================================

export type Arm = 'shown' | 'held'

/** One visitor in ten is held out. */
export const HOLDOUT_EVERY = 10

/** FNV-1a, 32-bit: the same id always lands in the same arm. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** A visitor id is 22 URL-safe characters (16 random bytes); anything else is not one and sees EkCode. */
export const VISITOR_ID = /^[A-Za-z0-9_-]{22}$/

export function armFor(visitorId: string | null | undefined, compare = true): Arm {
  if (!compare || !visitorId || !VISITOR_ID.test(visitorId)) return 'shown'
  return fnv1a(`ekcode-holdout-v1:${visitorId}`) % HOLDOUT_EVERY === 0 ? 'held' : 'shown'
}
