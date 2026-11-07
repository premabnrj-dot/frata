// =============================================================================
// FILE: src/domains/partners/example.ts — the worked example on /partners.
//
// Computed from a plan row and PARTNER_TERMS, never typed (unit-economics review
// 2026-11-07): what Frata collects from one brand in a month, ex GST, and the
// partner's share of it. The order count and value are named, and the page shows them.
// =============================================================================

import { type Paise, applyBps, paise, sum } from '@/domains/money/paise'
import { deliveredFee } from '@/domains/plans/entitlements'
import { PARTNER_TERMS } from './terms'

/** The example brand: delivered orders a month and their value ex GST (merchandise_net, the fee's base). */
export const EXAMPLE_BRAND = { deliveredOrders: 120, orderValue: paise(120_000) } as const

export type ShareExample = { plan: string; planFee: Paise; orderFee: Paise; frataCollects: Paise; share: Paise; feeBps: number }

export function shareExample(plan: { name: string; monthlyPrice: number; feeBps: number }, shareBps: number = PARTNER_TERMS.shareBps): ShareExample {
  const planFee = paise(plan.monthlyPrice)
  const orderFee = deliveredFee(paise(EXAMPLE_BRAND.orderValue * EXAMPLE_BRAND.deliveredOrders), plan.feeBps)
  const frataCollects = sum([planFee, orderFee])
  return { plan: plan.name, planFee, orderFee, frataCollects, share: applyBps(frataCollects, shareBps), feeBps: plan.feeBps }
}
