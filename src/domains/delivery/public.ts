// =============================================================================
// FILE: src/domains/delivery/public.ts — a shop's zones as shoppers may read them (Delivery Zones; architecture review
// M2): the product page's days, the shipping policy and Google's shipping details state the zones once a shop uses them,
// never the single floor numbers checkout no longer charges. Public prices only. Pure.
// =============================================================================

export type PublicZone = { name: string; charge: number; freeAbove: number | null; daysMin: number; daysMax: number; codOn: boolean; codCharge: number; codMax: number | null }

/** The fastest and slowest zone's days (the product page's "delivery in a–b days"). */
export function zoneDays(zones: readonly PublicZone[]): [number, number] {
  return [Math.min(...zones.map((z) => z.daysMin)), Math.max(...zones.map((z) => z.daysMax))]
}

/** The lowest delivery charge any zone asks (Google's "from"). */
export const lowestCharge = (zones: readonly PublicZone[]) => Math.min(...zones.map((z) => z.charge))
