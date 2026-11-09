import 'server-only'
import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { tenants } from '@/lib/db/schema'
import { shopDomains, shopNames } from '@/lib/db/schema-addresses'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { mainAddress } from '@/domains/addresses/names'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
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

/** The shop's main own domain, read inside the caller's transaction (coreShop): null when its frrata name is main, or
 * while the main domain is failing. */
export async function mainDomainIn(tx: Tx, tenantId: string): Promise<string | null> {
  const [r] = await tx.select({ host: shopDomains.host }).from(shopDomains)
    // A main domain that is failing hands the shop back to its name (canonical, links) until it works again.
    .where(and(eq(shopDomains.tenantId, tenantId), isNotNull(shopDomains.mainAt), isNull(shopDomains.removedAt), isNull(shopDomains.failingSince))).limit(1)
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

/** What Continue needs for a claimed row (D2·10): its host and the token its TXT record carries (the shop's own row). */
export async function domainClaimFor(tenantId: string, id: string): Promise<{ host: string; apex: string; withWww: boolean; token: string } | null> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ host: shopDomains.host, apex: shopDomains.apex, withWww: shopDomains.withWww, token: shopDomains.token })
    .from(shopDomains).where(and(eq(shopDomains.tenantId, tenantId), eq(shopDomains.id, id), isNull(shopDomains.removedAt))).limit(1))
  return r ?? null
}

/** The console's red banner (design rule 76): the shop's main domain, failing for 24 h or more; null otherwise. */
export async function failingMainFor(tenantId: string, now: Date): Promise<{ host: string; since: Date; nameHost: string } | null> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ host: shopDomains.host, since: shopDomains.failingSince, slug: tenants.slug }).from(shopDomains)
    .innerJoin(tenants, eq(tenants.id, shopDomains.tenantId)).where(and(eq(shopDomains.tenantId, tenantId), isNotNull(shopDomains.mainAt), isNull(shopDomains.removedAt), isNotNull(shopDomains.failingSince))).limit(1))
  if (!r?.since || now.getTime() - r.since.getTime() < 24 * 3_600_000) return null
  return { host: r.host, since: r.since, nameHost: shopHost(r.slug) }
}

/**
 * D1·8: has the merchant said Razorpay approved this host? Checkout offers online payment on a host only then (Razorpay
 * fails live payments from an unregistered website). An own domain or its www; else the shop's frrata name.
 */
export async function hostApprovedIn(tx: Tx, tenantId: string, host: string): Promise<boolean> {
  const h = host.toLowerCase()
  const suffix = `.${SHOP_DOMAIN.toLowerCase()}`
  if (h.endsWith(suffix)) {
    const [n] = await tx.select({ ok: shopNames.razorpayOkAt }).from(shopNames)
      .where(and(eq(shopNames.tenantId, tenantId), eq(shopNames.name, h.slice(0, -suffix.length)), isNull(shopNames.retiredAt))).limit(1)
    return !!n?.ok
  }
  const bare = h.startsWith('www.') ? h.slice(4) : h
  const [d] = await tx.select({ ok: shopDomains.razorpayOkAt }).from(shopDomains)
    .where(and(eq(shopDomains.tenantId, tenantId), eq(shopDomains.host, bare), isNull(shopDomains.removedAt))).limit(1)
  return !!d?.ok
}

/** D1·8/D1·9: the shop's live names (current, and one added beside it) with Razorpay's approval. */
export async function liveNamesFor(tenantId: string): Promise<{ name: string; added: boolean; razorpayOk: boolean }[]> {
  const rows = await withTenant(tenantId, (tx) => tx.select({ name: shopNames.name, addedAt: shopNames.addedAt, ok: shopNames.razorpayOkAt }).from(shopNames)
    .where(and(eq(shopNames.tenantId, tenantId), isNull(shopNames.retiredAt))).orderBy(asc(shopNames.createdAt)).limit(2))
  return rows.map((r) => ({ name: r.name, added: r.addedAt !== null, razorpayOk: r.ok !== null }))
}
