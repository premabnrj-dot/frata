// =============================================================================
// FILE: src/domains/addresses/names.ts
//
// A SHOP'S NAMES (shop addresses D·1, spec docs/specs/2026-11-08-shop-addresses.md). The database enforces the rules
// (drizzle/0065 app_change_shop_address, which keeps the one count in tenants.renames_used); this turns it into the
// screen's words, held to the SQL by a parity test. Free before the shop's first opening; two renames after it (a
// close doesn't reset it; taking back an old name counts too). Pure.
// =============================================================================

export const RENAMES_AFTER_OPENING = 2

/** What Admin may block (blocked_names.kind): Frrata's own routing words stay in code (RESERVED). */
export const BLOCKED_KINDS = ['protected', 'offensive', 'domain'] as const
export type BlockedKind = (typeof BLOCKED_KINDS)[number]

export type NameRow = { name: string; retiredAt: Date | null; retiredByFrrata: boolean }

/** Renames left: null while the shop has never opened (unlimited then), else 0–2. */
export function renamesLeft(firstOpenedAt: Date | null, renamesUsed: number): number | null {
  return firstOpenedAt ? Math.max(0, RENAMES_AFTER_OPENING - renamesUsed) : null
}

/**
 * Where an old name's page sends the browser: the same path, query and #fragment on the current address. `location`
 * parts come from the browser and the host from our own lookup, so a path like `//evil.com` stays a path on `to`.
 * Order pages stay where their token was issued (security review). Null = stay.
 */
export function movedUrl(to: string, loc: { protocol: string; pathname: string; search: string; hash: string }): string | null {
  if (loc.pathname === '/orders' || loc.pathname.startsWith('/orders/')) return null
  const path = loc.pathname.startsWith('/') ? loc.pathname : `/${loc.pathname}`
  return `${loc.protocol === 'http:' ? 'http:' : 'https:'}//${to}${path.replace(/^\/+/, '/')}${loc.search}${loc.hash}`
}

/** The shop's old names that still lead to it (retired by the shop, not by Frrata), newest first. */
export const oldNames = (names: readonly NameRow[]) =>
  names.filter((n) => n.retiredAt && !n.retiredByFrrata).sort((a, b) => b.retiredAt!.getTime() - a.retiredAt!.getTime()).map((n) => n.name)

/**
 * The ONE main address (D2·9): the shop's main own domain when it has one, else its frrata name. Canonical, Open Graph,
 * structured data, sitemap, robots, share cards, Make a link and Copy link all read it (through coreShop / setupFor).
 */
export const mainAddress = (nameHost: string, mainDomain: string | null): string => mainDomain ?? nameHost
