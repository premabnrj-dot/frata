import { NextResponse } from 'next/server'
import { destinationAfterSignIn } from '@/lib/auth/after-sign-in'
import { createServerSupabase } from '@/lib/supabase/server'

// ENTRY POINT credential: the one-time code Supabase issued in the email link.
// A link opened in another browser or app cannot be exchanged here (the code
// verifier lives in the browser that asked), so it lands on the code entry —
// the same email carries a 6-digit code — never silently on a blank sign-in.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) return NextResponse.redirect(new URL(await destinationAfterSignIn(data.user.id), url.origin))
    console.error('[auth/callback]', error?.message)
  }
  return NextResponse.redirect(new URL('/login?link=other-browser', url.origin))
}
