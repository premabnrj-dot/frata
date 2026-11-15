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

/**
 * Where a store page sends a shopper when the brand's own website runs elsewhere (Storefront API SA1b, plan D·2; owner
 * 2026-11-15: in the browser, so the link's tags survive, and only once the store is open). Only the pages the site
 * has: home, a product, a collection; the bag, checkout, the bag link, orders, policies and pages stay. Null = stay.
 * SELF-CONTAINED on purpose (no import, no outer name, plain ES2017): its own source text is the shop head's inline
 * script (`siteMoveScript`), so the server's script and the browser's soft-navigation check are one rule.
 * No move when this host is the site itself or its www/apex twin (while the site's DNS still points at Frrata the
 * store serves that host, which would reload forever: architecture review 1). The target is built from the origin
 * and re-checked to stay on it (no open redirect).
 */
export function siteMove(origin: string, loc: { host: string; pathname: string; search: string; hash: string }): string | null {
  var path = '/' + String(loc.pathname).replace(/^[\/\\]+/, '')
  if (!/^\/(?:(?:products|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?)?$/.test(path)) return null
  var u: URL
  try { u = new URL(origin) } catch (e) { return null }
  if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.port || u.username) return null
  var bare = function (h: string) { return String(h).toLowerCase().replace(/^www\./, '') }
  if (bare(u.hostname) === bare(String(loc.host).split(':')[0] || '')) return null
  var t = new URL(path + loc.search + loc.hash, u.origin)
  return t.origin === u.origin ? t.href : null
}

/** How long a tab refuses a second move (the one-hop guard: architecture review 1). */
export const SITE_MOVE_GUARD_MS = 10_000

/** The shop head's inline script for `origin` (runs before the page paints, so the theme page never shows and the
 *  visit beacon is told not to count: `window.__fe`). */
export function siteMoveScript(origin: string): string {
  // Soft navigations too (a layout's effect never runs again: architecture review 3), with no client bundle: the
  // script re-checks after the router's pushState and on Back (speed: an island cost every shop page 0.4 kB).
  return `(function(){var m=function(){try{var to=(${siteMove.toString()})(${JSON.stringify(origin).replace(/</g, "\\u003c")},location);if(!to)return;var k='frrata.move',n=Date.now(),l=+(sessionStorage.getItem(k)||0);if(n-l<${SITE_MOVE_GUARD_MS})return;sessionStorage.setItem(k,String(n));window.__fe=1;location.replace(to)}catch(e){}};m();try{var p=history.pushState;history.pushState=function(){var r=p.apply(this,arguments);m();return r};addEventListener('popstate',m)}catch(e){}})()` // clock-ok: the browser's one-hop guard, a string never rendered
}

/** The shop's old names that still lead to it (retired by the shop, not by Frrata), newest first. */
export const oldNames = (names: readonly NameRow[]) =>
  names.filter((n) => n.retiredAt && !n.retiredByFrrata).sort((a, b) => b.retiredAt!.getTime() - a.retiredAt!.getTime()).map((n) => n.name)

/**
 * The ONE main address (D2·9): the shop's main own domain when it has one, else its frrata name. Canonical, Open Graph,
 * structured data, sitemap, robots, share cards, Make a link and Copy link all read it (through coreShop / setupFor).
 */
export const mainAddress = (nameHost: string, mainDomain: string | null): string => mainDomain ?? nameHost
