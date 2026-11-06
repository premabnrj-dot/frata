import 'server-only'
import { and, eq } from 'drizzle-orm'
import { supportSessions } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'

/** The support visit the console is in, for its banner. Read as frata_app, in the tenant. */
export async function supportVisit(tenantId: string, sessionId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(supportSessions)
      .where(and(eq(supportSessions.id, sessionId), eq(supportSessions.tenantId, tenantId))).limit(1)
    return row ?? null
  })
}
