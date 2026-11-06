import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import type { MemberRole } from './schema'

// =============================================================================
// FILE: src/lib/db/platform.ts
//
// THE TWO QUESTIONS ASKED BEFORE A TENANT IS KNOWN, and nothing else:
//   - which tenant does this storefront host belong to?
//   - which tenants may this signed-in user open?
// Each is a SECURITY DEFINER function in drizzle/0001_tenant_isolation.sql that
// returns only that answer, so `frata_app` never needs to read tenant tables
// across tenants. Listed in scripts/check-tenant.mjs as platform scope.
// =============================================================================

export async function tenantForHost(host: string): Promise<{ id: string; name: string } | null> {
  const rows = await db().execute<{ id: string; name: string }>(
    sql`select id, name from app_tenant_for_host(${host})`,
  )
  return rows[0] ?? null
}

export type Membership = { tenantId: string; tenantName: string; role: MemberRole }

export async function membershipsFor(userId: string): Promise<Membership[]> {
  const rows = await db().execute<{ tenant_id: string; tenant_name: string; role: MemberRole }>(
    sql`select tenant_id, tenant_name, role from app_memberships_for(${userId}::uuid)`,
  )
  return rows.map((r) => ({ tenantId: r.tenant_id, tenantName: r.tenant_name, role: r.role }))
}
