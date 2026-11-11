import 'server-only'
import { cache } from 'react'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import type { StaffOk } from '@/lib/auth/require-staff'

/**
 * Can Admin reach the database as frata_admin? Asked once per request by the
 * Admin layout, so a refused login (no password set on the role, a wrong one in
 * ADMIN_DATABASE_URL) says what to fix instead of every page failing with a
 * reference number. Never returns the connection string or the driver's text.
 */
export const adminHealth = cache(async (staff: StaffOk): Promise<{ ok: true } | { ok: false; why: 'login_refused' | 'unreachable' }> => {
  void staff
  try {
    // A deadline, so a connection that can't answer says so in 4 s instead of holding the page to Vercel's 60 s.
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('admin database did not answer in 4 s')), 4000) })
    try { await Promise.race([adminDb().execute(sql`select 1`), late]) } finally { clearTimeout(timer) }
    return { ok: true }
  } catch (err) {
    const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : String(err)
    console.error('[adminHealth]', /secret format|password|authentication|EAUTH/i.test(text) ? 'frata_admin login refused' : 'admin database unreachable')
    return { ok: false, why: /secret format|password|authentication|EAUTH/i.test(text) ? 'login_refused' : 'unreachable' }
  }
})
