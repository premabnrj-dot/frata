import { NextResponse } from 'next/server'
import { routeAfterSignIn } from '@/domains/access/route-after-sign-in'
import { accessFor, claimInvites } from '@/lib/db/platform'
import { createServerSupabase } from '@/lib/supabase/server'

// ENTRY POINT credential: the one-time code Supabase issued in the email link.
// After sign-in: claim this user's invites (confirmed email only, in SQL), then
// go where routeAfterSignIn says — Admin, the console, or a choice of both.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      try {
        await claimInvites(data.user.id)
        const access = await accessFor(data.user.id)
        const to = routeAfterSignIn({ isStaff: access.staffRole !== null, storeCount: access.memberships.length })
        return NextResponse.redirect(new URL(to, url.origin))
      } catch (err) {
        console.error('[auth/callback] after sign-in', err)
        return NextResponse.redirect(new URL('/console', url.origin))
      }
    }
    console.error('[auth/callback]', error)
  }
  return NextResponse.redirect(new URL('/login', url.origin))
}
