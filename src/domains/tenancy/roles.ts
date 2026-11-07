// A shop's people and what they are called (the members table's role CHECK is built from this list).
export const MEMBER_ROLES = ['owner', 'admin', 'staff'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]
/** Everyone in the shop; owners and admins. The console's guards and the order rules (orders/work.ts) read these. */
export const ANY_MEMBER = ['owner', 'admin', 'staff'] as const satisfies readonly MemberRole[]
export const CAN_MANAGE = ['owner', 'admin'] as const satisfies readonly MemberRole[]
