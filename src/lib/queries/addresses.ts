import 'server-only'
import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { tenants } from '@/lib/db/schema'
import { shopDomains, shopNames } from '@/lib/db/schema-addresses'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { mainAddress } from '@/domains/addresses/names'
import { shopHost } from '@/lib/public-env'
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

/** The shop's main own domain, read inside the caller's transaction (coreShop): null when its frrata name is main. */
export async function mainDomainIn(tx: Tx, tenantId: string): Promise<string | null> {
  const [r] = await tx.select({ host: shopDomains.host }).from(shopDomains)
    .where(and(eq(shopDomains.tenantId, tenantId), isNotNull(shopDomains.mainAt), isNull(shopDomains.removedAt))).limit(1)
  return r?.host ?? null
}

/** The shop's main address for the console's links (Make a link, a product's page, Settings): never cached. */
export async function mainHostFor(tenantId: string, slug: string): Promise<string> {
  return mainAddress(shopHost(slug), await withTenant(tenantId, (tx) => mainDomainIn(tx, tenantId)))
}

/** A domain row as Settings › Shop address shows it (D2·10): facts only; its state is derived (domainState). */
export type DomainRow = {
  id: string; host: string; withWww: boolean; claimedAt: Date; provedAt: Date | null; addedAt: Date | null; dnsOkAt: Date | null
  certOkAt: Date | null; checkedAt: Date | null; failingSince: Date | null; mainAt: Date | null; razorpayOkAt: Date | null
  contestAt: Date | null; vercelTxt: string | null; removedAt: Date | null; removedReason: string | null
}

/** The shop's own domains: live ones, and those Frrata or another shop took away (so the row can say so). */
export async function shopDomainRows(tenantId: string): Promise<DomainRow[]> {
  return withTenant(tenantId, (tx) => tx.select({
    id: shopDomains.id, host: shopDomains.host, withWww: shopDomains.withWww, claimedAt: shopDomains.claimedAt, provedAt: shopDomains.provedAt,
    addedAt: shopDomains.addedAt, dnsOkAt: shopDomains.dnsOkAt, certOkAt: shopDomains.certOkAt, checkedAt: shopDomains.checkedAt,
    failingSince: shopDomains.failingSince, mainAt: shopDomains.mainAt, razorpayOkAt: shopDomains.razorpayOkAt, contestAt: shopDomains.contestAt,
    vercelTxt: shopDomains.vercelTxt, removedAt: shopDomains.removedAt, removedReason: shopDomains.removedReason,
  }).from(shopDomains).where(and(eq(shopDomains.tenantId, tenantId), or(isNull(shopDomains.removedAt), and(isNotNull(shopDomains.removedAt), or(eq(shopDomains.removedReason, 'moved'), eq(shopDomains.removedReason, 'frrata'))))))
    .orderBy(asc(shopDomains.claimedAt)).limit(10))
}
