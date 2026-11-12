import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { checkoutGst } from '@/domains/tax/gstin'
import type { PolicyFacts } from '@/domains/policies/render'
import { isCountingVisits } from '@/lib/env'
import { mainAddress } from '@/domains/addresses/names'
import { shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { collections } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { shopHost } from '@/lib/public-env'
import { mainDomainIn } from './addresses'
import { shopPauseIn } from './trial-pause'
import { moduleAccessIn } from './modules'
import { deliveryZones } from '@/lib/db/schema-delivery'
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
    const [pol, nav, pause, mainDomain, zoneRows] = await Promise.all([
      tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
      // The header's collections: the first five by name (spec § Review findings).
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(5),
      shopPauseIn(tx, tenantId),
      // D2·9: the main address — the shop's main own domain, else its frrata name (canonical, share cards, sitemap…).
      mainDomainIn(tx, tenantId),
      // Delivery Zones: the zones (≤ 50), stated on the product page, the policy and the structured data while usable.
      tx.select({ name: deliveryZones.name, charge: deliveryZones.charge, freeAbove: deliveryZones.freeAbove, daysMin: deliveryZones.daysMin, daysMax: deliveryZones.daysMax,
        codOn: deliveryZones.codOn, codCharge: deliveryZones.codCharge, codMax: deliveryZones.codMax }).from(deliveryZones).where(eq(deliveryZones.tenantId, tenantId)).orderBy(asc(deliveryZones.position)),
    ])
    const zones = zoneRows.length && (await moduleAccessIn(tx, tenantId, new Date())).delivery_zones.usable
      ? zoneRows.map((z) => ({ ...z, charge: Number(z.charge), freeAbove: z.freeAbove === null ? null : Number(z.freeAbove), codCharge: Number(z.codCharge), codMax: z.codMax === null ? null : Number(z.codMax) }))
      : null
    const { gstin, gstScheme, homeState, b2bInvoices, turnoverBand, ...facts } = r
    return {
      ...facts, shopName: r.name, id: tenantId, gst: checkoutGst({ gstin, gstScheme, homeState, b2bInvoices, turnoverBand }), host: mainAddress(shopHost(r.slug), mainDomain), publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      pause: pause ? { from: pause.from.toISOString(), to: pause.to ? pause.to.toISOString() : null } : null,
      returnKind: r.returnKind as PolicyFacts['returnKind'], shopLanguage: r.shopLanguage === 'hi' ? 'hi' : 'en',
      codMin: Number(r.codMin), codMax: Number(r.codMax), codCharge: Number(r.codCharge), shippingFlat: Number(r.shippingFlat), freeShippingAbove: Number(r.freeShippingAbove),
      overrides: Object.fromEntries(pol.map((p) => [p.kind, p.body])), nav,
      // Visits are counted (A·2): the privacy policy says so (src/domains/policies/render.ts).
      countsVisits: isCountingVisits(),
      zones,
    }
  })
}
