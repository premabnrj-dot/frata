import { NextResponse, type NextRequest } from 'next/server'
import { surfaceFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST } from '@/lib/public-env'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * One deployment, two surfaces. The console host serves /console, /login and
 * the API; every other host is a merchant's storefront and is rewritten to
 * /s/<host>/…, where the tenant is looked up by host on the server.
 */
export async function middleware(request: NextRequest) {
  const surface = surfaceFor(request.headers.get('host'), CONSOLE_HOST)
  const { pathname } = request.nextUrl

  if (surface.kind === 'storefront') {
    if (pathname.startsWith('/api/')) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = `/s/${surface.host}${pathname === '/' ? '' : pathname}`
    return NextResponse.rewrite(url)
  }

  // A storefront path must never be reachable from the console host.
  if (pathname.startsWith('/s/') && surface.kind === 'console') {
    return new NextResponse(null, { status: 404 })
  }
  return updateSession(request, NextResponse.next({ request }))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico)$).*)'],
}
