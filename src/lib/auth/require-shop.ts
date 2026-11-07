import 'server-only'
import { routeFor, shopHostParam, surfaceFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST } from '@/lib/public-env'
import { shopIdForHost } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/lib/auth/require-shop.ts
//
// THE SHOP A SHOPPER'S REQUEST IS FOR — from the Host header only, never a
// path, body or param (ADR-0002). For /api/shop/* route handlers on a shop's
// address (the host rewrite leaves /api alone). Refuses the console host,
// vercel.app and local hosts, malformed hosts, unknown shops, and a POST whose
// Origin is not this shop. Whether the shop is OPEN is checked by the caller
// inside its transaction (not this 60 s cached lookup).
// =============================================================================

export type Shop = { ok: true; tenantId: string; host: string } | { ok: false; status: 403 | 404; error: string }

export async function requireShop(request: Request): Promise<Shop> {
  const raw = request.headers.get('host')
  const surface = surfaceFor(raw, CONSOLE_HOST)
  if (surface.kind !== 'storefront' || routeFor(raw, '/api', CONSOLE_HOST, false).kind !== 'shop' || !shopHostParam(surface.host)) return { ok: false, status: 404, error: 'Not found' }
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin')
    let ok = false
    try { ok = !!origin && new URL(origin).hostname === surface.host } catch { ok = false }
    if (!ok) return { ok: false, status: 403, error: 'Not allowed' }
  }
  const tenantId = await shopIdForHost(surface.host)
  return tenantId ? { ok: true, tenantId, host: surface.host } : { ok: false, status: 404, error: 'Not found' }
}
