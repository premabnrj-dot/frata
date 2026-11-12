import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { platformStaff, supportSessions, type StaffRole } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'
import { auditStaff } from './audit'

/** Adds someone who has signed in to Frrata at least once with a confirmed email. */
export async function addStaff(staff: StaffOk, email: string, role: StaffRole): Promise<{ ok: true } | { error: string }> {
  const rows = await adminDb().execute<{ id: string | null }>(sql`select app_find_confirmed_user(${email}) as id`)
  const userId = rows[0]?.id
  if (!userId) return { error: 'No one with that email has signed in to Frrata yet. Ask them to sign in once, then add them.' }
  return adminDb().transaction(async (tx) => {
    const added = await tx.insert(platformStaff).values({ userId, email: email.toLowerCase(), role, createdBy: staff.userId })
      .onConflictDoNothing().returning({ userId: platformStaff.userId })
    if (added.length === 0) return { error: 'They are already staff' }
    await auditStaff(tx, staff, { action: 'staff.add', target: email.toLowerCase(), detail: { role } })
    // The security emails to the person and every admin, in this transaction (staff passkeys spec § Design 5).
    await tx.execute(sql`select app_staff_changed(${staff.userId}::uuid, 'staff_added', ${email.toLowerCase()})`)
    return { ok: true as const }
  })
}

/** Removes a staffer and ends their open visits in the same transaction. */
export async function removeStaff(staff: StaffOk, userId: string, now: Date): Promise<{ ok: true } | { error: string }> {
  if (userId === staff.userId) return { error: 'You cannot remove yourself' }
  return adminDb().transaction(async (tx) => {
    const gone = await tx.delete(platformStaff).where(eq(platformStaff.userId, userId)).returning({ email: platformStaff.email })
    if (gone.length === 0) return { error: 'Not staff' }
    await tx.update(supportSessions).set({ endedAt: now }).where(and(eq(supportSessions.staffUserId, userId), isNull(supportSessions.endedAt)))
    await auditStaff(tx, staff, { action: 'staff.remove', target: gone[0]!.email })
    await tx.execute(sql`select app_staff_changed(${staff.userId}::uuid, 'staff_removed', ${gone[0]!.email})`)
    return { ok: true as const }
  })
}
