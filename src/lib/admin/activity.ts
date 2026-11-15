import 'server-only'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { auditEvents, platformStaff, tenants } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'
import { isMasterAdmin } from '@/domains/tenancy/staff-words'
import { ACTIVITY_KINDS, MASTER_ONLY_WORDS, type ActivityKind } from '@/domains/admin/activity-words'

// =============================================================================
// FILE: src/lib/admin/activity.ts — ADMIN › ACTIVITY (Neel N4; security and speed reviews on the plan). Newest first,
// 50 a page, keyset on (at, id) with the row comparison (it reads audit_events_at_id backward); filters by store,
// person and kind (the action's first word, audit_events_kind_at). Named fields only, never `detail`; money rows to a
// master admin only, filtered here on the server.
// =============================================================================

export const ACTIVITY_PAGE = 50
export type ActivityRow = { id: string; at: Date; actorEmail: string | null; actorUserId: string; actorKind: string; action: string; tenantId: string | null; store: string | null }
export type ActivityFilter = { tenant?: string; actor?: string; kind?: ActivityKind; before?: { at: Date; id: string } }

export async function listActivity(staff: StaffOk, f: ActivityFilter = {}): Promise<{ rows: ActivityRow[]; next: { at: Date; id: string } | null }> {
  // The stored first word (audit_events.action_word): one ordered read on (action_word, at, id) per word of a kind, merged
  // here; an expression on `action` would walk the whole log under frata_admin's row policy (speed review on the diff).
  const base = and(
    f.tenant ? eq(auditEvents.tenantId, f.tenant) : undefined,
    f.actor ? eq(auditEvents.actorUserId, f.actor) : undefined,
    isMasterAdmin(staff.role) ? undefined : notInArray(auditEvents.actionWord, [...MASTER_ONLY_WORDS]),
    f.before ? sql`(${auditEvents.at}, ${auditEvents.id}) < (${f.before.at.toISOString()}::timestamptz, ${f.before.id}::uuid)` : undefined,
  )
  const read = (word?: string) => adminDb().select({
    id: auditEvents.id, at: auditEvents.at, actorEmail: auditEvents.actorEmail, actorUserId: auditEvents.actorUserId, actorKind: auditEvents.actorKind,
    action: auditEvents.action, tenantId: auditEvents.tenantId, store: tenants.name,
  }).from(auditEvents).leftJoin(tenants, eq(tenants.id, auditEvents.tenantId)).where(and(base, word ? eq(auditEvents.actionWord, word) : undefined))
    .orderBy(sql`${auditEvents.at} desc, ${auditEvents.id} desc`).limit(ACTIVITY_PAGE + 1)
  const lists = await Promise.all(f.kind ? ACTIVITY_KINDS[f.kind].words.map((w) => read(w)) : [read()])
  const rows = lists.flat().sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, ACTIVITY_PAGE + 1)
  const more = rows.length > ACTIVITY_PAGE
  const page = rows.slice(0, ACTIVITY_PAGE)
  const last = page.at(-1)
  return { rows: page, next: more && last ? { at: last.at, id: last.id } : null }
}

/** The people Activity can filter by: Frrata's staff, by email. */
export async function activityPeople(staff: StaffOk): Promise<{ userId: string; email: string }[]> {
  void staff
  return adminDb().select({ userId: platformStaff.userId, email: platformStaff.email }).from(platformStaff).orderBy(platformStaff.email)
}
