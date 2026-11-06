import 'server-only'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseFetch } from '@/lib/http/timeout'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/public-env'

/** Supabase is used for AUTH ONLY. Data goes through src/lib/db with the tenant policy. */
export async function createServerSupabase() {
  const store = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: supabaseFetch() },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        // A Server Component cannot set cookies; the middleware refreshes the
        // session on every request, so swallowing here is correct, not lossy.
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          /* called from a Server Component */
        }
      },
    },
  })
}
