import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// ENTRY POINT credential: the one-time code Supabase issued in the email link.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL('/console', url.origin))
    console.error('[auth/callback]', error)
  }
  return NextResponse.redirect(new URL('/login', url.origin))
}
