import 'server-only'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { supportSessions, tenants } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'
import { expiresAt, type SupportLength, type SupportReason } from '@/domains/support/session'
import { auditStaff } from './audit'

// Support visits (ADR-0007). A staffer has at most one open visit: starting one
// ends any other. Expiry is enforced by app_access_for on every request.

export async function startSupport(
  staff: StaffOk,
  s: { tenantId: string; reason: SupportReason; note: string | null; minutes: SupportLength; now: Date },
): Promise<{ id: string } | { error: string }> {
  return adminDb().transaction(async (tx) => {
    const [t] = await tx.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, s.tenantId)).limit(1)
    if (!t) return { error: 'That store does not exist' }
    await tx.update(supportSessions).set({ endedAt: s.now })
      .where(and(eq(supportSessions.staffUserId, staff.userId), isNull(supportSessions.endedAt)))
    const [row] = await tx.insert(supportSessions).values({
      tenantId: t.id, staffUserId: staff.userId, staffEmail: staff.email, reason: s.reason, note: s.note,
      startedAt: s.now, expiresAt: expiresAt(s.now, s.minutes),
    }).returning({ id: supportSessions.id })
    await auditStaff(tx, staff, { tenantId: t.id, action: 'support.start', target: t.name, supportSessionId: row!.id, detail: { reason: s.reason, minutes: s.minutes } })
    return { id: row!.id }
  })
}

/** Ends the staffer's open visit, if any. */
export async function endSupport(staff: StaffOk, now: Date, why?: { by: 'sign-out' }): Promise<string | null> {
  return adminDb().transaction(async (tx) => {
    const ended = await tx.update(supportSessions).set({ endedAt: now })
      .where(and(eq(supportSessions.staffUserId, staff.userId), isNull(supportSessions.endedAt)))
      .returning({ id: supportSessions.id, tenantId: supportSessions.tenantId })
    for (const e of ended) await auditStaff(tx, staff, { tenantId: e.tenantId, action: 'support.end', supportSessionId: e.id, ...(why ? { detail: why } : {}) })
    return ended[0]?.tenantId ?? null
  })
}

/** The staffer's open, unexpired visit, for the console banner. */
export async function openSupport(staff: StaffOk, now: Date) {
  const [row] = await adminDb().select({ s: supportSessions, name: tenants.name }).from(supportSessions)
    .innerJoin(tenants, eq(tenants.id, supportSessions.tenantId))
    .where(and(eq(supportSessions.staffUserId, staff.userId), isNull(supportSessions.endedAt), sql`${supportSessions.expiresAt} > ${now.toISOString()}::timestamptz`))
    .orderBy(desc(supportSessions.startedAt)).limit(1)
  return row ?? null
}
