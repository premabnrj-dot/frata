import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseFetch } from '@/lib/http/timeout'
import { sessionCookieOptions } from '@/lib/security-headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from '@/lib/public-env'

/**
 * Refreshes the auth cookie and bounces a signed-out visit to /console, /admin, /choose, /partner or /handover.
 *
 * ⚠️ getClaims() (verifies the JWT's signature, locally against the project's
 * published keys, or by asking the auth server for a symmetric key) or
 * getUser(); never getSession(): it trusts the cookie, so a forged one passes.
 * Here the answer only decides the redirect; requireMember asks getUser() again.
 *
 * The redirect lives here, not in a layout: redirecting from a layout during
 * render breaks the App Router ("invariant expected layout router to be mounted").
 * Whether the user may see a TENANT is a database question requireMember answers.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isAuthConfigured()) return response

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: supabaseFetch() },
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // One network call less per console request (speed review P7): getClaims also refreshes an expired session.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims?.sub ? data.claims : null
  const path = request.nextUrl.pathname
  const guarded = ['/console', '/admin', '/choose', '/partner', '/handover', '/join'].some((r) => path === r || path.startsWith(`${r}/`))
  if (!user && guarded) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}
