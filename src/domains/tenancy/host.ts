// =============================================================================
// FILE: src/domains/tenancy/host.ts
//
// WHICH SURFACE A REQUEST IS FOR, from its Host header alone. One function, so
// the middleware and every test agree on what is the console and what is a
// shop. A storefront is either a platform subdomain (`snitchy.frata.store`) or
// a merchant's own domain (`shop.brand.in`); the tenant row is looked up by
// that host on the server, never taken from a path, a query or a body.
// =============================================================================

export type Surface =
  | { kind: 'console' }
  /** EkCode's own host (ekcode.in, and its www): never a shop, never the console (EkCode P1 task 6). */
  | { kind: 'ekcode'; www: boolean }
  | { kind: 'storefront'; host: string }
  | { kind: 'local' }

export function surfaceFor(rawHost: string | null, consoleHost: string, ekcodeHost = ''): Surface {
  const host = (rawHost ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host === '127.0.0.1') return { kind: 'local' }
  const ek = ekcodeHost.toLowerCase()
  if (ek && (host === ek || host === `www.${ek}`)) return { kind: 'ekcode', www: host !== ek }
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
  /** EkCode's host: only its own pages and API; `www.` goes to the apex. */
  | { kind: 'ekcode' }
  | { kind: 'ekcode_www' }

/**
 * What the middleware does with one request (storefront spec § Review findings).
 * A shop host passes on to the host rewrite in next.config (shopRewrites below),
 * which prefixes every path with /s/<host> — so `/s/other/…` on a shop becomes
 * `/s/this/s/other/…`, which matches no page. `/s/…` is internal: on every host
 * that is not a shop it is a 404, `localhost` included, except under `next dev`.
 */
export function routeFor(rawHost: string | null, pathname: string, consoleHost: string, dev: boolean, shopDomain: string, ekcodeHost = ''): Route {
  const surface = surfaceFor(rawHost, consoleHost, ekcodeHost)
  if (surface.kind === 'ekcode') {
    if (surface.www) return { kind: 'ekcode_www' }
    return EKCODE_PATHS.has(pathname) || pathname.startsWith('/api/ek/') || pathname.startsWith('/_next/') ? { kind: 'ekcode' } : { kind: 'not_found' }
  }
  // EkCode's pages and API answer on its host only (security H1): never on a shop, the console or a preview alias.
  if (pathname === '/ek' || pathname.startsWith('/ek/') || pathname === '/api/ek' || pathname.startsWith('/api/ek/')) return { kind: 'not_found' }
  if (surface.kind === 'storefront' && surface.host === shopDomain.toLowerCase()) return { kind: 'platform_apex' }
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
 * files (favicon.ico) and /api, /_next are left alone.
 */
export function shopRewrites(consoleHost: string, ekcodeHost = ''): Rewrite[] {
  const has = [{ type: 'host' as const, value: '(?<shop>[a-z0-9][a-z0-9.-]*)' }]
  const ek = ekcodeHost.toLowerCase()
  const ekAlt = ek ? `|${esc(ek)}|www\\.${esc(ek)}` : ''
  const missing = [{ type: 'host' as const, value: `(?:${esc(consoleHost.toLowerCase())}|localhost|127\\.0\\.0\\.1|.+\\.vercel\\.app${ekAlt})` }]
  // EkCode's host first: its pages live under /ek (src/app/ek), reached only through this rewrite.
  const ekHas = [{ type: 'host' as const, value: esc(ek) }]
  const ekRules: Rewrite[] = ek ? [
    { source: '/:page(privacy|terms|contact|continue)', destination: '/ek/:page', has: ekHas, missing: [] },
    { source: '/', destination: '/ek', has: ekHas, missing: [] },
  ] : []
  return [...ekRules,
    { source: '/:first((?!(?:api|_next)(?:/|$))(?![^/]+\\.(?:ico|png|svg|webp|jpe?g|gif)$)[^/]+)/:rest*', destination: '/s/:shop/:first/:rest*', has, missing },
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
