'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { decidePartner, reinstatePartner, suspendPartner } from '@/lib/admin/partners'
import { ADMIN_ONLY, confirmedRecently, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'
import { staffProof } from '@/lib/auth/session'
import { approveOwnerRequest, deleteOwnerPasskeys } from '@/lib/admin/partner-passkeys'
import type { ActionResult } from '@/components/ui/action-form'

const Decide = z.object({ id: z.uuid(), decision: z.enum(['approve', 'decline']), reason: z.string().trim().max(300).optional() })

export async function decidePartnerAction(form: FormData): Promise<ActionResult> {
  // Approving lets someone make stores: Frrata admins only, as plans are (impact review 2026-11-07).
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: 'Only a master admin can decide an application.' }
  const p = Decide.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'Choose approve or decline.' }
  if (p.data.decision === 'decline' && !p.data.reason) return { fields: { reason: 'Give a reason to decline.' } }
  const r = await decidePartner(staff, p.data.id, p.data.decision === 'approve' ? { approve: true } : { approve: false, reason: p.data.reason! })
  if (!r.ok) return { error: r.error }
  // Approved: their usual sign-in email, which opens the workspace. The approval stands without it.
  const mail = p.data.decision === 'approve' ? await sendSignInLink(r.email).catch(() => ({ sent: false as const })) : null
  revalidatePath('/admin/partners')
  const said = !mail ? 'Declined.' : mail.sent ? `Approved. Sign-in link sent to ${r.email}.` : `Approved. The sign-in email did not send: ${r.email} can sign in at /login.`
  return { ok: said }
}

// Suspend or reinstate a partner (T1a; security review 2026-11-12): admins only, a passkey check in the last 5 minutes,
// and the partner's name typed. The definers end or rebuild every partner person's access, audit it and tell the shops.
const Suspend = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(120), typed: z.string().trim().max(120), reason: z.string().trim().max(300) })
const SAYS: Record<string, string> = {
  not_admin: 'Only a master admin can do this.',
  bad_reason: 'Give a reason (up to 300 characters).',
  not_active: 'This partner is not active.',
  not_suspended: 'This partner is not suspended.',
}

export async function suspendPartnerAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: SAYS.not_admin }
  if (!confirmedRecently(staff)) return { error: 'Confirm with your passkey first.' }
  const p = Suspend.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'Check the reason and the name.' }
  const fields: Record<string, string> = {}
  if (!p.data.reason) fields.reason = 'Give a reason. Their stores read it.'
  if (p.data.typed !== p.data.name) fields.typed = `Type ${p.data.name} exactly.`
  if (Object.keys(fields).length) return { fields }
  const r = await suspendPartner(staff, p.data.id, p.data.reason)
  if (!r.ok) return { error: SAYS[r.error] ?? 'We could not suspend the partner. Nothing was changed.' }
  revalidatePath('/admin/partners')
  return { ok: `Suspended. Access ended. ${r.shops} ${r.shops === 1 ? 'store was' : 'stores were'} told.` }
}

export async function reinstatePartnerAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: SAYS.not_admin }
  if (!confirmedRecently(staff)) return { error: 'Confirm with your passkey first.' }
  const p = Suspend.pick({ id: true, name: true, typed: true }).safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'Type the partner’s name.' }
  if (p.data.typed !== p.data.name) return { fields: { typed: `Type ${p.data.name} exactly.` } }
  const r = await reinstatePartner(staff, p.data.id)
  if (!r.ok) return { error: SAYS[r.error] ?? 'We could not reinstate the partner. Nothing was changed.' }
  revalidatePath('/admin/partners')
  return { ok: 'Reinstated. The owner and their leads have their stores back.' }
}

// A partner OWNER's passkey (T1b): an admin approves their request with the code the owner read out on a call the admin
// made to the phone on the partner's record (never a number the caller gives), or deletes every passkey of the owner
// for a lost device. Admins only; the browser confirms the staff passkey first (a check in the last 5 minutes).
const Owner = z.object({ id: z.uuid(), code: z.string().regex(/^\d{6}$/).optional() })

export async function approveOwnerPasskeyAction(input: { id: string; code: string }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { ok: false, error: 'Only a master admin can approve this.' }
  const p = Owner.safeParse(input)
  if (!p.success || !p.data.code) return { ok: false, error: 'Enter the 6-digit code the partner owner reads out.' }
  const proof = await staffProof(staff.userId)
  if (!proof) return { ok: false, error: 'Confirm with your passkey first.' }
  const r = await approveOwnerRequest(staff, proof, p.data.id, p.data.code)
  if (!r.ok) return r
  revalidatePath('/admin/partners')
  return { ok: true, text: `Approved. ${r.email} can create a passkey for 10 minutes.` }
}

export async function deleteOwnerPasskeysAction(input: { id: string }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { ok: false, error: 'Only a master admin can do this.' }
  const p = Owner.safeParse(input)
  if (!p.success) return { ok: false, error: 'We couldn’t save that. Nothing changed. Try again.' }
  const proof = await staffProof(staff.userId)
  if (!proof) return { ok: false, error: 'Confirm with your passkey first.' }
  const r = await deleteOwnerPasskeys(staff, proof, p.data.id)
  if (!r.ok) return r
  revalidatePath('/admin/partners')
  return { ok: true, text: `Deleted ${r.count} ${r.count === 1 ? 'passkey' : 'passkeys'}. The partner owner is signed out everywhere.` }
}
