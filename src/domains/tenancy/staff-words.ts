// =============================================================================
// FILE: src/domains/tenancy/staff-words.ts — WHAT FRRATA STAFF ROLES ARE CALLED (owner, 2026-11-15: "keep master admin
// for frrata admin, this will avoid confusion across apps"). The stored role stays `admin`; every word a person reads
// says Master admin. Support stays Support. Pure.
// =============================================================================

export type StaffRoleKey = 'admin' | 'support'

export const STAFF_ROLE_WORDS: Record<StaffRoleKey, string> = { admin: 'Master admin', support: 'Support' }

/** A master admin (stored role `admin`): the one test Admin's pages and reads use for money and decisions. */
export const isMasterAdmin = (role: string): boolean => role === 'admin'

/** What a staff action answers when its passkey check is older than 5 minutes; a dialog that sees it confirms, then
 *  sends the same form again (Admin's form dialogs, `confirm: true`). */
export const STAFF_CONFIRM_FIRST = 'Confirm with your passkey first.'
