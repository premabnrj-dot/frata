import { NextResponse, type NextRequest } from 'next/server'
import { routeFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST, SHOP_DOMAIN } from '@/lib/public-env'
import { updateSession } from '@/lib/supabase/middleware'
import { isSignedInPath, signedInCsp } from '@/lib/security-headers'

/**
 * One deployment, two surfaces. The console host serves /console, /login and
 * the API; every other host is a merchant's storefront and is rewritten to
 * /s/<host>/… by next.config (shopRewrites), where the tenant is looked up by
 * host on the server. Here: /s/ is refused on every other host, and a malformed
 * shop host is refused (routeFor decides).
 */
export async function middleware(request: NextRequest) {
  const route = routeFor(request.headers.get('host'), request.nextUrl.pathname, CONSOLE_HOST, process.env.NODE_ENV === 'development', SHOP_DOMAIN)
  if (route.kind === 'not_found') return new NextResponse(null, { status: 404 })
  // The bare shop domain (frrata.shop) holds no shop: it goes to Frrata's own site (shop addresses spec, D·0).
  if (route.kind === 'platform_apex') return NextResponse.redirect(`https://${CONSOLE_HOST}/`, 308)
  // A shop: the host rewrite in next.config (shopRewrites) serves it from /s/<host>/…; no session work here.
  if (route.kind === 'shop') return NextResponse.next()
  if (!isSignedInPath(request.nextUrl.pathname)) return updateSession(request, NextResponse.next({ request }))
  // Signed-in pages: a per-request script nonce (security review S3). Next reads it from the request's CSP header.
  const nonce = btoa(crypto.randomUUID())
  const framed = request.nextUrl.pathname.startsWith('/console/theme-preview/')
  const csp = signedInCsp(nonce, process.env.NODE_ENV === 'development', framed)
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)
  const response = await updateSession(request, NextResponse.next({ request: { headers } }))
  response.headers.set('Content-Security-Policy', csp)
  // Set here too: once the middleware overrides the request's headers, next.config's host-matched entry no longer
  // matches, and the look preview fell to DENY (found by e2e 47-look).
  response.headers.set('X-Frame-Options', framed ? 'SAMEORIGIN' : 'DENY')
  return response
}

// Image-looking paths are NOT skipped (tenancy audit 2026-11-07): /s/<other>/x.png must meet routeFor too.
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
