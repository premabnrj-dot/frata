import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { auditEvents, supportSessions } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'

/** A store's support visits and what was done in them — what the merchant sees. */
export async function storeActivity(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const visits = await tx.select().from(supportSessions).where(eq(supportSessions.tenantId, tenantId))
      .orderBy(desc(supportSessions.startedAt)).limit(50)
    const events = await tx.select().from(auditEvents).where(eq(auditEvents.tenantId, tenantId))
      .orderBy(desc(auditEvents.at)).limit(200)
    return { visits, events }
  })
}
