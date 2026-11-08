// A shop's people and what they are called (the members table's role CHECK is built from this list).
// `partner`: the developer, designer or agency who built the store (docs/specs/2026-11-07-partner-foundations.md).
export const MEMBER_ROLES = ['owner', 'admin', 'staff', 'partner'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]
/**
 * Everyone in the shop. A partner works the shop like staff, orders included (approved mockup, owner 2026-11-07:
 * "products, orders, settings and the look"). Staff edit products and collections too (owner, 2026-11-08: the
 * catalogue is ANY_MEMBER). The console's guards and the order rules (orders/work.ts) read these.
 */
export const ANY_MEMBER = ['owner', 'admin', 'staff', 'partner'] as const satisfies readonly MemberRole[]
/** Who builds the shop beyond the catalogue: the look, policies, delivery and tax settings, the logo. Not payments, people, the address, the plan or opening it. (Products and collections are ANY_MEMBER: staff edit them, owner 2026-11-08.) */
export const CAN_BUILD = ['owner', 'admin', 'partner'] as const satisfies readonly MemberRole[]
/** Who sends parcels out (Ship § Reviews 8): the shop's own people. Never a partner. */
export const SHIPPERS = ['owner', 'admin', 'staff'] as const satisfies readonly MemberRole[]
/** Owners and admins: payments, people, the shop's address, opening and closing it. Never a partner. */
export const CAN_MANAGE = ['owner', 'admin'] as const satisfies readonly MemberRole[]

/** How a role is said, everywhere (People, the switcher, /choose). */
export const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff', partner: 'Partner' }
/** The members_role CHECK's list, built from MEMBER_ROLES (schema.ts), so the two cannot drift. */
export const sqlList = (xs: readonly string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')
