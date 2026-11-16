// =============================================================================
// FILE: src/domains/storefront-api/admin-view.ts — FRRATA ADMIN › STOREFRONT API, the page's rules (SA1b D·8). Pure.
//
// The waiting task: an open store whose own website hasn't read the API since the day before yesterday (India), so its
// site likely shows nothing and its Frrata pages send shoppers there. It leads the page and its rows sort first.
// Counts and dates only: Admin never sees a key, its name or its hash (ADR-0018 § 3).
// =============================================================================

import { API_VERSIONS } from './versions'

export type ApiShopRow = {
  tenantId: string; name: string; slug: string; siteHost: string | null; mainHost: string | null
  published: boolean; openedAt: Date | null; liveKeys: number; testKeys: number
  /** The last day (India) any of its keys read, `YYYY-MM-DD`, or null. */
  lastRead: string | null; lastVersion: string | null; partner: string | null
}
export type ApiShopState = 'no_reads' | 'not_open' | 'reading'

/** `today`: India's day, `YYYY-MM-DD`. No reads = open, a website elsewhere, and nothing read today or yesterday. */
export function apiShopState(r: ApiShopRow, today: string): ApiShopState {
  if (!r.published) return 'not_open'
  if (!r.siteHost) return 'reading'
  return r.lastRead !== null && r.lastRead >= dayBefore(today) ? 'reading' : 'no_reads'
}

const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/** The list's order: waiting first, then by name. */
export const sortApiShops = (rows: readonly ApiShopRow[], today: string) =>
  [...rows].sort((a, b) => Number(apiShopState(b, today) === 'no_reads') - Number(apiShopState(a, today) === 'no_reads') || a.name.localeCompare(b.name))

/** Versions: each released one with the stores that read it in the last 7 days (India). */
export function versionRows(rows: readonly ApiShopRow[], today: string): { version: string; stores: number }[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10)
  return API_VERSIONS.map((v) => ({ version: v, stores: rows.filter((r) => r.lastVersion === v && r.lastRead !== null && r.lastRead >= from).length }))
}

/** When each version was released (the date its contract froze). */
export const VERSION_RELEASED: Record<(typeof API_VERSIONS)[number], string> = { '2026-12': '2026-11-15' }

export const ADMIN_PAGE_SIZE = 50
