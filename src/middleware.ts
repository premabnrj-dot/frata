import { NextResponse, type NextRequest } from 'next/server'
import { routeFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST, EKCODE_HOST, SHOP_DOMAIN } from '@/lib/public-env'
import { updateSession } from '@/lib/supabase/middleware'
import { ekcodeCsp, isSignedInPath, signedInCsp } from '@/lib/security-headers'

/**
 * One deployment, two surfaces. The console host serves /console, /login and
 * the API; every other host is a merchant's storefront and is rewritten to
 * /s/<host>/… by next.config (shopRewrites), where the tenant is looked up by
 * host on the server. Here: /s/ is refused on every other host, a malformed
 * shop host is refused, and the bare shop domain is sent to Frrata's site
 * (routeFor decides).
 */
export async function middleware(request: NextRequest) {
  const route = routeFor(request.headers.get('host'), request.nextUrl.pathname, CONSOLE_HOST, process.env.NODE_ENV === 'development', SHOP_DOMAIN, EKCODE_HOST)
  if (route.kind === 'not_found') return new NextResponse(null, { status: 404 })
  // EkCode's host (P1 task 6): www goes to the apex; its pages get their own headers here, set by this branch itself (a
  // middleware header replaces next.config's of the same name). No Supabase session work on this host.
  if (route.kind === 'ekcode_www') return NextResponse.redirect(`https://${EKCODE_HOST}${request.nextUrl.pathname}`, 308)
  if (route.kind === 'ekcode') return ekcodeResponse(request)
  // The bare shop domain (frrata.shop) holds no shop: it goes to Frrata's own site (shop addresses spec, D·0). A 307
  // while that site is the stopgap console host: browsers cache a 308 for good. 308 to frrata.com once it is attached.
  if (route.kind === 'platform_apex') return NextResponse.redirect(`https://${CONSOLE_HOST}/`, 307)
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

function ekcodeResponse(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path !== '/continue') {
    const res = NextResponse.next()
    res.headers.set('Referrer-Policy', 'no-referrer')
    return res
  }
  const nonce = btoa(crypto.randomUUID())
  const csp = ekcodeCsp(nonce, process.env.NODE_ENV === 'development')
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers } })
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

// Image-looking paths are NOT skipped (tenancy audit 2026-11-07): /s/<other>/x.png must meet routeFor too.
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
