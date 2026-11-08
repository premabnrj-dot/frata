// =============================================================================
// FILE: src/domains/settings/ship-costs.ts
//
// THE THREE SHIPPING COSTS a shop confirms (Ship S·0, owner call S3): what it typed, checked, in paise; and when they
// count. A merchant's cost: read on the server only (ADR-0003). Pure.
// =============================================================================

import type { ShipCostEstimate } from '@/domains/orders/freight'

export type ShipCostsInput = { delivery: string; ret: string; cod: string }
export type ShipCosts = { delivery: number | null; ret: number | null; cod: number | null; confirmedAt: Date | null }

/** At most ₹10,000 each: a typo guard, far above any parcel's freight. */
const SHIP_COST_MAX_RUPEES = 10_000

/** Whole rupees as typed ("₹1,200", " 70 ") → paise, or a reason per field. */
export function parseShipCosts(input: unknown): { ok: true; paise: { delivery: number; ret: number; cod: number } } | { ok: false; errors: Partial<Record<keyof ShipCostsInput, string>> } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const errors: Partial<Record<keyof ShipCostsInput, string>> = {}
  const out: Record<string, number> = {}
  for (const k of ['delivery', 'ret', 'cod'] as const) {
    const clean = typeof raw[k] === 'string' ? (raw[k] as string).replace(/[,₹\s]/g, '') : ''
    if (!/^\d{1,5}$/.test(clean) || Number(clean) > SHIP_COST_MAX_RUPEES) errors[k] = `Whole rupees, up to ₹${SHIP_COST_MAX_RUPEES.toLocaleString('en-IN')}.`
    else out[k] = Number(clean) * 100
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, paise: { delivery: out.delivery!, ret: out.ret!, cod: out.cod! } }
}

/** The estimate freight.ts uses: only once all three are set and confirmed; otherwise none ("before shipping costs"). */
export const estimateOf = (c: ShipCosts | null): ShipCostEstimate =>
  c?.confirmedAt && c.delivery !== null && c.ret !== null && c.cod !== null ? { delivery: c.delivery, ret: c.ret, codFee: c.cod } : null
