import 'server-only'
import { sql } from 'drizzle-orm'
import { parseRate } from '@/domains/studio/credits'
import { ADMIN_ONLY, confirmedRecently, type StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { errName } from '@/lib/log'
import { auditStaff } from './audit'

// =============================================================================
// FILE: src/lib/admin/fx-rate.ts — THE DAY'S USD/INR RATE FOR STUDIO CREDITS (C1; owner 2026-11-22, 6; orchestrator
// 2026-11-22). For now the ONLY source is a rate Frrata staff type here: FBIL's reference rate is licence- and fee-bound
// for pricing products, so no feed is fetched. Admin only, a passkey check in the last 5 minutes (it prices every turn),
// and an audit row in the same transaction as the write (app_fx_rate_set, frata_admin only). The door refuses a turn
// when the latest rate is older than RATE_MAX_AGE_DAYS (src/domains/studio/credits.ts). Admin's screen for it comes with
// A1a (Admin credits); until then it is called from an Admin action only.
// =============================================================================

export type RateSet = { ok: true } | { ok: false; error: 'not_admin' | 'confirm_first' | 'bad_input' | 'unknown' }

/** Sets a day's rate from what staff typed ("94.1997" rupees to the dollar). */
export async function setFxRate(staff: StaffOk, day: string, typed: string): Promise<RateSet> {
  if (!(ADMIN_ONLY as readonly string[]).includes(staff.role)) return { ok: false, error: 'not_admin' }
  if (!confirmedRecently(staff)) return { ok: false, error: 'confirm_first' }
  const rate = parseRate(typed)
  if (rate === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'bad_input' }
  try {
    await adminDb().transaction(async (tx) => {
      await tx.execute(sql`select app_fx_rate_set(${day}::date, ${rate})`)
      await auditStaff(tx, staff, { action: 'credits.rate.set', target: day, detail: { rateE4: rate } })
    })
    return { ok: true }
  } catch (e) {
    const msg = (e as { cause?: { message?: string } })?.cause?.message ?? ''
    if (msg === 'bad_input') return { ok: false, error: 'bad_input' }
    console.error('[fx-rate] set', errName(e))
    return { ok: false, error: 'unknown' }
  }
}
