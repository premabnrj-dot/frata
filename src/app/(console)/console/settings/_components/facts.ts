import type { ShopFacts } from '@/components/shop-preview/previews'
import type { shopWithSettings } from '@/lib/queries/settings'

type Row = NonNullable<Awaited<ReturnType<typeof shopWithSettings>>>

/** A shop's row as the previews read it: one mapping, used by every Settings page. */
export function shopFacts(shop: Row, shopDomain: string): ShopFacts {
  const s = shop.settings
  return {
    shopName: shop.name, slug: shop.slug, shopDomain,
    legalName: s.legalName, address: s.address, originCountry: s.originCountry, orderPrefix: s.orderPrefix,
    supportEmail: s.supportEmail, supportPhone: s.supportPhone, whatsapp: s.whatsapp, instagram: s.instagram,
    grievanceName: s.grievanceName, grievanceRole: s.grievanceRole, grievanceEmail: s.grievanceEmail, grievancePhone: s.grievancePhone,
    accent: s.accent, displayFont: s.displayFont, tagline: s.tagline, shopLanguage: s.shopLanguage,
    returnKind: s.returnKind as ShopFacts['returnKind'], returnDays: s.returnDays,
    codOn: s.codOn, codMin: s.codMin, codMax: s.codMax, codCharge: s.codCharge, codBlockedPincodes: s.codBlockedPincodes,
    shippingFlat: s.shippingFlat, freeShippingAbove: s.freeShippingAbove, dispatchDays: s.dispatchDays, metroDays: s.metroDays, restDays: s.restDays,
    pricesIncludeGst: s.pricesIncludeGst, gstin: s.gstin, defaultHsn: s.defaultHsn, invoiceSeries: s.invoiceSeries,
    docLogo: s.docLogo, docSignatory: s.docSignatory, docNote: s.docNote, slipSize: s.slipSize,
  }
}

/** The stored values a section's form starts from, keyed as the section's fields are. */
export function storedValues(f: ShopFacts): Record<string, unknown> {
  return { ...f, name: f.shopName }
}
