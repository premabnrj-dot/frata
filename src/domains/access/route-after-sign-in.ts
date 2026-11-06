// =============================================================================
// FILE: src/domains/access/route-after-sign-in.ts
//
// WHERE A PERSON LANDS AFTER SIGNING IN. Staff with a store choose; staff alone
// go to Admin; a merchant goes to their console; someone with no store yet
// creates one (/start, Phase 1 sign-up). One rule, so the callback, the code
// sign-in and the tests agree.
// =============================================================================

export type SignInDestination = '/admin' | '/console' | '/choose' | '/start'

export function routeAfterSignIn(p: { isStaff: boolean; storeCount: number }): SignInDestination {
  if (p.isStaff && p.storeCount > 0) return '/choose'
  if (p.isStaff) return '/admin'
  if (p.storeCount === 0) return '/start'
  return '/console'
}
