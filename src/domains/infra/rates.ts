// =============================================================================
// FILE: src/domains/infra/rates.ts — the vendors' published prices and plan limits Admin › Infrastructure estimates with
// (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·4). One dated place: frata-integrations § Vercel platform, § Mux,
// § Infrastructure usage. A rate older than 90 days is rechecked before it is trusted (CLAUDE.md "Integration facts expire").
// Pure: no I/O.
// =============================================================================

/** When these were read from the vendors' pages. */
export const RATES_CHECKED = '2026-11-11'

/** Supabase: the org's plan (Management API cut as YAGNI: the plan is this constant, changed when the owner upgrades). */
export const SUPABASE = {
  plan: 'free' as 'free' | 'pro',
  diskBytes: { free: 500 * 1024 * 1024, pro: 8 * 1024 * 1024 * 1024 },
  proFromUsd: 25,
} as const

/** Vercel Pro in Mumbai (bom1). */
export const VERCEL = {
  /** The On-Demand Budget as set in Vercel (Settings › Billing › Spend Management; runbook: $50, pause on). Vercel has
   *  no API for it, so it is restated here and labelled "as set in Vercel" on the page. */
  budgetUsd: 50,
  platformUsd: 20, creditUsd: 20, cpuHourUsd: 0.14, gbHourUsd: 0.0116, perMillionInvocationsUsd: 0.6,
  /** Flat Rate CDN tiers: monthly price, CDN requests included. */
  cdnTiers: [[0, 1e6], [20, 10e6], [100, 50e6], [300, 150e6]] as readonly (readonly [number, number])[],
} as const

/** Mux, pay as you go, basic quality, 720p tier. */
export const MUX = {
  freeDeliveryMinutes: 100_000, deliveryPerMinuteUsd: 0.0008, storagePerMinuteMonthUsd: 0.0024,
  mp4StoragePerMinuteMonthUsd: 0.0006, renditionPrepPerMinuteUsd: 0.008,
} as const
