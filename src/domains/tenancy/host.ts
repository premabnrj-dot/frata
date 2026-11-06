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
  | { kind: 'storefront'; host: string }
  | { kind: 'local' }

export function surfaceFor(rawHost: string | null, consoleHost: string): Surface {
  const host = (rawHost ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host === '127.0.0.1') return { kind: 'local' }
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

/** Paths a shop host serves straight from public/ (its favicon, a robots image), never rewritten. */
const ASSET = /\.(?:png|jpe?g|webp|avif|svg|ico|gif|woff2?)$/i

export type Route =
  | { kind: 'not_found' }
  | { kind: 'rewrite'; path: string }
  | { kind: 'pass' }
  | { kind: 'console' }

/**
 * What the middleware does with one request (storefront spec § Review findings).
 * `/s/…` is internal: only the rewrite below may reach it, so on every host
 * that is not a shop it is a 404 — `localhost` included, except under `next dev`.
 * On a shop host every path is prefixed, so `/s/other/…` becomes
 * `/s/this/s/other/…`, which matches no page.
 */
export function routeFor(rawHost: string | null, pathname: string, consoleHost: string, dev: boolean): Route {
  const surface = surfaceFor(rawHost, consoleHost)
  if (surface.kind === 'storefront') {
    if (pathname.startsWith('/api/')) return { kind: 'pass' }
    if (ASSET.test(pathname) && !pathname.startsWith('/s/')) return { kind: 'pass' }
    return { kind: 'rewrite', path: `/s/${surface.host}${pathname === '/' ? '' : pathname}` }
  }
  if (pathname === '/s' || pathname.startsWith('/s/')) return surface.kind === 'local' && dev ? { kind: 'console' } : { kind: 'not_found' }
  return { kind: 'console' }
}

/** A `[host]` route param, accepted only in the exact form the middleware writes it; anything else is null (404). */
export function shopHostParam(param: string): string | null {
  let h: string
  try { h = decodeURIComponent(param) } catch { return null }
  const s = surfaceFor(h, '\u0000')
  return s.kind === 'storefront' && s.host === h && /^[a-z0-9.-]{1,253}$/.test(h) ? h : null
}
