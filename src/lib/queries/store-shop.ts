import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { checkoutGst } from '@/domains/tax/gstin'
import type { PolicyFacts } from '@/domains/policies/render'
import { mainAddress } from '@/domains/addresses/names'
import { shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { collections } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { shopHost } from '@/lib/public-env'
import { mainDomainIn } from './addresses'
import { shopPauseIn } from './trial-pause'
import type { StoreShop } from './storefront'

// =============================================================================
// FILE: src/lib/queries/store-shop.ts — THE SHOP'S OWN FACTS FOR SHOPPERS, in one transaction; cached by storefront.ts
// (shopSettingsFor). Split from storefront.ts for size; `host` is the main address (shop addresses D2·9).
// =============================================================================

export async function coreShop(tenantId: string): Promise<StoreShop | null> {
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx.select({
      name: tenants.name, slug: tenants.slug, publishedAt: shopSettings.publishedAt, orderPrefix: shopSettings.orderPrefix,
      legalName: shopSettings.legalName, address: shopSettings.address, supportEmail: shopSettings.supportEmail, supportPhone: shopSettings.supportPhone,
      whatsapp: shopSettings.whatsapp, instagram: shopSettings.instagram,
      grievanceName: shopSettings.grievanceName, grievanceRole: shopSettings.grievanceRole, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone,
      accent: shopSettings.accent, displayFont: shopSettings.displayFont, tagline: shopSettings.tagline, seoTitle: shopSettings.seoTitle, seoDescription: shopSettings.seoDescription, logoUrl: shopSettings.logoUrl, shopLanguage: shopSettings.shopLanguage,
      returnKind: shopSettings.returnKind, returnDays: shopSettings.returnDays, sells: shopSettings.sells,
      // COD limits are public: the Shipping policy states them.
      codOn: shopSettings.codOn, codMin: shopSettings.codMin, codMax: shopSettings.codMax, codCharge: shopSettings.codCharge,
      shippingFlat: shopSettings.shippingFlat, freeShippingAbove: shopSettings.freeShippingAbove,
      dispatchDays: shopSettings.dispatchDays, metroDays: shopSettings.metroDays, restDays: shopSettings.restDays, pricesIncludeGst: shopSettings.pricesIncludeGst,
      gstin: shopSettings.gstin, gstScheme: shopSettings.gstScheme, homeState: shopSettings.homeState, b2bInvoices: shopSettings.b2bInvoices, turnoverBand: shopSettings.turnoverBand,
    }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)).limit(1)
    if (!r) return null
    const [pol, nav, pause, mainDomain] = await Promise.all([
      tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
      // The header's collections: the first five by name (spec § Review findings).
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(5),
      shopPauseIn(tx, tenantId),
      // D2·9: the main address — the shop's main own domain, else its frrata name (canonical, share cards, sitemap…).
      mainDomainIn(tx, tenantId),
    ])
    const { gstin, gstScheme, homeState, b2bInvoices, turnoverBand, ...facts } = r
    return {
      ...facts, shopName: r.name, id: tenantId, gst: checkoutGst({ gstin, gstScheme, homeState, b2bInvoices, turnoverBand }), host: mainAddress(shopHost(r.slug), mainDomain), publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      pause: pause ? { from: pause.from.toISOString(), to: pause.to ? pause.to.toISOString() : null } : null,
      returnKind: r.returnKind as PolicyFacts['returnKind'], shopLanguage: r.shopLanguage === 'hi' ? 'hi' : 'en',
      codMin: Number(r.codMin), codMax: Number(r.codMax), codCharge: Number(r.codCharge), shippingFlat: Number(r.shippingFlat), freeShippingAbove: Number(r.freeShippingAbove),
      overrides: Object.fromEntries(pol.map((p) => [p.kind, p.body])), nav,
    }
  })
}
