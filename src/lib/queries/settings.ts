import 'server-only'
import { eq } from 'drizzle-orm'
import { shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'

/** A shop's name, address slug and settings row, in one round trip. Null only if the row is missing. */
export async function shopWithSettings(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select({ name: tenants.name, slug: tenants.slug, settings: shopSettings })
      .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId)).limit(1)
    return row ?? null
  })
}

/** Policy pages the merchant rewrote by hand, by kind. */
export async function policyOverrides(tenantId: string): Promise<Record<string, string>> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
  )
  return Object.fromEntries(rows.map((r) => [r.kind, r.body]))
}
