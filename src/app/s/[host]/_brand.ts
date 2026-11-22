import 'server-only'
import { brandFactsOf } from '@/lib/storefront/brand-facts'
import { checkoutLook } from '@/lib/queries/brand'
import type { StoreShop } from '@/lib/queries/storefront'
import { renderDesign, trustBlocks, trustFactsOf, type CheckoutDesign, type TrustBlock } from '@/domains/brand/checkout'
import type { BrandRecord } from '@/domains/brand/record'
import { liveSeason, withSeason } from '@/domains/brand/seasons'
import { renderRecord } from '@/domains/brand/check'
import { DEFAULT_PALETTE } from '@/domains/brand/defaults'
import type { BrandFacts } from '@/components/storefront/brand-frame'

// =============================================================================
// FILE: src/app/s/[host]/_brand.ts — WHAT A CODE-SITE STORE'S CHECKOUT, BAG-LINK, ORDER AND POLICY PAGES DRAW
// (one-address plan P2·3). The live brand record with today's season, and the checkout design as it renders (a part
// that fails a later rule falls back, renderDesign). Null for a theme shop: its pages keep their theme (O19). A read
// that fails falls back to the theme too: a store's checkout never fails for its look.
// =============================================================================

export type BrandLook = { record: BrandRecord; design: CheckoutDesign; facts: BrandFacts; home: string }

export async function brandLookFor(shop: StoreShop, now: Date): Promise<BrandLook | null> {
  const look = await checkoutLook(shop.id).catch((e: unknown) => { console.error('[brand look]', e instanceof Error ? e.name : 'error'); return null })
  if (!look) return null
  return {
    // A record (or today's season) that fails a rule made after it was saved draws Frrata's defaults (spec § 3).
    record: renderRecord(withSeason(look.record, liveSeason(look.seasons, now)), DEFAULT_PALETTE),
    design: renderDesign(look.design),
    facts: brandFactsOf(shop),
    // The logo and "Back to <store>" lead to the store's own website; while it is being built, its Frrata home.
    home: shop.siteOrigin ?? '/',
  }
}

/** The checkout's heading and trust blocks for this store's design. */
export const checkoutWords = (shop: StoreShop, design: CheckoutDesign): { heading: string; trust: TrustBlock[] } =>
  ({ heading: design.heading, trust: trustBlocks(design.trust, trustFactsOf(shop)) })
