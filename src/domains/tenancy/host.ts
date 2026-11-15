// =============================================================================
// FILE: src/domains/tenancy/host.ts
//
// WHICH SURFACE A REQUEST IS FOR, from its Host header alone. One function, so
// the middleware and every test agree on what is the console and what is a
// shop. A storefront is either a platform subdomain (`snitchy.frata.store`) or
// a merchant's own domain (`shop.brand.in`); the tenant row is looked up by
// that host on the server, never taken from a path, a query or a body.
// The Storefront API has a host of its own (api.frrata.shop, ADR-0018): there the shop comes from a key in the path,
// resolved only inside apiRequest (src/lib/storefront-api/request.ts), never from the host.
// =============================================================================

import { API_VERSIONS, isVersionPath } from '../storefront-api/versions'

export type Surface =
  | { kind: 'console' }
  /** EkCode's own host (ekcode.in, and its www): never a shop, never the console (EkCode P1 task 6). */
  | { kind: 'ekcode'; www: boolean }
  | { kind: 'storefront'; host: string }
  | { kind: 'local' }
  /** The Storefront API's host (api.frrata.shop): never a shop, never the console (ADR-0018). */
  | { kind: 'api' }

export function surfaceFor(rawHost: string | null, consoleHost: string, ekcodeHost = '', apiHost = ''): Surface {
  const host = (rawHost ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host === '127.0.0.1') return { kind: 'local' }
  const ek = ekcodeHost.toLowerCase()
  if (ek && (host === ek || host === `www.${ek}`)) return { kind: 'ekcode', www: host !== ek }
  const api = apiHost.toLowerCase()
  if (api && host === api) return { kind: 'api' }
  if (host === consoleHost.toLowerCase()) return { kind: 'console' }
  // Vercel preview and production aliases serve the console.
  if (host.endsWith('.vercel.app')) return { kind: 'console' }
  return { kind: 'storefront', host }
}

/**
 * A platform address is <slug>.<shop domain>. Returns the slug, or null for
 * any other host (a merchant's own domain is looked up as a whole host).
 * Only ONE label is a slug: "a.b.frata.store" is not a shop.
 */
export function shopSlugFromHost(host: string, shopDomain: string): string | null {
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  const suffix = '.' + shopDomain.toLowerCase()
  if (!h.endsWith(suffix)) return null
  const slug = h.slice(0, -suffix.length)
  return slug && !slug.includes('.') ? slug : null
}

/** A shop's platform address from its name: the ONE way it is built (`shopSlugFromHost` reads it back). */
export const platformHost = (slug: string, shopDomain: string) => `${slug}.${shopDomain.toLowerCase()}`

/** What a host may be made of; anything else (a slash, `..`) is refused before it can shape a path. */
const HOST_CHARS = /^[a-z0-9.-]+$/

export type Route =
  | { kind: 'not_found' }
  | { kind: 'shop' }
  | { kind: 'console' }
  /** The shop domain itself (`frrata.shop`): no shop lives there; it sends people to Frrata's own site. */
  | { kind: 'platform_apex' }
  /** The shop domain's own stopgap site (owner, 2026-11-15): `PLATFORM_SITE_PATHS` only, served directly, until
   *  frrata.com is attached and `platform_apex` goes back to redirecting every path. */
  | { kind: 'platform_site' }
  /** EkCode's host: only its own pages and API; `www.` goes to the apex. */
  | { kind: 'ekcode' }
  | { kind: 'ekcode_www' }
  /** A versioned path on the API host: next.config's apiRewrites serve it from /api/storefront/<version>/… */
  | { kind: 'api' }

/** The one path, besides the home page, the bare shop domain answers itself while it stands in for frrata.com. */
export const PLATFORM_SITE_PATHS = new Set(['/', '/privacy-policy'])

/**
 * What the middleware does with one request (storefront spec § Review findings).
 * A shop host passes on to the host rewrite in next.config (shopRewrites below),
 * which prefixes every path with /s/<host> — so `/s/other/…` on a shop becomes
 * `/s/this/s/other/…`, which matches no page. `/s/…` is internal: on every host
 * that is not a shop it is a 404, `localhost` included, except under `next dev`.
 */
export function routeFor(rawHost: string | null, pathname: string, consoleHost: string, dev: boolean, shopDomain: string, ekcodeHost = '', apiHost = ''): Route {
  const surface = surfaceFor(rawHost, consoleHost, ekcodeHost, apiHost)
  // The API host answers its versioned paths only (the middleware never sees them: its matcher skips them).
  if (surface.kind === 'api') return isVersionPath(pathname) ? { kind: 'api' } : { kind: 'not_found' }
  // The API's handlers answer through the API host's rewrite only (spec § 1, security H4): never on a shop, the console
  // or a preview alias.
  if (pathname === '/api/storefront' || pathname.startsWith('/api/storefront/')) return { kind: 'not_found' }
  if (surface.kind === 'ekcode') {
    if (surface.www) return { kind: 'ekcode_www' }
    return EKCODE_PATHS.has(pathname) || pathname.startsWith('/api/ek/') || pathname.startsWith('/_next/') ? { kind: 'ekcode' } : { kind: 'not_found' }
  }
  // EkCode's pages and API answer on its host only (security H1): never on a shop, the console or a preview alias.
  if (pathname === '/ek' || pathname.startsWith('/ek/') || pathname === '/api/ek' || pathname.startsWith('/api/ek/')) return { kind: 'not_found' }
  if (surface.kind === 'storefront' && surface.host === shopDomain.toLowerCase()) return PLATFORM_SITE_PATHS.has(pathname) ? { kind: 'platform_site' } : { kind: 'platform_apex' }
  if (surface.kind === 'storefront') return HOST_CHARS.test(surface.host) ? { kind: 'shop' } : { kind: 'not_found' }
  if (pathname === '/s' || pathname.startsWith('/s/')) return surface.kind === 'local' && dev ? { kind: 'console' } : { kind: 'not_found' }
  return { kind: 'console' }
}

/** Every path EkCode's host serves (besides /api/ek/* and Next's own /_next/*). */
export const EKCODE_PATHS = new Set(['/', '/privacy', '/terms', '/contact', '/continue'])

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
type Rewrite = { source: string; destination: string; has: { type: 'host'; value: string }[]; missing: { type: 'host'; value: string }[] }

/**
 * The shop rewrite, as next.config `beforeFiles` rewrites: a host that is not the
 * console, a vercel.app alias or local is a shop, served from /s/<host>/…. Done
 * by the router, not the middleware, because Next only caches a page per path
 * when the URL it matches is the rewritten one (a middleware rewrite left every
 * shop page rendering per request under next start; 2026-11-07). Root-level
 * files (favicon.ico), the visit beacon /fe.js (by that exact name: A·2) and /api, /_next are left alone.
 *
 * The bare shop domain is left out too (owner, 2026-11-15, stopgap): `PLATFORM_SITE_PATHS` must reach the normal
 * page tree unrewritten to serve Frrata's own site there; routeFor still sends every other path on it to the
 * console host, so excluding the whole host here changes nothing for those.
 */
export function shopRewrites(consoleHost: string, shopDomain = '', ekcodeHost = '', apiHost = ''): Rewrite[] {
  const has = [{ type: 'host' as const, value: '(?<shop>[a-z0-9][a-z0-9.-]*)' }]
  const ek = ekcodeHost.toLowerCase()
  const ekAlt = ek ? `|${esc(ek)}|www\\.${esc(ek)}` : ''
  const shopAlt = shopDomain ? `|${esc(shopDomain.toLowerCase())}` : ''
  // The Storefront API's host is never a shop (ADR-0018): apiRewrites serve it.
  const apiAlt = apiHost ? `|${esc(apiHost.toLowerCase())}` : ''
  const missing = [{ type: 'host' as const, value: `(?:${esc(consoleHost.toLowerCase())}|localhost|127\\.0\\.0\\.1|.+\\.vercel\\.app${ekAlt}${shopAlt}${apiAlt})` }]
  // EkCode's host first: its pages live under /ek (src/app/ek), reached only through this rewrite.
  const ekHas = [{ type: 'host' as const, value: esc(ek) }]
  const ekRules: Rewrite[] = ek ? [
    { source: '/:page(privacy|terms|contact|continue)', destination: '/ek/:page', has: ekHas, missing: [] },
    { source: '/', destination: '/ek', has: ekHas, missing: [] },
  ] : []
  return [...ekRules,
    { source: '/:first((?!(?:api|_next)(?:/|$))(?![^/]+\\.(?:ico|png|svg|webp|jpe?g|gif)$)(?!fe\\.js$)[^/]+)/:rest*', destination: '/s/:shop/:first/:rest*', has, missing },
    // Last: rules run in order on the rewritten path, so a root rule first would see its own /s/<host> again.
    { source: '/', destination: '/s/:shop', has, missing },
  ]
}

/** A `[host]` route param, accepted only in the exact form the middleware writes it; anything else is null (404). */
export function shopHostParam(param: string): string | null {
  let h: string
  try { h = decodeURIComponent(param) } catch { return null }
  const s = surfaceFor(h, '\u0000')
  return s.kind === 'storefront' && s.host === h && /^[a-z0-9.-]{1,253}$/.test(h) ? h : null
}

/** A key's characters after its kind: 32 random base62 and a 6-character checksum (src/domains/storefront-api/keys.ts). */
export const KEY_BODY = '[0-9A-Za-z]{38}'

/**
 * The API host's rewrites (ADR-0018; plan docs/plans/2026-11-15-v1-storefront-api.md § SA0·1), first in `beforeFiles`.
 * Done by the router, never the middleware: a middleware rewrite leaves a route uncached (frata-gotchas), and the
 * middleware's matcher skips versioned paths, so a CDN hit costs no middleware run. A test key goes to its own tree
 * (`t/`, dynamic: drafts, CORS to the shop's site, never cached); every other key-shaped path to the cached tree (`k/`).
 * `openapi.json` has no key. Anything else on the API host matches no route: 404.
 */
export function apiRewrites(apiHost: string): Rewrite[] {
  const api = apiHost.toLowerCase()
  if (!api) return []
  const has = [{ type: 'host' as const, value: esc(api) }]
  return API_VERSIONS.flatMap((v) => [
    { source: `/${v}/k/:key(frs_test_${KEY_BODY})/:rest*`, destination: `/api/storefront/${v}/t/:key/:rest*`, has, missing: [] },
    { source: `/${v}/k/:key(frs_pub_${KEY_BODY})/:rest*`, destination: `/api/storefront/${v}/k/:key/:rest*`, has, missing: [] },
    { source: `/${v}/openapi.json`, destination: `/api/storefront/${v}/openapi.json`, has, missing: [] },
  ])
}
