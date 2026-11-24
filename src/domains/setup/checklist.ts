// =============================================================================
// FILE: src/domains/setup/checklist.ts
//
// THE FOUR SETUP STEPS on console Home before the store opens (plan docs/plans/2026-11-23-o2a-setup-card.md O2a·1,
// mockup § 2 "O2 · four steps"). Every step is DERIVED from what the store has (a product, its details, a way to
// pay, a publish time) — never a stored "done" flag that can disagree with the data. Pure.
// =============================================================================

import { grievanceComplete } from '../settings/sections'
import type { Capability } from '../tenancy/roles'

export type SetupFacts = {
  /** Active products (a draft cannot be bought). */
  productCount: number
  legalName: string
  grievanceName: string
  grievanceEmail: string
  grievancePhone: string
  codOn: boolean
  /** Razorpay with LIVE keys and a webhook that has worked (test keys do not count). */
  paymentsConnected: boolean
  publishedAt: Date | null
}

export type SetupStepKey = 'product' | 'details' | 'payments' | 'publish'

export type SetupStep = {
  key: SetupStepKey
  /** The row's words, and the focus panel's title while it is next. */
  title: string
  /** The focus panel's one button. */
  action: string
  /** The row's right side once done ("3 products", the legal name); empty while open. */
  value: string
  done: boolean
  /** Who may act on it: a row the person may not act on is text, not a button (nextSetupStep skips it). */
  who: Capability
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function setupSteps(f: SetupFacts): SetupStep[] {
  const hasProduct = f.productCount > 0
  const details = !!f.legalName.trim() && grievanceComplete(f)
  const canPay = f.codOn || f.paymentsConnected
  const pay = f.paymentsConnected ? (f.codOn ? 'UPI, cards and Pay on delivery' : 'UPI and cards') : f.codOn ? 'Pay on delivery' : ''
  return [
    { key: 'product', title: 'Add your first product', action: 'Add product', value: hasProduct ? plural(f.productCount, 'product') : '', done: hasProduct, who: 'shop.work' },
    { key: 'details', title: 'Add business details', action: 'Add details', value: details ? f.legalName.trim() : '', done: details, who: 'shop.build' },
    { key: 'payments', title: 'Choose how shoppers pay', action: 'Change payments', value: pay, done: canPay, who: 'shop.build' },
    { key: 'publish', title: 'Open your store', action: 'Open store', value: f.publishedAt ? 'Open' : '', done: f.publishedAt !== null, who: 'shop.manage' },
  ]
}

/**
 * The step Home leads with for this person: the first open one they may act on. Opening comes only once every other
 * step is done (whoever may do them); null when nothing is left for this person.
 */
export function nextSetupStep(steps: SetupStep[], can: (c: Capability) => boolean): SetupStep | null {
  const rest = steps.filter((s) => s.key !== 'publish')
  const first = rest.find((s) => !s.done && can(s.who))
  if (first) return first
  if (rest.some((s) => !s.done)) return null
  const open = steps.find((s) => s.key === 'publish' && !s.done && can(s.who))
  return open ?? null
}

/** Every step before "Open your shop" is done: the button may be pressed (the action checks again on the server). */
export const readyToOpen = (steps: SetupStep[]) => steps.filter((s) => s.key !== 'publish').every((s) => s.done)

/** openShop's refusal while a step is open: "Not yet: " and each open step, in order; null when ready. */
export const notYet = (steps: SetupStep[]): string | null =>
  readyToOpen(steps) ? null : `Not yet: ${steps.filter((x) => !x.done && x.key !== 'publish').map((x) => x.title.toLowerCase()).join(', ')}.`

/**
 * D0·3 (Studio workbench plan; mockup docs/mockups/2026-11-22-studio-workbench.html screen 2): opening the store (the
 * card's Open store, then "Open your store?") refuses while the brand's own website is being built with no proved address. Its Test keys stop the moment the store opens
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
