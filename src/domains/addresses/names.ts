// =============================================================================
// FILE: src/domains/addresses/names.ts
//
// A SHOP'S NAMES (shop addresses D·1, spec docs/specs/2026-11-08-shop-addresses.md). The database enforces the rules
// (drizzle/0065 app_change_shop_address); this is the same count for the screen, held to the SQL by a parity test.
// Free before the shop's first opening; two renames after it, counted from that first opening (a close doesn't reset
// it). A name Frrata retired doesn't count. Pure.
// =============================================================================

export const RENAMES_AFTER_OPENING = 2

export type NameRow = { name: string; retiredAt: Date | null; retiredByFrrata: boolean }

/** Renames left: null while the shop has never opened (unlimited then), else 0–2. */
export function renamesLeft(firstOpenedAt: Date | null, names: readonly NameRow[]): number | null {
  if (!firstOpenedAt) return null
  const used = names.filter((n) => n.retiredAt && !n.retiredByFrrata && n.retiredAt.getTime() >= firstOpenedAt.getTime()).length
  return Math.max(0, RENAMES_AFTER_OPENING - used)
}

/** The shop's old names that still lead to it (retired by the shop, not by Frrata), newest first. */
export const oldNames = (names: readonly NameRow[]) =>
  names.filter((n) => n.retiredAt && !n.retiredByFrrata).sort((a, b) => b.retiredAt!.getTime() - a.retiredAt!.getTime()).map((n) => n.name)
