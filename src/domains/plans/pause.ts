// =============================================================================
// FILE: src/domains/plans/pause.ts — IS A STORE PAUSED NOW (trials TR1·9: no autopay after the trial, no new orders).
// The window is worked out on the server (src/lib/queries/trial-pause.ts); whether `now` is inside it is this one rule,
// read by the shop's frame and the Storefront API. Pure.
// =============================================================================

export const pausedAt = (p: { from: Date | string; to: Date | string | null } | null, now: Date) =>
  !!p && now >= new Date(p.from) && (!p.to || now < new Date(p.to))
