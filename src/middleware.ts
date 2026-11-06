import { NextResponse, type NextRequest } from 'next/server'
import { routeFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST } from '@/lib/public-env'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * One deployment, two surfaces. The console host serves /console, /login and
 * the API; every other host is a merchant's storefront and is rewritten to
 * /s/<host>/… by next.config (shopRewrites), where the tenant is looked up by
 * host on the server. Here: /s/ is refused on every other host, and a malformed
 * shop host is refused (routeFor decides).
 */
export async function middleware(request: NextRequest) {
  const route = routeFor(request.headers.get('host'), request.nextUrl.pathname, CONSOLE_HOST, process.env.NODE_ENV === 'development')
  if (route.kind === 'not_found') return new NextResponse(null, { status: 404 })
  // A shop: the host rewrite in next.config (shopRewrites) serves it from /s/<host>/…; no session work here.
  if (route.kind === 'shop') return NextResponse.next()
  return updateSession(request, NextResponse.next({ request }))
}

// Image-looking paths are NOT skipped (tenancy audit 2026-11-07): /s/<other>/x.png must meet routeFor too.
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
