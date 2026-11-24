'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/components/ui/action-form'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { istDayKey } from '@/domains/time/day'
import { dayMonthIN } from '@/lib/format-date'
import { setFxRate } from '@/lib/admin/fx-rate'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'

// =============================================================================
// FILE: src/app/(admin)/admin/rate/actions.ts — Admin › Money › Dollar rate's one action (V3b K2; mockup
// docs/mockups/2026-11-24-v3b-first.html § 1, approved 2026-11-24). Master admin only; setFxRate checks again, asks for
// a passkey check in the last 5 minutes and writes the rate and its Activity row in one transaction. Always today's
// India day: a rate for another day is never typed here.
// =============================================================================

const RATE_FORMAT = 'Type rupees with up to 4 decimals, like 94.1997.'

export async function setRateAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const typed = form.get('rate')
  if (typeof typed !== 'string' || typed.length > 12) return { fields: { rate: RATE_FORMAT } }
  const today = istDayKey(new Date())
  const r = await setFxRate(staff, today, typed)
  if (!r.ok) {
    if (r.error === 'bad_input') return { fields: { rate: RATE_FORMAT } }
    if (r.error === 'confirm_first') return { error: STAFF_CONFIRM_FIRST }
    if (r.error === 'not_admin') return { error: 'Only a master admin can enter the dollar rate.' }
    return { error: 'We couldn’t save that. Nothing was changed.' }
  }
  revalidatePath('/admin', 'layout')
  return { ok: `Rate saved for ${dayMonthIN(new Date(`${today}T12:00:00+05:30`))}.` }
}
