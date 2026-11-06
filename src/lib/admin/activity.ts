import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { auditEvents, tenants } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'

export async function listActivity(staff: StaffOk, limit = 100) {
  void staff
  return adminDb().select({ e: auditEvents, store: tenants.name }).from(auditEvents)
    .leftJoin(tenants, eq(tenants.id, auditEvents.tenantId))
    .orderBy(desc(auditEvents.at)).limit(limit)
}
