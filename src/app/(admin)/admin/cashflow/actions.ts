'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/components/ui/action-form'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { istDayKey } from '@/domains/time/day'
import { addAccount, addEntry, booksFor, deleteEntry, editEntry, setBalance, undoBalance, type CashError } from '@/lib/admin/cash'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'
import { parseAccountName, parseBalanceForm, parseBooksAsk, parseEntryEdit, parseEntryForm, parseId, parseIds } from './input'

// =============================================================================
// FILE: src/app/(admin)/admin/cashflow/actions.ts — Admin › Cashflow's actions (plan docs/plans/2026-11-23-admin-cashflow.md task 5).
// Master admin only (`requireStaff(ADMIN_ONLY)` first; src/lib/admin/cash.ts checks again). Who may do what:
//   record a balance, add an entry or account, set the floor, edit a planned entry                                   master admin
//   undo a balance or edit or delete a done entry older than 10 minutes; make a planned entry done with changed figures   master admin + a passkey check in the last 5 minutes
// Input is parsed in ./input.ts (exact money, real days not after today, cleaned text); ids are matched with their parent in the library.
// =============================================================================

const ERROR_WORDS: Record<CashError, string> = {
  not_found: 'We couldn’t find that. Reload the page.',
  confirm_first: STAFF_CONFIRM_FIRST,
  bad_input: 'Fix the marked fields. Nothing was changed.',
  unknown: 'We couldn’t save that. Nothing was changed.',
}
const CHECK = 'Fix the marked fields.'
const today = () => istDayKey(new Date()) // a server action: the real clock is right here
const raw = (form: FormData) => Object.fromEntries([...form].filter(([, v]) => typeof v === 'string')) as Record<string, string>
const failed = (tag: string) => (e: unknown) => { console.error(`[cash.${tag}]`, errName(e)); return { ok: false as const, error: 'unknown' as const } }

export async function setBalanceAction(form: FormData): Promise<ActionResult & { balanceId?: string; accountId?: string }> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseBalanceForm(raw(form), today())
  if (!p.ok) return { error: CHECK, fields: p.fields }
  const r = await setBalance(staff, p.data, today()).catch(failed('balance'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/cashflow')
  return { ok: 'Balance saved.', balanceId: r.id, accountId: p.data.accountId }
}

export async function undoBalanceAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseIds(raw(form))
  if (!p.ok) return { error: ERROR_WORDS.not_found }
  const r = await undoBalance(staff, p.data.accountId, p.data.balanceId, new Date()).catch(failed('undo'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/cashflow')
  return { ok: 'Balance removed.' }
}

export async function addEntryAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseEntryForm(raw(form), today())
  if (!p.ok) return { error: CHECK, fields: p.fields }
  const r = await addEntry(staff, p.data, today()).catch(failed('entry'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/cashflow')
  return { ok: p.data.expectedOn ? 'Planned entry added.' : 'Entry added.' }
}

export async function editEntryAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseEntryEdit(raw(form), today())
  if (!p.ok) return { error: CHECK, fields: p.fields }
  const r = await editEntry(staff, p.data.id, p.data.patch, today(), new Date()).catch(failed('edit'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/cashflow')
  return { ok: 'Saved.' }
}

export async function deleteEntryAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseId(raw(form))
  if (!p.ok) return { error: ERROR_WORDS.not_found }
  const r = await deleteEntry(staff, p.data.id, new Date()).catch(failed('delete'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/cashflow')
  return { ok: 'Entry removed.' }
}

export async function addAccountAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = parseAccountName(raw(form))
  if (!p.ok) return { error: CHECK, fields: p.fields }
  const r = await addAccount(staff, p.data.name).catch(failed('account'))
  if (!r.ok) return { error: ERROR_WORDS[r.error] }
  revalidatePath('/admin/cashflow')
  return { ok: `${p.data.name} added.` }
}

/** What the books say for the main account at the typed day, and the difference: the server's own sum, read when the dialog's balance or day changes. */
export async function booksAction(form: FormData): Promise<{ books: number; difference: number } | null> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return null
  const p = parseBooksAsk(raw(form), today())
  if (!p.ok) return null
  return booksFor(staff, p.data.typed, p.data.asOf, today()).catch(() => null)
}
