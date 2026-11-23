// =============================================================================
// FILE: src/domains/partners/team.ts — a partner's people (T1a, docs/plans/2026-11-12-studio-build.md).
// Pure: who may do what in the partner workspace. The definers in drizzle/0124 hold the same rules in SQL and
// refuse first; these decide what a page offers. The partner_members role CHECK is built from PARTNER_ROLES.
// =============================================================================

/** `builder` (T1c, ADR-0015): builds the stores it is given, and never sees their orders, shoppers or costs. */
export const PARTNER_ROLES = ['owner', 'lead', 'builder'] as const
export type PartnerRole = (typeof PARTNER_ROLES)[number]


export const PARTNER_ROLE_LABEL: Record<PartnerRole, string> = { owner: 'Owner', lead: 'Lead', builder: 'Builder' }

/**
 * What each role may do in the workspace (spec § Roles), read by the partner layout, the Team and Your details pages,
 * the team actions and the console's building banner. The definers in drizzle/0124 refuse the same on their own.
 * Hand over is the owner's (T1b). A Builder holds none of these.
 */
export const PARTNER_CAN = {
  manageTeam: ['owner'],
  seeDetails: ['owner'],
  handOver: ['owner'],
  /** "New client store": the owner and Leads (app_partner_create_shop_v2 refuses a Builder). */
  createShop: ['owner', 'lead'],
  /** A store's owner email, open invite, plan and the partner's share: the owner only (T1c, owner question 6). */
  seeClientTerms: ['owner'],
  /** The partner's own bills to its clients and the share in rupees (P2; owner, 2026-11-15, Q3): the owner only. */
  billing: ['owner'],
  /** Studio credits and billing: buying, the seat, invoices, usage, alerts, budgets set (C1; owner call 3, 2026-11-22). */
  credits: ['owner'],
  /** Client budgets read on Credits and billing: the owner every client, a Lead its assigned ones (owner call 3). */
  budgets: ['owner', 'lead'],
} as const satisfies Record<string, readonly PartnerRole[]>

export const partnerCan = (role: PartnerRole, what: keyof typeof PARTNER_CAN): boolean =>
  (PARTNER_CAN[what] as readonly PartnerRole[]).includes(role)

/** A team member's state, from timestamps (never stored). */
export type MemberState = 'invited' | 'expired' | 'active' | 'removed'
export function memberState(m: { acceptedAt: Date | null; removedAt?: Date | null; inviteExpiresAt: Date | null }, now: Date): MemberState {
  if (m.removedAt) return 'removed'
  if (m.acceptedAt) return 'active'
  return m.inviteExpiresAt && m.inviteExpiresAt <= now ? 'expired' : 'invited'
}

/** A partner has at most this many people (owner included), active or invited. app_partner_invite holds the same 50. */
export const MAX_PARTNER_PEOPLE = 50

/** The roles a partner owner may give a person (never `owner`: only Frrata moves the owner). */
export const GIVEN_ROLES = ['lead', 'builder'] as const satisfies readonly PartnerRole[]
export type GivenRole = (typeof GIVEN_ROLES)[number]

/** A role read from the database, by name; anything else is no role at all (security review H2: never "owner"). */
export const partnerRoleOf = (v: unknown): PartnerRole | null => (PARTNER_ROLES as readonly unknown[]).includes(v) ? v as PartnerRole : null
