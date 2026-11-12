import 'server-only'
import { auditEvents } from '@/lib/db/schema'
import type { AdminTx } from '@/lib/db/admin'
import type { StaffIdentity, StaffOk } from '@/lib/auth/require-staff'

/** Every staff action in Admin is recorded, in the same transaction as the change. */
export async function auditStaff(
  tx: AdminTx,
  // A StaffIdentity only for ending visits at sign-out (no passkey check needed to stop access).
  staff: StaffOk | StaffIdentity,
  e: { tenantId?: string | null; action: string; target?: string; detail?: object; supportSessionId?: string },
) {
  await tx.insert(auditEvents).values({
    tenantId: e.tenantId ?? null,
    actorUserId: staff.userId,
    actorEmail: staff.email,
    actorKind: 'staff',
    supportSessionId: e.supportSessionId ?? null,
    action: e.action,
    target: e.target ?? null,
    detail: e.detail ?? null,
  })
}
