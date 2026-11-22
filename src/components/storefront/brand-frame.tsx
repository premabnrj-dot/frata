import { BRAND_FONT_VARS } from '@/components/shop-preview/brand-fonts'
import { STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import type { BrandRecord } from '@/domains/brand/record'
import type { CheckoutDesign } from '@/domains/brand/checkout'
import { BEACON_VERSION } from '@/lib/analytics/beacon-version'
import { isCountingVisits } from '@/lib/env'
import { CaptureAttribution } from './capture'
import { StoreToaster } from './store-toaster'
import { BRAND_CSS } from './brand-css'
import { BrandFooter, BrandHeader, brandStyle, type BrandFacts } from './brand-parts'
export type { BrandFacts } from './brand-parts'

// =============================================================================
// FILE: src/components/storefront/brand-frame.tsx — A CODE-SITE STORE'S CHECKOUT, BAG-LINK, ORDER AND POLICY PAGES,
// IN ITS BRAND (one-address plan P2·3; spec § 3; owner-approved mockup docs/mockups/2026-11-16-p2-checkout.html). The
// brand record (logo, colours, fonts, corners, spacing) and the checkout design (header, back link, policy rows) as
// props, never the theme: the frame sets the store's tokens from the record, so the checkout, order and policy views
// draw as they always do and wear the brand. The legal block always shows (the law, not a setting). Theme shops never
// reach it (O19). No partner pixel or script here (O12): only Frrata's own beacon, as on every store page. Its rules
// travel inline (brand-css.ts), so the shop's shared sheet does not grow for theme shops.
// =============================================================================

/**
 * Every brand page: the record's tokens and faces, its header and (but on the bag-link page) its footer. `capture`
 * marks the real store (attribution, the toast's box, the visit beacon), never a console preview.
 */
export function BrandFrame({ record, design, facts, home, lang, children, footer = true, link = true, capture = false }: {
  record: BrandRecord; design: CheckoutDesign; facts: BrandFacts; home: string; lang?: 'hi' | 'en'; children: React.ReactNode
  footer?: boolean; link?: boolean; capture?: boolean }) {
  return (
    <div data-store-theme="" data-brand="" lang={lang === 'hi' ? 'hi' : undefined} className={`${STORE_FONT_VARS} ${BRAND_FONT_VARS} flex min-h-dvh flex-col`} style={brandStyle(record)}>
      {/* A constant (brand-css.ts): nothing typed by a merchant or a shopper reaches it. */}
      <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-store-paper focus:px-3 focus:py-2 focus:text-sm focus:font-medium">Skip to content</a>
      <BrandHeader record={record} design={design} name={facts.shopName} home={home} link={link} />
      <main id="main" tabIndex={-1} className="bf-main">{children}</main>
      {footer && <BrandFooter facts={facts} rows={design.rows} />}
      <CaptureAttribution capture={capture} />
      {capture && <StoreToaster />}
      {capture && isCountingVisits() && <script async src={`/fe.js?v=${BEACON_VERSION}`} />}
    </div>
  )
}
