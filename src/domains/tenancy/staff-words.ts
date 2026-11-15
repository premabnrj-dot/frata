// =============================================================================
// FILE: src/domains/tenancy/staff-words.ts — WHAT FRRATA STAFF ROLES ARE CALLED (owner, 2026-11-15: "keep master admin
// for frrata admin, this will avoid confusion across apps"). The stored role stays `admin`; every word a person reads
// says Master admin. Support stays Support. Pure.
// =============================================================================

export type StaffRoleKey = 'admin' | 'support'

export const STAFF_ROLE_WORDS: Record<StaffRoleKey, string> = { admin: 'Master admin', support: 'Support' }
