// =============================================================================
// FILE: src/domains/plans/entitlements.ts
//
// WHAT A STORE'S PLAN GIVES IT — the one place that answers. A feature is on or
// off per plan (Stripe-entitlements shape: defined once, attached to plans,
// derived, never copied onto the tenant). Price, included orders and the fee
// live on a plan VERSION, which never changes after it is created: a new price
// is a new version, so nothing a merchant agreed to moves behind their back.
// =============================================================================

import { type Paise, applyBps } from '@/domains/money/paise'
import type { ModuleKey } from '@/domains/modules/registry'

/** What a plan version may include: a module key (src/domains/modules/registry.ts is the one list; FEATURES retired 2026-11-07). */
export type Feature = ModuleKey

export const PLAN_CODES = ['launch', 'growth', 'scale'] as const
export type PlanCode = (typeof PLAN_CODES)[number]

export type PlanVersion = {
  planCode: PlanCode
  version: number
  monthlyPrice: Paise
  includedOrders: number
  /** Fee on each DELIVERED order's value, in basis points (2% = 200). */
  feeBps: number
}

export type TenantPlanRow = {
  startsAt: Date
  planVersion: PlanVersion
  features: readonly Feature[]
  trialEndsAt: Date | null
  customMonthlyPrice: Paise | null
}

/** The plan in force at `now`: the latest row that has started. Future rows are scheduled changes. */
export function currentPlan<T extends { startsAt: Date }>(rows: readonly T[], now: Date): T | null {
  let best: T | null = null
  for (const r of rows) {
    if (r.startsAt.getTime() <= now.getTime() && (!best || r.startsAt.getTime() > best.startsAt.getTime())) best = r
  }
  return best
}


/** What the merchant pays a month for the plan itself. */
export function monthlyPrice(row: { planVersion: Pick<PlanVersion, 'monthlyPrice'> } & Pick<TenantPlanRow, 'customMonthlyPrice' | 'trialEndsAt'>, now: Date): Paise {
  if (row.trialEndsAt && now.getTime() < row.trialEndsAt.getTime()) return 0 as Paise
  return row.customMonthlyPrice ?? row.planVersion.monthlyPrice
}

/** Frrata's fee on one delivered order. A returned order is never charged. */
export function deliveredFee(netRevenue: Paise, feeBps: number): Paise {
  return applyBps(netRevenue, feeBps)
}

/**
 * THE fee for one order (billing B0, the one rule; Analytics reads it too): the rate of the plan version in force when
 * the order SHIPPED (`rateAt`; owner, 2026-11-08 — a plan changed after shipping never changes an order's rate, so a
 * short upgrade cannot buy a lower rate for orders already on their way), on the order's merchandise net (taxable after
 * offers; no GST, delivery or COD fee), rounded per order, so a later credit reverses exactly what was billed. WHEN it is
 * billed is still its billable moment. Null fee without a plan then. SQL twin: feeRateAtSql (src/lib/db/order-predicates.ts).
 */
export function feeForOrder<T extends { startsAt: Date; planVersion: Pick<PlanVersion, 'feeBps'> }>(history: readonly T[], order: { merchandiseNet: number; rateAt: Date; billableAt: Date }): { feeBps: number; fee: Paise } | null {
  // Billable before any plan: no fee. Shipped before the first plan: the first plan's rate.
  if (!currentPlan(history, order.billableAt)) return null
  const first = [...history].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]!
  const plan = currentPlan(history, order.rateAt < first.startsAt ? first.startsAt : order.rateAt)
  return plan ? { feeBps: plan.planVersion.feeBps, fee: deliveredFee(order.merchandiseNet as Paise, plan.planVersion.feeBps) } : null
}

/** Orders this month against what the plan includes. Past it the store keeps selling; `over` flags it. */
export function usage(ordersThisMonth: number, includedOrders: number) {
  return { used: ordersThisMonth, included: includedOrders, over: ordersThisMonth > includedOrders }
}

/** The plan to suggest when a store is over its included orders. */
export function nextPlan(code: PlanCode): PlanCode | null {
  const i = PLAN_CODES.indexOf(code)
  return PLAN_CODES[i + 1] ?? null
}
