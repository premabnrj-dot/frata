// =============================================================================
// FILE: src/domains/brand/compare.ts — WHAT BRAND'S PREVIEW DRAWS WHILE A PARTNER'S CHANGE WAITS (four-screens mockup
// § 4, owner call 8: a Live | Waiting switch on Brand's and Brand › Checkout's preview). Pure.
// =============================================================================

export type Version = 'live' | 'waiting'

/** The form's draft while it has unsaved edits (the switch is hidden then), else the live version or the waiting one,
 *  as the switch says. Without a waiting change, the draft. */
export function previewed<T>(o: { live: T; draft: T; waiting: T | null; dirty: boolean; compare: Version }): T {
  if (!o.waiting || o.dirty) return o.draft
  return o.compare === 'live' ? o.live : o.waiting
}
