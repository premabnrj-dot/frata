import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseFetch } from '@/lib/http/timeout'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from '@/lib/public-env'

/**
 * Refreshes the auth cookie and bounces a signed-out visit to /console.
 *
 * ⚠️ getUser(), never getSession(): getSession() trusts the cookie without
 * asking the auth server, so a forged cookie passes.
 *
 * The redirect lives here, not in a layout: redirecting from a layout during
 * render breaks the App Router ("invariant expected layout router to be mounted").
 * Whether the user may see a TENANT is a database question requireMember answers.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isAuthConfigured()) return response

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: supabaseFetch() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  if (!user && (path === '/console' || path.startsWith('/console/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}
