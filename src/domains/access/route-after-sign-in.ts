// =============================================================================
// FILE: src/domains/access/route-after-sign-in.ts
//
// WHERE A PERSON LANDS AFTER SIGNING IN. A store handed to them waits first;
// staff with a store choose; staff alone go to Admin; an approved partner goes
// to their workspace; an applicant with no store sees their application; a
// merchant goes to their console; someone with no store creates one (/start).
// One rule, so the callback, the code sign-in and the tests agree.
// =============================================================================

export type SignInDestination = '/admin' | '/console' | '/choose' | '/start' | '/handover' | '/partner' | '/partners/apply'
export type PartnerStatus = 'none' | 'applied' | 'approved' | 'declined'

export function routeAfterSignIn(p: { isStaff: boolean; storeCount: number; handovers?: number; partner?: PartnerStatus }): SignInDestination {
  if ((p.handovers ?? 0) > 0) return '/handover'
  if (p.isStaff && p.storeCount > 0) return '/choose'
  if (p.isStaff) return '/admin'
  if (p.partner === 'approved') return '/partner'
  if (p.storeCount === 0 && (p.partner === 'applied' || p.partner === 'declined')) return '/partners/apply'
  if (p.storeCount === 0) return '/start'
  return '/console'
}

/** A partner row's status, derived from its timestamps (never a column). */
export function partnerStatus(row: { approvedAt: Date | null; declinedAt: Date | null } | null): PartnerStatus {
  if (!row) return 'none'
  if (row.declinedAt) return 'declined'
  if (row.approvedAt) return 'approved'
  return 'applied'
}
