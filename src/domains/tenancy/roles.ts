// A shop's people and what they are called (the members table's role CHECK is built from this list).
// `partner`: the developer, designer or agency who built the store (docs/specs/2026-11-07-partner-foundations.md).
// `accountant`: the shop's CA or bookkeeper, invited by the owner or an admin; GST and documents only (GST plan phase 3).
export const MEMBER_ROLES = ['owner', 'admin', 'staff', 'partner', 'accountant'] as const
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
/** Who may open the console at all: everyone in the shop, and the accountant (who sees GST only: CAN_SEE_GST). */
export const CONSOLE_ROLES = ['owner', 'admin', 'staff', 'partner', 'accountant'] as const satisfies readonly MemberRole[]
/** GST (plan 2026-11-09-gst-core-and-categories § 3): the month, Review, Fix and the CA's exports; pushing to the GST
 *  portal (G2). Never staff or a partner. Filing always needs the taxpayer's own OTP or DSC. A support visit acts as the
 *  owner but is refused by the actions themselves (tenancy audit 2026-11-09). */
export const CAN_SEE_GST = ['owner', 'admin', 'accountant'] as const satisfies readonly MemberRole[]
/** Who may invite or remove the accountant. */
export const CAN_INVITE_ACCOUNTANT = ['owner', 'admin'] as const satisfies readonly MemberRole[]
/** Owners and admins: payments, people, the shop's address, opening and closing it. Never a partner. */
export const CAN_MANAGE = ['owner', 'admin'] as const satisfies readonly MemberRole[]

/** Who may set the shop's shipping costs: owners and admins, and a partner while the shop has no owner (owner,
 * 2026-11-08: "Partners can set them" before handover); `seesCosts` decides the partner case inside the transaction. */
export const CAN_SET_COSTS = ['owner', 'admin', 'partner'] as const satisfies readonly MemberRole[]

/**
 * Who sees a merchant's costs and profit (₹ kept, shipping costs): owners and admins always (a support visit acts as
 * the owner, audited); a partner only while the shop has no owner (owner, 2026-11-08: "Once handed over, no"); staff
 * never. The one rule for Offers, Settings › Shipping costs and Analytics; `costsVisibleIn` feeds it, failing closed.
 */
export function seesCosts(role: MemberRole, hasOwner: boolean): boolean {
  if (role === 'accountant') return false // GST and documents only: never costs or profit (tenancy audit 2026-11-09)
  if (role === 'owner' || role === 'admin') return true
  if (role === 'partner') return !hasOwner
  return false
}

/** How a role is said, everywhere (People, the switcher, /choose). */
export const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff', partner: 'Partner', accountant: 'Accountant' }
/** The members_role CHECK's list, built from MEMBER_ROLES (schema.ts), so the two cannot drift. */
export const sqlList = (xs: readonly string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')
