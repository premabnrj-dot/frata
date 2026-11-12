// =============================================================================
// FILE: src/domains/partners/team.ts — a partner's people (T1a, docs/plans/2026-11-12-studio-build.md).
// Pure: who may do what in the partner workspace. The definers in drizzle/0121 hold the same rules in SQL and
// refuse first; these decide what a page offers. The partner_members role CHECK is built from PARTNER_ROLES.
// =============================================================================

/** `builder` waits for T1c (ADR-0015): the table allows it, every definer refuses it until then. */
export const PARTNER_ROLES = ['owner', 'lead', 'builder'] as const
export type PartnerRole = (typeof PARTNER_ROLES)[number]

/** Roles an owner may invite today. */
export const INVITABLE_ROLES = ['lead'] as const satisfies readonly PartnerRole[]

export const PARTNER_ROLE_LABEL: Record<PartnerRole, string> = { owner: 'Owner', lead: 'Lead', builder: 'Builder' }

/** What each role may do in the workspace (spec § Roles). The owner works on every client store. */
export const PARTNER_CAN = {
  seeTeam: ['owner'],
  manageTeam: ['owner'],
  createStore: ['owner', 'lead'],
  handOver: ['owner', 'lead'],
  allStores: ['owner'],
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

/** A partner has at most this many people (owner included), active or invited. */
export const MAX_PARTNER_PEOPLE = 50
