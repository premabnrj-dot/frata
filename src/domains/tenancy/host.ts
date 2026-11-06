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
