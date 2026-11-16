import 'server-only'
import { routeFor, shopHostParam, surfaceFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST, SHOP_DOMAIN, API_HOST, EKCODE_HOST } from '@/lib/public-env'
import { shopIdForHost } from '@/lib/queries/storefront'
import { FETCH_SITE_MODE, fetchMode, fetchSiteAction, fetchSiteVerdict, logOnce, logPath } from '@/lib/auth/fetch-site'

// =============================================================================
// FILE: src/lib/auth/require-shop.ts
//
// THE SHOP A SHOPPER'S REQUEST IS FOR — from the Host header only, never a
// path, body or param (ADR-0002). For /api/shop/* route handlers on a shop's
// address (the host rewrite leaves /api alone). Refuses the console host,
// vercel.app and local hosts, malformed hosts, unknown shops, a request another
// site sent (Sec-Fetch-Site, ./fetch-site.ts: logged, then refused once
// FETCH_SITE_MODE is 'enforce'), and a POST whose Origin is not this shop. Whether the shop is OPEN is checked by the caller
// inside its transaction (not this 60 s cached lookup).
// =============================================================================

export type Shop = { ok: true; tenantId: string; host: string } | { ok: false; status: 403 | 404; error: string }

export async function requireShop(request: Request): Promise<Shop> {
  const raw = request.headers.get('host')
  // EkCode's host is never a shop (security H1): surfaceFor knows it, so /api/shop/* there is refused here.
  const surface = surfaceFor(raw, CONSOLE_HOST, EKCODE_HOST, API_HOST)
  if (surface.kind !== 'storefront' || routeFor(raw, '/api', CONSOLE_HOST, false, SHOP_DOMAIN, EKCODE_HOST, API_HOST).kind !== 'shop' || !shopHostParam(surface.host)) return { ok: false, status: 404, error: 'Not found' }
  const path = new URL(request.url).pathname
  const site = fetchSiteAction(fetchSiteVerdict(request.headers.get('sec-fetch-site'), request.method, path), FETCH_SITE_MODE)
  if (site.act === 'refuse') return { ok: false, status: 403, error: 'Not allowed' }
  // No host, IP, cookie or query: which kind of request a week of logs would have refused, nothing about who. Every
  // part is from a fixed set or a route path, so a page cycling junk headers cannot make new lines.
  if (site.act === 'log' && logOnce(`${site.site} ${request.method.slice(0, 10)} ${logPath(path)}`, Date.now())) {
    console.warn('[fetch-site] would refuse', site.site, request.method.slice(0, 10), logPath(path), fetchMode(request.headers.get('sec-fetch-mode')))
  }
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin')
    let ok = false
    try { ok = !!origin && new URL(origin).hostname === surface.host } catch { ok = false }
    if (!ok) return { ok: false, status: 403, error: 'Not allowed' }
  }
  const tenantId = await shopIdForHost(surface.host)
  return tenantId ? { ok: true, tenantId, host: surface.host } : { ok: false, status: 404, error: 'Not found' }
}
