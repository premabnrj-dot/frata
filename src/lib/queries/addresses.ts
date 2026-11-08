import 'server-only'
import { eq } from 'drizzle-orm'
import { shopNames, tenants } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import type { NameRow } from '@/domains/addresses/names'

// =============================================================================
// FILE: src/lib/queries/addresses.ts
//
// A SHOP'S ADDRESS FACTS (shop addresses D·1): its name, every name it has had, when it first opened and whether
// Frrata froze changes. One transaction; the shop's own rows only (shop_names policy).
// =============================================================================

export type AddressFacts = { slug: string; firstOpenedAt: Date | null; renamesUsed: number; frozen: boolean; names: NameRow[] }

export async function addressFacts(tenantId: string): Promise<AddressFacts | null> {
  return withTenant(tenantId, async (tx) => {
    const [[t], names] = await Promise.all([
      tx.select({ slug: tenants.slug, firstOpenedAt: tenants.firstOpenedAt, renamesUsed: tenants.renamesUsed, frozenAt: tenants.addressFrozenAt }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
      tx.select({ name: shopNames.name, retiredAt: shopNames.retiredAt, retiredByFrrata: shopNames.retiredByFrrata }).from(shopNames).where(eq(shopNames.tenantId, tenantId)),
    ])
    return t ? { slug: t.slug, firstOpenedAt: t.firstOpenedAt, renamesUsed: t.renamesUsed, frozen: t.frozenAt !== null, names } : null
  })
}
