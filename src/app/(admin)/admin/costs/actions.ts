'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/components/ui/action-form'
import { FX_RATE_BAND_E4 } from '@/domains/studio/credits'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { istDayKey } from '@/domains/time/day'
import { addCost, editCost, endCost, markPaid, undoPayment, type CostError } from '@/lib/admin/costs'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'
import { parseAdd, parseEdit, parseEnd, parseIds, parsePaid } from './input'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/actions.ts — Admin › Costs' actions (plan docs/plans/2026-11-23-admin-costs.md task 5).
// Master admin only (`requireStaff(ADMIN_ONLY)` first; src/lib/admin/costs.ts checks again). Who may do what:
//   add, mark paid, end                                                              master admin
//   edit amount, currency, anchor, cadence; undo a payment older than 10 minutes     master admin + a passkey check in the last 5 minutes
//   undo a fresh payment; edit a name, vendor, category, note or "varies"            master admin
// Input is parsed in ./input.ts (caps, cleaned text, exact money); ids are matched with their parent in the library.
// =============================================================================

const ERROR_WORDS: Record<CostError, string> = {
  not_found: 'We couldn’t find that cost. Reload the page.',
  already_paid: 'That bill is already marked paid.',
  not_due: 'Pick a date this cost bills on.',
  locked: 'A paid cost keeps its schedule. End it and add a new one.',
  confirm_first: STAFF_CONFIRM_FIRST,
  bad_input: 'Fix the marked fields. Nothing was changed.',
  too_many: 'You have 500 costs, the most we allow. End one to add another.',
  unknown: 'We couldn’t save that. Nothing was changed.',
}
const CHECK_FIELDS = 'Fix the marked fields.'
const today = () => istDayKey(new Date()) // a server action: the real clock is right here
const raw = (form: FormData) => Object.fromEntries([...form].filter(([, v]) => typeof v === 'string')) as Record<string, string>
const failed = (tag: string) => (e: unknown) => { console.error(`[costs.${tag}]`, errName(e)); return { ok: false as const, error: 'unknown' as const } }

export async function addCostAction(form: FormData): Promise<ActionResult & { id?: string }> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseAdd(raw(form), today())
  if (!p.ok) return { error: CHECK_FIELDS, fields: p.fields }
  const r = await addCost(staff, p.data, today()).catch(failed('add'))
  if (!r.ok) {
    if (r.error !== 'bad_input') return { error: ERROR_WORDS[r.error] }
    const where: Record<string, string> = p.data.kind === 'recurring' ? { anchorOn: 'Use a date from the last 45 days or later.' } : { inr: `Use a rate between ₹${FX_RATE_BAND_E4[0] / 1e4} and ₹${FX_RATE_BAND_E4[1] / 1e4} to the dollar.` }
    return { error: CHECK_FIELDS, fields: where }
  }
  revalidatePath('/admin/costs')
  return { ok: `${p.data.name} added.`, id: r.id }
}

export async function markPaidAction(form: FormData): Promise<ActionResult & { itemId?: string; paymentId?: string; inrPaise?: number }> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parsePaid(raw(form), today())
  if (!p.ok) return { error: CHECK_FIELDS, fields: p.fields }
  const r = await markPaid(staff, p.data.itemId, p.data.input, today()).catch(failed('pay'))
  if (!r.ok) return r.error === 'bad_input' && p.data.currency === 'USD' ? { fields: { inr: `Use a rate between ₹${FX_RATE_BAND_E4[0] / 1e4} and ₹${FX_RATE_BAND_E4[1] / 1e4} to the dollar.` } } : { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/costs')
  const inrPaise = p.data.currency === 'INR' ? p.data.input.amount : p.data.input.inrPaise
  return { ok: 'Marked paid.', itemId: p.data.itemId, paymentId: r.paymentId, ...(inrPaise ? { inrPaise } : {}) }
}

export async function undoPaymentAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseIds(raw(form))
  if (!p.ok) return { error: ERROR_WORDS.not_found }
  const r = await undoPayment(staff, p.data.itemId, p.data.paymentId, new Date()).catch(failed('unpay'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/costs')
  return { ok: 'Payment removed.' }
}

export async function endCostAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseEnd(raw(form), today())
  if (!p.ok) return { error: 'Pick the last day.', fields: p.fields }
  const r = await endCost(staff, p.data.itemId, p.data.endsOn).catch(failed('end'))
  if (!r.ok) return r.error === 'bad_input' ? { fields: { endsOn: 'Pick a day after the first bill.' } } : { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/costs')
  return { ok: 'Cost ended.' }
}

export async function editCostAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseEdit(raw(form), today())
  if (!p.ok) return { error: CHECK_FIELDS, fields: p.fields }
  const r = await editCost(staff, p.data.itemId, p.data.patch, new Date()).catch(failed('edit'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/costs')
  return { ok: 'Saved.' }
}
