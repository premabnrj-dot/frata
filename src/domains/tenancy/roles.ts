// A shop's people and what they are called (the members table's role CHECK is built from this list).
// `partner`: the developer, designer or agency who built the store (docs/specs/2026-11-07-partner-foundations.md).
// `accountant`: the shop's CA or bookkeeper, invited by the owner or an admin; GST and documents only (GST plan phase 3).
export const MEMBER_ROLES = ['owner', 'admin', 'staff', 'partner', 'accountant'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]
/**
 * A partner's Builder (ADR-0015, T1c): builds a store's website and never sees its orders, shoppers or costs. A SHOP
 * role (a `members` row) but deliberately NOT a MemberRole: `requireMember` carries only MemberRoles, so no tuple, no
 * page and no action written for them can ever receive a Builder. A Builder reaches the console only through
 * `requireCapability` (src/lib/auth/require-capability.ts) and the database only as `frata_builder`.
 */
export const BUILDER_ROLE = 'builder' as const
/** What a console page says to a Builder it does not open (owner 2026-11-15, T1c question 3: the page's own panel). */
export const BUILDER_REFUSED = 'Builders can’t see this page'

/** Every value `members.role` may hold: the members_role CHECK is built from this list (schema.ts). */
export const SHOP_ROLES = [...MEMBER_ROLES, BUILDER_ROLE] as const
export type ShopRole = (typeof SHOP_ROLES)[number]

/**
 * CAPABILITIES — the one table of who may do what inside a shop (ADR-0015 § 2). Default deny: a role reaches a
 * capability only by being listed. The tuples below are VIEWS of it, so they cannot drift.
 * Change control (ADR-0015 § 6): `__tests__/capabilities.test.ts` snapshots this table. A line that adds a role to a
 * capability reaching orders, shoppers or costs (`shop.work`, `console.full`, `costs.set`, `parcels.send`, `gst.read`)
 * carries the owner's name and date beside it and needs the tenancy-auditor on its diff.
 */
export const CAPABILITIES = {
  /** Open the console at all (its shell). A Builder's shell holds only what its capabilities open. */
  'console.open': ['owner', 'admin', 'staff', 'partner', 'accountant', 'builder'],
  /** Every console page but a Builder's: notices, settings › emails, the app pages (was CONSOLE_ROLES). */
  'console.full': ['owner', 'admin', 'staff', 'partner', 'accountant'],
  /** Orders, customers, products and collections to edit (was ANY_MEMBER; staff edit the catalogue, owner 2026-11-08). */
  'shop.work': ['owner', 'admin', 'staff', 'partner'],
  /** The catalogue to read: products and collections, never a cost column (owner 2026-11-15, T1c question 1). */
  'catalogue.read': ['owner', 'admin', 'staff', 'partner', 'builder'],
  /** The console's store preview: what shoppers would see, drafts included (owner 2026-11-15, T1c question 5). */
  'preview.read': ['owner', 'admin', 'staff', 'partner', 'builder'],
  /** The look, policies, delivery and tax settings, the logo (was CAN_BUILD). */
  'shop.build': ['owner', 'admin', 'partner'],
  /** Payments, people, the address, opening the store, publishing the look (was CAN_MANAGE). */
  'shop.manage': ['owner', 'admin'],
  /** Sending parcels (was SHIPPERS). */
  'parcels.send': ['owner', 'admin', 'staff'],
  /** GST (was CAN_SEE_GST). */
  'gst.read': ['owner', 'admin', 'accountant'],
  /** Inviting or removing the accountant (was CAN_INVITE_ACCOUNTANT). */
  'accountant.invite': ['owner', 'admin'],
  /** Setting shipping costs (was CAN_SET_COSTS); `seesCosts` decides the partner case. */
  'costs.set': ['owner', 'admin', 'partner'],
  /** Storefront API keys (lane A, ADR-0018): a partner only while the store has never had an owner, a rule beside this
   *  list as `seesCosts` is (orchestrator 2026-11-15). */
  'api.manage': ['owner', 'admin', 'partner'],
  /** Console › Content (lane B): a partner after handover only with the owner's content scope, lane B's own rule. */
  'content.write': ['owner', 'admin', 'partner'],
} as const satisfies Record<string, readonly ShopRole[]>
export type Capability = keyof typeof CAPABILITIES

/** Whether a role holds a capability (the one test; requireCapability and the console's nav read it). */
export const holds = (role: string, cap: Capability): boolean => (CAPABILITIES[cap] as readonly string[]).includes(role)

/**
 * Everyone in the shop but the accountant: orders and the catalogue. A partner works the shop like staff, orders
 * included (approved mockup, owner 2026-11-07). The console's guards and the order rules (orders/work.ts) read these.
 */
export const ANY_MEMBER = CAPABILITIES['shop.work']
/** Who builds the shop beyond the catalogue: the look, policies, delivery and tax settings, the logo. Not payments, people, the address, the plan or opening it. (Products and collections are ANY_MEMBER: staff edit them, owner 2026-11-08.) */
export const CAN_BUILD = CAPABILITIES['shop.build']
/** Who sends parcels out (Ship § Reviews 8): the shop's own people. Never a partner. */
export const SHIPPERS = CAPABILITIES['parcels.send']
/** Every console page but a Builder's: everyone in the shop, and the accountant (who sees GST only: CAN_SEE_GST). */
export const CONSOLE_ROLES = CAPABILITIES['console.full']
/** GST (plan 2026-11-09-gst-core-and-categories § 3): the month, Review, Fix and the CA's exports; pushing to the GST
 *  portal (G2). Never staff or a partner. Filing always needs the taxpayer's own OTP or DSC. A support visit acts as the
 *  owner but is refused by the actions themselves (tenancy audit 2026-11-09). */
export const CAN_SEE_GST = CAPABILITIES['gst.read']
/** Who may invite or remove the accountant. */
export const CAN_INVITE_ACCOUNTANT = CAPABILITIES['accountant.invite']
/** Owners and admins: payments, people, the shop's address, opening and closing it, and publishing (or undoing) the
 *  look and its pages (Theme Studio TS1a). Never a partner. */
export const CAN_MANAGE = CAPABILITIES['shop.manage']

/** Who may set the shop's shipping costs: owners and admins, and a partner while the shop has no owner (owner,
 * 2026-11-08: "Partners can set them" before handover); `seesCosts` decides the partner case inside the transaction. */
export const CAN_SET_COSTS = CAPABILITIES['costs.set']

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
export const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', admin: 'Manager', staff: 'Staff', partner: 'Partner', accountant: 'Accountant' }
/** A Builder's label beside the others (People, the switcher). */
export const BUILDER_LABEL = 'Builder'
/** The members_role CHECK's list, built from SHOP_ROLES (schema.ts), so the two cannot drift. */
export const sqlList = (xs: readonly string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')

/** An owner or admin acting in person — never a Frrata support visit: who sees the shop's bill on Apps and who may turn
 *  an app off (Apps A2). The one rule; featuredBillWith, mayTurnOff and setModuleAction read it. */
export function managesInPerson(m: { role: string; supportSessionId: string | null }): boolean {
  return (CAN_MANAGE as readonly string[]).includes(m.role) && !m.supportSessionId
}
