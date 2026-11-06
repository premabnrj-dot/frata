// =============================================================================
// FILE: src/domains/access/route-after-sign-in.ts
//
// WHERE A PERSON LANDS AFTER SIGNING IN. Staff with a store choose; staff alone
// go to Admin; a merchant goes to their console; anyone else to the console's
// "no store" panel. One rule, so the callback and the tests agree.
// =============================================================================

export function routeAfterSignIn(p: { isStaff: boolean; storeCount: number }): '/admin' | '/console' | '/choose' {
  if (p.isStaff && p.storeCount > 0) return '/choose'
  if (p.isStaff) return '/admin'
  return '/console'
}
