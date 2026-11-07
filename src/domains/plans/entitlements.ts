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
export function monthlyPrice(row: Pick<TenantPlanRow, 'planVersion' | 'customMonthlyPrice' | 'trialEndsAt'>, now: Date): Paise {
  if (row.trialEndsAt && now.getTime() < row.trialEndsAt.getTime()) return 0 as Paise
  return row.customMonthlyPrice ?? row.planVersion.monthlyPrice
}

/** Frrata's fee on one delivered order. A returned order is never charged. */
export function deliveredFee(netRevenue: Paise, feeBps: number): Paise {
  return applyBps(netRevenue, feeBps)
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
