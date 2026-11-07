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
    { key: 'shop', title: 'Name and address', done: true, href: built.settings ? '/console/settings/address' : null, detail: `${f.shopName} · ${f.address}` },
    {
      key: 'product', title: 'Add your first product', done: hasProduct, href: built.products ? '/console/products' : null,
      detail: hasProduct ? `${f.productCount} active product${f.productCount === 1 ? '' : 's'}`
        : built.products ? 'Photos on a model, sizes and colours, the size chart for its type. About 10 minutes.'
        : 'Products open in the next release: photos, sizes and colours and size charts.',
    },
    {
      key: 'details', title: 'Business details and grievance officer', done: !!f.legalName.trim() && grievanceComplete(f),
      href: built.settings ? (f.legalName.trim() ? '/console/settings/contact' : '/console/settings/store') : null,
      detail: 'Your legal name, address and a grievance officer (name, email and phone) are shown on your shop, as the law asks. Razorpay checks them too.',
    },
    {
      key: 'payments', title: 'How shoppers pay', done: canPay, href: built.settings ? '/console/settings/payments' : null,
      detail: f.paymentsConnected ? 'UPI and cards through Razorpay' + (f.codOn ? `, and Pay on delivery up to ${formatInr(f.codMaxPaise)}` : '')
        : f.codOn ? `Pay on delivery, up to ${formatInr(f.codMaxPaise)} an order. Connect Razorpay for UPI and cards when you are ready.`
        : 'Turn on Pay on delivery, or connect Razorpay.',
    },
    {
      key: 'publish', title: 'Open your shop', done: f.publishedAt !== null, href: null,
      detail: f.publishedAt ? `Open at ${f.address}.` : !hasProduct ? 'Needs one Active product first. Until then your shop shows "Opening soon".'
        : !canPay ? 'Needs a way to pay first.' : `Ready. Your shop opens at ${f.address}.`,
    },
  ]
}

/** Every step before "Open your shop" is done: the button may be pressed (the action checks again on the server). */
export const readyToOpen = (steps: SetupStep[]) => steps.filter((s) => s.key !== 'publish').every((s) => s.done)
