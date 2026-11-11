// =============================================================================
// FILE: src/domains/analytics/beacon-rules.ts — the visit beacon's rules shared by both ends: the beacon itself
// (src/beacon/fe.ts, which carries no Zod) and the ingest's schema (event.ts). One copy, so the two never disagree on
// what a host or a code may be (impact review 2026-11-11). Pure.
// =============================================================================

export const MAX_EVENTS = 50
export const MAX_TAG = 100
/** The referring site: a bare hostname. */
export const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
/** A creator's `?code=` (the bag store accepts the same shape). */
export const CODE_RE = /^[A-Za-z0-9]{1,20}$/
/** At most n code points: never half an emoji (a lone surrogate would fail the whole batch in Postgres). */
export const cutCodePoints = (v: string, n: number) => Array.from(v).slice(0, n).join('')
