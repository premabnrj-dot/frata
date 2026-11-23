// =============================================================================
// FILE: src/domains/tenancy/people.ts — who may add whom on Settings › People (docs/specs/2026-11-23-add-partner.md;
// owner 2026-11-23: "yes, manager also", "owner and manager", "redrawn approved"). Pure. The SQL mirror is
// app_people_may_give (drizzle/0174); __tests__/people.test.ts pins the two together.
// =============================================================================

/** The roles an invite can give, in the order the dialog lists them, with the line under each (from CAPABILITIES). */
export const GIVEN_ROLES = ['admin', 'staff', 'accountant'] as const
export type GivenRole = (typeof GIVEN_ROLES)[number]

/** Owner gives Manager, Staff and Accountant (and adds the partner); a Manager gives Staff and Accountant. */
export const ROLES_GIVEN_BY: Record<'owner' | 'admin', readonly GivenRole[]> = {
  owner: ['admin', 'staff', 'accountant'],
  admin: ['staff', 'accountant'],
}

export function mayGive(caller: string, role: string): boolean {
  return caller === 'owner' || caller === 'admin' ? (ROLES_GIVEN_BY[caller] as readonly string[]).includes(role) : false
}

/** Only the owner adds or removes the partner. */
export const mayAddPartner = (caller: string): boolean => caller === 'owner'

/** What each role opens, one line each (the approved mockup's words). */
export const ROLE_LINE: Record<GivenRole | 'partner', string> = {
  admin: 'Everything you can do, payments and costs included.',
  staff: 'Orders, shoppers, products and parcels. No costs or settings.',
  accountant: 'GST and documents only.',
  partner: 'An agency with its own team. Orders, shoppers, products and the look.',
}

export type RequestStamps = { expiresAt: Date; acceptedAt: Date | null; declinedAt: Date | null; cancelledAt: Date | null }
export type RequestState = 'open' | 'accepted' | 'declined' | 'cancelled' | 'expired'

/** A partner request's state, derived from its stamps (no status column). */
export function requestState(r: RequestStamps, now: Date): RequestState {
  if (r.acceptedAt) return 'accepted'
  if (r.declinedAt) return 'declined'
  if (r.cancelledAt) return 'cancelled'
  return r.expiresAt.getTime() > now.getTime() ? 'open' : 'expired'
}
