import 'server-only'
import { and, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { shopSettings, tenants } from '@/lib/db/schema'
import { shopDomains } from '@/lib/db/schema-addresses'
import { partnerLinks } from '@/lib/db/schema-partners'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { withTenant } from '@/lib/db/tenant'
import type { KeyKind } from '@/domains/storefront-api/keys'
import { hasOwnerIn } from './settings'

// =============================================================================
// FILE: src/lib/queries/website.ts — CONSOLE › SETTINGS › WEBSITE (V1 Storefront API SA1·1; mockup
// https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm). One snapshot transaction, its reads side by side: where the
// website runs, the live connected domains it may name, the keys (never their hash), who made them (a partner's name
// from app_shop_people), the partner links (a key follows its partner), whether the store has an owner and ever opened,
// and who made its build keys (app_build_key_makers, G·2).
// =============================================================================

export type WebsiteKey = { id: string; name: string; kind: KeyKind; purpose: string | null; prefix: string; partnerId: string | null; createdBy: string; createdAt: string
  expiresAt: string | null; revokedAt: string | null; revokedBy: string | null; lastSeenOn: string | null }
export type WebsiteDomain = { id: string; host: string; apex: string; withWww: boolean; main: boolean; razorpayOk: boolean }
export type WebsitePage = {
  slug: string; siteOrigin: string | null; siteDomainId: string | null; firstOpenedAt: string | null; hasOwner: boolean
  domains: WebsiteDomain[]; keys: WebsiteKey[]; partnerLinks: { partnerId: string; removedAt: string | null }[]
  /** Who made or deleted a key, by user id: a partner's business name, or a member's role. */
  people: Record<string, { partnerName: string | null; role: string }>
  /** Who made the store's build keys (G·2, app_build_key_makers): their email, partner, whether they still answer (the
   *  definer's own check) and when they left the partner. By user id. */
  makers: Record<string, { email: string | null; partnerName: string; live: boolean; leftAt: string | null }>
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString())

export const websitePage = (tenantId: string) => withTenant(tenantId, async (tx): Promise<WebsitePage> => {
  const [settings, opened, domains, keys, links, people, makers, hasOwner] = await Promise.all([
    tx.select({ siteOrigin: shopSettings.siteOrigin, siteDomainId: shopSettings.siteDomainId }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
    tx.select({ at: tenants.firstOpenedAt, slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)),
    tx.select({ id: shopDomains.id, host: shopDomains.host, apex: shopDomains.apex, withWww: shopDomains.withWww, mainAt: shopDomains.mainAt, razorpayOkAt: shopDomains.razorpayOkAt })
      .from(shopDomains).where(and(eq(shopDomains.tenantId, tenantId), isNotNull(shopDomains.provedAt), isNull(shopDomains.removedAt), isNull(shopDomains.parkedAt))),
    // Live and Test keys, and build keys, each their own 100 newest (security LOW-6: up to 50 live build keys a store
    // must never push a Live or Test key off the owner's list).
    Promise.all([false, true].map((build) => tx.select({ id: storefrontKeys.id, name: storefrontKeys.name, kind: storefrontKeys.kind, purpose: storefrontKeys.purpose, prefix: storefrontKeys.prefix, partnerId: storefrontKeys.partnerId, createdBy: storefrontKeys.createdBy,
      createdAt: storefrontKeys.createdAt, expiresAt: storefrontKeys.expiresAt, revokedAt: storefrontKeys.revokedAt, revokedBy: storefrontKeys.revokedBy, lastSeenOn: storefrontKeys.lastSeenOn })
      .from(storefrontKeys)
      .where(and(eq(storefrontKeys.tenantId, tenantId), build ? eq(storefrontKeys.kind, 'build') : ne(storefrontKeys.kind, 'build'))).orderBy(desc(storefrontKeys.createdAt)).limit(100)))
      .then(([own, build]) => [...own!, ...build!].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))),
    tx.select({ partnerId: partnerLinks.partnerId, removedAt: partnerLinks.removedAt }).from(partnerLinks).where(eq(partnerLinks.tenantId, tenantId)),
    tx.execute<{ user_id: string; role: string; partner_name: string | null }>(sql`select user_id, role, partner_name from app_shop_people()`),
    tx.execute<{ user_id: string; email: string | null; partner_name: string; live: boolean; left_at: Date | string | null }>(sql`select user_id, email, partner_name, live, left_at from app_build_key_makers()`),
    hasOwnerIn(tx, tenantId),
  ])
  return {
    slug: opened[0]?.slug ?? '', siteOrigin: settings[0]?.siteOrigin ?? null, siteDomainId: settings[0]?.siteDomainId ?? null, firstOpenedAt: iso(opened[0]?.at ?? null), hasOwner,
    domains: domains.map((d) => ({ id: d.id, host: d.host, apex: d.apex, withWww: d.withWww, main: !!d.mainAt, razorpayOk: !!d.razorpayOkAt })),
    keys: keys.map((k) => ({ ...k, kind: k.kind as KeyKind, createdAt: iso(k.createdAt)!, expiresAt: iso(k.expiresAt), revokedAt: iso(k.revokedAt), lastSeenOn: k.lastSeenOn ?? null })),
    partnerLinks: links.map((l) => ({ partnerId: l.partnerId, removedAt: iso(l.removedAt) })),
    people: Object.fromEntries([...people].map((p) => [p.user_id, { partnerName: p.partner_name, role: p.role }])),
    makers: Object.fromEntries([...makers].map((m) => [m.user_id, { email: m.email, partnerName: m.partner_name, live: m.live, leftAt: iso(m.left_at) }])),
  }
}, { snapshot: true })
