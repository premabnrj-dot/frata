// =============================================================================
// FILE: src/domains/setup/checklist.ts
//
// "GET YOUR SHOP READY TO SELL" on console Home. Every step is DERIVED from
// what the shop has (a product, its details, a way to pay, a publish time) —
// never a stored "done" flag that can disagree with the data. Pure.
// A step whose page is not built yet says when it arrives instead of linking
// nowhere (frata-design-language: no "coming soon" navigation).
// =============================================================================

import { grievanceComplete } from '../settings/sections'

export type SetupFacts = {
  shopName: string
  address: string
  /** Active products (a draft cannot be bought). */
  productCount: number
  legalName: string
  grievanceName: string
  grievanceEmail: string
  grievancePhone: string
  codOn: boolean
  codMaxPaise: number
  /** Razorpay with LIVE keys and a webhook that has worked (test keys do not count). */
  paymentsConnected: boolean
  publishedAt: Date | null
}

export type SetupStep = {
  key: 'shop' | 'product' | 'details' | 'payments' | 'publish'
  title: string
  detail: string
  done: boolean
  /** Where the merchant fixes it; null while that page is not built yet. */
  href: string | null
}

/** Which console pages exist, so a step links only to a real page. Grows with each sub-phase. */
export type BuiltPages = { products: boolean; settings: boolean; publish: boolean }

/** Pages the checklist may link to: each flips to true when its sub-phase ships. One copy, read by the checklist and openShop. */
export const BUILT_PAGES: BuiltPages = { products: true, settings: true, publish: true }

export function setupSteps(f: SetupFacts, built: BuiltPages, formatInr: (paise: number) => string): SetupStep[] {
  const hasProduct = f.productCount > 0
  const canPay = f.codOn || f.paymentsConnected
  return [
    { key: 'shop', title: 'Name and address', done: true, href: built.settings ? '/console/settings/web-address' : null, detail: `${f.shopName} · ${f.address}` },
    {
      key: 'product', title: 'Add your first product', done: hasProduct, href: built.products ? '/console/products' : null,
      detail: hasProduct ? `${f.productCount} active product${f.productCount === 1 ? '' : 's'}`
        : built.products ? 'Photos on a model, sizes and colours, the size chart for its type. About 10 minutes.'
        : 'Products open in the next release, with photos, sizes, colours and size charts.',
    },
    {
      key: 'details', title: 'Business details and grievance officer', done: !!f.legalName.trim() && grievanceComplete(f),
      href: built.settings ? (f.legalName.trim() ? '/console/settings/contact' : '/console/settings/business') : null,
      detail: 'Your store must show your legal name, address and a grievance officer. Razorpay checks them too.',
    },
    {
      key: 'payments', title: 'How shoppers pay', done: canPay, href: built.settings ? '/console/settings/payments' : null,
      detail: f.paymentsConnected ? 'UPI and cards through Razorpay' + (f.codOn ? `, and Pay on delivery up to ${formatInr(f.codMaxPaise)}` : '')
        : f.codOn ? `Pay on delivery, up to ${formatInr(f.codMaxPaise)} an order. Connect Razorpay for UPI and cards when you are ready.`
        : 'Turn on Pay on delivery, or connect Razorpay.',
    },
    {
      key: 'publish', title: 'Open your store', done: f.publishedAt !== null, href: null,
      detail: f.publishedAt ? `Open at ${f.address}.` : !hasProduct ? 'Needs one Active product first. Until then your store shows "Opening soon".'
        : !canPay ? 'Needs a way to pay first.' : `Ready. Your store opens at ${f.address}.`,
    },
  ]
}

/** Every step before "Open your shop" is done: the button may be pressed (the action checks again on the server). */
export const readyToOpen = (steps: SetupStep[]) => steps.filter((s) => s.key !== 'publish').every((s) => s.done)

/** openShop's refusal while a step is open: "Not yet: " and each open step, in order; null when ready. */
export const notYet = (steps: SetupStep[]): string | null =>
  readyToOpen(steps) ? null : `Not yet: ${steps.filter((x) => !x.done && x.key !== 'publish').map((x) => x.title.toLowerCase()).join(', ')}.`

/**
 * D0·3 (Studio workbench plan; mockup docs/mockups/2026-11-22-studio-workbench.html screen 2): Open my store refuses
 * while the brand's own website is being built with no proved address. Its Test keys stop the moment the store opens
 * (ADR-0018 decision 4), and a Live key answers only on a proved, live domain, so opening now would leave the website
 * blank. "Building elsewhere" is derived, never stored: the store holds a Test or Build key that still answers (not
 * deleted, not past its end; orchestrator ruling C3, 2026-11-22) and has no Website on a live connected domain.
 * Connecting the domain and naming it the Website clears it; so does deleting those keys. After one address ships, the
 * frrata name counts as proved.
 */
export type WebsiteFacts = {
  /** The Website's address, set only on a live connected domain of this store (the database holds that). */
  siteOrigin: string | null
  /** Test and Build keys of this store not deleted and not past their end. */
  buildingKeys: number
}
export const websiteBlocksOpening = (f: WebsiteFacts): boolean => f.siteOrigin === null && f.buildingKeys > 0
